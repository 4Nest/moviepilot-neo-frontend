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
import { useI18n } from 'vue-i18n'
import MediaIdSelector from '../misc/MediaIdSelector.vue'
import { numberValidator } from '@/@validators'
import { useGlobalSettingsStore } from '@/stores'

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
})

// 定义成功和失败事件
const emit = defineEmits(['done', 'error', 'close'])

// 提示框
const $toast = useToast()

// 选择的下载器
const selectedDownloader = ref<string | null>(null)

// 选择的保存目录
const selectedDirectory = ref<string | null>(null)

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
const buttonText = computed(() =>
  loading.value ? t('dialog.addDownload.downloading') : t('dialog.addDownload.startDownload'),
)

// 下载确认副标题只保留站点名，完整种子标题由下方信息卡片展示。
const dialogSubtitle = computed(() => {
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

// 将下载目录配置转换为下载器可识别的存储路径。
function convertToUri(item: TransferDirectoryConf) {
  if (!item.download_path) {
    return undefined
  }
  // storage 缺省是受支持的本地目录配置，不能生成 undefined/null 前缀。
  if (item.storage === undefined || item.storage === null || item.storage === 'local') {
    return item.download_path
  }
  return item.storage + ':' + item.download_path
}

// 获取保存目录
const targetDirectories = computed(() => {
  const downloadDirectories = directories.value
    .map(item => convertToUri(item))
    .filter((item): item is string => item !== undefined)
  return [...new Set(downloadDirectories)]
})

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

// 添加下载
async function addDownload() {
  startNProgress()
  loading.value = true
  try {
    const payload: {
      downloader: string | null
      media_id?: string
      media_in?: MediaInfo
      media_source?: MediaDataSource
      save_path: string | null
      torrent_in: TorrentInfo | undefined
    } = {
      torrent_in: props.torrent,
      downloader: selectedDownloader.value,
      save_path: selectedDirectory.value,
    }

    if (props.media) {
      payload.media_in = props.media
    }

    // 添加媒体ID辅助识别
    if (mediaId.value) {
      payload.media_source = mediaSource.value
      payload.media_id = mediaId.value
    }

    const endpoint = props.media ? 'download/' : 'download/add'

    const result = await api.post<ApiResponse<unknown>, ApiResponse<unknown>>(endpoint, payload)

    if (result && result.success) {
      // 添加下载成功
      $toast.success(
        t('dialog.addDownload.downloadSuccess', { site: props.torrent?.site_name, title: props.torrent?.title }),
      )
      // 下载成功，返回链接
      emit('done', props.torrent?.enclosure)
    } else {
      // 添加下载失败
      $toast.error(
        t('dialog.addDownload.downloadFailed', {
          site: props.torrent?.site_name,
          title: props.torrent?.title,
          message: result?.message,
        }),
      )
      // 下载失败，返回错误原因
      emit('error', result?.message)
    }
  } catch (error) {
    console.error(error)
  }
  loading.value = false
  doneNProgress()
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
        <VCardTitle class="add-download-header__title">{{ t('dialog.addDownload.confirmDownload') }}</VCardTitle>
        <VCardSubtitle class="add-download-header__subtitle">{{ dialogSubtitle }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn @click="emit('close')" />
      <VDivider />
      <VCardText class="add-download-content">
        <div class="add-download-info">
          <div class="add-download-info__title">{{ torrent?.title }}</div>
          <div v-if="torrent?.description" class="add-download-info__description">{{ torrent?.description }}</div>
          <div class="add-download-info__meta">
            <span v-if="torrent?.size" class="add-download-info__chip">
              <VIcon icon="mdi-harddisk" size="14" />
              {{ formatFileSize(torrent?.size || 0) }}
            </span>
            <span class="add-download-info__chip add-download-info__chip--seeders">
              <VIcon icon="mdi-arrow-up-bold" size="13" />
              {{ torrent?.seeders ?? '-' }}
            </span>
            <span class="add-download-info__chip add-download-info__chip--peers">
              <VIcon icon="mdi-arrow-down-bold" size="13" />
              {{ torrent?.peers ?? '-' }}
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
            v-model="selectedDirectory"
            :items="targetDirectories"
            :label="t('dialog.addDownload.saveDirectory')"
            :placeholder="t('dialog.addDownload.autoPlaceholder')"
            variant="outlined"
            density="comfortable"
            prepend-inner-icon="mdi-folder-outline"
            hide-details
          />
        </div>
        <VBtn
          variant="text"
          size="small"
          color="primary"
          class="add-download-advanced__toggle"
          :prepend-icon="showAdvancedOptions ? 'mdi-chevron-up' : 'mdi-chevron-down'"
          @click="showAdvancedOptions = !showAdvancedOptions"
        >
          {{
            showAdvancedOptions
              ? t('dialog.addDownload.hideAdvancedOptions')
              : t('dialog.addDownload.showAdvancedOptions')
          }}
        </VBtn>
        <div v-show="showAdvancedOptions" class="add-download-advanced">
          <VTextField
            v-model="mediaId"
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
