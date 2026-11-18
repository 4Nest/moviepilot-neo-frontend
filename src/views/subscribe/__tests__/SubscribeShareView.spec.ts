import type { SubscribeShare } from '@/api/types'
import SubscribeShareView from '@/views/subscribe/SubscribeShareView.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createSubscribeShare, createSubscribeShareStatistics } from '@tests/support/factories/subscribe'
import {
  subscribeApiUrls,
  subscribeSharesHandler,
  subscribeShareStatisticsHandler,
} from '@tests/support/msw/handlers/subscribe'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { flushPromises } from '@vue/test-utils'
import { HttpResponse, http } from 'msw'
import { defineComponent, h, onMounted, ref, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type InfiniteScrollStatus = 'empty' | 'error' | 'ok'
const initialLoadMargins: number[] = []

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
  props: {
    margin: {
      type: Number,
      required: true,
    },
  },
  emits: ['load'],
  setup(props, { emit, slots }) {
    const status = ref<'empty' | 'error' | 'idle' | 'loading'>('idle')

    function load() {
      initialLoadMargins.push(props.margin)
      status.value = 'loading'
      emit('load', {
        done(nextStatus: InfiniteScrollStatus) {
          status.value = nextStatus === 'ok' ? 'idle' : nextStatus
        },
      })
    }

    onMounted(load)

    return () =>
      h('section', { 'aria-label': '订阅分享无限列表', 'data-margin': String(props.margin) }, [
        h('output', { 'aria-label': '订阅分享无限列表状态' }, status.value),
        status.value === 'loading' ? slots.loading?.({}) : null,
        status.value === 'error'
          ? slots.error?.({
              side: 'end',
              props: { color: undefined, onClick: load },
            })
          : null,
        status.value === 'empty' ? slots.empty?.({}) : null,
        slots.default?.(),
        h(
          'button',
          {
            'aria-label': '触发订阅分享加载',
            onClick: load,
            type: 'button',
          },
          '触发订阅分享加载',
        ),
      ])
  },
})

const ProgressiveCardGridStub = defineComponent({
  name: 'ProgressiveCardGrid',
  props: {
    getItemKey: {
      type: Function as PropType<(item: SubscribeShare, index: number) => string | number>,
      required: true,
    },
    items: {
      type: Array as PropType<SubscribeShare[]>,
      required: true,
    },
    minItemWidth: Number,
    estimatedItemHeight: Number,
  },
  setup(props, { slots }) {
    return () =>
      h(
        'section',
        {
          'aria-label': '订阅分享渐进网格',
          'data-min-width': String(props.minItemWidth ?? ''),
          'data-est-height': String(props.estimatedItemHeight ?? ''),
        },
        [
          h(
            'output',
            { 'aria-label': '订阅分享渐进网格键' },
            props.items.map((item, index) => String(props.getItemKey(item, index))).join('|'),
          ),
          ...props.items.flatMap(item => slots.default?.({ item }) ?? []),
        ],
      )
  },
})

const SubscribeShareCardStub = defineComponent({
  name: 'SubscribeShareCard',
  props: {
    media: {
      type: Object as PropType<SubscribeShare>,
      required: true,
    },
    batchMode: { type: Boolean, default: false },
    deletable: { type: Boolean, default: true },
    selected: { type: Boolean, default: false },
  },
  emits: ['delete', 'toggle-select'],
  setup(props, { emit }) {
    return () =>
      h('article', { 'data-deletable': String(props.deletable) }, [
        h('span', props.media.share_title),
        h(
          'button',
          {
            'aria-label': `删除分享 ${props.media.id}`,
            onClick: () => emit('delete'),
            type: 'button',
          },
          '删除',
        ),
        props.batchMode
          ? h(
              'button',
              {
                'aria-label': `选择分享 ${props.media.id}`,
                'data-selected': String(props.selected),
                disabled: !props.deletable,
                onClick: () => emit('toggle-select'),
                type: 'button',
              },
              '选择',
            )
          : null,
      ])
  },
})

const LoadingBannerStub = defineComponent({
  name: 'LoadingBanner',
  template: '<div role="status">正在加载订阅分享</div>',
})

const NoDataFoundStub = defineComponent({
  name: 'NoDataFound',
  props: {
    errorDescription: String,
    errorTitle: String,
  },
  template: '<section aria-label="订阅分享空态">{{ errorTitle }} {{ errorDescription }}</section>',
})

const PageContentTitleStub = defineComponent({
  name: 'VPageContentTitle',
  props: { title: String },
  template: '<h2>{{ title }}</h2>',
})

const DialogCloseBtnStub = defineComponent({
  name: 'VDialogCloseBtn',
  emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\')">关闭达人榜</button>',
})

interface Deferred {
  promise: Promise<void>
  resolve: () => void
}

function createDeferred(): Deferred {
  let resolve!: () => void
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}

function setHasScroll(hasScroll: boolean) {
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600)
  return vi.spyOn(document.body, 'scrollHeight', 'get').mockReturnValue(hasScroll ? 900 : 500)
}

interface RenderShareOptions {
  canManage?: boolean
  keyword?: string
  superUser?: boolean
  userUniqueId?: string
}

async function renderShare(keywordOrOptions: string | RenderShareOptions = '') {
  const opts = typeof keywordOrOptions === 'string' ? { keyword: keywordOrOptions } : keywordOrOptions
  return renderWithProviders(SubscribeShareView, {
    initialState: {
      globalSettings: {
        data: {
          SUBSCRIBE_SHARE_MANAGE: opts.canManage ?? false,
          USER_UNIQUE_ID: opts.userUniqueId ?? 'local-user-uid',
        },
        initialized: true,
        loading: false,
      },
      user: {
        superUser: opts.superUser ?? true,
      },
    },
    props: { keyword: opts.keyword ?? '' },
    global: {
      components: {
        VDialogCloseBtn: DialogCloseBtnStub,
      },
      stubs: {
        LoadingBanner: LoadingBannerStub,
        NoDataFound: NoDataFoundStub,
        ProgressiveCardGrid: ProgressiveCardGridStub,
        SubscribeShareCard: SubscribeShareCardStub,
        VInfiniteScroll: InfiniteScrollStub,
        VPageContentTitle: PageContentTitleStub,
      },
    },
  })
}

describe('SubscribeShareView', () => {
  beforeEach(() => {
    initialLoadMargins.length = 0
    mocks.confirm.mockReset().mockResolvedValue(true)
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    setHasScroll(true)
  })

  it('loads the default list with 300x168 grid dimensions and stable share IDs', async () => {
    const share = createSubscribeShare({ id: 3101, share_title: '默认分享卡片' })
    const requests: URL[] = []
    server.use(
      subscribeSharesHandler([share], 200, url => {
        requests.push(url)
      }),
    )

    await renderShare()

    expect(await screen.findByText('默认分享卡片')).toBeInTheDocument()
    const grid = screen.getByLabelText('订阅分享渐进网格')
    expect(grid).toHaveAttribute('data-min-width', '300')
    expect(grid).toHaveAttribute('data-est-height', '168')
    expect(screen.getByLabelText('订阅分享无限列表')).toHaveAttribute('data-margin', '480')
    expect(initialLoadMargins[0]).toBe(0)
    expect(requests).toHaveLength(1)
    expect(requests[0].searchParams.get('page')).toBe('1')
    expect(requests[0].searchParams.get('count')).toBe('30')
    expect(requests[0].searchParams.get('name') ?? '').toBe('')
    expect(requests[0].searchParams.get('sort_type')).toBeNull()
    expect(screen.getByRole('status', { name: '订阅分享渐进网格键' })).toHaveTextContent('3101')
  })

  it('deduplicates overlapping IDs across pages after local deletion shifts backend pagination', async () => {
    const first = createSubscribeShare({ id: 3201, share_title: '第一页甲' })
    const second = createSubscribeShare({ id: 3202, share_title: '第一页乙' })
    const third = createSubscribeShare({ id: 3203, share_title: '第二页丙' })
    server.use(
      http.get(subscribeApiUrls.shares, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? ''
        // 模拟第二页包含已存在于第一页的重复 ID 3202
        if (page === '1') return HttpResponse.json([first, second])
        if (page === '2') return HttpResponse.json([second, third])
        return HttpResponse.json([])
      }),
    )
    const user = userEvent.setup()

    await renderShare()
    expect(await screen.findByText('第一页甲')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '触发订阅分享加载' }))
    expect(await screen.findByText('第二页丙')).toBeInTheDocument()
    expect(screen.getAllByText('第一页乙')).toHaveLength(1)
    expect(screen.getByRole('status', { name: '订阅分享渐进网格键' })).toHaveTextContent('3201|3202|3203')
  })

  it('switches sort pills, inline search, scope filter, and share leaderboard user filter', async () => {
    const requests: URL[] = []
    const mineShare = createSubscribeShare({
      id: 3301,
      share_title: '本人发布的分享',
      share_uid: 'my-uid',
      share_user: '4Nest',
    })
    const otherShare = createSubscribeShare({
      id: 3302,
      share_title: '他人发布的分享',
      share_uid: 'other-uid',
      share_user: 'Alice',
    })
    server.use(
      subscribeSharesHandler([mineShare, otherShare], 200, url => {
        requests.push(url)
      }),
      subscribeShareStatisticsHandler([
        createSubscribeShareStatistics({ share_count: 12, share_user: '字幕达人', total_reuse_count: 360 }),
      ]),
    )
    const user = userEvent.setup()

    await renderShare({ userUniqueId: 'my-uid' })
    expect(await screen.findByText('本人发布的分享')).toBeInTheDocument()
    expect(screen.getByText('他人发布的分享')).toBeInTheDocument()

    // 切换归属范围到「我的分享」
    await user.click(screen.getByText('我的分享'))
    expect(screen.getByText('本人发布的分享')).toBeInTheDocument()
    expect(screen.queryByText('他人发布的分享')).not.toBeInTheDocument()

    // 切回「全部」并点击「最热」排序胶囊
    await user.click(screen.getByText('全部'))
    await user.click(screen.getByText('最热'))
    await waitFor(() => expect(requests.at(-1)?.searchParams.get('sort_type')).toBe('count'))

    // 打开分享达人榜并点击某位达人一键筛选
    await user.click(screen.getByRole('button', { name: '分享达人榜' }))
    expect(await screen.findByText('字幕达人')).toBeInTheDocument()
    await user.click(screen.getByText('字幕达人'))
    await waitFor(() => expect(requests.at(-1)?.searchParams.get('name')).toBe('字幕达人'))
  })

  it('loads consecutive pages until an underfilled viewport becomes scrollable', async () => {
    const first = createSubscribeShare({ id: 3401, share_title: '未满屏分享第一页' })
    const second = createSubscribeShare({ id: 3402, share_title: '未满屏分享第二页' })
    const requestedPages: string[] = []
    const scrollHeight = vi
      .spyOn(document.body, 'scrollHeight', 'get')
      .mockImplementation(() => (requestedPages.length >= 2 ? 900 : 500))
    server.use(
      http.get(subscribeApiUrls.shares, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? ''
        requestedPages.push(page)
        return HttpResponse.json(page === '1' ? [first] : [second])
      }),
    )

    await renderShare()

    expect(await screen.findByText('未满屏分享第一页')).toBeInTheDocument()
    expect(await screen.findByText('未满屏分享第二页')).toBeInTheDocument()
    expect(requestedPages).toEqual(['1', '2'])
    scrollHeight.mockRestore()
  })

  it('reloads page one when props.keyword changes and ignores obsolete pending responses', async () => {
    const gate = createDeferred()
    const requests: URL[] = []
    const staleResponse = vi.fn()
    server.use(
      http.get(subscribeApiUrls.shares, async ({ request }) => {
        const url = new URL(request.url)
        requests.push(url)
        if (url.searchParams.get('name') === '旧关键字') {
          await gate.promise
          staleResponse()
          return HttpResponse.json([createSubscribeShare({ share_title: '过期关键字分享' })])
        }
        return HttpResponse.json([createSubscribeShare({ share_title: '新关键字实时分享' })])
      }),
    )

    const view = await renderShare('旧关键字')
    await waitFor(() => expect(requests).toHaveLength(1))

    await view.rerender({ keyword: '新关键字' })
    expect(await screen.findByText('新关键字实时分享')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '搜索：新关键字' })).toBeInTheDocument()

    gate.resolve()
    await waitFor(() => expect(staleResponse).toHaveBeenCalledOnce())
    await flushPromises()

    expect(screen.getByText('新关键字实时分享')).toBeInTheDocument()
    expect(screen.queryByText('过期关键字分享')).not.toBeInTheDocument()
  })

  it('recovers from an initial HTTP failure by retrying page one', async () => {
    const requestedPages: string[] = []
    server.use(
      http.get(subscribeApiUrls.shares, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? ''
        requestedPages.push(page)
        if (requestedPages.length === 1) return HttpResponse.json({ detail: 'failed' }, { status: 500 })
        return HttpResponse.json([createSubscribeShare({ share_title: '分享首载重试成功' })])
      }),
    )
    const user = userEvent.setup()

    await renderShare()
    const retry = await screen.findByRole('button', { name: '重试' })
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await user.click(retry)

    expect(await screen.findByText('分享首载重试成功')).toBeInTheDocument()
    expect(requestedPages).toEqual(['1', '1'])
  })

  it('gates batch management button by superuser and ownership/manage permission', async () => {
    const otherShare = createSubscribeShare({ id: 4001, share_title: '他人分享', share_uid: 'other-uid' })
    server.use(subscribeSharesHandler([otherShare]))

    // 超管但既非中心端管理员又无本人分享：隐藏批量管理按钮
    const { unmount } = await renderShare({ canManage: false, superUser: true, userUniqueId: 'my-uid' })
    expect(await screen.findByText('他人分享')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '批量管理' })).not.toBeInTheDocument()
    unmount()

    // 非超管即使拥有 SUBSCRIBE_SHARE_MANAGE 也隐藏批量管理按钮
    const nonSuper = await renderShare({ canManage: true, superUser: false, userUniqueId: 'other-uid' })
    expect(await screen.findByText('他人分享')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '批量管理' })).not.toBeInTheDocument()
    nonSuper.unmount()
  })

  it('selects only deletable shares for ordinary superuser and sends each item share_uid on batch delete', async () => {
    const ownShare = createSubscribeShare({ id: 4101, share_title: '我的分享甲', share_uid: 'my-uid' })
    const otherShare = createSubscribeShare({ id: 4102, share_title: '他人分享乙', share_uid: 'other-uid' })
    const deletedRequests: Array<{ id: number; shareUid: string | null }> = []
    server.use(
      subscribeSharesHandler([ownShare, otherShare]),
      http.delete('/api/v1/subscribe/share/:id', ({ params, request }) => {
        deletedRequests.push({
          id: Number(params.id),
          shareUid: new URL(request.url).searchParams.get('share_uid'),
        })
        return HttpResponse.json({ success: true })
      }),
    )
    const user = userEvent.setup()

    await renderShare({ canManage: false, superUser: true, userUniqueId: 'my-uid' })
    expect(await screen.findByText('我的分享甲')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '批量管理' }))
    expect(screen.getByRole('button', { name: '选择分享 4102' })).toBeDisabled()

    // 点击「全选可删项」只选中本人的 4101
    await user.click(screen.getByRole('button', { name: '全选可删项' }))
    expect(screen.getByText('已选 1 项')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '删除选中' }))
    expect(mocks.confirm).toHaveBeenCalledOnce()
    await waitFor(() => expect(deletedRequests).toEqual([{ id: 4101, shareUid: 'my-uid' }]))
    await waitFor(() => expect(screen.queryByText('我的分享甲')).not.toBeInTheDocument())
    expect(screen.getByText('他人分享乙')).toBeInTheDocument()
  })

  it.each([200, 500])(
    'keeps failed shares selected and includes server error message when batch delete fails with HTTP %s',
    async status => {
      const shareA = createSubscribeShare({ id: 4201, share_title: '删除成功项', share_uid: 'uid-a' })
      const shareB = createSubscribeShare({ id: 4202, share_title: '删除失败项', share_uid: 'uid-b' })
      const deletedShareUids: Array<string | null> = []
      server.use(
        subscribeSharesHandler([shareA, shareB]),
        http.delete('/api/v1/subscribe/share/:id', ({ params, request }) => {
          deletedShareUids.push(new URL(request.url).searchParams.get('share_uid'))
          if (Number(params.id) === 4201) return HttpResponse.json({ success: true })
          return HttpResponse.json({ success: false, message: '没有删除权限' }, { status })
        }),
      )
      const user = userEvent.setup()

      await renderShare({ canManage: true, superUser: true, userUniqueId: 'admin-uid' })
      expect(await screen.findByText('删除成功项')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: '批量管理' }))
      await user.click(screen.getByRole('button', { name: '全选可删项' }))
      await fireEvent.click(screen.getByRole('button', { name: '删除选中' }))

      await waitFor(() => expect(screen.queryByText('删除成功项')).not.toBeInTheDocument())
      expect(deletedShareUids).toEqual(['uid-a', 'uid-b'])
      expect(screen.getByText('删除失败项')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '选择分享 4202' })).toHaveAttribute('data-selected', 'true')
      expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('没有删除权限'))
    },
  )
})
