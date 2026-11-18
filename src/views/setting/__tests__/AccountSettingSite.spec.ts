import AccountSettingSite from '@/views/setting/AccountSettingSite.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    default: {
      get: mocks.apiGet,
      post: mocks.apiPost,
    },
  }
})

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

vi.mock('@/composables/useSilentSettingRefresh', () => ({
  useSilentSettingRefresh: vi.fn(),
}))

describe('AccountSettingSite', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()

    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'system/env') return Promise.resolve({ success: true, data: {} })
      return Promise.resolve({ success: true })
    })
  })

  it('recovers resetSites button state in finally and shows error toast when reset throws', async () => {
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'site/reset') return Promise.reject(new Error('站点数据库正忙'))
      return Promise.resolve({ success: true, data: {} })
    })

    await renderWithProviders(AccountSettingSite)
    const confirmCheckbox = await screen.findByRole('checkbox', { name: /确认删除所有站点数据/ })
    await fireEvent.click(confirmCheckbox)

    const resetBtn = screen.getByRole('button', { name: '重置站点数据' })
    expect(resetBtn).not.toBeDisabled()
    await fireEvent.click(resetBtn)

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('站点数据库正忙'))
    })
    expect(resetBtn).not.toBeDisabled()
    expect(resetBtn.textContent).toContain('重置站点数据')
  })

  it('uses getApiErrorMessage when saving site settings fails and isolates loading locks per card', async () => {
    mocks.apiPost.mockRejectedValueOnce({
      response: { data: { detail: 'CookieCloud 地址格式错误' } },
    })

    await renderWithProviders(AccountSettingSite)
    const saveButtons = await screen.findAllByRole('button', { name: '保存' })
    expect(saveButtons).toHaveLength(2)

    await fireEvent.click(saveButtons[0])

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('设置保存失败：CookieCloud 地址格式错误！')
    })
  })
})
