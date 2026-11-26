<script lang="ts" setup>
import api from '@/api'
import type { ApiResponse, DownloadingInfo } from '@/api/types'
import { formatFileSize } from '@/@core/utils/formatters'
import { useI18n } from '@/composables/useChineseText'
import { useConfirm } from '@/composables/useConfirm'
import { useToast } from 'vue-toastification'

/** 卡片使用的下载任务信息，兼容接口已经返回但公共类型尚未声明的来源站点。 */
interface DownloadingCardInfo extends DownloadingInfo {
  site_name?: string
  trackers?: string[]
}

/** 正在下载任务卡片，负责展示任务状态并提供暂停、继续和删除操作。 */
const props = defineProps({
  info: Object as PropType<DownloadingCardInfo>,
  downloaderName: String,
})

const emit = defineEmits<{
  remove: [hash?: string]
}>()

const { t } = useI18n()
const createConfirm = useConfirm()
const $toast = useToast()

const pendingAction = ref<'delete' | 'toggle' | null>(null)
const isDeleting = computed(() => pendingAction.value === 'delete')
const imageLoadError = ref(false)
const media = computed(() => props.info?.media ?? {})

watch(
  () => media.value.poster,
  () => {
    imageLoadError.value = false
  },
)

const hasPosterImage = computed(() => Boolean(media.value.poster && !imageLoadError.value))

const mediaTitle = computed(() => media.value.title || props.info?.name || props.info?.title || t('common.unknown'))

const episodeText = computed(() => {
  const recognizedEpisode = [media.value.season, media.value.episode].filter(Boolean).join(' ')
  return recognizedEpisode || props.info?.season_episode || ''
})

const titleMetaText = computed(() => [props.info?.year?.trim(), episodeText.value].filter(Boolean).join(' · '))

const mediaTypeText = computed(() => {
  const type = String(media.value.type || '').trim()
  if (type === '电影' || type.toLowerCase() === 'movie') return t('mediaType.movie')
  if (type === '电视剧' || type.toLowerCase() === 'tv') return t('mediaType.tv')
  if (type) return type
  if (media.value.season || media.value.episode || props.info?.season_episode) return t('mediaType.tv')
  return media.value.title ? t('mediaType.movie') : ''
})

const mediaTypeIcon = computed(() => {
  const type = String(media.value.type || '')
    .trim()
    .toLowerCase()
  if (type === '电影' || type === 'movie') return 'mdi-movie-outline'
  if (type === '电视剧' || type === 'tv') return 'mdi-television-classic'
  return 'mdi-play-box-outline'
})

const progressValue = computed(() => {
  const progress = Number(props.info?.progress ?? 0)
  if (!Number.isFinite(progress)) return 0
  return Math.min(Math.max(progress, 0), 100)
})

const progressText = computed(() => `${Math.round(progressValue.value)}%`)
const sizeText = computed(() => formatFileSize(props.info?.size || 0))
const remainingTimeText = computed(() => props.info?.left_time?.trim() || '--')
const savePathText = computed(() => props.info?.save_path?.trim() || '')

/** 从 Tracker 地址中仅提取可展示的主机名，避免暴露路径、查询参数或 passkey。 */
function getTrackerHostname(tracker?: string) {
  if (!tracker) return ''
  try {
    return new URL(tracker).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

const sourceSiteText = computed(() => {
  const siteName = String(props.info?.site_name || media.value.site_name || '').trim()
  if (siteName) return siteName
  return props.info?.trackers?.map(getTrackerHostname).find(Boolean) || ''
})

/** 为下载器返回的速率补齐单位，并兼容已经包含每秒单位的值。 */
function formatSpeed(speed?: string) {
  const value = speed?.trim() || '0 B'
  return /\/s$/i.test(value) ? value : `${value}/s`
}

const downloadSpeedText = computed(() => formatSpeed(props.info?.dlspeed))
const uploadSpeedText = computed(() => formatSpeed(props.info?.upspeed))

// 下载状态跟随轮询数据变化，操作成功时也会立即响应。
const isDownloading = ref(props.info?.state === 'downloading')

watch(
  () => props.info?.state,
  newValue => {
    isDownloading.value = newValue === 'downloading'
  },
)

/** 暂停或继续当前任务，并防止请求完成前重复触发。 */
async function toggleDownload() {
  if (pendingAction.value) return

  const operation = isDownloading.value ? 'stop' : 'start'
  pendingAction.value = 'toggle'
  try {
    const result: ApiResponse<unknown> = await api.get(`download/${operation}/${props.info?.hash}`, {
      params: {
        name: props.downloaderName,
      },
    })

    if (result.success) isDownloading.value = !isDownloading.value
  } catch (error) {
    console.error(error)
  } finally {
    pendingAction.value = null
  }
}

/** 删除当前下载任务，成功后立即通知外层列表移除以释放网格单元并触发弹性补位。 */
async function deleteDownload() {
  if (pendingAction.value) return

  const isConfirmed = await createConfirm({
    type: 'warn',
    title: t('common.confirm'),
    content: `是否确认删除下载任务「${mediaTitle.value}」？`,
  })
  if (!isConfirmed) return

  pendingAction.value = 'delete'
  try {
    const result: ApiResponse<unknown> = await api.delete(`download/${props.info?.hash}`, {
      params: { name: props.downloaderName },
    })
    if (result.success) {
      emit('remove', props.info?.hash)
    } else {
      $toast.error(result.message || t('downloading.deleteFailed'))
    }
  } catch (error) {
    $toast.error(t('downloading.deleteFailed'))
    console.error(error)
  } finally {
    pendingAction.value = null
  }
}
</script>

<template>
  <VHover>
    <template #default="hover">
      <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
      <div v-bind="hover.props" class="downloading-card-hover-area h-full">
        <div
          class="downloading-card-shell app-hover-lift-card h-full"
          :class="{ 'app-hover-lift-card--hovering': hover.isHovering && !isDeleting }"
        >
          <VCard
            :key="props.info?.hash"
            class="downloading-card h-full overflow-hidden"
            :class="{
              'downloading-card--no-image': !hasPosterImage,
              'downloading-card--deleting': isDeleting,
            }"
          >
            <VCardText class="downloading-card__body">
              <div class="downloading-card__main">
                <div v-if="hasPosterImage" class="downloading-card__poster">
                  <VImg
                    :src="media.poster"
                    :aspect-ratio="2 / 3"
                    class="downloading-card__image"
                    cover
                    position="center"
                    @error="imageLoadError = true"
                  >
                    <template #placeholder>
                      <VSkeletonLoader class="downloading-card__image-loader h-full" />
                    </template>
                  </VImg>
                </div>

                <div class="downloading-card__meta">
                  <div class="downloading-card__heading">
                    <div class="downloading-card__title-row">
                      <div class="downloading-card__title" :title="mediaTitle">
                        <span>{{ mediaTitle }}</span>
                        <span v-if="titleMetaText" class="downloading-card__title-meta">{{ titleMetaText }}</span>
                      </div>
                      <span
                        class="downloading-card__status-pill"
                        :class="isDownloading ? 'downloading-card__status-pill--active' : 'downloading-card__status-pill--paused'"
                      >
                        <span class="downloading-card__status-dot" />
                        <span>{{ isDownloading ? t('common.download') : t('common.pause') }}</span>
                      </span>
                    </div>

                    <VTooltip :disabled="!props.info?.title" :max-width="480" location="top" open-delay="200">
                      <template #activator="{ props: tooltipProps }">
                        <!-- Tooltip 浮层不参与布局；有标题时允许键盘聚焦，以便读取被截断的完整种子名。 -->
                        <div
                          v-bind="tooltipProps"
                          class="downloading-card__torrent-title"
                          :class="{ 'downloading-card__torrent-title--focusable': props.info?.title }"
                          :tabindex="props.info?.title ? 0 : undefined"
                        >
                          {{ props.info?.title || t('common.unknown') }}
                        </div>
                      </template>
                      <span class="downloading-card__torrent-tooltip">{{ props.info?.title }}</span>
                    </VTooltip>
                  </div>

                  <div class="downloading-card__chips">
                    <VChip v-if="mediaTypeText" :prepend-icon="mediaTypeIcon" size="x-small" variant="tonal">
                      {{ mediaTypeText }}
                    </VChip>
                    <VChip prepend-icon="mdi-harddisk" size="x-small" variant="tonal">
                      {{ sizeText }}
                    </VChip>
                    <VChip v-if="sourceSiteText" prepend-icon="mdi-web" size="x-small" variant="tonal">
                      {{ sourceSiteText }}
                    </VChip>
                  </div>

                  <VTooltip v-if="savePathText" :max-width="480" location="top" open-delay="200">
                    <template #activator="{ props: tooltipProps }">
                      <div v-bind="tooltipProps" class="downloading-card__save-path" tabindex="0">
                        <VIcon icon="mdi-folder-outline" size="13" />
                        <span>{{ savePathText }}</span>
                      </div>
                    </template>
                    <span class="downloading-card__save-path-tooltip">{{ savePathText }}</span>
                  </VTooltip>
                </div>
              </div>

              <div v-if="progressValue > 0" class="downloading-card__progress">
                <div class="downloading-card__progress-label">
                  <span class="downloading-card__progress-copy">
                    <VIcon icon="mdi-clock-outline" size="12" />
                    <span class="downloading-card__progress-remaining" :title="remainingTimeText">
                      {{ remainingTimeText }}
                    </span>
                  </span>
                  <strong>{{ progressText }}</strong>
                </div>
                <VProgressLinear
                  :aria-label="t('common.download')"
                  :model-value="progressValue"
                  :color="isDownloading ? 'success' : 'warning'"
                  bg-color="surface-variant"
                  height="5"
                  rounded
                />
              </div>

              <div class="downloading-card__footer">
                <div class="downloading-card__speeds">
                  <div class="downloading-card__speed downloading-card__speed--download">
                    <VIcon icon="mdi-arrow-down" size="14" />
                    <strong :title="downloadSpeedText">{{ downloadSpeedText }}</strong>
                  </div>
                  <div class="downloading-card__speed downloading-card__speed--upload">
                    <VIcon icon="mdi-arrow-up" size="14" />
                    <strong :title="uploadSpeedText">{{ uploadSpeedText }}</strong>
                  </div>
                </div>

                <VCardActions class="downloading-card__actions pa-0">
                  <VBtn
                    :aria-label="isDownloading ? t('common.pause') : t('common.download')"
                    :disabled="pendingAction === 'delete'"
                    icon
                    :loading="pendingAction === 'toggle'"
                    color="primary"
                    size="small"
                    variant="tonal"
                    class="downloading-card__action-btn"
                    @click="toggleDownload"
                  >
                    <VIcon :icon="isDownloading ? 'mdi-pause' : 'mdi-play'" size="16" />
                    <VTooltip activator="parent" location="top">
                      {{ isDownloading ? t('common.pause') : t('common.download') }}
                    </VTooltip>
                  </VBtn>
                  <VBtn
                    :aria-label="t('common.delete')"
                    :disabled="pendingAction === 'toggle'"
                    :loading="pendingAction === 'delete'"
                    color="error"
                    icon
                    size="small"
                    variant="tonal"
                    class="downloading-card__action-btn"
                    @click="deleteDownload"
                  >
                    <VIcon icon="mdi-trash-can-outline" size="16" />
                    <VTooltip activator="parent" location="top">{{ t('common.delete') }}</VTooltip>
                  </VBtn>
                </VCardActions>
              </div>
            </VCardText>
          </VCard>
        </div>
      </div>
    </template>
  </VHover>
</template>

<style lang="scss" scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.downloading-card-hover-area {
  block-size: 100%;
  container-type: inline-size;
  inline-size: 100%;
}

.downloading-card-shell {
  border-radius: var(--app-surface-radius);
}

.downloading-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--mp-border-card);
  border-radius: 14px !important;
  background-color: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
}

.downloading-card__body {
  display: flex;
  min-inline-size: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 12px;
  padding: 14px !important;
}

.downloading-card__main {
  display: flex;
  min-inline-size: 0;
  align-items: flex-start;
  gap: 14px;
}

.downloading-card__poster {
  position: relative;
  overflow: hidden;
  flex: 0 0 auto;
  inline-size: 5.5rem;
  aspect-ratio: 2 / 3;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 9px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.18);
}

.downloading-card__image,
.downloading-card__image-loader {
  block-size: 100%;
  inline-size: 100%;
}

.downloading-card__meta {
  display: flex;
  min-inline-size: 0;
  flex: 1 1 0;
  flex-direction: column;
  gap: 8px;
}

.downloading-card__heading {
  min-inline-size: 0;
}

.downloading-card__title-row {
  display: flex;
  min-inline-size: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.downloading-card__status-pill {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  gap: 5px;
  line-height: 1;
  padding: 4px 8px;
  white-space: nowrap;
}

.downloading-card__status-pill--active {
  background: rgba(var(--v-theme-success), 0.14);
  color: rgb(var(--v-theme-success));
}

.downloading-card__status-pill--paused {
  background: rgba(var(--v-theme-warning), 0.15);
  color: rgb(var(--v-theme-warning));
}

.downloading-card__status-dot {
  border-radius: 50%;
  background: currentcolor;
  block-size: 6px;
  inline-size: 6px;
}

.downloading-card__chips {
  display: flex;
  min-inline-size: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}

.downloading-card__chips :deep(.v-chip) {
  border-radius: 6px !important;
  block-size: 21px !important;
  flex: 0 1 auto;
  font-size: 11px !important;
  font-variant-numeric: tabular-nums;
  min-inline-size: 0;
  max-inline-size: 100%;
  padding-inline: 7px !important;
}

.downloading-card__chips :deep(.v-chip__content) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.downloading-card__save-path {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  border-radius: 0.25rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  cursor: help;
  font-size: 11.5px;
  gap: 5px;
}

.downloading-card__save-path:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.downloading-card__save-path-tooltip {
  display: block;
  overflow-wrap: anywhere;
  white-space: normal;
  word-break: break-word;
}

.downloading-card__save-path .v-icon {
  flex: 0 0 auto;
  opacity: 0.8;
}

.downloading-card__save-path span {
  overflow: hidden;
  min-inline-size: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.downloading-card__title {
  display: flex;
  min-inline-size: 0;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 6px;
  row-gap: 2px;
  color: rgb(var(--v-theme-on-surface));
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.35;
  overflow-wrap: anywhere;
  word-break: normal;
}

.downloading-card__title-meta {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  white-space: nowrap;
}

.downloading-card__torrent-title {
  display: block;
  min-inline-size: 0;
  margin-block-start: 4px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11.5px;
  line-height: 1.45;
  overflow-wrap: anywhere;
  white-space: normal;
  word-break: break-word;
}

.downloading-card__torrent-title--focusable {
  border-radius: 0.25rem;
  cursor: help;
}

.downloading-card__torrent-title--focusable:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.downloading-card__torrent-tooltip {
  display: block;
  overflow-wrap: anywhere;
  white-space: normal;
  word-break: break-word;
}

.downloading-card__progress {
  min-inline-size: 0;
}

.downloading-card__progress-label {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  justify-content: space-between;
  margin-block-end: 5px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  gap: 8px;
}

.downloading-card__progress-copy {
  display: flex;
  min-inline-size: 0;
  flex: 1 1 5.5rem;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  line-height: 1.3;
}

.downloading-card__progress-copy .v-icon {
  flex: 0 0 auto;
  opacity: 0.75;
}

.downloading-card__progress-remaining {
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
  white-space: normal;
  word-break: normal;
}

.downloading-card__progress-label strong {
  flex: 0 0 auto;
  color: rgb(var(--v-theme-on-surface));
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  font-weight: 600;
}

.downloading-card__footer {
  display: flex;
  min-inline-size: 0;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.07);
  margin-block-start: auto;
  padding-block-start: 10px;
  gap: 8px;
}

.downloading-card__speeds {
  display: flex;
  min-inline-size: 0;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: center;
  column-gap: 12px;
  row-gap: 3px;
}

.downloading-card__speed {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  gap: 4px;
}

.downloading-card__speed strong {
  overflow: hidden;
  color: rgb(var(--v-theme-on-surface));
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.downloading-card__speed--download .v-icon {
  color: rgb(var(--v-theme-info));
}

.downloading-card__speed--upload .v-icon {
  color: rgb(var(--v-theme-success));
}

.downloading-card__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  margin-inline-start: auto;
  min-block-size: 0 !important;
  gap: 6px;
}

.downloading-card__action-btn {
  border-radius: 8px !important;
  block-size: 30px !important;
  inline-size: 30px !important;
  min-inline-size: 30px !important;
  padding: 0 !important;
}

@container (width <= 25rem) {
  .downloading-card__body {
    gap: 10px;
    padding: 12px !important;
  }

  .downloading-card__main {
    gap: 11px;
  }

  .downloading-card__poster {
    inline-size: 4.75rem;
    border-radius: 8px;
  }

  .downloading-card__meta {
    gap: 6px;
  }

  .downloading-card__chips {
    gap: 4px;
  }

  .downloading-card__title {
    font-size: 14px;
  }

  .downloading-card__title-meta {
    font-size: 11.5px;
  }

  .downloading-card__status-pill {
    font-size: 10.5px;
    padding: 3px 6px;
  }

  .downloading-card__torrent-title {
    font-size: 11.5px;
  }

  .downloading-card__footer {
    flex-wrap: nowrap;
    align-items: center;
    padding-block-start: 9px;
    gap: 6px;
  }

  .downloading-card__speeds {
    flex: 1 1 0;
    column-gap: 8px;
    row-gap: 3px;
  }

  .downloading-card__speed strong {
    font-size: 11.5px;
  }
}

@container (width <= 21rem) {
  .downloading-card__poster {
    inline-size: 4.25rem;
  }

  .downloading-card__body {
    padding: 10px !important;
  }

  .downloading-card__speeds {
    flex-direction: column;
    align-items: flex-start;
    row-gap: 2px;
  }
}

@media (width <= 600px) {
  .downloading-card__action-btn {
    border-radius: 8px !important;
    block-size: 32px !important;
    inline-size: 32px !important;
    min-inline-size: 32px !important;
  }
}

.downloading-card--deleting {
  opacity: 0.6;
  pointer-events: none;
  transition: opacity 0.15s ease;
}
</style>
