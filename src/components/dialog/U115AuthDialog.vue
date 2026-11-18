<script lang="ts" setup>
import api from '@/api'
import { useI18n } from '@/composables/useChineseText'
import { useDisplay } from 'vuetify'

// 常量定义
const AUTH_WINDOW_WIDTH = 600
const AUTH_WINDOW_HEIGHT = 700
const POLL_INTERVAL = 2000
const AUTH_STATUS_SUCCESS = 2
const AUTH_STATUS_FAILED = -1

// 显示器宽度
const display = useDisplay()

// 多语言支持
const { t } = useI18n()

// Props 定义
const props = defineProps({
  conf: {
    type: Object as PropType<{ [key: string]: any }>,
    required: true,
  },
})

// Events 定义
const emit = defineEmits(['done', 'close'])

// 响应式状态
const authUrl = ref('')
const authState = ref('')
const text = ref('')
const alertType = ref<'success' | 'info' | 'error' | 'warning'>('info')
const resetting = ref(false)

// 授权窗口引用与生命周期销毁标志
let authWindow: Window | null = null
let pollTimer: NodeJS.Timeout | undefined
let disposed = false

// 清理资源
function cleanup() {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = undefined
  }
  if (authWindow && !authWindow.closed) {
    authWindow.close()
    authWindow = null
  }
}

// 设置提示消息
function setMessage(type: typeof alertType.value, message: string) {
  alertType.value = type
  text.value = message
}

// 完成授权
function handleDone() {
  disposed = true
  cleanup()
  emit('done')
}

// 关闭弹窗并终止后台轮询
function handleClose() {
  disposed = true
  cleanup()
  emit('close')
}

// 重置配置
async function handleReset() {
  if (resetting.value) return
  resetting.value = true
  try {
    const result: { [key: string]: any } = await api.get('/storage/reset/u115')
    if (disposed) return
    if (result?.success) {
      if (props.conf && typeof props.conf === 'object') {
        Object.keys(props.conf).forEach(key => Reflect.deleteProperty(props.conf, key))
      }
      setMessage('success', t('dialog.u115Auth.authSuccess'))
      handleDone()
    } else {
      setMessage('error', result?.message || t('dialog.u115Auth.authFailed'))
    }
  } catch (error) {
    if (disposed) return
    console.error('Reset failed:', error)
    setMessage('error', t('dialog.u115Auth.authFailed'))
  } finally {
    if (!disposed) resetting.value = false
  }
}

// 获取授权URL
async function fetchAuthUrl() {
  try {
    const result: { [key: string]: any } = await api.get('/storage/auth_url/u115')
    if (disposed) return

    if (result?.success && result.data) {
      authUrl.value = result.data.authUrl
      authState.value = result.data.state
    } else {
      setMessage('error', result?.message || t('dialog.u115Auth.urlFetchFailed'))
    }
  } catch (error) {
    if (disposed) return
    console.error('Fetch auth URL failed:', error)
    setMessage('error', t('dialog.u115Auth.urlFetchFailed'))
  }
}

// 打开授权窗口
function openAuthWindow() {
  if (disposed) return
  if (!authUrl.value) {
    setMessage('error', t('dialog.u115Auth.urlEmpty'))
    return
  }

  cleanup()
  const left = (window.screen.width - AUTH_WINDOW_WIDTH) / 2
  const top = (window.screen.height - AUTH_WINDOW_HEIGHT) / 2
  const features = [
    `width=${AUTH_WINDOW_WIDTH}`,
    `height=${AUTH_WINDOW_HEIGHT}`,
    `left=${left}`,
    `top=${top}`,
    'toolbar=no',
    'location=no',
    'status=no',
    'menubar=no',
    'scrollbars=yes',
    'resizable=yes',
  ].join(',')

  authWindow = window.open(authUrl.value, '115授权', features)

  if (authWindow) {
    setMessage('info', t('dialog.u115Auth.authorizing'))
    pollTimer = setTimeout(checkAuthStatus, POLL_INTERVAL)
  } else {
    setMessage('error', t('dialog.u115Auth.popupBlocked'))
  }
}

// 检查授权状态
async function checkAuthStatus() {
  if (disposed) return
  try {
    const result: { [key: string]: any } = await api.get('/storage/check/u115')
    if (disposed) return

    if (result?.success && result.data) {
      const { status, tip } = result.data

      if (status === AUTH_STATUS_SUCCESS) {
        // 授权成功
        setMessage('success', t('dialog.u115Auth.authSuccess'))
        handleDone()
        return
      }

      if (status === AUTH_STATUS_FAILED) {
        // 授权失败或过期
        setMessage('error', tip || t('dialog.u115Auth.authFailed'))
        cleanup()
        return
      }

      // status === 0 或 1，继续等待
    }
  } catch (error) {
    if (disposed) return
    console.error('Check auth status failed:', error)
  }

  if (disposed) return

  // 检查窗口是否被用户关闭
  if (authWindow?.closed) {
    setMessage('warning', t('dialog.u115Auth.authCanceled'))
    cleanup()
    return
  }

  // 继续轮询
  pollTimer = setTimeout(checkAuthStatus, POLL_INTERVAL)
}

// 生命周期钩子
onMounted(() => {
  disposed = false
  fetchAuthUrl()
})

onUnmounted(() => {
  disposed = true
  cleanup()
})
</script>

<template>
  <VDialog
    max-width="30rem"
    scrollable
    :fullscreen="!display.mdAndUp.value"
    @update:model-value="val => !val && handleClose()"
  >
    <VCard class="mp-dialog-card">
      <VCardItem class="mp-dialog-header">
        <template #prepend>
          <VIcon icon="mdi-shield-key" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>
          {{ t('dialog.u115Auth.loginTitle') }}
        </VCardTitle>
      </VCardItem>
      <VDialogCloseBtn :disabled="resetting" @click="handleClose" />

      <VDivider />

      <VCardText class="mp-dialog-body">
        <div class="u115-auth-guide">
          <div class="u115-auth-guide__icon">
            <VIcon icon="mdi-open-in-new" size="24" color="primary" />
          </div>
          <VBtn
            color="primary"
            variant="flat"
            size="default"
            prepend-icon="mdi-login"
            :disabled="!authUrl || resetting"
            class="px-5"
            @click="openAuthWindow"
          >
            {{ t('dialog.u115Auth.openAuthWindow') }}
          </VBtn>
        </div>

        <!-- 状态提示 -->
        <VAlert v-if="text" variant="tonal" density="compact" :type="alertType" :text="text" class="mt-3 text-center">
          <template #prepend />
        </VAlert>
      </VCardText>

      <VDivider />

      <VCardActions class="app-dialog-actions mp-dialog-footer">
        <VBtn
          color="default"
          variant="outlined"
          size="small"
          prepend-icon="mdi-restore"
          :loading="resetting"
          :disabled="resetting"
          @click="handleReset"
        >
          {{ t('dialog.u115Auth.reset') }}
        </VBtn>

        <VSpacer />

        <VBtn color="default" variant="text" size="small" :disabled="resetting" @click="handleClose">
          {{ t('common.cancel') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
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

.u115-auth-guide {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 10px;
  background: var(--mp-item-bg);
  gap: 14px;
  padding: 22px 16px;
}

.u115-auth-guide__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(var(--v-theme-primary), 0.12);
  block-size: 44px;
  inline-size: 44px;
}
</style>
