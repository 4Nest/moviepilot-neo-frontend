import { resetNameTestSession } from '@/composables/useNameTestSession'
import NameTestView from '@/views/system/NameTestView.vue'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  copyToClipboard: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}))

vi.mock('@/@core/utils/navigator', () => ({
  copyToClipboard: (...args: unknown[]) => mocks.copyToClipboard(...args),
}))

vi.mock('@/api', () => ({
  default: {
    get: mocks.apiGet,
    post: mocks.apiPost,
  },
  getApiErrorMessage: (error: unknown) => (error instanceof Error && error.message ? error.message : undefined),
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

  it('识别失败时不发起整理预览请求', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      meta_info: {
        apply_words: [],
        org_string: 'Unknown.Release',
        title: 'Unknown.Release',
      },
      torrent_info: {},
    })

    await renderWithProviders(NameTestView, {
      initialState: {
        globalSettings: {
          data: { RECOGNIZE_SOURCE: 'themoviedb' },
        },
      },
    })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('标题'), 'Unknown.Release')
    await user.click(screen.getByRole('button', { name: '识别' }))

    expect(await screen.findByText('未识别到媒体')).toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('transfer-preview')).not.toBeInTheDocument()
  })

  it('fetches and displays transfer preview details and copies the full target path', async () => {
    mocks.copyToClipboard.mockResolvedValueOnce(true)
    mocks.apiGet
      .mockResolvedValueOnce({
        media_info: {
          category: '外语电影',
          media_id: '10376',
          source: 'themoviedb',
          title: '海上钢琴师',
          type: '电影',
          year: '1998',
        },
        meta_info: {
          apply_words: [],
          name: '海上钢琴师',
          org_string: 'The.Legend.of.1900.1998.1080p.BluRay.mkv',
          title: 'The.Legend.of.1900.1998.1080p.BluRay.mkv',
        },
        torrent_info: {},
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          category: '外语电影',
          target_dir: '海上钢琴师 (1998) {tmdbid=10376}',
          file_name: '海上钢琴师 (1998) - 1080p.mkv',
          rename_path: '海上钢琴师 (1998) {tmdbid=10376}/海上钢琴师 (1998) - 1080p.mkv',
          library_path: '/media/电影/外语电影',
          full_path: '/media/电影/外语电影/海上钢琴师 (1998) {tmdbid=10376}/海上钢琴师 (1998) - 1080p.mkv',
        },
      })

    await renderWithProviders(NameTestView, {
      initialState: {
        globalSettings: {
          data: { RECOGNIZE_SOURCE: 'themoviedb' },
        },
      },
    })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('标题'), 'The.Legend.of.1900.1998.1080p.BluRay.mkv')
    await user.type(screen.getByLabelText('副标题'), '海上钢琴师')
    await user.type(screen.getByLabelText('识别词'), '屏蔽词')
    await user.click(screen.getByRole('button', { name: '识别' }))

    const previewSection = await screen.findByTestId('transfer-preview')
    expect(previewSection).toHaveTextContent('分类路径外语电影')
    expect(previewSection).toHaveTextContent('目标目录海上钢琴师 (1998) {tmdbid=10376}')
    expect(previewSection).toHaveTextContent('最终文件名海上钢琴师 (1998) - 1080p.mkv')
    expect(previewSection).toHaveTextContent(
      '完整目标路径/media/电影/外语电影/海上钢琴师 (1998) {tmdbid=10376}/海上钢琴师 (1998) - 1080p.mkv',
    )

    expect(mocks.apiGet).toHaveBeenNthCalledWith(2, 'transfer/name/preview', {
      params: {
        title: 'The.Legend.of.1900.1998.1080p.BluRay.mkv',
        subtitle: '海上钢琴师',
        custom_words: '屏蔽词',
        media_source: 'themoviedb',
        media_id: '10376',
        mtype: '电影',
      },
    })

    await user.click(screen.getByRole('button', { name: '复制路径' }))
    expect(mocks.copyToClipboard).toHaveBeenCalledWith(
      '/media/电影/外语电影/海上钢琴师 (1998) {tmdbid=10376}/海上钢琴师 (1998) - 1080p.mkv',
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('整理路径已复制')
  })

  it('shows relative path and uncategorized hint when no library directory matches', async () => {
    mocks.apiGet
      .mockResolvedValueOnce({
        media_info: {
          media_id: '271016',
          source: 'themoviedb',
          title: '测试剧集',
          type: '电视剧',
          year: '2026',
        },
        meta_info: {
          apply_words: [],
          name: '测试剧集',
          org_string: 'Test.Show.S01E01.1080p',
          season_episode: 'S01 E01',
          title: 'Test.Show.S01E01.1080p',
        },
        torrent_info: {},
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          category: null,
          target_dir: '测试剧集 (2026)',
          file_name: '测试剧集 - S01E01',
          rename_path: '测试剧集 (2026)/Season 1/测试剧集 - S01E01',
          library_path: null,
          full_path: null,
        },
      })

    await renderWithProviders(NameTestView, {
      initialState: {
        globalSettings: {
          data: { RECOGNIZE_SOURCE: 'themoviedb' },
        },
      },
    })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('标题'), 'Test.Show.S01E01.1080p')
    await user.click(screen.getByRole('button', { name: '识别' }))

    const previewSection = await screen.findByTestId('transfer-preview')
    expect(previewSection).toHaveTextContent('分类路径未命中分类')
    expect(previewSection).toHaveTextContent('目标目录测试剧集 (2026)')
    expect(previewSection).toHaveTextContent('最终文件名测试剧集 - S01E01')
    expect(previewSection).toHaveTextContent('相对路径测试剧集 (2026)/Season 1/测试剧集 - S01E01')
  })

  it('keeps recognition results visible when transfer preview fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.apiGet
      .mockResolvedValueOnce({
        media_info: {
          media_id: '10376',
          source: 'themoviedb',
          title: '海上钢琴师',
          type: '电影',
          year: '1998',
        },
        meta_info: {
          apply_words: [],
          name: '海上钢琴师',
          org_string: 'The.Legend.of.1900.1998',
          title: 'The.Legend.of.1900.1998',
        },
        torrent_info: {},
      })
      .mockResolvedValueOnce({
        success: false,
        message: '重命名模板渲染失败：模板语法错误',
        data: null,
      })

    try {
      await renderWithProviders(NameTestView, {
        initialState: {
          globalSettings: {
            data: { RECOGNIZE_SOURCE: 'themoviedb' },
          },
        },
      })
      const user = userEvent.setup()

      await user.type(screen.getByLabelText('标题'), 'The.Legend.of.1900.1998')
      await user.click(screen.getByRole('button', { name: '识别' }))

      await screen.findByText('TMDBID：10376')
      expect(await screen.findByText('重命名模板渲染失败：模板语法错误')).toBeInTheDocument()
      expect(screen.getAllByText(/海上钢琴师/)).not.toHaveLength(0)
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('ignores stale transfer preview responses from an earlier recognition', async () => {
    let resolveFirstPreview: ((value: unknown) => void) | undefined
    const firstPreviewPromise = new Promise(resolve => {
      resolveFirstPreview = resolve
    })

    mocks.apiGet
      .mockResolvedValueOnce({
        media_info: {
          media_id: '10376',
          source: 'themoviedb',
          title: '海上钢琴师',
          type: '电影',
          year: '1998',
        },
        meta_info: {
          apply_words: [],
          name: '海上钢琴师',
          org_string: 'First.Movie.1998',
          title: 'First.Movie.1998',
        },
        torrent_info: {},
      })
      .mockImplementationOnce(() => firstPreviewPromise)
      .mockResolvedValueOnce({
        media_info: {
          media_id: '27205',
          source: 'themoviedb',
          title: '盗梦空间',
          type: '电影',
          year: '2010',
        },
        meta_info: {
          apply_words: [],
          name: '盗梦空间',
          org_string: 'Second.Movie.2010',
          title: 'Second.Movie.2010',
        },
        torrent_info: {},
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          category: '外语电影',
          target_dir: '盗梦空间 (2010) {tmdbid=27205}',
          file_name: '盗梦空间 (2010).mkv',
          rename_path: '盗梦空间 (2010) {tmdbid=27205}/盗梦空间 (2010).mkv',
          library_path: '/media/电影/外语电影',
          full_path: '/media/电影/外语电影/盗梦空间 (2010) {tmdbid=27205}/盗梦空间 (2010).mkv',
        },
      })

    await renderWithProviders(NameTestView, {
      initialState: {
        globalSettings: {
          data: { RECOGNIZE_SOURCE: 'themoviedb' },
        },
      },
    })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('标题'), 'First.Movie.1998')
    await user.click(screen.getByRole('button', { name: '识别' }))
    await screen.findByText('TMDBID：10376')

    await user.clear(screen.getByLabelText('标题'))
    await user.type(screen.getByLabelText('标题'), 'Second.Movie.2010')
    await user.click(screen.getByRole('button', { name: '重新识别' }))

    const previewSection = await screen.findByTestId('transfer-preview')
    expect(previewSection).toHaveTextContent('目标目录盗梦空间 (2010) {tmdbid=27205}')

    resolveFirstPreview?.({
      success: true,
      data: {
        category: '外语电影',
        target_dir: '海上钢琴师 (1998) {tmdbid=10376}',
        file_name: '海上钢琴师 (1998).mkv',
        rename_path: '海上钢琴师 (1998) {tmdbid=10376}/海上钢琴师 (1998).mkv',
      },
    })
    await Promise.resolve()

    expect(screen.getByTestId('transfer-preview')).toHaveTextContent('目标目录盗梦空间 (2010) {tmdbid=27205}')
    expect(screen.getByTestId('transfer-preview')).not.toHaveTextContent('海上钢琴师 (1998) {tmdbid=10376}')
  })
})
