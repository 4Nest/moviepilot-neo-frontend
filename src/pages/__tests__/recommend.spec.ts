import RecommendPage from '@/pages/recommend.vue'
import type { RecommendSource } from '@/api/types'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import {
  recommendApiUrls,
  recommendConfigHandler,
  recommendSourcesHandler,
  saveRecommendConfigHandler,
} from '@tests/support/msw/handlers/recommend'
import { server } from '@tests/support/msw/server'
import { HttpResponse, http } from 'msw'
import { defineComponent, nextTick, ref, unref, type ComputedRef, type Ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface HeaderTabButton {
  action: () => void
  icon: string
  label?: string
  show?: boolean | ComputedRef<boolean>
  testId?: string
}

interface HeaderTabConfig {
  appendButtons: HeaderTabButton[]
  modelValue: Ref<string>
}

interface SharedDialogController {
  close: ReturnType<typeof vi.fn>
  id: number
  updateProps: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted(() => ({
  controllers: [] as SharedDialogController[],
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

const MediaCardSlideViewStub = defineComponent({
  name: 'MediaCardSlideView',
  props: {
    apipath: { type: String, required: true },
    ready: { type: Boolean, required: true },
    title: { type: String, required: true },
  },
  template: '<section data-testid="recommend-view" :data-api-path="apipath" :data-ready="ready">{{ title }}</section>',
})

interface SharedDialogEvents {
  close: () => void
  save: (payload?: { enabled?: Record<string, boolean> }) => Promise<void>
  'update:modelValue': (value: boolean) => void
}

function getHeaderConfig() {
  const config = mocks.registerHeaderTab.mock.calls[0]?.[0] as HeaderTabConfig | undefined
  if (!config) throw new Error('推荐页未注册动态标签')
  return config
}

function getSettingsHeaderButton() {
  const button = getHeaderConfig().appendButtons.find(item => item.testId === 'recommend-settings-btn')
  if (!button) throw new Error('推荐页顶栏未注册设置按钮')
  return button
}

async function renderRecommend() {
  return renderWithProviders(RecommendPage, {
    initialRoute: '/recommend',
    global: {
      stubs: {
        MediaCardSlideView: MediaCardSlideViewStub,
        VScrollToTopBtn: true,
      },
    },
  })
}

function keepAliveHarness() {
  return defineComponent({
    components: { RecommendPage },
    setup() {
      const active = ref(true)
      return { active }
    },
    template: `
      <button type="button" @click="active = false">停用推荐页</button>
      <button type="button" @click="active = true">启用推荐页</button>
      <KeepAlive><RecommendPage v-if="active" /></KeepAlive>
    `,
  })
}

async function renderKeptAliveRecommend() {
  return renderWithProviders(keepAliveHarness(), {
    initialRoute: '/recommend',
    global: {
      stubs: {
        MediaCardSlideView: MediaCardSlideViewStub,
        VScrollToTopBtn: true,
      },
    },
  })
}

function dynamicRecommendSources(getSources: () => RecommendSource[], onRequest = vi.fn()) {
  return http.get(recommendApiUrls.sources, () => {
    onRequest()
    return HttpResponse.json(getSources())
  })
}

describe('recommend page', () => {
  beforeEach(() => {
    mocks.controllers.length = 0
    mocks.toastError.mockReset()
    server.use(recommendConfigHandler(null, 200))
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

  it('registers settings button in header appendButtons without top action bar', async () => {
    const sourcesRequested = vi.fn()
    server.use(recommendSourcesHandler([], 200, sourcesRequested))
    const { container } = await renderRecommend()
    await waitFor(() => expect(sourcesRequested).toHaveBeenCalledOnce())

    expect(container.querySelector('.mp-page-action-bar')).toBeNull()
    const settingsBtn = getSettingsHeaderButton()
    expect(settingsBtn).toMatchObject({
      icon: 'mdi-tune',
      label: '设置显示内容',
      testId: 'recommend-settings-btn',
    })
    expect(unref(settingsBtn.show ?? true)).toBe(true)
  })

  it('prefers remote configuration over stale local cache and merges extra sources without duplicates', async () => {
    let remoteConfigRequests = 0
    localStorage.setItem('MP_RECOMMEND', JSON.stringify({ '流行趋势': false }))
    const remoteConfig = { '流行趋势': true, '自定义来源': true }
    server.use(
      recommendConfigHandler(remoteConfig, 200, () => {
        remoteConfigRequests += 1
      }),
      recommendSourcesHandler([
        { api_path: 'recommend/tmdb_trending', name: '重复来源', type: '榜单' },
        { api_path: 'recommend/custom', name: '自定义来源', type: '扩展' },
      ]),
    )
    await renderRecommend()

    expect(await screen.findByText('自定义来源')).toBeInTheDocument()
    await waitFor(() => expect(remoteConfigRequests).toBe(1))
    await waitFor(() => expect(screen.getAllByTestId('recommend-view')).toHaveLength(4))
    expect(screen.getByText('AniList 当前趋势')).toBeInTheDocument()
    expect(screen.getByText('AniList 本季热门')).toBeInTheDocument()
    expect(screen.queryByText('重复来源')).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('MP_RECOMMEND') || '{}')).toEqual(remoteConfig)
  })

  it('filters by the registered category and waits 120ms until ready before showing its empty state', async () => {
    const setTimeout = vi.spyOn(window, 'setTimeout')
    const sourcesRequested = vi.fn()
    localStorage.setItem('MP_RECOMMEND', JSON.stringify({ '流行趋势': true }))
    server.use(recommendSourcesHandler([], 200, sourcesRequested))

    await renderRecommend()
    await waitFor(() => expect(sourcesRequested).toHaveBeenCalledOnce())
    const headerTab = getHeaderConfig()
    headerTab.modelValue.value = '电视剧'
    await nextTick()

    expect(screen.queryByText('当前分类下没有可显示的内容')).not.toBeInTheDocument()
    const readyTimer = setTimeout.mock.calls.find(([, delay]) => delay === 120)?.[0]
    expect(typeof readyTimer).toBe('function')
    ;(readyTimer as () => void)()
    await nextTick()

    expect(screen.getByText('当前分类下没有可显示的内容')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '设置显示内容' })).toBeInTheDocument()
  })

  it('loads extra sources only once during the initial KeepAlive activation', async () => {
    const requested = vi.fn()
    let releaseResponse = () => {}
    const responseGate = new Promise<void>(resolve => {
      releaseResponse = resolve
    })
    localStorage.setItem('MP_RECOMMEND', JSON.stringify({ '流行趋势': true, '请求完成来源': true }))
    server.use(
      http.get(recommendApiUrls.sources, async () => {
        requested()
        await responseGate
        return HttpResponse.json([{ api_path: 'recommend/completed', name: '请求完成来源', type: '扩展' }])
      }),
    )

    await renderKeptAliveRecommend()
    await waitFor(() => expect(requested).toHaveBeenCalled())
    await new Promise(resolve => window.setTimeout(resolve, 25))

    try {
      expect(requested).toHaveBeenCalledOnce()
    } finally {
      releaseResponse()
    }
    expect(await screen.findByText('请求完成来源')).toBeInTheDocument()
  })

  it('syncs updated remote config and withdrawn extra sources when KeepAlive page reactivates', async () => {
    let sources: RecommendSource[] = [{ api_path: 'recommend/custom', name: '已撤销来源', type: '扩展' }]
    let remoteConfig: Record<string, boolean> = { '流行趋势': true, '已撤销来源': true }
    const sourcesRequested = vi.fn()
    const configRequested = vi.fn()
    server.use(
      http.get(recommendApiUrls.config, () => {
        configRequested()
        return HttpResponse.json({ data: { value: remoteConfig }, success: true })
      }),
      dynamicRecommendSources(() => sources, sourcesRequested),
    )

    await renderKeptAliveRecommend()
    expect(await screen.findByText('已撤销来源')).toBeInTheDocument()
    expect(screen.getByText('流行趋势')).toBeInTheDocument()
    const sourcesCountBefore = sourcesRequested.mock.calls.length
    const configCountBefore = configRequested.mock.calls.length
    sources = []
    remoteConfig = { '流行趋势': false, '正在热映': true }

    await fireEvent.click(screen.getByRole('button', { name: '停用推荐页' }))
    await fireEvent.click(screen.getByRole('button', { name: '启用推荐页' }))

    await waitFor(() => expect(sourcesRequested).toHaveBeenCalledTimes(sourcesCountBefore + 1))
    await waitFor(() => expect(configRequested).toHaveBeenCalledTimes(configCountBefore + 1))
    await waitFor(() => expect(screen.queryByText('已撤销来源')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.queryByText('流行趋势')).not.toBeInTheDocument())
    expect(screen.getByText('正在热映')).toBeInTheDocument()
  })

  it('loads remote configuration when local configuration is absent', async () => {
    const remoteConfig = { '流行趋势': false, '正在热映': true }
    const configRequested = vi.fn()
    const sourcesRequested = vi.fn()
    server.use(
      recommendConfigHandler(remoteConfig, 200, configRequested),
      recommendSourcesHandler([], 200, sourcesRequested),
    )

    await renderRecommend()

    await waitFor(() => expect(configRequested).toHaveBeenCalledOnce())
    await waitFor(() => expect(sourcesRequested).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.queryByText('流行趋势')).not.toBeInTheDocument())
    expect(screen.getByText('正在热映')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('MP_RECOMMEND') || '{}')).toEqual(remoteConfig)
  })

  it.each([
    ['damaged JSON', '{damaged'],
    ['null', 'null'],
    ['an array', '[]'],
    ['a non-boolean field', JSON.stringify({ '流行趋势': 'enabled' })],
  ])('clears %s local configuration when remote configuration is unavailable', async (_case, storedConfig) => {
    const configRequested = vi.fn()
    const sourcesRequested = vi.fn()
    localStorage.setItem('MP_RECOMMEND', storedConfig)
    server.use(recommendConfigHandler(null, 200, configRequested), recommendSourcesHandler([], 200, sourcesRequested))

    await renderRecommend()

    await waitFor(() => expect(configRequested).toHaveBeenCalledOnce())
    await waitFor(() => expect(sourcesRequested).toHaveBeenCalledOnce())
    expect(localStorage.getItem('MP_RECOMMEND')).toBeNull()
    expect(screen.getByText('流行趋势')).toBeInTheDocument()
  })

  it('falls back to local configuration when remote configuration request fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const configRequested = vi.fn()
    localStorage.setItem('MP_RECOMMEND', JSON.stringify({ '流行趋势': false, '正在热映': true }))
    server.use(recommendConfigHandler(null, 500, configRequested), recommendSourcesHandler([]))

    await renderRecommend()

    await waitFor(() => expect(configRequested).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.queryByText('流行趋势')).not.toBeInTheDocument())
    expect(screen.getByText('正在热映')).toBeInTheDocument()
  })

  it('keeps defaults and does not persist an invalid remote configuration', async () => {
    const configRequested = vi.fn()
    const sourcesRequested = vi.fn()
    server.use(
      recommendConfigHandler({ '流行趋势': 'enabled' }, 200, configRequested),
      recommendSourcesHandler([], 200, sourcesRequested),
    )

    await renderRecommend()

    await waitFor(() => expect(configRequested).toHaveBeenCalledOnce())
    await waitFor(() => expect(sourcesRequested).toHaveBeenCalledOnce())
    expect(screen.getByText('流行趋势')).toBeInTheDocument()
    expect(localStorage.getItem('MP_RECOMMEND')).toBeNull()
  })

  it('saves settings through the shared dialog boundary opened from header button', async () => {
    const savedConfig = vi.fn()
    const sourcesRequested = vi.fn()
    localStorage.setItem('MP_RECOMMEND', JSON.stringify({ '流行趋势': true }))
    server.use(recommendSourcesHandler([], 200, sourcesRequested), saveRecommendConfigHandler(savedConfig))
    await renderRecommend()
    await waitFor(() => expect(sourcesRequested).toHaveBeenCalledOnce())

    getSettingsHeaderButton().action()
    expect(mocks.openSharedDialog).toHaveBeenCalledOnce()
    const dialogEvents = mocks.openSharedDialog.mock.calls[0][2] as SharedDialogEvents
    const nextConfig = { '流行趋势': false, '正在热映': true }

    await dialogEvents.save({ enabled: nextConfig })

    expect(savedConfig).toHaveBeenCalledWith(nextConfig)
    expect(localStorage.getItem('MP_RECOMMEND')).toBe(JSON.stringify(nextConfig))
    expect(mocks.controllers[0].close).toHaveBeenCalledOnce()
  })

  it('keeps current settings and local cache intact when saving to server fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.setItem('MP_RECOMMEND', JSON.stringify({ '流行趋势': true }))
    server.use(
      recommendSourcesHandler([]),
      saveRecommendConfigHandler(() => {}, 500),
    )
    await renderRecommend()

    getSettingsHeaderButton().action()
    const dialogEvents = mocks.openSharedDialog.mock.calls[0][2] as SharedDialogEvents
    await dialogEvents.save({ enabled: { '流行趋势': false } })

    expect(mocks.toastError).toHaveBeenCalledWith('保存失败')
    expect(localStorage.getItem('MP_RECOMMEND')).toBe(JSON.stringify({ '流行趋势': true }))
    expect(mocks.controllers[0].close).not.toHaveBeenCalled()
  })

  it('releases the shared settings controller through both close contracts', async () => {
    const sourcesRequested = vi.fn()
    localStorage.setItem('MP_RECOMMEND', JSON.stringify({ '流行趋势': true }))
    server.use(recommendSourcesHandler([], 200, sourcesRequested))
    await renderRecommend()
    await waitFor(() => expect(sourcesRequested).toHaveBeenCalledOnce())
    const openSettings = getSettingsHeaderButton().action

    openSettings()
    const dialogProps = mocks.openSharedDialog.mock.calls[0][1] as {
      valueGetter: (item: { title: string }) => string
    }
    const firstDialogEvents = mocks.openSharedDialog.mock.calls[0][2] as SharedDialogEvents
    expect(dialogProps.valueGetter({ title: '流行趋势' })).toBe('流行趋势')

    firstDialogEvents.close()
    openSettings()
    expect(mocks.controllers[0].close).not.toHaveBeenCalled()

    const secondDialogEvents = mocks.openSharedDialog.mock.calls[1][2] as SharedDialogEvents
    secondDialogEvents['update:modelValue'](true)
    openSettings()
    expect(mocks.controllers[1].close).toHaveBeenCalledOnce()

    const thirdDialogEvents = mocks.openSharedDialog.mock.calls[2][2] as SharedDialogEvents
    thirdDialogEvents['update:modelValue'](false)
    openSettings()
    expect(mocks.controllers[2].close).not.toHaveBeenCalled()
  })

  it('keeps built-in content when remote requests fail', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    server.use(recommendConfigHandler({}, 500), recommendSourcesHandler([], 500))

    await renderRecommend()

    await waitFor(() => expect(consoleError).toHaveBeenCalled())
    await waitFor(() => expect(consoleLog).toHaveBeenCalled())
    expect(screen.getByText('流行趋势')).toBeInTheDocument()
  })

  it('clears its delayed-render timer when unmounted', async () => {
    const setTimeout = vi.spyOn(window, 'setTimeout')
    const clearTimeout = vi.spyOn(window, 'clearTimeout')
    const sourcesRequested = vi.fn()
    localStorage.setItem('MP_RECOMMEND', JSON.stringify({ '流行趋势': true }))
    server.use(recommendSourcesHandler([], 200, sourcesRequested))
    const { unmount } = await renderRecommend()

    await waitFor(() => expect(sourcesRequested).toHaveBeenCalledOnce())
    await fireEvent.click(screen.getByText('流行趋势'))
    const componentTimerIndexes = setTimeout.mock.calls
      .map(([, delay], index) => ({ delay, index }))
      .filter(({ delay }) => delay === 120)
    expect(componentTimerIndexes).toHaveLength(1)
    const componentTimer = setTimeout.mock.results[componentTimerIndexes[0].index].value
    unmount()

    expect(clearTimeout).toHaveBeenCalledWith(componentTimer)
  })
})
