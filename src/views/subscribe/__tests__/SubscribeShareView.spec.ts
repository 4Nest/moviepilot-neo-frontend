import type { SubscribeShare } from '@/api/types'
import SubscribeShareView from '@/views/subscribe/SubscribeShareView.vue'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createSubscribeShare } from '@tests/support/factories/subscribe'
import { subscribeApiUrls, subscribeSharesHandler } from '@tests/support/msw/handlers/subscribe'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { flushPromises } from '@vue/test-utils'
import { HttpResponse, http } from 'msw'
import { defineComponent, h, onMounted, ref, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type InfiniteScrollStatus = 'empty' | 'error' | 'ok'
const initialLoadMargins: number[] = []

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
  },
  setup(props, { slots }) {
    return () =>
      h('section', { 'aria-label': '订阅分享渐进网格' }, [
        h(
          'output',
          { 'aria-label': '订阅分享渐进网格键' },
          props.items.map((item, index) => String(props.getItemKey(item, index))).join('|'),
        ),
        ...props.items.flatMap(item => slots.default?.({ item }) ?? []),
      ])
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
    selected: { type: Boolean, default: false },
  },
  emits: ['delete', 'toggle-select'],
  setup(props, { emit }) {
    return () =>
      h('article', [
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

async function renderShare(keyword = '') {
  return renderWithProviders(SubscribeShareView, {
    props: { keyword },
    global: {
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
    vi.spyOn(console, 'error').mockImplementation(() => {})
    setHasScroll(true)
  })

  it('loads the default list with the exact query and stable share IDs', async () => {
    const share = createSubscribeShare({ id: 3101, share_title: '默认分享卡片' })
    const requests: URL[] = []
    server.use(
      subscribeSharesHandler([share], 200, url => {
        requests.push(url)
      }),
    )

    await renderShare()

    expect(await screen.findByText('默认分享卡片')).toBeInTheDocument()
    expect(screen.getByLabelText('订阅分享无限列表')).toHaveAttribute('data-margin', '480')
    expect(initialLoadMargins[0]).toBe(0)
    expect(requests).toHaveLength(1)
    expect(requests[0].searchParams.get('page')).toBe('1')
    expect(requests[0].searchParams.get('count')).toBe('30')
    expect(requests[0].searchParams.get('name') ?? '').toBe('')
    // 筛选器已移除：不再携带排序/风格/评分参数
    expect(requests[0].searchParams.get('sort_type')).toBeNull()
    expect(requests[0].searchParams.get('genre_id')).toBeNull()
    expect(requests[0].searchParams.get('min_rating')).toBeNull()
    expect(requests[0].searchParams.get('max_rating')).toBeNull()
    expect(screen.getByRole('status', { name: '订阅分享渐进网格键' })).toHaveTextContent('3101')
  })

  it('appends later pages and stops when a page is empty', async () => {
    const first = createSubscribeShare({ share_title: '分享第一页' })
    const second = createSubscribeShare({ share_title: '分享第二页' })
    const requestedPages: string[] = []
    server.use(
      http.get(subscribeApiUrls.shares, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? ''
        requestedPages.push(page)
        if (page === '1') return HttpResponse.json([first])
        if (page === '2') return HttpResponse.json([second])
        return HttpResponse.json([])
      }),
    )
    const user = userEvent.setup()

    await renderShare()
    expect(await screen.findByText('分享第一页')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '触发订阅分享加载' }))
    expect(await screen.findByText('分享第二页')).toBeInTheDocument()
    expect(screen.getByText('分享第一页')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '触发订阅分享加载' }))
    await waitFor(() => expect(requestedPages).toEqual(['1', '2', '3']))
    expect(screen.getByText('分享第一页')).toBeInTheDocument()
    expect(screen.getByText('分享第二页')).toBeInTheDocument()
  })

  it('loads consecutive pages until an underfilled viewport becomes scrollable', async () => {
    const first = createSubscribeShare({ share_title: '未满屏分享第一页' })
    const second = createSubscribeShare({ share_title: '未满屏分享第二页' })
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

  it('shows the keyword-specific no-data state for an empty first page', async () => {
    server.use(subscribeSharesHandler([]))

    await renderShare('不存在的分享')

    expect(await screen.findByRole('heading', { name: '搜索：不存在的分享' })).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: '订阅分享空态' })).toBeInTheDocument()
    expect(screen.queryByText('正在加载订阅分享')).not.toBeInTheDocument()
  })

  it('deduplicates concurrent load events while the request is pending', async () => {
    const gate = createDeferred()
    const requests: URL[] = []
    server.use(
      subscribeSharesHandler([createSubscribeShare({ share_title: '并发分享结果' })], 200, async url => {
        requests.push(url)
        await gate.promise
      }),
    )
    const user = userEvent.setup()

    await renderShare()
    await waitFor(() => expect(requests).toHaveLength(1))

    await user.click(screen.getByRole('button', { name: '触发订阅分享加载' }))
    await user.click(screen.getByRole('button', { name: '触发订阅分享加载' }))
    expect(requests).toHaveLength(1)
    expect(screen.getByRole('status', { name: '订阅分享无限列表状态' })).toHaveTextContent('loading')

    gate.resolve()
    expect(await screen.findByText('并发分享结果')).toBeInTheDocument()
  })

  it('reloads page one when the keyword prop changes', async () => {
    const requests: URL[] = []
    server.use(
      http.get(subscribeApiUrls.shares, ({ request }) => {
        const url = new URL(request.url)
        requests.push(url)
        const keyword = url.searchParams.get('name') ?? ''
        return HttpResponse.json([
          createSubscribeShare({ share_title: keyword === '新关键字' ? '新关键字分享' : '旧关键字分享' }),
        ])
      }),
    )

    const view = await renderShare('旧关键字')
    expect(await screen.findByText('旧关键字分享')).toBeInTheDocument()
    await view.rerender({ keyword: '新关键字' })

    expect(await screen.findByText('新关键字分享')).toBeInTheDocument()
    expect(screen.queryByText('旧关键字分享')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '搜索：新关键字' })).toBeInTheDocument()
    expect(requests.map(url => url.searchParams.get('name'))).toEqual(['旧关键字', '新关键字'])
    expect(requests.every(url => url.searchParams.get('page') === '1')).toBe(true)
  })

  it('removes only the share whose card emitted delete', async () => {
    const first = createSubscribeShare({ id: 4101, share_title: '待删除分享' })
    const second = createSubscribeShare({ id: 4102, share_title: '保留分享' })
    server.use(subscribeSharesHandler([first, second]))
    const user = userEvent.setup()

    await renderShare()
    expect(await screen.findByText('待删除分享')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '删除分享 4101' }))

    expect(screen.queryByText('待删除分享')).not.toBeInTheDocument()
    expect(screen.getByText('保留分享')).toBeInTheDocument()
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

  it('keeps existing shares and retries the failed later page', async () => {
    const first = createSubscribeShare({ share_title: '分享保留第一页' })
    const second = createSubscribeShare({ share_title: '分享第二页重试成功' })
    const requestedPages: string[] = []
    let pageTwoAttempts = 0
    server.use(
      http.get(subscribeApiUrls.shares, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? ''
        requestedPages.push(page)
        if (page === '1') return HttpResponse.json([first])
        pageTwoAttempts += 1
        if (pageTwoAttempts === 1) return HttpResponse.json({ detail: 'failed' }, { status: 500 })
        return HttpResponse.json([second])
      }),
    )
    const user = userEvent.setup()

    await renderShare()
    expect(await screen.findByText('分享保留第一页')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '触发订阅分享加载' }))

    const retry = await screen.findByRole('button', { name: '重试' })
    expect(screen.getByText('分享保留第一页')).toBeInTheDocument()
    await user.click(retry)

    expect(await screen.findByText('分享第二页重试成功')).toBeInTheDocument()
    expect(screen.getByText('分享保留第一页')).toBeInTheDocument()
    expect(requestedPages).toEqual(['1', '2', '2'])
  })

  it('ignores an obsolete response when keyword resets a pending request', async () => {
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
    expect(requests.filter(url => url.searchParams.get('name') === '新关键字')).toHaveLength(1)
    expect(requests.at(-1)?.searchParams.get('page')).toBe('1')

    gate.resolve()
    await waitFor(() => expect(staleResponse).toHaveBeenCalledOnce())
    await flushPromises()
    await flushPromises()

    expect(screen.getByText('新关键字实时分享')).toBeInTheDocument()
    expect(screen.queryByText('过期关键字分享')).not.toBeInTheDocument()
  })

  it('enters batch mode, selects shares and batch deletes them', async () => {
    const shareA = createSubscribeShare({ id: 4101, share_title: '批量甲' })
    const shareB = createSubscribeShare({ id: 4102, share_title: '批量乙' })
    const deleted: number[] = []
    server.use(
      subscribeSharesHandler([shareA, shareB]),
      http.delete('/api/v1/subscribe/share/:id', ({ params }) => {
        deleted.push(Number(params.id))
        return HttpResponse.json({ success: true })
      }),
    )
    const user = userEvent.setup()

    await renderShare()
    expect(await screen.findByText('批量甲')).toBeInTheDocument()

    // 进入批量模式并选中两项
    await user.click(screen.getByRole('button', { name: '批量管理' }))
    await user.click(screen.getByRole('button', { name: '选择分享 4101' }))
    await user.click(screen.getByRole('button', { name: '选择分享 4102' }))

    // 批量删除后列表清空并退出批量模式
    await user.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => expect(deleted).toEqual([4101, 4102]))
    await waitFor(() => expect(screen.queryByText('批量甲')).not.toBeInTheDocument())
    expect(screen.queryByText('批量乙')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '退出批量操作' })).not.toBeInTheDocument()
  })

  it('keeps failed shares selected and reports batch delete failures', async () => {
    const shareA = createSubscribeShare({ id: 4201, share_title: '删除成功项' })
    const shareB = createSubscribeShare({ id: 4202, share_title: '删除失败项' })
    server.use(
      subscribeSharesHandler([shareA, shareB]),
      http.delete('/api/v1/subscribe/share/:id', ({ params }) => {
        if (Number(params.id) === 4201) return HttpResponse.json({ success: true })
        return HttpResponse.json({ message: 'occupied' }, { status: 500 })
      }),
    )
    const user = userEvent.setup()

    await renderShare()
    expect(await screen.findByText('删除成功项')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '批量管理' }))
    await user.click(screen.getByRole('button', { name: '选择分享 4201' }))
    await user.click(screen.getByRole('button', { name: '选择分享 4202' }))
    await user.click(screen.getByRole('button', { name: '删除' }))

    // 成功项移除，失败项保留且仍处于批量模式
    await waitFor(() => expect(screen.queryByText('删除成功项')).not.toBeInTheDocument())
    expect(screen.getByText('删除失败项')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '退出批量操作' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '选择分享 4202' })).toHaveAttribute('data-selected', 'true')
  })
})
