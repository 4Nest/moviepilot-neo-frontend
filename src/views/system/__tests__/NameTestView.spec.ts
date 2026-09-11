import { resetNameTestSession } from '@/composables/useNameTestSession'
import NameTestView from '@/views/system/NameTestView.vue'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: mocks.apiGet,
    post: mocks.apiPost,
  },
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
  }),
}))

interface RecognizedMedia {
  category?: string
  media_id: string
  source: string
  title: string
  type: string
  year: string
}

async function renderRecognizedMedia(media: RecognizedMedia, metaOverrides: Record<string, unknown> = {}) {
  mocks.apiGet.mockResolvedValueOnce({
    media_info: media,
    meta_info: {
      apply_words: [],
      name: media.title,
      org_string: 'Test.Release',
      title: 'Test.Release',
      ...metaOverrides,
    },
    torrent_info: {},
  })

  const result = await renderWithProviders(NameTestView, {
    initialState: {
      globalSettings: {
        data: { RECOGNIZE_SOURCE: 'themoviedb' },
      },
    },
  })
  const user = userEvent.setup()

  await user.type(screen.getByLabelText('标题'), 'Test.Release')
  await user.click(screen.getByRole('button', { name: '识别' }))
  await screen.findByText(new RegExp(`ID：${media.media_id}`))

  return { ...result, user }
}

describe('NameTestView media identity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    resetNameTestSession()
  })

  it.each([
    [
      'TheMovieDb',
      { media_id: '271016', source: 'themoviedb', title: '测试剧集', type: '电视剧', year: '2026' },
      'https://www.themoviedb.org/tv/271016',
      'TMDBID：271016',
    ],
    [
      'Douban',
      { media_id: '1295644', source: 'douban', title: '测试电影', type: '电影', year: '1994' },
      'https://movie.douban.com/subject/1295644',
      '豆瓣ID：1295644',
    ],
    [
      'Bangumi',
      { media_id: '485', source: 'bangumi', title: '测试动画', type: '电视剧', year: '2026' },
      'https://bgm.tv/subject/485',
      'BGMID：485',
    ],
    [
      'AniList',
      { media_id: '154587', source: 'anilist', title: '测试番剧', type: '电视剧', year: '2026' },
      'https://anilist.co/anime/154587',
      'AniListID：154587',
    ],
  ])('媒体 ID 徽章跳转 %s 官方页面', async (_sourceLabel, media, expectedLink, expectedBadgeText) => {
    await renderRecognizedMedia(media)

    // 媒体 ID 徽章独立样式展示「来源ID：值」，点击跳转媒体源官方页面
    const idLink = screen.getByText(expectedBadgeText as string).closest('a')
    expect(idLink).toHaveClass('media-id-badge')
    expect(idLink).toHaveAttribute('href', expectedLink)
    expect(idLink).toHaveAttribute('target', '_blank')
    expect(idLink).toHaveAttribute('rel', 'noopener noreferrer')

    // 链路步骤中不再展示媒体 ID 与识别数据源
    expect(screen.queryByText('媒体 ID')).not.toBeInTheDocument()
    expect(screen.queryByText('识别数据源')).not.toBeInTheDocument()
  })

  it('结果头部突出展示名称（年份）与季集', async () => {
    const { container } = await renderRecognizedMedia(
      { category: '动漫', media_id: '485', source: 'bangumi', title: '测试动画', type: '电视剧', year: '2026' },
      { season_episode: 'S02E12', overview: '不应展示的简介' },
    )

    const hero = container.querySelector('.result-hero')
    expect(hero).toHaveTextContent('测试动画（2026）')
    expect(hero).toHaveTextContent('S02E12')
    expect(hero).toHaveTextContent('电视剧 · 动漫')
    // 简介不再展示
    expect(hero).not.toHaveTextContent('不应展示的简介')
  })

  it('识别词生效时在原始标题下方展示识别标题', async () => {
    await renderRecognizedMedia(
      { media_id: '271016', source: 'themoviedb', title: '测试剧集', type: '电视剧', year: '2026' },
      {
        apply_words: ['False Love => '],
        org_string: 'Nisekoi S02E12',
        title: 'Nisekoi False Love S02E12',
      },
    )

    // 原始标题为识别词处理前的输入，识别标题为处理后的结果
    expect(screen.getByText('原始标题').closest('.pipeline-step')).toHaveTextContent('Nisekoi False Love S02E12')
    expect(screen.getByText('识别标题').closest('.pipeline-step')).toHaveTextContent('Nisekoi S02E12')
  })

  it('未应用识别词时不展示识别标题步骤', async () => {
    await renderRecognizedMedia({
      media_id: '271016',
      source: 'themoviedb',
      title: '测试剧集',
      type: '电视剧',
      year: '2026',
    })

    expect(screen.queryByText('识别标题')).not.toBeInTheDocument()
    expect(screen.getByText('原始标题').closest('.pipeline-step')).toHaveTextContent('Test.Release')
  })

  it('弹窗关闭重开后保留上次编辑的表单内容', async () => {
    const first = await renderWithProviders(NameTestView, {
      initialState: {
        globalSettings: {
          data: { RECOGNIZE_SOURCE: 'themoviedb' },
        },
      },
    })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('标题'), 'Nisekoi.False.Love.S02E12')
    await user.type(screen.getByLabelText('副标题'), 'DIY 中字')
    await user.type(screen.getByLabelText('识别词'), 'False Love => ')
    first.unmount()

    // 重新打开（重新挂载）后表单内容保留
    await renderWithProviders(NameTestView, {
      initialState: {
        globalSettings: {
          data: { RECOGNIZE_SOURCE: 'themoviedb' },
        },
      },
    })
    expect(screen.getByLabelText('标题')).toHaveValue('Nisekoi.False.Love.S02E12')
    expect(screen.getByLabelText('副标题')).toHaveValue('DIY 中字')
    expect(screen.getByLabelText('识别词')).toHaveValue('False Love => ')
  })
})
