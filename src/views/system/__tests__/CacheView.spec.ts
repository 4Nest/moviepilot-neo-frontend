import CacheView from '@/views/system/CacheView.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  confirm: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}))
vi.mock('@/api', () => ({ default: { delete: mocks.apiDelete, get: mocks.apiGet } }))
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => mocks.confirm }))
vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess, warning: mocks.toastWarning }),
}))

describe('资源缓存描述与分段切换', () => {
  beforeEach(() => {
    mocks.apiDelete.mockReset().mockResolvedValue({ success: true })
    mocks.apiGet.mockReset()
    mocks.confirm.mockReset().mockResolvedValue(true)
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.toastWarning.mockReset()
  })
  it('长 HTML 描述仅作为纯文本摘要显示，保留完整文本提示', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440, writable: true })
    window.dispatchEvent(new Event('resize'))
    const description = '<p><strong>字幕说明</strong><br>简&amp;繁字幕</p>'.repeat(100)
    mocks.apiGet.mockResolvedValue({
      data: {
        count: 1,
        sites: 1,
        data: [
          {
            hash: 'test-hash',
            title: '测试资源',
            description,
            domain: 'example.test',
            site_name: '测试站点',
            size: 1024,
          },
        ],
      },
    })
    const { container } = await renderWithProviders(CacheView)
    expect(await screen.findByText('测试资源')).toBeInTheDocument()
    const summary = container.querySelector('.cache-torrent-summary.text-caption')!
    expect(summary.textContent).toContain('字幕说明 简&繁字幕')
    expect(summary.textContent).not.toContain('<p>')
    expect(summary.querySelector('strong, br, p')).toBeNull()
    expect(summary.getAttribute('title')).toBe(summary.textContent?.trim())
  })

  it('使用标准 mp-segmented 分段胶囊切换资源缓存与识别缓存', async () => {
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'torrent/cache') {
        return Promise.resolve({ data: { count: 2, sites: 1, data: [] } })
      }
      return Promise.resolve({
        data: { count: 5, recognized: 4, unrecognized: 1, shared_recognize_enabled: false, data: [] },
      })
    })

    const { container } = await renderWithProviders(CacheView)
    const segmented = container.querySelector('.mp-segmented')
    expect(segmented).not.toBeNull()

    const torrentBtn = screen.getByRole('button', { name: /种子缓存|资源缓存/ })
    const recognitionBtn = screen.getByRole('button', { name: /识别缓存/ })
    expect(torrentBtn).toHaveClass('mp-segmented__btn', 'is-active')
    expect(recognitionBtn).toHaveClass('mp-segmented__btn')
    expect(recognitionBtn).not.toHaveClass('is-active')

    await fireEvent.click(recognitionBtn)
    expect(recognitionBtn).toHaveClass('is-active')
    expect(torrentBtn).not.toHaveClass('is-active')
  })

  it('过滤变化时自动清理不可见选中项，批量删除需二次确认并校验每项 res.success', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440, writable: true })
    window.dispatchEvent(new Event('resize'))
    mocks.apiGet.mockResolvedValue({
      data: {
        count: 2,
        sites: 1,
        data: [
          { hash: 'h-1', title: '科幻电影', description: '', domain: 'site.test', site_name: '站点A', size: 100 },
          { hash: 'h-2', title: '动作剧集', description: '', domain: 'site.test', site_name: '站点A', size: 200 },
        ],
      },
    })

    const { container } = await renderWithProviders(CacheView)
    expect(await screen.findByText('科幻电影')).toBeInTheDocument()

    // 点击表头全选
    const checkboxes = container.querySelectorAll('input[type="checkbox"]')
    await fireEvent.click(checkboxes[0])
    expect(screen.getByRole('button', { name: /删除选中/ })).toHaveTextContent('(2)')

    // 输入标题过滤只剩 1 条时，selectedItems 自动清理不可见项
    await fireEvent.update(screen.getByPlaceholderText('按标题筛选'), '科幻')
    await waitFor(() => expect(screen.getByRole('button', { name: /删除选中/ })).toHaveTextContent('(1)'))

    // 取消二次确认时不删除
    mocks.confirm.mockResolvedValueOnce(false)
    await fireEvent.click(screen.getByRole('button', { name: /删除选中/ }))
    expect(mocks.confirm).toHaveBeenCalledOnce()
    expect(mocks.apiDelete).not.toHaveBeenCalled()

    // 确认但接口返回 success: false 时报失败提示并保留失败选中项
    mocks.confirm.mockResolvedValueOnce(true)
    mocks.apiDelete.mockResolvedValueOnce({ success: false, message: 'denied' })
    await fireEvent.click(screen.getByRole('button', { name: /删除选中/ }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('删除缓存项失败'))
  })
})
