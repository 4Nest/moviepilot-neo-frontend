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
  batchMode: Boolean,
  selected: Boolean,
})

const emit = defineEmits(['select'])

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
        'border-start border-success border-3 opacity-85': isDownloaded && !props.selected,
        'border-primary border-2 torrent-item--selected': props.batchMode && props.selected,
      }"
      @click="handleItemClick"
    >
      <template v-slot:prepend>
        <div class="torrent-item__prepend d-flex align-center">
          <VIcon
            v-if="props.batchMode"
            class="mr-3 flex-shrink-0"
            :icon="props.selected ? 'mdi-checkbox-marked-circle' : 'mdi-checkbox-blank-circle-outline'"
            :color="props.selected ? 'primary' : 'medium-emphasis'"
            size="24"
          />
          <div class="torrent-item__site-badge" :title="torrent?.site_name">
            <VImg
              v-if="siteIcon"
              :src="siteIcon"
              :alt="torrent?.site_name"
              class="rounded site-icon"
              width="32"
              height="32"
            />
            <VAvatar v-else size="32" class="text-caption bg-primary-lighten-4 text-primary font-weight-bold site-icon">
              {{ torrent?.site_name?.substring(0, 1) }}
            </VAvatar>
            <span v-if="torrent?.site_name" class="torrent-item__site-name">
              {{ torrent.site_name }}
            </span>
          </div>
        </div>
      </template>

      <VListItemTitle class="whitespace-normal">
        <div class="torrent-item__header d-flex align-center flex-wrap gap-2">
          <span class="torrent-item__media-title">
            {{ media?.title ?? meta?.name }}
          </span>
          <VChip
            v-if="meta?.season_episode"
            color="primary"
            variant="flat"
            size="small"
            class="torrent-item__season font-weight-bold"
          >
            {{ meta?.season_episode }}
          </VChip>
          <!-- 优惠标签整合进标题行 -->
          <span
            v-if="torrent?.downloadvolumefactor !== 1 || torrent?.uploadvolumefactor !== 1"
            class="discount-banner text-white font-weight-bold"
            :class="getPromotionClass(torrent?.downloadvolumefactor, torrent?.uploadvolumefactor)"
          >
            {{ torrent?.volume_factor }}
          </span>
          <span v-if="torrent?.pubdate" class="torrent-item__time d-inline-flex align-center">
            <VIcon size="13" icon="mdi-clock-outline" class="me-1" />
            {{ formatDateDifference(torrent.pubdate) }}
          </span>
        </div>

        <div class="torrent-item__torrent-title">
          {{ torrent?.title }}
        </div>

        <div class="torrent-item__description">
          {{ meta?.subtitle || torrent?.description || '暂无描述' }}
        </div>

        <div class="torrent-item__tags d-flex flex-wrap gap-1">
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
        <div class="torrent-item__append d-flex align-center gap-2">
          <div class="torrent-item__stats d-flex flex-column align-end gap-1">
            <div class="d-flex align-center gap-1">
              <span class="torrent-stat torrent-stat--seeders">
                <VIcon icon="mdi-arrow-up-bold" size="13" />
                {{ torrent?.seeders ?? '-' }}
              </span>
              <span class="torrent-stat torrent-stat--peers">
                <VIcon icon="mdi-arrow-down-bold" size="13" />
                {{ torrent?.peers ?? '-' }}
              </span>
            </div>
            <span v-if="torrent?.size" class="torrent-stat torrent-stat--size">
              <VIcon icon="mdi-harddisk" size="13" />
              {{ formatFileSize(torrent.size) }}
            </span>
          </div>
          <VBtn icon size="small" density="comfortable" variant="text" color="primary" @click.stop="openTorrentDetail">
            <VIcon icon="mdi-information-outline" size="20"></VIcon>
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
  padding: 14px 16px !important;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
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
  border-color: rgba(var(--v-theme-primary), 0.32);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.05);
  transform: translate3d(0, -2px, 0);
}

.torrent-item__prepend {
  margin-inline-end: 14px;
}

.torrent-item__site-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 6px 4px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.025);
  gap: 4px;
  inline-size: 56px;
}

.torrent-item__site-name {
  display: block;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 0.68rem;
  font-weight: 600;
  line-height: 1.15;
  max-inline-size: 48px;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.torrent-item__header {
  margin-block-end: 4px;
}

.torrent-item__media-title {
  color: rgb(var(--v-theme-on-surface));
  font-size: 1.02rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  line-height: 1.3;
}

.torrent-item__season {
  display: inline-flex;
}

.discount-banner {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background-color: rgba(var(--v-theme-primary), 0.85);
  font-size: 0.7rem;
  line-height: 1.2;
  white-space: nowrap;
}

.torrent-item__time {
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 0.74rem;
  font-weight: 400;
  line-height: 1.2;
  white-space: nowrap;
}

.torrent-item__torrent-title {
  color: rgba(var(--v-theme-on-surface), 0.84);
  font-size: 0.84rem;
  font-weight: 600;
  line-height: 1.45;
  margin-block-end: 2px;
  word-break: break-all;
}

.torrent-item__description {
  color: rgba(var(--v-theme-on-surface), 0.54);
  font-size: 0.75rem;
  line-height: 1.4;
  margin-block-end: 8px;
  word-break: break-all;
}

.torrent-item__tags {
  margin-block-start: 2px;
}

.torrent-item__append {
  padding-inline-start: 14px;
  border-inline-start: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  margin-inline-start: 12px;
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
  transform: scale(1.06);
}

@media (width <= 600px) {
  .torrent-item {
    padding: 12px !important;
  }

  .torrent-item__prepend {
    margin-inline-end: 10px;
  }

  .torrent-item__site-badge {
    inline-size: 46px;
  }

  .torrent-item__append {
    padding-inline-start: 8px;
    margin-inline-start: 6px;
  }
}
</style>
