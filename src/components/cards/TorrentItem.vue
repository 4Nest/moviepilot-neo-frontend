<script lang="ts" setup>
import type { PropType } from 'vue'
import { formatFileSize, formatDateDifference } from '@/@core/utils/formatters'
import api from '@/api'
import type { Context } from '@/api/types'
import { getCachedSiteIcon } from '@/utils/siteIconCache'
import { downloadedTorrentMap, markTorrentDownloaded } from '@/utils/torrentDownloadCache'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { getTorrentPromotionKind, type TorrentPromotionKind } from '@/utils/torrent'

const AddDownloadDialog = defineAsyncComponent(() => import('../dialog/AddDownloadDialog.vue'))

// 输入参数
const props = defineProps({
  torrent: Object as PropType<Context>,
  batchMode: Boolean,
  selected: Boolean,
})

const emit = defineEmits(['select'])

// 种子信息
const torrent = ref(props.torrent?.torrent_info)
const promotionKind = computed(() => getTorrentPromotionKind(torrent.value))

// 媒体信息
const media = ref(props.torrent?.media_info)

// 识别元数据
const meta = ref(props.torrent?.meta_info)

// 站点图标
const siteIcon = ref('')

const isDownloaded = computed(() => Boolean(torrent.value?.enclosure && downloadedTorrentMap[torrent.value.enclosure]))

// 查询站点图标
async function getSiteIcon(site: number | undefined) {
  if (!site) {
    siteIcon.value = ''
    return
  }

  try {
    const icon = await getCachedSiteIcon(site, async () => {
      try {
        const response = await api.get(`site/icon/${site}`, { cancelOnNavigation: false })

        return response?.data?.icon || ''
      } catch (error) {
        console.error('Failed to load site icon:', error)
        return ''
      }
    })
    // 只提交当前站点的响应，避免 Context 快速切换时旧请求覆盖新图标。
    if (torrent.value?.site === site) {
      siteIcon.value = icon
    }
  } catch (error) {
    console.error('Failed to load site icon:', error)
    if (torrent.value?.site === site) {
      siteIcon.value = ''
    }
  }
}

/** 为已确认的促销选择样式，未知倍率不落入免费颜色。 */
function getPromotionClass(kind?: TorrentPromotionKind) {
  return kind ? { free: 'bg-success', discount: 'bg-orange', bonus: 'bg-purple', other: '' }[kind] : ''
}

// 询问并添加下载
async function handleAddDownload() {
  // 打开下载对话框
  openSharedDialog(
    AddDownloadDialog,
    {
      title: `${media.value?.title_year || meta.value?.name} ${meta.value?.season_episode || ''}`,
      media: media.value,
      torrent: torrent.value,
    },
    {
      done: addDownloadSuccess,
      error: addDownloadError,
    },
    { closeOn: ['close', 'done', 'error'] },
  )
}

function handleItemClick() {
  if (props.batchMode) emit('select')
  else void handleAddDownload()
}

// 添加下载成功
function addDownloadSuccess(url: string) {
  markTorrentDownloaded(url)
}

// 添加下载失败
function addDownloadError(error: string) {
  console.error(error)
}

// 打开种子详情页面
function openTorrentDetail() {
  if (torrent.value?.page_url) {
    window.open(torrent.value.page_url, '_blank')
  }
}

watch(
  () => props.torrent,
  value => {
    torrent.value = value?.torrent_info
    media.value = value?.media_info
    meta.value = value?.meta_info
    getSiteIcon(value?.torrent_info?.site)
  },
  { immediate: true },
)
</script>

<template>
  <!-- Hover 命中区域保持静止，避免列表项上浮后底边反复触发 mouseleave。 -->
  <div class="torrent-item-hover-area w-100">
    <VListItem
      :value="props.torrent?.torrent_info?.enclosure"
      class="app-hover-lift-card torrent-item overflow-hidden"
      :class="{
        'torrent-item--downloaded': isDownloaded && !props.selected,
        'border-primary border-2 torrent-item--selected': props.batchMode && props.selected,
      }"
      @click="handleItemClick"
    >
      <template v-slot:prepend>
        <div class="torrent-item__prepend d-flex align-center">
          <VIcon
            v-if="props.batchMode"
            class="mr-2.5 flex-shrink-0"
            :icon="props.selected ? 'mdi-checkbox-marked-circle' : 'mdi-checkbox-blank-circle-outline'"
            :color="props.selected ? 'primary' : 'medium-emphasis'"
            size="21"
          />
          <div class="torrent-item__site-badge" :title="torrent?.site_name">
            <VImg
              v-if="siteIcon"
              :src="siteIcon"
              :alt="torrent?.site_name"
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
              {{ torrent?.site_name?.substring(0, 1) }}
            </VAvatar>
            <span v-if="torrent?.site_name" class="torrent-item__site-name">
              {{ torrent.site_name }}
            </span>
          </div>
        </div>
      </template>

      <VListItemTitle class="whitespace-normal">
        <div class="torrent-item__header d-flex align-center flex-wrap gap-1.5">
          <span class="torrent-item__media-title">
            {{ media?.title ?? meta?.name }}
          </span>
          <VChip
            v-if="meta?.season_episode"
            color="primary"
            variant="tonal"
            size="x-small"
            class="torrent-item__season torrent-chip font-weight-semibold"
          >
            {{ meta?.season_episode }}
          </VChip>
          <VChip
            v-if="isDownloaded"
            color="success"
            variant="tonal"
            size="x-small"
            class="torrent-chip font-weight-medium"
          >
            已下载
          </VChip>
          <!-- 优惠标签整合进标题行 -->
          <span
            v-if="promotionKind"
            class="discount-banner font-weight-semibold"
            :class="getPromotionClass(promotionKind)"
          >
            {{ torrent?.volume_factor }}
          </span>
          <span v-if="torrent?.pubdate" class="torrent-item__time d-inline-flex align-center">
            <VIcon size="12" icon="mdi-clock-outline" class="me-1" />
            {{ formatDateDifference(torrent.pubdate) }}
          </span>
        </div>

        <div class="torrent-item__torrent-title">
          {{ torrent?.title }}
        </div>

        <div v-if="meta?.subtitle || torrent?.description" class="torrent-item__description">
          {{ meta?.subtitle || torrent?.description }}
        </div>

        <div class="torrent-item__tags d-flex flex-wrap">
          <VChip v-if="meta?.web_source" color="primary" size="x-small" variant="tonal" class="torrent-chip">
            {{ meta?.web_source }}
          </VChip>
          <VChip v-if="meta?.edition" color="primary" size="x-small" variant="tonal" class="torrent-chip">
            {{ meta?.edition }}
          </VChip>
          <VChip v-if="meta?.resource_pix" color="primary" size="x-small" variant="tonal" class="torrent-chip">
            {{ meta?.resource_pix }}
          </VChip>
          <VChip v-if="meta?.video_encode" color="primary" size="x-small" variant="tonal" class="torrent-chip">
            {{ meta?.video_encode }}
          </VChip>
          <VChip v-if="meta?.resource_team" color="primary" size="x-small" variant="tonal" class="torrent-chip">
            {{ meta?.resource_team }}
          </VChip>
          <VChip
            v-for="(label, index) in torrent?.labels"
            :key="index"
            color="secondary"
            size="x-small"
            variant="tonal"
            class="torrent-chip"
          >
            {{ label }}
          </VChip>
          <VChip v-if="torrent?.hit_and_run" color="error" size="x-small" variant="tonal" class="torrent-chip">
            H&R
          </VChip>
          <VChip v-if="torrent?.freedate_diff" color="secondary" size="x-small" variant="tonal" class="torrent-chip">
            {{ torrent?.freedate_diff }}
          </VChip>
        </div>
      </VListItemTitle>

      <template v-slot:append>
        <div class="torrent-item__append d-flex align-center gap-2">
          <div class="torrent-item__stats d-flex flex-column align-end gap-1">
            <div class="d-flex align-center gap-1">
              <span class="torrent-stat torrent-stat--seeders">
                <VIcon icon="mdi-arrow-up-bold" size="12" />
                {{ torrent?.seeders ?? '-' }}
              </span>
              <span class="torrent-stat torrent-stat--peers">
                <VIcon icon="mdi-arrow-down-bold" size="12" />
                {{ torrent?.peers ?? '-' }}
              </span>
            </div>
            <span v-if="torrent?.size" class="torrent-stat torrent-stat--size">
              <VIcon icon="mdi-harddisk" size="12" />
              {{ formatFileSize(torrent.size) }}
            </span>
          </div>
          <VBtn
            icon
            size="x-small"
            density="comfortable"
            variant="text"
            color="primary"
            class="torrent-item__detail-btn"
            @click.stop="openTorrentDetail"
          >
            <VIcon icon="mdi-information-outline" size="17"></VIcon>
          </VBtn>
        </div>
      </template>
    </VListItem>
  </div>
</template>

<style scoped>
.torrent-item-hover-area {
  inline-size: 100%;
}

.torrent-item {
  padding: 12px 15px !important;
  border: 1px solid var(--mp-border-card);
  border-radius: 12px !important;
  background: rgb(var(--v-theme-surface));
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.torrent-item--selected {
  background: rgba(var(--v-theme-primary), 0.06);
}

.torrent-item-hover-area:hover .torrent-item {
  border-color: var(--mp-border-hover);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.05);
  transform: translate3d(0, -2px, 0);
}

.torrent-item__prepend {
  margin-inline-end: 13px;
}

.torrent-item__site-badge {
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

.torrent-item__site-name {
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

.torrent-item__header {
  margin-block-end: 3px;
}

.torrent-item__media-title {
  color: rgb(var(--v-theme-on-surface));
  font-size: 14.5px;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 1.35;
}

.torrent-item__season {
  display: inline-flex;
}

.torrent-chip {
  border-radius: 5px !important;
  block-size: 20px !important;
  font-size: 11px !important;
  font-variant-numeric: tabular-nums;
  padding-inline: 6px !important;
}

.discount-banner {
  display: inline-flex;
  align-items: center;
  block-size: 20px;
  padding-inline: 6px;
  border-radius: 5px;
  background-color: rgba(var(--v-theme-primary), 0.12) !important;
  color: rgb(var(--v-theme-primary)) !important;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  white-space: nowrap;
}

.torrent-item__time {
  color: rgba(var(--v-theme-on-surface), 0.54);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  font-weight: 400;
  line-height: 1.25;
  white-space: nowrap;
}

.torrent-item__torrent-title {
  color: rgba(var(--v-theme-on-surface), 0.82);
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.45;
  margin-block-end: 2px;
  overflow-wrap: anywhere;
  word-break: normal;
}

.torrent-item__description {
  color: rgba(var(--v-theme-on-surface), 0.56);
  font-size: 12px;
  line-height: 1.4;
  margin-block-end: 6px;
  overflow-wrap: anywhere;
  word-break: normal;
}

.torrent-item__tags {
  gap: 4px;
  margin-block-start: 2px;
}

.torrent-item__append {
  padding-inline-start: 13px;
  border-inline-start: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.08));
  margin-inline-start: 12px;
}

.torrent-item__detail-btn {
  border-radius: 6px !important;
  block-size: 26px !important;
  inline-size: 26px !important;
  min-inline-size: 26px !important;
  padding: 0 !important;
}

.torrent-stat {
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

.torrent-stat--seeders {
  background: rgba(var(--v-theme-success), 0.12);
  color: rgb(var(--v-theme-success));
}

.torrent-stat--peers {
  background: rgba(var(--v-theme-warning), 0.12);
  color: rgb(var(--v-theme-warning));
}

/* 优惠标签样式（柔和 tonal 胶囊） */
.discount-banner.bg-success {
  background-color: rgba(var(--v-theme-success), 0.14) !important;
  color: rgb(var(--v-theme-success)) !important;
}

.discount-banner.bg-orange {
  background-color: rgba(var(--v-theme-warning), 0.16) !important;
  color: rgb(var(--v-theme-warning)) !important;
}

.discount-banner.bg-purple {
  background-color: rgba(var(--v-theme-info), 0.14) !important;
  color: rgb(var(--v-theme-info)) !important;
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

@media (width <= 600px) {
  .torrent-item {
    padding: 10px 12px !important;
  }

  .torrent-item__prepend {
    margin-inline-end: 9px;
  }

  .torrent-item__site-badge {
    inline-size: 42px;
  }

  .torrent-item__append {
    padding-inline-start: 8px;
    margin-inline-start: 6px;
  }
}
</style>
