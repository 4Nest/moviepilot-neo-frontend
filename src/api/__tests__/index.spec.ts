import { AxiosError } from 'axios'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/router', () => ({
  default: { push: vi.fn() },
}))

import api from '@/api'

describe('api response error interceptor localized network messages', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const getRejectedHandler = () => {
    const handlers = (
      api.interceptors.response as unknown as { handlers: Array<{ rejected: (e: unknown) => Promise<never> }> }
    ).handlers
    return handlers[handlers.length - 1].rejected
  }

  it('formats ERR_NETWORK as Chinese network failure message', async () => {
    const rejected = getRejectedHandler()
    const err = new AxiosError('Network Error', 'ERR_NETWORK')
    await expect(rejected(err)).rejects.toThrow('网络连接失败，请检查网络状态')
  })

  it('formats ETIMEDOUT as Chinese timeout message', async () => {
    const rejected = getRejectedHandler()
    const err = new AxiosError('timeout of 5000ms exceeded', 'ETIMEDOUT')
    await expect(rejected(err)).rejects.toThrow('请求超时，请稍后重试')
  })

  it('formats generic network error without response as Chinese fallback message', async () => {
    const rejected = getRejectedHandler()
    const err = new AxiosError('', 'ERR_BAD_OPTION')
    await expect(rejected(err)).rejects.toThrow('网络请求异常')
  })
})
