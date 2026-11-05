import NotificationChannelInfoDialog from '@/components/dialog/NotificationChannelInfoDialog.vue'
import type { NotificationConf } from '@/api/types'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  apiPost: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    post: mocks.apiPost,
  },
  getApiErrorMessage: (err: unknown) => (err instanceof Error ? err.message : undefined),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

describe('NotificationChannelInfoDialog', () => {
  beforeEach(() => {
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.apiPost.mockReset().mockResolvedValue({ success: true, data: { rotated: true } })
  })

  it('自动接入不要求填写密钥，修改草稿地址后禁止轮换旧中心的凭据', async () => {
    const notification: NotificationConf = {
      id: 'app-auto',
      name: '手机通知',
      type: 'apppush',
      enabled: true,
      config: {},
    }
    await renderWithProviders(NotificationChannelInfoDialog, {
      props: { modelValue: true, notification, notifications: [notification] },
      global: { stubs: { VDialogCloseBtn: true } },
    })
    const rotate = await screen.findByRole('button', { name: '轮换接入凭据' })
    expect(screen.queryByLabelText('实例中转密钥')).not.toBeInTheDocument()
    await fireEvent.click(rotate)
    await waitFor(() =>
      expect(mocks.apiPost).toHaveBeenCalledWith('notification/app/instance', {
        action: 'rotate',
        source: '手机通知',
      }),
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('接入凭据已轮换，设备绑定保留')
    await fireEvent.update(screen.getByLabelText('消息中心地址（可选）'), 'https://another.test')
    expect(screen.queryByRole('button', { name: '轮换接入凭据' })).not.toBeInTheDocument()
  })

  it('编辑已有手工接入配置时保留密钥并展开兼容入口', async () => {
    const notification: NotificationConf = {
      id: 'app-manual',
      name: '旧手机通知',
      type: 'apppush',
      enabled: true,
      config: { PUSH_SERVER_URL: 'https://relay.test', PUSH_RELAY_KEY: 'existing-private-relay-key-00000001' },
    }
    await renderWithProviders(NotificationChannelInfoDialog, {
      props: { modelValue: true, notification, notifications: [notification] },
      global: { stubs: { VDialogCloseBtn: true } },
    })
    const input = await screen.findByLabelText('实例中转密钥')
    expect(input).toHaveValue(notification.config.PUSH_RELAY_KEY)
    expect(input).toHaveAttribute('type', 'password')
    expect(screen.queryByRole('button', { name: '轮换接入凭据' })).not.toBeInTheDocument()
    expect(mocks.apiPost).not.toHaveBeenCalled()
  })
})
