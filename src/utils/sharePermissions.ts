import type { SubscribeShare, WorkflowShare } from '@/api/types'

export interface SharePermissionContext {
  superUser: boolean
  userUniqueId?: string
  canManageAll?: boolean
}

/** 判断指定分享记录是否由当前实例发布。 */
export function isOwnShare(shareUid?: string | null, userUniqueId?: string | null): boolean {
  return Boolean(shareUid && userUniqueId && shareUid === userUniqueId)
}

/** 判断当前用户是否有权删除指定的订阅分享记录。 */
export function canDeleteSubscribeShare(
  item: Pick<SubscribeShare, 'id' | 'share_uid'> | null | undefined,
  ctx: SharePermissionContext,
): boolean {
  return Boolean(
    ctx.superUser && Boolean(item?.id) && (Boolean(ctx.canManageAll) || isOwnShare(item?.share_uid, ctx.userUniqueId)),
  )
}

/** 判断当前用户是否有权删除指定的工作流分享记录。 */
export function canDeleteWorkflowShare(
  item: Pick<WorkflowShare, 'id' | 'share_uid'> | null | undefined,
  ctx: SharePermissionContext,
): boolean {
  return Boolean(
    ctx.superUser && Boolean(item?.id) && (Boolean(ctx.canManageAll) || isOwnShare(item?.share_uid, ctx.userUniqueId)),
  )
}

/** 解析订阅分享关联的媒体详情路由标识，优先级与 SubscribeCard 保持一致。 */
export function resolveShareMediaId(media?: SubscribeShare | null): string | undefined {
  if (!media) return undefined
  if (media.media_source && media.media_id) {
    const prefix = media.media_source === 'themoviedb' ? 'tmdb' : media.media_source
    return `${prefix}:${media.media_id}`
  }
  if (media.tmdbid) return `tmdb:${media.tmdbid}`
  if (media.doubanid) return `douban:${media.doubanid}`
  if (media.bangumiid) return `bangumi:${media.bangumiid}`
  if (media.anilistid) return `anilist:${media.anilistid}`
  return undefined
}

/** 按指定最大并发度分批执行异步任务并返回完整结算结果。 */
export async function runConcurrentBatches<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const safeConcurrency = Math.max(1, Math.floor(concurrency))
  const results: PromiseSettledResult<R>[] = []

  for (let offset = 0; offset < items.length; offset += safeConcurrency) {
    const batch = items.slice(offset, offset + safeConcurrency)
    const batchResults = await Promise.allSettled(batch.map(item => worker(item)))
    results.push(...batchResults)
  }

  return results
}
