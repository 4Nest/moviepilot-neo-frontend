import WorkflowPage from '@/pages/workflow.vue'
import { screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h, ref, unref, type ComputedRef, type Ref } from 'vue'
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
    const isRefreshing = ref(false)
    expose({
      isRefreshing,
      openAddDialog: () => {
        lastAction.value = 'add'
      },
      openImportJsonDialog: () => {
        lastAction.value = 'import-json'
      },
      openTemplateDialog: () => {
        lastAction.value = 'template'
      },
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

  it('registers list action buttons in HeaderTab only for list tab and refreshes list when share view updates', async () => {
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
      appendButtons?: Array<{
        action?: () => void
        color?: string
        dataAttr?: string
        icon: string
        label?: string
        show?: boolean | ComputedRef<boolean>
        testId?: string
        variant?: string
      }>
      modelValue: Ref<string>
    }
    const buttons = headerConfig.appendButtons ?? []
    expect(buttons.map(btn => btn.testId)).toEqual([
      'workflow-refresh-btn',
      'workflow-import-json-btn',
      'workflow-template-btn',
      'workflow-create-btn',
    ])
    expect(buttons.every(btn => unref(btn.show) === true)).toBe(true)
    expect(buttons.find(btn => btn.testId === 'workflow-create-btn')).toMatchObject({
      color: 'primary',
      variant: 'flat',
    })

    await waitFor(() => expect(screen.getByLabelText('workflow list last action')).toBeInTheDocument())

    buttons.find(btn => btn.testId === 'workflow-import-json-btn')?.action?.()
    await waitFor(() => expect(screen.getByLabelText('workflow list last action')).toHaveTextContent('import-json'))

    buttons.find(btn => btn.testId === 'workflow-template-btn')?.action?.()
    await waitFor(() => expect(screen.getByLabelText('workflow list last action')).toHaveTextContent('template'))

    buttons.find(btn => btn.testId === 'workflow-create-btn')?.action?.()
    await waitFor(() => expect(screen.getByLabelText('workflow list last action')).toHaveTextContent('add'))

    headerConfig.modelValue.value = 'share'
    expect(buttons.every(btn => unref(btn.show) === false)).toBe(true)

    const emitBtn = await screen.findByRole('button', { name: 'emit-share-update' })
    emitBtn.click()
    headerConfig.modelValue.value = 'list'
    await waitFor(() => expect(screen.getByLabelText('workflow list last action')).toHaveTextContent('refresh'))
  })
})
