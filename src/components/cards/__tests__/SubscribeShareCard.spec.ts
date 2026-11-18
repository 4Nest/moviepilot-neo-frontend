import { formatDateDifference } from '@/@core/utils/formatters'
import type { SubscribeShare } from '@/api/types'
import SubscribeShareCard from '@/components/cards/SubscribeShareCard.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { createSubscribeShare } from '@tests/support/factories/subscribe'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  openSharedDialog: vi.fn(),
  routerPush: vi.fn(),
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

vi.mock('@/router', () => ({
  default: { push: (...args: unknown[]) => mocks.routerPush(...args) },
}))

vi.mock('@iconify/vue', () => ({
  Icon: {
    props: ['icon'],
    template: '<span :data-icon="icon" />',
  },
}))

type ShareOverrides = Partial<SubscribeShare>

function observeElementsImmediately() {
  class ImmediateIntersectionObserver {
    readonly root = null
    readonly rootMargin = '0px'
    readonly thresholds = [0]

    constructor(private readonly callback: IntersectionObserverCallback) {}

    disconnect() {}

    observe(target: Element) {
      this.callback([{ intersectionRatio: 1, isIntersecting: true, target } as IntersectionObserverEntry], this)
    }

    takeRecords(): IntersectionObserverEntry[] {
      return []
    }

    unobserve() {}
  }

  vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver)
}

async function renderCard(
  overrides: ShareOverrides = {},
  options: {
    globalImageCache?: boolean
    userUniqueId?: string
    batchMode?: boolean
    selected?: boolean
    deletable?: boolean
  } = {},
) {
  const media = createSubscribeShare(overrides)
  const result = await renderWithProviders(SubscribeShareCard, {
    initialState: {
      globalSettings: {
        data: {
          GLOBAL_IMAGE_CACHE: options.globalImageCache ?? false,
          USER_UNIQUE_ID: options.userUniqueId ?? 'local-uid',
        },
        initialized: true,
        loading: false,
      },
    },
    props: {
      media,
      batchMode: options.batchMode ?? false,
      selected: options.selected ?? false,
      deletable: options.deletable,
    },
  })

  return { ...result, media }
}

function getDialogCall(index = 0) {
  const [, props, events, options] = mocks.openSharedDialog.mock.calls[index] as [
    unknown,
    Record<string, unknown>,
    Record<string, (...args: unknown[]) => void>,
    Record<string, unknown>,
  ]
  return { events, options, props }
}

describe('SubscribeShareCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    observeElementsImmediately()
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
  })

  it('renders stable single-poster high-density metadata without optical blur attributes', async () => {
    const { container, media } = await renderCard(
      {
        custom_words: '#测试识别词',
        effect: 'DV|HDR',
        include: 'LoliHouse',
        quality: 'WEB-DL',
        resolution: '2160p',
        season: 1,
        share_uid: 'my-instance-uid',
        type: '电视剧',
        vote: 8.6,
        year: '2026',
      },
      { globalImageCache: true, userUniqueId: 'my-instance-uid' },
    )

    const card = container.querySelector('.share-card')
    expect(card).toBeInTheDocument()

    // 仅渲染单张独立海报，无需等待大图背景解码，消除 CLS 横向挤压
    const images = container.querySelectorAll<HTMLImageElement>('img')
    expect(images).toHaveLength(1)
    expect(images[0].src).toContain('system/cache/image?url=')
    expect(images[0].src).toContain(encodeURIComponent(media.poster!))

    // 展示标题、季号、评分、本人标识、规则亮点胶囊与底栏统计
    expect(screen.getByText(media.share_title!)).toBeInTheDocument()
    expect(screen.getByText('2026 · S01')).toBeInTheDocument()
    expect(screen.getByText('8.6')).toBeInTheDocument()
    expect(screen.getByText('我的')).toBeInTheDocument()
    expect(screen.getByText(media.share_comment!)).toBeInTheDocument()
    expect(screen.getByText('2160p')).toBeInTheDocument()
    expect(screen.getByText('WEB-DL')).toBeInTheDocument()
    expect(screen.getByText('DV|HDR')).toBeInTheDocument()
    expect(screen.getByText('自定义识别词')).toBeInTheDocument()
    expect(screen.getByText(media.share_user!)).toBeInTheDocument()
    expect(screen.getByText(media.count!.toLocaleString())).toBeInTheDocument()
    expect(screen.getByText(formatDateDifference(media.date!))).toBeInTheDocument()
  })

  it('falls back to backdrop when poster is missing and hides zero reuse count', async () => {
    const { container, media } = await renderCard({ count: 0, poster: undefined, vote: 0 })

    const img = container.querySelector<HTMLImageElement>('img')
    expect(img).not.toBeNull()
    expect((img as HTMLImageElement).src).toContain(media.backdrop!)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it.each([
    ['TMDB before Douban', { doubanid: '2202', tmdbid: 1101 }, 'tmdb:1101'],
    ['Douban without TMDB', { doubanid: '2202', tmdbid: undefined }, 'douban:2202'],
    ['Bangumi without TMDB or Douban', { bangumiid: 3303, doubanid: undefined, tmdbid: undefined }, 'bangumi:3303'],
    ['AniList without other IDs', { anilistid: 4404, bangumiid: undefined, tmdbid: undefined }, 'anilist:4404'],
  ] as const)('navigates directly to /media when clicking the poster (%s)', async (_case, ids, expectedMediaId) => {
    const { media } = await renderCard(ids)
    const posterBtn = screen.getByRole('button', { name: '媒体详情' })

    await fireEvent.click(posterBtn)

    expect(mocks.openSharedDialog).not.toHaveBeenCalled()
    expect(mocks.routerPush).toHaveBeenCalledWith({
      path: '/media',
      query: {
        mediaid: expectedMediaId,
        title: media.name,
        type: media.type,
        year: media.year,
      },
    })
  })

  it('toggles selection for deletable cards and blocks non-deletable cards in batch mode', async () => {
    const media = createSubscribeShare()
    const { container, emitted, rerender } = await renderWithProviders(SubscribeShareCard, {
      props: { batchMode: true, deletable: true, media, selected: true },
    })

    await fireEvent.click(container.querySelector('.v-card') as HTMLElement)
    expect(emitted('toggle-select')).toHaveLength(1)
    expect(mocks.openSharedDialog).not.toHaveBeenCalled()
    expect(container.querySelector('.share-card--selected')).not.toBeNull()

    // 非本人且无中心端管理权限时禁选并置淡
    await rerender({ batchMode: true, deletable: false, media, selected: false })
    expect(container.querySelector('.share-card--disabled')).not.toBeNull()
    await fireEvent.click(container.querySelector('.v-card') as HTMLElement)
    expect(emitted('toggle-select')).toHaveLength(1)
  })

  it('opens the fork dialog with the exact media and replaces it with editing after fork success', async () => {
    const { container, media } = await renderCard()
    const card = container.querySelector<HTMLElement>('.v-card')
    expect(card).not.toBeNull()

    await fireEvent.click(card as HTMLElement)

    expect(mocks.openSharedDialog).toHaveBeenCalledOnce()
    const forkDialog = getDialogCall()
    expect(forkDialog.props).toEqual({ media })
    expect(forkDialog.options).toEqual({ closeOn: ['close', 'fork', 'delete'] })

    forkDialog.events.fork(4701)

    expect(mocks.openSharedDialog).toHaveBeenCalledTimes(2)
    const editDialog = getDialogCall(1)
    expect(editDialog.props).toEqual({ subid: 4701 })
    expect(editDialog.events).toEqual({})
    expect(editDialog.options).toEqual({ closeOn: ['close', 'save', 'remove'] })
  })

  it('forwards deletion from the fork dialog without depending on its response payload', async () => {
    const { container, emitted } = await renderCard()
    const card = container.querySelector<HTMLElement>('.v-card')
    expect(card).not.toBeNull()
    await fireEvent.click(card as HTMLElement)

    getDialogCall().events.delete({ id: 9999 })

    expect(emitted('delete')).toHaveLength(1)
    expect(emitted('delete')?.[0]).toEqual([])
  })

  it('recovers from poster load error when rawPosterUrl updates and renders fallback when no image exists', async () => {
    const noImgView = await renderCard({ backdrop: undefined, poster: undefined })
    expect(noImgView.container.querySelector('.share-card__poster-fallback')).not.toBeNull()
    expect(noImgView.container.querySelector('img')).toBeNull()
    noImgView.unmount()

    const VImgStub = defineComponent({
      name: 'VImg',
      props: { src: String },
      emits: ['error'],
      setup(props, { emit, slots }) {
        return () =>
          h('div', { 'data-poster-src': props.src ?? '' }, [
            h('button', { 'aria-label': '模拟海报失败', type: 'button', onClick: () => emit('error') }),
            slots.placeholder?.(),
          ])
      },
    })

    const initialMedia = createSubscribeShare({ poster: 'https://images.example.com/broken.jpg' })
    const { container, rerender } = await renderWithProviders(SubscribeShareCard, {
      props: { media: initialMedia },
      global: { stubs: { VImg: VImgStub } },
    })

    expect(container.querySelector('[data-poster-src]')).not.toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: '模拟海报失败' }))
    await waitFor(() => expect(container.querySelector('.share-card__poster-fallback')).not.toBeNull())

    const recoveredMedia = createSubscribeShare({ poster: 'https://images.example.com/recovered.jpg' })
    await rerender({ media: recoveredMedia })
    await waitFor(() =>
      expect(container.querySelector('[data-poster-src]')?.getAttribute('data-poster-src')).toContain('recovered.jpg'),
    )
  })

  it('resolves title, comment, type badge, and rule highlight fallbacks across sparse metadata', async () => {
    // 1. 说明回退 description + 排除过滤与总集数胶囊 + movie 类型
    const descView = await renderCard({
      date: '',
      description: '来自媒体简介的回退说明',
      exclude: '720p|CAM',
      share_comment: '   ',
      share_title: '',
      share_user: '',
      total_episode: 24,
      type: 'movie',
      vote: undefined,
      year: '',
    })
    expect(screen.getByText(descView.media.name!)).toBeInTheDocument()
    expect(screen.getByText('来自媒体简介的回退说明')).toBeInTheDocument()
    expect(screen.getByText('电影')).toBeInTheDocument()
    expect(screen.getByText('排除过滤')).toBeInTheDocument()
    expect(screen.getByText('共 24 集')).toBeInTheDocument()
    expect(screen.getByText('未知')).toBeInTheDocument()
    expect(descView.container.querySelector('.share-card__year-tag')).toBeNull()
    expect(descView.container.querySelector('.share-card__date')).toBeNull()
    expect(descView.container.querySelector('.share-card__rating-badge')).toBeNull()
    descView.unmount()

    // 2. 说明回退不同名的原片名 name + 未知类型无徽标
    const nameFallbackView = await renderCard({
      description: '',
      name: '原片名称回退',
      season: undefined,
      share_comment: '',
      share_title: '自定义分享标题',
      type: '其他',
    })
    expect(screen.getByText('原片名称回退')).toBeInTheDocument()
    expect(nameFallbackView.container.querySelector('.share-card__type-badge')).toBeNull()
    nameFallbackView.unmount()

    // 3. 标题、说明均为空时回退“未知”并隐藏说明行
    const emptyView = await renderCard({
      description: '',
      name: '',
      season: 2,
      share_comment: '',
      share_title: '',
      type: '',
    })
    expect(emptyView.container.querySelector('.share-card__title')?.textContent?.trim()).toBe('未知')
    expect(emptyView.container.querySelector('.share-card__comment')).toBeNull()
    expect(screen.getByText('电视剧')).toBeInTheDocument()
  })

  it('handles poster interactions across batch mode, missing media IDs, and keyboard Enter', async () => {
    // 批量模式下未传 deletable 默认允许勾选，点击左侧海报等价点击卡片
    const batchMedia = createSubscribeShare()
    const batchView = await renderWithProviders(SubscribeShareCard, {
      props: { batchMode: true, media: batchMedia, selected: false },
    })
    await fireEvent.mouseEnter(batchView.container.querySelector('.subscribe-share-card-hover-area') as HTMLElement)
    await fireEvent.click(batchView.container.querySelector('.share-card__poster') as HTMLElement)
    expect(batchView.emitted('toggle-select')).toHaveLength(1)
    expect(mocks.routerPush).not.toHaveBeenCalled()
    batchView.unmount()

    // 无关联媒体 ID 时点击左侧海报打开复用弹窗
    const idlessView = await renderCard({
      anilistid: undefined,
      bangumiid: undefined,
      doubanid: undefined,
      tmdbid: undefined,
    })
    await fireEvent.click(idlessView.container.querySelector('.share-card__poster') as HTMLElement)
    expect(mocks.openSharedDialog).toHaveBeenCalledOnce()
    expect(mocks.routerPush).not.toHaveBeenCalled()
    idlessView.unmount()

    // 键盘 Enter 触发详情跳转，且无 name 时回退 share_title
    mocks.openSharedDialog.mockClear()
    const keyView = await renderCard({ name: '', share_title: '键盘回车标题', tmdbid: 7788 })
    const posterButton = screen.getByRole('button', { name: '媒体详情' })
    await fireEvent.keyDown(posterButton, { key: 'Enter' })
    expect(mocks.routerPush).toHaveBeenCalledWith({
      path: '/media',
      query: {
        mediaid: 'tmdb:7788',
        title: '键盘回车标题',
        type: keyView.media.type,
        year: keyView.media.year,
      },
    })
  })
})
