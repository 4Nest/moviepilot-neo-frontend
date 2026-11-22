import { computed, getCurrentInstance, onMounted, onUnmounted, ref } from 'vue'

export const DISCOVER_EXCLUDE_SHORT_DRAMA_KEY = 'MP_DISCOVER_EXCLUDE_SHORT_DRAMA'
export const DISCOVER_DESKTOP_FILTERS_COLLAPSED_KEY = 'MP_DISCOVER_DESKTOP_FILTERS_COLLAPSED'

const MOBILE_BREAKPOINT_PX = 600
const MOBILE_MEDIA_QUERY = '(max-width: 599.98px)'

const sharedExcludeShortDrama = ref<boolean>(true)
const sharedDesktopFiltersCollapsed = ref<boolean>(false)

function readBooleanStorage(key: string, defaultValue: boolean): boolean {
  try {
    const raw = localStorage.getItem(key)
    if (raw === 'true' || raw === '1') return true
    if (raw === 'false' || raw === '0') return false
  } catch {
    // 本地存储不可用时回退默认值
  }
  return defaultValue
}

function writeBooleanStorage(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // 忽略隐私模式或配额限制异常
  }
}

function detectMobileViewport(): boolean {
  if (typeof window === 'undefined') return false
  const mediaMatched = Boolean(window.matchMedia?.(MOBILE_MEDIA_QUERY).matches)
  const widthMatched =
    typeof window.innerWidth === 'number' && window.innerWidth > 0 && window.innerWidth < MOBILE_BREAKPOINT_PX
  return mediaMatched || widthMatched
}

/**
 * 管理探索页跨视图共享偏好（短剧过滤持久化开关与桌面/移动端筛选折叠控制）。
 */
export function useDiscoverPreferences() {
  // 每次初始化对齐 localStorage 权威值，兼顾跨子视图同步与测试环境重置
  sharedExcludeShortDrama.value = readBooleanStorage(DISCOVER_EXCLUDE_SHORT_DRAMA_KEY, true)
  sharedDesktopFiltersCollapsed.value = readBooleanStorage(DISCOVER_DESKTOP_FILTERS_COLLAPSED_KEY, false)

  const isMobileViewport = ref<boolean>(detectMobileViewport())
  const mobileFiltersExpanded = ref<boolean>(false)

  function syncViewport() {
    isMobileViewport.value = detectMobileViewport()
  }

  if (getCurrentInstance()) {
    onMounted(() => {
      syncViewport()
      window.addEventListener('resize', syncViewport, { passive: true })
    })
    onUnmounted(() => {
      window.removeEventListener('resize', syncViewport)
    })
  }

  function setExcludeShortDrama(value: boolean) {
    const normalized = Boolean(value)
    sharedExcludeShortDrama.value = normalized
    writeBooleanStorage(DISCOVER_EXCLUDE_SHORT_DRAMA_KEY, normalized)
  }

  function toggleExcludeShortDrama() {
    setExcludeShortDrama(!sharedExcludeShortDrama.value)
  }

  function setDesktopFiltersCollapsed(value: boolean) {
    const normalized = Boolean(value)
    sharedDesktopFiltersCollapsed.value = normalized
    writeBooleanStorage(DISCOVER_DESKTOP_FILTERS_COLLAPSED_KEY, normalized)
  }

  const excludeShortDrama = computed<boolean>({
    get: () => sharedExcludeShortDrama.value,
    set: value => setExcludeShortDrama(value),
  })

  const desktopFiltersCollapsed = computed<boolean>({
    get: () => sharedDesktopFiltersCollapsed.value,
    set: value => setDesktopFiltersCollapsed(value),
  })

  const filtersExpanded = computed<boolean>(() =>
    isMobileViewport.value ? mobileFiltersExpanded.value : !sharedDesktopFiltersCollapsed.value,
  )

  function toggleFiltersExpanded() {
    if (isMobileViewport.value) {
      mobileFiltersExpanded.value = !mobileFiltersExpanded.value
      return
    }
    setDesktopFiltersCollapsed(!sharedDesktopFiltersCollapsed.value)
  }

  return {
    desktopFiltersCollapsed,
    excludeShortDrama,
    filtersExpanded,
    isMobileViewport,
    mobileFiltersExpanded,
    setDesktopFiltersCollapsed,
    setExcludeShortDrama,
    toggleExcludeShortDrama,
    toggleFiltersExpanded,
  }
}
