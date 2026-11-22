import BangumiView from '@/views/discover/BangumiView.vue'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMediaListHarness, latestMediaListRequest } from './sourceViewTestUtils'

describe('BangumiView', () => {
  let mediaList: ReturnType<typeof createMediaListHarness>

  beforeEach(() => {
    mediaList = createMediaListHarness()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function renderView() {
    return renderWithProviders(BangumiView, {
      global: {
        stubs: {
          MediaCardListView: mediaList.stub,
        },
      },
    })
  }

  it('starts with number, string, and null values and builds ten years in descending order from a fixed clock', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-18T12:00:00+08:00'))

    const { container } = await renderView()

    expect(latestMediaListRequest(mediaList)).toEqual({
      apipath: 'discover/bangumi',
      params: {
        type: 2,
        cat: null,
        sort: 'rank',
        year: null,
      },
    })
    const expectedYears = ['2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017']
    const yearRow = container.querySelectorAll('.discover-filter-row')[2]
    const renderedYears = [...(yearRow?.querySelectorAll('.discover-filter-chip') ?? [])].map(el =>
      el.textContent?.trim(),
    )
    expect(renderedYears).toEqual(expectedYears)
    expect(screen.queryByText('2016')).not.toBeInTheDocument()
  })

  it('passes selected filter values as strings while keeping the fixed Bangumi type numeric and supports reset', async () => {
    const user = userEvent.setup()
    const currentYear = String(new Date().getFullYear())
    await renderView()

    await user.click(screen.getByText('Movie'))
    await user.click(screen.getByText('日期'))
    await user.click(screen.getByText(currentYear))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList)).toEqual({
        apipath: 'discover/bangumi',
        params: {
          type: 2,
          cat: '3',
          sort: 'date',
          year: currentYear,
        },
      })
    })

    const resetBtn = screen.getByTestId('discover-filter-reset')
    expect(resetBtn).toHaveTextContent('3')
    await user.click(resetBtn)

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList)).toEqual({
        apipath: 'discover/bangumi',
        params: {
          type: 2,
          cat: null,
          sort: 'rank',
          year: null,
        },
      })
    })
  })

  it('switches to daily calendar mode, selects today weekday by default with Today badge, and filters by weekday', async () => {
    // 2026-11-22 是周日 -> getDay() === 0 -> weekday 应为 7
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-11-22T12:00:00+08:00'))
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    await renderView()

    await user.click(screen.getByRole('button', { name: '每日放送' }))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList)).toEqual({
        apipath: 'discover/bangumi_calendar',
        params: {
          weekday: 7,
        },
      })
    })

    const sundayChip = screen.getByText('周日').closest('.v-chip')
    expect(sundayChip).toHaveTextContent('今日')

    await user.click(screen.getByText('全部'))
    await waitFor(() => {
      expect(latestMediaListRequest(mediaList)).toEqual({
        apipath: 'discover/bangumi_calendar',
        params: {
          weekday: 0,
        },
      })
    })

    // 点击重置回到今日星期
    await user.click(screen.getByTestId('discover-filter-reset'))
    await waitFor(() => {
      expect(latestMediaListRequest(mediaList).params).toEqual({ weekday: 7 })
    })
  })

  it('keeps mandatory sort selected while allowing optional category and year chips to be deselected', async () => {
    const user = userEvent.setup()
    const currentYear = String(new Date().getFullYear())
    await renderView()

    await user.click(screen.getByText('Movie'))
    await user.click(screen.getByText('日期'))
    await user.click(screen.getByText(currentYear))
    await user.click(screen.getByText('Movie'))
    await user.click(screen.getByText('日期'))
    await user.click(screen.getByText(currentYear))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList)).toEqual({
        apipath: 'discover/bangumi',
        params: {
          type: 2,
          cat: undefined,
          sort: 'date',
          year: undefined,
        },
      })
    })
  })
})
