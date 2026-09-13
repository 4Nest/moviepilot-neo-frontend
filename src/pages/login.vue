<script setup lang="ts">
import type { AxiosError } from 'axios'
import type { Component } from 'vue'
import { useTheme } from 'vuetify'
import { useAuthStore, useUserStore } from '@/stores'
import { authState, userState } from '@/stores/types'
import api from '@/api'
import router from '@/router'
import LoginMfaStep from '@/components/auth/LoginMfaStep.vue'
import { bufferToBase64Url, base64UrlToUint8Array } from '@/@core/utils/navigator'

import { getNavMenus } from '@/router/i18n-menu'
import { buildUserPermissionContext, filterMenusByPermission } from '@/utils/permission'
import type { ApiResponse } from '@/api/types'
import { loadRemoteComponentFromModule, type RemoteModule } from '@/utils/federationLoader'
import type { MfaMethod } from '@/types/auth'
import { getLoginVisualProfile } from '@/utils/loginPresentation'
import NeoLogoMark from '@/components/misc/NeoLogoMark.vue'

// 国际化
const { t, te } = useI18n()

const { global: loginTheme } = useTheme()
const loginVisualProfile = computed(() => getLoginVisualProfile(loginTheme.name.value))

// 认证 Store
const authStore = useAuthStore()
//用户 Store
const userStore = useUserStore()
// 获取有权限的菜单
const navMenus = computed(() => getNavMenus(t))

// 表单
const form = ref({
  username: '',
  password: '',
  otp_password: '',
  remember: true,
})

const refForm = ref<HTMLFormElement | null>(null)

// 密码输入
const isPasswordVisible = ref(false)

// 错误信息
const errorMessage = ref('')

const mfaStepActive = ref(false)

const mfaOtpLoading = ref(false)

const mfaMethods = ref<MfaMethod[]>([])

// 登录按钮 loading
const loading = ref(false)

// PassKey 登录按钮 loading
const passkeyLoading = ref(false)

// Conditional UI 的 AbortController
let conditionalAbortController: AbortController | null = null

// 手动模式的 AbortController（用于防止重复点击）
let manualAbortController: AbortController | null = null

// 标记当前是否有手动模式的 PassKey 请求正在进行
let isManualPassKeyActive = false

interface LoginAuthProvider {
  id: string
  type: 'system' | 'plugin'
  method?: string
  name: string
  icon?: string
  enabled?: boolean
  plugin_id?: string
  component?: string
  remote?: RemoteModule
}

interface PluginAuthPayload {
  ticket?: string
}

interface ApiErrorPayload {
  message?: unknown
  message_i18n?: unknown
  detail?: unknown
  mfa_methods?: unknown
}

interface SerializedCredentialDescriptor extends Omit<PublicKeyCredentialDescriptor, 'id'> {
  id: string
}

interface SerializedPublicKeyRequestOptions extends Omit<
  PublicKeyCredentialRequestOptions,
  'allowCredentials' | 'challenge'
> {
  allowCredentials?: SerializedCredentialDescriptor[]
  challenge: string
}

function getErrorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined
}

// Axios 请求失败由响应状态和结构化响应体共同决定登录错误语义。
function asApiError(error: unknown): AxiosError<ApiErrorPayload> {
  return error as AxiosError<ApiErrorPayload>
}

// 登录认证提供方
const authProviders = ref<LoginAuthProvider[]>([])
const selectedAuthProvider = ref<LoginAuthProvider | null>(null)
const RemoteAuthView = shallowRef<Component | null>(null)
const pluginAuthDialog = ref(false)
const pluginAuthLoading = ref(false)
const pluginAuthError = ref('')

const systemPasskeyProvider = computed(() =>
  authProviders.value.find(provider => provider.type === 'system' && provider.method === 'passkey'),
)
const pluginAuthProviders = computed(() =>
  authProviders.value.filter(provider => provider.type === 'plugin' && provider.remote && provider.enabled !== false),
)
const showPasskeyLogin = computed(() => !!systemPasskeyProvider.value?.enabled)

// 获取登录表单中的原生账号和密码输入框。
function getLoginCredentialInputs() {
  const root = refForm.value || document

  return {
    username: root.querySelector<HTMLInputElement>('input[name="username"]'),
    password: root.querySelector<HTMLInputElement>('input[name="password"]'),
  }
}

// 将密码管理器写入 DOM 的账号密码同步回响应式表单。
function syncLoginCredentialValues() {
  const { username, password } = getLoginCredentialInputs()

  if (username && username.value !== form.value.username) {
    form.value.username = username.value
  }

  if (password && password.value !== form.value.password) {
    form.value.password = password.value
  }
}

// 只接受服务端明确声明的 MFA 方法，异常响应不得在客户端虚构认证能力。
function normalizeMfaMethods(value: unknown): MfaMethod[] {
  if (!Array.isArray(value)) return []

  return [...new Set(value.filter((method): method is MfaMethod => method === 'otp'))]
}

function enterMfaStep(methodsValue: unknown) {
  conditionalAbortController?.abort()
  conditionalAbortController = null
  mfaMethods.value = normalizeMfaMethods(methodsValue)
  form.value.otp_password = ''
  if (!mfaMethods.value.length) {
    errorMessage.value = t('login.mfa.methodsUnavailable')
    mfaStepActive.value = false
    return
  }

  errorMessage.value = ''
  mfaStepActive.value = true
}

// 用户主动返回账号密码步骤时清理未完成的二次验证。
function leaveMfaStep() {
  manualAbortController?.abort()
  manualAbortController = null
  mfaOtpLoading.value = false
  mfaMethods.value = []
  form.value.otp_password = ''
  errorMessage.value = ''
  mfaStepActive.value = false
}

// 加载未登录可用的认证提供方。
async function loadAuthProviders() {
  try {
    const result = (await api.get('auth/providers')) as LoginAuthProvider[]
    authProviders.value = Array.isArray(result) ? result : []
  } catch (error) {
    console.error('加载认证提供方失败:', error)
    authProviders.value = []
  }
}

// 打开插件认证联邦页面。
async function openPluginAuth(provider: LoginAuthProvider) {
  if (!provider.remote) return
  selectedAuthProvider.value = provider
  RemoteAuthView.value = null
  pluginAuthError.value = ''
  pluginAuthLoading.value = true
  pluginAuthDialog.value = true
  try {
    RemoteAuthView.value = (await loadRemoteComponentFromModule(
      provider.remote,
      provider.component || 'AuthPage',
    )) as Component
  } catch (error: unknown) {
    console.error('加载插件认证页面失败:', error)
    pluginAuthError.value = getErrorMessage(error) || t('login.authFailure')
  } finally {
    pluginAuthLoading.value = false
  }
}

// 关闭插件认证弹窗。
function closePluginAuth() {
  pluginAuthDialog.value = false
  selectedAuthProvider.value = null
  RemoteAuthView.value = null
  pluginAuthError.value = ''
}

// 兑换插件认证票据并完成系统登录。
async function exchangePluginAuthTicket(ticket: string) {
  pluginAuthLoading.value = true
  try {
    const response = (await api.post('auth/exchange', { ticket })) as PassKeyFinishResponse
    closePluginAuth()
    await handleLoginSuccess(response)
  } catch (error: unknown) {
    console.error('插件认证票据兑换失败:', error)
    const apiError = asApiError(error)
    const message = apiError.response?.data?.message || apiError.response?.data?.detail
    pluginAuthError.value =
      (typeof message === 'string' ? message : undefined) || getErrorMessage(error) || t('login.authFailure')
  } finally {
    pluginAuthLoading.value = false
  }
}

// 处理插件认证成功事件。
async function handlePluginAuthenticated(payload: PluginAuthPayload) {
  if (!payload?.ticket) {
    pluginAuthError.value = t('login.authFailure')
    return
  }
  await exchangePluginAuthTicket(payload.ticket)
}

// 处理插件认证失败事件。
function handlePluginAuthError(error: unknown) {
  pluginAuthError.value = getErrorMessage(error) || String(error || '') || t('login.authFailure')
}

// PassKey 认证核心函数 - 处理 WebAuthn 认证流程
interface PassKeyAuthOptions {
  username?: string // 可选用户名，用于限制当前直接登录可选择的凭证
  isConditional?: boolean // 是否为 Conditional UI 模式
  signal?: AbortSignal // AbortController 信号
}

// PassKey API 响应类型
interface PassKeyStartResponse {
  options: string // JSON 字符串
  transaction_token: string
}

interface PassKeyFinishResponse {
  access_token: string
  super_user: boolean
  user_id: number
  user_name: string
  avatar: string
  level: number
  permissions: Record<string, boolean>
  wizard: boolean
}

// 执行 PassKey WebAuthn 认证并返回登录完成信息。
async function authenticateWithPassKey(options: PassKeyAuthOptions = {}): Promise<PassKeyFinishResponse> {
  const { username, isConditional = false, signal } = options

  // 1. 开始认证流程
  const startResponse = (await api.post(
    '/mfa/passkey/authenticate/start',
    username ? { username } : {},
  )) as ApiResponse<PassKeyStartResponse>

  if (!startResponse.success) {
    throw new Error(startResponse.message || 'PassKey start failed')
  }

  const { options: optionsStr, transaction_token: transactionToken } = startResponse.data
  const publicKeyOptions = JSON.parse(optionsStr) as SerializedPublicKeyRequestOptions

  // 2. 调用WebAuthn API
  const credentialRequestOptions: CredentialRequestOptions = {
    publicKey: {
      ...publicKeyOptions,
      challenge: base64UrlToUint8Array(publicKeyOptions.challenge),
      allowCredentials: publicKeyOptions.allowCredentials?.map(cred => ({
        ...cred,
        id: base64UrlToUint8Array(cred.id),
      })),
    },
  }

  // 如果是 Conditional UI 模式，添加 mediation 和 signal
  if (isConditional) {
    credentialRequestOptions.mediation = 'conditional'
    if (signal) {
      credentialRequestOptions.signal = signal
    }
  }

  const credential = await navigator.credentials.get(credentialRequestOptions)

  // Conditional UI 模式下，用户选择通行密钥后才显示 loading
  if (isConditional) {
    passkeyLoading.value = true
  }

  if (!credential) {
    throw new Error('No credential selected')
  }

  // 3. 转换credential为可传输格式
  const publicKeyCredential = credential as PublicKeyCredential
  const assertionResponse = publicKeyCredential.response as AuthenticatorAssertionResponse
  const credentialJSON = {
    id: publicKeyCredential.id,
    rawId: bufferToBase64Url(publicKeyCredential.rawId),
    type: publicKeyCredential.type,
    response: {
      authenticatorData: bufferToBase64Url(assertionResponse.authenticatorData),
      clientDataJSON: bufferToBase64Url(assertionResponse.clientDataJSON),
      signature: bufferToBase64Url(assertionResponse.signature),
      userHandle: assertionResponse.userHandle ? bufferToBase64Url(assertionResponse.userHandle) : null,
    },
  }

  // 4. 完成认证
  const finishResponse = (await api.post('/mfa/passkey/authenticate/finish', {
    credential: credentialJSON,
    transaction_token: transactionToken,
  })) as PassKeyFinishResponse

  if (!finishResponse || !finishResponse.access_token) {
    throw new Error('PassKey finish failed: No access token')
  }

  return finishResponse
}

// 统一处理 PassKey 认证流程
async function handlePassKeyAuth(
  authOptions: PassKeyAuthOptions,
  setLoading: (loading: boolean) => void,
  onSuccess: (response: PassKeyFinishResponse) => Promise<void>,
) {
  const { isConditional = false } = authOptions
  errorMessage.value = ''

  // 检查浏览器环境
  if (!window.PublicKeyCredential) {
    if (!isConditional) {
      if (!window.isSecureContext) {
        errorMessage.value = t('login.passkeySecureContextRequired')
      } else {
        errorMessage.value = t('login.passkeyNotSupported')
      }
    }
    return
  }

  // 如果是手动触发(非 Conditional UI)
  if (!isConditional) {
    // 取消之前的 Conditional UI 请求
    if (conditionalAbortController) {
      conditionalAbortController.abort()
      conditionalAbortController = null
    }

    // 取消之前的手动请求（防止重复点击）
    if (manualAbortController) {
      manualAbortController.abort()
    }

    // 创建新的 AbortController
    manualAbortController = new AbortController()

    // 标记手动请求为活跃状态，并立即设置 loading
    isManualPassKeyActive = true
    setLoading(true)
  }

  try {
    const finishResponse = await authenticateWithPassKey({
      ...authOptions,
      signal:
        isConditional && conditionalAbortController
          ? conditionalAbortController.signal
          : !isConditional && manualAbortController
            ? manualAbortController.signal
            : undefined,
    })

    await onSuccess(finishResponse)
  } catch (error: unknown) {
    const errorName = error instanceof Error ? error.name : ''
    const message = getErrorMessage(error)

    // Conditional UI 模式下：
    // 1. 如果 loading 为 false，说明错误发生在用户选择密钥之前（如初始化失败、用户取消等），此时应静默
    // 2. 如果是 AbortError，始终静默
    if (isConditional && (!passkeyLoading.value || errorName === 'AbortError')) {
      console.warn('[PassKey] Conditional UI silenced error:', error)
      return
    }

    // 手动模式下的 AbortError 也应该静默（用户重复点击导致）
    if (!isConditional && errorName === 'AbortError') {
      console.warn('[PassKey] Manual request aborted (likely due to rapid clicking):', error)
      return
    }

    // 设置错误信息
    if (errorName === 'NotAllowedError') {
      errorMessage.value = t('login.passkeyAuthCanceled')
    } else if (errorName === 'NotSupportedError') {
      errorMessage.value = t('login.passkeyNotSupported')
    } else if (message?.includes('start failed')) {
      errorMessage.value = t('login.passkeyLoginStartFailed')
    } else {
      errorMessage.value = t('login.authFailure')
    }
  } finally {
    // 清除 loading 状态
    if (!isConditional) {
      // 手动模式：始终清除，并取消手动活跃标记
      isManualPassKeyActive = false
      setLoading(false)
      manualAbortController = null
    } else {
      // Conditional UI 模式：只有在没有手动请求活跃时才清除
      if (!isManualPassKeyActive && passkeyLoading.value) {
        passkeyLoading.value = false
      }
    }
  }
}

// 使用PassKey登录 (支持 Conditional UI)
async function loginWithPassKey(isConditional = false) {
  await handlePassKeyAuth(
    { isConditional },
    val => (passkeyLoading.value = val),
    async response => {
      await handleLoginSuccess(response)
    },
  )
}

// 登录后处理
async function afterLogin(
  superuser: boolean,
  userPayload: userState,
  filteredMenus: ReturnType<typeof filterMenusByPermission>,
) {
  const originalPath = authStore.originalPath
  authStore.setOriginalPath(null)

  // 如果需要显示设置向导，跳转到设置向导页面
  if (userPayload.wizard) {
    await router.push('/setup-wizard')
  } else {
    // 原始目标是一次性状态，持久化的旧登录页目标不得重新进入认证流程。
    if (originalPath && originalPath !== '/' && router.resolve(originalPath).path !== '/login') {
      await router.push(originalPath)
    } else {
      // 跳转到第一个有权限的菜单
      await router.push(filteredMenus[0].to)
    }
  }
}

// 处理登录成功
async function handleLoginSuccess(response: PassKeyFinishResponse) {
  const userPayload: userState = {
    superUser: response.super_user,
    userID: response.user_id,
    userName: response.user_name,
    avatar: response.avatar,
    level: response.level,
    permissions: response.permissions,
    wizard: response.wizard,
  }

  const userPermissions = buildUserPermissionContext(userPayload.superUser, userPayload.permissions)

  const filteredMenus = filterMenusByPermission(navMenus.value, userPermissions)
  if (filteredMenus.length === 0) {
    errorMessage.value = t('login.noPermission')
    return
  }

  const authPayLoad: authState = {
    token: response.access_token,
    remember: form.value.remember,
  }

  authStore.login(authPayLoad)
  userStore.loginUser(userPayload)

  await afterLogin(userPayload.superUser, userPayload, filteredMenus)
}

async function requestPasswordLogin(): Promise<PassKeyFinishResponse> {
  const formData = new FormData()
  formData.append('username', form.value.username)
  formData.append('password', form.value.password)
  formData.append('otp_password', form.value.otp_password)

  return (await api.post('/login/access-token', formData, {
    headers: {
      Accept: 'application/json',
    },
  })) as PassKeyFinishResponse
}

function setLoginError(error: unknown) {
  const apiError = asApiError(error)
  if (!apiError.response) {
    errorMessage.value = t('login.networkError')
    return
  }

  const message = apiError.response.data?.message
  if (typeof message === 'string' && message) {
    errorMessage.value = message
    return
  }

  switch (apiError.response.status) {
    case 401:
      errorMessage.value = t('login.authFailure')
      break
    case 403:
      errorMessage.value = t('login.permissionDenied')
      break
    case 500:
      errorMessage.value = t('login.serverError')
      break
    default:
      errorMessage.value = `${t('login.authFailure')} (Status: ${apiError.response.status})`
  }
}

async function login() {
  errorMessage.value = ''
  syncLoginCredentialValues()

  if (!form.value.username || !form.value.password) return

  form.value.otp_password = ''
  loading.value = true
  try {
    const response = await requestPasswordLogin()
    await handleLoginSuccess(response)
  } catch (error: unknown) {
    const apiError = asApiError(error)
    if (apiError.response?.headers?.['x-mfa-required'] === 'true') {
      enterMfaStep(apiError.response.data?.mfa_methods)
      return
    }
    setLoginError(error)
  } finally {
    loading.value = false
  }
}

// 在第二步提交 OTP；失败时保持当前步骤，避免登录表单闪回。
async function loginWithOTP() {
  if (!form.value.otp_password || mfaOtpLoading.value) return

  errorMessage.value = ''
  mfaOtpLoading.value = true
  try {
    const response = await requestPasswordLogin()
    await handleLoginSuccess(response)
  } catch (error: unknown) {
    const apiError = asApiError(error)
    if (!apiError.response) {
      errorMessage.value = t('login.networkError')
    } else if (apiError.response.status === 401) {
      errorMessage.value = t('login.mfa.verificationFailed')
    } else {
      setLoginError(error)
    }
    form.value.otp_password = ''
  } finally {
    mfaOtpLoading.value = false
  }
}

// 自动登录
onMounted(async () => {
  // 获取token和remember状态
  const token = authStore.token
  const remember = authStore.remember

  // 如果token存在，且保持登录状态为true，则跳转到首页
  if (token && remember) {
    router.push('/')
    return
  }

  // 加载系统和插件声明的未登录认证入口
  await loadAuthProviders()

  // 初始化 Conditional UI 的 PassKey 自动填充
  await initConditionalPasskey()
})

// 初始化 Conditional UI 的 PassKey 自动填充
async function initConditionalPasskey() {
  // 检查浏览器是否支持 WebAuthn 和 Conditional UI
  if (!window.PublicKeyCredential || !PublicKeyCredential.isConditionalMediationAvailable) {
    return
  }

  try {
    const available = await PublicKeyCredential.isConditionalMediationAvailable()
    if (!available) {
      return
    }

    // 安全防御：如果已存在 controller，先 abort 掉旧的，防止重复调用产生幽灵请求
    if (conditionalAbortController) {
      conditionalAbortController.abort()
      conditionalAbortController = null
    }

    // 创建 AbortController 用于取消请求
    conditionalAbortController = new AbortController()

    // 启动 Conditional UI 模式的 PassKey 认证
    await loginWithPassKey(true)
  } catch (error) {
    console.error('[PassKey] Failed to initialize Conditional UI:', error)
  }
}

// 组件卸载时清理
onUnmounted(() => {
  if (conditionalAbortController) {
    conditionalAbortController.abort()
    conditionalAbortController = null
  }
  if (manualAbortController) {
    manualAbortController.abort()
    manualAbortController = null
  }
})
</script>

<template>
  <!-- 登录页面容器 -->
  <div class="login-root" :data-login-visual-profile="loginVisualProfile">
    <svg class="login-glass-filter-defs" aria-hidden="true">
      <defs>
        <filter id="login-glass-static-refraction" x="-12%" y="-12%" width="124%" height="124%">
          <feTurbulence type="fractalNoise" baseFrequency="0.008 0.014" numOctaves="2" seed="8" result="noise" />
          <feGaussianBlur in="noise" stdDeviation="0.35" result="softNoise" />
          <feDisplacementMap in="SourceGraphic" in2="softNoise" scale="11" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>

    <!-- 经典主题保留一层低频品牌环境光；透明与玻璃 profile 不挂载该装饰。 -->
    <div v-if="loginVisualProfile === 'classic'" class="login-ambient-light" aria-hidden="true">
      <span class="login-ambient-light__wash" />
    </div>

    <!-- 登录表单 -->
    <div class="auth-wrapper d-flex align-center justify-center">
      <VCard
        class="auth-card login-card glass-effect no-blur pa-6 pa-sm-7 w-full h-full login-card--enter"
        max-width="24rem"
        flat
      >
        <div class="login-card__surface" aria-hidden="true" />

        <!-- NEO 品牌标识 -->
        <div class="login-brand" aria-label="MoviePilot NEO">
          <div class="login-brand__mark-row">
            <NeoLogoMark class="brand-logo-mark login-brand__mark" />
          </div>
          <div class="login-brand__name">
            <span class="login-brand__wordmark">MOVIEPILOT</span>
            <strong class="moviepilot-neo-badge moviepilot-neo-badge--solo">NEO</strong>
          </div>
        </div>

        <VCardText class="login-body">
          <LoginMfaStep
            v-if="mfaStepActive"
            :methods="mfaMethods"
            :otp-password="form.otp_password"
            :otp-loading="mfaOtpLoading"
            :error-message="errorMessage"
            @update:otp-password="form.otp_password = $event"
            @back="leaveMfaStep"
            @otp="loginWithOTP"
          />
          <form
            v-else
            ref="refForm"
            class="login-form"
            method="post"
            action="/login/access-token"
            autocomplete="on"
            @submit.prevent="login"
          >
            <VRow>
              <!-- username -->
              <VCol cols="12">
                <div class="native-login-field login-input">
                  <span class="native-login-field__icon-shell" aria-hidden="true">
                    <VIcon icon="mdi-account-outline" class="native-login-field__icon" />
                  </span>
                  <input
                    id="username"
                    v-model="form.username"
                    class="native-login-field__input"
                    type="text"
                    name="username"
                    autocomplete="username"
                    autocapitalize="none"
                    spellcheck="false"
                    enterkeyhint="next"
                    :placeholder="t('login.username')"
                    :aria-label="t('login.username')"
                    required
                  />
                </div>
              </VCol>
              <!-- password -->
              <VCol cols="12">
                <div class="native-login-field native-login-field--password login-input">
                  <span class="native-login-field__icon-shell" aria-hidden="true">
                    <VIcon icon="mdi-lock-outline" class="native-login-field__icon" />
                  </span>
                  <input
                    id="password"
                    v-model="form.password"
                    class="native-login-field__input"
                    :type="isPasswordVisible ? 'text' : 'password'"
                    name="password"
                    autocomplete="current-password"
                    :placeholder="t('login.password')"
                    :aria-label="t('login.password')"
                    required
                  />
                  <button
                    class="native-login-field__toggle"
                    type="button"
                    :aria-label="isPasswordVisible ? t('login.hidePassword') : t('login.showPassword')"
                    @click="isPasswordVisible = !isPasswordVisible"
                  >
                    <VIcon :icon="isPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'" size="20" />
                  </button>
                </div>
              </VCol>
              <VCol cols="12" class="py-0">
                <!-- remember me checkbox -->
                <label class="login-remember">
                  <input v-model="form.remember" class="login-remember__input" type="checkbox" name="remember" />
                  <span class="login-remember__check" aria-hidden="true">
                    <VIcon icon="mdi-check" size="14" />
                  </span>
                  <span class="login-remember__label">{{ t('login.stayLoggedIn') }}</span>
                </label>
              </VCol>
              <VCol cols="12">
                <!-- login button -->
                <div class="login-submit-row">
                  <VBtn type="submit" :loading="loading" class="login-submit">
                    <span class="login-submit__label">{{ t('login.login') }}</span>
                  </VBtn>
                </div>

                <!-- or divider -->
                <div v-if="showPasskeyLogin || pluginAuthProviders.length > 0" class="or-divider my-5">
                  <span class="or-divider-text">{{ t('login.orDivider') }}</span>
                </div>

                <!-- passkey login button -->
                <VBtn
                  v-if="showPasskeyLogin"
                  block
                  variant="outlined"
                  color="success"
                  class="passkey-btn"
                  prepend-icon="material-symbols:passkey"
                  :loading="passkeyLoading"
                  @click="loginWithPassKey(false)"
                >
                  {{ t('login.loginWithPasskey') }}
                </VBtn>
                <VBtn
                  v-for="provider in pluginAuthProviders"
                  :key="provider.id"
                  block
                  variant="outlined"
                  color="primary"
                  class="mt-3 plugin-auth-btn"
                  :prepend-icon="provider.icon || 'mdi-login-variant'"
                  :loading="pluginAuthLoading && selectedAuthProvider?.id === provider.id"
                  rounded="lg"
                  @click="openPluginAuth(provider)"
                >
                  {{ provider.name }}
                </VBtn>
                <VAlert v-if="errorMessage" type="error" variant="tonal" class="mt-4 login-alert">
                  {{ errorMessage }}
                </VAlert>
              </VCol>
            </VRow>
          </form>
        </VCardText>
      </VCard>
    </div>
    <VDialog v-model="pluginAuthDialog" max-width="520" persistent>
      <VCard class="plugin-auth-card">
        <VCardItem>
          <VCardTitle>{{ selectedAuthProvider?.name }}</VCardTitle>
          <template #append>
            <VBtn icon="mdi-close" variant="text" @click="closePluginAuth" />
          </template>
        </VCardItem>
        <VCardText>
          <VSkeletonLoader v-if="pluginAuthLoading && !RemoteAuthView" type="article" />
          <VAlert v-else-if="pluginAuthError" type="error" variant="tonal">
            {{ pluginAuthError }}
          </VAlert>
          <component
            v-else-if="RemoteAuthView && selectedAuthProvider"
            :is="RemoteAuthView"
            :api="api"
            :provider="selectedAuthProvider"
            :plugin-id="selectedAuthProvider.plugin_id"
            @authenticated="handlePluginAuthenticated"
            @error="handlePluginAuthError"
            @close="closePluginAuth"
          />
        </VCardText>
      </VCard>
    </VDialog>
  </div>
</template>

<style lang="scss" scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

@use '@core/scss/pages/page-auth';

/* ===================== 布局根容器 ===================== */
.login-root {
  position: relative;
  display: flex;
  box-sizing: border-box;
  overflow-x: clip;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  isolation: isolate;
  min-block-size: 100vh;
  min-block-size: 100dvh;
  padding-block: calc(env(safe-area-inset-top, 0px) + 24px) calc(env(safe-area-inset-bottom, 0px) + 24px);
}

/* 经典 profile 只保留一层覆盖视口的低频品牌环境光。 */
.login-ambient-light {
  position: absolute;
  z-index: 0;
  overflow: hidden;
  inset: 0;
  pointer-events: none;
}

.login-ambient-light__wash {
  position: absolute;
  animation: ambient-drift 18s ease-in-out infinite alternate;
  background:
    radial-gradient(ellipse at 78% 18%, rgba(var(--v-theme-primary), 0.18), transparent 48%),
    linear-gradient(145deg, transparent 28%, rgba(var(--v-theme-primary), 0.07) 72%, transparent);
  filter: blur(40px);
  inset: -12%;
  transform: translate3d(1.5%, -1%, 0) scale(1.04);
}

@keyframes ambient-drift {
  to {
    transform: translate3d(-1.5%, 1%, 0) scale(1);
  }
}

/* ===================== 表单容器 ===================== */
.auth-wrapper {
  position: relative;
  z-index: 2;
  overflow: visible;
  block-size: auto;
  inline-size: 100%;
  min-block-size: 0;
  padding-inline: 16px;
}

.login-glass-filter-defs {
  position: absolute;
  overflow: hidden;
  block-size: 0;
  inline-size: 0;
  pointer-events: none;
}

/* ===================== 玻璃卡片 ===================== */
.login-root[data-login-visual-profile] .login-card {
  position: relative;
  z-index: 1;
  overflow: hidden;
  border: none !important;
  border-radius: var(--app-surface-radius, 20px) !important;
  box-shadow: 0 12px 32px rgba(var(--app-shadow-rgb, 0, 0, 0), 0.1) !important;

  > :not(.login-card__surface) {
    position: relative;
    z-index: 2;
  }
}

/* 登录卡片拥有独立光学表面，不跟随透明主题的全局模糊开关。 */
.glass-effect {
  backdrop-filter: none !important;
  background: transparent !important;
}

.login-card__surface {
  position: absolute;
  z-index: 0;
  overflow: hidden;
  border-radius: inherit;
  inset: 0;
  pointer-events: none;
  transform: translateZ(0);
}

.login-root[data-login-visual-profile='classic'] .login-card__surface {
  backdrop-filter: blur(22px) saturate(105%);
  background: rgba(var(--v-theme-surface), 0.62);
}

.login-root[data-login-visual-profile='transparent'] .login-card__surface {
  backdrop-filter: blur(var(--optical-glass-blur)) saturate(var(--optical-glass-saturate))
    contrast(var(--optical-glass-contrast));
  background: rgba(var(--v-theme-surface), 0.56);
}

.login-root[data-login-visual-profile='glass'] .login-card .login-card__surface {
  background: rgba(var(--v-theme-surface), 0.18) !important;
}

.login-brand {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 0.65rem;
  inline-size: 100%;
  margin-block-end: 1.55rem;
  text-align: center;
}

.login-brand__mark-row {
  display: flex;
  justify-content: center;
}

.login-brand__mark {
  block-size: 3.2rem;
  inline-size: 3.2rem;
  filter: drop-shadow(0 0 6px rgba(var(--v-theme-primary), 0.42))
    drop-shadow(0 0 14px rgba(var(--v-theme-primary), 0.2));
}

.login-brand__name {
  display: inline-flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.48rem;
  font-size: 0.86rem;
  line-height: 1;
}

.login-brand__wordmark {
  color: rgba(var(--v-theme-on-surface), 0.92);
  font-weight: 800;
  letter-spacing: 0.13em;
}

.login-brand__name .moviepilot-neo-badge {
  font-size: 0.98rem;
  letter-spacing: 0.12em;
}

.native-login-field__icon-shell {
  position: absolute;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  block-size: 100%;
  inline-size: 24px;
  inset-block-start: 0;
  inset-inline-start: 14px;
  pointer-events: none;
}

/* 保留 NEO Logo 的轻量霓虹识别度，卡片和表单本身保持克制。 */
.login-remember {
  position: relative;
  display: inline-flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), 0.72);
  cursor: pointer;
  gap: 0.55rem;
  min-block-size: 36px;
  padding-block: 4px;
  transition: color 160ms ease;
  user-select: none;
}

.login-remember:hover {
  color: rgba(var(--v-theme-on-surface), 0.9);
}

.login-remember__label {
  font-size: 0.84rem;
  font-weight: 500;
}

.login-remember__input {
  position: absolute;
  block-size: 1px;
  inline-size: 1px;
  opacity: 0;
}

.login-remember__check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 18px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.24);
  border-radius: 5px;
  background: rgba(var(--v-theme-surface), 0.12);
  block-size: 18px;
  color: transparent;
  inline-size: 18px;
  transition:
    background 160ms ease,
    border-color 160ms ease,
    color 160ms ease,
    box-shadow 160ms ease;
}

.login-remember__input:checked + .login-remember__check {
  border-color: rgb(var(--v-theme-primary));
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

.login-remember__input:focus-visible + .login-remember__check {
  outline: 2px solid rgba(var(--v-theme-primary), 0.55);
  outline-offset: 3px;
}

.login-submit-row {
  display: flex;
  justify-content: center;
  inline-size: 100%;
}

.login-submit {
  border: 0;
  border-radius: 13px !important;
  background: rgb(var(--v-theme-primary)) !important;
  block-size: 46px !important;
  inline-size: min(100%, 14rem);
  box-shadow: 0 5px 14px rgba(var(--v-theme-primary), 0.18);
  color: rgb(var(--v-theme-on-primary)) !important;
  font-weight: 600;
  letter-spacing: 0.03em;
  transition:
    transform 160ms ease,
    box-shadow 160ms ease;
}

.login-submit:not(.v-btn--disabled):not(.v-btn--loading):hover {
  box-shadow: 0 5px 14px rgba(var(--v-theme-primary), 0.22);
  transform: translateY(-1px);
}

.login-submit:not(.v-btn--disabled):not(.v-btn--loading):active {
  box-shadow: 0 2px 6px rgba(var(--v-theme-primary), 0.14);
  transform: translateY(0);
}

.login-submit :deep(.v-btn__content) {
  justify-content: center;
  inline-size: 100%;
  padding-inline: 0;
}

.login-submit__label {
  line-height: 1;
}

.login-submit.v-btn--disabled {
  box-shadow: none;
  transform: none;
}
/* ===================== 卡片主体 ===================== */
.login-body {
  padding-inline: 0 !important;
  padding-block: 10px !important;
}

/* 原生登录输入框：保留标准 input DOM，便于密码管理器识别。 */
.login-root[data-login-visual-profile] .native-login-field {
  position: relative;
  display: flex;
  overflow: hidden;
  align-items: center;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.16);
  block-size: 56px;
  border-radius: 13px;
  background: rgba(var(--v-theme-surface), 0.12);
  backdrop-filter: blur(10px) saturate(105%);
  box-shadow: none;
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease,
    background 220ms ease;
}

.login-root[data-login-visual-profile] .native-login-field:focus-within {
  border-color: rgba(var(--v-theme-primary), 0.5);
  box-shadow: 0 0 0 2px rgba(var(--v-theme-primary), 0.06);
  background: rgba(var(--v-theme-surface), 0.1);
}

.native-login-field__icon {
  color: rgba(var(--v-theme-on-surface), 0.54);
}

.native-login-field__input {
  position: relative;
  z-index: 1;
  display: block;
  border: 0;
  appearance: none;
  background: transparent;
  block-size: 54px;
  color: rgb(var(--v-theme-on-surface));
  font: inherit;
  inline-size: 100%;
  line-height: 1.5;
  outline: none;
  padding-block: 0;
  padding-inline: 50px 16px;
}

.native-login-field__input::placeholder {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  opacity: 1;
}

.native-login-field--password .native-login-field__input {
  padding-inline-end: 52px;
}

.native-login-field__input:-webkit-autofill,
.native-login-field__input:-webkit-autofill:hover,
.native-login-field__input:-webkit-autofill:focus {
  -webkit-text-fill-color: rgb(var(--v-theme-on-surface));
  caret-color: rgb(var(--v-theme-on-surface));
  transition: background-color 9999s ease-in-out 0s;
}

.native-login-field__toggle {
  position: absolute;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  block-size: 40px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  cursor: pointer;
  inline-size: 40px;
  inset-block-start: 4px;
  inset-inline-end: 4px;
  padding: 0;
  transition:
    background 150ms ease,
    color 150ms ease;
}

.native-login-field__toggle:hover,
.native-login-field__toggle:focus-visible {
  background: rgba(var(--v-theme-on-surface), 0.08);
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  outline: none;
}

/* Passkey 按钮 */
.passkey-btn {
  border-radius: 12px;
  font-weight: 500;
  transition:
    background 200ms ease,
    border-color 200ms ease,
    transform 150ms ease;

  &:hover {
    transform: translateY(-1px);
  }
}

/* 插件认证按钮 */
.plugin-auth-btn {
  border-radius: 12px;
  font-weight: 500;
  transition:
    background 200ms ease,
    border-color 200ms ease,
    transform 150ms ease;

  &:hover {
    transform: translateY(-1px);
  }
}

/* or 分隔线 */
.or-divider {
  position: relative;
  display: flex;
  align-items: center;
  text-align: center;

  &::before,
  &::after {
    flex: 1;
    border-block-end: 1px solid rgba(var(--v-border-color), calc(var(--v-border-opacity) * 0.7));
    content: '';
  }

  .or-divider-text {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    padding-inline: 16px;
    text-transform: uppercase;
    white-space: nowrap;
  }
}

/* 错误提示 */
.login-alert {
  border-radius: 12px;
}

/* 浅色主题下 passkey 按钮保持绿色辨识度 */
:deep(.v-theme--light) .passkey-btn.v-btn--variant-outlined {
  color: rgb(86, 170, 0) !important;
}

/* ===================== 入场动画 ===================== */
.login-card--enter {
  animation: login-enter 600ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes login-enter {
  0% {
    opacity: 0;
    transform: translateY(12px) scale(0.985);
  }

  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* ===================== 无障碍：尊重减少动态偏好 ===================== */
@media (prefers-reduced-motion: reduce) {
  .login-card--enter {
    animation: none !important;
  }

  .login-submit {
    transition: none !important;
  }

  .login-ambient-light__wash {
    animation: none !important;
  }
}

@media (prefers-reduced-transparency: reduce) {
  .login-root[data-login-visual-profile] .login-card .login-card__surface,
  .login-root[data-login-visual-profile] .native-login-field {
    backdrop-filter: none !important;
    background: rgb(var(--v-theme-surface)) !important;
    filter: none !important;
  }
}

@media (prefers-contrast: more) {
  .login-root[data-login-visual-profile] .login-card .login-card__surface {
    background: rgba(var(--v-theme-surface), 0.94) !important;
  }

  .login-root[data-login-visual-profile] .native-login-field {
    border-color: rgba(var(--v-theme-on-surface), 0.68);
  }
}

@supports not (backdrop-filter: blur(1px)) {
  .login-root[data-login-visual-profile] .login-card .login-card__surface,
  .login-root[data-login-visual-profile] .native-login-field {
    background: rgba(var(--v-theme-surface), 0.96) !important;
  }
}

/* ===================== 小屏适配 ===================== */
@media (width <= 480px) {
  .auth-wrapper {
    padding-inline: 12px;
  }


  .login-root[data-login-visual-profile] .login-card {
    padding: 1.5rem !important;
    border-radius: 16px !important;
  }
}

@media (width <= 480px) and (height <= 600px) {
  .login-root[data-login-visual-profile] .login-card {
    padding-block: 0.75rem !important;
  }
}
</style>
