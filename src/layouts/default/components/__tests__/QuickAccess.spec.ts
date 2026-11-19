import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import QuickAccess from '@/layouts/default/components/QuickAccess.vue'
import { renderWithProviders } from '@tests/support/render'
import { screen, waitFor } from '@testing-library/vue'
import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  recentPlugins: [] as Array<{ id: string; plugin_name: string; has_page?: boolean }>,
}))

vi.mock('@/api', () => ({
  default: { get: mocks.apiGet },
}))

vi.mock('@/@core/utils/image', () => ({
  getDominantColor: vi.fn(async () => '#28A9E1'),
}))

vi.mock('@/composables/usePWA', () => ({
  usePWA: () => ({ appMode: ref(true) }),
}))

vi.mock('@/composables/useRecentPlugins', () => ({
  useRecentPlugins: () => ({
    getRecentPlugins: () => mocks.recentPlugins,
    addRecentPlugin: vi.fn(),
    getPinnedPluginIds: () => [],
    togglePinnedPlugin: vi.fn(() => []),
  }),
}))

vi.mock('body-scroll-lock', () => ({
  disableBodyScroll: vi.fn(),
  enableBodyScroll: vi.fn(),
}))

describe('QuickAccess.vue', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.recentPlugins = [{ id: 'UninstalledGhost', plugin_name: '已卸载幽灵插件', has_page: true }]
    mocks.apiGet.mockResolvedValue([
      { id: 'InstalledDemo', plugin_name: '已安装示例插件', has_page: true, state: true },
    ])
  })

  it('renders filteredRecentPlugins and filteredPlugins, shows empty recent hint text, and uses opaque dark surface without backdrop blur', async () => {
    const { container } = await renderWithProviders(QuickAccess, {
      props: { visible: true, pullDistance: 0 },
      global: { stubs: { VImg: true, LoadingBanner: true } },
    })

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('plugin/', expect.anything()))

    expect(await screen.findByText('已安装示例插件')).toBeInTheDocument()
    expect(screen.queryByText('已卸载幽灵插件')).not.toBeInTheDocument()
    // 过滤掉已卸载插件后最近使用为空，应显示空提示文字
    expect(container.querySelector('.no-recent-plugins')?.textContent?.trim()).not.toBe('')

    const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..')
    const source = readFileSync(resolve(rootDir, 'src/layouts/default/components/QuickAccess.vue'), 'utf8')
    const darkBlock = source.match(/html\[data-theme='dark'\]\s+\.plugin-quick-access\s*\{[\s\S]*?\}/)?.[0] ?? ''
    expect(
      darkBlock.includes('rgb(var(--v-theme-surface))') || darkBlock.includes('rgb(var(--v-theme-background))'),
    ).toBe(true)
    expect(source).not.toContain('backdrop-filter')
  })
})
