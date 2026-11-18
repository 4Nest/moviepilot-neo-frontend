import AccountSettingSubscribe from '@/views/setting/AccountSettingSubscribe.vue'
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
    default: { get: mocks.apiGet, post: mocks.apiPost },
  }
})

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

vi.mock('@/composables/useSilentSettingRefresh', () => ({ useSilentSettingRefresh: vi.fn() }))

vi.mock('@/views/setting/SubscribeAutoFillSetting.vue', () => ({
  default: { template: '<div data-testid="auto-fill-stub" />' },
}))

describe('AccountSettingSubscribe', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()

    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'site/') return Promise.resolve([])
      if (url === 'system/setting/UserFilterRuleGroups') return Promise.resolve({ data: { value: null } })
      if (url === 'system/setting/RssSites') return Promise.resolve({ data: { value: null } })
      if (url === 'system/setting/SubscribeFilterRuleGroups')
        return Promise.resolve({ success: true, data: { value: null } })
      if (url === 'system/setting/BestVersionFilterRuleGroups')
        return Promise.resolve({ success: true, data: { value: null } })
      if (url === 'system/env') return Promise.resolve({ success: true, data: {} })
      return Promise.resolve({ success: true, data: {} })
    })
    mocks.apiPost.mockResolvedValue({ success: true })
  })

  it('defaults SUBSCRIBE_MODE to spider and normalizes null array settings to []', async () => {
    await renderWithProviders(AccountSettingSubscribe)
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('system/env'))

    const saveButtons = screen.getAllByRole('button', { name: '保存' })
    await fireEvent.click(saveButtons[0])

    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/SubscribeFilterRuleGroups', [])
      expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/BestVersionFilterRuleGroups', [])
      expect(mocks.apiPost).toHaveBeenCalledWith(
        'system/env',
        expect.objectContaining({
          SUBSCRIBE_MODE: 'spider',
        }),
      )
    })
  })
})
