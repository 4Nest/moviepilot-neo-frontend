import SettingPage from '@/pages/setting.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h, reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  openAdvancedTab: vi.fn(),
  openShortcutDialog: vi.fn(),
  route: undefined as unknown as { path: string; query: Record<string, string | undefined> },
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
}))

vi.mock('vue-router', async importOriginal => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => mocks.route,
}))

vi.mock('@/router', () => ({
  default: {
    push: (...args: unknown[]) => mocks.routerPush(...args),
    replace: (...args: unknown[]) => mocks.routerReplace(...args),
  },
}))

vi.mock('@/composables/useDynamicHeaderTab', () => ({
  useDynamicHeaderTab: () => ({
    registerHeaderTab: vi.fn(),
  }),
}))

vi.mock('@/composables/useShortcutTools', () => ({
  useShortcutTools: () => ({
    openShortcutDialog: (...args: unknown[]) => mocks.openShortcutDialog(...args),
    visibleShortcuts: {
      value: [
        { dialog: 'words', icon: 'mdi-text-box-outline', subtitle: '词表', title: '自定义识别词' },
        { dialog: 'scheduler', icon: 'mdi-clipboard-list-outline', subtitle: '服务', title: '定时服务' },
        { dialog: 'cache', icon: 'mdi-database-outline', subtitle: '缓存', title: '缓存管理' },
        { dialog: 'systemTest', icon: 'mdi-cog-outline', subtitle: '检查', title: '系统健康检查' },
      ],
    },
  }),
}))

vi.mock('@/views/setting/AccountSettingSystem.vue', () => ({
  __esModule: true,
  default: defineComponent({
    name: 'AccountSettingSystemStub',
    setup(_props, { expose }) {
      expose({ openAdvancedTab: mocks.openAdvancedTab })
      return () => h('div', { id: 'sec-system-basic' }, '系统设置面板内容')
    },
  }),
}))

vi.mock('@/views/setting/AccountSettingDirectory.vue', () => ({
  __esModule: true,
  default: defineComponent({
    name: 'AccountSettingDirectoryStub',
    setup: () => () => h('div', { id: 'sec-dir-organize' }, '存储与目录面板内容'),
  }),
}))

vi.mock('@/views/setting/AccountSettingSite.vue', () => ({
  __esModule: true,
  default: defineComponent({
    name: 'AccountSettingSiteStub',
    setup: () => () => h('div', { id: 'sec-site-sync' }, '站点同步面板内容'),
  }),
}))

vi.mock('@/views/setting/AccountSettingRule.vue', () => ({
  __esModule: true,
  default: defineComponent({
    name: 'AccountSettingRuleStub',
    setup: () => () => h('div', '规则面板内容'),
  }),
}))

vi.mock('@/views/setting/AccountSettingSearch.vue', () => ({
  __esModule: true,
  default: defineComponent({
    name: 'AccountSettingSearchStub',
    setup: () => () => h('div', '搜索面板内容'),
  }),
}))

vi.mock('@/views/setting/AccountSettingSubscribe.vue', () => ({
  __esModule: true,
  default: defineComponent({
    name: 'AccountSettingSubscribeStub',
    setup: () => () => h('div', '订阅面板内容'),
  }),
}))

vi.mock('@/views/setting/AccountSettingNotification.vue', () => ({
  __esModule: true,
  default: defineComponent({
    name: 'AccountSettingNotificationStub',
    setup: () => () => h('div', '通知面板内容'),
  }),
}))

describe('setting workbench page', () => {
  beforeEach(() => {
    mocks.openAdvancedTab.mockReset()
    mocks.openShortcutDialog.mockReset()
    mocks.routerPush.mockReset()
    mocks.routerReplace.mockReset()
    mocks.route = reactive({ path: '/setting', query: {} })
  })

  it('switches setting domains via sidebar navigation, syncs query tab, and opens utility shortcuts', async () => {
    renderWithProviders(SettingPage)

    expect(await screen.findByText('系统设置面板内容')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: '系统' })).toBeInTheDocument()

    const dirNavBtn = screen.getAllByRole('button').find(btn => btn.textContent?.includes('存储 & 目录'))
    expect(dirNavBtn).toBeDefined()
    await fireEvent.click(dirNavBtn!)

    expect(await screen.findByText('存储与目录面板内容')).toBeInTheDocument()
    expect(mocks.routerReplace).toHaveBeenCalledWith({
      path: '/setting',
      query: { tab: 'directory' },
    })

    await fireEvent.click(screen.getByRole('button', { name: /配置向导/ }))
    expect(mocks.routerPush).toHaveBeenCalledWith('/setup')

    await fireEvent.click(screen.getByRole('button', { name: /自定义识别词/ }))
    expect(mocks.openShortcutDialog).toHaveBeenCalledWith(expect.objectContaining({ dialog: 'words' }))
  })

  it('supports instant search jump to deep advanced system tabs and subview sections', async () => {
    renderWithProviders(SettingPage)
    await screen.findByText('系统设置面板内容')

    const searchInput = screen.getByLabelText('快速查找设置项')
    await fireEvent.focus(searchInput)
    await fireEvent.update(searchInput, 'doh')

    const networkHit = await screen.findByText('高级设置 · 网络与代理')
    await fireEvent.mouseDown(networkHit)

    await waitFor(() => {
      expect(mocks.openAdvancedTab).toHaveBeenCalledWith('network')
    })
  })
})
