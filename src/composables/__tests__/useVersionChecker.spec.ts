import { useVersionChecker } from '@/composables/useVersionChecker'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  toastInfo: vi.fn(),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ info: mocks.toastInfo }),
}))

describe('useVersionChecker', () => {
  beforeEach(() => {
    mocks.toastInfo.mockClear()
  })

  it('忽略发布资产附加的构建提交元数据', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { checkVersion } = useVersionChecker()

    await checkVersion(`${__APP_VERSION__}+1bd48e397c967e694a09af0fc8731bf7dc5ba86f`)

    expect(mocks.toastInfo).not.toHaveBeenCalled()
    expect(consoleLog).toHaveBeenCalledWith('[VersionChecker] 版本号一致，无需操作')
  })

  it('没有可用 Service Worker 时保留版本不一致的清缓存兜底', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { checkVersion } = useVersionChecker()

    await checkVersion('version-that-never-matches-the-build')

    expect(mocks.toastInfo).toHaveBeenCalledOnce()
    expect(mocks.toastInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({
          message: expect.any(String),
          onRefresh: expect.any(Function),
          refreshText: expect.any(String),
        }),
      }),
      expect.objectContaining({
        closeButton: false,
        closeOnClick: false,
        draggable: false,
        timeout: false,
      }),
    )
    expect(consoleLog.mock.calls).toEqual([
      [expect.stringMatching(/^\[VersionChecker\] 检测到版本不一致:/)],
      ['[VersionChecker] 无 Service Worker, 直接显示通知'],
    ])
  })
})
