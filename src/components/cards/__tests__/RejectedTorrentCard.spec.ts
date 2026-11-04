import type { RejectedSearchItem } from '@/api/types'
import RejectedTorrentCard from '@/components/cards/RejectedTorrentCard.vue'
import { renderWithProviders } from '@tests/support/render'
import { screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

function createRejectedItem(): RejectedSearchItem {
  return {
    context: {
      media_info: { title: '被过滤媒体' },
      meta_info: { name: '被过滤媒体', season_episode: 'S01E02' },
      torrent_info: { site_name: '测试站点', title: 'Movie.2025.1080p.WEB-DL' },
    } as RejectedSearchItem['context'],
    reasons: [
      {
        code: 'include_missed',
        count: 1,
        rule_group: '默认规则',
        rule: '仅含中文字幕',
        expected: '中文字幕',
        actual: null,
      },
      {
        code: 'identity_mismatch',
        count: 1,
      },
      {
        code: 'future_detail',
        count: 1,
        rule_group: '默认规则',
        rule: '未来规则',
      },
    ],
  }
}

describe('RejectedTorrentCard', () => {
  it('renders media, torrent, site and every translated rejection reason without actions', async () => {
    await renderWithProviders(RejectedTorrentCard, { props: { item: createRejectedItem() } })

    const card = screen.getByTestId('rejected-torrent-card')
    expect(card).toHaveTextContent('被过滤媒体')
    expect(card).toHaveTextContent('S01E02')
    expect(card).toHaveTextContent('Movie.2025.1080p.WEB-DL')
    expect(card).toHaveTextContent('测试站点')
    expect(card).toHaveTextContent('规则组“默认规则”/ 仅含中文字幕：未满足包含条件 中文字幕')
    expect(card).toHaveTextContent('媒体身份不匹配')
    expect(card).toHaveTextContent('规则组“默认规则”/ 未来规则：其他过滤条件')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders horizontal row layout when mode is row', async () => {
    await renderWithProviders(RejectedTorrentCard, { props: { item: createRejectedItem(), mode: 'row' } })

    const row = screen.getByTestId('rejected-torrent-card')
    expect(row).toHaveClass('rejected-torrent-row')
    expect(row).toHaveTextContent('被过滤媒体')
    expect(row).toHaveTextContent('测试站点')
    expect(row).toHaveTextContent('规则组“默认规则”/ 仅含中文字幕：未满足包含条件 中文字幕')
  })
})
