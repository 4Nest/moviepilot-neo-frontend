<script setup lang="ts">
import { useToast } from 'vue-toastification'
import api from '@/api'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import type {
  ApiResponse,
  DownloaderConf,
  MediaDataSource,
  MediaInfo,
  TorrentInfo,
  TransferDirectoryConf,
} from '@/api/types'
import { formatFileSize } from '@/@core/utils/formatters'
import { VCardTitle } from 'vuetify/lib/components/index.mjs'
import { useI18n } from '@/composables/useChineseText'
import MediaIdSelector from '../misc/MediaIdSelector.vue'
import { numberValidator } from '@/@validators'
import { useGlobalSettingsStore } from '@/stores'
import { useConfirm } from '@/composables/useConfirm'
import {
  buildDownloadDirectoryOptions,
  filterDownloadDirectoryOption,
  toDownloadDirectoryValue,
  toDownloadSavePath,
} from '@/utils/downloadDirectory'

// 多语言支持
const { t } = useI18n()

// 从 provide 中获取全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// 当前识别类型
const mediaSource = ref<MediaDataSource>(
  ['themoviedb', 'douban', 'bangumi', 'anilist'].includes(globalSettings.RECOGNIZE_SOURCE)
    ? globalSettings.RECOGNIZE_SOURCE
    : 'themoviedb',
)

// 输入参数
const props = defineProps({
  title: String,
  media: Object as PropType<MediaInfo>,
  torrent: Object as PropType<TorrentInfo>,
  torrents: Array as PropType<TorrentInfo[]>,
  downloader: String,
})

// 定义成功和失败事件
const emit = defineEmits(['done', 'error', 'close'])

// 提示框
const $toast = useToast()

// 确认框
const createConfirm = useConfirm()

// 选择的下载器
const selectedDownloader = ref<string | null>(props.downloader || null)

interface ManualTorrentFile {
  name: string
  content: string
}

// 无预设种子时使用手动输入模式
const isManualMode = computed(() => !props.torrent && !props.torrents?.length)
const manualUrl = ref('')
const manualTitle = ref('')
const manualTorrentFiles = ref<ManualTorrentFile[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)
const manualFileName = computed(() => manualTorrentFiles.value[0]?.name || '')
const manualUrlItems = computed(() =>
  manualUrl.value
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean),
)
const manualTorrentItems = computed<TorrentInfo[]>(() => {
  if (manualTorrentFiles.value.length)
    return manualTorrentFiles.value.map(file => ({ torrent_content: file.content }) as TorrentInfo)
  return manualUrlItems.value.map(enclosure => ({ enclosure }) as TorrentInfo)
})
const isManualBatch = computed(() => isManualMode.value && manualTorrentItems.value.length > 1)
const isBatchMode = computed(() => isManualBatch.value || (props.torrents?.length || 0) > 1)

// 选择的保存目录（始终是路径，不含别名标签）
const selectedDirectory = ref<string | null>(null)

// 保存目录输入框绑定：统一归一为路径字符串，清空为 null
const directoryModel = computed({
  get: () => selectedDirectory.value,
  set: (value: unknown) => {
    selectedDirectory.value = toDownloadDirectoryValue(value)
  },
})

// 下载器
const downloaders = ref<Array<Pick<DownloaderConf, 'name' | 'type'>>>([])

// 所有目录设置
const directories = ref<TransferDirectoryConf[]>([])

// 是否正在加载
const loading = ref(false)

// 是否显示高级选项
const showAdvancedOptions = ref(false)

// 当前数据源的原生媒体ID
const mediaId = ref<string | undefined>(undefined)

// 当前数据源对应的原生ID标签。
const mediaIdLabel = computed(() => {
  const labels: Record<MediaDataSource, string> = {
    themoviedb: t('dialog.reorganize.tmdbId'),
    douban: t('dialog.reorganize.doubanId'),
    bangumi: t('dialog.reorganize.bangumiId'),
    anilist: t('dialog.reorganize.anilistId'),
  }
  return labels[mediaSource.value]
})

// TMDB选择对话框
const mediaSelectorDialog = ref(false)

// 计算按钮图标
const icon = computed(() => (loading.value ? 'mdi-progress-download' : 'mdi-download'))

// 计算按钮文字
const buttonText = computed(() => {
  if (loading.value) return t('dialog.addDownload.downloading')
  if (isBatchMode.value) {
    return t('dialog.addDownload.startBatchDownload', {
      count: isManualMode.value ? manualTorrentItems.value.length : props.torrents?.length || 0,
    })
  }
  return t('dialog.addDownload.startDownload')
})

// 预设种子仅展示站点等摘要，手动模式展示输入说明。
const dialogSubtitle = computed(() => {
  if (isManualMode.value) return t('dialog.addDownload.ManualSubtitle')
  if (isBatchMode.value) return t('dialog.addDownload.batchSubtitle', { count: props.torrents?.length || 0 })

  const siteName = props.torrent?.site_name?.trim()
  return siteName || props.title?.trim() || props.torrent?.title?.trim() || ''
})

// 加载目录设置
async function loadDirectories() {
  try {
    const result = await api.get<
      ApiResponse<{ value?: TransferDirectoryConf[] }>,
      ApiResponse<{ value?: TransferDirectoryConf[] }>
    >('system/setting/public/Directories')
    directories.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 保存目录下拉选项：列表显示「别名 (路径)」，值为路径
const targetDirectories = computed(() => buildDownloadDirectoryOptions(directories.value, toDownloadSavePath))

// 调用API查询下载器设置
async function loadDownloaderSetting() {
  try {
    downloaders.value = await api.get<
      Array<Pick<DownloaderConf, 'name' | 'type'>>,
      Array<Pick<DownloaderConf, 'name' | 'type'>>
    >('download/clients')
  } catch (error) {
    console.log(error)
  }
}

// 下载器可选项
const downloaderOptions = computed(() => {
  return downloaders.value.map(item => ({
    title: item.name,
    value: item.name,
  }))
})

function readTorrentFile(file: File): Promise<ManualTorrentFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error(`无法读取种子文件：${file.name}`))
        return
      }
      resolve({ name: file.name, content: reader.result.split(',', 2)[1] || '' })
    }
    reader.onerror = () => reject(reader.error || new Error(`无法读取种子文件：${file.name}`))
    reader.readAsDataURL(file)
  })
}

async function onTorrentFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (!files.length) return

  try {
    manualTorrentFiles.value = await Promise.all(files.map(readTorrentFile))
    if (files.length === 1 && !manualTitle.value.trim()) manualTitle.value = files[0].name.replace(/\.torrent$/i, '')
  } catch (error) {
    console.error(error)
    $toast.error(t('dialog.addDownload.readTorrentFailed'))
  }
}

function clearTorrentFile() {
  manualTorrentFiles.value = []
  if (fileInputRef.value) fileInputRef.value.value = ''
}

// 是否为需要用户确认的未识别资源响应
function requiresConfirmation(result: ApiResponse<unknown> | undefined) {
  const data = result?.data as { requires_confirmation?: boolean } | null | undefined
  return result?.success === false && data?.requires_confirmation === true
}

interface DownloadPayload {
  allow_unrecognized?: boolean
  downloader: string | null
  media_id?: string
  media_in?: MediaInfo
  media_source?: MediaDataSource
  save_path: string | null
  torrent_in: TorrentInfo | undefined
}

function buildDownloadPayload(torrent: TorrentInfo | undefined, includeMediaId = true): DownloadPayload {
  const payload: DownloadPayload = {
    torrent_in: torrent,
    downloader: selectedDownloader.value,
    save_path: selectedDirectory.value,
  }
  if (props.media) payload.media_in = props.media
  if (includeMediaId && mediaId.value) {
    payload.media_source = mediaSource.value
    payload.media_id = mediaId.value
  }
  return payload
}

interface BatchDownloadOutcome {
  torrent: TorrentInfo
  payload: DownloadPayload
  result?: ApiResponse<unknown>
  error?: unknown
}

async function addBatchDownload(torrents: TorrentInfo[]) {
  const endpoint = props.media ? 'download/' : 'download/add'
  let succeeded = 0
  let failed = 0
  let firstError = ''
  const succeededTorrents: TorrentInfo[] = []
  startNProgress()
  loading.value = true
  try {
    const outcomes = await Promise.all(
      torrents.map(async (torrent): Promise<BatchDownloadOutcome> => {
        const payload = buildDownloadPayload(torrent, false)
        try {
          const result = await api.post<ApiResponse<unknown>, ApiResponse<unknown>>(endpoint, payload)
          return { torrent, payload, result }
        } catch (error) {
          return { torrent, payload, error }
        }
      }),
    )

    for (const outcome of outcomes) {
      if (outcome.error !== undefined || !outcome.result) {
        failed += 1
        firstError ||= outcome.error instanceof Error ? outcome.error.message : String(outcome.error || '')
        console.error(outcome.error)
        continue
      }

      const { torrent, payload } = outcome
      try {
        let result = outcome.result
        if (requiresConfirmation(result)) {
          const confirmed = await createConfirm({
            type: 'warn',
            title: t('dialog.addDownload.unrecognizedTitle'),
            content: t('dialog.addDownload.unrecognizedBatchContent', {
              title: torrent.title || torrent.enclosure || torrent.site_name || t('common.unknown'),
            }),
            confirmText: t('dialog.addDownload.unrecognizedConfirm'),
          })
          if (!confirmed) {
            failed += 1
            continue
          }
          result = await api.post<ApiResponse<unknown>, ApiResponse<unknown>>(endpoint, {
            ...payload,
            allow_unrecognized: true,
          })
        }
        if (result?.success) {
          succeeded += 1
          succeededTorrents.push(torrent)
        } else {
          failed += 1
          firstError ||= result?.message || ''
        }
      } catch (error) {
        failed += 1
        firstError ||= error instanceof Error ? error.message : String(error)
        console.error(error)
      }
    }
  } finally {
    loading.value = false
    doneNProgress()
  }

  const message = t('dialog.addDownload.batchResult', { succeeded, failed })
  if (failed) $toast.error(firstError ? `${message} ${firstError}` : message)
  else $toast.success(message)
  if (succeeded) emit('done', succeededTorrents)
  else emit('error', firstError || message)
}

// 添加下载
async function addDownload() {
  if (isManualMode.value && !manualTorrentItems.value.length) {
    $toast.error(t('dialog.addDownload.emptyTorrentError'))
    return
  }

  if (isManualBatch.value) {
    await addBatchDownload(manualTorrentItems.value)
    return
  }

  const effectiveTorrent = (
    isManualMode.value
      ? {
          ...manualTorrentItems.value[0],
          title: manualTitle.value.trim() || undefined,
        }
      : props.torrents?.length
        ? props.torrents[0]
        : props.torrent
  ) as TorrentInfo | undefined

  if ((props.torrents?.length || 0) > 1) {
    await addBatchDownload(props.torrents!)
    return
  }

  let progressActive = true
  startNProgress()
  loading.value = true
  try {
    const payload = buildDownloadPayload(effectiveTorrent)
    const endpoint = props.media ? 'download/' : 'download/add'

    let result = await api.post<ApiResponse<unknown>, ApiResponse<unknown>>(endpoint, payload)

    // 未识别资源需用户确认：确认后携带 allow_unrecognized 重试同一请求，取消则保留弹窗
    if (requiresConfirmation(result)) {
      progressActive = false
      doneNProgress()
      const confirmed = await createConfirm({
        type: 'warn',
        title: t('dialog.addDownload.unrecognizedTitle'),
        content: t('dialog.addDownload.unrecognizedContent'),
        confirmText: t('dialog.addDownload.unrecognizedConfirm'),
      })
      if (!confirmed) return
      progressActive = true
      startNProgress()
      result = await api.post<ApiResponse<unknown>, ApiResponse<unknown>>(endpoint, {
        ...payload,
        allow_unrecognized: true,
      })
    }

    if (result && result.success) {
      // 添加下载成功
      $toast.success(
        isManualMode.value
          ? t('dialog.addDownload.manualSuccess')
          : t('dialog.addDownload.downloadSuccess', {
              site: effectiveTorrent?.site_name,
              title: effectiveTorrent?.title,
            }),
      )
      // 下载成功，返回链接
      emit('done', effectiveTorrent?.enclosure)
    } else {
      // 添加下载失败
      $toast.error(
        isManualMode.value
          ? t('dialog.addDownload.manualFailed', { message: result?.message })
          : t('dialog.addDownload.downloadFailed', {
              site: effectiveTorrent?.site_name,
              title: effectiveTorrent?.title,
              message: result?.message,
            }),
      )
      // 下载失败，返回错误原因
      emit('error', result?.message)
    }
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
    if (progressActive) doneNProgress()
  }
}

onMounted(() => {
  loadDirectories()
  loadDownloaderSetting()
})
</script>
<template>
  <VDialog max-width="36rem" scrollable>
    <VCard class="add-download-dialog">
      <VCardItem class="add-download-header py-3">
        <template #prepend>
          <div class="add-download-header__icon">
            <VIcon icon="mdi-monitor-arrow-down-variant" size="22" />
          </div>
        </template>
        <VCardTitle class="add-download-header__title">
          {{
            isBatchMode
              ? t('dialog.addDownload.batchTitle')
              : isManualMode
                ? t('dialog.addDownload.manualTitle')
                : t('dialog.addDownload.confirmDownload')
          }}
        </VCardTitle>
        <VCardSubtitle class="add-download-header__subtitle">{{ dialogSubtitle }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn @click="emit('close')" />
      <VDivider />
      <VCardText class="add-download-content">
        <div v-if="isManualMode" class="add-download-manual">
          <VTextarea
            v-model="manualUrl"
            :label="t('dialog.addDownload.torrentInputLabel')"
            :placeholder="t('dialog.addDownload.torrentInputPlaceholder')"
            :disabled="!!manualTorrentFiles.length"
            prepend-inner-icon="mdi-link-variant"
            variant="outlined"
            density="comfortable"
            rows="2"
            auto-grow
            hide-details
          />
          <input
            ref="fileInputRef"
            type="file"
            accept=".torrent,application/x-bittorrent"
            class="d-none"
            multiple
            @change="onTorrentFileChange"
          />
          <div class="add-download-manual__file-actions">
            <VBtn
              class="add-download-manual__file-button"
              variant="tonal"
              color="primary"
              prepend-icon="mdi-file-upload-outline"
              :title="manualFileName || undefined"
              @click="fileInputRef?.click()"
            >
              <span class="add-download-manual__file-label">
                {{
                  manualTorrentFiles.length > 1
                    ? t('dialog.addDownload.selectedFilesChip', { count: manualTorrentFiles.length })
                    : manualFileName
                      ? t('dialog.addDownload.selectedFileChip', { name: manualFileName })
                      : t('dialog.addDownload.uploadTorrentFile')
                }}
              </span>
            </VBtn>
            <VBtn
              v-if="manualFileName"
              icon="mdi-close"
              variant="text"
              :aria-label="t('dialog.addDownload.clearTorrentFile')"
              @click="clearTorrentFile"
            />
          </div>
          <VTextField
            v-if="!isManualBatch"
            v-model="manualTitle"
            :label="t('dialog.addDownload.customTitleLabel')"
            :placeholder="t('dialog.addDownload.customTitlePlaceholder')"
            prepend-inner-icon="mdi-form-textbox"
            variant="outlined"
            density="comfortable"
            hide-details
          />
        </div>
        <div v-else class="add-download-info">
          <div class="add-download-info__title">
            {{
              isBatchMode
                ? t('dialog.addDownload.batchSelected', { count: torrents?.length || 0 })
                : torrent?.title || torrents?.[0]?.title
            }}
          </div>
          <div
            v-if="!isBatchMode && (torrent?.description || torrents?.[0]?.description)"
            class="add-download-info__description"
          >
            {{ torrent?.description || torrents?.[0]?.description }}
          </div>
          <div v-if="!isBatchMode" class="add-download-info__meta">
            <span v-if="torrent?.size || torrents?.[0]?.size" class="add-download-info__chip">
              <VIcon icon="mdi-harddisk" size="14" />
              {{ formatFileSize(torrent?.size || torrents?.[0]?.size || 0) }}
            </span>
            <span class="add-download-info__chip add-download-info__chip--seeders">
              <VIcon icon="mdi-arrow-up-bold" size="13" />
              {{ torrent?.seeders ?? torrents?.[0]?.seeders ?? '-' }}
            </span>
            <span class="add-download-info__chip add-download-info__chip--peers">
              <VIcon icon="mdi-arrow-down-bold" size="13" />
              {{ torrent?.peers ?? torrents?.[0]?.peers ?? '-' }}
            </span>
          </div>
        </div>
        <div class="add-download-form">
          <VSelect
            v-model="selectedDownloader"
            :items="downloaderOptions"
            :label="t('dialog.addDownload.downloader')"
            variant="outlined"
            :placeholder="t('dialog.addDownload.defaultPlaceholder')"
            density="comfortable"
            prepend-inner-icon="mdi-download"
            hide-details
          />
          <VCombobox
            v-model="directoryModel"
            :items="targetDirectories"
            item-title="title"
            item-value="value"
            :custom-filter="filterDownloadDirectoryOption"
            :label="t('dialog.addDownload.saveDirectory')"
            :placeholder="t('dialog.addDownload.autoPlaceholder')"
            variant="outlined"
            density="comfortable"
            prepend-inner-icon="mdi-folder-outline"
            hide-details
          >
            <template #item="{ props: itemProps, item }">
              <VListItem v-bind="itemProps" :title="item.raw.label" role="option" />
            </template>
          </VCombobox>
        </div>
        <VBtn
          variant="text"
          size="small"
          color="primary"
          class="add-download-advanced__toggle"
          :disabled="isBatchMode"
          :prepend-icon="showAdvancedOptions ? 'mdi-chevron-up' : 'mdi-chevron-down'"
          @click="showAdvancedOptions = !showAdvancedOptions"
        >
          {{
            showAdvancedOptions
              ? t('dialog.addDownload.hideAdvancedOptions')
              : t('dialog.addDownload.showAdvancedOptions')
          }}
        </VBtn>
        <div v-show="showAdvancedOptions && !isBatchMode" class="add-download-advanced">
          <VTextField
            v-model="mediaId"
            :disabled="isBatchMode"
            :label="mediaIdLabel"
            :placeholder="t('dialog.reorganize.mediaIdPlaceholder')"
            :rules="[numberValidator]"
            append-inner-icon="mdi-magnify"
            :hint="t('dialog.reorganize.mediaIdHint')"
            persistent-hint
            prepend-inner-icon="mdi-identifier"
            variant="outlined"
            density="comfortable"
            @click:append-inner="mediaSelectorDialog = true"
          />
        </div>
      </VCardText>
      <VDivider />
      <div class="add-download-actions">
        <VBtn variant="text" class="add-download-actions__cancel" @click="emit('close')">
          {{ t('common.cancel') }}
        </VBtn>
        <VBtn
          color="primary"
          variant="flat"
          min-width="9rem"
          :disabled="loading"
          :prepend-icon="icon"
          @click="addDownload"
        >
          {{ buttonText }}
        </VBtn>
      </div>
    </VCard>
    <!-- 媒体ID选择器 -->
    <VDialog v-model="mediaSelectorDialog" width="40rem" scrollable max-height="85vh">
      <MediaIdSelector v-model="mediaId" @close="mediaSelectorDialog = false" :type="mediaSource" />
    </VDialog>
  </VDialog>
</template>

<style lang="scss" scoped>
.add-download-dialog {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(var(--v-border-color), calc(var(--v-border-opacity) * 0.9));
  background:
    radial-gradient(circle at 5% 0%, rgba(var(--v-theme-primary), 0.08), transparent 24rem), rgb(var(--v-theme-surface));
}

.add-download-header__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(var(--v-theme-primary), 0.28);
  border-radius: 0.75rem;
  background: rgba(var(--v-theme-primary), 0.14);
  block-size: 2.5rem;
  color: rgb(var(--v-theme-primary));
  inline-size: 2.5rem;
  margin-inline-end: 0.25rem;
}

.add-download-header__title {
  font-size: 1.05rem;
  font-weight: 700;
}

.add-download-header__subtitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.add-download-manual {
  display: grid;
  gap: 0.75rem;
}

.add-download-manual__file-actions {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  gap: 0.25rem;
}

.add-download-manual__file-button {
  flex: 0 1 auto;
  min-inline-size: 0;
  max-inline-size: 100%;
}

.add-download-manual__file-button :deep(.v-btn__content) {
  min-inline-size: 0;
}

.add-download-manual__file-label {
  overflow: hidden;
  min-inline-size: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.add-download-info {
  border: 1px solid rgba(var(--v-border-color), calc(var(--v-border-opacity) * 0.7));
  border-radius: 0.75rem;
  background: rgba(var(--v-theme-on-surface), 0.03);
  padding: 0.75rem 0.9rem;
}

.add-download-info__title {
  color: rgb(var(--v-theme-on-surface));
  font-size: 0.92rem;
  font-weight: 650;
  line-height: 1.45;
  white-space: break-spaces;
}

.add-download-info__description {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.78rem;
  line-height: 1.45;
  margin-block-start: 0.35rem;
  white-space: break-spaces;
}

.add-download-info__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-block-start: 0.6rem;
}

.add-download-info__chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), 0.78);
  font-size: 0.75rem;
  font-weight: 600;
  gap: 0.25rem;
  line-height: 1;
  padding: 0.28rem 0.6rem;
}

.add-download-info__chip--seeders {
  background: rgba(var(--v-theme-success), 0.12);
  color: rgb(var(--v-theme-success));
}

.add-download-info__chip--peers {
  background: rgba(var(--v-theme-warning), 0.12);
  color: rgb(var(--v-theme-warning));
}

.add-download-form {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-block-start: 1rem;
}

@media (max-width: 37.5rem) {
  .add-download-form {
    grid-template-columns: minmax(0, 1fr);
  }
}

.add-download-advanced {
  margin-block-start: 0.5rem;
}

.add-download-advanced__toggle {
  margin-block-start: 0.25rem;
  margin-inline-start: -0.5rem;
}

.add-download-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem 1rem;
}

.add-download-actions__cancel {
  color: rgba(var(--v-theme-on-surface), 0.65);
}
</style>
