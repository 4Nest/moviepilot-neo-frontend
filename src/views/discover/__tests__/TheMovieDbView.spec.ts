import TheMovieDbView from '@/views/discover/TheMovieDbView.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMediaListHarness, latestMediaListRequest } from './sourceViewTestUtils'

const INITIAL_PARAMS = {
  sort_by: 'popularity.desc',
  with_genres: '',
  with_original_language: '',
  with_keywords: '',
  with_watch_providers: '',
  vote_average: 0,
  vote_count: 10,
  release_date: '',
}

describe('TheMovieDbView', () => {
  let mediaList: ReturnType<typeof createMediaListHarness>

  beforeEach(() => {
    mediaList = createMediaListHarness()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function renderView() {
    return renderWithProviders(TheMovieDbView, {
      global: {
        stubs: {
          MediaCardListView: mediaList.stub,
        },
      },
    })
  }

  it('starts with the exact movie endpoint and filter contract', async () => {
    await renderView()

    expect(latestMediaListRequest(mediaList)).toEqual({
      apipath: 'discover/tmdb_movies',
      params: INITIAL_PARAMS,
    })
    expect(screen.queryByTestId('short-drama-toggle')).not.toBeInTheDocument()
    expect(screen.queryByTestId('discover-filter-reset')).not.toBeInTheDocument()
  })

  it('repairs media-specific sort, genre, and TV network values in both type directions', async () => {
    const user = userEvent.setup()
    await renderView()

    await user.click(screen.getByText('上映日期降序'))
    await user.click(screen.getByText('动作'))
    await user.click(screen.getByText('电视剧'))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList)).toEqual({
        apipath: 'discover/tmdb_tvs',
        params: {
          ...INITIAL_PARAMS,
          sort_by: 'popularity.desc',
          with_genres: '',
          exclude_short_drama: true,
        },
      })
    })

    // 电视剧模式下选择平台与短剧过滤，切回电影后自动清空 with_networks
    await user.click(screen.getByText('HBO / Max'))
    await waitFor(() => {
      expect(latestMediaListRequest(mediaList).params.with_networks).toBe('49|3186')
    })

    await user.click(screen.getByText('首播日期降序'))
    await user.click(screen.getByText('动作冒险'))
    await user.click(screen.getByText('电影'))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList)).toEqual({
        apipath: 'discover/tmdb_movies',
        params: {
          ...INITIAL_PARAMS,
          sort_by: 'popularity.desc',
          with_genres: '',
        },
      })
    })
  })

  it('supports single year, decade ranges, date-desc today cap, and include-upcoming chip', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-07-18T12:00:00+08:00'))
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    await renderView()

    // 单年 2025 -> 2025-01-01 ~ 2025-12-31
    await user.click(screen.getByText('2025'))
    await waitFor(() => {
      expect(latestMediaListRequest(mediaList).params).toMatchObject({
        release_date: '2025-01-01',
        release_date_lte: '2025-12-31',
      })
    })

    // 年代 2010s -> 2010-01-01 ~ 2019-12-31
    await user.click(screen.getByText('2010s'))
    await waitFor(() => {
      expect(latestMediaListRequest(mediaList).params).toMatchObject({
        release_date: '2010-01-01',
        release_date_lte: '2019-12-31',
      })
    })

    // 取消年份并切换到按上映日期降序：默认以今天日期作为 release_date_lte 拦截未来脏空壳
    await user.click(screen.getByText('2010s'))
    await user.click(screen.getByText('上映日期降序'))
    await waitFor(() => {
      expect(latestMediaListRequest(mediaList).params).toMatchObject({
        sort_by: 'release_date.desc',
        release_date: '',
        release_date_lte: '2026-07-18',
      })
    })

    // 点击「含未上映/待播」放开限制
    const upcomingChip = screen.getByTestId('tmdb-include-upcoming')
    await user.click(upcomingChip)
    await waitFor(() => {
      expect(latestMediaListRequest(mediaList).params.release_date_lte).toBeUndefined()
    })
  })

  it('toggles short drama filter in TV mode, resets active filters, and collapses secondary rows', async () => {
    const user = userEvent.setup()
    await renderView()

    await user.click(screen.getByText('电视剧'))
    const shortDramaBtn = await screen.findByTestId('short-drama-toggle')
    expect(shortDramaBtn).toHaveAttribute('aria-pressed', 'true')
    expect(latestMediaListRequest(mediaList).params.exclude_short_drama).toBe(true)

    await user.click(shortDramaBtn)
    await waitFor(() => {
      expect(shortDramaBtn).toHaveAttribute('aria-pressed', 'false')
      expect(latestMediaListRequest(mediaList).params.exclude_short_drama).toBe(false)
    })

    // 选择多个条件后显示已选计数徽章与重置按钮
    await user.click(screen.getByText('Netflix'))
    await user.click(screen.getByText('动画'))
    const resetBtn = await screen.findByTestId('discover-filter-reset')
    expect(resetBtn).toHaveTextContent('2')

    await user.click(resetBtn)
    await waitFor(() => {
      expect(latestMediaListRequest(mediaList)).toEqual({
        apipath: 'discover/tmdb_tvs',
        params: {
          ...INITIAL_PARAMS,
          exclude_short_drama: false,
        },
      })
    })
    expect(screen.queryByTestId('discover-filter-reset')).not.toBeInTheDocument()

    // 折叠与展开次要筛选行
    const collapseBtn = screen.getByTestId('discover-filter-collapse')
    expect(collapseBtn).toHaveTextContent('收起筛选')
    await user.click(collapseBtn)
    expect(collapseBtn).toHaveTextContent('展开筛选')
    expect(screen.getByText('Netflix')).not.toBeVisible()
  })

  it('preserves shared filters and the current numeric input types across type changes', async () => {
    const user = userEvent.setup()
    await renderView()

    await user.click(screen.getByText('评分降序'))
    await user.click(screen.getByText('动画'))
    await user.click(screen.getByText('中文'))
    screen.getByRole('slider').focus()
    await user.keyboard('{ArrowRight}'.repeat(7))
    const voteCount = screen.getByRole('spinbutton')
    await user.clear(voteCount)
    await user.type(voteCount, '25')
    await user.click(screen.getByText('电视剧'))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList)).toEqual({
        apipath: 'discover/tmdb_tvs',
        params: {
          ...INITIAL_PARAMS,
          sort_by: 'vote_average.desc',
          with_genres: '16',
          with_original_language: 'zh',
          vote_average: 7,
          vote_count: '25',
          exclude_short_drama: true,
        },
      })
    })
  })

  it('keeps mandatory type and sort selected while allowing optional chip filters to be deselected', async () => {
    const user = userEvent.setup()
    await renderView()

    expect(screen.getByRole('spinbutton', { name: '最低评价人数' })).toBeInTheDocument()

    await user.click(screen.getByText('电影'))
    await user.click(screen.getByText('评分降序'))
    await user.click(screen.getByText('评分降序'))
    await user.click(screen.getByText('动画'))
    await user.click(screen.getByText('动画'))
    await user.click(screen.getByText('中文'))
    await user.click(screen.getByText('中文'))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList)).toEqual({
        apipath: 'discover/tmdb_movies',
        params: {
          ...INITIAL_PARAMS,
          sort_by: 'vote_average.desc',
          with_genres: undefined,
          with_original_language: undefined,
        },
      })
    })
  })

  it('debounces vote_count by 400ms and remounts MediaCardListView only once when type switch normalizes incompatible filters', async () => {
    const user = userEvent.setup()
    await renderView()

    // 选中仅电影支持的排序与类型，再切换到电视剧，验证只重挂载 1 次而非双次频闪
    await user.click(screen.getByText('上映日期降序'))
    await user.click(screen.getByText('动作'))
    const countBeforeSwitch = mediaList.requests.length

    await user.click(screen.getByText('电视剧'))
    await waitFor(() => expect(latestMediaListRequest(mediaList).apipath).toBe('discover/tmdb_tvs'))
    expect(mediaList.requests.length - countBeforeSwitch).toBe(1)

    // 验证 vote_count 400ms 防抖
    vi.useFakeTimers()
    const voteCount = screen.getByRole('spinbutton')
    const countBeforeTyping = mediaList.requests.length
    await fireEvent.update(voteCount, '120')
    expect(mediaList.requests.length).toBe(countBeforeTyping)

    await vi.advanceTimersByTimeAsync(399)
    expect(mediaList.requests.length).toBe(countBeforeTyping)

    await vi.advanceTimersByTimeAsync(1)
    expect(mediaList.requests.length).toBe(countBeforeTyping + 1)
    expect(latestMediaListRequest(mediaList).params.vote_count).toBe('120')
  })
})
