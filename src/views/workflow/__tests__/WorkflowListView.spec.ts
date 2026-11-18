import WorkflowListView from '@/views/workflow/WorkflowListView.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { flushPromises } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  appMode: false,
  openSharedDialog: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('@/api', () => ({ default: { get: (...args: unknown[]) => mocks.apiGet(...args) } }))
vi.mock('@/composables/usePWA', async () => {
  const { computed } = await import('vue')
  return { usePWA: () => ({ appMode: computed(() => mocks.appMode) }) }
})
vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))
vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: vi.fn() }),
}))

const grid = defineComponent({
  props: ['items'],
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        props.items.map((item: unknown) => slots.default?.({ item })),
      )
  },
})
const card = defineComponent({
  props: ['workflow'],
  emits: ['remove', 'refresh'],
  setup(props, { emit }) {
    return () =>
      h('div', [
        h('span', props.workflow.name),
        h('button', { onClick: () => emit('remove', props.workflow.id) }, `删除 ${props.workflow.name}`),
        h('button', { onClick: () => emit('refresh') }, `刷新 ${props.workflow.name}`),
      ])
  },
})
const host = defineComponent({
  components: { WorkflowListView },
  setup() {
    return { view: ref() }
  },
  template: '<button @click="view.openAddDialog()">新增</button><WorkflowListView ref="view" />',
})

const noDataStub = defineComponent({
  name: 'NoDataFound',
  props: ['errorTitle', 'errorDescription'],
  setup(props, { slots }) {
    return () =>
      h('section', { 'data-testid': 'no-data-found' }, [
        h('span', props.errorTitle),
        h('span', props.errorDescription),
        slots.button?.(),
      ])
  },
})

const loadingStub = defineComponent({
  name: 'LoadingBanner',
  setup() {
    return () => h('div', { role: 'status' }, 'loading')
  },
})

async function renderList() {
  return renderWithProviders(host, {
    global: {
      stubs: {
        ProgressiveCardGrid: grid,
        WorkflowTaskCard: card,
        LoadingBanner: loadingStub,
        NoDataFound: noDataStub,
      },
    },
  })
}

describe('WorkflowListView incremental updates and enhancements', () => {
  beforeEach(() => {
    mocks.appMode = false
    mocks.apiGet.mockReset()
    mocks.openSharedDialog.mockReset()
    mocks.toastError.mockReset()
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
    mocks.apiGet.mockImplementation((url: string) =>
      Promise.resolve(url === 'workflow/event_types' ? [] : [{ id: 1, name: '工作流 A' }]),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads summaries and removes deleted cards without reloading the list', async () => {
    await renderList()
    await screen.findByText('工作流 A', { exact: true })
    expect(mocks.apiGet).toHaveBeenCalledWith('workflow/', { params: { summary: true } })
    await fireEvent.click(screen.getByRole('button', { name: '删除 工作流 A' }))
    expect(screen.queryByText('工作流 A', { exact: true })).not.toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenCalledTimes(2)
  })

  it('adds only the newly created workflow using its returned id', async () => {
    await renderList()
    await screen.findByText('工作流 A', { exact: true })
    await fireEvent.click(screen.getByRole('button', { name: '新增' }))
    mocks.apiGet.mockResolvedValueOnce({ id: 2, name: '工作流 B' })
    await mocks.openSharedDialog.mock.calls[0][2].save(2)
    expect(await screen.findByText('工作流 B', { exact: true })).toBeInTheDocument()
    expect(screen.getByText('工作流 A', { exact: true })).toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenLastCalledWith('workflow/2')
    expect(mocks.apiGet.mock.calls.filter(([url]) => url === 'workflow/')).toHaveLength(1)
  })

  it('finishes initial loading when creation completes before the first list request', async () => {
    let resolveList!: (value: unknown) => void
    mocks.apiGet.mockImplementation((url: string) =>
      url === 'workflow/'
        ? new Promise(resolve => {
            resolveList = resolve
          })
        : Promise.resolve([]),
    )
    await renderList()
    await fireEvent.click(screen.getByRole('button', { name: '新增' }))
    const pendingList = resolveList
    mocks.apiGet.mockResolvedValueOnce([
      { id: 1, name: '工作流 A' },
      { id: 2, name: '工作流 B' },
    ])
    await mocks.openSharedDialog.mock.calls[0][2].save(2)
    pendingList([{ id: 1, name: '工作流 A' }])
    await flushPromises()
    expect(screen.getByText('工作流 A', { exact: true })).toBeInTheDocument()
    expect(screen.getByText('工作流 B', { exact: true })).toBeInTheDocument()
    expect(mocks.apiGet.mock.calls.filter(([url]) => url === 'workflow/')).toHaveLength(2)
  })

  it('refreshes summaries when an older backend does not return a created id', async () => {
    await renderList()
    await screen.findByText('工作流 A', { exact: true })
    await fireEvent.click(screen.getByRole('button', { name: '新增' }))
    await mocks.openSharedDialog.mock.calls[0][2].save()
    expect(mocks.apiGet.mock.calls.filter(([url]) => url === 'workflow/')).toHaveLength(2)
  })

  it('ignores an older list response that would restore a deleted card', async () => {
    await renderList()
    await screen.findByText('工作流 A', { exact: true })
    let resolveList!: (value: unknown) => void
    mocks.apiGet.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveList = resolve
        }),
    )
    await fireEvent.click(screen.getByRole('button', { name: '刷新 工作流 A' }))
    await fireEvent.click(screen.getByRole('button', { name: '删除 工作流 A' }))
    resolveList([{ id: 1, name: '工作流 A' }])
    await flushPromises()
    await waitFor(() => expect(screen.queryByText('工作流 A', { exact: true })).not.toBeInTheDocument())
  })

  it('filters workflows by status pills and search keyword and resets cleanly', async () => {
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'workflow/event_types') {
        return Promise.resolve([{ title: '入库完成', value: 'transfer.complete' }])
      }
      return Promise.resolve([
        { id: 1, name: 'RSS 追剧', state: 'R', trigger_type: 'timer', timer: '*/30 * * * *' },
        { id: 2, name: '归档刮削', state: 'F', trigger_type: 'event', event_type: 'transfer.complete' },
        { id: 3, name: '手动清理', state: 'P', trigger_type: 'manual' },
      ])
    })

    await renderList()
    await screen.findByText('RSS 追剧', { exact: true })
    expect(screen.getByText('归档刮削', { exact: true })).toBeInTheDocument()
    expect(screen.getByText('手动清理', { exact: true })).toBeInTheDocument()

    // 点击失败状态药丸
    await fireEvent.click(screen.getByText('失败 (1)'))
    expect(screen.queryByText('RSS 追剧', { exact: true })).not.toBeInTheDocument()
    expect(screen.getByText('归档刮削', { exact: true })).toBeInTheDocument()

    // 切回全部并按事件中文名搜索
    await fireEvent.click(screen.getByText('全部 (3)'))
    const searchInput = screen.getByPlaceholderText('搜索名称、描述、Cron 或事件...')
    await fireEvent.update(searchInput, '入库完成')
    expect(screen.getByText('归档刮削', { exact: true })).toBeInTheDocument()
    expect(screen.queryByText('手动清理', { exact: true })).not.toBeInTheDocument()

    // 搜索不存在关键词后点击重置筛选
    await fireEvent.update(searchInput, '不存在的关键字')
    expect(screen.getByText('未找到匹配的工作流')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '重置筛选' }))
    expect(screen.getByText('RSS 追剧', { exact: true })).toBeInTheDocument()
    expect(screen.getByText('手动清理', { exact: true })).toBeInTheDocument()
  })

  it('polls every 2500ms while any workflow is running and stops once finished', async () => {
    vi.useFakeTimers()
    let callCount = 0
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'workflow/event_types') return Promise.resolve([])
      callCount += 1
      return Promise.resolve([{ id: 1, name: '运行中工作流', state: callCount < 3 ? 'R' : 'S' }])
    })

    const { unmount } = await renderList()
    await flushPromises()
    expect(callCount).toBe(1)

    await vi.advanceTimersByTimeAsync(2500)
    await flushPromises()
    expect(callCount).toBe(2)

    await vi.advanceTimersByTimeAsync(2500)
    await flushPromises()
    expect(callCount).toBe(3)

    // 状态变为 S 后停止轮询
    await vi.advanceTimersByTimeAsync(5000)
    await flushPromises()
    expect(callCount).toBe(3)
    unmount()
  })

  it('shows quick creation actions in empty state and opens template dialog', async () => {
    mocks.apiGet.mockImplementation(() => Promise.resolve([]))
    const closeTemplateFn = vi.fn()
    mocks.openSharedDialog.mockReturnValue({ close: closeTemplateFn, id: 10, updateProps: vi.fn() })

    await renderList()
    await flushPromises()

    expect(await screen.findByRole('button', { name: '新建工作流' })).toBeInTheDocument()
    const tplBtn = screen.getByRole('button', { name: '从模板快速创建' })
    await fireEvent.click(tplBtn)

    expect(mocks.openSharedDialog).toHaveBeenCalledOnce()
    // 模拟在模板对话框选中模板后自动打开携带 initialTemplate 的 WorkflowAddEditDialog
    const preset = { name: '预设模板', trigger_type: 'timer', timer: '0 3 * * *', actions: [{ id: 'a1' }], flows: [] }
    mocks.openSharedDialog.mock.calls[0][2].select(preset)
    expect(closeTemplateFn).toHaveBeenCalledOnce()
    expect(mocks.openSharedDialog).toHaveBeenCalledTimes(2)
    expect(mocks.openSharedDialog.mock.calls[1][1]).toEqual({ initialTemplate: preset })
  })

  it('shows retryable error state when initial load fails and hides duplicate toolbar creation buttons in appMode', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.appMode = true
    let failFirst = true
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'workflow/event_types') return Promise.resolve([])
      if (failFirst) {
        failFirst = false
        return Promise.reject(new Error('network error'))
      }
      return Promise.resolve([{ id: 1, name: '工作流 A' }])
    })

    await renderList()
    await flushPromises()

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    const retryBtn = await screen.findByRole('button', { name: '重试' })
    await fireEvent.click(retryBtn)
    await flushPromises()

    expect(await screen.findByText('工作流 A', { exact: true })).toBeInTheDocument()
    // appMode 下隐藏顶部重复的 3 个新建按钮，保留刷新按钮
    expect(screen.queryByRole('button', { name: '新建工作流' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '从模板创建' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '导入 JSON 新建' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '刷新' })).toBeInTheDocument()
  })
})
