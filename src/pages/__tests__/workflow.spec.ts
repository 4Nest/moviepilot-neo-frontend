import WorkflowPage from '@/pages/workflow.vue'
import type { DynamicButtonMenuItem } from '@/composables/useDynamicButton'
import { screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h, ref, unref, type ComputedRef, type Ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  appMode: false,
  registerHeaderTab: vi.fn(),
  useDynamicButton: vi.fn(),
}))

vi.mock('@/composables/useDynamicHeaderTab', () => ({
  useDynamicHeaderTab: () => ({ registerHeaderTab: mocks.registerHeaderTab }),
}))

vi.mock('@/composables/useDynamicButton', () => ({
  useDynamicButton: (options: unknown) => mocks.useDynamicButton(options),
}))

vi.mock('@/composables/usePWA', async () => {
  const { computed } = await import('vue')
  return {
    usePWA: () => ({ appMode: computed(() => mocks.appMode) }),
  }
})

const WorkflowListViewStub = defineComponent({
  name: 'WorkflowListView',
  setup(_props, { expose }) {
    const lastAction = ref('none')
    expose({
      openAddDialog: () => {
        lastAction.value = 'open-add'
      },
      openTemplateDialog: () => {
        lastAction.value = 'open-template'
      },
      openImportJsonDialog: () => {
        lastAction.value = 'open-import-json'
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

type MaybeRef<T> = T | Ref<T> | ComputedRef<T>

interface DynamicButtonConfig {
  icon: MaybeRef<string>
  menuItems?: MaybeRef<DynamicButtonMenuItem[] | undefined>
  onClick?: () => void
  show?: MaybeRef<boolean>
}

describe('workflow page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.appMode = false
  })

  it('omits redundant header share search button and exposes creation menu items in appMode', async () => {
    mocks.appMode = true
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

    const dynamicButton = mocks.useDynamicButton.mock.calls.at(-1)?.[0] as DynamicButtonConfig
    expect(unref(dynamicButton.show)).toBe(true)
    const menuItems = unref(dynamicButton.menuItems) ?? []
    expect(menuItems.map(item => item.titleKey)).toEqual([
      'workflow.quickActions.createWorkflow',
      'workflow.quickActions.createFromTemplate',
      'workflow.quickActions.importJsonCreate',
    ])

    await waitFor(() => expect(screen.getByLabelText('workflow list last action')).toBeInTheDocument())
    menuItems[0].action()
    await waitFor(() => expect(screen.getByLabelText('workflow list last action')).toHaveTextContent('open-add'))
    menuItems[1].action()
    await waitFor(() => expect(screen.getByLabelText('workflow list last action')).toHaveTextContent('open-template'))
    menuItems[2].action()
    await waitFor(() =>
      expect(screen.getByLabelText('workflow list last action')).toHaveTextContent('open-import-json'),
    )
  })
})
