// 全局请求优化器
// 自动管理所有API请求的中断，无需手动注册

declare module 'axios' {
  interface AxiosRequestConfig {
    /** 写入操作需接收最终结果，允许调用方避免被页面切换中断。 */
    cancelOnNavigation?: boolean
  }
}

let isNavigating = false
let lastNavigationAbortAt = 0
const activeRequests = new Set<AbortController>()
const NAVIGATION_ABORT_TOAST_SUPPRESS_MS = 250
const CANCELED_TOAST_PATTERN = /(?:^|[:：\s])(?:canceled|cancelled|aborted|the user aborted a request\.?)\s*$/i

// 监听路由状态
export function setNavigatingState(navigating: boolean) {
  isNavigating = navigating

  if (navigating) {
    // 路由切换时，中断所有未完成的请求
    console.log('Navigation started - aborting active requests')
    abortAllActiveRequests()
  }
}

// 中断所有活跃的请求
function abortAllActiveRequests() {
  let abortedCount = 0
  for (const controller of activeRequests) {
    if (!controller.signal.aborted) {
      controller.abort()
      abortedCount += 1
    }
  }
  activeRequests.clear()
  if (abortedCount > 0) {
    lastNavigationAbortAt = Date.now()
  }
}

/** 判断未知异常是否属于 Axios / Fetch 请求取消错误。 */
export function isRequestCanceledError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; name?: unknown; __CANCEL__?: unknown }
  return (
    candidate.__CANCEL__ === true ||
    candidate.code === 'ERR_CANCELED' ||
    candidate.name === 'CanceledError' ||
    candidate.name === 'AbortError'
  )
}

/** 判断最近是否刚因路由切换中止过在途请求。 */
export function wasRequestRecentlyAborted(windowMs: number = NAVIGATION_ABORT_TOAST_SUPPRESS_MS): boolean {
  return lastNavigationAbortAt > 0 && Date.now() - lastNavigationAbortAt <= windowMs
}

/** 重置最近一次导航取消时间戳（主要用于单元测试隔离）。 */
export function resetNavigationAbortState() {
  lastNavigationAbortAt = 0
}

/** 过滤路由切换中断在途请求引发的误报错误提示，避免右下角弹出 canceled。 */
export function shouldSuppressNavigationErrorToast(toast: { type?: unknown; content?: unknown }): boolean {
  if (toast?.type !== 'error') return false
  if (typeof toast.content === 'string' && CANCELED_TOAST_PATTERN.test(toast.content.trim())) {
    return true
  }
  return wasRequestRecentlyAborted()
}

// 清理已完成的请求控制器
function cleanupController(controller: AbortController) {
  activeRequests.delete(controller)
}

// 初始化请求优化器
export function initializeRequestOptimizer(axiosInstance: any) {
  // 拦截请求，自动添加 AbortController
  axiosInstance.interceptors.request.use(
    (config: any) => {
      // 如果请求已经有 signal，跳过（避免覆盖手动设置的）
      if (config.signal || config.cancelOnNavigation === false) {
        return config
      }

      // 创建新的 AbortController
      const controller = new AbortController()
      config.signal = controller.signal

      // 将控制器添加到活跃列表
      activeRequests.add(controller)

      // 监听请求完成事件来清理控制器
      const cleanup = () => cleanupController(controller)

      // 监听中断事件
      controller.signal.addEventListener('abort', cleanup, { once: true })

      return config
    },
    (error: any) => {
      return Promise.reject(error)
    },
  )

  // 拦截响应，清理对应的控制器
  axiosInstance.interceptors.response.use(
    (response: any) => {
      // 从配置中获取 signal 对应的控制器并清理
      if (response.config?.signal) {
        const controller = Array.from(activeRequests).find(ctrl => ctrl.signal === response.config.signal)
        if (controller) {
          cleanupController(controller)
        }
      }
      return response
    },
    (error: any) => {
      // 错误时也要清理控制器
      if (error.config?.signal) {
        const controller = Array.from(activeRequests).find(ctrl => ctrl.signal === error.config.signal)
        if (controller) {
          cleanupController(controller)
        }
      }
      return Promise.reject(error)
    },
  )
}

// 获取当前活跃请求数量（调试用）
export function getActiveRequestsCount() {
  return activeRequests.size
}

// 获取当前是否处于路由导航切换态
export function isNavigatingState() {
  return isNavigating
}

// 手动中断所有请求（备用方法）
export function abortAllRequests() {
  abortAllActiveRequests()
}
