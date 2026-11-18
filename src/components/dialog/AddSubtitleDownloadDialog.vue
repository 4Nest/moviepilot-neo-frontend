<script setup lang="ts">
import { useToast } from 'vue-toastification'
import api from '@/api'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import type { ApiResponse, MediaDataSource, SubtitleInfo, TransferDirectoryConf } from '@/api/types'
import { formatFileSize } from '@/@core/utils/formatters'
import { useI18n } from '@/composables/useChineseText'
import MediaIdSelector from '../misc/MediaIdSelector.vue'
import { numberValidator } from '@/@validators'
import { useGlobalSettingsStore } from '@/stores'
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
  subtitle: Object as PropType<SubtitleInfo>,
})

// 定义成功和失败事件
const emit = defineEmits(['done', 'error', 'close'])

// 提示框
const $toast = useToast()

// 选择的保存目录（始终是路径，不含别名标签）
const selectedDirectory = ref<string | null>(null)

// 保存目录输入框绑定：统一归一为路径字符串，清空为 null
const directoryModel = computed({
  get: () => selectedDirectory.value,
  set: (value: unknown) => {
    selectedDirectory.value = toDownloadDirectoryValue(value)
  },
})

// 所有目录设置
const directories = ref<TransferDirectoryConf[]>([])

// 是否正在加载
const loading = ref(false)
// 表单引用
const subtitleFormRef = ref()
const optionalNumberValidator = (val: unknown) =>
  val === undefined || val === null || val === '' || numberValidator(val)

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
  loading.value ? t('dialog.addSubtitleDownload.downloading') : t('dialog.addSubtitleDownload.startDownload'),
)

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

// 下载字幕
async function addSubtitleDownload() {
  if (loading.value) return
  const { valid } = (await subtitleFormRef.value?.validate()) || { valid: true }
  if (!valid) {
    showAdvancedOptions.value = true
    return
  }

  startNProgress()
  loading.value = true
  try {
    const payload: {
      media_id?: string
      media_source?: MediaDataSource
      save_path: string | null
      subtitle_in: SubtitleInfo | undefined
    } = {
      subtitle_in: props.subtitle,
      save_path: selectedDirectory.value,
    }

    if (mediaId.value) {
      payload.media_source = mediaSource.value
      payload.media_id = mediaId.value
    }

    const result = await api.post<ApiResponse<unknown>, ApiResponse<unknown>>('download/subtitle', payload)

    if (result && result.success) {
      $toast.success(
        t('dialog.addSubtitleDownload.downloadSuccess', {
          site: props.subtitle?.site_name,
          title: props.subtitle?.title,
        }),
      )
      emit('done', props.subtitle?.enclosure)
    } else {
      $toast.error(
        t('dialog.addSubtitleDownload.downloadFailed', {
          site: props.subtitle?.site_name,
          title: props.subtitle?.title,
          message: result?.message,
        }),
      )
      emit('error', result?.message)
    }
  } catch (error) {
    console.error(error)
    emit('error', String(error))
  } finally {
    loading.value = false
    doneNProgress()
  }
}

onMounted(() => {
  loadDirectories()
})
</script>

<template>
  <VDialog max-width="38rem" scrollable>
    <VCard class="mp-dialog-card">
      <VCardItem class="mp-dialog-header">
        <template #prepend>
          <VIcon icon="mdi-subtitles-outline" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>{{ t('dialog.addSubtitleDownload.confirmDownload') }}</VCardTitle>
        <VCardSubtitle>{{ subtitle?.site_name }} - {{ title }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn @click="emit('close')" />
      <VDivider />
      <VCardText class="mp-dialog-body">
        <div class="subtitle-info-card">
          <div class="subtitle-info-card__title">{{ subtitle?.title }}</div>
          <div v-if="subtitle?.description" class="subtitle-info-card__desc">
            {{ subtitle.description }}
          </div>
          <div class="subtitle-info-card__meta">
            <span v-if="subtitle?.language || subtitle?.uploader" class="subtitle-info-card__chip">
              <VIcon icon="mdi-translate" size="13" />
              {{ subtitle?.language || t('common.unknown') }}
              <span v-if="subtitle?.uploader" class="subtitle-info-card__uploader">· {{ subtitle.uploader }}</span>
            </span>
            <span v-if="subtitle?.size" class="subtitle-info-card__chip">
              <VIcon icon="mdi-database" size="13" />
              {{ formatFileSize(subtitle?.size || 0) }}
            </span>
          </div>
        </div>

        <div class="mt-4">
          <VCombobox
            v-model="directoryModel"
            :items="targetDirectories"
            item-title="title"
            item-value="value"
            :custom-filter="filterDownloadDirectoryOption"
            :label="t('dialog.addSubtitleDownload.saveDirectory')"
            :placeholder="t('dialog.addSubtitleDownload.autoPlaceholder')"
            variant="outlined"
            density="comfortable"
            hide-details
            prepend-inner-icon="mdi-folder"
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
          class="subtitle-advanced-toggle"
          :prepend-icon="showAdvancedOptions ? 'mdi-chevron-up' : 'mdi-chevron-down'"
          @click="showAdvancedOptions = !showAdvancedOptions"
        >
          {{
            showAdvancedOptions
              ? t('dialog.addDownload.hideAdvancedOptions')
              : t('dialog.addDownload.showAdvancedOptions')
          }}
        </VBtn>

        <VForm ref="subtitleFormRef" @submit.prevent="() => {}">
          <div v-show="showAdvancedOptions" class="mt-2">
            <VTextField
              v-model="mediaId"
              :label="mediaIdLabel"
              :placeholder="t('dialog.reorganize.mediaIdPlaceholder')"
              :rules="[optionalNumberValidator]"
              append-inner-icon="mdi-magnify"
              :hint="t('dialog.reorganize.mediaIdHint')"
              persistent-hint
              prepend-inner-icon="mdi-identifier"
              variant="outlined"
              density="comfortable"
              @click:append-inner="mediaSelectorDialog = true"
            />
          </div>
        </VForm>
      </VCardText>
      <VDivider />
      <VCardActions class="app-dialog-actions mp-dialog-footer">
        <VSpacer />
        <VBtn color="default" variant="text" size="small" :disabled="loading" @click="emit('close')">
          {{ t('common.cancel') }}
        </VBtn>
        <VBtn
          color="primary"
          variant="flat"
          size="small"
          :loading="loading"
          :disabled="loading"
          :prepend-icon="icon"
          class="px-4"
          @click="addSubtitleDownload"
        >
          {{ buttonText }}
        </VBtn>
      </VCardActions>
    </VCard>
    <VDialog v-model="mediaSelectorDialog" width="40rem" scrollable max-height="85vh">
      <MediaIdSelector v-model="mediaId" @close="mediaSelectorDialog = false" :type="mediaSource" />
    </VDialog>
  </VDialog>
</template>

<style lang="scss" scoped>
.mp-dialog-header {
  padding-block: 14px;
  padding-inline: 22px 48px;
}

.mp-dialog-body {
  padding: 18px 22px !important;
}

.mp-dialog-footer {
  gap: 8px;
  padding: 10px 20px !important;
}

.subtitle-info-card {
  border: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.1));
  border-radius: 10px;
  background: var(--mp-item-bg, rgba(var(--v-theme-on-surface), 0.025));
  padding: 12px 14px;
}

.subtitle-info-card__title {
  color: rgb(var(--v-theme-on-surface));
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1.45;
  white-space: break-spaces;
}

.subtitle-info-card__desc {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.78rem;
  line-height: 1.45;
  margin-block-start: 0.35rem;
  white-space: break-spaces;
}

.subtitle-info-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-block-start: 0.6rem;
}

.subtitle-info-card__chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), 0.78);
  font-size: 0.75rem;
  font-weight: 500;
  gap: 0.25rem;
  line-height: 1;
  padding: 0.28rem 0.6rem;
}

.subtitle-info-card__uploader {
  color: rgba(var(--v-theme-on-surface), 0.56);
}

.subtitle-advanced-toggle {
  margin-block-start: 8px;
  margin-inline-start: -0.5rem;
}

@media (max-width: 599.98px) {
  .mp-dialog-body {
    padding: 16px !important;
  }
}
</style>
