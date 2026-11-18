import { openSharedDialog, useSharedDialog } from '@/composables/useSharedDialog'
import { useAuthStore } from '@/stores/auth'
import { usePluginSidebarNavStore } from '@/stores/pluginSidebarNav'
import { useUserStore } from '@/stores/user'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    delete window.MoviePilotNative
    vi.unstubAllGlobals()
  })

  it('starts with the unauthenticated state and matching getters', () => {
    const authStore = useAuthStore()

    expect(authStore.$state).toEqual({ token: null, remember: false, originalPath: null })
    expect(authStore.getToken).toBeNull()
    expect(authStore.getRemember).toBe(false)
    expect(authStore.getOriginalPath).toBeNull()
  })

  it('logs in and updates independent authentication fields', () => {
    const authStore = useAuthStore()

    authStore.setOriginalPath('/recommend')
    authStore.login({ token: 'test-token', remember: true, originalPath: '/ignored' })

    expect(authStore.token).toBe('test-token')
    expect(authStore.remember).toBe(true)
    expect(authStore.originalPath).toBe('/recommend')

    authStore.setRemember(false)
    authStore.clearToken()
    expect(authStore.getRemember).toBe(false)
    expect(authStore.getToken).toBeNull()
  })

  it('logs out and clears plugin navigation state and shared dialogs', () => {
    const authStore = useAuthStore()
    const pluginNavStore = usePluginSidebarNavStore()
    const pendingRequest = Promise.resolve()

    authStore.login({ token: 'test-token', remember: true })
    openSharedDialog(defineComponent({ setup: () => () => h('div', 'active-dialog') }))
    expect(useSharedDialog().dialogs.value).toHaveLength(1)
    authStore.setOriginalPath('/plugins')
    pluginNavStore.$patch({
      inflight: pendingRequest,
      items: [
        {
          icon: 'mdi-test-tube',
          nav_key: 'main',
          order: 1,
          plugin_id: 'demo',
          section: 'system',
          title: 'Demo',
        },
      ],
      loaded: true,
    })

    authStore.logout()

    expect(authStore.token).toBeNull()
    expect(authStore.originalPath).toBeNull()
    expect(authStore.remember).toBe(true)
    expect(pluginNavStore.items).toEqual([])
    expect(pluginNavStore.loaded).toBe(false)
    expect(pluginNavStore.inflight).toBeNull()
    expect(useSharedDialog().dialogs.value).toHaveLength(0)
  })

  it('重启或认证失效后重新登录保留通知绑定，主动退出仍撤销当前安装', () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetch)
    window.MoviePilotNative = {
      transportVersion: 1,
      postMessage: vi.fn(),
      notificationInstallation: 'installation-0001',
    }
    const authStore = useAuthStore()
    authStore.login({ token: 'before-restart', remember: true })

    authStore.resetSession()
    expect(authStore.token).toBeNull()
    expect(fetch).not.toHaveBeenCalled()

    authStore.login({ token: 'after-restart', remember: true })
    expect(fetch).not.toHaveBeenCalled()
    authStore.logout()

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer after-restart')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      action: 'unregister',
      installation: 'installation-0001',
      origin: location.origin,
    })
    expect(authStore.token).toBeNull()
  })

  it('resetSession 同步调用 userStore.reset() 清空缓存的用户资料与权限', () => {
    const authStore = useAuthStore()
    const userStore = useUserStore()

    authStore.login({ token: 'active-token', remember: true })
    userStore.loginUser({
      superUser: false,
      userID: 42,
      userName: 'demo-user',
      avatar: 'data:image/png;base64,abc',
      level: 2,
      wizard: true,
      permissions: { subscribe: true },
    })

    authStore.resetSession()

    expect(authStore.token).toBeNull()
    expect(userStore.userID).toBe(-1)
    expect(userStore.userName).toBe('')
    expect(userStore.avatar).toBe('')
    expect(userStore.superUser).toBe(true)
    expect(userStore.level).toBe(1)
    expect(userStore.wizard).toBe(false)
    expect(userStore.permissions).toEqual({})
  })
})
