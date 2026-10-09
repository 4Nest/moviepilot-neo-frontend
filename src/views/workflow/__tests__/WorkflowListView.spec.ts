import WorkflowListView from '@/views/workflow/WorkflowListView.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { flushPromises } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ apiGet: vi.fn(), openSharedDialog: vi.fn() }))
vi.mock('@/api', () => ({ default: { get: (...args: unknown[]) => mocks.apiGet(...args) } }))
vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
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

async function renderList() {
  return renderWithProviders(host, {
    global: { stubs: { ProgressiveCardGrid: grid, WorkflowTaskCard: card, LoadingBanner: true, NoDataFound: true } },
  })
}

describe('WorkflowListView incremental updates', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.openSharedDialog.mockReset()
    mocks.apiGet.mockImplementation((url: string) =>
      Promise.resolve(url === 'workflow/event_types' ? [] : [{ id: 1, name: '工作流 A' }]),
    )
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
})
