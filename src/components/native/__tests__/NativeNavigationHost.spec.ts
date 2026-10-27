import { defineComponent, h, nextTick } from 'vue'
import { waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/@core/utils/image', () => ({
  getDominantColor: vi.fn(async () => '#28A9E1'),
}))
import { renderWithProviders } from '@tests/support/render'
import NativeNavigationHost from '@/components/native/NativeNavigationHost.vue'
import SearchBar from '@/layouts/default/components/SearchBar.vue'
import ShortcutBar from '@/layouts/default/components/ShortcutBar.vue'
import UserNotification from '@/layouts/default/components/UserNotification.vue'
import QuickAccess from '@/layouts/default/components/QuickAccess.vue'
import UserProfile from '@/layouts/default/components/UserProfile.vue'
import { useRecentPlugins } from '@/composables/useRecentPlugins'
import { useAuthStore, useUserStore } from '@/stores'
import type { NativeEnvelope } from '@/native/protocol'

describe('NativeNavigationHost and Step 4 global panels', () => {
  beforeEach(() => {
    localStorage.clear()
    delete window.MoviePilotNative
    delete document.documentElement.dataset.nativeChrome
  })

  it('manages pinned plugins with a cap of 6 in useRecentPlugins', () => {
    const { getPinnedPluginIds, togglePinnedPlugin } = useRecentPlugins()
    expect(getPinnedPluginIds()).toEqual([])

    for (let i = 1; i <= 7; i++) {
      togglePinnedPlugin(`plugin-${i}`)
    }
    expect(getPinnedPluginIds()).toEqual(['plugin-7', 'plugin-6', 'plugin-5', 'plugin-4', 'plugin-3', 'plugin-2'])

    togglePinnedPlugin('plugin-5')
    expect(getPinnedPluginIds()).toEqual(['plugin-7', 'plugin-6', 'plugin-4', 'plugin-3', 'plugin-2'])
  })

  it('completes handshake, projects 4 roots, moreMenu, 5 global panels, and handles /login auth callback', async () => {
    const sentMessages: NativeEnvelope[] = []
    const authenticationRequired = vi.fn()
    window.MoviePilotNative = {
      transportVersion: 1,
      panelsVersion: 1,
      panelFeedsVersion: 1,
      sheetsVersion: 1,
      confirmationsVersion: 1,
      postMessage: message => {
        sentMessages.push(message)
      },
      authenticationRequired,
    }

    const AppShell = defineComponent({
      setup() {
        return () =>
          h('div', [
            h(SearchBar),
            h(ShortcutBar),
            h(UserNotification),
            h(QuickAccess, { visible: false }),
            h(UserProfile),
            h(NativeNavigationHost),
          ])
      },
    })

    const { pinia, router } = await renderWithProviders(AppShell, {
      initialRoute: '/dashboard',
      initialRouteMeta: { requiresAuth: true },
      initialState: {
        auth: { token: 'neo-test-token', remember: true },
      },
      stubActions: false,
    })

    const authStore = useAuthStore(pinia)
    const userStore = useUserStore(pinia)
    expect(userStore.superUser).toBe(true)
    expect(userStore.permissions).toEqual({})

    authStore.setToken('neo-test-token')
    userStore.setUserID(1)
    userStore.setUserName('admin')

    await waitFor(() => {
      expect(sentMessages.some(msg => msg.type === 'web.ready')).toBe(true)
    })

    const readyMsg = sentMessages.find(msg => msg.type === 'web.ready')!
    expect(readyMsg.payload.capabilities).toEqual([
      'navigation.v1',
      'actions.v1',
      'layout.v1',
      'menu.v1',
      'notifications.v1',
    ])

    window.dispatchEvent(
      new CustomEvent('moviepilot:native-message', {
        detail: {
          protocol: 'moviepilot.chrome',
          major: 1,
          type: 'host.configure',
          requestId: 'req-config-1',
          sessionId: 'sess-1',
          payload: {
            sessionId: 'sess-1',
            major: 1,
            capabilities: ['navigation.v1', 'actions.v1', 'layout.v1', 'menu.v1', 'notifications.v1'],
          },
        },
      }),
    )

    await waitFor(() => {
      expect(sentMessages.some(msg => msg.type === 'navigation.state')).toBe(true)
    })

    const navState = sentMessages.findLast(msg => msg.type === 'navigation.state')!
    const roots = navState.payload.roots as Array<{ id: string }>
    expect(roots.map(r => r.id)).toEqual(['/dashboard', '/recommend', '/discover', '/apps'])

    const actions = navState.payload.actions as Array<{ actionId: string; scope: string; icon: string }>
    const globalActionIds = actions.filter(a => a.scope === 'global').map(a => a.actionId.split(':').pop())
    expect(globalActionIds).toEqual(
      expect.arrayContaining(['search', 'shortcuts', 'notifications', 'plugins', 'profile']),
    )

    const chrome = navState.payload.chrome as Record<string, string>
    expect(chrome.accentColor).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(chrome.backgroundColor).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(chrome.surfaceColor).toMatch(/^#[0-9a-fA-F]{6}$/)

    await router.push('/login')
    await nextTick()
    expect(authenticationRequired).toHaveBeenCalled()
  })
})
