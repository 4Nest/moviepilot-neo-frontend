import type { MediaInfo, NotExistMediaInfo, Site, Subscribe, TmdbEpisode } from '@/api/types'
import { getMediaSubscribeId } from '@/composables/useMediaSubscribe'
import MediaDetailView from '@/views/discover/MediaDetailView.vue'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { flushPromises } from '@vue/test-utils'
import userEvent from '@testing-library/user-event'
import {
  createEmptyMediaInfo,
  createMediaInfo,
  createMediaSeason,
  createNotExistMediaInfo,
  createTmdbEpisode,
} from '@tests/support/factories/media'
import { createSubscribe, createSubscribeSite, createSubscribeTv } from '@tests/support/factories/subscribe'
import {
  mediaDetailsHandler,
  mediaApiUrls,
  mediaEpisodeGroupsHandler,
  mediaExistsHandler,
  mediaGroupSeasonsHandler,
  mediaNotExistsHandler,
  mediaPlayHandler,
  mediaRemoteExistsHandler,
  tmdbSeasonEpisodesHandler,
} from '@tests/support/msw/handlers/media'
import {
  createSubscribeHandler,
  defaultSubscribeConfigHandler,
  querySubscribeByMediaHandler,
  subscribeListHandler,
} from '@tests/support/msw/handlers/subscribe'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { HttpResponse, http } from 'msw'
import { defineComponent, h, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  openDoubanApp: vi.fn(),
  openMediaServerItem: vi.fn(),
  openSharedDialog: vi.fn(),
  routerPush: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => mocks.confirm,
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

vi.mock('@/router', () => ({
  default: {
    push: (...args: unknown[]) => mocks.routerPush(...args),
  },
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

vi.mock('@/utils/appDeepLink', () => ({
  openDoubanApp: (...args: unknown[]) => mocks.openDoubanApp(...args),
  openMediaServerItem: (...args: unknown[]) => mocks.openMediaServerItem(...args),
}))

const API_BASE_URL = 'http://localhost/api/v1/'
const siteListUrl = new URL('site/', API_BASE_URL).href
const selectedSitesUrl = new URL('system/setting/public/IndexerSites', API_BASE_URL).href

const PersonCardSlideViewStub = defineComponent({
  name: 'PersonCardSlideView',
  props: {
    apipath: String,
    linkurl: String,
    title: String,
    type: String,
  },
  setup(props) {
    return () => h('output', { 'aria-label': `人物入口 ${props.type}`, 'data-api-path': props.apipath }, props.linkurl)
  },
})

const MediaCardSlideViewStub = defineComponent({
  name: 'MediaCardSlideView',
  props: {
    apipath: String,
    linkurl: String,
    title: String,
  },
  setup(props) {
    return () => h('output', { 'aria-label': `媒体入口 ${props.title}`, 'data-api-path': props.apipath }, props.linkurl)
  },
})

const SearchSiteDialogStub = defineComponent({
  name: 'SearchSiteDialog',
  props: {
    selected: Array as PropType<number[]>,
    sites: Array as PropType<Site[]>,
  },
})

const VImgStub = defineComponent({
  name: 'VImg',
  props: {
    alt: String,
    src: String,
  },
  setup(props) {
    return () => h('img', { alt: props.alt || '', src: props.src })
  },
})

interface RenderDetailOptions {
  detailRequest?: (url: URL) => void
  detailStatus?: number
  episodeGroups?: Record<string, unknown>[]
  episodeGroupsRequest?: (url: URL) => void | Promise<void>
  episodeGroupsStatus?: number
  existsResponse?: { data?: Record<string, unknown>; message?: string; success: boolean }
  existsStatus?: number
  media?: MediaInfo
  mediaId?: string
  movieSubscribe?: Partial<Subscribe>
  notExists?: NotExistMediaInfo[]
  notExistsStatus?: number
  selectedSites?: number[]
  setupHandlers?: () => void
  sites?: Site[]
  subscribes?: Subscribe[]
  subscribesStatus?: number
  type?: string
}

function installSiteHandlers(sites: Site[] = [], selected: number[] = []) {
  server.use(
    http.get(siteListUrl, () => HttpResponse.json(sites)),
    http.get(selectedSitesUrl, () => HttpResponse.json({ data: { value: selected }, success: true })),
  )
}

async function renderDetail(options: RenderDetailOptions = {}) {
  const media = options.media ?? createMediaInfo({ title: '详情测试电影', tmdb_id: 8101, type: '电影' })
  const mediaId = options.mediaId ?? `tmdb:${media.tmdb_id}`
  const type = options.type ?? media.type ?? '电影'
  const existsRequest = vi.fn()
  const subscribeRequest = vi.fn()
  server.use(
    mediaDetailsHandler(mediaId, media, options.detailStatus, options.detailRequest),
    mediaExistsHandler(
      options.existsResponse ?? { data: { item: {} }, success: false },
      options.existsStatus,
      existsRequest,
    ),
    mediaNotExistsHandler(options.notExists ?? [], options.notExistsStatus),
    subscribeListHandler(options.subscribes ?? [], options.subscribesStatus, subscribeRequest),
    querySubscribeByMediaHandler(getMediaSubscribeId(media), options.movieSubscribe ?? {}, 200, subscribeRequest),
  )
  if (media.tmdb_id) {
    server.use(
      mediaEpisodeGroupsHandler(
        media.tmdb_id,
        options.episodeGroups ?? [],
        options.episodeGroupsStatus,
        options.episodeGroupsRequest,
      ),
    )
  }
  options.setupHandlers?.()
  installSiteHandlers(options.sites, options.selectedSites)

  const result = await renderWithProviders(MediaDetailView, {
    initialState: {
      globalSettings: {
        data: {
          GLOBAL_IMAGE_CACHE: false,
          TMDB_IMAGE_DOMAIN: 'image.tmdb.example.com',
        },
      },
    },
    props: {
      mediaid: mediaId,
      title: media.title,
      type,
      year: media.year,
    },
    global: {
      stubs: {
        MediaCardSlideView: MediaCardSlideViewStub,
        PersonCardSlideView: PersonCardSlideViewStub,
        SearchSiteDialog: SearchSiteDialogStub,
        VImg: VImgStub,
      },
    },
  })

  const recognized = Boolean(media.media_id || media.tmdb_id || media.douban_id || media.bangumi_id || media.anilist_id)
  if (recognized && (options.detailStatus ?? 200) < 400) {
    await waitFor(() => {
      expect(existsRequest).toHaveBeenCalledOnce()
      expect(subscribeRequest).toHaveBeenCalledOnce()
    })
    if (type === '电视剧') await flushPromises()
  }

  return result
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

describe('MediaDetailView detail and actions', () => {
  beforeEach(() => {
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it.each([
    ['TMDB', 'tmdb:8201', createMediaInfo({ tmdb_id: 8201, type: '电影' })],
    ['Douban', 'douban:db-8202', createMediaInfo({ douban_id: 'db-8202', tmdb_id: undefined, type: '电影' })],
    ['Bangumi', 'bangumi:8203', createMediaInfo({ bangumi_id: '8203', tmdb_id: undefined, type: '电视剧' })],
    ['AniList', 'anilist:154587', createMediaInfo({ anilist_id: 154587, tmdb_id: undefined, type: '电视剧' })],
    [
      'extension',
      'custom:item-8204',
      createMediaInfo({ media_id: 'item-8204', mediaid_prefix: 'custom', tmdb_id: 8204, type: '电影' }),
    ],
  ])('loads the exact %s media path and query', async (_source, mediaId, media) => {
    const requested = vi.fn<(url: URL) => void>()
    await renderDetail({ detailRequest: requested, media, mediaId })

    expect(await screen.findByRole('heading', { name: new RegExp(media.title || '') })).toBeInTheDocument()
    await waitFor(() => expect(requested).toHaveBeenCalledOnce())
    expect(requested.mock.calls[0][0].pathname).toBe(`/api/v1/media/${mediaId}`)
    expect(Object.fromEntries(requested.mock.calls[0][0].searchParams)).toEqual({
      title: media.title,
      type_name: media.type,
      year: media.year,
    })
  })

  it('renders backdrop image and gradient overlay cleanly in solid themes', async () => {
    const { container } = await renderDetail()

    expect(await screen.findByRole('heading', { name: /详情测试电影/ })).toBeInTheDocument()
    expect(container.querySelector('.vue-media-back-image')).toBeInTheDocument()
    expect(container.querySelector('.vue-media-back-overlay')).toBeInTheDocument()
  })

  it('renders legal empty media separately from loading', async () => {
    const empty = createEmptyMediaInfo()
    await renderDetail({ media: empty, mediaId: 'tmdb:8301', type: '电影' })

    expect(await screen.findByText('未识别到媒体信息。')).toBeInTheDocument()
    expect(screen.queryByText('加载中')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重试' })).not.toBeInTheDocument()
  })

  it('shows a distinct retryable error when detail loading fails', async () => {
    const requested = vi.fn()
    await renderDetail({
      detailRequest: requested,
      detailStatus: 500,
      media: createEmptyMediaInfo(),
      mediaId: 'tmdb:8302',
      type: '电影',
    })

    expect(await screen.findByText('无法获取到媒体信息，请检查网络连接。')).toBeInTheDocument()
    expect(screen.queryByText('未识别到媒体信息。')).not.toBeInTheDocument()
    expect(requested).toHaveBeenCalledOnce()

    const existsRequested = vi.fn()
    const subscribeRequested = vi.fn()
    server.use(
      mediaDetailsHandler('tmdb:8302', createMediaInfo({ title: '重试成功', tmdb_id: 8302 })),
      mediaExistsHandler({ data: { item: {} }, success: false }, 200, existsRequested),
      querySubscribeByMediaHandler('tmdb:8302', {}, 200, subscribeRequested),
    )
    await fireEvent.click(screen.getByRole('button', { name: '重试' }))

    expect(await screen.findByRole('heading', { name: /重试成功/ })).toBeInTheDocument()
    await waitFor(() => {
      expect(existsRequested).toHaveBeenCalledOnce()
      expect(subscribeRequested).toHaveBeenCalledOnce()
    })
    expect(requested).toHaveBeenCalledOnce()
  })

  it('renders source links and exact recommendation paths', async () => {
    const media = createMediaInfo({
      backdrop_path: undefined,
      douban_id: 'db-8401',
      genres: [{ name: '剧情' }] as unknown as string[],
      imdb_id: 'tt08401',
      poster_path: '/images/link-movie.jpg',
      production_companies: [{ name: '测试制片厂' }],
      production_countries: [{ name: '中国大陆' }],
      release_dates: [
        { date: '2026-04-10', iso_code: 'US', type: 4 },
        { date: '2026-04-01', iso_code: 'CN', type: 4 },
        { date: '2026-05-01', iso_code: 'US', type: 5 },
      ],
      runtime: 120,
      title: '链接电影',
      tmdb_id: 8401,
      tvdb_id: 'tvdb-8401',
      type: '电影',
      year: '2025',
    })
    await renderDetail({ media })

    expect(await screen.findByRole('heading', { name: /链接电影/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /TheMovieDb/ })).toHaveAttribute(
      'href',
      'https://www.themoviedb.org/movie/8401',
    )
    expect(screen.getByRole('link', { name: /IMDb/ })).toHaveAttribute('href', 'https://www.imdb.com/title/tt08401')
    expect(screen.getByRole('link', { name: /TheTvDb/ })).toHaveAttribute(
      'href',
      'https://www.thetvdb.com/series/tvdb-8401',
    )
    expect(screen.getByText(/120 分钟/)).toBeInTheDocument()
    expect(screen.getByText('剧情')).toBeInTheDocument()
    expect(screen.getByText('测试制片厂')).toBeInTheDocument()
    expect(screen.getByText('2026-04-01')).toBeInTheDocument()
    expect(screen.getByText('2026-05-01')).toBeInTheDocument()
    expect(screen.getByLabelText('人物入口 tmdb')).toHaveAttribute('data-api-path', 'tmdb/credits/8401/电影')
    expect(screen.getByLabelText('媒体入口 推荐')).toHaveAttribute('data-api-path', 'tmdb/recommend/8401/电影')
    expect(screen.getByLabelText('媒体入口 类似')).toHaveAttribute('data-api-path', 'tmdb/similar/8401/电影')

    await fireEvent.click(screen.getByText('豆瓣'))
    expect(mocks.openDoubanApp).toHaveBeenCalledWith('db-8401', '电影', '链接电影', '2025')
  })

  it('renders Douban-only facts, deep link, image, credits, and recommendations', async () => {
    const media = createMediaInfo({
      backdrop_path: 'https://images.example.com/douban-backdrop.jpg',
      douban_id: 'db-8402',
      original_title: 'Douban Original',
      poster_path: 'https://images.example.com/douban-poster.jpg',
      production_countries: [{ name: '中国大陆' }],
      release_date: '2026-02-02',
      title: '豆瓣独立电影',
      tmdb_id: undefined,
      type: '电影',
    })
    const { container } = await renderDetail({ media, mediaId: 'douban:db-8402' })

    expect(await screen.findByRole('heading', { name: /豆瓣独立电影/ })).toBeInTheDocument()
    expect(screen.getByText('Douban Original')).toBeInTheDocument()
    expect(screen.getByText('2026-02-02')).toBeInTheDocument()
    expect(screen.getByText('中国大陆')).toBeInTheDocument()
    expect(container.querySelector('.media-poster img')).toHaveAttribute(
      'src',
      'https://images.example.com/douban-poster.jpg',
    )
    expect(screen.getByLabelText('人物入口 douban')).toHaveAttribute('data-api-path', 'douban/credits/db-8402/电影')
    expect(screen.getByLabelText('媒体入口 推荐')).toHaveAttribute('data-api-path', 'douban/recommend/db-8402/电影')

    await fireEvent.click(screen.getByText('豆瓣'))
    expect(mocks.openDoubanApp).toHaveBeenCalledWith('db-8402', '电影', '豆瓣独立电影', '2026')
  })

  it('localizes known TMDB status values, sorts crew roles canonically, and merges Douban crew members', async () => {
    const tmdbMedia = createMediaInfo({
      directors: [
        { id: 101, job: 'Producer', name: 'Colin Wilson' },
        { id: 102, job: 'Editor', name: 'Peter Honess' },
        { id: 103, job: 'Director', name: '沃尔夫冈·彼得森' },
        { id: 104, job: 'Screenplay', name: '戴维·贝尼奥夫' },
      ] as unknown as never,
      status: 'Returning Series',
      tagline: '违抗神明，逆天而行。',
      title: '状态本地化剧集',
      tmdb_id: 8499,
      type: '电视剧',
    })
    const tmdbView = await renderDetail({ media: tmdbMedia, mediaId: 'tmdb:8499', type: '电视剧' })

    expect(await screen.findByText('连载中')).toBeInTheDocument()
    expect(screen.queryByText('Returning Series')).not.toBeInTheDocument()
    const tmdbCrewRoles = Array.from(tmdbView.container.querySelectorAll('ul.media-crew .crew-role')).map(node =>
      node.textContent?.trim(),
    )
    expect(tmdbCrewRoles).toEqual(['导演', '编剧', '制片人', '剪辑'])
    expect(tmdbView.container.querySelector('.media-hero-stage .tagline')?.textContent?.trim()).toBe(
      '违抗神明，逆天而行。',
    )
    expect(tmdbView.container.querySelector('.media-detail-card')).toBeInTheDocument()
    tmdbView.unmount()

    const doubanMedia = createMediaInfo({
      directors: [
        { id: 'd1', name: '张艺谋', roles: ['导演'], url: 'https://movie.douban.com/celebrity/1' },
        { id: 'd2', name: '张末', roles: ['导演'], url: 'https://movie.douban.com/celebrity/2' },
        { id: 'w1', name: '陈宇', roles: ['编剧'], url: 'https://movie.douban.com/celebrity/3' },
      ] as unknown as never,
      douban_id: 'db-8499',
      title: '豆瓣同职主创电影',
      tmdb_id: undefined,
      type: '电影',
    })
    const { container } = await renderDetail({ media: doubanMedia, mediaId: 'douban:db-8499', type: '电影' })

    expect(await screen.findByRole('heading', { name: /豆瓣同职主创电影/ })).toBeInTheDocument()
    expect(container.querySelectorAll('ul.media-crew > li')).toHaveLength(2)
    expect(screen.getByRole('link', { name: '张艺谋' })).toHaveAttribute('href', 'https://movie.douban.com/celebrity/1')
    expect(screen.getByRole('link', { name: '张末' })).toHaveAttribute('href', 'https://movie.douban.com/celebrity/2')
    expect(screen.getByRole('link', { name: '陈宇' })).toHaveAttribute('href', 'https://movie.douban.com/celebrity/3')
  })

  it('renders Bangumi-only facts, external link, credits, and recommendations', async () => {
    const media = createMediaInfo({
      bangumi_id: '8403',
      original_title: 'Bangumi Original',
      release_date: '2026-03-03',
      title: 'Bangumi 独立条目',
      tmdb_id: undefined,
      type: '电视剧',
    })
    await renderDetail({ media, mediaId: 'bangumi:8403', type: '电视剧' })

    expect(await screen.findByRole('heading', { name: /Bangumi 独立条目/ })).toBeInTheDocument()
    expect(screen.getByText('Bangumi Original')).toBeInTheDocument()
    expect(screen.getByText('2026-03-03')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Bangumi/ })).toHaveAttribute('href', 'https://bgm.tv/subject/8403')
    expect(screen.getByLabelText('人物入口 bangumi')).toHaveAttribute('data-api-path', 'bangumi/credits/8403')
    expect(screen.getByLabelText('媒体入口 推荐')).toHaveAttribute('data-api-path', 'bangumi/recommend/8403')
    expect(screen.queryByLabelText('媒体入口 类似')).not.toBeInTheDocument()
  })

  it('renders AniList-only facts, external link, credits, and recommendations', async () => {
    const media = createMediaInfo({
      anilist_id: 154587,
      original_title: '葬送のフリーレン',
      release_date: '2023-09-29',
      title: '葬送的芙莉莲',
      tmdb_id: undefined,
      type: '电视剧',
    })
    await renderDetail({ media, mediaId: 'anilist:154587', type: '电视剧' })

    expect(await screen.findByRole('heading', { name: /葬送的芙莉莲/ })).toBeInTheDocument()
    expect(screen.getByText('葬送のフリーレン')).toBeInTheDocument()
    expect(screen.getByText('2023-09-29')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /AniList/ })).toHaveAttribute('href', 'https://anilist.co/anime/154587')
    expect(screen.getByLabelText('人物入口 anilist')).toHaveAttribute('data-api-path', 'anilist/credits/154587')
    expect(screen.getByLabelText('媒体入口 推荐')).toHaveAttribute('data-api-path', 'anilist/recommend/154587')
    expect(screen.queryByLabelText('媒体入口 类似')).not.toBeInTheDocument()
  })

  it('routes subtitle searches directly when no sites are enabled', async () => {
    const media = createMediaInfo({ season: 2, title: '字幕剧', tmdb_id: 8501, type: '电视剧' })
    await renderDetail({ media, type: '电视剧' })

    await fireEvent.click(await screen.findByRole('button', { name: /搜索字幕/ }))

    await waitFor(() => expect(mocks.routerPush).toHaveBeenCalledOnce())
    expect(mocks.routerPush).toHaveBeenCalledWith({
      path: '/resource',
      query: {
        area: 'title',
        episode: null,
        keyword: 'tmdb:8501',
        result_type: 'subtitle',
        season: 2,
        sites: '',
        title: '字幕剧',
        type: '电视剧',
        year: '2026',
      },
    })
  })

  it('routes IMDb resource searches with torrent result semantics', async () => {
    const user = userEvent.setup()
    const media = createMediaInfo({ imdb_id: 'tt08502', season: 3, title: '资源剧', tmdb_id: 8502, type: '电视剧' })
    await renderDetail({ media, type: '电视剧' })

    await user.click(await screen.findByRole('button', { name: /搜索资源/ }))
    await user.click(await screen.findByText('IMDB链接'))

    await waitFor(() => expect(mocks.routerPush).toHaveBeenCalledOnce())
    expect(mocks.routerPush).toHaveBeenCalledWith({
      path: '/resource',
      query: {
        area: 'imdbid',
        episode: null,
        keyword: 'tmdb:8502',
        result_type: 'torrent',
        season: 3,
        sites: '',
        title: '资源剧',
        type: '电视剧',
        year: '2026',
      },
    })
  })

  it('opens site selection and routes with the selected sites', async () => {
    const site = createSubscribeSite({ id: 91, is_active: true, name: '搜索站点' })
    await renderDetail({ selectedSites: [91], sites: [site] })

    await fireEvent.click(await screen.findByRole('button', { name: /搜索字幕/ }))

    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    const [, props, events] = mocks.openSharedDialog.mock.calls[0] as [
      unknown,
      { selected: number[]; sites: Site[] },
      { search: (sites: number[]) => void },
    ]
    expect(props).toEqual({ selected: [91], sites: [site] })

    events.search([91])
    expect(mocks.routerPush).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ result_type: 'subtitle', sites: '91' }),
      }),
    )
  })

  it('continues to resource search when site settings fail to load', async () => {
    await renderDetail()
    server.use(
      http.get(siteListUrl, () => HttpResponse.json({ message: '站点失败' }, { status: 500 })),
      http.get(selectedSitesUrl, () => HttpResponse.json({ message: '设置失败' }, { status: 500 })),
    )

    await fireEvent.click(screen.getByRole('button', { name: /搜索字幕/ }))

    await waitFor(() => expect(mocks.routerPush).toHaveBeenCalledOnce())
    expect(mocks.openSharedDialog).not.toHaveBeenCalled()
  })

  it('opens site selection with an empty selection when the setting has no value', async () => {
    const site = createSubscribeSite({ id: 92, is_active: true, name: '空设置站点' })
    await renderDetail()
    server.use(
      http.get(siteListUrl, () => HttpResponse.json([site])),
      http.get(selectedSitesUrl, () => HttpResponse.json({ data: {}, success: true })),
    )

    await fireEvent.click(screen.getByRole('button', { name: /搜索字幕/ }))

    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    const [, props] = mocks.openSharedDialog.mock.calls[0] as [unknown, { selected: number[]; sites: Site[] }]
    expect(props).toEqual(expect.objectContaining({ selected: [], sites: [site] }))
  })

  it('opens the media server only for a successful play response', async () => {
    const user = userEvent.setup()
    server.use(
      mediaPlayHandler('library-8601', {
        data: {
          item_id: 'item-8601',
          server_id: 'server-1',
          server_type: 'emby',
          url: 'https://media.example.com/play/8601',
        },
        success: true,
      }),
    )
    await renderDetail({ existsResponse: { data: { item: { id: 'library-8601' } }, success: true } })

    await user.click(await screen.findByRole('button', { name: /在线播放/ }))

    await waitFor(() =>
      expect(mocks.openMediaServerItem).toHaveBeenCalledWith({
        item_id: 'item-8601',
        link: 'https://media.example.com/play/8601',
        server_id: 'server-1',
        server_type: 'emby',
      }),
    )
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('shows the backend message for a rejected play response', async () => {
    server.use(mediaPlayHandler('library-8602', { message: '未找到播放地址', success: false }))
    await renderDetail({ existsResponse: { data: { item: { id: 'library-8602' } }, success: true } })

    await fireEvent.click(await screen.findByRole('button', { name: /在线播放/ }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('获取播放链接失败：未找到播放地址！'))
    expect(mocks.openMediaServerItem).not.toHaveBeenCalled()
  })

  it('shows a user-visible error when the play request fails over HTTP', async () => {
    server.use(mediaPlayHandler('library-8603', { message: '服务异常', success: false }, 500))
    await renderDetail({ existsResponse: { data: { item: { id: 'library-8603' } }, success: true } })

    await fireEvent.click(await screen.findByRole('button', { name: /在线播放/ }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('获取播放链接失败！'))
    expect(mocks.openMediaServerItem).not.toHaveBeenCalled()
  })
})

describe('MediaDetailView subscriptions, seasons, and episode groups', () => {
  beforeEach(() => {
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('does not query TMDB episode groups for an AniList detail with an auxiliary TMDB ID', async () => {
    const episodeGroupsRequest = vi.fn()
    const groupSeasonsRequest = vi.fn()
    const media = createSubscribeTv({
      anilist_id: 154587,
      episode_group: 'auxiliary-group',
      source: 'anilist',
      title: 'AniList 主来源剧集',
      tmdb_id: 8700,
    })

    await renderDetail({
      episodeGroupsRequest,
      media,
      mediaId: 'anilist:154587',
      setupHandlers: () => {
        server.use(mediaGroupSeasonsHandler('auxiliary-group', [], 200, groupSeasonsRequest))
      },
      type: '电视剧',
    })

    expect(await screen.findByRole('heading', { name: /AniList 主来源剧集/ })).toBeInTheDocument()
    await flushPromises()
    expect(episodeGroupsRequest).not.toHaveBeenCalled()
    expect(groupSeasonsRequest).not.toHaveBeenCalled()
  })

  it('shows the current movie subscription state returned by the media endpoint', async () => {
    const media = createMediaInfo({ title: '已订阅电影', tmdb_id: 8701, type: '电影' })
    const subscribe = createSubscribe({ id: 18701, name: media.title, tmdbid: 8701, type: '电影' })

    await renderDetail({ media, movieSubscribe: subscribe })

    expect(await screen.findByRole('button', { name: /已订阅/ })).toBeInTheDocument()
  })

  it.each([
    [
      'Douban',
      createSubscribeTv({ douban_id: 'db-8702', source: 'douban', tmdb_id: undefined }),
      createSubscribe({ doubanid: 'db-8702', season: 1, type: '电视剧' }),
    ],
    [
      'Bangumi',
      createSubscribeTv({ bangumi_id: 8703, source: 'bangumi', tmdb_id: undefined }),
      createSubscribe({ bangumiid: 8703, season: 1, type: '电视剧' }),
    ],
  ])('matches %s subscriptions without relying on a TMDB identity', async (_label, media, subscribe) => {
    media.season_info = [createMediaSeason({ season_number: 1 })]

    await renderDetail({ media, mediaId: getMediaSubscribeId(media), subscribes: [subscribe], type: '电视剧' })

    expect(await screen.findByRole('button', { name: /已全部订阅/ })).toBeInTheDocument()
  })

  it('does not report all default seasons subscribed when an extra season replaces a missing one', async () => {
    const media = createSubscribeTv({
      season_info: [createMediaSeason({ season_number: 1 }), createMediaSeason({ season_number: 2 })],
      title: '集合判断剧',
      tmdb_id: 8702,
    })
    const subscribes = [
      createSubscribe({ season: 1, tmdbid: 8702, type: '电视剧' }),
      createSubscribe({ season: 99, tmdbid: 8702, type: '电视剧' }),
    ]

    await renderDetail({ media, subscribes, type: '电视剧' })

    expect(await screen.findByRole('button', { name: /已订阅 2 季/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /已全部订阅/ })).not.toBeInTheDocument()
  })

  it('requires every default season including S00 before reporting all seasons subscribed', async () => {
    const media = createSubscribeTv({
      season_info: [
        createMediaSeason({ name: '特别篇', season_number: 0 }),
        createMediaSeason({ season_number: 1 }),
        createMediaSeason({ season_number: 2 }),
      ],
      title: '全季订阅剧',
      tmdb_id: 8703,
    })
    const subscribes = [0, 1, 2].map(season => createSubscribe({ season, tmdbid: 8703, type: '电视剧' }))

    await renderDetail({ media, subscribes, type: '电视剧' })

    expect(await screen.findByRole('button', { name: /已全部订阅/ })).toBeInTheDocument()
  })

  it('does not report all seasons subscribed when S00 is missing', async () => {
    const media = createSubscribeTv({
      season_info: [
        createMediaSeason({ name: '特别篇', season_number: 0 }),
        createMediaSeason({ season_number: 1 }),
        createMediaSeason({ season_number: 2 }),
      ],
      title: '缺少特别篇订阅剧',
      tmdb_id: 8709,
    })
    const subscribes = [1, 2, 99].map(season => createSubscribe({ season, tmdbid: 8709, type: '电视剧' }))

    await renderDetail({ media, subscribes, type: '电视剧' })

    expect(await screen.findByRole('button', { name: /已订阅 3 季/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /已全部订阅/ })).not.toBeInTheDocument()
  })

  it('sorts S00 last and maps complete, partial, and missing season states', async () => {
    const media = createSubscribeTv({
      season_info: [
        createMediaSeason({ episode_count: 2, name: '特别篇', season_number: 0 }),
        createMediaSeason({ episode_count: 2, season_number: 2 }),
        createMediaSeason({ episode_count: 2, season_number: 1 }),
      ],
      title: '缺失状态剧',
      tmdb_id: 8704,
    })
    const notExists = [
      createNotExistMediaInfo({ episodes: [], season: 0, total_episode: 2 }),
      createNotExistMediaInfo({ episodes: [2], season: 1, total_episode: 2 }),
      createNotExistMediaInfo({ episodes: [1, 2], season: 2, total_episode: 2 }),
    ]
    const { container } = await renderDetail({ media, notExists, type: '电视剧' })

    await waitFor(() => {
      const panels = [...container.querySelectorAll<HTMLElement>('.v-expansion-panel')]
      expect(panels).toHaveLength(3)
      expect(panels.map(panel => panel.textContent)).toEqual([
        expect.stringMatching(/第 1 季.*部分缺失/s),
        expect.stringMatching(/第 2 季.*已入库/s),
        expect.stringMatching(/特别篇.*缺失/s),
      ])
    })
  })

  it('explains season existence states and lists missing episodes on hover', async () => {
    const media = createSubscribeTv({
      season_info: [
        createMediaSeason({ episode_count: 4, season_number: 1 }),
        createMediaSeason({ episode_count: 2, season_number: 2 }),
        createMediaSeason({ episode_count: 3, season_number: 3 }),
      ],
      title: '缺失提示剧',
      tmdb_id: 8706,
    })
    const notExists = [
      createNotExistMediaInfo({ episodes: [2, 3, 4], season: 1, start_episode: 2, total_episode: 4 }),
      createNotExistMediaInfo({ episodes: [], season: 2, total_episode: 2 }),
    ]
    const user = userEvent.setup()
    await renderDetail({ media, notExists, type: '电视剧' })

    await user.hover(await screen.findByText('部分缺失'))
    expect(await screen.findByText('媒体库中缺少 E02-E04，共 3 集')).toBeInTheDocument()

    await user.hover(screen.getByText('缺失'))
    expect(await screen.findByText('在媒体服务器（及已开启的本地文件检查）中未找到本季的 2 集')).toBeInTheDocument()

    await user.hover(screen.getByText('已入库'))
    expect(await screen.findByText('媒体服务器或本地媒体库中已有本季全部剧集')).toBeInTheDocument()
  })

  it('loads season episodes and marks episodes that already exist remotely', async () => {
    const media = createSubscribeTv({
      season_info: [createMediaSeason({ episode_count: 2, season_number: 1 })],
      title: '季集加载剧',
      tmdb_id: 8705,
    })
    const episodeRequest = vi.fn<(url: URL) => void>()
    const existsRequest = vi.fn<(payload: Record<string, unknown>) => void>()
    const { container } = await renderDetail({ media, type: '电视剧' })
    server.use(
      tmdbSeasonEpisodesHandler(
        8705,
        1,
        [
          createTmdbEpisode({ episode_number: 1, name: '已入库第一集', season_number: 1, still_path: '/still-1.jpg' }),
          createTmdbEpisode({ episode_number: 2, name: '缺失第二集', season_number: 1 }),
        ],
        200,
        episodeRequest,
      ),
      mediaRemoteExistsHandler({ 1: [1] }, 200, existsRequest),
    )

    await fireEvent.click(container.querySelector('.v-expansion-panel-title') as HTMLElement)

    expect(await screen.findByRole('heading', { name: '1 - 已入库第一集' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '2 - 缺失第二集' })).toBeInTheDocument()
    expect(container.querySelector('.episode-info + img')).toHaveAttribute(
      'src',
      'https://image.tmdb.example.com/t/p/w500/still-1.jpg',
    )
    await waitFor(() => expect(container.querySelectorAll('.episode-exists-badge')).toHaveLength(1))
    expect(episodeRequest).toHaveBeenCalledOnce()
    expect(episodeRequest.mock.calls[0][0].searchParams.get('episode_group')).toBeNull()
    expect(existsRequest).toHaveBeenCalledWith(expect.objectContaining({ episode_group: '' }))

    await fireEvent.click(container.querySelector('.v-expansion-panel-title') as HTMLElement)
    await flushPromises()
    expect(episodeRequest).toHaveBeenCalledOnce()
    expect(existsRequest).toHaveBeenCalledOnce()
  })

  it('opens the season subscription dialog with the selected season and episode group', async () => {
    const media = createSubscribeTv({
      season_info: [createMediaSeason({ season_number: 1 })],
      title: '逐季订阅剧',
      tmdb_id: 8706,
    })
    server.use(defaultSubscribeConfigHandler('电视剧', { show_edit_dialog: false }))
    const { container } = await renderDetail({ media, type: '电视剧' })
    const seasonPanel = container.querySelector('.v-expansion-panel') as HTMLElement
    const seasonAction = seasonPanel.querySelector('.v-btn') as HTMLElement

    await fireEvent.click(seasonAction)

    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    const [, props] = mocks.openSharedDialog.mock.calls[0] as [
      unknown,
      { initialEpisodeGroup: string; selectedSeason: number },
    ]
    expect(props).toEqual(
      expect.objectContaining({
        initialEpisodeGroup: '',
        selectedSeason: 1,
      }),
    )
  })

  it('refreshes the current movie subscription state after removal from the edit dialog', async () => {
    const media = createMediaInfo({ title: '编辑后刷新电影', tmdb_id: 8713, type: '电影' })
    const refreshed = vi.fn()
    await renderDetail({ media })
    server.use(
      querySubscribeByMediaHandler('tmdb:8713', {}, 200, refreshed),
      createSubscribeHandler({ data: { id: 18713 }, success: true }),
      defaultSubscribeConfigHandler('电影', { show_edit_dialog: true }),
    )

    await fireEvent.click(screen.getByRole('button', { name: /^订阅$/ }))

    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    const [, , events] = mocks.openSharedDialog.mock.calls[0] as [unknown, unknown, { remove: () => void }]
    events.remove()

    await waitFor(() => expect(refreshed).toHaveBeenCalledOnce())
  })

  it('refreshes TV season subscriptions after removal from the edit dialog', async () => {
    const media = createSubscribeTv({
      season_info: [createMediaSeason({ season_number: 1 })],
      title: '编辑后刷新电视剧',
      tmdb_id: 8714,
    })
    await renderDetail({ media, type: '电视剧' })
    server.use(
      createSubscribeHandler({ data: { id: 18714 }, success: true }),
      defaultSubscribeConfigHandler('电视剧', { show_edit_dialog: true }),
    )

    await fireEvent.click(screen.getByRole('button', { name: /^订阅$/ }))
    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    const [, , seasonEvents] = mocks.openSharedDialog.mock.calls[0] as [
      unknown,
      unknown,
      {
        subscribe: (
          seasons: ReturnType<typeof createMediaSeason>[],
          states: Record<number, number>,
          group: string,
          mode: string,
          visible: number[],
        ) => void
      },
    ]
    seasonEvents.subscribe([media.season_info![0]], {}, '', 'normal', [1])
    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledTimes(2))

    const refreshed = vi.fn()
    server.use(subscribeListHandler([], 200, refreshed))
    const [, , editEvents] = mocks.openSharedDialog.mock.calls[1] as [unknown, unknown, { remove: () => void }]
    editEvents.remove()

    await waitFor(() => expect(refreshed).toHaveBeenCalledOnce())
  })

  it('keeps the TV detail visible when auxiliary status requests fail', async () => {
    const media = createSubscribeTv({
      season_info: [createMediaSeason({ season_number: 1 })],
      title: '辅助请求失败剧',
      tmdb_id: 8715,
    })

    const { container } = await renderDetail({
      episodeGroupsStatus: 500,
      existsStatus: 500,
      media,
      notExistsStatus: 500,
      subscribesStatus: 500,
      type: '电视剧',
    })

    expect(screen.getByRole('heading', { name: /辅助请求失败剧/ })).toBeInTheDocument()
    expect(container.querySelector('.v-expansion-panel')).toHaveTextContent('第 1 季')
    expect(screen.queryByText('无法获取到媒体信息，请检查网络连接。')).not.toBeInTheDocument()
  })

  it('renders incomplete TV metadata without a season list', async () => {
    const media = createSubscribeTv({
      episode_run_time: ['45'],
      genres: undefined,
      season_info: undefined,
      title: '季信息待补全剧',
      tmdb_id: 8717,
    })
    const { container } = await renderDetail({ media, type: '电视剧' })

    expect(screen.getByRole('heading', { name: /季信息待补全剧/ })).toBeInTheDocument()
    expect(screen.getByText(/45 分钟/)).toBeInTheDocument()
    expect(container.querySelector('.v-expansion-panel')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^订阅$/ })).toBeInTheDocument()
  })

  it('renders without crashing when both runtime and episode_run_time are undefined, includes source=themoviedb on director links, and refreshes when props change', async () => {
    const firstMedia = createMediaInfo({
      directors: [{ id: 525, job: 'Director', name: 'Christopher Nolan' }] as unknown as never,
      episode_run_time: undefined as unknown as string[],
      genres: ['科幻'] as unknown as never,
      runtime: undefined,
      title: '星际穿越',
      tmdb_id: 8801,
      type: '电影',
      year: '2014',
    })
    const view = await renderDetail({ media: firstMedia, mediaId: 'tmdb:8801', type: '电影' })

    expect(await screen.findByRole('heading', { name: /星际穿越/ })).toBeInTheDocument()
    expect(screen.getByText('科幻')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Christopher Nolan' })).toHaveAttribute(
      'href',
      '/person?personid=525&source=themoviedb',
    )

    const secondMedia = createMediaInfo({
      episode_run_time: undefined as unknown as string[],
      runtime: 148,
      title: '盗梦空间',
      tmdb_id: 8802,
      type: '电影',
      year: '2010',
    })
    server.use(
      mediaDetailsHandler('tmdb:8802', secondMedia),
      mediaExistsHandler({ data: { item: {} }, success: false }),
      querySubscribeByMediaHandler('tmdb:8802', {}),
      mediaEpisodeGroupsHandler(8802, []),
    )

    await view.rerender({
      mediaid: 'tmdb:8802',
      title: '盗梦空间',
      type: '电影',
      year: '2010',
    })

    expect(await screen.findByRole('heading', { name: /盗梦空间/ })).toBeInTheDocument()
    expect(screen.getByText(/148 分钟/)).toBeInTheDocument()
  })

  it('disables search, subscribe, and play buttons while in-flight requests are pending', async () => {
    const playGate = createDeferred<{ data: Record<string, string>; success: boolean }>()
    const siteGate = createDeferred<Site[]>()
    const subscribeGate = createDeferred<{ data: { id: number }; success: boolean }>()

    const media = createMediaInfo({ title: '防连点测试片', tmdb_id: 8803, type: '电影' })
    await renderDetail({
      existsResponse: { data: { item: { id: 'lib-8803' } }, success: true },
      media,
      mediaId: 'tmdb:8803',
    })

    server.use(
      http.get(siteListUrl, () => siteGate.promise.then(list => HttpResponse.json(list))),
      http.post(new URL('subscribe/', API_BASE_URL).href, () =>
        subscribeGate.promise.then(res => HttpResponse.json(res)),
      ),
      http.get(new URL('mediaserver/play/lib-8803', API_BASE_URL).href, () =>
        playGate.promise.then(res => HttpResponse.json(res)),
      ),
    )

    const subtitleBtn = await screen.findByRole('button', { name: /搜索字幕/ })
    const resourceBtn = screen.getByRole('button', { name: /搜索资源/ })
    await fireEvent.click(subtitleBtn)
    await waitFor(() => expect(subtitleBtn).toBeDisabled())
    expect(resourceBtn).toBeDisabled()
    siteGate.resolve([])
    await waitFor(() => expect(subtitleBtn).not.toBeDisabled())

    const playBtn = screen.getByRole('button', { name: /在线播放/ })
    await fireEvent.click(playBtn)
    await waitFor(() => expect(playBtn).toBeDisabled())
    playGate.resolve({
      data: { item_id: 'i1', server_id: 's1', server_type: 'emby', url: 'https://example.com' },
      success: true,
    })
    await waitFor(() => expect(playBtn).not.toBeDisabled())

    // 已入库电影默认走模式选择弹窗，验证无入库电影主订阅按钮防连点
    const freshMedia = createMediaInfo({ title: '未入库防连点', tmdb_id: 8804, type: '电影' })
    const view2 = await renderDetail({ media: freshMedia, mediaId: 'tmdb:8804' })
    server.use(
      http.post(new URL('subscribe/', API_BASE_URL).href, () =>
        subscribeGate.promise.then(res => HttpResponse.json(res)),
      ),
      defaultSubscribeConfigHandler('电影', { show_edit_dialog: false }),
    )
    const subBtns = view2.getAllByRole('button', { name: /^订阅$/ })
    const subBtn = subBtns[subBtns.length - 1]
    await fireEvent.click(subBtn)
    await waitFor(() => expect(subBtn).toBeDisabled())
    subscribeGate.resolve({ data: { id: 99 }, success: true })
    await waitFor(() => expect(subBtn).not.toBeDisabled())
  })

  it('switches episode groups and sends the selected group in missing-state requests', async () => {
    const media = createSubscribeTv({
      season_info: [createMediaSeason({ season_number: 1 })],
      title: '剧集组切换剧',
      tmdb_id: 8707,
    })
    const group = { episode_count: 8, group_count: 1, id: 'group-a', name: '剪辑组 A' }
    const missingRequest = vi.fn<(payload: Record<string, unknown>) => void>()
    server.use(mediaGroupSeasonsHandler('group-a', [createMediaSeason({ name: 'A 组第一季', season_number: 1 })]))
    const { container } = await renderDetail({ episodeGroups: [group], media, type: '电视剧' })
    server.use(mediaNotExistsHandler([], 200, missingRequest))

    await fireEvent.click(screen.getByRole('button', { name: /剪辑组 A/ }))

    expect(await screen.findByText(/当前：剪辑组 A/)).toBeInTheDocument()
    await waitFor(() => expect(container.querySelector('.v-expansion-panel')).toBeInTheDocument())
    expect(
      within(container.querySelector('.v-expansion-panel') as HTMLElement).getByText('第 1 季'),
    ).toBeInTheDocument()
    expect(missingRequest).toHaveBeenCalledWith(expect.objectContaining({ episode_group: 'group-a' }), expect.any(URL))
    await flushPromises()
  })

  it('loads the backend default episode group and restores default seasons when switching back', async () => {
    const media = createSubscribeTv({
      episode_group: 'group-a',
      season_info: [createMediaSeason({ season_number: 1 })],
      title: '默认剧集组剧',
      tmdb_id: 8710,
    })
    const group = { episode_count: 8, group_count: 1, id: 'group-a', name: '后端默认组' }
    const groupSeasonRequest = vi.fn()
    const { container } = await renderDetail({
      episodeGroups: [group],
      media,
      setupHandlers: () => {
        server.use(
          mediaGroupSeasonsHandler(
            'group-a',
            [createMediaSeason({ name: '默认组第二季', season_number: 2 })],
            200,
            groupSeasonRequest,
          ),
        )
      },
      type: '电视剧',
    })

    expect(await screen.findByText(/当前：后端默认组/)).toBeInTheDocument()
    await waitFor(() => expect(groupSeasonRequest).toHaveBeenCalledOnce())
    await waitFor(() => expect(container.querySelector('.v-expansion-panel')).toHaveTextContent('第 2 季'))

    await fireEvent.click(
      within(container.querySelector('.episode-group-selector') as HTMLElement).getByRole('button', { name: /^默认/ }),
    )

    expect(await screen.findByText(/当前：默认/)).toBeInTheDocument()
    await waitFor(() => expect(container.querySelector('.v-expansion-panel')).toHaveTextContent('第 1 季'))
    await flushPromises()
  })

  it('keeps loaded group seasons without repeating the request when the selected group is clicked again', async () => {
    const media = createSubscribeTv({
      season_info: [createMediaSeason({ season_number: 1 })],
      title: '剧集组重复点击剧',
      tmdb_id: 8716,
    })
    const group = { episode_count: 8, group_count: 1, id: 'group-a', name: '稳定组' }
    const groupSeasonRequest = vi.fn()
    const { container } = await renderDetail({
      episodeGroups: [group],
      media,
      setupHandlers: () => {
        server.use(
          mediaGroupSeasonsHandler(
            'group-a',
            [createMediaSeason({ name: '稳定组第二季', season_number: 2 })],
            200,
            groupSeasonRequest,
          ),
        )
      },
      type: '电视剧',
    })

    await fireEvent.click(screen.getByRole('button', { name: /稳定组/ }))
    await waitFor(() => expect(groupSeasonRequest).toHaveBeenCalledOnce())
    await waitFor(() => expect(container.querySelector('.v-expansion-panel')).toHaveTextContent('第 2 季'))
    await fireEvent.click(screen.getByRole('button', { name: /稳定组/ }))
    await flushPromises()

    expect(groupSeasonRequest).toHaveBeenCalledOnce()
    expect(screen.getByText(/当前：稳定组/)).toBeInTheDocument()
    expect(container.querySelector('.v-expansion-panel')).toHaveTextContent('第 2 季')
  })

  it('scrolls the episode-group rail in both directions', async () => {
    const media = createSubscribeTv({
      season_info: [createMediaSeason({ season_number: 1 })],
      title: '剧集组滚动剧',
      tmdb_id: 8718,
    })
    const groups = Array.from({ length: 5 }, (_, index) => ({
      episode_count: 8 + index,
      group_count: 1,
      id: `group-${index}`,
      name: `剧集组 ${index}`,
    }))
    const user = userEvent.setup()
    const { container } = await renderDetail({ episodeGroups: groups, media, type: '电视剧' })
    const rail = container.querySelector<HTMLElement>('.episode-group-rail')
    expect(rail).not.toBeNull()
    Object.defineProperties(rail, {
      clientWidth: { configurable: true, value: 400 },
      scrollLeft: { configurable: true, value: 0, writable: true },
      scrollWidth: { configurable: true, value: 1000 },
    })
    rail!.scrollBy = vi.fn()
    await fireEvent.scroll(rail as HTMLElement)

    await user.click(screen.getByRole('button', { name: '查看更多剧集组' }))
    expect(rail!.scrollBy).toHaveBeenCalledWith({ behavior: 'smooth', left: 288 })

    rail!.scrollLeft = 300
    await fireEvent.scroll(rail as HTMLElement)
    await user.click(screen.getByRole('button', { name: '查看上一组剧集组' }))
    expect(rail!.scrollBy).toHaveBeenCalledWith({ behavior: 'smooth', left: -288 })
  })

  it('ignores stale episode-group seasons after a newer group is selected', async () => {
    const media = createSubscribeTv({
      season_info: [createMediaSeason({ season_number: 1 })],
      title: '剧集组季竞态剧',
      tmdb_id: 8711,
    })
    const groups = [
      { episode_count: 8, group_count: 1, id: 'group-a', name: '剪辑组 A' },
      { episode_count: 9, group_count: 1, id: 'group-b', name: '剪辑组 B' },
    ]
    const staleSeasons = createDeferred<ReturnType<typeof createMediaSeason>[]>()
    const staleRequest = vi.fn()
    const staleResponseReturned = createDeferred<void>()
    const { container } = await renderDetail({
      episodeGroups: groups,
      media,
      setupHandlers: () => {
        server.use(
          http.get(mediaApiUrls.groupSeasons('group-a'), async () => {
            staleRequest()
            const response = await staleSeasons.promise
            staleResponseReturned.resolve()
            return HttpResponse.json(response)
          }),
          mediaGroupSeasonsHandler('group-b', [createMediaSeason({ season_number: 2 })]),
        )
      },
      type: '电视剧',
    })

    await fireEvent.click(screen.getByRole('button', { name: /剪辑组 A/ }))
    await waitFor(() => expect(staleRequest).toHaveBeenCalledOnce())
    await fireEvent.click(screen.getByRole('button', { name: /剪辑组 B/ }))
    await waitFor(() => expect(container.querySelector('.v-expansion-panel')).toHaveTextContent('第 2 季'))

    staleSeasons.resolve([createMediaSeason({ season_number: 3 })])
    await staleResponseReturned.promise
    await flushPromises()

    expect(screen.getByText(/当前：剪辑组 B/)).toBeInTheDocument()
    expect(container.querySelector('.v-expansion-panel')).toHaveTextContent('第 2 季')
    expect(container.querySelector('.v-expansion-panel')).not.toHaveTextContent('第 3 季')
  })

  it('ignores stale missing and remote-exists responses from the previous group', async () => {
    const media = createSubscribeTv({
      season_info: [createMediaSeason({ episode_count: 2, season_number: 1 })],
      title: '剧集组状态竞态剧',
      tmdb_id: 8712,
    })
    const groups = [
      { episode_count: 2, group_count: 1, id: 'group-a', name: '剪辑组 A' },
      { episode_count: 2, group_count: 1, id: 'group-b', name: '剪辑组 B' },
    ]
    const staleMissing = createDeferred<NotExistMediaInfo[]>()
    const staleRemoteExists = createDeferred<Record<number, number[]>>()
    const staleMissingRequest = vi.fn()
    const staleRemoteRequest = vi.fn()
    const staleMissingReturned = createDeferred<void>()
    const staleRemoteReturned = createDeferred<void>()
    const { container } = await renderDetail({
      episodeGroups: groups,
      media,
      setupHandlers: () => {
        server.use(
          mediaGroupSeasonsHandler('group-a', [createMediaSeason({ episode_count: 2, season_number: 1 })]),
          mediaGroupSeasonsHandler('group-b', [createMediaSeason({ episode_count: 2, season_number: 1 })]),
          http.post(mediaApiUrls.notExists, async ({ request }) => {
            const payload = (await request.json()) as Record<string, unknown>
            if (payload.episode_group === 'group-a') {
              staleMissingRequest()
              const response = await staleMissing.promise
              staleMissingReturned.resolve()
              return HttpResponse.json(response)
            }
            if (payload.episode_group === 'group-b') {
              return HttpResponse.json([createNotExistMediaInfo({ episodes: [2], season: 1, total_episode: 2 })])
            }
            return HttpResponse.json([])
          }),
          http.post(mediaApiUrls.existsRemote, async ({ request }) => {
            const payload = (await request.json()) as Record<string, unknown>
            if (payload.episode_group === 'group-a') {
              staleRemoteRequest()
              const response = await staleRemoteExists.promise
              staleRemoteReturned.resolve()
              return HttpResponse.json(response)
            }
            return HttpResponse.json(payload.episode_group === 'group-b' ? { 1: [2] } : {})
          }),
          http.get(new URL('tmdb/8712/1', API_BASE_URL).href, ({ request }) => {
            const group = new URL(request.url).searchParams.get('episode_group')
            return HttpResponse.json([
              createTmdbEpisode({ episode_number: 1, name: `${group} 第一集`, season_number: 1 }),
              createTmdbEpisode({ episode_number: 2, name: `${group} 第二集`, season_number: 1 }),
            ])
          }),
        )
      },
      type: '电视剧',
    })

    await fireEvent.click(screen.getByRole('button', { name: /剪辑组 A/ }))
    await waitFor(() => expect(container.querySelector('.v-expansion-panel-title')).toBeInTheDocument())
    await fireEvent.click(container.querySelector('.v-expansion-panel-title') as HTMLElement)
    await waitFor(() => {
      expect(staleMissingRequest).toHaveBeenCalledOnce()
      expect(staleRemoteRequest).toHaveBeenCalledOnce()
    })

    await fireEvent.click(screen.getByRole('button', { name: /剪辑组 B/ }))
    await waitFor(() => expect(container.querySelector('.v-expansion-panel-title')).toBeInTheDocument())
    await fireEvent.click(container.querySelector('.v-expansion-panel-title') as HTMLElement)
    const currentSecondEpisode = await screen.findByRole('heading', { name: '2 - group-b 第二集' })
    await waitFor(() =>
      expect(currentSecondEpisode.closest('.episode-info')).toContainElement(
        container.querySelector('.episode-exists-badge'),
      ),
    )
    await waitFor(() => expect(container.querySelector('.v-expansion-panel')).toHaveTextContent('部分缺失'))

    staleMissing.resolve([createNotExistMediaInfo({ episodes: [], season: 1, total_episode: 2 })])
    staleRemoteExists.resolve({ 1: [1] })
    await Promise.all([staleMissingReturned.promise, staleRemoteReturned.promise])
    await flushPromises()

    expect(screen.getByText(/当前：剪辑组 B/)).toBeInTheDocument()
    expect(container.querySelector('.v-expansion-panel')).toHaveTextContent('部分缺失')
    expect(currentSecondEpisode.closest('.episode-info')?.querySelector('.episode-exists-badge')).toBeInTheDocument()
    expect(
      screen
        .getByRole('heading', { name: '1 - group-b 第一集' })
        .closest('.episode-info')
        ?.querySelector('.episode-exists-badge'),
    ).not.toBeInTheDocument()
  })

  it('ignores a stale season-episode response from the previously selected group', async () => {
    const media = createSubscribeTv({
      season_info: [createMediaSeason({ season_number: 1 })],
      title: '剧集组竞态剧',
      tmdb_id: 8708,
    })
    const groups = [
      { episode_count: 8, group_count: 1, id: 'group-a', name: '剪辑组 A' },
      { episode_count: 9, group_count: 1, id: 'group-b', name: '剪辑组 B' },
    ]
    const staleEpisodes = createDeferred<TmdbEpisode[]>()
    const staleResponseReturned = createDeferred<void>()
    const staleRequest = vi.fn()
    const currentRequest = vi.fn()
    server.use(
      mediaGroupSeasonsHandler('group-a', [createMediaSeason({ season_number: 1 })]),
      mediaGroupSeasonsHandler('group-b', [createMediaSeason({ season_number: 1 })]),
    )
    const { container } = await renderDetail({ episodeGroups: groups, media, type: '电视剧' })
    server.use(
      mediaRemoteExistsHandler({}),
      http.get(new URL('tmdb/8708/1', API_BASE_URL).href, async ({ request }) => {
        const group = new URL(request.url).searchParams.get('episode_group')
        if (group === 'group-a') {
          staleRequest()
          const response = await staleEpisodes.promise
          staleResponseReturned.resolve()
          return HttpResponse.json(response)
        }
        currentRequest()
        return HttpResponse.json([createTmdbEpisode({ episode_number: 1, name: 'B 组第一集', season_number: 1 })])
      }),
    )

    await fireEvent.click(screen.getByRole('button', { name: /剪辑组 A/ }))
    await waitFor(() => expect(screen.getByText(/当前：剪辑组 A/)).toBeInTheDocument())
    await waitFor(() => expect(container.querySelector('.v-expansion-panel-title')).toBeInTheDocument())
    await fireEvent.click(container.querySelector('.v-expansion-panel-title') as HTMLElement)
    await waitFor(() => expect(staleRequest).toHaveBeenCalledOnce())

    await fireEvent.click(screen.getByRole('button', { name: /剪辑组 B/ }))
    await waitFor(() => expect(screen.getByText(/当前：剪辑组 B/)).toBeInTheDocument())
    await waitFor(() => expect(container.querySelector('.v-expansion-panel-title')).toBeInTheDocument())
    await fireEvent.click(container.querySelector('.v-expansion-panel-title') as HTMLElement)
    expect(await screen.findByRole('heading', { name: '1 - B 组第一集' })).toBeInTheDocument()
    expect(currentRequest).toHaveBeenCalledOnce()

    staleEpisodes.resolve([createTmdbEpisode({ episode_number: 1, name: 'A 组旧响应', season_number: 1 })])
    await staleResponseReturned.promise
    await flushPromises()

    expect(screen.queryByText('A 组旧响应')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '1 - B 组第一集' })).toBeInTheDocument()
  })

  it('renders empty state when mediaid or type is missing and ignores obsolete detail responses or errors', async () => {
    const missingPropView = await renderWithProviders(MediaDetailView, {
      props: { mediaid: '', title: '空ID', type: '电影', year: '2026' },
    })
    expect(await screen.findByText('未识别到媒体信息。')).toBeInTheDocument()
    missingPropView.unmount()

    // 1. 过期成功响应被代际锁忽略
    const staleDetail = createDeferred<MediaInfo>()
    const staleReturned = createDeferred<void>()
    server.use(
      http.get(new URL('media/tmdb:8901', API_BASE_URL).href, async () => {
        const res = await staleDetail.promise
        staleReturned.resolve()
        return HttpResponse.json(res)
      }),
      mediaDetailsHandler('tmdb:8902', createMediaInfo({ title: '最新目标电影', tmdb_id: 8902, type: '电影' })),
      mediaExistsHandler({ data: { item: {} }, success: false }),
      querySubscribeByMediaHandler('tmdb:8902', {}),
    )

    const raceView = await renderWithProviders(MediaDetailView, {
      props: { mediaid: 'tmdb:8901', title: '过期电影', type: '电影', year: '2026' },
      global: {
        stubs: {
          MediaCardSlideView: MediaCardSlideViewStub,
          PersonCardSlideView: PersonCardSlideViewStub,
          SearchSiteDialog: SearchSiteDialogStub,
          VImg: VImgStub,
        },
      },
    })
    await raceView.rerender({ mediaid: 'tmdb:8902', title: '最新目标电影', type: '电影', year: '2026' })
    expect(await screen.findByRole('heading', { name: /最新目标电影/ })).toBeInTheDocument()

    staleDetail.resolve(createMediaInfo({ title: '不该显示的过期电影', tmdb_id: 8901, type: '电影' }))
    await staleReturned.promise
    await flushPromises()
    expect(screen.queryByText('不该显示的过期电影')).not.toBeInTheDocument()

    // 2. 过期失败响应被代际锁忽略
    const staleErrorGate = createDeferred<void>()
    const staleErrorReturned = createDeferred<void>()
    server.use(
      http.get(new URL('media/tmdb:8903', API_BASE_URL).href, async () => {
        await staleErrorGate.promise
        staleErrorReturned.resolve()
        return HttpResponse.json({ message: 'failed' }, { status: 500 })
      }),
      mediaDetailsHandler('tmdb:8904', createMediaInfo({ title: '错误竞态目标片', tmdb_id: 8904, type: '电影' })),
      querySubscribeByMediaHandler('tmdb:8904', {}),
    )
    await raceView.rerender({ mediaid: 'tmdb:8903', title: '将失败的旧片', type: '电影', year: '2026' })
    await raceView.rerender({ mediaid: 'tmdb:8904', title: '错误竞态目标片', type: '电影', year: '2026' })
    expect(await screen.findByRole('heading', { name: /错误竞态目标片/ })).toBeInTheDocument()

    staleErrorGate.resolve()
    await staleErrorReturned.promise
    await flushPromises()
    expect(screen.queryByText('无法获取到媒体信息，请检查网络连接。')).not.toBeInTheDocument()
  })

  it('unsubscribes movies and TV seasons, opens mode dialog for in-library anime, and matches multi-source subscribes', async () => {
    mocks.confirm.mockResolvedValue(true)

    // 1. 已订阅电影点击主按钮执行取消订阅
    const subMovie = createMediaInfo({ title: '待取消电影', tmdb_id: 8911, type: '电影' })
    const deleteMovieReq = vi.fn()
    server.use(
      http.delete(new URL('subscribe/media/tmdb:8911', API_BASE_URL).href, () => {
        deleteMovieReq()
        return HttpResponse.json({ success: true })
      }),
    )
    const movieView = await renderDetail({
      media: subMovie,
      movieSubscribe: createSubscribe({ id: 28911, tmdbid: 8911, type: '电影' }),
    })
    await fireEvent.click(await screen.findByRole('button', { name: /已订阅/ }))
    await waitFor(() => expect(deleteMovieReq).toHaveBeenCalledOnce())
    movieView.unmount()

    // 2. 已入库非电影/非电视剧媒体（如“动漫”）点击主订阅按钮触发 isExists 与 primarySeason 打开模式选择弹窗
    mocks.openSharedDialog.mockClear()
    const inLibAnime = createMediaInfo({ season: 1, title: '已入库剧场动漫', tmdb_id: 8912, type: '动漫' })
    server.use(
      mediaDetailsHandler('tmdb:8912', inLibAnime),
      mediaExistsHandler({ data: { item: { id: 'lib-8912' } }, success: true }),
    )
    const animeView = await renderWithProviders(MediaDetailView, {
      props: { mediaid: 'tmdb:8912', title: inLibAnime.title, type: '动漫', year: inLibAnime.year },
      global: {
        stubs: {
          MediaCardSlideView: MediaCardSlideViewStub,
          PersonCardSlideView: PersonCardSlideViewStub,
          SearchSiteDialog: SearchSiteDialogStub,
          VImg: VImgStub,
        },
      },
    })
    expect(await screen.findByText('已入库')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: /^订阅$/ }))
    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    animeView.unmount()

    // 3. 结构化 themoviedb / mediaid / anilistid 订阅匹配 + 单季取消订阅
    const deleteSeasonReq = vi.fn()
    const tvMedia = createSubscribeTv({
      season_info: [createMediaSeason({ season_number: 1 }), createMediaSeason({ season_number: 2 })],
      title: '多源季订阅匹配剧',
      tmdb_id: 8913,
    })
    server.use(
      http.delete(new URL('subscribe/media/tmdb:8913', API_BASE_URL).href, () => {
        deleteSeasonReq()
        return HttpResponse.json({ success: true })
      }),
    )
    const tvView = await renderDetail({
      media: tvMedia,
      subscribes: [
        createSubscribe({ media_id: '8913', media_source: 'themoviedb', season: 1, tmdbid: undefined, type: '电视剧' }),
        createSubscribe({ mediaid: 'tmdb:8913', season: 2, tmdbid: undefined, type: '电视剧' }),
      ],
      type: '电视剧',
    })
    expect(await screen.findByRole('button', { name: /已全部订阅/ })).toBeInTheDocument()
    const firstSeasonBtn = tvView.container.querySelector('.v-expansion-panel .v-btn') as HTMLElement
    await fireEvent.click(firstSeasonBtn)
    await waitFor(() => expect(deleteSeasonReq).toHaveBeenCalledOnce())
    tvView.unmount()

    // 4. AniList 季订阅列表匹配
    const anilistTv = createSubscribeTv({
      anilist_id: 199001,
      season_info: [createMediaSeason({ season_number: 1 })],
      source: 'anilist',
      title: 'AniList 季匹配剧',
      tmdb_id: undefined,
    })
    await renderDetail({
      media: anilistTv,
      mediaId: 'anilist:199001',
      subscribes: [createSubscribe({ anilistid: 199001, season: 1, tmdbid: undefined, type: '电视剧' })],
      type: '电视剧',
    })
    expect(await screen.findByRole('button', { name: /已全部订阅/ })).toBeInTheDocument()
  })

  it('covers crew deduplication/fallback roles, no-backdrop stage, standalone blocks, and episode API errors', async () => {
    // 1. TMDB 无海报背景、无简介、无年份、零评分、未知状态、original_name/first_air_date/original_language 与主创去重/分隔符
    const sparseTmdb = createSubscribeTv({
      backdrop_path: '',
      directors: [
        { id: 1, job: 'Director', name: '' },
        { id: 2, job: undefined, name: '主创甲' },
        { id: 2, job: undefined, name: '主创甲' },
        { id: 3, job: undefined, name: '主创乙' },
        { id: 4, job: 'VFX Supervisor', name: '视效丙' },
      ] as unknown as never,
      first_air_date: '2026-01-15',
      original_language: 'ja',
      original_name: 'Sparse Original TV',
      original_title: undefined,
      overview: '',
      poster_path: '',
      season_info: [createMediaSeason({ season_number: undefined as unknown as number })],
      status: 'Special Edition',
      title: '极简无背景剧集',
      tmdb_id: 8921,
      vote_average: 0,
      year: '',
    })
    const group = { episode_count: 6, group_count: 1, id: 'err-group', name: '异常组' }
    const sparseView = await renderDetail({
      episodeGroups: [group],
      media: sparseTmdb,
      setupHandlers: () => {
        server.use(
          http.get(new URL('tmdb/8921/0', API_BASE_URL).href, () =>
            HttpResponse.json({ message: 'episode err' }, { status: 500 }),
          ),
          http.post(mediaApiUrls.existsRemote, () => HttpResponse.json({ message: 'remote err' }, { status: 500 })),
          http.get(mediaApiUrls.groupSeasons('err-group'), () =>
            HttpResponse.json({ message: 'group err' }, { status: 500 }),
          ),
        )
      },
      type: '电视剧',
    })

    expect(await screen.findByRole('heading', { name: '极简无背景剧集' })).toBeInTheDocument()
    expect(sparseView.container.querySelector('.media-hero-stage--no-backdrop')).not.toBeNull()
    expect(sparseView.container.querySelector('ul.media-crew.media-crew--standalone')).not.toBeNull()
    expect(sparseView.container.querySelector('.crew-sep')).not.toBeNull()
    expect(screen.getByText('Special Edition')).toBeInTheDocument()
    expect(screen.getByText('Sparse Original TV')).toBeInTheDocument()
    expect(screen.getByText('ja')).toBeInTheDocument()
    expect(screen.getByText('2026-01-15')).toBeInTheDocument()

    // 展开季面板触发季集与远程存在接口 500 容错分支，再切换到加载失败的剧集组
    await fireEvent.click(sparseView.container.querySelector('.v-expansion-panel-title') as HTMLElement)
    await flushPromises()
    await fireEvent.click(screen.getByRole('button', { name: /异常组/ }))
    await flushPromises()
    sparseView.unmount()

    // 2. 豆瓣无简介主创去重、无 roles 默认“主创”、模糊职位优先级（“联合导演”）与无 url 回退
    const doubanCrewMedia = createMediaInfo({
      backdrop_path: '',
      directors: [
        { id: '0', name: '' },
        { id: '1', name: '独立主创', roles: [], url: undefined },
        { id: '1', name: '独立主创', roles: [], url: undefined },
        { id: '2', name: '甲导演', roles: ['联合导演'], url: 'https://movie.douban.com/celebrity/10' },
      ] as unknown as never,
      douban_id: 'db-8922',
      overview: '',
      poster_path: '',
      title: '豆瓣极简主创片',
      tmdb_id: undefined,
      type: '电影',
      vote_average: 8.8,
    })
    const doubanView = await renderDetail({ media: doubanCrewMedia, mediaId: 'douban:db-8922', type: '电影' })
    expect(await screen.findByRole('heading', { name: /豆瓣极简主创片/ })).toBeInTheDocument()
    const roles = Array.from(doubanView.container.querySelectorAll('ul.media-crew .crew-role')).map(el =>
      el.textContent?.trim(),
    )
    expect(roles).toEqual(['联合导演', '主创'])
    expect(screen.getByText('独立主创').closest('a')).toHaveAttribute('href', '')
  })
})
