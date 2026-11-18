import ServiceView from '@/views/system/ServiceView.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
  },
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    success: mocks.toastSuccess,
  }),
}))

vi.mock('@/composables/useBackground', () => ({
  useBackground: () => ({
    useDataRefresh: (_id: string, callback: () => Promise<void> | void) => {
      void callback()
      return { loading: { value: false }, refresh: callback, stop: vi.fn() }
    },
  }),
}))

vi.mock('@/composables/useScheduleProgress', async importOriginal => {
  const actual = await importOriginal<typeof import('@/composables/useScheduleProgress')>()
  return {
    ...actual,
    useScheduleProgress: () => ({
      getScheduleProgressText: () => '',
      getScheduleProgressValue: () => 0,
    }),
  }
})

describe('ServiceView runCommand guards and feedback', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('prevents duplicate job execution while pending and validates res.success / catch errors', async () => {
    let resolveRun!: (val: { success: boolean; message?: string }) => void
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'dashboard/schedule') {
        return Promise.resolve([
          { id: 'job-1', name: '订阅刷新', provider: '系统', status: '等待', next_run: '5分钟后' },
        ])
      }
      if (url === 'dashboard/schedule/history') {
        return Promise.resolve([])
      }
      if (url === 'system/runscheduler') {
        return new Promise(resolve => {
          resolveRun = resolve
        })
      }
      return Promise.resolve([])
    })

    await renderWithProviders(ServiceView)
    expect((await screen.findAllByText('订阅刷新')).length).toBeGreaterThan(0)

    const executeBtns = screen.getAllByRole('button', { name: '执行' })
    await fireEvent.click(executeBtns[0])
    await fireEvent.click(executeBtns[0])

    const runCalls = mocks.apiGet.mock.calls.filter(call => call[0] === 'system/runscheduler')
    expect(runCalls).toHaveLength(1)

    // 业务返回失败时弹错误提示而非成功提示
    resolveRun({ success: false, message: '任务已被禁用' })
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('任务已被禁用'))
    expect(mocks.toastSuccess).not.toHaveBeenCalled()

    // 抛出异常时同样弹出错误提示
    mocks.apiGet.mockImplementationOnce(() => Promise.reject(new Error('服务不可用')))
    await fireEvent.click(executeBtns[0])
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('服务不可用'))
  })
})
