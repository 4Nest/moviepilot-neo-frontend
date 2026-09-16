import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import AboutDialog from '@/components/dialog/AboutDialog.vue'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: { get: mocks.apiGet },
}))

const releasesPayload = [
  {
    tag_name: 'neo-v2.15.6',
    body: '### 主要更新\n\n- 修复动漫识别问题\n- 增加 MediaVault 媒体库',
    published_at: '2026-09-13T05:16:46Z',
  },
  {
    tag_name: 'neo-v2.15.5',
    body: '- 修复订阅分享页面',
    published_at: '2026-09-10T05:16:46Z',
  },
  {
    tag_name: 'v2.15.5-frontend',
    body: '不应展示的前端版本',
    published_at: '2026-09-10T05:16:46Z',
  },
]

async function renderDialog() {
  return renderWithProviders(AboutDialog, {
    props: { modelValue: true },
    global: { components: { VDialogCloseBtn: DialogCloseBtn } },
  })
}

describe('AboutDialog', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset().mockImplementation((url: string) => {
      if (url === 'system/env') return Promise.resolve({ data: { VERSION: 'neo-v2.15.6', FRONTEND_VERSION: 'v2.15.6' } })
      if (url === 'system/versions') return Promise.resolve({ data: releasesPayload })
      return Promise.reject(new Error(`unexpected url: ${url}`))
    })
  })

  it('展示软件版本与 Release 版本号列表,非 neo 版本被过滤', async () => {
    await renderDialog()

    expect(await screen.findByRole('button', { name: /neo-v2\.15\.6/ })).toBeInTheDocument()
    expect(await screen.findByText('更新日志')).toBeInTheDocument()
    // 发布日期随版本号展示
    expect(screen.getByText(new Date('2026-09-13T05:16:46Z').toLocaleDateString())).toBeInTheDocument()
    // 非 neo-v2.x 的 tag 被过滤
    expect(screen.queryByRole('button', { name: /v2\.15\.5-frontend/ })).not.toBeInTheDocument()
    expect(screen.queryByText('不应展示的前端版本')).not.toBeInTheDocument()
  })

  it('版本内容默认全部折叠,点击版本号后展开 markdown 正文', async () => {
    await renderDialog()

    // 所有版本标题可见,正文默认均不渲染
    expect((await screen.findAllByRole('button', { name: /neo-v2\.15\./ })).length).toBe(2)
    expect(screen.queryByText('修复动漫识别问题')).not.toBeInTheDocument()
    expect(screen.queryByText('修复订阅分享页面')).not.toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: /neo-v2\.15\.6/ }))
    expect(await screen.findByText('修复动漫识别问题')).toBeInTheDocument()
    // 其它版本保持折叠
    expect(screen.queryByText('修复订阅分享页面')).not.toBeInTheDocument()
  })

  it('Release 加载失败时展示失败提示', async () => {
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'system/versions') return Promise.reject(new Error('network'))
      return Promise.resolve({ data: {} })
    })
    await renderDialog()

    expect(await screen.findByText('更新日志加载失败')).toBeInTheDocument()
  })

  it('无 neo 版本 Release 时展示空态', async () => {
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'system/versions') return Promise.resolve({ data: [{ tag_name: 'v1.0.0', body: 'x' }] })
      return Promise.resolve({ data: {} })
    })
    await renderDialog()

    expect(await screen.findByText('暂无更新日志')).toBeInTheDocument()
  })
})
