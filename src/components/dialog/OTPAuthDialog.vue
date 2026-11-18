<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import QRCode from 'qrcode'
import { useDisplay } from 'vuetify'
import { useI18n } from '@/composables/useChineseText'
import api from '@/api'
import type { ApiResponse } from '@/api/types'

interface Props {
  modelValue: boolean
  isOtp: boolean
}

const props = defineProps<Props>()

const emit = defineEmits(['update:modelValue', 'update:isOtp', 'verifyPassword'])

const { t } = useI18n()
const display = useDisplay()
const $toast = useToast()

// 内部状态
const show = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

// otp uri
const otpUri = ref('')

// otp secret
const secret = ref('')

// 当前二次验证设置流程中输入的 6 位验证码
const otpPassword = ref('')

// OTP 初始化加载状态
const otpLoading = ref(false)
const verifying = ref(false)
const disabling = ref(false)

// OTP 初始化失败信息
const otpGenerateError = ref('')

// 二维码图片 base64
const qrCodeImage = ref('')

// 二维码信息
const qrCode = ref('')

// 清空当前 OTP 设置流程的临时数据。
function resetOtpSetupState() {
  qrCodeImage.value = ''
  qrCode.value = ''
  otpUri.value = ''
  secret.value = ''
  otpGenerateError.value = ''
}

// 标记 OTP 初始化失败，并向用户显示明确错误。
function setOtpGenerateError(message?: string) {
  const errorMessage = message || t('common.error')
  otpGenerateError.value = t('profile.otpGenerateFailed', { message: errorMessage })
  $toast.error(otpGenerateError.value)
}

// 为当前用户获取 OTP URI 并生成二维码图片。
async function getOtpUri() {
  resetOtpSetupState()
  // 如果已经启用OTP，只打开对话框，不生成新的二维码
  if (props.isOtp) {
    return
  }

  // 未启用OTP，生成新的二维码
  otpLoading.value = true
  try {
    const result = (await api.post('mfa/otp/generate')) as ApiResponse<{
      uri: string
      secret: string
    }>
    const uri = result.data?.uri?.trim()
    const otpSecret = result.data?.secret?.trim()

    if (result.success && uri) {
      otpUri.value = uri
      secret.value = otpSecret || ''
      qrCode.value = uri
      // 生成二维码图片
      qrCodeImage.value = await QRCode.toDataURL(uri, {
        width: 200,
        margin: 1,
      })
    } else {
      setOtpGenerateError(result.message || 'empty otp uri')
    }
  } catch (error) {
    console.error(error)
    setOtpGenerateError(error instanceof Error ? error.message : String(error))
  } finally {
    otpLoading.value = false
  }
}

// 启用Otp
async function judgeOtpPassword() {
  if (verifying.value) return
  if (!otpPassword.value) {
    $toast.error(t('profile.otpCodeRequired'))
    return
  }
  verifying.value = true
  try {
    const result = (await api.post('mfa/otp/verify', {
      uri: otpUri.value,
      otpPassword: otpPassword.value,
    })) as ApiResponse

    if (result.success) {
      $toast.success(t('profile.otpEnableSuccess'))
      show.value = false
      emit('update:isOtp', true)
    } else {
      $toast.error(t('profile.otpEnableFailed', { message: result.message }))
    }
  } catch (error) {
    console.error(error)
    $toast.error(t('profile.otpEnableFailed', { message: error instanceof Error ? error.message : String(error) }))
  } finally {
    verifying.value = false
  }
}

// 关闭当前用户的二次验证
function disableOtp() {
  if (disabling.value) return
  emit('verifyPassword', {
    title: t('profile.disableTwoFactor'),
    text: t('profile.confirmToDisableOtp'),
    callback: async (password: string) => {
      disabling.value = true
      try {
        const result = (await api.post('mfa/otp/disable', {
          password,
        })) as ApiResponse
        if (result.success) {
          emit('update:isOtp', false)
          $toast.success(t('profile.otpDisableSuccess'))
          show.value = false
        } else {
          $toast.error(t('profile.otpDisableFailed', { message: result.message }))
        }
      } catch (error) {
        console.error(error)
        $toast.error(t('profile.otpDisableFailed', { message: error instanceof Error ? error.message : String(error) }))
      } finally {
        disabling.value = false
      }
    },
  })
}

// 监听弹窗打开，自动获取 URI
watch(
  () => props.modelValue,
  val => {
    if (val) {
      getOtpUri()
      otpPassword.value = ''
    } else {
      // 弹窗关闭时，清空数据
      resetOtpSetupState()
      otpLoading.value = false
      verifying.value = false
      disabling.value = false
      otpPassword.value = ''
    }
  },
  { immediate: true },
)
</script>

<template>
  <VDialog v-model="show" max-width="34rem" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard class="mp-dialog-card">
      <VCardItem class="mp-dialog-header">
        <template #prepend>
          <VIcon icon="mdi-cellphone-key" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>
          {{ props.isOtp && !qrCode ? t('profile.authenticatorManagement') : t('profile.setupAuthenticator') }}
        </VCardTitle>
      </VCardItem>
      <VDialogCloseBtn :disabled="verifying || disabling" @click="show = false" />
      <VDivider />
      <VCardText class="mp-dialog-body otp-dialog-body">
        <p class="otp-intro">
          {{ t('profile.authenticatorAppDescription') }}
        </p>
        <!-- 如果已启用OTP，显示清除界面 -->
        <template v-if="props.isOtp && !qrCode">
          <VAlert type="success" variant="tonal" density="compact">
            {{ t('profile.authenticatorEnabled') }}
          </VAlert>
          <p class="otp-tip">
            {{ t('profile.clearAuthenticatorTip') }}
          </p>
        </template>

        <!-- 设置新的OTP -->
        <template v-else>
          <div class="otp-qrcode-shell">
            <img
              v-if="qrCodeImage"
              class="mx-auto d-block otp-qrcode-image"
              :src="qrCodeImage"
              :alt="t('profile.setupAuthenticator')"
              width="184"
              height="184"
            />
            <VProgressCircular v-else-if="otpLoading" indeterminate color="primary" />
            <div v-else class="w-100 text-center">
              <VAlert type="error" variant="tonal" density="compact" class="mb-3">
                {{ otpGenerateError || t('profile.otpGenerateFailed', { message: t('common.error') }) }}
              </VAlert>
              <VBtn size="small" variant="tonal" prepend-icon="mdi-refresh" @click="getOtpUri">
                {{ t('common.retry') }}
              </VBtn>
            </div>
          </div>
          <VAlert
            v-if="secret"
            :title="secret"
            variant="tonal"
            density="compact"
            type="warning"
            :text="t('profile.secretKeyTip')"
          >
            <template #prepend />
          </VAlert>
          <VForm @submit.prevent="judgeOtpPassword">
            <VTextField
              v-model="otpPassword"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              :label="t('profile.enterVerificationCode')"
              variant="outlined"
              density="compact"
              hide-details
              prepend-inner-icon="mdi-shield-key"
            />
          </VForm>
        </template>
      </VCardText>
      <VDivider />
      <VCardActions class="app-dialog-actions mp-dialog-footer">
        <VSpacer />
        <VBtn color="default" variant="text" size="small" :disabled="verifying || disabling" @click="show = false">
          {{ t('common.cancel') }}
        </VBtn>
        <VBtn
          v-if="props.isOtp && !qrCode"
          color="error"
          variant="flat"
          size="small"
          class="px-4"
          :loading="disabling"
          :disabled="disabling"
          @click="disableOtp"
        >
          <template #prepend>
            <VIcon icon="mdi-delete" />
          </template>
          {{ t('profile.clearAuthenticator') }}
        </VBtn>
        <VBtn
          v-else
          color="primary"
          variant="flat"
          size="small"
          class="px-4"
          :loading="verifying"
          :disabled="!otpUri || otpLoading || verifying"
          @click="judgeOtpPassword"
        >
          <template #prepend>
            <VIcon icon="mdi-check" />
          </template>
          {{ t('common.confirm') }}
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

.otp-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.otp-intro,
.otp-tip {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 0.84rem;
  line-height: 1.5;
}

.otp-qrcode-shell {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 10px;
  background: var(--mp-item-bg);
  block-size: 206px;
  inline-size: 206px;
  margin-inline: auto;
}

.otp-qrcode-image {
  border-radius: 6px;
  block-size: 184px;
  inline-size: 184px;
}
</style>
