import RecognitionCachePanel from '@/components/cache/RecognitionCachePanel.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiDelete: vi.fn(),
  confirm: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: mocks.apiGet,
    delete: mocks.apiDelete,
  },
}))

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => mocks.confirm,
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
  }),
}))

async function renderRecognitionCachePanel(recognitionSource = 'themoviedb') {
  return renderWithProviders(RecognitionCachePanel, {
    initialState: {
      globalSettings: {
        data: {
          GLOBAL_IMAGE_CACHE: false,
          RECOGNIZE_SOURCE: recognitionSource,
          TMDB_IMAGE_DOMAIN: 'image.tmdb.org',
        },
      },
    },
  })
}

describe('RecognitionCachePanel shared recognition statistics', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiDelete.mockReset()
    mocks.confirm.mockReset().mockResolvedValue(true)
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.toastWarning.mockReset()
  })

  it('shows the persisted shared recognition count when sharing is enabled', async () => {
    mocks.apiGet.mockResolvedValue({
      data: {
        count: 12,
        recognized: 9,
        unrecognized: 3,
        shared_recognized: 27,
        shared_recognize_enabled: true,
        data: [],
      },
    })

    await renderRecognitionCachePanel()

    expect(await screen.findByText('共享识别')).toBeInTheDocument()
    expect(screen.getByText('27')).toBeInTheDocument()
    expect(screen.getByText('未识别')).toBeInTheDocument()
  })

  it('hides shared recognition statistics when sharing is disabled', async () => {
    mocks.apiGet.mockResolvedValue({
      data: {
        count: 12,
        recognized: 9,
        unrecognized: 3,
        shared_recognized: 27,
        shared_recognize_enabled: false,
        data: [],
      },
    })

    await renderRecognitionCachePanel()
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('tmdb/cache'))

    expect(screen.queryByText('共享识别')).not.toBeInTheDocument()
  })

  it('loads TMDB cache even when Douban is selected as the recognition source', async () => {
    mocks.apiGet.mockResolvedValue({
      data: {
        count: 0,
        recognized: 0,
        unrecognized: 0,
        shared_recognized: 0,
        shared_recognize_enabled: false,
        data: [],
      },
    })

    await renderRecognitionCachePanel('douban')

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('tmdb/cache'))
  })

  it.each([1280, 390])('在 %s 像素显示可读查询，并使用原始键删除缓存', async width => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width, writable: true })
    window.dispatchEvent(new Event('resize'))
    const key = '[未知][zh]10 Years-2012-None'
    mocks.apiGet.mockResolvedValue({
      data: {
        count: 1,
        recognized: 0,
        unrecognized: 1,
        data: [{ key, title: '', year: '', media_type: 'unknown', tmdb_id: 0 }],
      },
    })
    mocks.apiDelete.mockResolvedValue({ success: true })
    await renderRecognitionCachePanel()
    expect(await screen.findByText('10 Years · 2012')).toBeInTheDocument()
    expect(screen.queryByText(key)).not.toBeInTheDocument()
    await fireEvent.update(screen.getAllByRole('textbox')[0], '10 Years')
    await fireEvent.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => expect(mocks.apiDelete).toHaveBeenCalledWith(`tmdb/cache/${encodeURIComponent(key)}`))
  })

  it('过滤变化时清理不可见选中项，批量删除接入 useConfirm 并校验 res.success', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280, writable: true })
    window.dispatchEvent(new Event('resize'))
    mocks.apiGet.mockResolvedValue({
      data: {
        count: 2,
        recognized: 1,
        unrecognized: 1,
        data: [
          { key: 'k-alpha', title: 'Alpha Movie', year: '2024', media_type: 'movie', tmdb_id: 100 },
          { key: 'k-beta', title: '', year: '', media_type: 'unknown', tmdb_id: 0 },
        ],
      },
    })

    const { container } = await renderRecognitionCachePanel()
    expect(await screen.findByText('Alpha Movie')).toBeInTheDocument()

    const checkboxes = container.querySelectorAll('input[type="checkbox"]')
    await fireEvent.click(checkboxes[0])
    expect(screen.getByRole('button', { name: /删除选中/ })).toHaveTextContent('(2)')

    // 过滤关键字只保留 Alpha Movie，selectedItems 自动清理为 1 项
    await fireEvent.update(screen.getAllByRole('textbox')[0], 'Alpha')
    await waitFor(() => expect(screen.getByRole('button', { name: /删除选中/ })).toHaveTextContent('(1)'))

    // 取消确认不发起删除
    mocks.confirm.mockResolvedValueOnce(false)
    await fireEvent.click(screen.getByRole('button', { name: /删除选中/ }))
    expect(mocks.confirm).toHaveBeenCalledOnce()
    expect(mocks.apiDelete).not.toHaveBeenCalled()

    // 确认后返回 success: false 时报失败提示
    mocks.confirm.mockResolvedValueOnce(true)
    mocks.apiDelete.mockResolvedValueOnce({ success: false })
    await fireEvent.click(screen.getByRole('button', { name: /删除选中/ }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('删除缓存项失败'))
  })
})
