<script lang="ts" setup>
import { cloneDeep } from 'lodash-es'
import { useToast } from 'vue-toastification'
import api from '@/api'
import { useI18n } from '@/composables/useChineseText'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

// 多语言支持
const { t } = useI18n()
const $toast = useToast()

type SmbConfMap = Record<string, string | undefined>

interface StorageApiResult {
  success?: boolean
  message?: string
}

// 定义输入
const props = defineProps({
  conf: {
    type: Object as PropType<SmbConfMap>,
    required: true,
  },
})

// 定义事件
const emit = defineEmits(['done', 'close'])

// 本地配置草稿，避免取消编辑污染父组件 props.conf
const localConf = ref<SmbConfMap>(cloneDeep(props.conf || {}))
const saving = ref(false)
const resetting = ref(false)

function syncParentConf(nextConf: SmbConfMap) {
  Object.keys(props.conf).forEach(key => {
    Reflect.deleteProperty(props.conf, key)
  })
  Object.assign(props.conf, cloneDeep(nextConf))
}

// 保存 SMB 设置
async function saveSmbConfig(): Promise<boolean> {
  saving.value = true
  try {
    const payload = cloneDeep(localConf.value)
    const result: StorageApiResult = await api.post('storage/save/smb', payload)
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
  const saved = await saveSmbConfig()
  if (saved) {
    emit('done')
  }
}

// 重置配置
async function handleReset() {
  if (saving.value || resetting.value) return
  resetting.value = true
  try {
    const result: StorageApiResult = await api.get('/storage/reset/smb')
    if (result?.success) {
      localConf.value = {}
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
  <VDialog max-width="44rem" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard class="mp-dialog-card">
      <VDialogCloseBtn :disabled="saving || resetting" @click="emit('close')" />
      <VCardItem class="mp-dialog-header">
        <template #prepend>
          <VIcon icon="mdi-folder-network-outline" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>
          {{ t('dialog.smbConfig.title') }}
        </VCardTitle>
      </VCardItem>
      <VDivider />
      <VCardText class="mp-dialog-body">
        <VRow class="mp-form-grid">
          <VCol cols="12" sm="6">
            <VTextField
              v-model="localConf.host"
              :hint="t('dialog.smbConfig.hostHint')"
              :label="t('dialog.smbConfig.host')"
              prepend-inner-icon="mdi-server"
              placeholder="192.168.1.100"
            />
          </VCol>
          <VCol cols="12" sm="6">
            <VTextField
              v-model="localConf.share"
              :hint="t('dialog.smbConfig.shareHint')"
              :label="t('dialog.smbConfig.share')"
              prepend-inner-icon="mdi-folder-network"
              placeholder="shared_folder"
            />
          </VCol>
          <VCol cols="12" sm="6">
            <VTextField
              v-model="localConf.username"
              :hint="t('dialog.smbConfig.usernameHint')"
              :label="t('dialog.smbConfig.username')"
              prepend-inner-icon="mdi-account"
              placeholder="your_username"
            />
          </VCol>
          <VCol cols="12" sm="6">
            <VTextField
              type="password"
              v-model="localConf.password"
              :hint="t('dialog.smbConfig.passwordHint')"
              :label="t('dialog.smbConfig.password')"
              prepend-inner-icon="mdi-lock"
              placeholder="your_password"
            />
          </VCol>
          <VCol cols="12" sm="6">
            <VTextField
              v-model="localConf.domain"
              :hint="t('dialog.smbConfig.domainHint')"
              :label="t('dialog.smbConfig.domain')"
              prepend-inner-icon="mdi-domain"
              placeholder="WORKGROUP"
            />
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
          {{ t('dialog.smbConfig.reset') }}
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
          {{ t('dialog.smbConfig.complete') }}
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
  row-gap: 6px;
}

@media (max-width: 599.98px) {
  .mp-dialog-body {
    padding: 16px !important;
  }
}
</style>
