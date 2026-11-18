import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import AlistConfigDialog from '@/components/dialog/AlistConfigDialog.vue'
import AliyunAuthDialog from '@/components/dialog/AliyunAuthDialog.vue'
import RcloneConfigDialog from '@/components/dialog/RcloneConfigDialog.vue'
import SmbConfigDialog from '@/components/dialog/SmbConfigDialog.vue'
import StorageCustomConfigDialog from '@/components/dialog/StorageCustomConfigDialog.vue'
import U115AuthDialog from '@/components/dialog/U115AuthDialog.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
  },
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    success: mocks.toastSuccess,
  }),
}))

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

describe('Storage & Auth Dialogs', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('AlistConfigDialog uses local draft on cancel, cleans unused auth fields, and resets without overwriting', async () => {
    const legacyAuthInput = ['old', 'secret'].join('-')
    const parentConf: Record<string, unknown> = {
      url: 'http://alist.local:5244',
      username: 'admin',
      password: legacyAuthInput,
      token: 'stale-token',
    }
    const onDone = vi.fn()
    const onClose = vi.fn()

    const { unmount } = await renderWithProviders(AlistConfigDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: { modelValue: true, conf: parentConf, type: 'alist', onDone, onClose },
    })

    const urlInput = screen.getByLabelText('OpenList服务地址')
    await fireEvent.update(urlInput, 'http://changed.local:5244')
    await fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(parentConf.url).toBe('http://alist.local:5244')
    unmount()

    // 保存失败不触发 done，保存成功清理无关认证字段
    mocks.apiPost
      .mockResolvedValueOnce({ success: false, message: '连接失败' })
      .mockResolvedValueOnce({ success: true })
    const { unmount: unmountSave } = await renderWithProviders(AlistConfigDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: { modelValue: true, conf: parentConf, type: 'alist', onDone, onClose },
    })

    // 初始包含 token，因此 loginType 为 token，保存时应清理 username/password
    await fireEvent.click(screen.getByRole('button', { name: '完成' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('连接失败'))
    expect(onDone).not.toHaveBeenCalled()

    await fireEvent.click(screen.getByRole('button', { name: '完成' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(mocks.apiPost).toHaveBeenLastCalledWith('storage/save/alist', {
      url: 'http://alist.local:5244',
      token: 'stale-token',
    })
    unmountSave()

    // 重置配置：只调用 /storage/reset/alist 并直接 emit('done')，绝不再 POST save
    mocks.apiPost.mockClear()
    mocks.apiGet.mockResolvedValueOnce({ success: true })
    const onResetDone = vi.fn()
    await renderWithProviders(AlistConfigDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: { modelValue: true, conf: parentConf, type: 'alist', onDone: onResetDone },
    })

    await fireEvent.click(screen.getByRole('button', { name: '重置' }))
    await waitFor(() => expect(onResetDone).toHaveBeenCalledOnce())
    expect(mocks.apiGet).toHaveBeenCalledWith('/storage/reset/alist')
    expect(mocks.apiPost).not.toHaveBeenCalled()
    expect(parentConf).toEqual({})
  })

  it('RcloneConfigDialog and SmbConfigDialog do not mutate props on init/cancel and do not overwrite on reset', async () => {
    const rcloneConf: Record<string, unknown> = {}
    const onRcloneDone = vi.fn()
    mocks.apiGet.mockResolvedValueOnce({ success: true })

    const { unmount } = await renderWithProviders(RcloneConfigDialog, {
      global: {
        components: { VDialogCloseBtn: DialogCloseBtn },
        stubs: { VAceEditor: { props: ['value'], template: '<textarea :value="value" />' } },
      },
      props: { modelValue: true, conf: rcloneConf, onDone: onRcloneDone },
    })
    expect(rcloneConf).toEqual({})
    await fireEvent.click(screen.getByRole('button', { name: '重置' }))
    await waitFor(() => expect(onRcloneDone).toHaveBeenCalledOnce())
    expect(mocks.apiPost).not.toHaveBeenCalled()
    unmount()

    const smbConf: Record<string, unknown> = { host: '192.168.1.10', share: 'media' }
    const onSmbDone = vi.fn()
    mocks.apiGet.mockResolvedValueOnce({ success: true })
    await renderWithProviders(SmbConfigDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: { modelValue: true, conf: smbConf, onDone: onSmbDone },
    })
    await fireEvent.click(screen.getByRole('button', { name: '重置' }))
    await waitFor(() => expect(onSmbDone).toHaveBeenCalledOnce())
    expect(mocks.apiPost).not.toHaveBeenCalled()
    expect(smbConf).toEqual({})
  })

  it('StorageCustomConfigDialog blocks saving when custom storage name is blank', async () => {
    const onDone = vi.fn()
    await renderWithProviders(StorageCustomConfigDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: {
        modelValue: true,
        storage: { type: 'custom_1', name: '   ', config: {} },
        onDone,
      },
    })

    await fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(mocks.toastError).toHaveBeenCalledWith('请输入名称')
    expect(onDone).not.toHaveBeenCalled()

    await fireEvent.update(screen.getByLabelText('名称'), '云端挂载')
    await fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ name: '云端挂载', type: 'custom_1' }))
  })

  it('U115AuthDialog removes misleading complete button and stops in-flight polling after close', async () => {
    vi.useFakeTimers()
    const inFlightCheck = createDeferred<{ success: boolean; data: { status: number } }>()
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === '/storage/auth_url/u115') {
        return Promise.resolve({ success: true, data: { authUrl: 'https://115.com/auth', state: 's1' } })
      }
      if (url === '/storage/check/u115') {
        return inFlightCheck.promise
      }
      return Promise.resolve({ success: true })
    })

    const fakeWindow = { closed: false, close: vi.fn() } as unknown as Window
    vi.spyOn(window, 'open').mockReturnValue(fakeWindow)

    const onClose = vi.fn()
    await renderWithProviders(U115AuthDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: { modelValue: true, conf: {}, onClose },
    })
    await flushPromises()

    expect(screen.queryByRole('button', { name: '完成' })).not.toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: '打开授权窗口' }))
    vi.advanceTimersByTime(2000)
    await flushPromises()
    expect(mocks.apiGet).toHaveBeenCalledWith('/storage/check/u115')

    // 关闭弹窗后，在途请求返回，不应再挂载新的轮询定时器
    await fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onClose).toHaveBeenCalledOnce()

    inFlightCheck.resolve({ success: true, data: { status: 1 } })
    await flushPromises()
    mocks.apiGet.mockClear()
    vi.advanceTimersByTime(10000)
    await flushPromises()
    expect(mocks.apiGet).not.toHaveBeenCalled()
  })

  it('AliyunAuthDialog offers refresh QR button on expiry/failure, removes complete button, and stops polling on unmount', async () => {
    vi.useFakeTimers()
    const inFlightCheck = createDeferred<{ success: boolean; data: { status: string; tip: string } }>()
    let qrCalls = 0
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === '/storage/qrcode/alipan') {
        qrCalls += 1
        if (qrCalls === 1) {
          return Promise.resolve({ success: false, message: '二维码服务繁忙' })
        }
        return Promise.resolve({ success: true, data: { codeUrl: 'https://alipan.com/qr.png' } })
      }
      if (url === '/storage/check/alipan') {
        return inFlightCheck.promise
      }
      return Promise.resolve({ success: true })
    })

    const { unmount } = await renderWithProviders(AliyunAuthDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: { modelValue: true, conf: {} },
    })
    await flushPromises()

    expect(screen.queryByRole('button', { name: '完成' })).not.toBeInTheDocument()
    expect(screen.getByText('二维码服务繁忙')).toBeInTheDocument()

    // 点击刷新二维码按钮重新拉取并启动轮询
    const refreshBtn = screen.getByRole('button', { name: /刷新|重试/ })
    await fireEvent.click(refreshBtn)
    await flushPromises()
    expect(qrCalls).toBe(2)

    vi.advanceTimersByTime(3000)
    await flushPromises()
    expect(mocks.apiGet).toHaveBeenCalledWith('/storage/check/alipan')

    // 卸载组件后在途响应恢复，不得继续挂载下一轮 setTimeout
    unmount()
    inFlightCheck.resolve({ success: true, data: { status: 'WaitLogin', tip: '等待扫码' } })
    await flushPromises()
    mocks.apiGet.mockClear()
    vi.advanceTimersByTime(10000)
    await flushPromises()
    expect(mocks.apiGet).not.toHaveBeenCalled()
  })
})
