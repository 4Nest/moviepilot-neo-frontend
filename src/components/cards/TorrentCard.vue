<script lang="ts" setup>
import type { PropType } from 'vue'
import { formatFileSize, formatDateDifference } from '@/@core/utils/formatters'
import api from '@/api'
import type { Context } from '@/api/types'
import { isNullOrEmptyObject } from '@/@core/utils'
import { getCachedSiteIcon } from '@/utils/siteIconCache'
import { downloadedTorrentMap, markTorrentDownloaded } from '@/utils/torrentDownloadCache'
import { openSharedDialog } from '@/composables/useSharedDialog'

const AddDownloadDialog = defineAsyncComponent(() => import('../dialog/AddDownloadDialog.vue'))
const TorrentMoreSourcesDialog = defineAsyncComponent(() => import('../dialog/TorrentMoreSourcesDialog.vue'))

// 输入参数
const props = defineProps({
  torrent: Object as PropType<Context>,
  more: Array as PropType<Context[]>,
  width: String,
  height: String,
})

// 种子信息
const torrent = ref(props.torrent?.torrent_info)

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
        const response = await api.get(`site/icon/${site}`)

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

// 打开种子详情页面
function openTorrentDetail(item: Context | null = null) {
  const pageUrl = item && !isNullOrEmptyObject(item) ? item.torrent_info?.page_url : torrent.value?.page_url
  if (pageUrl) {
    window.open(pageUrl, '_blank')
  }
}

// 获取优惠类型样式
function getPromotionClass(downloadVolumeFactor: number | undefined, uploadVolumeFactor: number | undefined) {
  if (!downloadVolumeFactor) return 'bg-success'
  if (downloadVolumeFactor === 0) return 'bg-success'
  else if (downloadVolumeFactor < 1) return 'bg-orange'
  else if (uploadVolumeFactor !== undefined && uploadVolumeFactor > 1) return 'bg-purple'
  else return ''
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
      :variant="isDownloaded ? 'outlined' : 'flat'"
      @click="handleAddDownload(props.torrent)"
      class="app-hover-lift-card h-full cursor-pointer d-flex flex-column overflow-hidden torrent-card"
      :class="{ 'border-success border-2 opacity-85': isDownloaded }"
      hover
    >
      <!-- 优惠标签 -->
      <div
        v-if="torrent?.downloadvolumefactor !== 1 || torrent?.uploadvolumefactor !== 1"
        class="discount-banner text-white px-2 py-1 text-sm font-weight-bold rounded-bl-lg"
        :class="getPromotionClass(torrent?.downloadvolumefactor, torrent?.uploadvolumefactor)"
      >
        {{ torrent?.volume_factor }}
      </div>

      <!-- 媒体标题 -->
      <VCardItem class="pt-3 pb-0">
        <div class="torrent-card__media-title mb-2 pr-8">
          {{ media?.title ?? meta?.name }}
          <VChip
            v-if="meta?.season_episode"
            color="primary"
            variant="flat"
            size="small"
            class="torrent-card__season font-weight-bold"
          >
            {{ meta?.season_episode }}
          </VChip>
        </div>
      </VCardItem>

      <!-- 种子内容 -->
      <VCardText class="d-flex flex-column flex-grow-1 pa-3 overflow-hidden">
        <div class="torrent-card__torrent-title mb-1">
          {{ torrent?.title }}
        </div>

        <!-- 种子描述 -->
        <div v-if="meta?.subtitle || torrent?.description" class="torrent-card__description mb-2">
          {{ meta?.subtitle || torrent?.description }}
        </div>
        <!-- 资源标签区吸附内容底部，与弹窗 tonal 标签统一 -->
        <div class="d-flex flex-wrap gap-1 mt-auto">
          <VChip v-if="meta?.web_source" color="primary" size="x-small" variant="flat">
            {{ meta?.web_source }}
          </VChip>
          <VChip v-if="meta?.edition" color="primary" size="x-small" variant="flat">
            {{ meta?.edition }}
          </VChip>
          <VChip v-if="meta?.resource_pix" color="primary" size="x-small" variant="flat">
            {{ meta?.resource_pix }}
          </VChip>
          <VChip v-if="meta?.video_encode" color="primary" size="x-small" variant="flat">
            {{ meta?.video_encode }}
          </VChip>
          <VChip v-if="meta?.resource_team" color="primary" size="x-small" variant="flat">
            {{ meta?.resource_team }}
          </VChip>
          <VChip v-for="(label, index) in torrent?.labels" :key="index" color="primary" size="x-small" variant="flat">
            {{ label }}
          </VChip>
          <VChip v-if="torrent?.hit_and_run" size="x-small" variant="flat" class="text-white bg-black">H&R</VChip>
          <VChip v-if="torrent?.freedate_diff" color="secondary" size="x-small" variant="flat">
            {{ torrent?.freedate_diff }}
          </VChip>
        </div>
      </VCardText>

      <!-- 卡片底部信息：站点在左下，统计与操作在右 -->
      <VCardActions class="torrent-card__footer border-t border-opacity-10 mt-auto pa-2">
        <div class="torrent-card__site">
          <VImg
            v-if="siteIcons[torrent?.site || 0]"
            :src="siteIcons[torrent?.site || 0]"
            :alt="torrent?.site_name"
            class="rounded flex-shrink-0"
            width="20"
            height="20"
          />
          <VAvatar v-else size="20" class="text-caption bg-surface-variant flex-shrink-0" color="surface-variant">
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
          class="pa-1 d-flex align-center flex-shrink-0"
          @click.stop="openMoreTorrentsDialog"
        >
          <VIcon icon="mdi-chevron-down" size="small" class="mr-1"></VIcon>
          更多来源 ({{ props.more.length }})
        </VBtn>

        <div class="d-flex align-center gap-1 flex-shrink-0">
          <span class="torrent-stat torrent-stat--seeders">
            <VIcon icon="mdi-arrow-up-bold" size="13" />
            {{ torrent?.seeders ?? '-' }}
          </span>
          <span class="torrent-stat torrent-stat--peers">
            <VIcon icon="mdi-arrow-down-bold" size="13" />
            {{ torrent?.peers ?? '-' }}
          </span>
          <span v-if="torrent?.size" class="torrent-stat torrent-stat--size">
            <VIcon icon="mdi-harddisk" size="14" />
            {{ formatFileSize(torrent.size) }}
          </span>
          <VBtn icon size="small" variant="text" color="primary" @click.stop="openTorrentDetail()">
            <VIcon icon="mdi-information-outline"></VIcon>
          </VBtn>
        </div>
      </VCardActions>
    </VCard>
  </div>
</template>
<style scoped>
.discount-banner {
  position: absolute;
  inset-block-start: 0;
  inset-inline-end: 0;
}

.torrent-card-hover-area {
  inline-size: 100%;
}

/* 卡片悬停效果 */
.torrent-card {
  border: var(--app-card-light-border);
}

.torrent-card-hover-area:hover .torrent-card {
  border-color: rgba(var(--v-theme-primary), 0.3);
  transform: translate3d(0, -0.25rem, 0);
}

/* 优惠标签样式 */
.bg-success {
  background-color: #4caf50;
}

.bg-orange {
  background-color: #ff5722;
}

.bg-purple {
  background-color: #9c27b0;
}

.torrent-stat {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), 0.78);
  font-size: 0.72rem;
  font-weight: 650;
  gap: 0.22rem;
  line-height: 1;
  padding: 0.26rem 0.55rem;
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
  flex-wrap: wrap;
  gap: 0.5rem;
}

.torrent-card__site {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-inline-size: 0;
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
  font-size: 0.8rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.torrent-card__season {
  display: inline-flex;
  margin-inline-start: 0.4rem;
  vertical-align: 0.12em;
}
.torrent-card__media-title {
  color: rgb(var(--v-theme-on-surface));
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  line-height: 1.35;
}

.torrent-card__torrent-title {
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 0.8rem;
  font-weight: 550;
  line-height: 1.5;
  word-break: break-all;
}

.torrent-card__description {
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 0.74rem;
  line-height: 1.45;
  word-break: break-all;
}
</style>
