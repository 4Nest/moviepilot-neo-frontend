import DiscoverPage from '@/pages/discover.vue'
import type { DiscoverSource } from '@/api/types'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import {
  discoverApiUrls,
  discoverOrderConfigHandler,
  discoverSourcesHandler,
  saveDiscoverOrderHandler,
  type DiscoverOrderItem,
} from '@tests/support/msw/handlers/discover'
import { server } from '@tests/support/msw/server'
import { HttpResponse, http } from 'msw'
import { defineComponent, h, nextTick, ref, unref, type ComputedRef, type Ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface HeaderTabItem {
  tab: string
  title: string
}

interface HeaderTabButton {
  action: () => void
  icon: string
  label?: string
  testId?: string
}

interface HeaderTabConfig {
  appendButtons: HeaderTabButton[]
  items: ComputedRef<HeaderTabItem[]> | Ref<HeaderTabItem[]> | HeaderTabItem[]
  modelValue: Ref<string>
}

interface SharedDialogEvents {
  close: () => void
  save: (payload: { tabs: DiscoverSource[]; enabled?: Record<string, boolean> }) => Promise<void>
  'update:modelValue': (value: boolean) => void
}

interface SharedDialogController {
  close: ReturnType<typeof vi.fn>
  id: number
  updateProps: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted(() => ({
  controllers: [] as SharedDialogController[],
  mountedViews: [] as string[],
  openSharedDialog: vi.fn(),
  registerHeaderTab: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError }),
}))

vi.mock('@/composables/useDynamicHeaderTab', () => ({
  useDynamicHeaderTab: () => ({ registerHeaderTab: mocks.registerHeaderTab }),
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

function createBuiltInViewStub(name: string) {
  return defineComponent({
    name,
    setup() {
      mocks.mountedViews.push(name)
      return () => h('section', { 'data-testid': `view-${name}` }, name)
    },
  })
}

const ExtraSourceViewStub = defineComponent({
  name: 'ExtraSourceView',
  props: {
    source: { type: Object, required: true },
  },
  setup(props) {
    mocks.mountedViews.push(`extra:${(props.source as DiscoverSource).mediaid_prefix}`)
    return () => h('section', { 'data-testid': 'extra-source' }, (props.source as DiscoverSource).name)
  },
})

function createSource(name: string, prefix: string, apiPath = `discover/${prefix}`): DiscoverSource {
  return {
    api_path: apiPath,
    filter_params: { type: prefix },
    filter_ui: [],
    mediaid_prefix: prefix,
    name,
  }
}

function keepAliveHarness() {
  return defineComponent({
    components: { DiscoverPage },
    setup() {
      const active = ref(true)
      return { active }
    },
    template: `
      <button type="button" @click="active = false">停用发现页</button>
      <button type="button" @click="active = true">启用发现页</button>
      <KeepAlive><DiscoverPage v-if="active" /></KeepAlive>
    `,
  })
}

async function renderDiscover() {
  const componentError = vi.fn()
  const result = await renderWithProviders(keepAliveHarness(), {
    initialRoute: '/discover',
    global: {
      config: {
        errorHandler: componentError,
      },
      stubs: {
        AniListView: createBuiltInViewStub('AniListView'),
        BangumiView: createBuiltInViewStub('BangumiView'),
        DoubanView: createBuiltInViewStub('DoubanView'),
        ExtraSourceView: ExtraSourceViewStub,
        TheMovieDbView: createBuiltInViewStub('TheMovieDbView'),
        VScrollToTopBtn: true,
      },
    },
  })

  return { ...result, componentError }
}

function getHeaderConfig() {
  const config = mocks.registerHeaderTab.mock.calls[0]?.[0] as HeaderTabConfig | undefined
  if (!config) throw new Error('发现页未注册动态标签')
  return config
}

function getHeaderItems() {
  return unref(getHeaderConfig().items)
}

function getDialogCall(index = 0) {
  const call = mocks.openSharedDialog.mock.calls[index]
  if (!call) throw new Error(`未找到第 ${index + 1} 个排序弹窗`)
  const props = call[1] as { tabs: DiscoverSource[]; enabled?: Record<string, boolean> }
  return {
    enabled: props.enabled,
    events: call[2] as SharedDialogEvents,
    tabs: props.tabs,
  }
}

async function reactivateDiscover() {
  await fireEvent.click(document.querySelector('button') as HTMLButtonElement)
  const buttons = Array.from(document.querySelectorAll('button'))
  const activate = buttons.find(button => button.textContent === '启用发现页')
  if (!activate) throw new Error('未找到启用发现页按钮')
  await fireEvent.click(activate)
}

describe('discover page', () => {
  beforeEach(() => {
    mocks.controllers.length = 0
    mocks.mountedViews.length = 0
    mocks.toastError.mockReset()
    server.use(discoverOrderConfigHandler(null, 200))
    mocks.openSharedDialog.mockImplementation(() => {
      const controller: SharedDialogController = {
        close: vi.fn(),
        id: mocks.controllers.length + 1,
        updateProps: vi.fn(),
      }
      mocks.controllers.push(controller)
      return controller
    })
  })

  it('prefers remote order over stale local cache and syncs localStorage', async () => {
    const configRequested = vi.fn()
    const remoteOrder: DiscoverOrderItem[] = [
      { name: 'Bangumi', mediaid_prefix: 'bangumi' },
      { name: '自定义来源', mediaid_prefix: 'custom' },
    ]
    localStorage.setItem('MP_DISCOVER_TAB_ORDER', JSON.stringify([{ name: '豆瓣' }, { name: 'AniList' }]))
    server.use(
      discoverOrderConfigHandler(remoteOrder, 200, configRequested),
      discoverSourcesHandler([
        createSource('自定义来源', 'custom'),
        createSource('重复自定义来源', 'custom'),
        createSource('伪豆瓣', 'douban'),
      ]),
    )

    await renderDiscover()

    await waitFor(() => expect(configRequested).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(getHeaderItems().map(item => item.title)).toEqual([
        'Bangumi',
        '自定义来源',
        'TheMovieDb',
        '豆瓣',
        'AniList',
      ]),
    )
    expect(getHeaderItems().map(item => item.tab)).toEqual(['bangumi', 'custom', 'themoviedb', 'douban', 'anilist'])
    expect(localStorage.getItem('MP_DISCOVER_TAB_ORDER')).toBe(JSON.stringify(remoteOrder))
    expect(getHeaderConfig().appendButtons[0]).toMatchObject({
      icon: 'mdi-tune',
      label: '配置标签',
      testId: 'discover-tab-config-btn',
    })
  })

  it('falls back to local order when remote order is absent or request fails and matches by mediaid_prefix', async () => {
    const configRequested = vi.fn()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.setItem(
      'MP_DISCOVER_TAB_ORDER',
      JSON.stringify([{ name: 'Old Douban Name', mediaid_prefix: 'douban' }, { name: '自定义来源' }]),
    )
    server.use(
      discoverOrderConfigHandler(null, 500, configRequested),
      discoverSourcesHandler([createSource('自定义来源', 'custom')]),
    )

    await renderDiscover()

    await waitFor(() => expect(configRequested).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(getHeaderItems().map(item => item.title)).toEqual([
        '豆瓣',
        '自定义来源',
        'TheMovieDb',
        'Bangumi',
        'AniList',
      ]),
    )
    expect(getHeaderItems().map(item => item.tab)).toEqual(['douban', 'custom', 'themoviedb', 'bangumi', 'anilist'])
  })

  it('clears malformed local JSON when remote order is absent', async () => {
    const configRequested = vi.fn()
    localStorage.setItem('MP_DISCOVER_TAB_ORDER', '{malformed')
    server.use(discoverOrderConfigHandler(null, 200, configRequested), discoverSourcesHandler([]))

    const { componentError } = await renderDiscover()

    await waitFor(() => expect(configRequested).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(getHeaderItems().map(item => item.title)).toEqual(['TheMovieDb', '豆瓣', 'Bangumi', 'AniList']),
    )
    expect(localStorage.getItem('MP_DISCOVER_TAB_ORDER')).toBeNull()
    expect(componentError).not.toHaveBeenCalled()
  })

  it('lazily mounts only visited tab views and preserves mounted state across switches', async () => {
    server.use(
      discoverOrderConfigHandler([{ name: '豆瓣', mediaid_prefix: 'douban', enabled: true }], 200),
      discoverSourcesHandler([createSource('自定义来源', 'custom')]),
    )

    await renderDiscover()

    await waitFor(() => expect(getHeaderConfig().modelValue.value).toBe('douban'))
    await waitFor(() => expect(mocks.mountedViews).toEqual(['DoubanView']))

    getHeaderConfig().modelValue.value = 'custom'
    await nextTick()
    await waitFor(() => expect(mocks.mountedViews).toEqual(['DoubanView', 'extra:custom']))

    getHeaderConfig().modelValue.value = 'douban'
    await nextTick()
    expect(mocks.mountedViews).toEqual(['DoubanView', 'extra:custom'])
  })

  it('filters hidden tabs, switches away from hidden active tab, and shows empty state when all tabs are hidden', async () => {
    const savedOrders: DiscoverOrderItem[][] = []
    server.use(
      discoverSourcesHandler([]),
      saveDiscoverOrderHandler(order => {
        savedOrders.push(order)
      }),
    )

    await renderDiscover()
    await waitFor(() => expect(getHeaderConfig().modelValue.value).toBe('themoviedb'))
    expect(getHeaderItems()).toHaveLength(4)

    // 隐藏当前激活的 themoviedb，应自动切至下一个可见标签 douban
    getHeaderConfig().appendButtons[0].action()
    const firstDialog = getDialogCall(0)
    await firstDialog.events.save({
      tabs: firstDialog.tabs,
      enabled: {
        themoviedb: false,
        douban: true,
        bangumi: true,
        anilist: true,
      },
    })

    expect(getHeaderItems().map(item => item.tab)).toEqual(['douban', 'bangumi', 'anilist'])
    expect(getHeaderConfig().modelValue.value).toBe('douban')
    expect(savedOrders[0][0]).toEqual({ name: 'TheMovieDb', mediaid_prefix: 'themoviedb', enabled: false })

    // 隐藏全部标签后展示空状态并可点击按钮重开配置弹窗
    getHeaderConfig().appendButtons[0].action()
    const secondDialog = getDialogCall(1)
    expect(secondDialog.enabled).toEqual({
      themoviedb: false,
      douban: true,
      bangumi: true,
      anilist: true,
    })
    await secondDialog.events.save({
      tabs: secondDialog.tabs,
      enabled: {
        themoviedb: false,
        douban: false,
        bangumi: false,
        anilist: false,
      },
    })

    expect(getHeaderItems()).toEqual([])
    expect(getHeaderConfig().modelValue.value).toBe('')
    expect(await screen.findByTestId('discover-empty-state')).toBeInTheDocument()
    expect(screen.getByText('所有发现标签均已隐藏')).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: '配置标签' }))
    expect(mocks.openSharedDialog).toHaveBeenCalledTimes(3)
  })

  it('keeps built-in and extra sources usable when the order config request fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    server.use(discoverOrderConfigHandler(null, 500), discoverSourcesHandler([createSource('可用扩展源', 'available')]))

    await renderDiscover()

    await waitFor(() => expect(getHeaderItems().map(item => item.title)).toContain('可用扩展源'))
    expect(getHeaderItems().map(item => item.title)).toEqual(['TheMovieDb', '豆瓣', 'Bangumi', 'AniList', '可用扩展源'])
    expect(getHeaderConfig().modelValue.value).toBe('themoviedb')
  })

  it('reuses the source request during initial KeepAlive activation', async () => {
    const requested = vi.fn()
    let releaseResponse = () => {}
    const responseGate = new Promise<void>(resolve => {
      releaseResponse = resolve
    })
    localStorage.setItem('MP_DISCOVER_TAB_ORDER', JSON.stringify([]))
    server.use(
      discoverSourcesHandler([createSource('延迟来源', 'delayed')], 200, async () => {
        requested()
        await responseGate
      }),
    )

    await renderDiscover()
    await waitFor(() => expect(requested).toHaveBeenCalled())
    await new Promise(resolve => window.setTimeout(resolve, 25))

    const requestCount = requested.mock.calls.length
    releaseResponse()
    await waitFor(() => expect(getHeaderItems().map(item => item.title)).toContain('延迟来源'))

    expect(requestCount).toBe(1)
  })

  it('does not refetch sources when the initial response settles before activation', async () => {
    const requested = vi.fn()
    localStorage.setItem('MP_DISCOVER_TAB_ORDER', JSON.stringify([]))
    server.use(discoverSourcesHandler([createSource('快速来源', 'fast')], 200, requested))

    await renderDiscover()
    await waitFor(() => expect(getHeaderItems().map(item => item.title)).toContain('快速来源'))
    await new Promise(resolve => window.setTimeout(resolve, 25))

    expect(requested).toHaveBeenCalledOnce()
  })

  it('syncs updated remote order config and withdrawn sources after KeepAlive reactivation', async () => {
    let sources = [createSource('已撤销来源', 'withdrawn')]
    let remoteOrder: DiscoverOrderItem[] = [
      { name: '已撤销来源', mediaid_prefix: 'withdrawn', enabled: true },
      { name: 'TheMovieDb', mediaid_prefix: 'themoviedb', enabled: true },
    ]
    const sourcesRequested = vi.fn()
    const configRequested = vi.fn()
    server.use(
      http.get(discoverApiUrls.orderConfig, () => {
        configRequested()
        return HttpResponse.json({ data: { value: remoteOrder }, success: true })
      }),
      http.get(discoverApiUrls.sources, () => {
        sourcesRequested()
        return HttpResponse.json(sources)
      }),
    )
    await renderDiscover()
    await waitFor(() => expect(getHeaderItems().map(item => item.title)).toContain('已撤销来源'))
    await waitFor(() => expect(getHeaderConfig().modelValue.value).toBe('withdrawn'))
    const requestsBeforeReactivation = sourcesRequested.mock.calls.length
    const configRequestsBefore = configRequested.mock.calls.length
    sources = []
    remoteOrder = [
      { name: 'AniList', mediaid_prefix: 'anilist', enabled: true },
      { name: '豆瓣', mediaid_prefix: 'douban', enabled: false },
    ]

    await reactivateDiscover()

    await waitFor(() => expect(sourcesRequested).toHaveBeenCalledTimes(requestsBeforeReactivation + 1))
    await waitFor(() => expect(configRequested).toHaveBeenCalledTimes(configRequestsBefore + 1))
    await waitFor(() => expect(getHeaderItems().map(item => item.tab)).toEqual(['anilist', 'themoviedb', 'bangumi']))
    await waitFor(() => expect(getHeaderConfig().modelValue.value).toBe('anilist'))
  })

  it('keeps the last successful source snapshot when reactivation fails', async () => {
    let status = 200
    const requested = vi.fn()
    localStorage.setItem('MP_DISCOVER_TAB_ORDER', JSON.stringify([]))
    vi.spyOn(console, 'log').mockImplementation(() => {})
    server.use(
      http.get(discoverApiUrls.sources, () => {
        requested()
        return HttpResponse.json(status === 200 ? [createSource('缓存来源', 'cached')] : [], { status })
      }),
    )
    await renderDiscover()
    await waitFor(() => expect(getHeaderItems().map(item => item.title)).toContain('缓存来源'))
    const requestsBeforeReactivation = requested.mock.calls.length
    status = 500

    await reactivateDiscover()

    await waitFor(() => expect(requested).toHaveBeenCalledTimes(requestsBeforeReactivation + 1))
    expect(getHeaderItems().map(item => item.title)).toContain('缓存来源')
    expect(getHeaderItems().map(item => item.title)).toEqual(['TheMovieDb', '豆瓣', 'Bangumi', 'AniList', '缓存来源'])
  })

  it('replaces the header metadata when a source with the same prefix changes', async () => {
    let sources = [createSource('旧来源名称', 'mutable', 'discover/old')]
    const requested = vi.fn()
    localStorage.setItem('MP_DISCOVER_TAB_ORDER', JSON.stringify([]))
    server.use(
      http.get(discoverApiUrls.sources, () => {
        requested()
        return HttpResponse.json(sources)
      }),
    )
    await renderDiscover()
    await waitFor(() => expect(getHeaderItems().map(item => item.title)).toContain('旧来源名称'))
    const requestsBeforeReactivation = requested.mock.calls.length
    sources = [createSource('新来源名称', 'mutable', 'discover/new')]

    await reactivateDiscover()

    await waitFor(() => expect(requested).toHaveBeenCalledTimes(requestsBeforeReactivation + 1))
    await waitFor(() => expect(getHeaderItems().map(item => item.title)).toContain('新来源名称'))
    expect(getHeaderItems().map(item => item.title)).not.toContain('旧来源名称')
  })

  it('saves the exact visible order and enabled state through the shared dialog boundary', async () => {
    const savedOrders: DiscoverOrderItem[][] = []
    localStorage.setItem('MP_DISCOVER_TAB_ORDER', JSON.stringify([]))
    server.use(
      discoverSourcesHandler([createSource('自定义来源', 'custom')]),
      saveDiscoverOrderHandler(order => {
        savedOrders.push(order)
      }),
    )
    await renderDiscover()
    await waitFor(() => expect(getHeaderItems()).toHaveLength(5))

    getHeaderConfig().appendButtons[0].action()
    const { events, tabs } = getDialogCall()
    const reorderedTabs = [tabs[4], tabs[1], tabs[0], tabs[3], tabs[2]]
    await events.save({
      tabs: reorderedTabs,
      enabled: {
        custom: true,
        douban: true,
        themoviedb: true,
        anilist: false,
        bangumi: true,
      },
    })

    const expectedOrder = reorderedTabs.map(item => ({
      name: item.name,
      mediaid_prefix: item.mediaid_prefix,
      enabled: item.mediaid_prefix !== 'anilist',
    }))
    expect(savedOrders).toEqual([expectedOrder])
    expect(localStorage.getItem('MP_DISCOVER_TAB_ORDER')).toBe(JSON.stringify(expectedOrder))
    expect(getHeaderItems().map(item => item.title)).toEqual(['自定义来源', '豆瓣', 'TheMovieDb', 'Bangumi'])
    expect(mocks.controllers[0].close).toHaveBeenCalledOnce()
  })

  it('keeps current order and local cache intact when saving to server fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.setItem(
      'MP_DISCOVER_TAB_ORDER',
      JSON.stringify([{ name: 'TheMovieDb', mediaid_prefix: 'themoviedb' }]),
    )
    server.use(
      discoverSourcesHandler([createSource('自定义来源', 'custom')]),
      saveDiscoverOrderHandler(() => {}, 500),
    )
    await renderDiscover()
    await waitFor(() => expect(getHeaderItems()).toHaveLength(5))
    const initialTitles = getHeaderItems().map(item => item.title)

    getHeaderConfig().appendButtons[0].action()
    const { events, tabs } = getDialogCall()
    await events.save({
      tabs: [tabs[4], tabs[0], tabs[1], tabs[2], tabs[3]],
      enabled: { custom: true, themoviedb: false, douban: true, bangumi: true, anilist: true },
    })

    expect(mocks.toastError).toHaveBeenCalledWith('保存失败')
    expect(getHeaderItems().map(item => item.title)).toEqual(initialTitles)
    expect(localStorage.getItem('MP_DISCOVER_TAB_ORDER')).toBe(
      JSON.stringify([{ name: 'TheMovieDb', mediaid_prefix: 'themoviedb' }]),
    )
    expect(mocks.controllers[0].close).not.toHaveBeenCalled()
  })

  it('closes the previous controller before opening another order dialog', async () => {
    localStorage.setItem('MP_DISCOVER_TAB_ORDER', JSON.stringify([]))
    server.use(discoverSourcesHandler([createSource('弹窗就绪来源', 'dialog-ready')]))
    await renderDiscover()
    await waitFor(() => expect(getHeaderItems().map(item => item.title)).toContain('弹窗就绪来源'))

    const action = getHeaderConfig().appendButtons[0].action
    action()
    action()

    expect(mocks.openSharedDialog).toHaveBeenCalledTimes(2)
    expect(mocks.controllers[0].close).toHaveBeenCalledOnce()
    expect(mocks.controllers[1].close).not.toHaveBeenCalled()
  })

  it('releases only the controller named by close and model update events', async () => {
    localStorage.setItem('MP_DISCOVER_TAB_ORDER', JSON.stringify([]))
    server.use(discoverSourcesHandler([createSource('弹窗就绪来源', 'dialog-ready')]))
    await renderDiscover()
    await waitFor(() => expect(getHeaderItems().map(item => item.title)).toContain('弹窗就绪来源'))
    const action = getHeaderConfig().appendButtons[0].action

    action()
    getDialogCall(0).events.close()
    action()
    expect(mocks.controllers[0].close).not.toHaveBeenCalled()

    getDialogCall(1).events['update:modelValue'](true)
    action()
    expect(mocks.controllers[1].close).toHaveBeenCalledOnce()

    getDialogCall(2).events['update:modelValue'](false)
    action()
    expect(mocks.controllers[2].close).not.toHaveBeenCalled()
  })

  it('does not let a pending save from an old dialog close a newer controller', async () => {
    let releaseSave = () => {}
    const saveGate = new Promise<void>(resolve => {
      releaseSave = resolve
    })
    const saveStarted = vi.fn()
    localStorage.setItem('MP_DISCOVER_TAB_ORDER', JSON.stringify([]))
    server.use(
      discoverSourcesHandler([createSource('弹窗就绪来源', 'dialog-ready')]),
      saveDiscoverOrderHandler(async () => {
        saveStarted()
        await saveGate
      }),
    )
    await renderDiscover()
    await waitFor(() => expect(getHeaderItems().map(item => item.title)).toContain('弹窗就绪来源'))
    const action = getHeaderConfig().appendButtons[0].action

    action()
    const firstDialog = getDialogCall(0)
    const pendingSave = firstDialog.events.save({ tabs: firstDialog.tabs, enabled: firstDialog.enabled })
    await waitFor(() => expect(saveStarted).toHaveBeenCalledOnce())
    firstDialog.events.close()
    action()
    expect(mocks.controllers).toHaveLength(2)

    releaseSave()
    await pendingSave

    expect(mocks.controllers[1].close).not.toHaveBeenCalled()
  })
})
