<script lang="ts" setup>
import type { PropType } from 'vue'
import { formatFileSize, formatDateDifference } from '@/@core/utils/formatters'
import api from '@/api'
import type { Context } from '@/api/types'
import { isNullOrEmptyObject } from '@/@core/utils'
import { getCachedSiteIcon } from '@/utils/siteIconCache'
import { downloadedTorrentMap, markTorrentDownloaded } from '@/utils/torrentDownloadCache'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { getTorrentPromotionKind, type TorrentPromotionKind } from '@/utils/torrent'

const AddDownloadDialog = defineAsyncComponent(() => import('../dialog/AddDownloadDialog.vue'))
const TorrentMoreSourcesDialog = defineAsyncComponent(() => import('../dialog/TorrentMoreSourcesDialog.vue'))

// 输入参数
const props = defineProps({
  torrent: Object as PropType<Context>,
  more: Array as PropType<Context[]>,
  width: String,
  height: String,
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

// 当前下载项
const downloadItem = ref(props.torrent)

// 站点图标
const siteIcons = ref<Record<number, string>>({})

const isDownloaded = computed(() => Boolean(torrent.value?.enclosure && downloadedTorrentMap[torrent.value.enclosure]))

// 添加下载成功
function addDownloadSuccess(url: string) {
  markTorrentDownloaded(url)
}

// 添加下载失败
function addDownloadError(error: string) {
  console.error(error)
}

// 查询站点图标
async function getSiteIcon(site: number | undefined) {
  if (!site) return

  try {
    siteIcons.value[site] = await getCachedSiteIcon(site, async () => {
      try {
        const response = await api.get(`site/icon/${site}`, { cancelOnNavigation: false })

        return response?.data?.icon || ''
      } catch (error) {
        console.error(error)
        return ''
      }
    })
  } catch (error) {
    console.error(error)
    siteIcons.value[site] = ''
  }
}

function handleSiteIconError(site: number | undefined) {
  if (site) siteIcons.value[site] = ''
}

// 询问并添加下载
async function handleAddDownload(item: Context | null = null) {
  if (item && !isNullOrEmptyObject(item)) {
    downloadItem.value = item
  }
  // 打开下载对话框
  openSharedDialog(
    AddDownloadDialog,
    {
      title: [
        downloadItem.value?.media_info?.title_year || downloadItem.value?.meta_info?.name,
        downloadItem.value?.meta_info?.season_episode,
      ]
        .filter(Boolean)
        .join(' '),
      media: downloadItem.value?.media_info,
      torrent: downloadItem.value?.torrent_info,
    },
    {
      done: addDownloadSuccess,
      error: addDownloadError,
    },
    { closeOn: ['close', 'done', 'error'] },
  )
}

function handleCardClick() {
  if (props.batchMode) emit('select')
  else void handleAddDownload(props.torrent)
}

// 打开种子详情页面
function openTorrentDetail(item: Context | null = null) {
  const pageUrl = item && !isNullOrEmptyObject(item) ? item.torrent_info?.page_url : torrent.value?.page_url
  if (pageUrl) {
    window.open(pageUrl, '_blank')
  }
}

/** 为已确认的促销选择样式，未知倍率不落入免费颜色。 */
function getPromotionClass(kind?: TorrentPromotionKind) {
  return kind ? { free: 'bg-success', discount: 'bg-orange', bonus: 'bg-purple', other: '' }[kind] : ''
}

// 打开更多来源对话框
async function openMoreTorrentsDialog() {
  props.more?.forEach(t => {
    return getSiteIcon(t.torrent_info?.site)
  })
  openSharedDialog(
    TorrentMoreSourcesDialog,
    {
      items: props.more || [],
      siteIcons: siteIcons.value,
    },
    {
      download: handleAddDownload,
      detail: openTorrentDetail,
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

watch(
  () => props.torrent,
  value => {
    torrent.value = value?.torrent_info
    media.value = value?.media_info
    meta.value = value?.meta_info
    downloadItem.value = value
    getSiteIcon(value?.torrent_info?.site)
  },
  { immediate: true },
)
</script>

<template>
  <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
  <div class="torrent-card-hover-area h-full">
    <VCard
      :width="props.width || '100%'"
      variant="flat"
      @click="handleCardClick"
      class="app-hover-lift-card h-full cursor-pointer d-flex flex-column overflow-hidden torrent-card"
      :class="{
        'torrent-card--downloaded': isDownloaded && !props.selected,
        'torrent-card--batch': props.batchMode,
        'border-primary border-2 torrent-card--selected': props.batchMode && props.selected,
      }"
      hover
    >
      <!-- 优惠标签 -->
      <div v-if="promotionKind" class="discount-banner font-weight-semibold" :class="getPromotionClass(promotionKind)">
        {{ torrent?.volume_factor }}
      </div>

      <VIcon
        v-if="props.batchMode"
        class="torrent-card__selection-icon"
        :icon="props.selected ? 'mdi-checkbox-marked-circle' : 'mdi-checkbox-blank-circle-outline'"
        :color="props.selected ? 'primary' : 'medium-emphasis'"
        size="22"
      />

      <!-- 媒体标题 -->
      <VCardItem class="torrent-card__head">
        <div class="torrent-card__media-title pr-12">
          {{ media?.title ?? meta?.name }}
          <VChip
            v-if="meta?.season_episode"
            color="primary"
            variant="tonal"
            size="x-small"
            class="torrent-card__season torrent-chip font-weight-semibold"
          >
            {{ meta?.season_episode }}
          </VChip>
          <VChip
            v-if="isDownloaded"
            color="success"
            variant="tonal"
            size="x-small"
            class="torrent-card__season torrent-chip font-weight-medium"
          >
            已下载
          </VChip>
        </div>
      </VCardItem>

      <!-- 种子内容 -->
      <VCardText class="torrent-card__body d-flex flex-column flex-grow-1 overflow-hidden">
        <div class="torrent-card__torrent-title mb-1">
          {{ torrent?.title }}
        </div>

        <!-- 种子描述 -->
        <div v-if="meta?.subtitle || torrent?.description" class="torrent-card__description mb-2">
          {{ meta?.subtitle || torrent?.description }}
        </div>
        <!-- 资源标签区吸附内容底部，统一协调的 tonal 小胶囊 -->
        <div class="torrent-card__tags d-flex flex-wrap mt-auto">
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
      </VCardText>

      <!-- 卡片底部信息：站点在左下，统计与操作在右 -->
      <VCardActions
        class="torrent-card__footer border-t mt-auto"
        :class="{ 'torrent-card__footer--with-more': props.more && props.more.length > 0 }"
      >
        <div class="torrent-card__site">
          <VImg
            v-if="siteIcons[torrent?.site || 0]"
            :src="siteIcons[torrent?.site || 0]"
            :alt="torrent?.site_name"
            class="torrent-card__site-avatar torrent-card__site-avatar--img"
            width="20"
            height="20"
            max-width="20"
            max-height="20"
            contain
            @error="handleSiteIconError(torrent?.site)"
          />
          <VAvatar
            v-else
            size="20"
            class="torrent-card__site-avatar text-caption bg-surface-variant flex-shrink-0"
            color="surface-variant"
          >
            {{ torrent?.site_name?.substring(0, 1) }}
          </VAvatar>
          <div class="torrent-card__site-text">
            <span class="torrent-card__site-name">{{ torrent?.site_name }}</span>
            <span v-if="torrent?.pubdate" class="torrent-card__time">
              {{ formatDateDifference(torrent.pubdate) }}
            </span>
          </div>
        </div>

        <VSpacer />

        <VBtn
          v-if="props.more && props.more.length > 0"
          variant="text"
          color="primary"
          size="small"
          class="torrent-card__more-btn d-flex align-center flex-shrink-0"
          @click.stop="openMoreTorrentsDialog"
        >
          <VIcon icon="mdi-chevron-down" size="15" class="mr-0.5"></VIcon>
          更多来源 ({{ props.more.length }})
        </VBtn>

        <div class="torrent-card__stats d-flex align-center gap-1 flex-shrink-0">
          <span class="torrent-stat torrent-stat--seeders">
            <VIcon icon="mdi-arrow-up-bold" size="12" />
            {{ torrent?.seeders ?? '-' }}
          </span>
          <span class="torrent-stat torrent-stat--peers">
            <VIcon icon="mdi-arrow-down-bold" size="12" />
            {{ torrent?.peers ?? '-' }}
          </span>
          <span v-if="torrent?.size" class="torrent-stat torrent-stat--size">
            <VIcon icon="mdi-harddisk" size="12" />
            {{ formatFileSize(torrent.size) }}
          </span>
          <VBtn
            icon
            size="x-small"
            density="comfortable"
            variant="text"
            color="primary"
            class="torrent-card__detail-btn"
            @click.stop="openTorrentDetail()"
          >
            <VIcon icon="mdi-information-outline" size="16"></VIcon>
          </VBtn>
        </div>
      </VCardActions>
    </VCard>
  </div>
</template>
<style scoped>
.discount-banner {
  position: absolute;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  border-radius: 5px;
  background-color: rgba(var(--v-theme-primary), 0.12) !important;
  block-size: 20px;
  color: rgb(var(--v-theme-primary)) !important;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  inset-block-start: 12px;
  inset-inline-end: 12px;
  line-height: 1;
  padding-inline: 6px;
}

.torrent-chip {
  border-radius: 5px !important;
  block-size: 20px !important;
  font-size: 11px !important;
  font-variant-numeric: tabular-nums;
  padding-inline: 6px !important;
}

.torrent-card-hover-area {
  inline-size: 100%;
}

/* 卡片悬停效果 */
.torrent-card {
  border: 1px solid var(--mp-border-card);
  border-radius: 12px !important;
  background-color: rgb(var(--v-theme-surface));
}

.torrent-card--selected {
  background: rgba(var(--v-theme-primary), 0.06);
}

.torrent-card--batch .torrent-card__media-title {
  margin-inline-start: 1.65rem;
}

.torrent-card__selection-icon {
  position: absolute;
  z-index: 4;
  inset-block-start: 12px;
  inset-inline-start: 12px;
}

.torrent-card-hover-area:hover .torrent-card {
  border-color: var(--mp-border-hover);
  transform: translate3d(0, -0.25rem, 0);
}

.torrent-card__head {
  padding: 13px 15px 0 !important;
}

.torrent-card__body {
  padding: 7px 15px 11px !important;
}

.torrent-card__tags {
  gap: 4px;
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

.torrent-card__footer {
  flex-wrap: nowrap;
  border-color: var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.08)) !important;
  gap: 6px;
  min-block-size: 38px !important;
  padding: 8px 14px !important;
}

.torrent-card__footer--with-more {
  flex-wrap: wrap;
}

.torrent-card__more-btn {
  border-radius: 6px !important;
  block-size: 24px !important;
  font-size: 12px !important;
  font-variant-numeric: tabular-nums;
  padding-inline: 6px !important;
}

.torrent-card__detail-btn {
  border-radius: 6px !important;
  block-size: 26px !important;
  inline-size: 26px !important;
  min-inline-size: 26px !important;
  padding: 0 !important;
}

.torrent-card__stats {
  flex-wrap: nowrap;
  white-space: nowrap;
}

.torrent-card__site {
  display: flex;
  flex: 0 1 auto;
  align-items: center;
  gap: 7px;
  min-inline-size: 0;
}

.torrent-card__site-avatar {
  flex: 0 0 20px !important;
  border-radius: 5px !important;
  block-size: 20px;
  inline-size: 20px;
  max-block-size: 20px;
  max-inline-size: 20px;
}

.torrent-card__site-avatar--img {
  border: 1px solid var(--mp-border-subtle);
  background: rgba(255, 255, 255, 0.14);
  padding: 2px;
}

.torrent-card__site-avatar--img :deep(.v-img__img) {
  object-fit: contain !important;
}

.torrent-card__site-text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  min-inline-size: 0;
}

.torrent-card__site-name {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.85);
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.torrent-card__time {
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 400;
  line-height: 1.25;
  white-space: nowrap;
}

.torrent-card__season {
  display: inline-flex;
  margin-inline-start: 6px;
  vertical-align: 0.1em;
}

.torrent-card__media-title {
  color: rgb(var(--v-theme-on-surface));
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 1.35;
}

.torrent-card__torrent-title {
  color: rgba(var(--v-theme-on-surface), 0.78);
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.45;
  word-break: break-all;
}

.torrent-card__description {
  color: rgba(var(--v-theme-on-surface), 0.56);
  font-size: 12px;
  line-height: 1.4;
  word-break: break-all;
}
</style>
