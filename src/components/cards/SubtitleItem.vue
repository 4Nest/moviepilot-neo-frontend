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

// 添加字幕下载成功
function addDownloadSuccess(url: string) {
  markSubtitleDownloaded(url)
}

// 添加字幕下载失败
function addDownloadError(error: string) {
  console.error(error)
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
  <!-- Hover 命中区域保持静止，避免列表项上浮后底边反复触发 mouseleave。 -->
  <div class="subtitle-item-hover-area w-100">
    <VListItem
      :value="subtitle?.enclosure"
      class="app-hover-lift-card mb-2 subtitle-item overflow-hidden"
      @click="handleAddDownload"
    >
      <template #prepend>
        <div class="subtitle-item__prepend d-flex align-center">
          <div class="subtitle-item__site-badge" :title="subtitle?.site_name">
            <VImg
              v-if="siteIcon"
              :src="siteIcon"
              :alt="subtitle?.site_name"
              class="site-icon site-icon--img"
              width="28"
              height="28"
              max-width="28"
              max-height="28"
              contain
              @error="siteIcon = ''"
            />
            <VAvatar
              v-else
              size="28"
              class="text-caption bg-surface-variant text-medium-emphasis font-weight-semibold site-icon"
            >
              {{ subtitle?.site_name?.substring(0, 1) }}
            </VAvatar>
            <span v-if="subtitle?.site_name" class="subtitle-item__site-name">
              {{ subtitle.site_name }}
            </span>
          </div>
        </div>
      </template>

      <VListItemTitle class="whitespace-normal">
        <div class="subtitle-item__header d-flex align-center flex-wrap gap-1.5">
          <span class="subtitle-item__title" :title="subtitle?.title">
            {{ subtitle?.title }}
          </span>
          <VChip
            v-if="subtitle?.season_episode"
            size="x-small"
            color="primary"
            variant="tonal"
            class="subtitle-chip font-weight-semibold"
          >
            {{ subtitle.season_episode }}
          </VChip>
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
          <VChip
            v-if="isDownloaded"
            size="x-small"
            color="success"
            variant="tonal"
            class="subtitle-chip font-weight-medium"
          >
            {{ t('dialog.addSubtitleDownload.downloaded') }}
          </VChip>
          <span
            v-if="subtitle?.pubdate || subtitle?.date_elapsed"
            class="subtitle-item__time d-inline-flex align-center"
          >
            <VIcon size="12" icon="mdi-clock-outline" class="me-1" />
            {{ subtitle?.date_elapsed || formatDateDifference(subtitle.pubdate || '') }}
          </span>
        </div>

        <div v-if="subtitle?.description" class="subtitle-item__description" :title="subtitle.description">
          {{ subtitle.description }}
        </div>

        <div
          v-if="subtitle?.uploader || subtitle?.torrent_id || subtitle?.subtitle_id"
          class="subtitle-item__tags d-flex flex-wrap"
        >
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
      </VListItemTitle>

      <template #append>
        <div class="subtitle-item__append d-flex align-center gap-2">
          <div
            v-if="subtitle?.grabs !== undefined || subtitle?.size"
            class="subtitle-item__stats d-flex flex-column align-end gap-1"
          >
            <span v-if="subtitle?.grabs !== undefined" class="subtitle-stat subtitle-stat--grabs">
              <VIcon icon="mdi-download-outline" size="12" />
              {{ subtitle.grabs }}
            </span>
            <span v-if="subtitle?.size" class="subtitle-stat">
              <VIcon icon="mdi-harddisk" size="12" />
              {{ formatFileSize(subtitle.size) }}
            </span>
          </div>
          <div class="d-flex align-center gap-0.5">
            <VBtn
              v-if="subtitle?.report_url"
              icon
              size="x-small"
              density="comfortable"
              variant="text"
              color="warning"
              class="subtitle-item__action-btn"
              @click.stop="openReportPage"
            >
              <VIcon icon="mdi-alert-outline" size="17" />
            </VBtn>
            <VBtn
              v-if="subtitle?.page_url"
              icon
              size="x-small"
              density="comfortable"
              variant="text"
              color="primary"
              class="subtitle-item__action-btn"
              @click.stop="openSubtitleDetail"
            >
              <VIcon icon="mdi-information-outline" size="17" />
            </VBtn>
          </div>
        </div>
      </template>
    </VListItem>
  </div>
</template>

<style scoped>
.subtitle-item-hover-area {
  inline-size: 100%;
}

.subtitle-item {
  padding: 12px 15px !important;
  border: 1px solid var(--mp-border-card);
  border-radius: 12px !important;
  background: rgb(var(--v-theme-surface));
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.subtitle-item-hover-area:hover .subtitle-item {
  border-color: var(--mp-border-hover);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.05);
  transform: translate3d(0, -2px, 0);
}

.subtitle-item__prepend {
  margin-inline-end: 13px;
}

.subtitle-item__site-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 5px 4px;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 9px;
  background: rgba(var(--v-theme-on-surface), 0.025);
  gap: 3px;
  inline-size: 46px;
}

.subtitle-item__site-name {
  display: block;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1.15;
  max-inline-size: 40px;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-icon {
  flex: 0 0 28px !important;
  border-radius: 7px !important;
  block-size: 28px;
  inline-size: 28px;
  max-block-size: 28px;
  max-inline-size: 28px;
  transition: transform 0.2s ease;
}

.site-icon:hover {
  transform: scale(1.05);
}

.site-icon--img {
  border: 1px solid var(--mp-border-subtle);
  background: rgba(255, 255, 255, 0.14);
  padding: 2px;
}

.site-icon--img :deep(.v-img__img) {
  object-fit: contain !important;
}

.subtitle-item__header {
  margin-block-end: 3px;
}

.subtitle-item__title {
  color: rgb(var(--v-theme-on-surface));
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 1.4;
  word-break: break-all;
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

.subtitle-item__time {
  color: rgba(var(--v-theme-on-surface), 0.54);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  font-weight: 400;
  line-height: 1.25;
  white-space: nowrap;
}

.subtitle-item__description {
  color: rgba(var(--v-theme-on-surface), 0.56);
  font-size: 12px;
  line-height: 1.4;
  margin-block-start: 2px;
  word-break: break-all;
}

.subtitle-item__tags {
  gap: 4px;
  margin-block-start: 5px;
}

.subtitle-item__append {
  padding-inline-start: 13px;
  border-inline-start: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.08));
  margin-inline-start: 12px;
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

.subtitle-item__action-btn {
  border-radius: 6px !important;
  block-size: 26px !important;
  inline-size: 26px !important;
  min-inline-size: 26px !important;
  padding: 0 !important;
}

@media (width <= 600px) {
  .subtitle-item {
    padding: 10px 12px !important;
  }

  .subtitle-item__prepend {
    margin-inline-end: 9px;
  }

  .subtitle-item__site-badge {
    inline-size: 42px;
  }

  .subtitle-item__append {
    padding-inline-start: 8px;
    margin-inline-start: 6px;
  }
}
</style>
