import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { VCard, VCardItem, VCardTitle, VDialog } from 'vuetify/components'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/@core/utils/image', () => ({
  getDominantColor: vi.fn(async () => '#28A9E1'),
}))

import NativeNavigationHost from '@/components/native/NativeNavigationHost.vue'
import { useConfirm } from '@/composables/useConfirm'
import QuickAccess from '@/layouts/default/components/QuickAccess.vue'
import SearchBar from '@/layouts/default/components/SearchBar.vue'
import ShortcutBar from '@/layouts/default/components/ShortcutBar.vue'
import UserNotification from '@/layouts/default/components/UserNotification.vue'
import UserProfile from '@/layouts/default/components/UserProfile.vue'
import type { NativeConfirmation, NativeEnvelope, NativeSheet } from '@/native/protocol'
import { useAuthStore, useUserStore } from '@/stores'
import { renderWithProviders } from '@tests/support/render'

const capabilities = ['navigation.v1', 'actions.v1', 'layout.v1', 'menu.v1', 'notifications.v1']

describe('NEO MoviePilot-App native compatibility', () => {
  beforeEach(() => {
    localStorage.clear()
    delete window.MoviePilotNative
    delete document.documentElement.dataset.nativeChrome
  })

  it('completes the chrome handshake and preserves native presentation and authentication behavior', async () => {
    const sentMessages: NativeEnvelope[] = []
    const authenticationRequired = vi.fn()
    window.MoviePilotNative = {
      transportVersion: 1,
      sheetsVersion: 1,
      panelsVersion: 1,
      panelFeedsVersion: 1,
      confirmationsVersion: 1,
      postMessage: message => sentMessages.push(message),
      authenticationRequired,
    }

    const sheetOpen = ref(false)
    const AppShell = defineComponent({
      setup() {
        return () =>
          h('div', [
            h(SearchBar),
            h(ShortcutBar),
            h(UserNotification),
            h(QuickAccess, { visible: false }),
            h(UserProfile),
            h('button', { type: 'button', onClick: () => (sheetOpen.value = true) }, '打开普通弹窗'),
            h(
              VDialog,
              {
                modelValue: sheetOpen.value,
                'onUpdate:modelValue': (value: boolean) => (sheetOpen.value = value),
              },
              {
                default: () =>
                  h(VCard, null, {
                    default: () => [
                      h(VCardItem, null, {
                        default: () => [
                          h(VCardTitle, null, { default: () => '普通原生弹窗' }),
                          h(
                            'button',
                            {
                              type: 'button',
                              'data-native-dialog-close': '',
                              onClick: () => (sheetOpen.value = false),
                            },
                            '关闭普通弹窗',
                          ),
                        ],
                      }),
                    ],
                  }),
              },
            ),
            h(NativeNavigationHost),
          ])
      },
    })

    const { pinia, router } = await renderWithProviders(AppShell, {
      initialRoute: '/dashboard',
      initialRouteMeta: { requiresAuth: true },
      initialState: {
        auth: { token: 'neo-app-token', remember: true },
      },
      stubActions: false,
    })
    const authStore = useAuthStore(pinia)
    const userStore = useUserStore(pinia)
    authStore.setToken('neo-app-token')
    userStore.setUserID(1)
    userStore.setUserName('admin')

    const lastNavigationState = () => sentMessages.findLast(message => message.type === 'navigation.state')
    const dispatch = async (type: string, payload: Record<string, unknown>, requestId: string) => {
      const routeRevision = lastNavigationState()?.routeRevision
      window.dispatchEvent(
        new CustomEvent('moviepilot:native-message', {
          detail: {
            protocol: 'moviepilot.chrome',
            major: 1,
            type,
            requestId,
            sessionId: 'neo-app-session',
            ...(routeRevision === undefined ? {} : { routeRevision }),
            payload,
          },
        }),
      )
      await flushPromises()
    }

    await waitFor(() => expect(sentMessages.some(message => message.type === 'web.ready')).toBe(true))
    const ready = sentMessages.find(message => message.type === 'web.ready')!
    expect(ready.payload.capabilities).toEqual(capabilities)

    await dispatch('host.configure', { sessionId: 'neo-app-session', major: 1, capabilities }, 'neo-configure')
    await waitFor(() => expect(lastNavigationState()).toBeDefined())

    const initialState = lastNavigationState()!
    const roots = initialState.payload.roots as Array<{ id: string; path: string }>
    expect(roots.map(root => root.id)).toEqual(['/dashboard', '/recommend', '/discover', '/apps'])
    expect(roots.map(root => root.path)).toEqual(['/dashboard', '/recommend', '/discover', '/apps'])
    const actions = initialState.payload.actions as Array<{ actionId: string; scope: string }>
    const globalActions = actions.filter(action => action.scope === 'global')
    expect(globalActions.map(action => action.actionId.split(':').pop())).toEqual(
      expect.arrayContaining(['search', 'shortcuts', 'notifications', 'plugins', 'profile']),
    )
    expect(globalActions).toHaveLength(5)
    const chrome = initialState.payload.chrome as Record<string, unknown>
    expect(chrome.accentColor).toMatch(/^#[0-9a-fA-F]{6}$/)

    await dispatch(
      'chrome.prepare',
      {
        layoutRevision: 1,
        viewportPoints: { width: window.innerWidth, height: window.innerHeight },
        contentInsets: { top: 44, left: 0, bottom: 83, right: 0 },
        systemSafeArea: { top: 20, left: 0, bottom: 34, right: 0 },
        chromeOcclusion: { top: 24, left: 0, bottom: 49, right: 0 },
        keyboardOcclusion: 0,
        consumedByNativeFrame: false,
      },
      'neo-prepare',
    )
    await waitFor(() => {
      expect(sentMessages.some(message => message.type === 'chrome.accepted')).toBe(true)
    })
    const accepted = sentMessages.findLast(message => message.type === 'chrome.accepted')!
    expect(accepted.payload.layoutRevision).toBe(1)
    expect(document.documentElement.dataset.nativeChrome).toBe('active')
    expect(document.documentElement.style.getPropertyValue('--native-top')).toBe('44px')
    expect(document.documentElement.style.getPropertyValue('--native-left')).toBe('0px')
    expect(document.documentElement.style.getPropertyValue('--native-bottom')).toBe('83px')
    expect(document.documentElement.style.getPropertyValue('--native-right')).toBe('0px')
    expect(document.documentElement.style.getPropertyValue('--native-keyboard-occlusion')).toBe('0px')

    const confirmationResult = useConfirm()({
      type: 'error',
      title: '原生确认测试',
      content: '确认正文',
      confirmText: '确认执行',
      cancelText: '取消执行',
    })
    await screen.findByText('原生确认测试')
    await waitFor(() => {
      const presentation = lastNavigationState()?.payload.presentation as
        { confirmation?: NativeConfirmation } | undefined
      expect(presentation?.confirmation?.title).toBe('原生确认测试')
    })
    const confirmation = (lastNavigationState()!.payload.presentation as { confirmation: NativeConfirmation })
      .confirmation
    expect(confirmation.message).toBe('确认正文')
    await dispatch('confirmation.respond', { id: confirmation.id, confirmed: true }, 'neo-confirmation-respond')
    await expect(confirmationResult).resolves.toBe(true)
    await waitFor(() => {
      expect(
        sentMessages.some(
          message =>
            message.type === 'command.result' &&
            message.payload.requestId === 'neo-confirmation-respond' &&
            message.payload.accepted === true,
        ),
      ).toBe(true)
    })

    await fireEvent.click(screen.getByRole('button', { name: '打开普通弹窗' }))
    await screen.findByText('普通原生弹窗')
    await waitFor(() => {
      const presentation = lastNavigationState()?.payload.presentation as { sheet?: NativeSheet } | undefined
      expect(presentation?.sheet?.title).toBe('普通原生弹窗')
    })
    const sheet = (lastNavigationState()!.payload.presentation as { sheet: NativeSheet }).sheet
    expect(sheet.canDismiss).toBe(true)
    await dispatch('presentation.dismiss', { id: sheet.id }, 'neo-presentation-dismiss')
    await waitFor(() => {
      expect(
        sentMessages.some(
          message =>
            message.type === 'command.result' &&
            message.payload.requestId === 'neo-presentation-dismiss' &&
            message.payload.accepted === true,
        ),
      ).toBe(true)
    })
    expect(sheetOpen.value).toBe(false)
    await waitFor(() => {
      expect(document.querySelector('.v-overlay--active.v-dialog')).toBeNull()
      const presentation = lastNavigationState()?.payload.presentation as { sheet?: NativeSheet } | undefined
      expect(presentation?.sheet).toBeUndefined()
    })

    await router.push('/login')
    await nextTick()
    expect(authenticationRequired).toHaveBeenCalled()
  })
})
