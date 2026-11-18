import DoubanView from '@/views/discover/DoubanView.vue'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMediaListHarness, latestMediaListRequest } from './sourceViewTestUtils'

describe('DoubanView', () => {
  let mediaList: ReturnType<typeof createMediaListHarness>

  beforeEach(() => {
    mediaList = createMediaListHarness()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function renderView() {
    return renderWithProviders(DoubanView, {
      global: {
        stubs: {
          MediaCardListView: mediaList.stub,
        },
      },
    })
  }

  it('starts with the frontend sort default and builds recent years in descending order before decades', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-18T12:00:00+08:00'))

    const { container } = await renderView()

    expect(latestMediaListRequest(mediaList)).toEqual({
      apipath: 'discover/douban_movies',
      params: {
        sort: 'U',
        tags: '',
      },
    })
    const yearRow = container.querySelectorAll('.discover-filter-row')[4]
    const renderedYears = [...(yearRow?.querySelectorAll('.discover-filter-chip') ?? [])].map(el =>
      el.textContent?.trim(),
    )
    expect(renderedYears.slice(0, 7)).toEqual(['2026', '2025', '2024', '2023', '2022', '2021', '2020年代'])
    expect(screen.queryByText('2020')).not.toBeInTheDocument()
  })

  it('keeps tags in genre-zone-year order across selection, replacement, and clearing', async () => {
    const user = userEvent.setup()
    await renderView()

    await user.click(screen.getByText('2020年代'))
    await user.click(screen.getByText('日本'))
    await user.click(screen.getByText('喜剧'))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList)).toEqual({
        apipath: 'discover/douban_movies',
        params: {
          sort: 'U',
          tags: '喜剧,日本,2020年代',
        },
      })
    })

    await user.click(screen.getByText('动作'))
    await user.click(screen.getByText('日本'))
    await user.click(screen.getByText('2020年代'))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList).params.tags).toBe('动作')
    })

    await user.click(screen.getByText('动作'))
    await waitFor(() => expect(latestMediaListRequest(mediaList).params.tags).toBe(''))
  })

  it('preserves filters across type changes and enforces mandatory type and sort chip groups', async () => {
    const user = userEvent.setup()
    await renderView()

    await user.click(screen.getByText('高分优先'))
    await user.click(screen.getByText('喜剧'))
    await user.click(screen.getByText('电视剧'))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList)).toEqual({
        apipath: 'discover/douban_tvs',
        params: {
          sort: 'S',
          tags: '喜剧',
        },
      })
    })

    await user.click(screen.getByText('电视剧'))
    await user.click(screen.getByText('高分优先'))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList)).toEqual({
        apipath: 'discover/douban_tvs',
        params: {
          sort: 'S',
          tags: '喜剧',
        },
      })
    })
  })
})
