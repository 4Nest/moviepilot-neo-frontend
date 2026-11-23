import { defineAsyncComponent, ref, type Ref } from 'vue'
import { useToast } from 'vue-toastification'
import { useChineseText } from '@/composables/useChineseText'
import api from '@/api'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import { formatSeason } from '@/@core/utils/formatters'
import type { MediaInfo, MediaSeason, Subscribe } from '@/api/types'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useConfirm } from '@/composables/useConfirm'
import { setCachedMediaSubscribeStatus } from '@/utils/mediaStatusCache'
import { notifySubscribeChanged } from '@/composables/useSubscribeRefresh'
import { useUserStore } from '@/stores'
export type SubscribeMode = 'normal' | 'best_version' | 'best_version_full'

interface SubscribePayload {
  best_version?: number
  best_version_full?: number
}

interface SubscribeConfig {
  show_edit_dialog?: boolean
  best_version?: unknown
  best_version_full?: unknown
}

interface AddSubscribeOptions {
  openEditDialog?: boolean
}

interface RemoveSubscribeOptions {
  confirm?: boolean
}

interface UseMediaSubscribeOptions {
  media: () => MediaInfo | undefined
  isSubscribed?: Ref<boolean>
  isExists?: () => boolean
  seasonsSubscribed?: Ref<{ [key: number]: boolean }>
  subscribedSeasons?: Ref<number[]>
  subscribedSeasonModes?: Ref<SeasonSubscribeModes>
  primarySeason?: () => number | null
  getSubscribeStatusKey?: (season: number | null) => string
  onEditRemove?: () => void
}

const SubscribeEditDialog = defineAsyncComponent(() => import('@/components/dialog/SubscribeEditDialog.vue'))
const SubscribeModeDialog = defineAsyncComponent(() => import('@/components/dialog/SubscribeModeDialog.vue'))
const SubscribeSeasonDialog = defineAsyncComponent(() => import('@/components/dialog/SubscribeSeasonDialog.vue'))

export type SeasonSubscribeModes = Record<number, SubscribeMode>

export interface MediaSubscribeIdentity {
  mediaId: string
  mediaKey: string
  source: string
}

const NATIVE_MEDIA_SOURCES = new Set(['themoviedb', 'tmdb', 'douban', 'bangumi', 'anilist'])

/** 判断媒体对象是否已具备任一原生权威源 ID。 */
export function hasAuthoritativeMediaId(media?: MediaInfo): boolean {
  if (!media) return false
  return Boolean(
    media.tmdb_id ||
    (media.douban_id && String(media.douban_id).trim()) ||
    (media.bangumi_id !== undefined && media.bangumi_id !== null && String(media.bangumi_id).trim()) ||
    media.anilist_id,
  )
}

/** 判断媒体是否来自外部探索源（非原生四源且无权威 ID）。 */
export function isExternalDiscoverMedia(media?: MediaInfo): boolean {
  if (!media || hasAuthoritativeMediaId(media)) return false
  const primarySource = (media.source || media.mediaid_prefix || '').trim().toLowerCase()
  if (!primarySource || NATIVE_MEDIA_SOURCES.has(primarySource)) return false
  return Boolean(getMediaSubscribeId(media))
}

/** 按媒体声明的主来源解析订阅身份，避免辅助 ID 覆盖原始识别源。 */
export function getMediaSubscribeIdentity(media?: MediaInfo): MediaSubscribeIdentity | undefined {
  if (!media) return undefined

  const normalizeSource = (value?: string) => {
    const source = (value || '').trim().toLowerCase()
    return source === 'tmdb' ? 'themoviedb' : source
  }
  const sourceIds: Record<string, unknown> = {
    anilist: media.anilist_id,
    bangumi: media.bangumi_id,
    douban: media.douban_id,
    themoviedb: media.tmdb_id,
  }
  const buildIdentity = (identitySource: string, value: unknown): MediaSubscribeIdentity | undefined => {
    if (value === undefined || value === null || !String(value).trim()) return undefined
    const mediaId = String(value).trim()
    const prefix = identitySource === 'themoviedb' ? 'tmdb' : identitySource
    return {
      mediaId,
      mediaKey: `${prefix}:${mediaId}`,
      source: identitySource,
    }
  }

  const declaredSources = [media.mediaid_prefix, media.source]
    .map(normalizeSource)
    .filter((source, index, sources) => source && sources.indexOf(source) === index)
  for (const source of declaredSources) {
    const declaredIdentity = buildIdentity(source, media.media_id ?? sourceIds[source])
    if (declaredIdentity) return declaredIdentity
  }

  for (const fallbackSource of ['themoviedb', 'douban', 'bangumi', 'anilist']) {
    const fallbackIdentity = buildIdentity(fallbackSource, sourceIds[fallbackSource])
    if (fallbackIdentity) return fallbackIdentity
  }
  return undefined
}

// 生成跨媒体源稳定的订阅媒体标识。
export function getMediaSubscribeId(media?: MediaInfo) {
  return getMediaSubscribeIdentity(media)?.mediaKey ?? ''
}

// 将订阅模式转换为后端订阅字段。
function getSubscribePayload(mode: SubscribeMode): SubscribePayload {
  return {
    best_version: mode === 'normal' ? 0 : 1,
    best_version_full: mode === 'best_version_full' ? 1 : 0,
  }
}

// 兼容布尔值和数字、字符串形式的开关值。
function isEnabledFlag(value: unknown) {
  return value === true || value === 1 || value === '1'
}

// 从订阅字段解析统一的订阅模式。
export function getSubscribeMode(subscribe: { best_version?: unknown; best_version_full?: unknown }): SubscribeMode {
  if (!isEnabledFlag(subscribe.best_version)) return 'normal'

  return isEnabledFlag(subscribe.best_version_full) ? 'best_version_full' : 'best_version'
}

// 从默认订阅配置解析订阅模式。
function getSubscribeConfigMode(config?: SubscribeConfig): SubscribeMode {
  return getSubscribeMode({
    best_version: config?.best_version,
    best_version_full: config?.best_version_full,
  })
}

// 获取订阅模式的本地化名称。
function getModeName(t: ReturnType<typeof useI18n>['t'], mode: SubscribeMode) {
  if (mode === 'normal') return t('dialog.subscribeMode.normal')
  if (mode === 'best_version') return t('dialog.subscribeMode.bestVersionEpisode')
  return t('dialog.subscribeMode.bestVersionFull')
}

// 从变更请求异常中提取可展示消息，并为非标准错误提供稳定兜底。
function getRequestErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null) {
    const responseMessage = (error as { response?: { data?: { message?: unknown } } }).response?.data?.message
    if (typeof responseMessage === 'string' && responseMessage) return responseMessage
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function mergeResolvedMedia(origin: MediaInfo, resolved: MediaInfo): MediaInfo {
  return {
    ...origin,
    ...resolved,
    mediaid_prefix: resolved.mediaid_prefix,
    media_id: resolved.media_id,
    source: resolved.source,
    title: resolved.title || origin.title,
    year: resolved.year || origin.year,
    type: resolved.type || origin.type,
    poster_path: resolved.poster_path || origin.poster_path,
    season: origin.season ?? resolved.season,
  }
}

function matchesTargetSubscribe(subscribe: Subscribe, target: MediaInfo): boolean {
  const targetKey = getMediaSubscribeId(target)
  const structuredKey =
    subscribe.media_source && subscribe.media_id
      ? `${subscribe.media_source === 'themoviedb' ? 'tmdb' : subscribe.media_source}:${subscribe.media_id}`
      : ''
  if (targetKey && (targetKey === structuredKey || targetKey === subscribe.mediaid)) return true

  const idPairs: Array<[unknown, unknown]> = [
    [target.tmdb_id, subscribe.tmdbid],
    [target.douban_id, subscribe.doubanid],
    [target.bangumi_id, subscribe.bangumiid],
    [target.anilist_id, subscribe.anilistid],
  ]
  return idPairs.some(([left, right]) => Boolean(left && right && String(left) === String(right)))
}

// 封装媒体卡片与详情页共用的订阅交互。
export function useMediaSubscribe(options: UseMediaSubscribeOptions) {
  const { t } = useChineseText()
  const $toast = useToast()
  const createConfirm = useConfirm()
  const episodeGroup = ref('')
  const route = useRoute()
  const userStore = useUserStore()
  let activeResolvedMedia: { origin: MediaInfo; resolved: MediaInfo } | null = null

  // 获取调用方原始当前媒体。
  function originMedia() {
    return options.media()
  }

  // 获取本次订阅流程生效的目标媒体（若外部探索源已静默解析出权威媒体则优先使用）。
  function currentMedia() {
    const origin = originMedia()
    if (!origin) return undefined
    return activeResolvedMedia?.origin === origin ? activeResolvedMedia.resolved : origin
  }

  // 获取原始媒体的统一订阅标识（用于卡片初始状态检测）。
  function getOriginMediaId() {
    return getMediaSubscribeId(originMedia())
  }

  // 获取当前生效目标媒体的统一订阅标识。
  function getMediaId() {
    return getMediaSubscribeId(currentMedia())
  }

  // 获取主订阅入口默认对应的季号。
  function getPrimarySeason() {
    return options.primarySeason?.() ?? currentMedia()?.season ?? null
  }

  // 对外部探索源卡片静默解析权威媒体信息，并在电视剧场景同步已订阅季状态。
  async function resolveSubscribeTargetMedia(): Promise<{
    media: MediaInfo | undefined
    wasExternalResolved: boolean
  }> {
    const origin = originMedia()
    if (!origin) return { media: undefined, wasExternalResolved: false }
    if (activeResolvedMedia?.origin === origin) {
      return { media: activeResolvedMedia.resolved, wasExternalResolved: true }
    }
    if (!isExternalDiscoverMedia(origin)) {
      return { media: origin, wasExternalResolved: false }
    }

    try {
      const resolved: MediaInfo = await api.get(`media/${getMediaSubscribeId(origin)}`, {
        params: {
          type_name: origin.type,
          title: origin.title,
          year: origin.year,
        },
      })
      if (hasAuthoritativeMediaId(resolved)) {
        const merged = mergeResolvedMedia(origin, resolved)
        activeResolvedMedia = { origin, resolved: merged }

        if (merged.type === '电视剧' && (options.subscribedSeasons || options.subscribedSeasonModes)) {
          try {
            const subscribes: Subscribe[] = await api.get('subscribe/')
            const matched = subscribes.filter(
              item => item.type === '电视剧' && item.season !== undefined && matchesTargetSubscribe(item, merged),
            )
            if (options.subscribedSeasons) {
              options.subscribedSeasons.value = matched.map(item => item.season as number).sort((a, b) => a - b)
            }
            if (options.subscribedSeasonModes) {
              options.subscribedSeasonModes.value = matched.reduce<SeasonSubscribeModes>((acc, item) => {
                if (item.season !== undefined) acc[item.season] = getSubscribeMode(item)
                return acc
              }, {})
            }
          } catch {
            // 订阅列表辅助同步失败不阻断主订阅弹窗
          }
        }

        return { media: merged, wasExternalResolved: true }
      }
    } catch {
      // 外部词条解析失败时平滑回退使用原始卡片信息
    }

    return { media: origin, wasExternalResolved: false }
  }

  // 同步调用方状态和订阅状态缓存。
  function updateSubscribeStatus(season: number | null, subscribed: boolean, mode: SubscribeMode = 'normal') {
    const media = currentMedia()

    if (media?.type === '电影' || season === null) {
      if (options.isSubscribed) options.isSubscribed.value = subscribed
    } else {
      if (options.seasonsSubscribed) options.seasonsSubscribed.value[season] = subscribed
      else if (options.subscribedSeasons) {
        const nextSeasons = new Set(options.subscribedSeasons.value)
        if (subscribed) nextSeasons.add(season)
        else nextSeasons.delete(season)
        options.subscribedSeasons.value = [...nextSeasons].sort((a, b) => a - b)
      }

      if (options.isSubscribed) {
        if (subscribed) {
          options.isSubscribed.value = true
        } else if (options.seasonsSubscribed) {
          options.isSubscribed.value = Object.values(options.seasonsSubscribed.value).some(Boolean)
        } else if (options.subscribedSeasons) {
          options.isSubscribed.value = options.subscribedSeasons.value.length > 0
        } else {
          options.isSubscribed.value = false
        }
      }

      if (options.subscribedSeasonModes) {
        const nextModes = { ...options.subscribedSeasonModes.value }
        if (subscribed) nextModes[season] = mode
        else delete nextModes[season]
        options.subscribedSeasonModes.value = nextModes
      }
    }

    if (options.getSubscribeStatusKey) {
      setCachedMediaSubscribeStatus(options.getSubscribeStatusKey(season), subscribed)
    }
  }

  // 打开已创建订阅的编辑弹窗。
  function openSubscribeEditDialog(subid: number, season: number | null, mode: SubscribeMode) {
    openSharedDialog(
      SubscribeEditDialog,
      { subid },
      {
        save: (subscribe?: Subscribe) => {
          const savedSeason = currentMedia()?.type === '电影' ? null : (subscribe?.season ?? season)
          if (savedSeason !== season) updateSubscribeStatus(season, false)
          updateSubscribeStatus(savedSeason, true, subscribe ? getSubscribeMode(subscribe) : mode)
        },
        remove: () => {
          updateSubscribeStatus(season, false)
          options.onEditRemove?.()
        },
      },
      { closeOn: ['close', 'save', 'remove'] },
    )
  }

  // 打开订阅模式选择弹窗并转换选择结果。
  function openSubscribeModeDialog(
    modes: SubscribeMode[],
    choose: (payload: SubscribePayload, mode: SubscribeMode) => void,
  ) {
    openSharedDialog(
      SubscribeModeDialog,
      { modes, type: currentMedia()?.type },
      {
        choose: (mode: SubscribeMode) => choose(getSubscribePayload(mode), mode),
      },
      { closeOn: ['close', 'choose'] },
    )
  }

  // 打开季订阅弹窗，并保留发起入口当前使用的剧集组。
  async function openSubscribeSeasonDialog(selectedSeason?: number | null, initialEpisodeGroup = '') {
    const origin = originMedia()
    if (!origin) return
    const { media, wasExternalResolved } = await resolveSubscribeTargetMedia()
    if (!media) return
    const defaultSubscribeConfig = await queryDefaultSubscribeConfig()
    const resolvedSelectedSeason =
      selectedSeason !== undefined ? selectedSeason : wasExternalResolved ? (origin.season ?? media.season) : undefined

    openSharedDialog(
      SubscribeSeasonDialog,
      {
        media,
        selectedSeason: resolvedSelectedSeason,
        initialEpisodeGroup,
        subscribedSeasons: options.subscribedSeasons?.value ?? [],
        subscribedSeasonModes: options.subscribedSeasonModes?.value ?? {},
        defaultSubscribeMode: getSubscribeConfigMode(defaultSubscribeConfig),
      },
      {
        subscribe: subscribeSeasons,
      },
      { closeOn: ['close', 'subscribe'] },
    )
  }

  // 查询系统默认订阅配置。
  async function queryDefaultSubscribeConfig(): Promise<SubscribeConfig | undefined> {
    try {
      const media = currentMedia()
      const subscribeConfigUrl =
        media?.type === '电影'
          ? 'system/setting/public/DefaultMovieSubscribeConfig'
          : 'system/setting/public/DefaultTvSubscribeConfig'
      const result: { [key: string]: any } = await api.get(subscribeConfigUrl)

      return result.data?.value
    } catch (error) {
      console.log(error)
    }

    return undefined
  }

  // 展示订阅新增结果通知。
  function showSubscribeAddToast(
    result: boolean,
    title: string,
    season: number | null,
    message: string,
    bestVersion: number,
  ) {
    if (season !== null) title = `${title} ${formatSeason(season.toString())}`

    const subname = bestVersion > 0 ? t('subscribe.versionSub') : t('subscribe.normalSub')

    if (result) $toast.success(`${title} ${t('subscribe.addSuccess', { name: subname })}`)
    else $toast.error(`${title} ${t('subscribe.addFailed', { name: subname, message })}`)
  }

  // 创建指定季和模式的订阅。
  async function addSubscribe(
    season: number | null = null,
    payload: SubscribePayload = {},
    addOptions: AddSubscribeOptions = {},
  ) {
    const media = currentMedia()
    if (!media) return
    const identity = getMediaSubscribeIdentity(media)
    const originPath = route.fullPath

    startNProgress()
    try {
      const result: { [key: string]: any } = await api.post(
        'subscribe/',
        {
          name: media.title,
          type: media.type,
          year: media.year,
          tmdbid: media.tmdb_id,
          doubanid: media.douban_id,
          bangumiid: media.bangumi_id,
          anilistid: media.anilist_id,
          media_source: identity?.source,
          media_id: identity?.mediaId,
          mediaid: identity?.mediaKey ?? '',
          season: media.type === '电影' ? null : season,
          ...payload,
          episode_group: episodeGroup.value,
        },
        { cancelOnNavigation: false },
      )

      const subscribeSeason = media.type === '电影' ? null : season
      const subscribeMode = getSubscribeMode(payload)
      if (result.success && result.data?.pending_approval) {
        let pendingTitle = media.title ?? ''
        if (subscribeSeason !== null) pendingTitle = `${pendingTitle} ${formatSeason(subscribeSeason.toString())}`
        $toast.info(`${pendingTitle} ${result.message || '已提交订阅审批，等待管理员审核'}`)
        return
      }
      if (result.success) {
        updateSubscribeStatus(subscribeSeason, true, subscribeMode)
        notifySubscribeChanged()
      }

      showSubscribeAddToast(
        result.success,
        media.title ?? '',
        season,
        result.message ?? t('subscribe.requestFailed'),
        payload.best_version ?? 0,
      )

      if (
        userStore.superUser &&
        result.success &&
        route.fullPath === originPath &&
        (addOptions.openEditDialog ?? true)
      ) {
        const subscribeConfig = await queryDefaultSubscribeConfig()
        if (route.fullPath === originPath && subscribeConfig?.show_edit_dialog && result.data?.id) {
          openSubscribeEditDialog(result.data.id, subscribeSeason, subscribeMode)
        }
      }
    } catch (error) {
      console.error(error)
      showSubscribeAddToast(
        false,
        media.title ?? '',
        season,
        getRequestErrorMessage(error, t('subscribe.requestFailed')),
        payload.best_version ?? 0,
      )
    } finally {
      doneNProgress()
    }
  }

  // 删除指定季的订阅（附带 title 供外部探索源按标题兜底取消）。
  async function removeSubscribe(season: number | null = null, removeOptions: RemoveSubscribeOptions = {}) {
    if (removeOptions.confirm ?? true) {
      const confirmed = await createConfirm({
        title: t('common.confirm'),
        content: t('dialog.subscribeEdit.cancelSubscribeConfirm'),
      })
      if (!confirmed) return
    }

    const media = currentMedia()
    if (!media) return
    let title = media.title ?? ''
    if (media.type !== '电影' && season !== null) title = `${title} ${formatSeason(season.toString())}`

    startNProgress()
    try {
      const result: { [key: string]: any } = await api.delete(`subscribe/media/${getMediaId()}`, {
        params: {
          season: media.type === '电影' ? null : season,
          title: media.title,
        },
      })

      if (result.success) {
        updateSubscribeStatus(media.type === '电影' ? null : season, false)
        $toast.success(`${title} ${t('subscribe.cancelSuccess')}`)
      } else {
        $toast.error(
          `${title} ${t('subscribe.cancelFailed', { message: result.message ?? t('subscribe.requestFailed') })}`,
        )
      }
    } catch (error) {
      console.error(error)
      $toast.error(
        `${title} ${t('subscribe.cancelFailed', {
          message: getRequestErrorMessage(error, t('subscribe.requestFailed')),
        })}`,
      )
    } finally {
      doneNProgress()
    }
  }

  // 检查当前媒体指定季是否已订阅。
  async function checkSubscribe(season: number | null = null) {
    try {
      const result: Subscribe = await api.get(`subscribe/media/${getOriginMediaId()}`, {
        params: {
          season,
          title: originMedia()?.title,
        },
      })

      return Boolean(result.id)
    } catch (error: any) {
      if (error?.response?.status === 404) return false

      throw error
    }
  }

  // 查询当前媒体指定季的订阅记录。
  async function querySubscribe(season: number | null = null) {
    try {
      const result: Subscribe = await api.get(`subscribe/media/${getMediaId()}`, {
        params: {
          season,
          title: currentMedia()?.title,
        },
      })

      return result.id ? result : null
    } catch (error: any) {
      if (error?.response?.status === 404) return null

      throw error
    }
  }

  // 更新已有单季订阅的模式。
  async function updateSubscribeMode(season: number, mode: SubscribeMode) {
    const media = currentMedia()
    if (!media) return
    const title = `${media.title ?? ''} ${formatSeason(season.toString())}`

    startNProgress()
    try {
      const subscribe = await querySubscribe(season)
      if (!subscribe?.id) {
        $toast.error(`${media.title ?? ''} ${formatSeason(season.toString())} ${t('subscribe.notFound')}`)
        return
      }

      const payload = getSubscribePayload(mode)
      const result: { [key: string]: any } = await api.put('subscribe/', {
        ...subscribe,
        ...payload,
      })

      if (result.success) {
        updateSubscribeStatus(season, true, mode)
        $toast.success(`${title} ${t('subscribe.modeUpdateSuccess', { mode: getModeName(t, mode) })}`)
      } else {
        $toast.error(
          `${title} ${t('subscribe.addFailed', {
            name: getModeName(t, mode),
            message: result.message ?? t('subscribe.requestFailed'),
          })}`,
        )
      }
    } catch (error) {
      console.error(error)
      $toast.error(
        `${title} ${t('subscribe.addFailed', {
          name: getModeName(t, mode),
          message: getRequestErrorMessage(error, t('subscribe.requestFailed')),
        })}`,
      )
    } finally {
      doneNProgress()
    }
  }

  // 处理单季订阅入口，未订阅时将当前剧集组带入季选择弹窗。
  function handleSeasonSubscribe(season: number, initialEpisodeGroup = '') {
    if (options.seasonsSubscribed?.value[season]) {
      removeSubscribe(season)
      return
    }

    void openSubscribeSeasonDialog(season, initialEpisodeGroup)
  }

  // 处理媒体主订阅入口，电视剧统一进入季选择弹窗。
  async function handlePrimarySubscribe() {
    const origin = originMedia()
    if (!origin) return

    const season = origin.type === '电影' ? null : getPrimarySeason()

    if (origin.type === '电视剧') {
      await openSubscribeSeasonDialog()
      return
    }

    if (options.isSubscribed?.value) {
      await removeSubscribe(season)
      return
    }

    await resolveSubscribeTargetMedia()
    if (!currentMedia()) return

    if (options.isExists?.()) {
      openSubscribeModeDialog(['normal', 'best_version'], payload => addSubscribe(null, payload))
      return
    }

    await addSubscribe(null)
  }

  // 根据是否指定季号分发主订阅或单季订阅操作。
  function handleSubscribe(season?: number | null, initialEpisodeGroup = '') {
    if (season !== undefined && season !== null) {
      handleSeasonSubscribe(season, initialEpisodeGroup)
      return
    }

    void handlePrimarySubscribe()
  }

  // 批量对齐弹窗中选择的季、订阅模式和当前订阅状态。
  function subscribeSeasons(
    seasons: MediaSeason[] = [],
    seasonExistsStates: { [key: number]: number } = {},
    groupId = '',
    seasonModes: SubscribeMode | SeasonSubscribeModes = 'normal',
    visibleSeasonNumbers: number[] = [],
  ) {
    episodeGroup.value = groupId
    const subscribedSeasonSet = new Set(options.subscribedSeasons?.value ?? [])
    const selectedSeasonSet = new Set(
      seasons
        .map(season => season.season_number)
        .filter((season): season is number => season !== null && season !== undefined),
    )
    const visibleSeasonSet = new Set(visibleSeasonNumbers)
    const seasonsToSubscribe = seasons.filter(season => {
      const seasonNumber = season.season_number ?? null
      return seasonNumber !== null && !subscribedSeasonSet.has(seasonNumber)
    })
    const seasonsToUnsubscribe = [...subscribedSeasonSet].filter(
      season => visibleSeasonSet.has(season) && !selectedSeasonSet.has(season),
    )
    const seasonsToUpdateMode = seasons.filter(season => {
      const seasonNumber = season.season_number ?? null
      if (seasonNumber === null || !subscribedSeasonSet.has(seasonNumber)) return false

      const nextMode = typeof seasonModes === 'string' ? seasonModes : (seasonModes[seasonNumber] ?? 'normal')
      return (options.subscribedSeasonModes?.value[seasonNumber] ?? 'normal') !== nextMode
    })

    seasonsToUnsubscribe.forEach(season => {
      removeSubscribe(season, { confirm: false })
    })

    seasonsToUpdateMode.forEach(season => {
      const seasonNumber = season.season_number ?? null
      if (seasonNumber === null) return

      const mode = typeof seasonModes === 'string' ? seasonModes : (seasonModes[seasonNumber] ?? 'normal')
      updateSubscribeMode(seasonNumber, mode)
    })

    seasonsToSubscribe.forEach(season => {
      const seasonNumber = season.season_number ?? null
      if (seasonNumber === null) return

      const mode = typeof seasonModes === 'string' ? seasonModes : (seasonModes[seasonNumber] ?? 'normal')
      const payload = getSubscribePayload(mode)
      addSubscribe(seasonNumber, payload, {
        openEditDialog: seasonsToSubscribe.length === 1 && seasonsToUnsubscribe.length === 0,
      })
    })
  }

  return {
    addSubscribe,
    checkSubscribe,
    handleSubscribe,
    openSubscribeSeasonDialog,
    removeSubscribe,
    subscribeSeasons,
  }
}
