import type { TorrentInfo } from '@/api/types'
import { getTorrentPromotionKind } from '@/utils/torrent'
import { describe, expect, it } from 'vitest'

describe('torrent promotion facts', () => {
  it.each([
    [{ downloadvolumefactor: 0, volume_factor: 'FREE' }, 'free'],
    [{ downloadvolumefactor: 0.5, volume_factor: '50%' }, 'discount'],
    [{ uploadvolumefactor: 2, volume_factor: '2X' }, 'bonus'],
    [{ downloadvolumefactor: 2, volume_factor: '2x' }, 'other'],
    [{}, undefined],
    [{ downloadvolumefactor: null, uploadvolumefactor: null, volume_factor: '未知' }, undefined],
    [{ downloadvolumefactor: undefined, uploadvolumefactor: undefined, volume_factor: '未知' }, undefined],
    [{ downloadvolumefactor: 0, uploadvolumefactor: null, volume_factor: '未知' }, undefined],
    [{ downloadvolumefactor: null, uploadvolumefactor: 2, volume_factor: '未知' }, undefined],
    [{ downloadvolumefactor: NaN, volume_factor: '未知' }, undefined],
    [{ uploadvolumefactor: Infinity, volume_factor: '未知' }, undefined],
    [{ downloadvolumefactor: -1, volume_factor: '未知' }, undefined],
    [{ downloadvolumefactor: 0, volume_factor: '' }, undefined],
    [{ downloadvolumefactor: 0, volume_factor: '   ' }, undefined],
  ] satisfies [Partial<TorrentInfo>, string | undefined][])(
    'classifies known promotion without assuming missing values: %j',
    (override, expected) => {
      const torrent = { downloadvolumefactor: 1, uploadvolumefactor: 1, volume_factor: '1x', ...override }
      const snapshot = { ...torrent }
      expect(getTorrentPromotionKind(torrent)).toBe(expected)
      expect(torrent).toEqual(snapshot)
    },
  )

  it('does not create promotion from a missing torrent', () => {
    expect(getTorrentPromotionKind()).toBeUndefined()
    expect(getTorrentPromotionKind(null)).toBeUndefined()
  })
})
