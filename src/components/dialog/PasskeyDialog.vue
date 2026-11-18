<script lang="ts" setup>
import { bufferToBase64Url, base64UrlToUint8Array } from '@/@core/utils/navigator'
import { useToast } from 'vue-toastification'
import { useDisplay } from 'vuetify'
import { useI18n } from '@/composables/useChineseText'
import { formatDateDifference } from '@core/utils/formatters'
import api from '@/api'
import type { ApiResponse, PassKey } from '@/api/types'

interface Props {
  modelValue: boolean
}

// WebAuthn 相关接口定义
interface PublicKeyCredentialDescriptorJSON {
  id: string
  type: 'public-key'
  transports?: AuthenticatorTransport[]
}

const props = defineProps<Props>()

const emit = defineEmits(['update:modelValue', 'update:passkeyList', 'verifyPassword'])

const { t } = useI18n()
const display = useDisplay()
const $toast = useToast()

// 内部状态
const show = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

// PassKey列表
const passkeyList = ref<PassKey[]>([])

// PassKey注册loading
const passkeyRegistering = ref(false)

// PassKey名称
const passkeyName = ref('')

const passkeyTransactionToken = ref('')

// 拆分包含 {domain} 占位符的域名安全警告文案，兼容无状态中文翻译器并加粗关键词
const domainWarningParts = computed(() => {
  const raw = t('profile.passkeyDomainWarning')
  const marker = '{domain}'
  const idx = raw.indexOf(marker)
  if (idx === -1) {
    return { prefix: raw, domain: '', suffix: '' }
  }
  return {
    prefix: raw.slice(0, idx),
    domain: t('profile.accessDomain'),
    suffix: raw.slice(idx + marker.length),
  }
})

// 判断当前主机名是否为裸 IPv4 / IPv6 地址（WebAuthn 规范禁止裸 IP 作为 RP ID）
function isIpHostname(hostname: string): boolean {
  if (!hostname) return false
  const cleaned = hostname.replace(/^\[|\]$/g, '')
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(cleaned)) return true
  return cleaned.includes(':')
}

// 当前浏览器环境不可用原因提示
const environmentError = computed(() => {
  if (typeof window === 'undefined') return ''
  if (isIpHostname(window.location.hostname)) {
    return t('profile.passkeyIpNotSupported')
  }
  if (!window.isSecureContext) {
    return t('login.passkeySecureContextRequired')
  }
  if (!window.PublicKeyCredential) {
    return t('login.passkeyNotSupported')
  }
  return ''
})

// 格式化日期
function formatDate(dateStr?: string | null) {
  if (!dateStr) return '-'
  const parsed = new Date(dateStr)
  return Number.isNaN(parsed.getTime()) ? dateStr : parsed.toLocaleDateString('zh-CN')
}

// 获取PassKey列表
async function fetchPassKeyList() {
  try {
    const result = (await api.get('mfa/passkey/list')) as ApiResponse<PassKey[]>
    if (result.success) {
      passkeyList.value = result.data || []
      emit('update:passkeyList', passkeyList.value)
    }
  } catch (error) {
    console.error(error)
  }
}

// 注册PassKey
async function registerPassKey() {
  const trimmedName = passkeyName.value.trim()
  if (!trimmedName) {
    $toast.error(t('profile.passkeyNameRequired'))
    return
  }

  // 检查浏览器环境
  if (environmentError.value) {
    $toast.error(environmentError.value)
    return
  }

  passkeyRegistering.value = true
  try {
    // 1. 开始注册
    const startResult = (await api.post('mfa/passkey/register/start', {
      name: trimmedName,
    })) as ApiResponse<{ options: string; transaction_token: string }>

    if (!startResult.success) {
      $toast.error(startResult.message || t('profile.passkeyRegisterFailed'))
      return
    }

    const { options, transaction_token: transactionToken } = startResult.data
    const publicKeyOptions = JSON.parse(options)
    passkeyTransactionToken.value = transactionToken

    // 2. 调用WebAuthn API
    const credential = (await navigator.credentials.create({
      publicKey: {
        ...publicKeyOptions,
        challenge: base64UrlToUint8Array(publicKeyOptions.challenge),
        user: {
          ...publicKeyOptions.user,
          id: base64UrlToUint8Array(publicKeyOptions.user.id),
        },
        excludeCredentials: publicKeyOptions.excludeCredentials?.map((cred: PublicKeyCredentialDescriptorJSON) => ({
          ...cred,
          id: base64UrlToUint8Array(cred.id),
        })),
      },
    })) as PublicKeyCredential

    if (!credential) {
      $toast.error(t('profile.passkeyRegisterCancelled'))
      return
    }

    // 3. 转换credential为可传输格式
    const response = credential.response as AuthenticatorAttestationResponse
    const credentialJSON = {
      id: credential.id,
      rawId: bufferToBase64Url(credential.rawId),
      type: credential.type,
      response: {
        attestationObject: bufferToBase64Url(response.attestationObject),
        clientDataJSON: bufferToBase64Url(response.clientDataJSON),
        transports: typeof response.getTransports === 'function' ? response.getTransports() : [],
      },
    }

    // 4. 完成注册
    const finishResult = (await api.post('mfa/passkey/register/finish', {
      credential: credentialJSON,
      transaction_token: passkeyTransactionToken.value,
      name: trimmedName,
    })) as ApiResponse

    if (finishResult.success) {
      $toast.success(t('profile.passkeyRegisterSuccess'))
      passkeyName.value = ''
      await fetchPassKeyList()
    } else {
      $toast.error(finishResult.message || t('profile.passkeyRegisterFailed'))
    }
  } catch (error: unknown) {
    console.error('PassKey注册失败:', error)
    const errObj = error as {
      name?: string
      message?: string
      response?: { data?: { message?: string; detail?: string } }
    }
    if (errObj?.name === 'NotAllowedError') {
      $toast.error(t('profile.passkeyRegisterCancelled'))
    } else if (errObj?.name === 'InvalidStateError') {
      $toast.error(t('profile.passkeyAlreadyRegistered'))
    } else if (errObj?.name === 'SecurityError') {
      $toast.error(t('profile.passkeyDomainMismatch'))
    } else if (errObj?.name === 'NotSupportedError') {
      $toast.error(t('login.passkeyNotSupported'))
    } else if (errObj?.message?.includes('start failed')) {
      $toast.error(t('login.passkeyLoginStartFailed'))
    } else if (errObj?.response) {
      $toast.error(errObj.response.data?.message || errObj.response.data?.detail || t('profile.passkeyRegisterFailed'))
    } else {
      $toast.error(errObj?.message || t('profile.passkeyRegisterFailed'))
    }
  } finally {
    passkeyRegistering.value = false
  }
}

// 删除PassKey
async function deletePassKey(passkeyId: number) {
  emit('verifyPassword', {
    title: t('profile.deletePasskey'),
    text: t('profile.confirmToDeletePasskey'),
    callback: async (password: string) => {
      try {
        const result = (await api.post('mfa/passkey/delete', {
          passkey_id: passkeyId,
          password,
        })) as ApiResponse
        if (result.success) {
          $toast.success(t('profile.passkeyDeleteSuccess'))
          await fetchPassKeyList()
        } else {
          $toast.error(result.message || t('profile.passkeyDeleteFailed'))
        }
      } catch (error) {
        console.error(error)
        $toast.error(t('profile.passkeyDeleteFailed'))
      }
    },
  })
}

// 监听弹窗打开，自动加载列表
watch(
  () => props.modelValue,
  val => {
    if (val) {
      fetchPassKeyList()
      passkeyName.value = ''
    } else {
      // 弹窗关闭时，清空数据
      passkeyName.value = ''
      passkeyTransactionToken.value = ''
      passkeyList.value = []
    }
  },
  { immediate: true },
)
</script>

<template>
  <VDialog v-model="show" max-width="40rem" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard class="mp-dialog-card">
      <VCardItem class="mp-dialog-header">
        <template #prepend>
          <VIcon icon="material-symbols:passkey" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>
          {{ t('profile.passkeyManagement') }}
        </VCardTitle>
      </VCardItem>
      <VDialogCloseBtn @click="show = false" />
      <VDivider />
      <VCardText class="mp-dialog-body passkey-body">
        <p class="passkey-intro">
          {{ t('profile.passkeyAppDescription') }}
        </p>

        <!-- 安全警告 -->
        <VAlert type="warning" variant="tonal" density="compact" icon="mdi-alert" class="passkey-alert">
          <span>
            {{ domainWarningParts.prefix }}<b v-if="domainWarningParts.domain">{{ domainWarningParts.domain }}</b
            >{{ domainWarningParts.suffix }}
          </span>
        </VAlert>

        <!-- 当前访问环境不支持时的明确告警 -->
        <VAlert
          v-if="environmentError"
          type="error"
          variant="tonal"
          density="compact"
          icon="mdi-shield-alert-outline"
          class="passkey-alert"
        >
          {{ environmentError }}
        </VAlert>

        <!-- 注册新通行密钥 -->
        <div class="passkey-panel">
          <h5 class="passkey-panel__title">{{ t('profile.registerNewPasskey') }}</h5>
          <p class="passkey-panel__desc">{{ t('profile.passkeyDescription') }}</p>
          <VForm class="passkey-form" @submit.prevent="registerPassKey">
            <VTextField
              v-model="passkeyName"
              :label="t('profile.passkeyName')"
              :placeholder="t('profile.passkeyNamePlaceholder')"
              variant="outlined"
              density="compact"
              hide-details
              prepend-inner-icon="mdi-form-textbox"
            />
            <div>
              <VBtn
                color="primary"
                variant="flat"
                size="small"
                type="submit"
                :loading="passkeyRegistering"
                prepend-icon="mdi-plus"
                class="px-4"
              >
                {{ t('profile.registerPasskey') }}
              </VBtn>
            </div>
          </VForm>
        </div>

        <!-- 已注册的通行密钥列表 -->
        <div v-if="passkeyList.length > 0" class="passkey-list">
          <div v-for="passkey in passkeyList" :key="passkey.id" class="passkey-row">
            <div class="min-w-0">
              <div class="passkey-row__name text-truncate">{{ passkey.name }}</div>
              <div class="text-caption text-medium-emphasis d-flex flex-wrap gap-x-3">
                <span>{{ t('profile.createdAt') }} {{ formatDate(passkey.created_at) }}</span>
                <span v-if="passkey.last_used_at">
                  {{ t('profile.lastUsedAt') }} {{ formatDateDifference(passkey.last_used_at) }}
                </span>
              </div>
            </div>
            <VBtn
              variant="tonal"
              color="error"
              size="small"
              icon="mdi-trash-can-outline"
              :aria-label="t('profile.deletePasskey')"
              @click="deletePassKey(passkey.id)"
            />
          </div>
        </div>
        <VAlert v-else type="info" variant="tonal" density="compact" class="passkey-alert">
          {{ t('profile.noPasskeys') }}
        </VAlert>
      </VCardText>
      <VDivider />
      <VCardActions class="app-dialog-actions mp-dialog-footer">
        <VSpacer />
        <VBtn color="default" variant="tonal" size="small" class="px-4" @click="show = false">
          {{ t('common.close') }}
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

.passkey-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.passkey-intro {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 0.84rem;
  line-height: 1.5;
}

.passkey-alert {
  font-size: 0.8125rem;
}

.passkey-panel {
  border: 1px solid var(--mp-border-subtle);
  border-radius: 10px;
  background: var(--mp-item-bg);
  padding: 14px 16px;
}

.passkey-panel__title {
  margin: 0 0 4px;
  color: rgba(var(--v-theme-on-surface), 0.92);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}

.passkey-panel__desc {
  margin: 0 0 12px;
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 0.8125rem;
  line-height: 1.45;
}

.passkey-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.passkey-list {
  overflow: hidden;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 10px;
  background: var(--mp-item-bg);
}

.passkey-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
}

.passkey-row + .passkey-row {
  border-block-start: 1px solid var(--mp-border-subtle);
}

.passkey-row__name {
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.4;
  margin-block-end: 2px;
}

@media (max-width: 599.98px) {
  .mp-dialog-body {
    padding: 16px !important;
  }
}
</style>
