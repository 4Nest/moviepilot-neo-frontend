<script lang="ts" setup>
import { cloneDeep } from 'lodash-es'
import { useToast } from 'vue-toastification'
import api from '@/api'
import { useI18n } from '@/composables/useChineseText'
import { useDisplay } from 'vuetify'
import { configureAceEditorPadding } from '@/utils/aceEditor'

// 显示器宽度
const display = useDisplay()

// 多语言支持
const { t } = useI18n()
const $toast = useToast()

type RcloneConfMap = Record<string, string | undefined>

interface StorageApiResult {
  success?: boolean
  message?: string
}

// 定义输入
const props = defineProps({
  conf: {
    type: Object as PropType<RcloneConfMap>,
    required: true,
  },
})

// 定义事件
const emit = defineEmits(['done', 'close'])

// 本地配置草稿，避免打开或取消编辑污染父组件 props.conf
function createInitialConf(source?: RcloneConfMap): RcloneConfMap {
  const draft = cloneDeep(source || {})
  if (!draft.filepath) {
    draft.filepath = '/moviepilot/.config/rclone/rclone.conf'
  }
  if (!draft.content) {
    draft.content = t('dialog.rcloneConfig.defaultContent')
  }
  return draft
}

const localConf = ref<RcloneConfMap>(createInitialConf(props.conf))
const saving = ref(false)
const resetting = ref(false)

function syncParentConf(nextConf: RcloneConfMap) {
  Object.keys(props.conf).forEach(key => {
    Reflect.deleteProperty(props.conf, key)
  })
  Object.assign(props.conf, cloneDeep(nextConf))
}

// 保存 rclone 设置
async function saveRcloneConfig(): Promise<boolean> {
  saving.value = true
  try {
    const payload = cloneDeep(localConf.value)
    const result: StorageApiResult = await api.post('storage/save/rclone', payload)
    if (result?.success) {
      syncParentConf(payload)
      $toast.success(t('setting.directory.storageSaveSuccess'))
      return true
    }
    $toast.error(result?.message || t('setting.directory.storageSaveFailed'))
    return false
  } catch (e) {
    console.error(e)
    $toast.error(e instanceof Error ? e.message : t('setting.directory.storageSaveFailed'))
    return false
  } finally {
    saving.value = false
  }
}

// 完成
async function handleDone() {
  if (saving.value || resetting.value) return
  const saved = await saveRcloneConfig()
  if (saved) {
    emit('done')
  }
}

// 重置配置
async function handleReset() {
  if (saving.value || resetting.value) return
  resetting.value = true
  try {
    const result: StorageApiResult = await api.get('/storage/reset/rclone')
    if (result?.success) {
      localConf.value = createInitialConf({})
      syncParentConf({})
      $toast.success(t('common.success'))
      emit('done')
    } else {
      $toast.error(result?.message || t('common.error'))
    }
  } catch (e) {
    console.error(e)
    $toast.error(e instanceof Error ? e.message : t('common.error'))
  } finally {
    resetting.value = false
  }
}
</script>

<template>
  <VDialog width="50rem" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard class="mp-dialog-card">
      <VDialogCloseBtn :disabled="saving || resetting" @click="emit('close')" />
      <VCardItem class="mp-dialog-header">
        <template #prepend>
          <VIcon icon="mdi-cog-outline" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>
          {{ t('dialog.rcloneConfig.title') }}
        </VCardTitle>
      </VCardItem>
      <VDivider />
      <VCardText class="mp-dialog-body">
        <VRow class="mp-form-grid">
          <VCol cols="12">
            <VTextField
              v-model="localConf.filepath"
              :label="t('dialog.rcloneConfig.filePath')"
              hide-details="auto"
              prepend-inner-icon="mdi-file-document"
            />
          </VCol>
          <VCol cols="12">
            <div class="mp-editor-shell">
              <VAceEditor
                v-model:value="localConf.content"
                lang="ini"
                theme="monokai"
                class="h-full min-h-[28rem]"
                @init="configureAceEditorPadding"
              />
            </div>
          </VCol>
        </VRow>
      </VCardText>
      <VDivider />
      <VCardActions class="app-dialog-actions mp-dialog-footer">
        <VBtn
          color="default"
          variant="outlined"
          size="small"
          prepend-icon="mdi-restore"
          :loading="resetting"
          :disabled="saving || resetting"
          @click="handleReset"
        >
          {{ t('dialog.rcloneConfig.reset') }}
        </VBtn>
        <VSpacer />
        <VBtn color="default" variant="text" size="small" :disabled="saving || resetting" @click="emit('close')">
          {{ t('common.cancel') }}
        </VBtn>
        <VBtn
          color="primary"
          variant="flat"
          size="small"
          class="px-4"
          :loading="saving"
          :disabled="saving || resetting"
          @click="handleDone"
        >
          {{ t('dialog.rcloneConfig.complete') }}
        </VBtn>
      </VCardActions>
    </VCard>
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

.mp-form-grid {
  row-gap: 8px;
}

.mp-editor-shell {
  overflow: hidden;
  border: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.12));
  border-radius: 10px;
}

@media (max-width: 599.98px) {
  .mp-dialog-body {
    padding: 16px !important;
  }
}
</style>
