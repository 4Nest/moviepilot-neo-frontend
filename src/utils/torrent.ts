import type { TorrentInfo } from '@/api/types'

/** 已知倍率对应的促销展示语义，不用于替代后端的资源筛选规则。 */
export type TorrentPromotionKind = 'free' | 'discount' | 'bonus' | 'other'

/** 缺失倍率不表示免费，普通资源和没有有效文案的促销也不显示占位标签。 */
export function getTorrentPromotionKind(torrent?: Partial<TorrentInfo> | null): TorrentPromotionKind | undefined {
  const download = torrent?.downloadvolumefactor
  const upload = torrent?.uploadvolumefactor
  if (
    typeof download !== 'number' ||
    typeof upload !== 'number' ||
    !Number.isFinite(download) ||
    !Number.isFinite(upload) ||
    download < 0 ||
    upload < 0 ||
    !torrent?.volume_factor?.trim() ||
    (download === 1 && upload === 1)
  )
    return undefined

  if (download === 0) return 'free'
  if (download < 1) return 'discount'
  if (upload > 1) return 'bonus'
  return 'other'
}
