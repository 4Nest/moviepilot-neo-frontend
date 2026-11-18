import NetTestView from '@/views/system/NetTestView.vue'
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

describe('NetTestView connectivity workbench', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
  })

  it('展示结构化结果面板并支持通过顶部主按钮重新测试全部目标', async () => {
    let githubCalls = 0
    mocks.apiGet.mockImplementation((url: string, options?: { params?: { target_id?: string } }) => {
      if (url === 'system/nettest/targets') {
        return Promise.resolve({
          success: true,
          data: [
            { id: 'github', icon: 'github', name: 'GitHub' },
            { id: 'tmdb', icon: 'tmdb', name: 'TheMovieDb' },
          ],
        })
      }
      if (url === 'system/nettest') {
        if (options?.params?.target_id === 'github') {
          githubCalls += 1
          return Promise.resolve({ success: true, data: { time: '128' } })
        }
        return Promise.resolve({ success: false, message: '连接超时', data: { time: '3000' } })
      }
      throw new Error(`Unexpected GET ${url}`)
    })

    const { container } = await renderWithProviders(NetTestView)

    expect(await screen.findByText('GitHub')).toBeInTheDocument()
    expect(screen.getByText('TheMovieDb')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('连接超时')).toBeInTheDocument())
    expect(screen.getByText(/128\s*ms/)).toBeInTheDocument()
    expect(container.querySelector('.nettest-panel')).not.toBeNull()

    const retestAllBtn = screen.getByRole('button', { name: /重新测试|全部测试|开始测试/ })
    await fireEvent.click(retestAllBtn)
    await waitFor(() => expect(githubCalls).toBe(2))
  })
})
