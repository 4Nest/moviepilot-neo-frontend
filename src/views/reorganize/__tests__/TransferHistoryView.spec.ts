import type { TransferHistory } from '@/api/types'
import TransferHistoryView from '@/views/reorganize/TransferHistoryView.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { flushPromises } from '@vue/test-utils'
import { computed, defineComponent, h, nextTick, ref, type PropType } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  createConfirm: vi.fn(),
  desktop: true,
  openSharedDialog: vi.fn(),
  progressCallback: undefined as ((event: MessageEvent) => unknown) | undefined,
  progressStart: vi.fn(),
  progressStop: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  width: 1600,
}))

vi.mock('@/api', () => ({
  default: {
    delete: (...args: unknown[]) => mocks.apiDelete(...args),
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
  },
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

vi.mock('@/composables/useConfirm', () => ({
  default: { install: () => {} },
  useConfirm: () => mocks.createConfirm,
}))

vi.mock('vuetify', async importOriginal => {
  const actual = await importOriginal<typeof import('vuetify')>()
  return {
    ...actual,
    useDisplay: () => ({
      mdAndUp: computed(() => mocks.desktop),
      smAndDown: computed(() => !mocks.desktop),
      width: computed(() => mocks.width),
    }),
  }
})

vi.mock('@/composables/useAvailableHeight', () => ({
  useAvailableHeight: () => ({ availableHeight: ref(600) }),
}))

vi.mock('@/composables/useBackground', () => ({
  useBackground: () => ({
    useProgressSSE: (_url: string, callback: (event: MessageEvent) => unknown) => {
      mocks.progressCallback = callback
      return {
        start: mocks.progressStart,
        stop: mocks.progressStop,
      }
    },
  }),
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

/** 替身表格的显示顺序，用于模拟排序和分组后的可见记录。 */
let stubDisplayOrder: (items: TransferHistory[]) => TransferHistory[] = items => items
/** 是否在替身表格中直接渲染 `#item.title` 插槽。 */
let renderTitleSlot = false
/** 是否在替身表格中直接渲染 `#item.src` 插槽。 */
let renderSrcSlot = false
/** 是否在替身表格中直接渲染右侧详情列（size/mode/date/status）插槽。 */
let renderDetailSlots = false

const TooltipStub = defineComponent({
  name: 'VTooltip',
  props: {
    text: {
      type: String,
      default: '',
    },
  },
  setup(props, { slots }) {
    return () => h('span', { 'data-tooltip-text': props.text }, [slots.activator?.({ props: {} }), slots.default?.()])
  },
})

const HistoryTableStub = defineComponent({
  name: 'VDataTableVirtual',
  props: {
    headers: {
      type: Array as PropType<
        Array<{
          key: string
          title?: string
          sortRaw?: (left: TransferHistory, right: TransferHistory) => number
        }>
      >,
      default: () => [],
    },
    items: {
      type: Array as PropType<TransferHistory[]>,
      default: () => [],
    },
    modelValue: {
      type: Array as PropType<TransferHistory[]>,
      default: () => [],
    },
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit, slots }) {
    return () => {
      const sortResults =
        props.items.length >= 2
          ? Object.fromEntries(
              props.headers
                .filter(header => header.sortRaw)
                .map(header => [header.key, header.sortRaw?.(props.items[0], props.items[1])]),
            )
          : {}

      const displayedItems = stubDisplayOrder(props.items)
      const headerKeys = props.headers.map(header => header.key)

      return h(
        'section',
        {
          ...attrs,
          'aria-label': '整理历史桌面列表',
          'data-header-keys': headerKeys.join(','),
          'data-header-titles': props.headers.map(header => header.title ?? '').join(','),
        },
        [
          h('div', { class: 'v-table__wrapper' }, [
            h('output', { 'aria-label': '整理历史排序结果' }, JSON.stringify(sortResults)),
            ...(slots['body.prepend']?.({ groupedItems: displayedItems.map(raw => ({ type: 'item', raw })) }) ?? []),
            ...displayedItems.map(item =>
              h('article', { 'data-history-id': item.id }, [
                slots['item.data-table-select']?.({ item }),
                renderTitleSlot ? slots['item.title']?.({ item }) : h('span', item.title),
                renderSrcSlot ? slots['item.src']?.({ item }) : null,
                renderDetailSlots && headerKeys.includes('mode') ? slots['item.mode']?.({ item }) : null,
                renderDetailSlots && headerKeys.includes('size') ? slots['item.size']?.({ item }) : null,
                renderDetailSlots && headerKeys.includes('date') ? slots['item.date']?.({ item }) : null,
                renderDetailSlots && headerKeys.includes('status') ? slots['item.status']?.({ item }) : null,
                slots['item.actions']?.({ item }),
              ]),
            ),
            h(
              'button',
              {
                onClick: () => emit('update:modelValue', props.items),
                type: 'button',
              },
              '选择当前页',
            ),
          ]),
        ],
      )
    }
  },
})

type InfiniteStatus = 'empty' | 'error' | 'ok'

const InfiniteScrollStub = defineComponent({
  name: 'VInfiniteScroll',
  props: {
    margin: {
      type: Number,
      required: true,
    },
  },
  emits: ['load'],
  setup(props, { emit, slots }) {
    const status = ref('idle')
    function load() {
      status.value = 'loading'
      emit('load', {
        done(nextStatus: InfiniteStatus) {
          status.value = nextStatus === 'ok' ? 'idle' : nextStatus
        },
      })
    }
    return () =>
      h('section', { 'aria-label': '整理历史无限列表', 'data-margin': String(props.margin) }, [
        h('output', { 'aria-label': '整理历史无限列表状态' }, status.value),
        status.value === 'loading' ? slots.loading?.({}) : null,
        status.value === 'error'
          ? slots.error?.({
              side: 'end',
              props: { color: undefined, onClick: load },
            })
          : null,
        status.value === 'empty' ? slots.empty?.({}) : null,
        slots.default?.(),
        status.value === 'idle' ? h('button', { onClick: load, type: 'button' }, '加载下一页') : null,
      ])
  },
})

const ProgressiveGridStub = defineComponent({
  name: 'ProgressiveCardGrid',
  props: {
    getItemKey: {
      type: Function as PropType<(item: TransferHistory) => number>,
      required: true,
    },
    items: {
      type: Array as PropType<TransferHistory[]>,
      default: () => [],
    },
  },
  setup(props, { slots }) {
    return () => {
      const candidates =
        props.items.length <= 7 ? props.items : [...props.items.slice(0, 3), props.items[24], ...props.items.slice(-3)]
      const renderedItems = [...new Map(candidates.map(item => [item.id, item])).values()]

      return h(
        'section',
        { 'aria-label': '整理历史移动列表' },
        renderedItems.flatMap(item => [
          h('output', { 'data-mobile-key': props.getItemKey(item) }, String(props.getItemKey(item))),
          ...(slots.default?.({ item }) ?? []),
        ]),
      )
    }
  },
})

const SearchStub = defineComponent({
  name: 'VCombobox',
  props: {
    modelValue: {
      type: String,
      default: '',
    },
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        ...attrs,
        value: props.modelValue ?? '',
        onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
      })
  },
})

const PassthroughStub = defineComponent({
  inheritAttrs: false,
  setup(_props, { attrs, slots }) {
    return () => h('div', attrs, slots.default?.())
  },
})

const EmptyStub = defineComponent({
  inheritAttrs: false,
  setup() {
    return () => h('div')
  },
})

const ListItemStub = defineComponent({
  name: 'VListItem',
  inheritAttrs: false,
  props: {
    disabled: Boolean,
  },
  emits: ['click'],
  setup(props, { emit, slots }) {
    return () =>
      h(
        'button',
        {
          disabled: props.disabled,
          onClick: () => emit('click'),
          type: 'button',
        },
        [slots.prepend?.(), slots.default?.()],
      )
  },
})

const ListItemTitleStub = defineComponent({
  name: 'VListItemTitle',
  inheritAttrs: false,
  setup(_props, { attrs, slots }) {
    return () => h('span', attrs, slots.default?.())
  },
})

function createHistory(id: number, title: string, overrides: Partial<TransferHistory> = {}): TransferHistory {
  return {
    id,
    title,
    type: '电影',
    status: true,
    src: `/downloads/${title}.mkv`,
    dest: `/media/${title}.mkv`,
    src_storage: 'downloads',
    dest_storage: 'library',
    mode: 'link',
    ...overrides,
  } as TransferHistory
}

function historyResponse(list: TransferHistory[], total = list.length) {
  return { data: { list, total }, success: true }
}

function storageResponse() {
  return { data: { value: [] }, success: true }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

async function renderHistory(initialRoute = '/history') {
  return renderWithProviders(TransferHistoryView, {
    global: {
      stubs: {
        ProgressiveCardGrid: ProgressiveGridStub,
        VCombobox: SearchStub,
        VDataTableVirtual: HistoryTableStub,
        VInfiniteScroll: InfiniteScrollStub,
        IconBtn: PassthroughStub,
        VList: PassthroughStub,
        VListItem: ListItemStub,
        VListItemTitle: ListItemTitleStub,
        VMenu: PassthroughStub,
        VPageContentTitle: true,
        VPagination: EmptyStub,
        VSelect: EmptyStub,
        VTooltip: TooltipStub,
      },
    },
    initialRoute,
    initialState: {
      globalSettings: {
        data: {
          GLOBAL_IMAGE_CACHE: false,
        },
      },
    },
  })
}

function getDialogCall(index = 0) {
  const [component, props, events, options] = mocks.openSharedDialog.mock.calls[index] as [
    { __name?: string; name?: string },
    Record<string, unknown>,
    Record<string, (...args: unknown[]) => unknown>,
    Record<string, unknown>,
  ]
  return { component, events, options, props }
}

describe('TransferHistoryView', () => {
  beforeEach(() => {
    stubDisplayOrder = items => items
    renderTitleSlot = false
    renderSrcSlot = false
    renderDetailSlots = false
    mocks.desktop = true
    mocks.width = 1600
    mocks.progressCallback = undefined
    mocks.apiDelete.mockResolvedValue({ success: true })
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'system/setting/public/Storages') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse([]))
    })
    mocks.apiPost.mockResolvedValue({ data: { history_ids: [1], progress_key: 'progress-1' }, success: true })
    mocks.openSharedDialog.mockImplementation(() => ({
      close: vi.fn(),
      id: 1,
      updateProps: vi.fn(),
    }))
    mocks.createConfirm.mockResolvedValue(true)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses the desktop URL query as the request source and falls back from invalid pagination values', async () => {
    const requests: Array<Record<string, unknown>> = []
    mocks.apiGet.mockImplementation((path: string, config?: { params?: Record<string, unknown> }) => {
      if (path === 'system/setting/public/Storages') return Promise.resolve(storageResponse())
      requests.push(config?.params ?? {})
      return Promise.resolve(historyResponse([createHistory(1, '桌面结果')], 51))
    })

    await renderHistory('/history?search=%E7%A7%91%E5%B9%BB&itemsPerPage=30&currentPage=-8&grouped=true')

    expect(await screen.findByText('桌面结果')).toBeInTheDocument()
    expect(requests).toEqual([{ count: 50, page: 1, title: '科幻' }])
  })

  it('renders the desktop pagination total without a literal placeholder', async () => {
    await renderHistory()

    expect(await screen.findByText('1 - 0 / 0')).toBeInTheDocument()
    expect(screen.queryByText(/\{total\}/)).not.toBeInTheDocument()
  })

  it('prevents an older desktop request from replacing a newer route search', async () => {
    const oldRequest = createDeferred<ReturnType<typeof historyResponse>>()
    const newRequest = createDeferred<ReturnType<typeof historyResponse>>()
    let historyCalls = 0
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'system/setting/public/Storages') return Promise.resolve(storageResponse())
      historyCalls += 1
      return historyCalls === 1 ? oldRequest.promise : newRequest.promise
    })

    const { router } = await renderHistory('/history?search=old')
    await router.push('/history?search=new')
    newRequest.resolve(historyResponse([createHistory(2, '新结果')]))

    expect(await screen.findByText('新结果')).toBeInTheDocument()
    oldRequest.resolve(historyResponse([createHistory(1, '旧结果')]))
    await flushPromises()
    expect(screen.queryByText('旧结果')).not.toBeInTheDocument()
  })

  it('exposes title, episode, and source-size ordering through desktop table headers', async () => {
    const histories = [
      createHistory(1, '同名剧集', {
        episodes: 'E02',
        seasons: 'S01',
        src_fileitem: { size: 100 } as TransferHistory['src_fileitem'],
        type: '电视剧',
      }),
      createHistory(2, '同名剧集', {
        episodes: 'E01',
        seasons: 'S02',
        src_fileitem: { size: 200 } as TransferHistory['src_fileitem'],
        type: '电视剧',
      }),
    ]
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'system/setting/public/Storages') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse(histories))
    })

    await renderHistory()

    expect(await screen.findAllByText('同名剧集')).toHaveLength(2)
    const sortResults = JSON.parse(screen.getByRole('status', { name: '整理历史排序结果' }).textContent || '{}')
    expect(sortResults).toEqual({ size: -100, title: -1 })
  })

  it('persists desktop search through the same route-backed reload contract', async () => {
    vi.useFakeTimers()
    const { router } = await renderHistory('/history')
    await fireEvent.update(screen.getByLabelText('搜索（支持 * ? 通配符）'), 'desktop-query')
    await vi.advanceTimersByTimeAsync(1000)
    await flushPromises()

    expect(router.currentRoute.value.query).toMatchObject({
      currentPage: '1',
      itemsPerPage: '50',
      search: 'desktop-query',
    })
  })

  it('loads mobile pages with deduplication and reports empty when the last page is exhausted', async () => {
    mocks.desktop = false
    const firstPage = Array.from({ length: 25 }, (_, index) => createHistory(index + 1, `记录 ${index + 1}`))
    const secondPage = [
      createHistory(25, '重复记录'),
      ...Array.from({ length: 4 }, (_, index) => createHistory(26 + index, `追加 ${index + 1}`)),
    ]
    let historyCalls = 0
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'system/setting/public/Storages') return Promise.resolve(storageResponse())
      historyCalls += 1
      return Promise.resolve(historyResponse(historyCalls === 1 ? firstPage : secondPage, 29))
    })

    await renderHistory('/history?search=%E7%A7%BB%E5%8A%A8')

    expect(screen.getByLabelText('整理历史无限列表')).toHaveAttribute('data-margin', '0')
    await fireEvent.click(screen.getByRole('button', { name: '加载下一页' }))
    expect(await screen.findByText('记录 25')).toBeInTheDocument()
    expect(screen.getByLabelText('整理历史无限列表')).toHaveAttribute('data-margin', '280')
    await fireEvent.click(screen.getByRole('button', { name: '加载下一页' }))
    expect(await screen.findByText('追加 4')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-mobile-key="25"]')).toHaveLength(1)
    expect(screen.getByRole('status', { name: '整理历史无限列表状态' })).toHaveTextContent('empty')
  })

  it('keeps the mobile infinite list retryable after a request error', async () => {
    mocks.desktop = false
    let historyCalls = 0
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'system/setting/public/Storages') return Promise.resolve(storageResponse())
      historyCalls += 1
      if (historyCalls === 1) return Promise.reject(new Error('temporary failure'))
      return Promise.resolve(historyResponse([createHistory(1, '重试结果')]))
    })

    await renderHistory()

    await fireEvent.click(screen.getByRole('button', { name: '加载下一页' }))
    await waitFor(() => expect(screen.getByRole('status', { name: '整理历史无限列表状态' })).toHaveTextContent('error'))
    await fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('重试结果')).toBeInTheDocument()
  })

  it('selects a Shift range in the desktop table display order', async () => {
    const histories = [1, 2, 3, 4].map(id => createHistory(id, `记录${id}`))
    stubDisplayOrder = items => [...items].reverse()
    mocks.apiGet.mockImplementation((path: string) =>
      Promise.resolve(path === 'system/setting/public/Storages' ? storageResponse() : historyResponse(histories)),
    )
    await renderHistory('/history?grouped=false')
    await screen.findByText('记录4')

    await fireEvent.click(screen.getByRole('checkbox', { name: '选择 记录3' }))
    await fireEvent.click(screen.getByRole('checkbox', { name: '选择 记录1' }), { shiftKey: true })
    expect(screen.getByRole('checkbox', { name: '选择 记录4' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: '选择 记录3' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '选择 记录2' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '选择 记录1' })).toBeChecked()

    await fireEvent.click(screen.getByRole('checkbox', { name: '选择 记录2' }))
    await fireEvent.click(screen.getByRole('checkbox', { name: '选择 记录4' }), { shiftKey: true })
    expect(screen.getByRole('checkbox', { name: '选择 记录1' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '选择 记录2' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: '选择 记录3' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: '选择 记录4' })).not.toBeChecked()
  })

  it('formats mobile cards and keeps path and batch selection interactions reversible', async () => {
    mocks.desktop = false
    const item = createHistory(1, '移动剧集', {
      category: '动画',
      date: '2025-01-02 03:04:00',
      episodes: 'E03',
      errmsg: '目标路径不可用',
      image: '/poster.jpg',
      seasons: 'S01',
      status: false,
      type: '电视剧',
      year: '2025',
    })
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'system/setting/public/Storages') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse([item]))
    })

    const { container } = await renderHistory()
    await fireEvent.click(screen.getByRole('button', { name: '加载下一页' }))

    expect(await screen.findByText('移动剧集 S01E03')).toBeInTheDocument()
    expect(screen.getByText('动画 / 2025')).toBeInTheDocument()
    expect(screen.getByText('目标路径不可用')).toBeInTheDocument()
    const pathButton = container.querySelector('.transfer-history-mobile-record__paths') as HTMLButtonElement
    await fireEvent.click(pathButton)
    expect(pathButton).toHaveClass('transfer-history-mobile-record__paths--expanded')
    await fireEvent.click(pathButton)
    expect(pathButton).not.toHaveClass('transfer-history-mobile-record__paths--expanded')

    await fireEvent.click(screen.getByRole('button', { name: '批量选择' }))
    const record = container.querySelector('.transfer-history-mobile-record') as HTMLElement
    await fireEvent.click(record)
    expect(record).toHaveClass('transfer-history-mobile-record--selected')
    await fireEvent.click(screen.getByRole('button', { name: '取消全选' }))
    await nextTick()
    expect(record).not.toHaveClass('transfer-history-mobile-record--selected')
    await fireEvent.click(screen.getByRole('button', { name: '退出批量操作' }))
    await nextTick()
    expect(screen.getByRole('button', { name: '批量选择' })).toBeInTheDocument()
  })

  it('prevents a mobile request invalidated by a route reset from appending stale records', async () => {
    mocks.desktop = false
    const oldRequest = createDeferred<ReturnType<typeof historyResponse>>()
    const newRequest = createDeferred<ReturnType<typeof historyResponse>>()
    let historyCalls = 0
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'system/setting/public/Storages') return Promise.resolve(storageResponse())
      historyCalls += 1
      return historyCalls === 1 ? oldRequest.promise : newRequest.promise
    })

    const { router } = await renderHistory('/history?search=old')
    await fireEvent.click(screen.getByRole('button', { name: '加载下一页' }))
    await router.push('/history?search=new')
    await fireEvent.click(screen.getByRole('button', { name: '加载下一页' }))
    newRequest.resolve(historyResponse([createHistory(2, '移动新结果')]))

    expect(await screen.findByText('移动新结果')).toBeInTheDocument()
    oldRequest.resolve(historyResponse([createHistory(1, '移动旧结果')]))
    await flushPromises()
    expect(screen.queryByText('移动旧结果')).not.toBeInTheDocument()
  })

  it('persists mobile search in the URL before resetting the infinite list', async () => {
    vi.useFakeTimers()
    mocks.desktop = false
    const { router } = await renderHistory('/history?search=old')
    await flushPromises()

    await fireEvent.update(screen.getByLabelText('搜索（支持 * ? 通配符）'), 'new')
    await vi.advanceTimersByTimeAsync(600)

    expect(router.currentRoute.value).toMatchObject({
      path: '/history',
      query: { currentPage: '1', itemsPerPage: '50', search: 'new' },
    })
  })

  it('summarizes batch deletion failures, retains failed selections, and never renders undefined progress text', async () => {
    const histories = [createHistory(1, '成功项'), createHistory(2, '业务失败项'), createHistory(3, '异常失败项')]
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'system/setting/public/Storages') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse(histories))
    })
    mocks.apiDelete
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ message: '记录被占用', success: false })
      .mockRejectedValueOnce(new Error('delete unavailable'))

    await renderHistory()
    expect(await screen.findByText('成功项')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '选择当前页' }))
    await nextTick()
    await fireEvent.click(screen.getByRole('button', { name: '批量删除' }))

    const deleteDialog = getDialogCall()
    await deleteDialog.events.delete(false, false)
    await flushPromises()

    const progressDialog = getDialogCall(1)
    const controller = mocks.openSharedDialog.mock.results[1]?.value as { updateProps: ReturnType<typeof vi.fn> }
    expect(progressDialog.component.__name || progressDialog.component.name).toContain('ProgressDialog')
    expect(controller.updateProps).toHaveBeenCalled()
    expect(
      controller.updateProps.mock.calls
        .flatMap(call => Object.values(call[0]))
        .every(value => {
          return typeof value !== 'string' || !value.includes('undefined')
        }),
    ).toBe(true)
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('2'))
    expect(screen.getByRole('button', { name: '批量删除' })).toBeInTheDocument()
  })

  it('shows the existing toast-style feedback when a single deletion request throws', async () => {
    const item = createHistory(1, '异常删除')
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'system/setting/public/Storages') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse([item]))
    })
    mocks.apiDelete.mockRejectedValueOnce(new Error('delete unavailable'))

    await renderHistory()
    expect(await screen.findByText('异常删除')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '删除' }))
    await getDialogCall().events.delete(false, false)

    expect(mocks.toastError).toHaveBeenCalledWith('删除失败：请求异常')
  })

  it('releases delete-dialog ownership when either close contract fires', async () => {
    const item = createHistory(1, '删除弹窗生命周期')
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'system/setting/public/Storages') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse([item]))
    })

    await renderHistory()
    expect(await screen.findByText('删除弹窗生命周期')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '删除' }))
    const firstController = mocks.openSharedDialog.mock.results[0]?.value as { close: ReturnType<typeof vi.fn> }
    getDialogCall().events['update:modelValue'](false)
    await fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(firstController.close).not.toHaveBeenCalled()

    getDialogCall(1).events.close()
    await fireEvent.click(screen.getByRole('button', { name: '删除' }))
    const secondController = mocks.openSharedDialog.mock.results[1]?.value as { close: ReturnType<typeof vi.fn> }
    expect(secondController.close).not.toHaveBeenCalled()
  })

  it('moves back to the last available page after deleting the only record on the current page', async () => {
    const item = createHistory(26, '第二页唯一记录')
    const requestedPages: number[] = []
    mocks.apiGet.mockImplementation((path: string, config?: { params?: { page?: number } }) => {
      if (path === 'system/setting/public/Storages') return Promise.resolve(storageResponse())
      const page = config?.params?.page ?? 1
      requestedPages.push(page)
      if (requestedPages.length === 1) return Promise.resolve(historyResponse([item], 26))
      return Promise.resolve(historyResponse([], 25))
    })

    const { router } = await renderHistory('/history?itemsPerPage=25&currentPage=2')
    expect(await screen.findByText('第二页唯一记录')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '删除' }))
    await getDialogCall().events.delete(false, false)
    await waitFor(() => expect(router.currentRoute.value.query.currentPage).toBe('1'))
    await waitFor(() => expect(requestedPages).toEqual([2, 2, 1]))
  })

  it('keeps failed mobile batch identities selected after resetting and reloading the list', async () => {
    mocks.desktop = false
    const histories = [createHistory(1, '删除成功'), createHistory(2, '保留甲'), createHistory(3, '保留乙')]
    let historyCalls = 0
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'system/setting/public/Storages') return Promise.resolve(storageResponse())
      historyCalls += 1
      return Promise.resolve(historyResponse(historyCalls === 1 ? histories : histories.slice(1)))
    })
    mocks.apiDelete
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ message: 'occupied', success: false })
      .mockRejectedValueOnce(new Error('delete unavailable'))

    await renderHistory()
    await fireEvent.click(screen.getByRole('button', { name: '加载下一页' }))
    expect(await screen.findByText('删除成功')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '批量选择' }))
    await fireEvent.click(screen.getByRole('button', { name: '全部选中' }))
    await nextTick()
    await fireEvent.click(screen.getByRole('button', { name: '批量删除' }))
    await getDialogCall().events.delete(false, false)

    expect(screen.getByRole('button', { name: '退出批量选择' })).toBeInTheDocument()
    expect(screen.getByText('已选择 0/0 项')).toBeInTheDocument()
    expect(mocks.toastError).toHaveBeenCalledWith('删除失败：2/3')

    await fireEvent.click(screen.getByRole('button', { name: '加载下一页' }))
    expect(await screen.findByText('保留甲')).toBeInTheDocument()
    expect(screen.getByText('已选择 2/2 项')).toBeInTheDocument()
  })

  it('opens the transfer queue as an isolated shared-dialog boundary', async () => {
    await renderHistory()
    const queueBtn = await screen.findByRole('button', { name: '整理队列' })
    await fireEvent.click(queueBtn)

    const dialog = getDialogCall()
    expect(dialog.component.__name || dialog.component.name).toContain('TransferQueueDialog')
    expect(dialog.options).toEqual({ closeOn: ['close'] })
  })

  it('opens the reorganize boundary with selected ids and refreshes after done', async () => {
    const histories = [createHistory(10, '重整甲'), createHistory(11, '重整乙')]
    let historyCalls = 0
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'system/setting/public/Storages') return Promise.resolve(storageResponse())
      historyCalls += 1
      return Promise.resolve(historyResponse(histories))
    })

    await renderHistory()
    expect(await screen.findByText('重整甲')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '选择当前页' }))
    await nextTick()
    await fireEvent.click(screen.getByRole('button', { name: '批量重新整理' }))

    const dialog = getDialogCall()
    expect(dialog.props).toMatchObject({ logids: [10, 11] })
    expect(dialog.options).toEqual({ closeOn: ['close', 'done'] })
    await dialog.events.done()
    expect(historyCalls).toBeGreaterThan(1)
    expect(screen.queryByRole('button', { name: '批量重新整理' })).not.toBeInTheDocument()
  })

  it('renders a clear-all button that stays disabled while the list is empty', async () => {
    await renderHistory()

    const clearButton = await screen.findByRole('button', { name: '清空记录' })
    expect(clearButton).toBeDisabled()

    await fireEvent.click(clearButton)
    expect(mocks.createConfirm).not.toHaveBeenCalled()
    expect(mocks.apiDelete).not.toHaveBeenCalled()
  })

  it('clears every record after confirmation, toasts the deleted count, and reloads the list', async () => {
    const histories = [createHistory(1, '记录甲'), createHistory(2, '记录乙')]
    let historyCalls = 0
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'system/setting/public/Storages') return Promise.resolve(storageResponse())
      historyCalls += 1
      return Promise.resolve(historyCalls === 1 ? historyResponse(histories) : historyResponse([]))
    })
    mocks.apiDelete.mockResolvedValue({ data: { deleted: 2 }, success: true })

    await renderHistory()
    expect(await screen.findByText('记录甲')).toBeInTheDocument()
    const clearButton = screen.getByRole('button', { name: '清空记录' })
    expect(clearButton).toBeEnabled()

    await fireEvent.click(clearButton)

    expect(mocks.createConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmText: '清空记录',
        content: expect.stringMatching(/与当前搜索\/筛选无关.*不影响已整理的文件.*不可撤销/),
        title: '清空整理记录',
        type: 'error',
      }),
    )

    await waitFor(() => expect(mocks.apiDelete).toHaveBeenCalledWith('history/empty/transfer'))
    await waitFor(() => expect(historyCalls).toBe(2))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('已清空 2 条整理记录')
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('does not call the clear API when the confirmation is cancelled', async () => {
    mocks.createConfirm.mockResolvedValue(false)
    let historyCalls = 0
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'system/setting/public/Storages') return Promise.resolve(storageResponse())
      historyCalls += 1
      return Promise.resolve(historyResponse([createHistory(1, '保留记录')]))
    })

    await renderHistory()
    expect(await screen.findByText('保留记录')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '清空记录' }))
    await flushPromises()

    expect(mocks.apiDelete).not.toHaveBeenCalled()
    expect(historyCalls).toBe(1)
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it('shows a failure toast without refreshing when the clear request fails', async () => {
    let historyCalls = 0
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'system/setting/public/Storages') return Promise.resolve(storageResponse())
      historyCalls += 1
      return Promise.resolve(historyResponse([createHistory(1, '失败现场')]))
    })
    mocks.apiDelete.mockRejectedValue(new Error('boom'))

    await renderHistory()
    expect(await screen.findByText('失败现场')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '清空记录' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('清空失败：boom'))
    expect(historyCalls).toBe(1)
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it('renders mobile header queue, clear-all, and batch-mode inline toolbar actions', async () => {
    mocks.desktop = false

    await renderHistory()
    await fireEvent.click(screen.getByRole('button', { name: '加载下一页' }))

    expect(await screen.findByRole('button', { name: '整理队列' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '清空记录' })).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: '批量选择' }))
    expect(screen.getByRole('button', { name: '全部选中' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '批量重新整理' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '批量删除' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '退出批量操作' })).toBeInTheDocument()
  })

  it('renders movie titles in grouped desktop mode instead of leaving the primary label blank', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync('src/views/reorganize/TransferHistoryView.vue', 'utf8')
    expect(source).not.toContain('@next="currentPage + 1"')
    expect(source).not.toContain('@prev="currentPage - 1"')

    renderTitleSlot = true
    const histories = [
      createHistory(1, '星际穿越', { category: '科幻片', type: '电影', year: '2014' }),
      createHistory(2, '三体', { category: '科幻剧', episodes: 'E01', seasons: 'S01', type: '电视剧' }),
    ]
    mocks.apiGet.mockImplementation((path: string) =>
      Promise.resolve(path === 'system/setting/public/Storages' ? storageResponse() : historyResponse(histories)),
    )

    const { container } = await renderHistory('/history?grouped=true')
    expect(await screen.findByText('星际穿越')).toBeInTheDocument()

    const moviePrimary = container.querySelector('[data-history-id="1"] .text-high-emphasis')
    const tvPrimary = container.querySelector('[data-history-id="2"] .text-high-emphasis')
    expect(moviePrimary?.textContent?.trim()).toBe('星际穿越')
    expect(tvPrimary?.textContent?.trim()).toBe('S01E01')
  })

  it('renders structured two-line desktop paths with full filenames and directory split without raw arrow strings', async () => {
    renderSrcSlot = true
    const longSrc =
      '/Users/nest/Downloads/MoviePilot/Raw/电视剧/日番/[Nekomoe kissaten&LoliHouse] 20 Seiki Denki Mokuroku - 12 [WebRip 1080p HEVC-10bit AAC].mkv'
    const longDest =
      '/Users/nest/Downloads/MoviePilot/Link/电视剧/日番/二十世纪电气目录 (2026) {tmdbid=153217}/Season 01/二十世纪电气目录 S01E12 1080p.WebRip.HEVC.AAC-Nekomoe.mkv'
    const histories = [createHistory(1, '路径结构测试', { src: longSrc, dest: longDest })]
    mocks.apiGet.mockImplementation((path: string) =>
      Promise.resolve(path === 'system/setting/public/Storages' ? storageResponse() : historyResponse(histories)),
    )

    const { container } = await renderHistory()
    expect(await screen.findByText('路径结构测试')).toBeInTheDocument()
    expect(container.querySelector('.transfer-history-toolbar')).not.toBeNull()
    expect(container.querySelector('.history-paths')).not.toBeNull()
    expect(container.textContent).not.toContain('=>')
    expect(container.querySelector('.history-paths__src .history-paths__file')?.textContent).toBe(
      '[Nekomoe kissaten&LoliHouse] 20 Seiki Denki Mokuroku - 12 [WebRip 1080p HEVC-10bit AAC].mkv',
    )
    expect(container.querySelector('.history-paths__dest .history-paths__file--dest')?.textContent).toBe(
      '二十世纪电气目录 S01E12 1080p.WebRip.HEVC.AAC-Nekomoe.mkv',
    )
  })

  it('resets the desktop table scroll position when page or search changes, but preserves it on failure', async () => {
    const secondPage = createDeferred<ReturnType<typeof historyResponse>>()
    const failedPage = createDeferred<ReturnType<typeof historyResponse>>()
    let historyCalls = 0
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'system/setting/public/Storages') return Promise.resolve(storageResponse())
      historyCalls += 1
      if (historyCalls === 1) return Promise.resolve(historyResponse([createHistory(1, '第一页记录')], 100))
      if (historyCalls === 2) return secondPage.promise
      if (historyCalls === 3) return Promise.resolve(historyResponse([createHistory(3, '新搜索记录')], 10))
      return failedPage.promise
    })

    const { container, router } = await renderHistory('/history?currentPage=1')
    await screen.findByText('第一页记录')
    const viewport = container.querySelector<HTMLElement>('.v-table__wrapper')!
    viewport.scrollTop = 420

    await router.push('/history?currentPage=2')
    await waitFor(() => expect(historyCalls).toBe(2))
    expect(viewport.scrollTop).toBe(420)

    secondPage.resolve(historyResponse([createHistory(2, '第二页记录')], 100))
    await screen.findByText('第二页记录')
    await waitFor(() => expect(viewport.scrollTop).toBe(0))

    viewport.scrollTop = 360
    await router.push('/history?currentPage=1&search=%E6%96%B0%E8%AF%8D')
    await screen.findByText('新搜索记录')
    await waitFor(() => expect(viewport.scrollTop).toBe(0))

    viewport.scrollTop = 280
    await router.push('/history?currentPage=2&search=%E6%96%B0%E8%AF%8D')
    await waitFor(() => expect(historyCalls).toBe(4))
    failedPage.reject(new Error('network error'))
    await flushPromises()
    expect(viewport.scrollTop).toBe(280)
  })

  it('parses timezone-aware ISO dates, preserves invalid dates, and refreshes relative labels across minutes on mobile', async () => {
    mocks.desktop = false
    vi.useFakeTimers()
    // 固定本地时间为 2026-11-12 23:59:30
    vi.setSystemTime(new Date(2026, 10, 12, 23, 59, 30))

    // 构造本地 2026-11-12 00:15:00 对应的 UTC ISO 字符串（在正偏移时区下其 UTC 日期为前一天 11-11）
    const localEarlyMorningIso = new Date(2026, 10, 12, 0, 15, 0).toISOString()
    const histories = [
      createHistory(1, '时区跨日记录', { date: localEarlyMorningIso }),
      createHistory(2, '跨午夜记录', { date: '2026-11-12 23:58:00' }),
      createHistory(3, '非法小时记录', { date: '2026-11-12 25:00:00' }),
      createHistory(4, '越界日历记录', { date: '2026-02-31 10:00:00' }),
      createHistory(5, '非日期文本记录', { date: 'not-a-date' }),
    ]
    mocks.apiGet.mockImplementation((path: string) =>
      Promise.resolve(path === 'system/setting/public/Storages' ? storageResponse() : historyResponse(histories)),
    )

    const { container } = await renderHistory()
    await fireEvent.click(screen.getByRole('button', { name: '加载下一页' }))
    await screen.findByText('非日期文本记录')

    expect(screen.getByText('今天 00:15')).toBeInTheDocument()
    expect(screen.getByText('今天 23:58')).toBeInTheDocument()
    expect(screen.getByText('2026-11-12 25:00:00')).toBeInTheDocument()
    expect(screen.getByText('2026-02-31 10:00:00')).toBeInTheDocument()
    expect(screen.getByText('not-a-date')).toBeInTheDocument()
    expect(container).not.toHaveTextContent(/Invalid Date/)

    // 推进 60 秒跨过本地午夜（进入 2026-11-13 00:00:30），相对日期应自动刷新为“昨天”
    await vi.advanceTimersByTimeAsync(60_000)
    await nextTick()
    expect(screen.getByText('昨天 00:15')).toBeInTheDocument()
    expect(screen.getByText('昨天 23:58')).toBeInTheDocument()
  })

  it('clears desktop selection on pagination or search change, removes single-deleted item from selection, and provides toolbar deselect-all', async () => {
    let page1List = [createHistory(1, '第一页甲'), createHistory(2, '第一页乙')]
    const page2List = [createHistory(3, '第二页丙')]
    mocks.apiGet.mockImplementation((path: string, config?: { params?: { page?: number; title?: string } }) => {
      if (path === 'system/setting/public/Storages') return Promise.resolve(storageResponse())
      if (config?.params?.page === 2 || config?.params?.title === '第二页') {
        return Promise.resolve(historyResponse(page2List, 60))
      }
      return Promise.resolve(historyResponse(page1List, 60))
    })

    const { container, router } = await renderHistory('/history?currentPage=1')
    expect(await screen.findByText('第一页甲')).toBeInTheDocument()

    // 勾选当前页两项，验证工具栏显示已选与一键清空按钮，以及清空记录按钮为 tonal error 样式
    await fireEvent.click(screen.getByRole('button', { name: '选择当前页' }))
    await nextTick()
    expect(screen.getByText('已选 2 项')).toBeInTheDocument()
    const clearAllBtn = container.querySelector('.history-toolbar-clear-btn')
    expect(clearAllBtn?.className).toContain('text-error')
    expect(clearAllBtn?.className).toContain('v-btn--variant-tonal')

    // 单条删除第一页甲成功后，立即从 selected 中剔除该项，仅剩 1 项
    const deleteButtons = screen.getAllByRole('button', { name: '删除' })
    await fireEvent.click(deleteButtons[0])
    page1List = [createHistory(2, '第一页乙')]
    await getDialogCall().events.delete(false, false)
    await flushPromises()
    expect(screen.getByText('已选 1 项')).toBeInTheDocument()

    // 一键清空已选按钮
    await fireEvent.click(screen.getByRole('button', { name: '取消全选' }))
    expect(screen.queryByText(/已选 \d+ 项/)).not.toBeInTheDocument()

    // 再次选中当前页后翻页，跨页勾选必须被自动清空
    await fireEvent.click(screen.getByRole('button', { name: '选择当前页' }))
    expect(screen.getByText('已选 1 项')).toBeInTheDocument()
    await router.push('/history?currentPage=2')
    await screen.findByText('第二页丙')
    expect(screen.queryByText(/已选 \d+ 项/)).not.toBeInTheDocument()
  })

  it('resets redoTargetStorage when launching batch reorganize after a single-item redo', async () => {
    const histories = [
      createHistory(10, '单条重整项', { dest_storage: 'rclone' }),
      createHistory(11, '批量重整项', { dest_storage: 'library' }),
    ]
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'system/setting/public/Storages') return Promise.resolve(storageResponse())
      return Promise.resolve(historyResponse(histories))
    })

    await renderHistory()
    expect(await screen.findByText('单条重整项')).toBeInTheDocument()

    // 先触发单条重新整理，此时 target_storage 为 'rclone'
    await fireEvent.click(screen.getAllByRole('button', { name: '重新整理' })[0])
    expect(getDialogCall(0).props).toMatchObject({ logids: [10], target_storage: 'rclone' })

    // 再选中多条触发批量整理，target_storage 必须显式重置为 undefined
    await fireEvent.click(screen.getByRole('button', { name: '选择当前页' }))
    await nextTick()
    await fireEvent.click(screen.getByRole('button', { name: '批量重新整理' }))
    expect(getDialogCall(1).props).toEqual({ logids: [10, 11], target_storage: undefined })
  })

  it('merges right-side metadata columns into a compact details cell on narrow desktop (< 1440px) with sorting and failure tooltip intact', async () => {
    mocks.width = 1280
    renderTitleSlot = true
    renderDetailSlots = true
    const histories = [
      createHistory(1, '超长动漫标题测试记录', {
        date: '2025-11-19 08:45:12',
        mode: 'link',
        src_fileitem: { size: 1024 * 1024 * 1024 } as TransferHistory['src_fileitem'],
        status: true,
      }),
      createHistory(2, '失败记录项', {
        date: '2025-11-18 22:10:05',
        errmsg: '目标目录无写入权限',
        mode: 'unknown_mode',
        src_fileitem: { size: 2048 * 1024 * 1024 } as TransferHistory['src_fileitem'],
        status: false,
      }),
    ]
    mocks.apiGet.mockImplementation((path: string) =>
      Promise.resolve(path === 'system/setting/public/Storages' ? storageResponse() : historyResponse(histories)),
    )

    const { container } = await renderHistory()
    expect(await screen.findByText('超长动漫标题测试记录')).toBeInTheDocument()

    const table = screen.getByLabelText('整理历史桌面列表')
    expect(table).toHaveAttribute('data-header-keys', 'title,src,size,actions')
    expect(table.className).toContain('transfer-history-table--compact')

    // sortRaw 排序仍对 size 列生效
    const sortResults = JSON.parse(screen.getByRole('status', { name: '整理历史排序结果' }).textContent || '{}')
    expect(sortResults.size).toBeLessThan(0)

    // 成功项渲染紧凑双行详情，时间保留完整 title
    const successRow = container.querySelector('[data-history-id="1"]')!
    expect(successRow.querySelector('.history-compact-meta')).not.toBeNull()
    expect(successRow.querySelector('.history-compact-meta__top')?.textContent).toContain('成功')
    expect(successRow.querySelector('.history-compact-meta__top')?.textContent).toContain('硬链接')
    const dateEl = successRow.querySelector('.history-compact-meta__date')
    expect(dateEl).toHaveAttribute('title', '2025-11-19 08:45:12')
    expect(dateEl?.textContent?.trim()).toBe('11-19 08:45')

    // 失败项渲染失败徽标与 errmsg Tooltip
    const failedRow = container.querySelector('[data-history-id="2"]')!
    expect(failedRow.querySelector('.history-compact-meta__top')?.textContent).toContain('失败')
    expect(failedRow.querySelector('[data-tooltip-text="目标目录无写入权限"]')).not.toBeNull()
  })

  it('uses compact group headers in grouped narrow desktop mode', async () => {
    mocks.width = 1200
    renderTitleSlot = true
    const histories = [
      createHistory(1, '分组窄屏剧集', {
        episodes: 'E01',
        seasons: 'S01',
        type: '电视剧',
      }),
    ]
    mocks.apiGet.mockImplementation((path: string) =>
      Promise.resolve(path === 'system/setting/public/Storages' ? storageResponse() : historyResponse(histories)),
    )

    const { container } = await renderHistory('/history?grouped=true')
    expect(await screen.findByText('S01E01')).toBeInTheDocument()

    const table = screen.getByLabelText('整理历史桌面列表')
    expect(table).toHaveAttribute('data-header-keys', 'title,src,size,actions')
    expect(table.getAttribute('data-header-titles')).toBe('季集/类别,路径,状态 / 大小,')
    expect(container.querySelector('.history-title-cell--grouped')).not.toBeNull()
  })

  it('uses compact 4-column desktop layout by default even on wide screens (>= 1440px)', async () => {
    mocks.width = 1600
    renderDetailSlots = true
    const histories = [
      createHistory(1, '宽屏成功项', {
        date: '2025-11-19 08:45:12',
        mode: 'link',
        src_fileitem: { size: 512 * 1024 * 1024 } as TransferHistory['src_fileitem'],
        status: true,
      }),
      createHistory(2, '宽屏失败项', {
        date: '2025-11-18 22:10:05',
        errmsg: '磁盘空间不足',
        mode: 'copy',
        src_fileitem: { size: 1024 * 1024 * 1024 } as TransferHistory['src_fileitem'],
        status: false,
      }),
    ]
    mocks.apiGet.mockImplementation((path: string) =>
      Promise.resolve(path === 'system/setting/public/Storages' ? storageResponse() : historyResponse(histories)),
    )

    const { container } = await renderHistory()
    expect(await screen.findByText('宽屏成功项')).toBeInTheDocument()

    const table = screen.getByLabelText('整理历史桌面列表')
    expect(table).toHaveAttribute('data-header-keys', 'title,src,size,actions')
    expect(table.className).toContain('transfer-history-table--compact')
    expect(container.querySelector('.history-compact-meta')).not.toBeNull()
    expect(container.querySelector('[data-history-id="1"] .history-compact-meta__date')).toHaveAttribute(
      'title',
      '2025-11-19 08:45:12',
    )
    expect(container.querySelector('[data-history-id="2"] [data-tooltip-text="磁盘空间不足"]')).not.toBeNull()
  })

  describe('calendar date displays', () => {
    let histories: TransferHistory[]

    beforeEach(() => {
      histories = []
      renderDetailSlots = true
      mocks.apiGet.mockImplementation((path: string) =>
        Promise.resolve(path === 'system/setting/public/Storages' ? storageResponse() : historyResponse(histories)),
      )
    })

    it('compares local calendar days rather than 24-hour spans around midnight on desktop', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      // 刚过午夜 5 分钟：10 分钟前的记录属于昨天，而非因为不足 24 小时归为今天
      vi.setSystemTime(new Date(2026, 10, 12, 0, 5, 0))
      const cases = [
        ['2026-11-12 00:01:00', '今天 00:01'],
        ['2026-11-11 23:55:00', '昨天 23:55'],
        ['2026-11-11 00:01:00', '昨天 00:01'],
        ['2026-11-10 23:59:00', '11-10 23:59'],
      ] as const
      histories = cases.map(([date], index) => createHistory(index + 1, `自然日边界记录${index}`, { date }))

      const { container } = await renderHistory('/history?grouped=false')
      await screen.findByText('自然日边界记录3')

      for (const [index, [date, expected]] of cases.entries()) {
        const dateEl = container.querySelector(`[data-history-id="${index + 1}"] .history-compact-meta__date`)
        expect(dateEl?.textContent?.trim()).toBe(expected)
        expect(dateEl).toHaveAttribute('title', date)
      }
    })

    it('updates desktop compact dates across midnight without refetching and releases the shared timer on unmount', async () => {
      vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
      vi.setSystemTime(new Date(2026, 10, 12, 23, 59, 30))
      const timerCount = vi.getTimerCount()
      const intervals = vi.spyOn(globalThis, 'setInterval')
      const offset = new Date(2026, 10, 12, 17, 5, 44, 400).toISOString().replace('Z', '+00:00')
      const cases = [
        ['2026-11-12 00:05:00', '今天 00:05', '昨天 00:05'],
        ['2026-11-11 23:55:00', '昨天 23:55', '11-11 23:55'],
        ['2026-11-11 00:05:00', '昨天 00:05', '11-11 00:05'],
        ['2026-11-10 21:05:39', '11-10 21:05', '11-10 21:05'],
        ['2026-11-13 00:01:00', '11-13 00:01', '今天 00:01'],
        [offset, '今天 17:05', '昨天 17:05'],
      ] as const
      histories = cases.map(([date], index) => createHistory(index + 1, `桌面跨日记录${index}`, { date }))

      const { container, unmount } = await renderHistory('/history?grouped=false')
      await screen.findByText('桌面跨日记录5')

      const dateTexts = () =>
        cases.map((_, index) =>
          container.querySelector(`[data-history-id="${index + 1}"] .history-compact-meta__date`)?.textContent?.trim(),
        )
      expect(dateTexts()).toEqual(cases.map(([, before]) => before))
      for (const [index, [date]] of cases.entries()) {
        expect(container.querySelector(`[data-history-id="${index + 1}"] .history-compact-meta__date`)).toHaveAttribute(
          'title',
          date,
        )
      }
      const requests = mocks.apiGet.mock.calls.length
      expect(intervals.mock.calls.filter(([, delay]) => delay === 60000)).toHaveLength(1)

      await vi.advanceTimersByTimeAsync(60000)

      expect(dateTexts()).toEqual(cases.map(([, , after]) => after))
      expect(mocks.apiGet).toHaveBeenCalledTimes(requests)
      unmount()
      expect(vi.getTimerCount()).toBe(timerCount)
    })

    it.each([true, false])(
      'preserves empty and unparseable dates on desktop=%s without invalid labels',
      async desktop => {
        mocks.desktop = desktop
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date(2026, 10, 12, 21, 4))
        const dates = ['not a date', '2026-11-12 25:00:00', '2026-02-31 10:00:00', '', undefined]
        histories = dates.map((date, index) => createHistory(index + 1, `异常时间记录${index}`, { date }))

        const { container } = await renderHistory('/history?grouped=false')
        if (!desktop) await fireEvent.click(screen.getByRole('button', { name: '加载下一页' }))
        await screen.findByText('异常时间记录4')

        expect(screen.getByText('not a date')).toBeInTheDocument()
        expect(screen.getByText('2026-11-12 25:00:00')).toBeInTheDocument()
        expect(screen.getByText('2026-02-31 10:00:00')).toBeInTheDocument()
        expect(container).not.toHaveTextContent(/Invalid Date|今天|昨天/)

        if (desktop) {
          for (const [index, date] of dates.entries()) {
            const dateEl = container.querySelector(`[data-history-id="${index + 1}"] .history-compact-meta__date`)
            if (date) {
              expect(dateEl?.textContent?.trim()).toBe(date)
              expect(dateEl).toHaveAttribute('title', date)
            } else {
              expect(dateEl).toBeNull()
            }
          }
        } else {
          for (const [index, date] of dates.entries()) {
            const record = screen.getByText(`异常时间记录${index}`).closest('.transfer-history-mobile-record')
            const meta = [...(record?.querySelectorAll('.transfer-history-mobile-record__meta > span') || [])].map(
              item => item.textContent?.trim(),
            )
            expect(meta.at(-1)).toBe(date || '·')
          }
        }
      },
    )

    it('formats local and offset mobile dates across midnight without refetching and releases the shared timer', async () => {
      mocks.desktop = false
      vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
      vi.setSystemTime(new Date(2026, 10, 12, 23, 59, 30))
      const timerCount = vi.getTimerCount()
      const intervals = vi.spyOn(globalThis, 'setInterval')
      const offset = new Date(2026, 10, 12, 17, 5, 44, 400).toISOString().replace('Z', '+00:00')
      const cases = [
        ['2026-11-12 19:10:00', '今天 19:10', '昨天 19:10'],
        ['2026-11-11T19:10:00', '昨天 19:10', '11-11 19:10'],
        ['2026-11-10 21:05:39', '11-10 21:05', '11-10 21:05'],
        [offset, '今天 17:05', '昨天 17:05'],
      ] as const
      histories = cases.map(([date], index) => createHistory(index + 1, `移动时间记录${index}`, { date }))

      const { unmount } = await renderHistory('/history?grouped=false')
      await fireEvent.click(screen.getByRole('button', { name: '加载下一页' }))
      await screen.findByText('移动时间记录3')

      const dateTexts = () =>
        cases.map((_, index) =>
          screen
            .getByText(`移动时间记录${index}`)
            .closest('.transfer-history-mobile-record')
            ?.querySelector('.transfer-history-mobile-record__meta > span:last-child')
            ?.textContent?.trim(),
        )
      expect(dateTexts()).toEqual(cases.map(([, before]) => before))
      const requests = mocks.apiGet.mock.calls.length
      expect(intervals.mock.calls.filter(([, delay]) => delay === 60000)).toHaveLength(1)

      await vi.advanceTimersByTimeAsync(60000)

      expect(dateTexts()).toEqual(cases.map(([, , after]) => after))
      expect(mocks.apiGet).toHaveBeenCalledTimes(requests)
      unmount()
      expect(vi.getTimerCount()).toBe(timerCount)
    })
  })
})
