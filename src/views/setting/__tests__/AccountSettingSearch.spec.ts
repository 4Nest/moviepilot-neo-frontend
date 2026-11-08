import AccountSettingSearch from '@/views/setting/AccountSettingSearch.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: { get: mocks.apiGet, post: mocks.apiPost },
}))
vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))
vi.mock('@/composables/useSilentSettingRefresh', () => ({ useSilentSettingRefresh: vi.fn() }))

describe('AccountSettingSearch', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()

    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'site/') return Promise.resolve([])
      if (path === 'system/setting/UserFilterRuleGroups') return Promise.resolve({ data: { value: [] } })
      if (path === 'system/setting/public/IndexerSites') return Promise.resolve({ data: { value: [] } })
      if (path === 'system/setting/SEARCH_SOURCE')
        return Promise.resolve({ success: true, data: { value: 'themoviedb' } })
      if (path === 'system/setting/SearchFilterRuleGroups')
        return Promise.resolve({ success: true, data: { value: [] } })
      if (path === 'system/env') {
        return Promise.resolve({
          success: true,
          data: {
            SEARCH_MULTIPLE_NAME: false,
            DOWNLOAD_SUBTITLE: true,
            TORRENT_TAG: 'MOVIEPILOT',
          },
        })
      }
      return Promise.resolve({ success: true, data: {} })
    })
    mocks.apiPost.mockResolvedValue({ success: true })
  })

  it('defaults SEARCH_RESOURCE_PAGES to 3 in search settings and saves updated or fallback value', async () => {
    await renderWithProviders(AccountSettingSearch)

    expect(screen.queryByLabelText('远程搜索自动下载用户')).not.toBeInTheDocument()
    const pagesInput = (await screen.findByLabelText('搜索资源获取页数')) as HTMLInputElement
    await waitFor(() => expect(pagesInput.value).toBe('3'))

    await fireEvent.update(pagesInput, '5')
    await fireEvent.click(screen.getAllByRole('button', { name: '保存' })[0])

    await waitFor(() =>
      expect(mocks.apiPost).toHaveBeenCalledWith(
        'system/env',
        expect.objectContaining({
          SEARCH_RESOURCE_PAGES: 5,
        }),
      ),
    )

    await fireEvent.update(pagesInput, '0')
    await fireEvent.click(screen.getAllByRole('button', { name: '保存' })[0])

    await waitFor(() =>
      expect(mocks.apiPost).toHaveBeenLastCalledWith(
        'system/env',
        expect.objectContaining({
          SEARCH_RESOURCE_PAGES: 3,
        }),
      ),
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('搜索基础设置保存成功')
  })
})
