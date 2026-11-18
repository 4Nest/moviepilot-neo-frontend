import UserProfile from '@/layouts/default/components/UserProfile.vue'
import { useUserStore } from '@/stores'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  routerPush: vi.fn(),
  savedCssHandler: undefined as ((css: string) => Promise<void>) | undefined,
  removeMqlListener: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: mocks.apiGet,
    post: mocks.apiPost,
  },
}))

vi.mock('@/router', () => ({
  default: { push: mocks.routerPush },
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}))

vi.mock('@/composables/usePWA', () => ({
  usePWA: () => ({ appMode: ref(false), uiMode: ref('desktop'), setUIMode: vi.fn() }),
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (_comp: unknown, _props: unknown, listeners?: { save?: (css: string) => Promise<void> }) => {
    if (listeners?.save) mocks.savedCssHandler = listeners.save
    return { close: vi.fn(), updateProps: vi.fn() }
  },
  clearSharedDialogs: vi.fn(),
}))

describe('UserProfile.vue custom CSS singleton & cleanup', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.routerPush.mockReset()
    mocks.removeMqlListener.mockReset()
    mocks.savedCssHandler = undefined
    document.getElementById('mp-user-custom-css')?.remove()

    vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: mocks.removeMqlListener,
      dispatchEvent: vi.fn(),
    }))

    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'system/setting/UserCustomCSS') {
        return Promise.resolve({ success: true, data: { value: 'body { --test-a: 1; }' } })
      }
      return Promise.resolve({ success: true })
    })
    mocks.apiPost.mockResolvedValue({ success: true })
  })

  afterEach(() => {
    document.getElementById('mp-user-custom-css')?.remove()
    vi.restoreAllMocks()
  })

  it('reuses singleton #mp-user-custom-css, updates DOM on save, removes on logout, and cleans up matchMedia on unmount', async () => {
    const view1 = await renderWithProviders(UserProfile, { global: { stubs: { VImg: true } } })
    const userStore = useUserStore()
    userStore.setSuperUser(true)

    await waitFor(() =>
      expect(document.getElementById('mp-user-custom-css')?.textContent).toBe('body { --test-a: 1; }'),
    )
    expect(document.querySelectorAll('#mp-user-custom-css')).toHaveLength(1)

    view1.unmount()
    expect(mocks.removeMqlListener).toHaveBeenCalledWith('change', expect.any(Function))

    // 再次挂载仍复用同一个 #mp-user-custom-css 单例
    const view2 = await renderWithProviders(UserProfile, { global: { stubs: { VImg: true } } })
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledTimes(2))
    expect(document.querySelectorAll('#mp-user-custom-css')).toHaveLength(1)

    // 打开菜单并保存新 CSS，即时更新 DOM
    const avatarEl = view2.container.querySelector('.user-profile-avatar') as HTMLElement
    await fireEvent.click(avatarEl)
    const themeItem = await screen.findByText('主题')
    await fireEvent.click(themeItem)
    const customCssItem = await screen.findByText('附加样式')
    await fireEvent.click(customCssItem)

    expect(mocks.savedCssHandler).toBeTypeOf('function')
    await mocks.savedCssHandler!('body { --test-b: 2; }')
    expect(document.getElementById('mp-user-custom-css')?.textContent).toBe('body { --test-b: 2; }')

    // 点击退出登录应移除 #mp-user-custom-css
    const logoutBtn = await screen.findByRole('button', { name: /退出登录/, hidden: true })
    await fireEvent.click(logoutBtn)
    expect(document.getElementById('mp-user-custom-css')).toBeNull()

    view2.unmount()
  })
})
