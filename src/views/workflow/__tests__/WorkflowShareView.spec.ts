import type { WorkflowShare } from '@/api/types'
import WorkflowShareCard from '@/components/cards/WorkflowShareCard.vue'
import WorkflowShareView from '@/views/workflow/WorkflowShareView.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { HttpResponse, http } from 'msw'
import { defineComponent, h, onMounted, ref, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => mocks.confirm,
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

const InfiniteScrollStub = defineComponent({
  name: 'VInfiniteScroll',
  emits: ['load'],
  setup(_props, { emit, slots }) {
    const status = ref<'empty' | 'error' | 'idle' | 'loading'>('idle')
    function load() {
      status.value = 'loading'
      emit('load', {
        done(nextStatus: 'empty' | 'error' | 'ok') {
          status.value = nextStatus === 'ok' ? 'idle' : nextStatus
        },
      })
    }
    onMounted(load)
    return () =>
      h('section', [
        status.value === 'error' ? slots.error?.({ props: { onClick: load } }) : null,
        slots.default?.(),
        h('button', { onClick: load, type: 'button' }, '加载下一页工作流分享'),
      ])
  },
})

const ProgressiveCardGridStub = defineComponent({
  name: 'ProgressiveCardGrid',
  props: {
    items: { type: Array as PropType<WorkflowShare[]>, required: true },
  },
  setup(props, { slots }) {
    return () =>
      h(
        'section',
        props.items.flatMap(item => slots.default?.({ item }) ?? []),
      )
  },
})

function createWorkflowShare(overrides: Partial<WorkflowShare> = {}): WorkflowShare {
  return {
    count: 5,
    date: '2026-08-01 10:00:00',
    id: '101',
    name: '测试工作流',
    share_comment: '自动巡检种子并清理',
    share_title: '自动巡检分享',
    share_uid: 'author-1',
    share_user: '4Nest',
    ...overrides,
  }
}

describe('WorkflowShareView & WorkflowShareCard', () => {
  beforeEach(() => {
    mocks.confirm.mockReset().mockResolvedValue(true)
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600)
    vi.spyOn(document.body, 'scrollHeight', 'get').mockReturnValue(900)
    server.use(http.get('/api/v1/workflow/event_types', () => HttpResponse.json([])))
  })

  it('renders WorkflowShareCard with static icons and mine badge', async () => {
    const { container } = await renderWithProviders(WorkflowShareCard, {
      initialState: {
        globalSettings: {
          data: { USER_UNIQUE_ID: 'author-1' },
          initialized: true,
          loading: false,
        },
      },
      props: {
        workflow: createWorkflowShare({ count: 18, share_uid: 'author-1' }),
      },
    })

    const card = container.querySelector('.workflow-share-card')
    expect(card).toBeInTheDocument()
    expect(screen.getByText('我的')).toBeInTheDocument()
    expect(screen.getByText('18')).toBeInTheDocument()
    // 确认底部作者与热度图标不是误用的交互按钮
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })

  it('recovers from initial load error, sorts by heat, and batch deletes with target share_uid', async () => {
    let attempts = 0
    const requestedParams: Array<Record<string, string>> = []
    const deletedCalls: Array<{ id: string; shareUid: string | null }> = []
    const itemLow = createWorkflowShare({ count: 2, id: '201', share_title: '低热度工作流', share_uid: 'uid-low' })
    const itemHigh = createWorkflowShare({ count: 99, id: '202', share_title: '高热度工作流', share_uid: 'uid-high' })

    server.use(
      http.get('/api/v1/workflow/shares', ({ request }) => {
        attempts += 1
        requestedParams.push(Object.fromEntries(new URL(request.url).searchParams.entries()))
        if (attempts === 1) return HttpResponse.json({ detail: 'error' }, { status: 500 })
        return HttpResponse.json([itemLow, itemHigh])
      }),
      http.delete('/api/v1/workflow/share/:id', ({ params, request }) => {
        deletedCalls.push({
          id: String(params.id),
          shareUid: new URL(request.url).searchParams.get('share_uid'),
        })
        return HttpResponse.json({ success: true })
      }),
    )

    const user = userEvent.setup()
    const { container } = await renderWithProviders(WorkflowShareView, {
      initialState: {
        globalSettings: {
          data: {
            USER_UNIQUE_ID: 'admin-uid',
            WORKFLOW_SHARE_MANAGE: true,
          },
          initialized: true,
          loading: false,
        },
        user: { superUser: true },
      },
      global: {
        stubs: {
          LoadingBanner: { template: '<div role="status">loading</div>' },
          NoDataFound: { template: '<div>empty</div>' },
          ProgressiveCardGrid: ProgressiveCardGridStub,
          VInfiniteScroll: InfiniteScrollStub,
          VPageContentTitle: true,
        },
      },
    })

    // 首次请求失败不会死锁在 LoadingBanner，可点击重试恢复
    const retryBtn = await screen.findByRole('button', { name: '重试' })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await user.click(retryBtn)

    expect(await screen.findByText('低热度工作流')).toBeInTheDocument()
    expect(screen.getByText('高热度工作流')).toBeInTheDocument()

    // 切换为「最热」排序后，重置分页请求并携带 sort_type=count，高热度工作流排在前面
    await user.click(screen.getByText('最热'))
    await waitFor(() => expect(requestedParams.at(-1)).toMatchObject({ page: '1', sort_type: 'count' }))
    const titles = [...container.querySelectorAll('.v-card-title')].map(el => el.textContent?.trim())
    expect(titles).toEqual(['高热度工作流', '低热度工作流'])

    // 进入批量管理，全选并删除，携带各自 share_uid
    await user.click(screen.getByRole('button', { name: '批量管理' }))
    await user.click(screen.getByRole('button', { name: '全选可删项' }))
    await fireEvent.click(screen.getByRole('button', { name: '删除选中' }))

    await waitFor(() =>
      expect(deletedCalls).toEqual([
        { id: '201', shareUid: 'uid-low' },
        { id: '202', shareUid: 'uid-high' },
      ]),
    )
    await waitFor(() => expect(screen.queryByText('高热度工作流')).not.toBeInTheDocument())
    expect(mocks.toastSuccess).toHaveBeenCalledWith('成功取消 2 个工作流分享')
  })
})
