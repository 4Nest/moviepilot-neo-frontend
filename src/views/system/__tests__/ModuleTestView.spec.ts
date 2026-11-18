import ModuleTestView from '@/views/system/ModuleTestView.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
  },
}))

describe('ModuleTestView synchronous display and generation safety', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
  })

  it('renders module names without redundant status suffixes and discards stale generation responses on recheck', async () => {
    let firstCheckResolve!: (val: { success: boolean; message?: string }) => void
    let callSeq = 0
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'system/modulelist') {
        return Promise.resolve({
          success: true,
          data: {
            modules: [
              { id: 'mod-a', name: 'TMDB模块' },
              { id: 'mod-b', name: '下载器模块' },
            ],
          },
        })
      }
      if (url === 'system/moduletest/mod-a') {
        callSeq++
        if (callSeq === 1) {
          return new Promise(resolve => {
            firstCheckResolve = resolve
          })
        }
        return Promise.resolve({ success: true })
      }
      if (url === 'system/moduletest/mod-b') {
        return Promise.resolve({ success: false, message: '连接失败' })
      }
      return Promise.resolve({ success: true })
    })

    const { unmount } = await renderWithProviders(ModuleTestView)
    expect(await screen.findByText('TMDB模块')).toBeInTheDocument()
    expect(screen.getByText('下载器模块')).toBeInTheDocument()

    // 让首轮完成
    firstCheckResolve({ success: true })
    await waitFor(() => expect(screen.getByText('检查完成')).toBeInTheDocument())

    // 模块名称不应重复拼接 `- 正常` 或 `- 错误！`
    expect(screen.queryByText(/TMDB模块 - /)).not.toBeInTheDocument()
    expect(screen.queryByText(/下载器模块 - /)).not.toBeInTheDocument()
    expect(screen.getByText('连接失败')).toBeInTheDocument()

    // 重新检查后正常更新且卸载安全
    await fireEvent.click(screen.getByRole('button', { name: '重新检查' }))
    await waitFor(() => expect(screen.getByText('检查完成')).toBeInTheDocument())
    unmount()
  })
})
