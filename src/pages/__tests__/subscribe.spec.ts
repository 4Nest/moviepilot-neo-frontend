import SubscribePage from '@/pages/subscribe.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h, nextTick, ref, unref, type ComputedRef, type Ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  openSharedDialog: vi.fn(),
  registerHeaderTab: vi.fn(),
}))

vi.mock('@/composables/useDynamicHeaderTab', () => ({
  useDynamicHeaderTab: () => ({ registerHeaderTab: mocks.registerHeaderTab }),
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

interface SubscribeBatchState {
  enabled: boolean
  selectedCount: number
  totalCount: number
  allSelected: boolean
  operating?: boolean
}

const SubscribeListViewStub = defineComponent({
  name: 'SubscribeListView',
  props: {
    type: String,
    subid: String,
    keyword: String,
    statusFilter: String,
    sortMode: {
      type: Boolean,
      default: false,
    },
    sortBy: {
      type: String,
      default: '',
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  emits: ['update:sortMode', 'update:sortBy', 'batch-state-change'],
  setup(props, { emit, expose }) {
    const lastCommand = ref('none')
    const batchState = ref<SubscribeBatchState>({
      enabled: false,
      selectedCount: 0,
      totalCount: 0,
      allSelected: false,
    })

    const runCommand = (command: string) => {
      lastCommand.value = command
    }
    const publishBatchState = (state: SubscribeBatchState) => {
      batchState.value = state
      emit('batch-state-change', state)
    }

    expose({
      enterBatchMode: () => runCommand('enter-batch'),
      exitBatchMode: () => runCommand('exit-batch'),
      toggleSelectAll: () => runCommand('toggle-select-all'),
      batchEnableSubscribes: () => runCommand('batch-enable'),
      batchPauseSubscribes: () => runCommand('batch-pause'),
      batchDeleteSubscribes: () => runCommand('batch-delete'),
      openHistoryDialog: () => runCommand('open-history'),
    })

    return () =>
      h('section', { 'aria-label': 'subscription list stub' }, [
        h('button', { 'data-menu-activator': 'filter-btn', type: 'button' }, 'filter activator'),
        h('output', { 'aria-label': 'list type' }, props.type ?? ''),
        h('output', { 'aria-label': 'list subscription id' }, props.subid ?? ''),
        h('output', { 'aria-label': 'list keyword' }, props.keyword ?? ''),
        h('output', { 'aria-label': 'list status filter' }, props.statusFilter ?? ''),
        h('output', { 'aria-label': 'list sort mode' }, String(props.sortMode)),
        h('output', { 'aria-label': 'list sort by' }, props.sortBy ?? ''),
        h('output', { 'aria-label': 'list active state' }, String(props.active)),
        h('output', { 'aria-label': 'list batch state' }, JSON.stringify(batchState.value)),
        h('output', { 'aria-label': 'last list command' }, lastCommand.value),
        h('button', { type: 'button', onClick: () => emit('update:sortMode', true) }, 'emit sort mode on'),
        h('button', { type: 'button', onClick: () => emit('update:sortMode', false) }, 'emit sort mode off'),
        h('button', { type: 'button', onClick: () => emit('update:sortBy', 'date') }, 'emit date sort'),
        h(
          'button',
          {
            type: 'button',
            onClick: () => publishBatchState({ enabled: true, selectedCount: 2, totalCount: 3, allSelected: false }),
          },
          'publish batch selection',
        ),
        h(
          'button',
          {
            type: 'button',
            onClick: () => publishBatchState({ enabled: true, selectedCount: 3, totalCount: 3, allSelected: true }),
          },
          'publish all selected batch',
        ),
        h(
          'button',
          {
            type: 'button',
            onClick: () =>
              publishBatchState({
                enabled: true,
                selectedCount: 2,
                totalCount: 3,
                allSelected: false,
                operating: true,
              }),
          },
          'publish operating batch',
        ),
      ])
  },
})

const SubscribeShareViewStub = defineComponent({
  name: 'SubscribeShareView',
  props: { keyword: String },
  setup(props) {
    return () =>
      h('section', { 'aria-label': 'shared subscription stub' }, [
        h('output', { 'aria-label': 'share keyword' }, props.keyword ?? ''),
      ])
  },
})

type MaybeRef<T> = T | Ref<T> | ComputedRef<T>

interface HeaderButtonConfig {
  title?: string
  label?: MaybeRef<string>
  icon: string
  dataAttr?: string
  testId?: string
  action?: () => void
  color?: MaybeRef<string>
  show?: MaybeRef<boolean>
}

interface HeaderTabConfig {
  items: MaybeRef<Array<{ title: string; tab: string }>>
  modelValue: Ref<string>
  appendButtons: HeaderButtonConfig[]
}

interface RenderSubscribeOptions {
  initialRoute?: string
  subType?: '电影' | '电视剧'
  superUser?: boolean
}

async function renderSubscribe(options: RenderSubscribeOptions = {}) {
  const subType = options.subType ?? '电影'

  return renderWithProviders(SubscribePage, {
    initialRoute: options.initialRoute ?? `/subscribe/${subType === '电影' ? 'movie' : 'tv'}`,
    initialRouteMeta: { subType },
    initialState: {
      user: {
        superUser: options.superUser ?? true,
      },
    },
    global: {
      stubs: {
        SubscribeListView: SubscribeListViewStub,
        SubscribeShareView: SubscribeShareViewStub,
      },
    },
  })
}

function getHeaderConfig() {
  return mocks.registerHeaderTab.mock.calls.at(-1)?.[0] as HeaderTabConfig
}

function getHeaderButton(predicate: (button: HeaderButtonConfig) => boolean) {
  const button = getHeaderConfig().appendButtons.find(predicate)
  if (!button) throw new Error('Expected dynamic header button was not registered')
  return button
}

function getListOutput(label: string) {
  return screen.getByLabelText(label)
}

describe('subscribe page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses movie route meta and query values to register the movie page contract', async () => {
    const { router } = await renderSubscribe({ initialRoute: '/subscribe/movie?id=42' })

    await waitFor(() => expect(getListOutput('list active state')).toHaveTextContent('true'))
    const header = getHeaderConfig()

    expect(router.currentRoute.value.meta.subType).toBe('电影')
    expect(unref(header.items).map(item => item.tab)).toEqual(['mysub', 'share'])
    expect(header.modelValue.value).toBe('mysub')
    expect(getListOutput('list type')).toHaveTextContent('电影')
    expect(getListOutput('list subscription id')).toHaveTextContent('42')
  })

  it('uses TV route meta and tab query to expose the share page contract', async () => {
    const { router } = await renderSubscribe({
      initialRoute: '/subscribe/tv?tab=share&id=73',
      subType: '电视剧',
    })
    const header = getHeaderConfig()

    expect(router.currentRoute.value.meta.subType).toBe('电视剧')
    expect(unref(header.items).map(item => item.tab)).toEqual(['mysub', 'share'])
    expect(header.modelValue.value).toBe('share')
    expect(screen.getByLabelText('share keyword')).toHaveTextContent('')
  })

  it.each([
    ['movie value', '电影' as const, 'last_update', 'last_update'],
    ['TV-only value', '电视剧' as const, 'lack_episode', 'lack_episode'],
    ['invalid value', '电视剧' as const, 'unexpected', ''],
    ['TV-only value on movies', '电影' as const, 'lack_episode', ''],
  ])('normalizes stored sorting for %s', async (_case, subType, storedSort, expectedSort) => {
    localStorage.setItem(`MPSubscribeSortBy:${subType}`, storedSort)

    await renderSubscribe({ subType })

    expect(getListOutput('list sort by')).toHaveTextContent(expectedSort)
  })

  it('keeps page state usable when sort storage reads or writes fail', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage read failed')
    })

    await renderSubscribe()

    expect(getListOutput('list sort by')).toHaveTextContent('')
    expect(consoleWarn).toHaveBeenCalledWith('读取订阅排序方式失败:', expect.any(Error))
    getItem.mockRestore()

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage write failed')
    })
    await fireEvent.click(screen.getByRole('button', { name: 'emit date sort' }))

    await waitFor(() => expect(getListOutput('list sort by')).toHaveTextContent('date'))
    expect(consoleWarn).toHaveBeenCalledWith('保存订阅排序方式失败:', expect.any(Error))
  })

  it('coordinates filter and sort state through header actions and list emits', async () => {
    await renderSubscribe({ subType: '电视剧' })
    const filterButton = getHeaderButton(button => button.dataAttr === 'filter-btn')
    const sortButton = getHeaderButton(button => button.icon === 'mdi-sort-variant')

    filterButton.action?.()
    await nextTick()
    const nameInput = await screen.findByPlaceholderText('名称')
    await fireEvent.update(nameInput, 'Matrix')
    expect(getListOutput('list keyword')).toHaveTextContent('Matrix')

    await fireEvent.click(screen.getByText('暂停'))
    expect(getListOutput('list status filter')).toHaveTextContent('paused')

    sortButton.action?.()
    await nextTick()
    expect(getListOutput('list sort mode')).toHaveTextContent('true')
    expect(getListOutput('list sort by')).toHaveTextContent('custom')

    await fireEvent.click(screen.getByRole('button', { name: 'emit sort mode off' }))
    await fireEvent.click(screen.getByRole('button', { name: 'emit date sort' }))
    expect(getListOutput('list sort mode')).toHaveTextContent('false')
    expect(getListOutput('list sort by')).toHaveTextContent('date')
  })

  it('exits batch management before entering drag sorting', async () => {
    const { container } = await renderSubscribe()
    const sortButton = getHeaderButton(button => button.icon === 'mdi-sort-variant')
    const batchButton = getHeaderButton(button => button.icon === 'mdi-checkbox-multiple-marked-outline')

    await fireEvent.click(screen.getByRole('button', { name: 'publish batch selection' }))
    expect(container.querySelector('.mp-page-action-bar')).not.toBeNull()

    sortButton.action?.()
    await nextTick()
    expect(getListOutput('last list command')).toHaveTextContent('exit-batch')
    expect(getListOutput('list sort mode')).toHaveTextContent('true')
    expect(getListOutput('list sort by')).toHaveTextContent('custom')
    expect(unref(batchButton.color)).toBe('')
    expect(container.querySelector('.mp-page-action-bar')).toBeNull()
  })

  it('delegates inline batch actions to the list public API', async () => {
    await renderSubscribe()
    const batchButton = getHeaderButton(button => button.icon === 'mdi-checkbox-multiple-marked-outline')

    batchButton.action?.()
    await nextTick()
    expect(getListOutput('last list command')).toHaveTextContent('enter-batch')

    await fireEvent.click(screen.getByRole('button', { name: 'publish batch selection' }))

    for (const [label, command] of [
      ['选择全部订阅', 'toggle-select-all'],
      ['批量启用', 'batch-enable'],
      ['批量暂停', 'batch-pause'],
      ['批量删除', 'batch-delete'],
      ['退出批量操作', 'exit-batch'],
    ] as const) {
      await fireEvent.click(screen.getByRole('button', { name: label }))
      await nextTick()
      expect(getListOutput('last list command')).toHaveTextContent(command)
    }
  })

  it('exits batch mode when the header leaves the personal subscription tab', async () => {
    const { container } = await renderSubscribe({ subType: '电视剧' })
    await fireEvent.click(screen.getByRole('button', { name: 'publish batch selection' }))

    getHeaderConfig().modelValue.value = 'share'
    await nextTick()

    expect(getListOutput('last list command')).toHaveTextContent('exit-batch')
    expect(getListOutput('list active state')).toHaveTextContent('false')
    expect(container.querySelector('.mp-page-action-bar')).toBeNull()
  })

  it('falls back to the default visible tab and never mounts SubscribeShareView when a non-superuser visits ?tab=share', async () => {
    const { router } = await renderSubscribe({
      initialRoute: '/subscribe/tv?tab=share',
      subType: '电视剧',
      superUser: false,
    })

    const header = getHeaderConfig()
    expect(unref(header.items).map(item => item.tab)).toEqual(['mysub'])
    expect(header.modelValue.value).toBe('mysub')
    expect(getListOutput('list active state')).toHaveTextContent('true')
    expect(screen.queryByLabelText('shared subscription stub')).not.toBeInTheDocument()

    await router.push('/subscribe/tv?tab=unknown')
    await nextTick()
    expect(header.modelValue.value).toBe('mysub')
    expect(screen.queryByLabelText('shared subscription stub')).not.toBeInTheDocument()
  })

  it('exposes the share tab on the movie subscription page for superusers and blocks non-superusers', async () => {
    const { unmount } = await renderSubscribe({
      initialRoute: '/subscribe/movie?tab=share',
      subType: '电影',
      superUser: true,
    })

    let header = getHeaderConfig()
    expect(unref(header.items).map(item => item.tab)).toEqual(['mysub', 'share'])
    expect(header.modelValue.value).toBe('share')
    expect(await screen.findByLabelText('shared subscription stub')).toBeInTheDocument()
    unmount()

    await renderSubscribe({
      initialRoute: '/subscribe/movie?tab=share',
      subType: '电影',
      superUser: false,
    })

    header = getHeaderConfig()
    expect(unref(header.items).map(item => item.tab)).toEqual(['mysub'])
    expect(header.modelValue.value).toBe('mysub')
    expect(screen.queryByLabelText('shared subscription stub')).not.toBeInTheDocument()
  })

  it('registers history and default-rule actions in header appendButtons', async () => {
    const { container } = await renderSubscribe()

    // 常态下不额外渲染占空行的 .mp-page-action-bar
    expect(container.querySelector('.mp-page-action-bar')).toBeNull()

    const historyButton = getHeaderButton(button => button.testId === 'subscribe-history-btn')
    const defaultRuleButton = getHeaderButton(button => button.testId === 'subscribe-default-rule-btn')
    expect(unref(historyButton.show)).toBe(true)
    expect(unref(defaultRuleButton.show)).toBe(true)
    expect(unref(historyButton.label)).toContain('订阅历史')
    expect(unref(defaultRuleButton.label)).toContain('默认订阅规则')

    historyButton.action?.()
    await nextTick()
    expect(getListOutput('last list command')).toHaveTextContent('open-history')
    defaultRuleButton.action?.()
    expect(mocks.openSharedDialog).toHaveBeenCalledWith(
      expect.any(Object),
      { default: true, type: '电影' },
      {},
      { closeOn: ['close', 'save'] },
    )
  })

  it('omits share header filter button, labels mysub appendButtons, syncs route.query.id, and locks batch actions while operating', async () => {
    const { router } = await renderSubscribe({
      initialRoute: '/subscribe/tv?tab=share',
      subType: '电视剧',
    })
    const header = getHeaderConfig()
    expect(header.appendButtons.some(button => button.dataAttr === 'share-filter-btn')).toBe(false)
    expect(header.appendButtons.map(button => button.title)).toEqual([
      '电视剧订阅历史',
      '默认订阅规则',
      '筛选',
      '排序模式',
      '批量管理',
    ])

    await router.push('/subscribe/tv?id=88')
    await nextTick()
    await waitFor(() => expect(header.modelValue.value).toBe('mysub'))
    expect(getListOutput('list subscription id')).toHaveTextContent('88')

    await fireEvent.click(screen.getByRole('button', { name: 'publish operating batch' }))
    expect(screen.getByRole('button', { name: '批量启用' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '批量暂停' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '批量删除' })).toBeDisabled()
  })
})
