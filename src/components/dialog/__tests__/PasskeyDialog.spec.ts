import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import { base64UrlToUint8Array, bufferToBase64Url } from '@/@core/utils/navigator'
import PasskeyDialog from '@/components/dialog/PasskeyDialog.vue'
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

describe('PasskeyDialog & WebAuthn Base64URL helpers', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.apiGet.mockResolvedValue({ success: true, data: [] })
  })

  it('renders complete domain warning text without empty i18n-t tag', async () => {
    await renderWithProviders(PasskeyDialog, {
      global: {
        components: {
          VDialogCloseBtn: DialogCloseBtn,
        },
      },
      props: {
        modelValue: true,
      },
    })

    await waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledWith('mfa/passkey/list')
    })
    expect(screen.getByText('访问域名')).toBeInTheDocument()
    expect(screen.getByText(/通行密钥（PassKey）的可用性与/)).toBeInTheDocument()
    expect(document.querySelector('i18n-t')).toBeNull()
  })

  it('round-trips unpadded base64url strings and large buffers safely', () => {
    const sample = new Uint8Array([0, 255, 254, 62, 63, 128, 17])
    const encoded = bufferToBase64Url(sample.buffer)
    expect(encoded).not.toContain('=')
    expect(encoded).not.toContain('+')
    expect(encoded).not.toContain('/')
    expect(Array.from(base64UrlToUint8Array(encoded))).toEqual(Array.from(sample))

    const large = new Uint8Array(70_000)
    for (let i = 0; i < large.length; i++) large[i] = i % 256
    const largeEncoded = bufferToBase64Url(large.buffer)
    expect(base64UrlToUint8Array(largeEncoded).length).toBe(70_000)
  })

  it('surfaces friendly Chinese error when authenticator throws InvalidStateError', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
    Object.defineProperty(window, 'PublicKeyCredential', { configurable: true, value: class {} })
    const createMock = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('already registered'), { name: 'InvalidStateError' }))
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: { create: createMock },
    })

    mocks.apiPost.mockResolvedValueOnce({
      success: true,
      data: {
        options: JSON.stringify({
          challenge: 'Y2hhbGxlbmdl',
          rp: { id: 'localhost', name: 'MoviePilot' },
          user: { id: 'MQ', name: 'admin', displayName: 'admin' },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        }),
        transaction_token: 'tx-token-1',
      },
    })

    await renderWithProviders(PasskeyDialog, {
      global: {
        components: {
          VDialogCloseBtn: DialogCloseBtn,
        },
      },
      props: {
        modelValue: true,
      },
    })

    const input = screen.getByLabelText('通行密钥名称')
    await fireEvent.update(input, 'MacBook Touch ID')
    await fireEvent.click(screen.getByRole('button', { name: /注册通行密钥/ }))

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('当前设备或密码管理器已注册过通行密钥')
    })
  })
})
