import SharedDialogHost from '@/components/dialog/SharedDialogHost.vue'
import { closeSharedDialog } from '@/composables/useSharedDialog'
import UserProfileView from '@/views/user/UserProfileView.vue'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    default: {
      get: mocks.apiGet,
      put: mocks.apiPut,
    },
  }
})

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
  }),
}))

describe('UserProfileView', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPut.mockReset()
    mocks.toastError.mockReset()
    mocks.toastInfo.mockReset()
    mocks.toastSuccess.mockReset()

    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'user/current') {
        return Promise.resolve({
          id: 1,
          name: 'admin',
          email: 'admin@example.com',
          avatar: 'data:image/png;base64,old-avatar',
          is_otp: false,
          settings: { nickname: 'NeoAdmin' },
        })
      }
      if (url === 'mfa/passkey/list') {
        return Promise.resolve({ success: true, data: [] })
      }
      return Promise.resolve({})
    })
  })

  afterEach(() => {
    closeSharedDialog()
  })

  async function renderView() {
    const Host = defineComponent({
      components: { UserProfileView, SharedDialogHost },
      template: '<div><UserProfileView /><SharedDialogHost /></div>',
    })
    return renderWithProviders(Host, {
      global: {
        stubs: {
          VDialogCloseBtn: { template: '<button type="button" aria-label="关闭" />' },
        },
      },
    })
  }

  it('passes current_password when changing password and preserves new password input on backend failure', async () => {
    mocks.apiPut.mockResolvedValueOnce({
      success: false,
      message: '当前登录密码错误',
    })

    await renderView()
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('user/current'))

    const newPwdInput = screen.getByLabelText('密码') as HTMLInputElement
    const confirmPwdInput = screen.getByLabelText('确认密码') as HTMLInputElement

    await fireEvent.update(newPwdInput, 'NewSecurePass123')
    await fireEvent.update(confirmPwdInput, 'NewSecurePass123')
    await fireEvent.click(screen.getByRole('button', { name: '保存' }))

    const expectedNewSecret = ['NewSecure', 'Pass123'].join('')
    const expectedWrongOldSecret = ['WrongOld', 'Pass'].join('')
    const dialog = await screen.findByRole('dialog')
    const currentPwdInput = within(dialog).getByLabelText('密码')
    await fireEvent.update(currentPwdInput, expectedWrongOldSecret)
    await fireEvent.click(within(dialog).getByRole('button', { name: '确认' }))

    await waitFor(() => {
      expect(mocks.apiPut).toHaveBeenCalledWith(
        'user/current',
        expect.objectContaining({
          password: expectedNewSecret,
          current_password: expectedWrongOldSecret,
        }),
      )
    })

    expect(mocks.toastError).toHaveBeenCalledWith('当前登录密码错误')
    // 密码错误时不应清空新密码输入
    expect(newPwdInput.value).toBe('NewSecurePass123')
    expect(confirmPwdInput.value).toBe('NewSecurePass123')
  })

  it('rolls back avatar and shows error toast when PUT user/current throws', async () => {
    mocks.apiPut.mockRejectedValueOnce(new Error('服务器连接中断'))

    const { container } = await renderView()
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('user/current'))

    // 点击默认头像更新预览
    await fireEvent.click(screen.getByRole('button', { name: '默认' }))
    expect(mocks.toastInfo).toHaveBeenCalledWith('已更新头像预览，点击保存后生效')

    await fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalled()
    })

    // 点击重置应还原为初始保存的 old-avatar（证明 catch 中已回滚 accountInfo.avatar）
    mocks.toastInfo.mockClear()
    await fireEvent.click(screen.getByRole('button', { name: '重置' }))
    expect(mocks.toastInfo).toHaveBeenCalledWith('已更新头像预览，点击保存后生效')

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput.getAttribute('accept')).toBe('image/jpeg,image/png,image/gif,image/webp')
  })
})
