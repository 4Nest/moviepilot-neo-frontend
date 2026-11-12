import { useRetryableRemoteComponent } from '@/composables/useRetryableRemoteComponent'
import { loadRemoteComponent } from '@/utils/federationLoader'
import { getFederationRemote, setFederationRemote } from '@/utils/federationRuntime'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref, type Component } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const federationMocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  getRemote: vi.fn(),
  setRemote: vi.fn(),
  unwrapDefault: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: { get: federationMocks.apiGet },
}))

vi.mock('virtual:__federation__', () => ({
  __federation_method_getRemote: federationMocks.getRemote,
  __federation_method_setRemote: federationMocks.setRemote,
  __federation_method_unwrapDefault: federationMocks.unwrapDefault,
}))

vi.mock('@/composables/useChineseText', () => ({
  useI18n: () => ({ t: (key: string) => (key === 'common.retry' ? '重试' : key) }),
}))

function mountRemote(loader: () => Promise<Component>) {
  const Host = defineComponent({
    setup() {
      const component = useRetryableRemoteComponent(loader)
      return () => h(component.value)
    },
  })
  return mount(Host, {
    global: {
      stubs: {
        VAlert: { template: '<div role="alert"><slot /></div>' },
        VBtn: { template: '<button><slot /></button>' },
        VSkeletonLoader: true,
      },
    },
  })
}

describe('useRetryableRemoteComponent', () => {
  beforeEach(() => {
    federationMocks.apiGet.mockReset()
    federationMocks.getRemote.mockReset()
    federationMocks.setRemote.mockReset()
    federationMocks.unwrapDefault.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('offers retry after a 20-second timeout and replaces the failed wrapper with recovered content', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const loader = vi
      .fn<() => Promise<Component>>()
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce(defineComponent({ setup: () => () => h('p', '组件已恢复') }))
    const wrapper = mountRemote(loader)

    try {
      await vi.advanceTimersByTimeAsync(20001)
      expect(wrapper.get('[role="alert"]').text()).toContain('无法加载组件')
      await wrapper.get('button').trigger('click')
      await flushPromises()
      expect(loader).toHaveBeenCalledTimes(2)
      expect(wrapper.text()).toBe('组件已恢复')
    } finally {
      wrapper.unmount()
    }
  })

  it('recreates the wrapper when the remote identity changes', async () => {
    const identity = ref('PluginA')
    const beforeRetry = vi.fn()
    const loader = vi
      .fn<() => Promise<Component>>()
      .mockImplementation(async () => defineComponent({ setup: () => () => h('p', identity.value) }))
    const Host = defineComponent({
      setup() {
        const component = useRetryableRemoteComponent(loader, { identity, beforeRetry })
        return () => h(component.value)
      },
    })
    const wrapper = mount(Host)

    try {
      await flushPromises()
      expect(wrapper.text()).toBe('PluginA')
      identity.value = 'PluginB'
      await nextTick()
      await flushPromises()
      expect(beforeRetry).toHaveBeenCalledOnce()
      expect(loader).toHaveBeenCalledTimes(2)
      expect(wrapper.text()).toBe('PluginB')
    } finally {
      wrapper.unmount()
    }
  })
})

describe('federationRuntime retry registration', () => {
  it('replaces a failed remote with a cache-busted entry before the next load', async () => {
    federationMocks.getRemote.mockReset().mockRejectedValueOnce(new Error('chunk failed')).mockResolvedValueOnce({
      default: 'recovered',
    })
    federationMocks.setRemote.mockReset()
    const config = {
      format: 'esm' as const,
      from: 'vite' as const,
      url: async () => '/remoteEntry.js?version=1#remote',
    }
    setFederationRemote('runtime-retry', config)

    await expect(getFederationRemote('runtime-retry', './Page')).rejects.toThrow('chunk failed')
    // loader 捕获失败后会重新发现并注册同一个 remote，这里验证第二次注册的真实入口。
    setFederationRemote('runtime-retry', config)
    await expect(getFederationRemote('runtime-retry', './Page')).resolves.toEqual({ default: 'recovered' })

    expect(federationMocks.setRemote).toHaveBeenCalledTimes(2)
    const firstConfig = federationMocks.setRemote.mock.calls[0][1] as { url: () => Promise<string> }
    const retryConfig = federationMocks.setRemote.mock.calls[1][1] as { url: () => Promise<string> }
    await expect(firstConfig.url()).resolves.toBe('/remoteEntry.js?version=1#remote')
    await expect(retryConfig.url()).resolves.toBe('/remoteEntry.js?version=1&__mp_retry=1#remote')
  })

  it('discovers and registers another entry version when the user retries a failed loader', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    federationMocks.apiGet.mockReset().mockResolvedValue([{ id: 'loader-retry', url: '/remoteEntry.js' }])
    federationMocks.getRemote
      .mockReset()
      .mockRejectedValueOnce(new Error('initial discovery miss'))
      .mockRejectedValueOnce(new Error('first entry failed'))
      .mockRejectedValueOnce(new Error('cached rejection'))
      .mockResolvedValueOnce({ default: 'recovered' })
    federationMocks.setRemote.mockReset()
    federationMocks.unwrapDefault.mockReset().mockImplementation(module => {
      if (module && typeof module === 'object' && 'default' in module) return module.default
      return module
    })

    await expect(loadRemoteComponent('loader-retry')).rejects.toThrow('first entry failed')
    await expect(loadRemoteComponent('loader-retry')).resolves.toBe('recovered')

    expect(federationMocks.apiGet).toHaveBeenCalledTimes(2)
    expect(federationMocks.setRemote).toHaveBeenCalledTimes(2)
    const firstRetry = federationMocks.setRemote.mock.calls[0][1] as { url: () => Promise<string> }
    const secondRetry = federationMocks.setRemote.mock.calls[1][1] as { url: () => Promise<string> }
    await expect(firstRetry.url()).resolves.toContain('__mp_retry=1')
    await expect(secondRetry.url()).resolves.toContain('__mp_retry=2')
  })
})
