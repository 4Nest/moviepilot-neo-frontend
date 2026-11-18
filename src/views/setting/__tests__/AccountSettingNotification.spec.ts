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
      props: ['modelValue', 'itemKey'],
      template:
        '<div data-testid="notif-draggable" :data-item-key="itemKey"><slot v-for="element in modelValue" name="item" :element="element" /></div>',
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
    await fireEvent.click(screen.getByRole('button', { name: /添加通知渠道/ }))
    await fireEvent.click(await screen.findByText(channel, { selector: '.v-list-item-title' }))
    await fireEvent.click(await screen.findByText('通知1', { selector: '.app-card-summary__title' }))
    expect(screen.getByTestId('notif-draggable').getAttribute('data-item-key')).toBe('id')
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

  it('通知发送范围使用分段胶囊列表替代圆圈表格，支持切换范围并保存', async () => {
    const { container } = await renderWithProviders(AccountSettingNotification)
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('system/setting/NotificationSwitchs'))

    expect(container.querySelector('.v-table')).toBeNull()
    expect(container.querySelector('.v-radio-group')).toBeNull()
    expect(container.querySelector('.mp-empty-hint')).not.toBeNull()
    expect(container.querySelectorAll('.mp-settings-group .mp-settings-row')).toHaveLength(8)
    expect(container.querySelectorAll('.mp-card-footer')).toHaveLength(3)

    const downloadScopeGroup = screen.getByRole('radiogroup', { name: '资源下载' })
    const adminBtn = within(downloadScopeGroup).getByRole('radio', { name: '仅管理员' })
    const allUsersBtn = within(downloadScopeGroup).getByRole('radio', { name: '所有用户' })

    expect(allUsersBtn).toHaveAttribute('aria-checked', 'true')
    expect(adminBtn).toHaveAttribute('aria-checked', 'false')

    await fireEvent.click(adminBtn)
    expect(adminBtn).toHaveAttribute('aria-checked', 'true')
    expect(adminBtn).toHaveClass('is-active')

    const scopeCard = screen.getByText('通知发送范围').closest('.v-card') as HTMLElement
    expect(scopeCard).not.toBeNull()
    await fireEvent.click(within(scopeCard).getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(mocks.apiPost).toHaveBeenCalledWith(
        'system/setting/NotificationSwitchs',
        expect.arrayContaining([expect.objectContaining({ type: '资源下载', action: 'admin' })]),
      ),
    )
  })
})
