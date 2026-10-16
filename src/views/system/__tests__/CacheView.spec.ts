import CacheView from '@/views/system/CacheView.vue'
import { screen } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ apiGet: vi.fn() }))
vi.mock('@/api', () => ({ default: { get: mocks.apiGet } }))
vi.mock('vue-toastification', () => ({ useToast: () => ({ error: vi.fn() }) }))

describe('资源缓存描述', () => {
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
})
