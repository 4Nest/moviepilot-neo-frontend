<script lang="ts" setup>
import type { PropType } from 'vue'
import { formatFileSize, formatDateDifference } from '@/@core/utils/formatters'
import api from '@/api'
import type { Context } from '@/api/types'
import { getCachedSiteIcon } from '@/utils/siteIconCache'
import { downloadedTorrentMap, markTorrentDownloaded } from '@/utils/torrentDownloadCache'
import { openSharedDialog } from '@/composables/useSharedDialog'

const AddDownloadDialog = defineAsyncComponent(() => import('../dialog/AddDownloadDialog.vue'))

// 输入参数
const props = defineProps({
  torrent: Object as PropType<Context>,
})

// 种子信息
const torrent = ref(props.torrent?.torrent_info)

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
        const response = await api.get(`site/icon/${site}`)

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

// 获取优惠类型样式
function getPromotionClass(downloadVolumeFactor: number | undefined, uploadVolumeFactor: number | undefined) {
  if (!downloadVolumeFactor) return 'bg-success'
  if (downloadVolumeFactor === 0) return 'bg-success'
  else if (downloadVolumeFactor < 1) return 'bg-orange'
  else if (uploadVolumeFactor !== undefined && uploadVolumeFactor > 1) return 'bg-purple'
  else return ''
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
      class="app-hover-lift-card pa-3 mb-2 rounded torrent-item overflow-hidden"
      :class="{ 'border-start border-success border-3 opacity-85': isDownloaded }"
      @click="handleAddDownload"
    >
      <!-- 优惠标签 -->
      <div
        v-if="torrent?.downloadvolumefactor !== 1 || torrent?.uploadvolumefactor !== 1"
        class="discount-banner text-white px-2 py-1 text-sm font-weight-bold rounded-bl-lg"
        :class="getPromotionClass(torrent?.downloadvolumefactor, torrent?.uploadvolumefactor)"
      >
        {{ torrent?.volume_factor }}
      </div>

      <template v-slot:prepend>
        <div class="d-flex flex-column align-center pr-3" :title="torrent?.site_name">
          <VImg
            v-if="siteIcon"
            :src="siteIcon"
            :alt="torrent?.site_name"
            class="rounded mb-1 site-icon"
            width="32"
            height="32"
          />
          <VAvatar
            v-else
            size="32"
            class="mb-1 text-caption bg-primary-lighten-4 text-primary font-weight-bold site-icon"
          >
            {{ torrent?.site_name?.substring(0, 1) }}
          </VAvatar>
        </div>
      </template>

      <VListItemTitle class="whitespace-normal">
        <div class="torrent-item__media-title mb-2">
          {{ media?.title ?? meta?.name }}
          <VChip
            v-if="meta?.season_episode"
            color="primary"
            variant="flat"
            size="small"
            class="torrent-item__season font-weight-bold"
          >
            {{ meta?.season_episode }}
          </VChip>
        </div>

        <div class="torrent-item__torrent-title mb-2">
          {{ torrent?.title }}
        </div>

        <div class="torrent-item__description mb-2">
          {{ meta?.subtitle || torrent?.description || '暂无描述' }}
        </div>

        <!-- 发布时间 -->
        <div v-if="torrent?.pubdate" class="d-flex align-center mb-2">
          <VIcon size="small" color="grey" icon="mdi-clock-outline" class="me-1"></VIcon>
          <span class="text-sm text-medium-emphasis">{{ formatDateDifference(torrent.pubdate) }}</span>
        </div>

        <div class="d-flex flex-wrap gap-1 mb-2">
          <!-- 资源标签，与弹窗 tonal 标签统一 -->
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
      </VListItemTitle>

      <template v-slot:append>
        <div class="d-flex flex-column align-end gap-2">
          <div class="d-flex align-center gap-2">
            <span class="torrent-stat torrent-stat--seeders">
              <VIcon icon="mdi-arrow-up-bold" size="13" />
              {{ torrent?.seeders ?? '-' }}
            </span>
            <span class="torrent-stat torrent-stat--peers">
              <VIcon icon="mdi-arrow-down-bold" size="13" />
              {{ torrent?.peers ?? '-' }}
            </span>
          </div>

          <div class="d-flex align-center">
            <span v-if="torrent?.size" class="torrent-stat torrent-stat--size mr-2">
              <VIcon icon="mdi-harddisk" size="14" />
              {{ formatFileSize(torrent.size) }}
            </span>

            <VBtn icon size="small" variant="text" color="primary" @click.stop="openTorrentDetail">
              <VIcon icon="mdi-information-outline"></VIcon>
            </VBtn>
          </div>
        </div>
      </template>
    </VListItem>
  </div>
</template>

<style scoped>
.discount-banner {
  position: absolute;
  z-index: 3;
  inset-block-start: 0;
  inset-inline-end: 0;
}

.torrent-item-hover-area {
  inline-size: 100%;
}

.torrent-item {
  border: var(--app-card-light-border);
}

.torrent-item-hover-area:hover .torrent-item {
  border-color: rgba(var(--v-theme-primary), 0.3);
  transform: translate3d(0, -0.25rem, 0);
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

.site-icon {
  transition: transform 0.2s ease;
}

.site-icon:hover {
  transform: scale(1.1);
}
.torrent-item__media-title {
  color: rgb(var(--v-theme-on-surface));
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  line-height: 1.35;
}

.torrent-item__season {
  display: inline-flex;
  margin-inline-start: 0.4rem;
  vertical-align: 0.12em;
}
.torrent-item__torrent-title {
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 0.8rem;
  font-weight: 550;
  line-height: 1.5;
  word-break: break-all;
}

.torrent-item__description {
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 0.74rem;
  line-height: 1.45;
  word-break: break-all;
}
</style>
