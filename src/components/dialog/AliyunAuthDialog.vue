<script lang="ts" setup>
import api from '@/api'
import { useI18n } from '@/composables/useChineseText'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

// 多语言支持
const { t } = useI18n()

// 定义输入
const props = defineProps({
  conf: {
    type: Object as PropType<{ [key: string]: any }>,
    required: true,
  },
})

// 定义事件
const emit = defineEmits(['done', 'close'])

// 二维码内容
const qrCodeUrl = ref('')

// 下方的提示信息
const text = ref(t('dialog.aliyunAuth.scanQrCode'))

// 提醒类型
const alertType = ref<'success' | 'info' | 'error' | 'warning' | undefined>('info')

// 二维码获取/过期状态与重置加载状态
const loadingQr = ref(false)
const qrExpiredOrFailed = ref(false)
const resetting = ref(false)

// timeout 定时器与组件销毁标志
let timeoutTimer: NodeJS.Timeout | undefined = undefined
let disposed = false

function cleanup() {
  if (timeoutTimer) {
    clearTimeout(timeoutTimer)
    timeoutTimer = undefined
  }
}

// 完成
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

// 调用 /storage/qrcode/alipan 生成二维码
async function getQrcode() {
  if (disposed || loadingQr.value) return
  cleanup()
  loadingQr.value = true
  qrExpiredOrFailed.value = false
  alertType.value = 'info'
  text.value = t('dialog.aliyunAuth.scanQrCode')
  try {
    const result: { [key: string]: any } = await api.get('/storage/qrcode/alipan')
    if (disposed) return
    if (result?.success && result.data) {
      qrCodeUrl.value = result.data.codeUrl
      timeoutTimer = setTimeout(checkQrcode, 3000)
    } else {
      alertType.value = 'error'
      text.value = result?.message || t('common.error')
      qrExpiredOrFailed.value = true
    }
  } catch (e) {
    if (disposed) return
    console.error(e)
    alertType.value = 'error'
    text.value = e instanceof Error ? e.message : t('common.error')
    qrExpiredOrFailed.value = true
  } finally {
    if (!disposed) loadingQr.value = false
  }
}

// 调用 /storage/check/alipan 验证二维码
async function checkQrcode() {
  if (disposed) return
  try {
    const result: { [key: string]: any } = await api.get('/storage/check/alipan')
    if (disposed) return
    if (result?.success && result.data) {
      const qrCodeStatus = result.data.status
      text.value = result.data.tip
      if (qrCodeStatus == 'LoginSuccess') {
        // 登录成功
        alertType.value = 'success'
        handleDone()
      } else if (qrCodeStatus == 'WaitLogin' || qrCodeStatus == 'ScanSuccess') {
        // 等待登录扫码成功
        alertType.value = 'info'
        cleanup()
        if (!disposed) {
          timeoutTimer = setTimeout(checkQrcode, 3000)
        }
      } else {
        // 二维码过期
        alertType.value = 'error'
        qrExpiredOrFailed.value = true
        cleanup()
      }
    } else {
      alertType.value = 'error'
      text.value = result?.message || t('common.error')
      qrExpiredOrFailed.value = true
      cleanup()
    }
  } catch (e) {
    if (disposed) return
    console.error(e)
    alertType.value = 'error'
    qrExpiredOrFailed.value = true
    cleanup()
  }
}

// 重置配置
async function handleReset() {
  if (resetting.value) return
  resetting.value = true
  try {
    const result: { [key: string]: any } = await api.get('/storage/reset/alipan')
    if (disposed) return
    if (result?.success) {
      if (props.conf && typeof props.conf === 'object') {
        Object.keys(props.conf).forEach(key => Reflect.deleteProperty(props.conf, key))
      }
      alertType.value = 'success'
      handleDone()
    } else {
      alertType.value = 'error'
      text.value = result?.message || t('common.error')
    }
  } catch (e) {
    if (disposed) return
    console.error(e)
    alertType.value = 'error'
    text.value = e instanceof Error ? e.message : t('common.error')
  } finally {
    if (!disposed) resetting.value = false
  }
}

onMounted(async () => {
  disposed = false
  await getQrcode()
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
          <VIcon icon="mdi-qrcode" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>
          {{ t('dialog.aliyunAuth.loginTitle') }}
        </VCardTitle>
      </VCardItem>
      <VDialogCloseBtn :disabled="resetting" @click="handleClose" />
      <VDivider />
      <VCardText class="mp-dialog-body d-flex flex-column align-center">
        <div class="aliyun-qr-shell">
          <VImg class="mx-auto flex-grow-0" :src="qrCodeUrl" width="184" height="184" :max-width="184">
            <template #placeholder>
              <div class="w-full h-full">
                <VSkeletonLoader class="object-cover aspect-w-1 aspect-h-1" />
              </div>
            </template>
          </VImg>
        </div>
        <VAlert variant="tonal" density="compact" :type="alertType" class="mt-3 w-100 text-center" :text="text">
          <template #prepend />
        </VAlert>
        <VBtn
          v-if="qrExpiredOrFailed"
          color="primary"
          variant="tonal"
          size="small"
          prepend-icon="mdi-refresh"
          :loading="loadingQr"
          class="mt-3"
          @click="getQrcode"
        >
          {{ t('common.refresh') }}
        </VBtn>
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
          {{ t('dialog.aliyunAuth.reset') }}
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

.aliyun-qr-shell {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 10px;
  background: #fff;
}
</style>
