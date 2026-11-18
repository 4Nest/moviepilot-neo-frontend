<script lang="ts" setup>
import { useTheme } from 'vuetify'
import { ensureRenderComplete, removeEl } from './@core/utils/dom'
import api, { type ConnectionAwareRequestConfig } from '@/api'
import { useAuthStore, useGlobalSettingsStore } from '@/stores'
import { checkAndEmitUnreadMessages } from '@/utils/badge'
import { globalLoadingStateManager } from '@/utils/loadingStateManager'
import PWAInstallPrompt from '@/components/pwa/PWAInstallPrompt.vue'
import SharedDialogHost from '@/components/dialog/SharedDialogHost.vue'
import NativeNavigationHost from '@/components/native/NativeNavigationHost.vue'
import { applyStoredThemeCustomizerAppearance, normalizeThemeCustomizerTheme } from '@/composables/useThemeCustomizer'
import { completeLaunchLoading } from '@/composables/useLaunchLoading'
import { usePWA } from '@/composables/usePWA'
import { themeManager } from '@/utils/themeManager'
import { applyDocumentThemeChrome, resolveThemeName } from '@/utils/themePalette'
import { configureApexChartsTheme } from '@/utils/apexCharts'
import { useGlobalOfflineStatus, type ConnectionFailureReason } from '@/composables/useOfflineStatus'
import { useAppActivityLifecycle } from '@/composables/useAppActivityLifecycle'

// iOS App 容器会在页面初始化前注入 moviepilot.chrome 桥接；仅在桥接存在时启用原生导航
const nativeTransportAvailable = typeof window !== 'undefined' && window.MoviePilotNative?.transportVersion === 1
const LAUNCH_MIN_VISIBLE_MS = 320
const LAUNCH_MAX_WAIT_MS = 1200
const LAUNCH_EXIT_DURATION_MS = 180

function getLaunchNow() {
  return globalThis.performance?.now?.() ?? Date.now()
}

const launchStartedAt = Number.parseFloat(document.documentElement.dataset.launchStartedAt || '') || getLaunchNow()

function getRemainingLaunchBudget() {
  return Math.max(0, LAUNCH_MAX_WAIT_MS - (getLaunchNow() - launchStartedAt))
}

async function waitForLaunchTask(task: Promise<unknown>, timeoutMs: number, label: string) {
  if (timeoutMs <= 0) return

  await Promise.race([
    task.catch(error => {
      console.warn(`[Launch] ${label} failed`, error)
    }),
    new Promise<void>(resolve => window.setTimeout(resolve, timeoutMs)),
  ])
}

async function waitForMinimumLaunchVisibility() {
  const remaining = LAUNCH_MIN_VISIBLE_MS - (getLaunchNow() - launchStartedAt)
  if (remaining > 0) {
    await new Promise<void>(resolve => window.setTimeout(resolve, remaining))
  }
}

function getCachedAutoResolvedTheme() {
  const cachedTheme = localStorage.getItem('materio-initial-resolved-theme')

  return cachedTheme === 'dark' || cachedTheme === 'light' ? cachedTheme : null
}

function resolveInitialThemeName(themePreference: string) {
  if (themePreference === 'auto') {
    return getCachedAutoResolvedTheme() || resolveThemeName(themePreference)
  }

  return resolveThemeName(themePreference)
}

// 生效主题
const vuetifyTheme = useTheme()
const { global: globalTheme } = vuetifyTheme
let themeValue = normalizeThemeCustomizerTheme(localStorage.getItem('theme') || 'auto')
let resumeThemeSyncTimer: number | null = null
globalTheme.name.value = resolveInitialThemeName(themeValue)
applyStoredThemeCustomizerAppearance(vuetifyTheme)

// 启动屏和 iOS safe area 在同一层显示，根节点底色需要尽早和当前主题保持一致。
function syncRootLaunchPalette() {
  const { background, primary } = globalTheme.current.value.colors

  applyDocumentThemeChrome(themeValue, {
    background,
    persistLoaderColors: true,
    primary,
    resolvedTheme: globalTheme.name.value,
  })
}

// 检查是否登录
const authStore = useAuthStore()
const isLogin = computed(() => authStore.token)
const { initializePWA } = usePWA()
const offlineStatus = useGlobalOfflineStatus()
const globalSettingsStore = useGlobalSettingsStore()
const { state: appActivityState } = useAppActivityLifecycle()

let authenticatedStateTimer: number | null = null
let heartbeatInterval: number | null = null
let connectionRetryTimer: number | null = null
let connectionProbePromise: Promise<boolean> | null = null
let connectionProbeFailures = 0
let prefersColorSchemeMediaQuery: MediaQueryList | null = null

const SERVER_PROBE_TIMEOUT_MS = 8_000
const SERVER_PROBE_FAILURE_THRESHOLD = 2
const SERVER_RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 30_000] as const

/** 清除等待中的服务重连任务。 */
function clearConnectionRetryTimer() {
  if (!connectionRetryTimer) return

  window.clearTimeout(connectionRetryTimer)
  connectionRetryTimer = null
}

/** 根据浏览器状态和请求错误判断本次探测失败原因。 */
function resolveProbeFailureReason(error: unknown): ConnectionFailureReason {
  if (!offlineStatus.browserOnline.value) return 'browser-offline'

  const errorCode = (error as { code?: string } | null)?.code
  if (errorCode === 'ECONNABORTED' || errorCode === 'ETIMEDOUT') return 'timeout'

  return 'server-unreachable'
}

/** 按退避间隔安排下一次 MoviePilot 服务探测。 */
function scheduleConnectionRetry() {
  clearConnectionRetryTimer()

  const retryIndex = Math.min(Math.max(connectionProbeFailures - 1, 0), SERVER_RETRY_DELAYS_MS.length - 1)
  connectionRetryTimer = window.setTimeout(() => {
    connectionRetryTimer = null
    void probeServerConnection()
  }, SERVER_RETRY_DELAYS_MS[retryIndex])
}

/** 使用后端 ping 接口执行去重后的权威服务连通性探测。 */
async function probeServerConnection(showChecking = false): Promise<boolean> {
  if (!isLogin.value) return false
  if (connectionProbePromise) return connectionProbePromise

  clearConnectionRetryTimer()
  if (showChecking) offlineStatus.markConnectionChecking(offlineStatus.connectionReason.value ?? undefined)

  const successSequenceAtProbeStart = offlineStatus.serverSuccessSequence.value
  const probePromise = (async () => {
    try {
      await api.get('system/ping', {
        skipConnectionTracking: true,
        timeout: SERVER_PROBE_TIMEOUT_MS,
      } as ConnectionAwareRequestConfig)
      connectionProbeFailures = 0
      return true
    } catch (error) {
      if (!isLogin.value) {
        offlineStatus.markServerOnline()
        return false
      }

      if (offlineStatus.serverSuccessSequence.value > successSequenceAtProbeStart) {
        connectionProbeFailures = 0
        return true
      }

      connectionProbeFailures += 1
      const failureReason = resolveProbeFailureReason(error)

      if (connectionProbeFailures >= SERVER_PROBE_FAILURE_THRESHOLD) {
        offlineStatus.markServerOffline(failureReason)
      } else {
        offlineStatus.markConnectionChecking(failureReason)
      }

      scheduleConnectionRetry()
      return false
    }
  })()

  connectionProbePromise = probePromise
  try {
    return await probePromise
  } finally {
    if (connectionProbePromise === probePromise) connectionProbePromise = null
  }
}

/** 启动即时服务探测和五分钟在线心跳。 */
function startHeartbeat() {
  if (heartbeatInterval) window.clearInterval(heartbeatInterval)

  void probeServerConnection()

  heartbeatInterval = window.setInterval(
    async () => {
      if (isLogin.value) await probeServerConnection()
    },
    5 * 60 * 1000,
  )
}

/** 停止心跳和等待中的自动重连任务。 */
function stopHeartbeat() {
  if (heartbeatInterval) {
    window.clearInterval(heartbeatInterval)
    heartbeatInterval = null
  }

  clearConnectionRetryTimer()
  connectionProbeFailures = 0
}

watch(
  () => offlineStatus.connectionCheckRequestId.value,
  () => {
    if (isLogin.value) void probeServerConnection(true)
  },
)

watch(
  () => offlineStatus.connectionStatus.value,
  status => {
    if (status !== 'online') return
    connectionProbeFailures = 0
    clearConnectionRetryTimer()
  },
)

watch(
  () => offlineStatus.browserOnline.value,
  browserIsOnline => {
    if (!isLogin.value) return
    offlineStatus.requestConnectionCheck(browserIsOnline ? undefined : 'browser-offline')
  },
)

// 更新data-theme属性以便CSS选择器能正确匹配
function updateHtmlThemeAttribute(themeName: string) {
  document.documentElement.setAttribute('data-theme', themeName)
  document.body.setAttribute('data-theme', themeName)
  syncRootLaunchPalette()
}

// 从本地存储重新同步主题偏好、DOM 主题属性和相关外观配置。
function syncThemePreferenceFromStorage(preferCachedAuto = false) {
  if (resumeThemeSyncTimer !== null) {
    window.clearTimeout(resumeThemeSyncTimer)
    resumeThemeSyncTimer = null
  }

  themeValue = normalizeThemeCustomizerTheme(localStorage.getItem('theme') || 'auto')

  const resolvedTheme =
    themeValue === 'auto' && preferCachedAuto
      ? getCachedAutoResolvedTheme() || resolveThemeName(themeValue)
      : resolveThemeName(themeValue)
  if (globalTheme.name.value !== resolvedTheme) {
    globalTheme.name.value = resolvedTheme
  }

  applyStoredThemeCustomizerAppearance(vuetifyTheme)
  updateHtmlThemeAttribute(resolvedTheme)
  configureApexChartsTheme(resolvedTheme)

  void themeManager
    .setTheme(themeValue === 'auto' ? resolvedTheme : themeValue)
    .then(() => {
      updateHtmlThemeAttribute(globalTheme.name.value)
    })
    .catch(error => {
      console.error('同步主题管理器失败:', error)
    })

  if (preferCachedAuto && themeValue === 'auto') {
    resumeThemeSyncTimer = window.setTimeout(() => {
      resumeThemeSyncTimer = null
      syncThemePreferenceFromStorage()
    }, 180)
  }
}

// 系统配色变化时，在自动主题模式下刷新当前实际主题。
function handleSystemThemeChange() {
  if (normalizeThemeCustomizerTheme(localStorage.getItem('theme') || 'auto') === 'auto') {
    syncThemePreferenceFromStorage()
  }
}

/** 页面重新可见时同步主题，并在连接异常时立即重新探测服务。 */
function handleVisibilityThemeSync() {
  if (document.visibilityState === 'visible') {
    syncThemePreferenceFromStorage(true)
    if (isLogin.value && !offlineStatus.isOnline.value) offlineStatus.requestConnectionCheck()
  }
}

/** 页面从缓存或重新聚焦恢复时刷新主题偏好和异常连接状态。 */
function handlePageShowThemeSync() {
  if (document.visibilityState === 'visible') {
    if (isLogin.value && !offlineStatus.isOnline.value) offlineStatus.requestConnectionCheck()
  }
  syncThemePreferenceFromStorage(true)
}

// 初始化登录后的全局设置和用户设置状态。
async function initializeAuthenticatedState() {
  if (!isLogin.value) return

  try {
    globalLoadingStateManager.setLoadingState('global-settings', true)
    await globalSettingsStore.initialize()
    await globalSettingsStore.loadUserSettings()
  } finally {
    globalLoadingStateManager.setLoadingState('global-settings', false)
  }
}

// 延迟初始化登录态数据，避开登录成功后的即时路由跳转窗口。
function scheduleAuthenticatedStateInitialization() {
  if (authenticatedStateTimer) {
    window.clearTimeout(authenticatedStateTimer)
  }

  authenticatedStateTimer = window.setTimeout(() => {
    authenticatedStateTimer = null
    void initializeAuthenticatedState()
  }, 150)
}

// 添加logo动画效果并延迟移除加载界面
async function animateAndRemoveLoader() {
  const loadingBg = document.querySelector('#loading-bg') as HTMLElement
  if (loadingBg) {
    loadingBg.classList.add('loading-complete')
    await new Promise<void>(resolve => {
      window.setTimeout(() => {
        removeEl('#loading-bg')

        document.documentElement.removeAttribute('data-launch-loading')
        document.documentElement.style.removeProperty('overflow')
        document.body.style.removeProperty('overflow')
        completeLaunchLoading()
        resolve()
      }, LAUNCH_EXIT_DURATION_MS)
    })
  } else {
    completeLaunchLoading()
  }
}

// 检查PWA状态并移除加载界面
async function removeLoadingWithStateCheck() {
  try {
    globalLoadingStateManager.setLoadingState('pwa-state', true)

    const pwaController = (window as Window & { pwaStateController?: { waitForStateRestore?: () => unknown } })
      .pwaStateController
    if (pwaController?.waitForStateRestore) {
      await waitForLaunchTask(
        Promise.resolve().then(() => pwaController.waitForStateRestore?.()),
        getRemainingLaunchBudget(),
        'PWA state restore',
      )
    }
    globalLoadingStateManager.setLoadingState('pwa-state', false)

    await waitForLaunchTask(initializePWA(), getRemainingLaunchBudget(), 'PWA detection')

    void initializeAuthenticatedState().catch(error => {
      console.warn('[Launch] Authenticated state initialization failed', error)
    })

    await waitForMinimumLaunchVisibility()

    await animateAndRemoveLoader()

    if (isLogin.value) {
      checkAndEmitUnreadMessages()
    }
  } catch {
    globalLoadingStateManager.reset()
    await animateAndRemoveLoader()
  }
}

onMounted(async () => {
  // 移除URL中的时间戳参数
  const url = new URL(window.location.href)
  if (url.searchParams.has('_t')) {
    url.searchParams.delete('_t')
    const newUrl = url.pathname + url.search + url.hash
    window.history.replaceState(null, '', newUrl)
  }

  // 配置 ApexCharts
  configureApexChartsTheme(globalTheme.name.value)

  // 初始化data-theme属性
  updateHtmlThemeAttribute(globalTheme.name.value)

  // 初始化主题管理器
  await themeManager.setTheme(themeValue === 'auto' ? globalTheme.name.value : themeValue)
  applyStoredThemeCustomizerAppearance(vuetifyTheme)
  updateHtmlThemeAttribute(globalTheme.name.value)

  // 监听主题变化
  watch(
    () => globalTheme.name.value,
    newTheme => {
      updateHtmlThemeAttribute(newTheme)
      configureApexChartsTheme(newTheme)
    },
  )

  prefersColorSchemeMediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)') ?? null
  prefersColorSchemeMediaQuery?.addEventListener('change', handleSystemThemeChange)
  document.addEventListener('visibilitychange', handleVisibilityThemeSync)
  window.addEventListener('pageshow', handlePageShowThemeSync)
  window.addEventListener('focus', handlePageShowThemeSync)

  ensureRenderComplete(() => {
    nextTick(removeLoadingWithStateCheck)
  })

  if (isLogin.value) {
    startHeartbeat()
  }

  watch(isLogin, loggedIn => {
    if (loggedIn) {
      startHeartbeat()
      scheduleAuthenticatedStateInitialization()
    } else {
      if (authenticatedStateTimer) {
        window.clearTimeout(authenticatedStateTimer)
        authenticatedStateTimer = null
      }
      stopHeartbeat()
      offlineStatus.markServerOnline()
    }
  })
})

onUnmounted(() => {
  if (resumeThemeSyncTimer !== null) {
    window.clearTimeout(resumeThemeSyncTimer)
    resumeThemeSyncTimer = null
  }
  if (authenticatedStateTimer) {
    window.clearTimeout(authenticatedStateTimer)
    authenticatedStateTimer = null
  }
  stopHeartbeat()
  prefersColorSchemeMediaQuery?.removeEventListener('change', handleSystemThemeChange)
  prefersColorSchemeMediaQuery = null
  document.removeEventListener('visibilitychange', handleVisibilityThemeSync)
  window.removeEventListener('pageshow', handlePageShowThemeSync)
  window.removeEventListener('focus', handlePageShowThemeSync)
})
</script>

<template>
  <div class="app-wrapper" :data-app-activity-state="appActivityState">
    <VApp>
      <RouterView />
      <!-- 全局共享弹窗入口，列表与卡片按需在这里挂载业务弹窗。 -->
      <SharedDialogHost />
      <!-- iOS App 原生导航宿主：仅在 App 容器注入桥接时激活 -->
      <NativeNavigationHost v-if="nativeTransportAvailable" />
      <!-- PWA安装提示 -->
      <PWAInstallPrompt v-if="!nativeTransportAvailable" />
    </VApp>
  </div>
</template>

<style lang="scss">
.app-wrapper {
  position: relative;
  inline-size: 100%;
  min-block-size: 100vh;
}
</style>
