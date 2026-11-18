import { formatDateDifference } from '@/@core/utils/formatters'
import type { SubscribeShare } from '@/api/types'
import SubscribeShareCard from '@/components/cards/SubscribeShareCard.vue'
import { fireEvent, screen } from '@testing-library/vue'
import { createSubscribeShare } from '@tests/support/factories/subscribe'
import { renderWithProviders } from '@tests/support/render'
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
})
