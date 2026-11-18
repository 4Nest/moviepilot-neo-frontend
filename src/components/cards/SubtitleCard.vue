<script lang="ts" setup>
import type { PropType } from 'vue'
import { formatDateDifference, formatFileSize } from '@/@core/utils/formatters'
import api from '@/api'
import type { SubtitleInfo } from '@/api/types'
import { getCachedSiteIcon } from '@/utils/siteIconCache'
import { downloadedSubtitleMap, markSubtitleDownloaded } from '@/utils/subtitleDownloadCache'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useI18n } from '@/composables/useChineseText'

const AddSubtitleDownloadDialog = defineAsyncComponent(() => import('../dialog/AddSubtitleDownloadDialog.vue'))

// 多语言支持
const { t } = useI18n()

// 输入参数
const props = defineProps({
  subtitle: Object as PropType<SubtitleInfo>,
  width: String,
})

// 字幕信息
const subtitle = ref(props.subtitle)

// 站点图标
const siteIcon = ref('')

const isDownloaded = computed(() =>
  Boolean(subtitle.value?.enclosure && downloadedSubtitleMap[subtitle.value.enclosure]),
)

// 查询站点图标
async function getSiteIcon() {
  if (!subtitle.value?.site) {
    siteIcon.value = ''
    return
  }

  try {
    siteIcon.value = await getCachedSiteIcon(subtitle.value.site, async () => {
      try {
        const response = await api.get(`site/icon/${subtitle.value?.site}`, { cancelOnNavigation: false })

        return response?.data?.icon || ''
      } catch (error) {
        console.error('Failed to load site icon:', error)
        return ''
      }
    })
  } catch (error) {
    console.error('Failed to load site icon:', error)
    siteIcon.value = ''
  }
}

// 添加字幕下载成功
function addDownloadSuccess(url: string) {
  markSubtitleDownloaded(url)
}

// 添加字幕下载失败
function addDownloadError(error: string) {
  console.error(error)
}

// 询问并下载字幕
async function handleAddDownload() {
  openSharedDialog(
    AddSubtitleDownloadDialog,
    {
      title: subtitle.value?.title,
      subtitle: subtitle.value,
    },
    {
      done: addDownloadSuccess,
      error: addDownloadError,
    },
    { closeOn: ['close', 'done', 'error'] },
  )
}

// 打开字幕详情页面
function openSubtitleDetail() {
  if (!subtitle.value?.page_url) return
  window.open(subtitle.value.page_url, '_blank')
}

// 打开字幕举报页面
function openReportPage() {
  if (!subtitle.value?.report_url) return
  window.open(subtitle.value.report_url, '_blank')
}

watch(
  () => props.subtitle,
  value => {
    subtitle.value = value
    getSiteIcon()
  },
  { immediate: true },
)
</script>

<template>
  <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
  <div class="subtitle-card-hover-area h-full">
    <VCard
      :width="props.width || '100%'"
      variant="flat"
      @click="handleAddDownload"
      class="app-hover-lift-card h-full cursor-pointer d-flex flex-column overflow-hidden subtitle-card"
      hover
    >
      <VCardItem class="subtitle-card__head">
        <div class="subtitle-card__title" :title="subtitle?.title">
          {{ subtitle?.title }}
          <VChip
            v-if="subtitle?.season_episode"
            size="x-small"
            color="primary"
            variant="tonal"
            class="subtitle-card__inline-chip subtitle-chip font-weight-semibold"
          >
            {{ subtitle.season_episode }}
          </VChip>
          <VChip
            v-if="isDownloaded"
            size="x-small"
            color="success"
            variant="tonal"
            class="subtitle-card__inline-chip subtitle-chip font-weight-medium"
          >
            {{ t('dialog.addSubtitleDownload.downloaded') }}
          </VChip>
        </div>
      </VCardItem>

      <VCardText class="subtitle-card__body d-flex flex-column flex-grow-1 overflow-hidden">
        <div v-if="subtitle?.description" class="subtitle-card__description mb-2" :title="subtitle?.description">
          {{ subtitle.description }}
        </div>

        <div class="subtitle-card__tags d-flex flex-wrap align-center mt-auto">
          <VChip v-if="subtitle?.language" size="x-small" color="info" variant="tonal" class="subtitle-chip">
            <VImg
              v-if="subtitle?.language_icon"
              :src="subtitle.language_icon"
              :alt="subtitle.language"
              width="14"
              height="14"
              max-width="14"
              max-height="14"
              contain
              class="subtitle-lang-icon me-1"
            />
            {{ subtitle.language }}
          </VChip>
          <VChip v-if="subtitle?.uploader" size="x-small" color="secondary" variant="tonal" class="subtitle-chip">
            <VIcon size="11" icon="mdi-account-outline" class="me-0.5" />
            {{ subtitle.uploader }}
          </VChip>
          <VChip v-if="subtitle?.torrent_id" size="x-small" variant="tonal" class="subtitle-chip">
            TID {{ subtitle.torrent_id }}
          </VChip>
          <VChip v-if="subtitle?.subtitle_id" size="x-small" variant="tonal" class="subtitle-chip">
            SID {{ subtitle.subtitle_id }}
          </VChip>
        </div>
      </VCardText>

      <VCardActions class="subtitle-card__footer border-t mt-auto">
        <div class="subtitle-card__site">
          <VImg
            v-if="siteIcon"
            :src="siteIcon"
            :alt="subtitle?.site_name"
            class="subtitle-card__site-avatar subtitle-card__site-avatar--img"
            width="20"
            height="20"
            max-width="20"
            max-height="20"
            contain
            @error="siteIcon = ''"
          />
          <VAvatar
            v-else
            size="20"
            class="subtitle-card__site-avatar text-caption bg-surface-variant flex-shrink-0"
            color="surface-variant"
          >
            {{ subtitle?.site_name?.substring(0, 1) }}
          </VAvatar>
          <div class="subtitle-card__site-text">
            <span class="subtitle-card__site-name">{{ subtitle?.site_name }}</span>
            <span v-if="subtitle?.pubdate || subtitle?.date_elapsed" class="subtitle-card__time">
              {{ subtitle?.date_elapsed || formatDateDifference(subtitle.pubdate || '') }}
            </span>
          </div>
        </div>

        <VSpacer />

        <div class="subtitle-card__stats d-flex align-center gap-1 flex-shrink-0">
          <span v-if="subtitle?.grabs !== undefined" class="subtitle-stat subtitle-stat--grabs">
            <VIcon icon="mdi-download-outline" size="12" />
            {{ subtitle.grabs }}
          </span>
          <span v-if="subtitle?.size" class="subtitle-stat">
            <VIcon icon="mdi-harddisk" size="12" />
            {{ formatFileSize(subtitle.size) }}
          </span>
          <VBtn
            v-if="subtitle?.report_url"
            icon
            size="x-small"
            density="comfortable"
            variant="text"
            color="warning"
            class="subtitle-card__action-btn"
            @click.stop="openReportPage"
          >
            <VIcon icon="mdi-alert-outline" size="16" />
          </VBtn>
          <VBtn
            v-if="subtitle?.page_url"
            icon
            size="x-small"
            density="comfortable"
            variant="text"
            color="primary"
            class="subtitle-card__action-btn"
            @click.stop="openSubtitleDetail"
          >
            <VIcon icon="mdi-information-outline" size="16" />
          </VBtn>
        </div>
      </VCardActions>
    </VCard>
  </div>
</template>

<style scoped>
.subtitle-card-hover-area {
  inline-size: 100%;
}

.subtitle-card {
  border: 1px solid var(--mp-border-card);
  border-radius: 12px !important;
  background-color: rgb(var(--v-theme-surface));
  transition:
    border-color 0.18s ease,
    transform 0.18s ease;
}

.subtitle-card-hover-area:hover .subtitle-card {
  border-color: var(--mp-border-hover);
  transform: translate3d(0, -0.25rem, 0);
}

.subtitle-card__head {
  padding: 13px 15px 0 !important;
}

.subtitle-card__body {
  padding: 7px 15px 11px !important;
}

.subtitle-card__title {
  color: rgb(var(--v-theme-on-surface));
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 1.4;
  word-break: break-all;
}

.subtitle-card__inline-chip {
  display: inline-flex;
  margin-inline-start: 6px;
  vertical-align: 0.1em;
}

.subtitle-card__description {
  color: rgba(var(--v-theme-on-surface), 0.56);
  font-size: 12px;
  line-height: 1.4;
  word-break: break-all;
}

.subtitle-card__tags {
  gap: 4px;
}

.subtitle-chip {
  border-radius: 5px !important;
  block-size: 20px !important;
  font-size: 11px !important;
  font-variant-numeric: tabular-nums;
  padding-inline: 6px !important;
}

.subtitle-lang-icon {
  flex: 0 0 14px !important;
  block-size: 14px;
  inline-size: 14px;
  max-block-size: 14px;
  max-inline-size: 14px;
}

.subtitle-lang-icon :deep(.v-img__img) {
  object-fit: contain !important;
}

.subtitle-card__footer {
  flex-wrap: nowrap;
  border-color: var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.08)) !important;
  gap: 6px;
  min-block-size: 38px !important;
  padding: 8px 14px !important;
}

.subtitle-card__site {
  display: flex;
  flex: 0 1 auto;
  align-items: center;
  gap: 7px;
  min-inline-size: 0;
}

.subtitle-card__site-avatar {
  flex: 0 0 20px !important;
  border-radius: 5px !important;
  block-size: 20px;
  inline-size: 20px;
  max-block-size: 20px;
  max-inline-size: 20px;
}

.subtitle-card__site-avatar--img {
  border: 1px solid var(--mp-border-subtle);
  background: rgba(255, 255, 255, 0.14);
  padding: 2px;
}

.subtitle-card__site-avatar--img :deep(.v-img__img) {
  object-fit: contain !important;
}

.subtitle-card__site-text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  min-inline-size: 0;
}

.subtitle-card__site-name {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.85);
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subtitle-card__time {
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 400;
  line-height: 1.25;
  white-space: nowrap;
}

.subtitle-card__stats {
  flex-wrap: nowrap;
  white-space: nowrap;
}

.subtitle-stat {
  display: inline-flex;
  align-items: center;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  block-size: 21px;
  color: rgba(var(--v-theme-on-surface), 0.78);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  gap: 3px;
  line-height: 1;
  padding-inline: 6px;
  white-space: nowrap;
}

.subtitle-stat--grabs {
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
}

.subtitle-card__action-btn {
  border-radius: 6px !important;
  block-size: 26px !important;
  inline-size: 26px !important;
  min-inline-size: 26px !important;
  padding: 0 !important;
}
</style>
