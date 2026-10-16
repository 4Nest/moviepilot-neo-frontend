import AccountSettingNotification from '@/views/setting/AccountSettingNotification.vue'
import SharedDialogHost from '@/components/dialog/SharedDialogHost.vue'
import { closeSharedDialog } from '@/composables/useSharedDialog'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn(), toastError: vi.fn() }))

vi.mock('@/api', () => ({
  default: { get: mocks.apiGet, post: mocks.apiPost },
  getApiErrorMessage: () => '',
}))
vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: vi.fn() }),
}))
vi.mock('@/composables/useSilentSettingRefresh', () => ({ useSilentSettingRefresh: vi.fn() }))
vi.mock('@/composables/useCardAccentColor', () => ({
  useCardAccentColor: () => ({ accentRgb: ref('141, 81, 249'), imageRef: ref(), updateAccentColor: vi.fn() }),
}))
vi.mock('vuedraggable', async () => {
  const { defineComponent } = await import('vue')
  return {
    default: defineComponent({
      props: ['modelValue'],
      template: '<div><slot v-for="element in modelValue" name="item" :element="element" /></div>',
    }),
  }
})

describe('通知渠道设置', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.apiGet.mockResolvedValue({ data: { value: null } })
    mocks.apiPost.mockResolvedValue({ success: true })
    mocks.toastError.mockReset()
  })

  afterEach(() => {
    closeSharedDialog()
    vi.unstubAllGlobals()
  })

  it.each([
    ['Telegram', 'Bot Token'],
    ['企业微信', '企业ID'],
  ])('局域网 HTTP 下可添加、配置并保存 %s', async (channel, fieldLabel) => {
    vi.stubGlobal('crypto', { randomUUID: undefined })
    const wrapper = defineComponent({
      components: { AccountSettingNotification, SharedDialogHost },
      template: '<div><AccountSettingNotification /><SharedDialogHost /></div>',
    })
    await renderWithProviders(wrapper, { global: { stubs: { VImg: true, VDialogCloseBtn: true } } })
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('system/setting/Notifications'))
    await fireEvent.click(screen.getByRole('button', { name: '添加' }))
    await fireEvent.click(await screen.findByText(channel, { selector: '.v-list-item-title' }))
    await fireEvent.click(await screen.findByText('通知1', { selector: '.app-card-summary__title' }))
    const dialog = await screen.findByRole('dialog')
    await fireEvent.update(await within(dialog).findByLabelText(fieldLabel), 'test-channel-value')
    await fireEvent.click(within(dialog).getByRole('button', { name: '确认' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await fireEvent.click(screen.getAllByRole('button', { name: '保存' })[0])
    await waitFor(() =>
      expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/Notifications', [
        expect.objectContaining({
          id: expect.any(String),
          config: expect.objectContaining({
            [channel === 'Telegram' ? 'TELEGRAM_TOKEN' : 'WECHAT_CORPID']: 'test-channel-value',
          }),
        }),
      ]),
    )
    expect(mocks.toastError).not.toHaveBeenCalled()
  })
})
