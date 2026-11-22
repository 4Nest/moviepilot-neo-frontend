import {
  abortAllRequests,
  getActiveRequestsCount,
  initializeRequestOptimizer,
  isRequestCanceledError,
  resetNavigationAbortState,
  setNavigatingState,
  shouldSuppressNavigationErrorToast,
  wasRequestRecentlyAborted,
} from '@/utils/requestOptimizer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface RequestConfigFake {
  signal?: AbortSignal
  cancelOnNavigation?: boolean
}

interface ResponseFake {
  config?: RequestConfigFake
  data?: unknown
}

interface RequestErrorFake {
  config?: RequestConfigFake
  message: string
}

type RejectedInterceptor = (error: unknown) => Promise<never>

/** 捕获 Axios 注册的 interceptor，以真实调用顺序驱动请求生命周期。 */
function createAxiosInterceptorFake() {
  let requestFulfilled: ((config: RequestConfigFake) => RequestConfigFake) | undefined
  let requestRejected: RejectedInterceptor | undefined
  let responseFulfilled: ((response: ResponseFake) => ResponseFake) | undefined
  let responseRejected: RejectedInterceptor | undefined

  const requestUse = vi.fn(
    (fulfilled: (config: RequestConfigFake) => RequestConfigFake, rejected: RejectedInterceptor) => {
      requestFulfilled = fulfilled
      requestRejected = rejected
      return 0
    },
  )
  const responseUse = vi.fn((fulfilled: (response: ResponseFake) => ResponseFake, rejected: RejectedInterceptor) => {
    responseFulfilled = fulfilled
    responseRejected = rejected
    return 0
  })
  const axiosInstance = {
    interceptors: {
      request: { use: requestUse },
      response: { use: responseUse },
    },
  }

  initializeRequestOptimizer(axiosInstance)

  return {
    request: {
      fulfilled: requestFulfilled!,
      rejected: requestRejected!,
    },
    requestUse,
    response: {
      fulfilled: responseFulfilled!,
      rejected: responseRejected!,
    },
    responseUse,
  }
}

describe('requestOptimizer', () => {
  beforeEach(() => {
    abortAllRequests()
    resetNavigationAbortState()
    setNavigatingState(false)
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    abortAllRequests()
    resetNavigationAbortState()
    setNavigatingState(false)
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('为没有 signal 的请求注入控制器，并在正常响应后清理', () => {
    const interceptors = createAxiosInterceptorFake()
    const config = interceptors.request.fulfilled({})

    expect(interceptors.requestUse).toHaveBeenCalledOnce()
    expect(interceptors.responseUse).toHaveBeenCalledOnce()
    expect(config.signal).toBeInstanceOf(AbortSignal)
    expect(config.signal?.aborted).toBe(false)
    expect(getActiveRequestsCount()).toBe(1)

    const response = { config, data: { ok: true } }
    expect(interceptors.response.fulfilled(response)).toBe(response)
    expect(getActiveRequestsCount()).toBe(0)
  })

  it('在错误响应后清理控制器，并保留原始拒绝原因', async () => {
    const interceptors = createAxiosInterceptorFake()
    const config = interceptors.request.fulfilled({})
    const responseError: RequestErrorFake = { config, message: 'request failed' }

    await expect(interceptors.response.rejected(responseError)).rejects.toBe(responseError)
    expect(getActiveRequestsCount()).toBe(0)

    const requestError = new Error('interceptor failed')
    await expect(interceptors.request.rejected(requestError)).rejects.toBe(requestError)
  })

  it('不覆盖调用方 signal，也不把调用方控制器纳入全局取消', () => {
    const interceptors = createAxiosInterceptorFake()
    const callerController = new AbortController()
    const config = interceptors.request.fulfilled({ signal: callerController.signal })

    expect(config.signal).toBe(callerController.signal)
    expect(getActiveRequestsCount()).toBe(0)

    abortAllRequests()
    expect(callerController.signal.aborted).toBe(false)

    expect(interceptors.response.fulfilled({ config })).toEqual({ config })
    expect(getActiveRequestsCount()).toBe(0)
  })

  it('订阅等显式保留的写入请求不会被导航取消，普通查询仍会取消', () => {
    const interceptors = createAxiosInterceptorFake()
    const mutation = interceptors.request.fulfilled({ cancelOnNavigation: false })
    const query = interceptors.request.fulfilled({})

    setNavigatingState(true)

    expect(mutation.signal).toBeUndefined()
    expect(query.signal?.aborted).toBe(true)
    expect(getActiveRequestsCount()).toBe(0)
    expect(interceptors.response.fulfilled({ config: mutation })).toEqual({ config: mutation })
  })

  it('导航开始时只取消当前活跃请求，导航结束不主动取消', () => {
    const interceptors = createAxiosInterceptorFake()
    const first = interceptors.request.fulfilled({})
    const second = interceptors.request.fulfilled({})

    setNavigatingState(false)
    expect(first.signal?.aborted).toBe(false)
    expect(second.signal?.aborted).toBe(false)
    expect(getActiveRequestsCount()).toBe(2)

    setNavigatingState(true)
    expect(first.signal?.aborted).toBe(true)
    expect(second.signal?.aborted).toBe(true)
    expect(getActiveRequestsCount()).toBe(0)
  })

  it('手动全量取消会中断并清空所有自动管理的请求', () => {
    const interceptors = createAxiosInterceptorFake()
    const first = interceptors.request.fulfilled({})
    const second = interceptors.request.fulfilled({})

    abortAllRequests()

    expect(first.signal?.aborted).toBe(true)
    expect(second.signal?.aborted).toBe(true)
    expect(getActiveRequestsCount()).toBe(0)
  })

  it('准确识别 Axios / Fetch 取消错误并区分普通业务错误', () => {
    expect(isRequestCanceledError({ code: 'ERR_CANCELED', message: 'canceled' })).toBe(true)
    expect(isRequestCanceledError({ name: 'CanceledError', message: 'canceled' })).toBe(true)
    expect(isRequestCanceledError({ name: 'AbortError', message: 'aborted' })).toBe(true)
    expect(isRequestCanceledError({ __CANCEL__: true })).toBe(true)
    expect(isRequestCanceledError(new Error('网络错误'))).toBe(false)
    expect(isRequestCanceledError(null)).toBe(false)
  })

  it('快速切页中断在途请求时抑制 canceled 及短窗口内的错误提示，不误杀正常提示', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-22T03:00:00.000Z'))

    // 未发生导航中断时，普通错误正常展示，纯 canceled 文案仍被抑制
    expect(wasRequestRecentlyAborted()).toBe(false)
    expect(shouldSuppressNavigationErrorToast({ type: 'error', content: '保存失败' })).toBe(false)
    expect(shouldSuppressNavigationErrorToast({ type: 'error', content: 'canceled' })).toBe(true)
    expect(shouldSuppressNavigationErrorToast({ type: 'error', content: '加载失败：canceled' })).toBe(true)
    expect(shouldSuppressNavigationErrorToast({ type: 'success', content: 'canceled' })).toBe(false)

    // 没有活跃请求时的导航不应误触发静默窗口
    setNavigatingState(true)
    expect(wasRequestRecentlyAborted()).toBe(false)
    expect(shouldSuppressNavigationErrorToast({ type: 'error', content: '请求失败' })).toBe(false)

    // 有在途请求被导航取消时，短窗口内抑制 error toast，但放行 success/info
    const interceptors = createAxiosInterceptorFake()
    interceptors.request.fulfilled({})
    setNavigatingState(true)
    expect(wasRequestRecentlyAborted()).toBe(true)
    expect(shouldSuppressNavigationErrorToast({ type: 'error', content: '请求失败' })).toBe(true)
    expect(shouldSuppressNavigationErrorToast({ type: 'info', content: '提示' })).toBe(false)

    // 超过抑制窗口后，新页面的真实报错正常展示
    vi.advanceTimersByTime(300)
    expect(wasRequestRecentlyAborted()).toBe(false)
    expect(shouldSuppressNavigationErrorToast({ type: 'error', content: '服务器异常' })).toBe(false)
  })
})
