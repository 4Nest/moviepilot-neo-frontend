import LoginPage from '@/pages/login.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  routerPush: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: mocks.apiGet,
    post: mocks.apiPost,
  },
}))

vi.mock('@/router', () => ({
  default: {
    push: mocks.routerPush,
    resolve: (path: string) => ({ path }),
  },
  isAllowedSubscribeUserPath: () => true,
}))

describe('login.vue loading button interlock', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.routerPush.mockReset()
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'auth/providers') {
        return Promise.resolve([
          { id: 'passkey', type: 'system', method: 'passkey', name: 'PassKey', enabled: true },
          {
            id: 'oidc-demo',
            type: 'plugin',
            name: 'SSO 单点登录',
            enabled: true,
            remote: { url: '/remoteEntry.js', scope: 'oidc', module: './AuthPage' },
          },
        ])
      }
      return Promise.resolve([])
    })
  })

  it('disables PassKey and plugin auth buttons while password login is loading', async () => {
    let resolveLogin!: (val: unknown) => void
    mocks.apiPost.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveLogin = resolve
        }),
    )

    await renderWithProviders(LoginPage)

    const passkeyBtn = await screen.findByRole('button', { name: '使用通行密钥登录' })
    const pluginBtn = await screen.findByRole('button', { name: 'SSO 单点登录' })
    expect(passkeyBtn).not.toBeDisabled()
    expect(pluginBtn).not.toBeDisabled()

    await fireEvent.update(screen.getByLabelText('用户名'), 'admin')
    await fireEvent.update(screen.getByLabelText('密码'), 'password123')
    await fireEvent.click(screen.getByRole('button', { name: '登录' }))

    await waitFor(() => {
      expect(passkeyBtn).toBeDisabled()
      expect(pluginBtn).toBeDisabled()
    })

    resolveLogin({
      access_token: 'tok',
      user_id: 1,
      user_name: 'admin',
      super_user: true,
      avatar: '',
      level: 2,
      wizard: false,
    })
    await waitFor(() => expect(mocks.routerPush).toHaveBeenCalled())
  })
})
