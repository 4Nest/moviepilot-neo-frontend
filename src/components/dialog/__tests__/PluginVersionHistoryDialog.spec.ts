import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import type { Plugin, PluginReleaseVersionsResponse } from '@/api/types'
import PluginVersionHistoryDialog from '@/components/dialog/PluginVersionHistoryDialog.vue'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: { get: mocks.apiGet },
}))

const installedPlugin: Plugin = {
  id: 'DemoPlugin',
  plugin_name: '演示插件',
  plugin_version: '1.0.0',
  repo_url: 'https://github.com/example/plugins',
  installed: true,
  release: true,
}

const releases: PluginReleaseVersionsResponse = {
  release_supported: true,
  latest_version: '2.0.0',
  current_version: '1.0.0',
  items: [
    {
      version: '2.0.0',
      tag_name: 'v2.0.0',
      body: '最新说明',
      published_at: '2026-08-01T00:00:00Z',
      is_latest: true,
      is_current: false,
    },
    {
      version: '1.0.0',
      tag_name: 'v1.0.0',
      body: '当前说明',
      is_latest: false,
      is_current: true,
    },
    {
      version: '0.9.0',
      tag_name: 'v0.9.0',
      body: '旧版说明',
      published_at: 'invalid-date',
      is_latest: false,
      is_current: false,
    },
  ],
}

async function renderDialog(props: Record<string, unknown>) {
  return renderWithProviders(PluginVersionHistoryDialog, {
    props,
    global: { components: { VDialogCloseBtn: DialogCloseBtn } },
  })
}

describe('PluginVersionHistoryDialog', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset().mockImplementation((url: string) => {
      if (url === 'plugin/history/DemoPlugin') {
        return Promise.resolve({ ...installedPlugin, history: { 'v1.0.0': '当前更新说明' } })
      }
      if (url === 'plugin/releases/DemoPlugin') return Promise.resolve(releases)
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('loads installed history and releases, marks versions, and emits exact update arguments', async () => {
    const { emitted } = await renderDialog({
      modelValue: true,
      plugin: installedPlugin,
      showUpdateAction: true,
      actionMode: 'update',
    })

    expect(await screen.findByText('v2.0.0')).toBeInTheDocument()
    expect(screen.getByText('最新')).toBeInTheDocument()
    expect(screen.getByText('当前')).toBeInTheDocument()
    expect(screen.getByText('invalid-date')).toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenNthCalledWith(1, 'plugin/history/DemoPlugin', {
      params: { force: true },
    })
    expect(mocks.apiGet).toHaveBeenNthCalledWith(2, 'plugin/releases/DemoPlugin', {
      params: {
        force: true,
        repo_url: 'https://github.com/example/plugins',
      },
    })

    await fireEvent.click(screen.getByRole('button', { name: '安装' }))
    expect(emitted().update).toEqual([['0.9.0', 'https://github.com/example/plugins']])

    await fireEvent.click(screen.getByRole('button', { name: '更新到最新版本' }))
    expect(emitted().update).toEqual([
      ['0.9.0', 'https://github.com/example/plugins'],
      [undefined, 'https://github.com/example/plugins'],
    ])
  })

  it('uses market metadata directly and emits latest installation without a release version', async () => {
    const marketPlugin = { ...installedPlugin, installed: false, history: {} }
    const { emitted } = await renderDialog({
      modelValue: true,
      plugin: marketPlugin,
      actionMode: 'install',
    })

    expect(await screen.findByText('v2.0.0')).toBeInTheDocument()
    expect(mocks.apiGet).not.toHaveBeenCalledWith('plugin/history/DemoPlugin', expect.anything())
    expect(mocks.apiGet).toHaveBeenCalledWith('plugin/releases/DemoPlugin', {
      params: {
        force: false,
        repo_url: 'https://github.com/example/plugins',
      },
    })

    const installButtons = screen.getAllByRole('button', { name: '安装' })
    await fireEvent.click(installButtons[0])
    expect(emitted().update).toEqual([[undefined, 'https://github.com/example/plugins']])
  })

  it('distinguishes a Release request failure from an empty history', async () => {
    mocks.apiGet.mockRejectedValue(new Error('release unavailable'))
    await renderDialog({
      modelValue: true,
      plugin: { ...installedPlugin, installed: false, history: {} },
      actionMode: 'install',
    })

    expect(await screen.findByText('Release 版本加载失败')).toBeInTheDocument()
    expect(screen.queryByText('暂未获取到更新说明')).not.toBeInTheDocument()
  })

  it('shows history request failures and true empty history as different states', async () => {
    mocks.apiGet.mockRejectedValueOnce(new Error('history unavailable'))
    const failed = await renderDialog({
      modelValue: true,
      plugin: installedPlugin,
    })
    expect(await screen.findByText('读取更新说明失败，请稍后重试')).toBeInTheDocument()
    failed.unmount()

    mocks.apiGet.mockReset().mockResolvedValue({ ...installedPlugin, release: false, history: {} })
    await renderDialog({
      modelValue: true,
      plugin: installedPlugin,
    })
    expect(await screen.findByText('暂未获取到更新说明')).toBeInTheDocument()
  })

  it('closes through the model contract', async () => {
    const { emitted } = await renderDialog({
      modelValue: true,
      plugin: installedPlugin,
    })

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    const closeButton = document.querySelector<HTMLButtonElement>('.app-dialog-close-btn')
    expect(closeButton).not.toBeNull()
    await fireEvent.click(closeButton!)

    expect(emitted()['update:modelValue']).toContainEqual([false])
    expect(emitted().close).toHaveLength(1)
  })

  it('renders passed-in history immediately while refreshing and overwrites on success', async () => {
    let resolveHistory!: (value: Plugin) => void
    const pendingHistory = new Promise<Plugin>(resolve => {
      resolveHistory = resolve
    })
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'plugin/history/DemoPlugin') return pendingHistory
      if (url === 'plugin/releases/DemoPlugin') return Promise.resolve({ ...releases, items: [] })
      throw new Error(`Unexpected request: ${url}`)
    })

    await renderDialog({
      modelValue: true,
      plugin: {
        ...installedPlugin,
        history: { 'v1.0.0': '缓存中的旧更新说明' },
      },
      actionMode: 'update',
    })

    // 强制刷新尚未返回时，应直接展示传入的历史快照而非阻塞转圈。
    expect(await screen.findByText('缓存中的旧更新说明')).toBeInTheDocument()
    expect(document.querySelector('.plugin-version-history-dialog__loading')).toBeNull()
    expect(mocks.apiGet).toHaveBeenCalledWith('plugin/history/DemoPlugin', {
      params: { force: true },
    })

    resolveHistory({
      ...installedPlugin,
      history: {
        'v1.1.0': '最新强制刷新说明',
        'v1.0.0': '缓存中的旧更新说明',
      },
    })

    expect(await screen.findByText('最新强制刷新说明')).toBeInTheDocument()
    expect(
      Array.from(document.querySelectorAll('.version-history__version')).map(element => element.textContent),
    ).toEqual(['v1.1.0', 'v1.0.0'])
  })

  it('preserves passed-in history and shows a non-blocking warning when refresh fails', async () => {
    mocks.apiGet.mockRejectedValueOnce(new Error('history timeout'))

    await renderDialog({
      modelValue: true,
      plugin: {
        ...installedPlugin,
        history: { 'v1.0.0': '保留的本地快照说明' },
      },
      actionMode: 'update',
    })

    expect(await screen.findByText('读取更新说明失败，请稍后重试')).toBeInTheDocument()
    expect(screen.getByText('保留的本地快照说明')).toBeInTheDocument()
    expect(screen.queryByText('暂未获取到更新说明')).not.toBeInTheDocument()
  })

  it('shows refreshed history immediately without waiting for slow release queries', async () => {
    let resolveReleases!: (value: PluginReleaseVersionsResponse) => void
    const pendingReleases = new Promise<PluginReleaseVersionsResponse>(resolve => {
      resolveReleases = resolve
    })
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'plugin/history/DemoPlugin') {
        return Promise.resolve({
          ...installedPlugin,
          history: { 'v1.2.0': '历史接口已先返回的说明' },
        })
      }
      if (url === 'plugin/releases/DemoPlugin') return pendingReleases
      throw new Error(`Unexpected request: ${url}`)
    })

    await renderDialog({
      modelValue: true,
      plugin: installedPlugin,
      actionMode: 'update',
    })

    // 即使 Release 接口仍在排队，也应立即展示 history 返回的更新说明。
    expect(await screen.findByText('历史接口已先返回的说明')).toBeInTheDocument()
    expect(document.querySelector('.plugin-version-history-dialog__loading')).toBeNull()

    resolveReleases(releases)
    expect(await screen.findByText('v2.0.0')).toBeInTheDocument()
  })
})
