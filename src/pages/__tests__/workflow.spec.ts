import WorkflowPage from '@/pages/workflow.vue'
import { screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h, ref, type Ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  registerHeaderTab: vi.fn(),
}))

vi.mock('@/composables/useDynamicHeaderTab', () => ({
  useDynamicHeaderTab: () => ({ registerHeaderTab: mocks.registerHeaderTab }),
}))

const WorkflowListViewStub = defineComponent({
  name: 'WorkflowListView',
  setup(_props, { expose }) {
    const lastAction = ref('none')
    expose({
      refresh: () => {
        lastAction.value = 'refresh'
      },
    })
    return () => h('output', { 'aria-label': 'workflow list last action' }, lastAction.value)
  },
})

const WorkflowShareViewStub = defineComponent({
  name: 'WorkflowShareView',
  emits: ['update'],
  setup(_props, { attrs, emit }) {
    return () =>
      h('section', { 'aria-label': 'workflow share stub' }, [
        h('output', { 'aria-label': 'share keyword attr' }, String(attrs.keyword ?? '')),
        h('button', { type: 'button', onClick: () => emit('update') }, 'emit-share-update'),
      ])
  },
})

describe('workflow page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('omits redundant header share search button and refreshes list when share view updates', async () => {
    await renderWithProviders(WorkflowPage, {
      initialRoute: '/workflow?tab=list',
      global: {
        stubs: {
          WorkflowListView: WorkflowListViewStub,
          WorkflowShareView: WorkflowShareViewStub,
        },
      },
    })

    const headerConfig = mocks.registerHeaderTab.mock.calls.at(-1)?.[0] as {
      appendButtons?: Array<{ dataAttr?: string }>
      modelValue: Ref<string>
    }
    expect(headerConfig.appendButtons ?? []).toHaveLength(0)

    await waitFor(() => expect(screen.getByLabelText('workflow list last action')).toBeInTheDocument())
    headerConfig.modelValue.value = 'share'
    const emitBtn = await screen.findByRole('button', { name: 'emit-share-update' })
    emitBtn.click()
    headerConfig.modelValue.value = 'list'
    await waitFor(() => expect(screen.getByLabelText('workflow list last action')).toHaveTextContent('refresh'))
  })
})
