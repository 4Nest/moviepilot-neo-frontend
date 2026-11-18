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

type AlistConfMap = Record<string, string | undefined>

interface StorageApiResult {
  success?: boolean
  message?: string
}

// 定义输入
const props = defineProps({
  conf: {
    type: Object as PropType<AlistConfMap>,
    required: true,
  },
  type: {
    type: String,
    default: 'alist',
  },
})

// 定义事件
const emit = defineEmits(['done', 'close'])

// 本地配置草稿，避免取消编辑污染父组件 props.conf
const localConf = ref<AlistConfMap>(cloneDeep(props.conf || {}))
const saving = ref(false)
const resetting = ref(false)

// 登录类型
const loginType = ref(localConf.value.token ? 'token' : localConf.value.username ? 'username' : 'guest')

// 数据源
const sourceItems = [
  {
    title: t('dialog.alistConfig.loginTypeOptions.username'),
    value: 'username',
  },
  { title: t('dialog.alistConfig.loginTypeOptions.token'), value: 'token' },
  { title: t('dialog.alistConfig.loginTypeOptions.guest'), value: 'guest' },
]

// 同步保存或重置后的配置回父对象
function syncParentConf(nextConf: AlistConfMap) {
  Object.keys(props.conf).forEach(key => {
    Reflect.deleteProperty(props.conf, key)
  })
  Object.assign(props.conf, cloneDeep(nextConf))
}

// 按登录方式构造干净的配置负载，清理无关认证字段
function buildCleanConf() {
  const payload = cloneDeep(localConf.value)
  if (loginType.value === 'token') {
    delete payload.username
    delete payload.password
  } else if (loginType.value === 'username') {
    delete payload.token
  } else {
    delete payload.token
    delete payload.username
    delete payload.password
  }
  return payload
}

// 保存 alist 设置
async function saveAlistConfig(): Promise<boolean> {
  saving.value = true
  try {
    const payload = buildCleanConf()
    const result: StorageApiResult = await api.post(`storage/save/${props.type}`, payload)
    if (result?.success) {
      localConf.value = cloneDeep(payload)
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
  const saved = await saveAlistConfig()
  if (saved) {
    emit('done')
  }
}

// 重置配置
async function handleReset() {
  if (saving.value || resetting.value) return
  resetting.value = true
  try {
    const result: StorageApiResult = await api.get(`/storage/reset/${props.type}`)
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
          <VIcon icon="mdi-cog-outline" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>
          {{ t(`dialog.${props.type}Config.title`) }}
        </VCardTitle>
      </VCardItem>
      <VDivider />
      <VCardText class="mp-dialog-body">
        <VRow class="mp-form-grid">
          <VCol cols="12">
            <VTextField
              v-model="localConf.url"
              :label="t(`dialog.${props.type}Config.serverUrl`)"
              prepend-inner-icon="mdi-server"
            />
          </VCol>
          <VCol cols="12" :sm="loginType == 'token' ? 6 : 12">
            <VSelect
              v-model="loginType"
              :items="sourceItems"
              :label="t('dialog.alistConfig.loginType')"
              prepend-inner-icon="mdi-login"
            />
          </VCol>
          <VCol v-if="loginType == 'token'" cols="12" sm="6">
            <VTextField
              v-model="localConf.token"
              :label="t('dialog.alistConfig.loginTypeOptions.token')"
              prepend-inner-icon="mdi-key"
            />
          </VCol>
          <template v-if="loginType == 'username'">
            <VCol cols="12" sm="6">
              <VTextField
                v-model="localConf.username"
                :label="t('dialog.alistConfig.username')"
                prepend-inner-icon="mdi-account"
              />
            </VCol>
            <VCol cols="12" sm="6">
              <VTextField
                type="password"
                v-model="localConf.password"
                :label="t('dialog.alistConfig.password')"
                prepend-inner-icon="mdi-lock"
              />
            </VCol>
          </template>
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
          {{ t('dialog.alistConfig.reset') }}
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
          {{ t('dialog.alistConfig.complete') }}
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
