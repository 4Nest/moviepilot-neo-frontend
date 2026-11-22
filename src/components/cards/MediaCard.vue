<script lang="ts">
import type { MediaInfo } from '@/api/types'
import { ref } from 'vue'

const activeTouchMediaCardId = ref<number | null>(null)
let mediaCardIdSeed = 0

// 模块级媒体补充详情缓存、在途请求合并与视口高并发静默预热队列
const mediaCardDetailCache = new Map<string, Partial<MediaInfo>>()
const mediaCardDetailInflight = new Map<string, Promise<Partial<MediaInfo> | null>>()
const DETAIL_PREFETCH_CONCURRENCY = 6
let activeDetailPrefetchCount = 0
const detailPrefetchQueue: Array<() => Promise<void>> = []

function pumpDetailPrefetchQueue() {
  while (activeDetailPrefetchCount < DETAIL_PREFETCH_CONCURRENCY && detailPrefetchQueue.length > 0) {
    const nextTask = detailPrefetchQueue.shift()!
    activeDetailPrefetchCount += 1
    void nextTask().finally(() => {
      activeDetailPrefetchCount -= 1
      pumpDetailPrefetchQueue()
    })
  }
}

export function clearMediaCardDetailCache() {
  mediaCardDetailCache.clear()
  mediaCardDetailInflight.clear()
  detailPrefetchQueue.length = 0
}
</script>

<script lang="ts" setup>
import noImage from '@images/no-image.jpeg'
import { getDisplayImageUrl, getLogoUrl } from '@/utils/imageUtils'
import api from '@/api'
import { formatRating } from '@/@core/utils/formatters'
import type { Site, Subscribe } from '@/api/types'
import router from '@/router'
import { useGlobalSettingsStore, useUserStore } from '@/stores'
import { mediaTypeDict } from '@/api/constants'
import { openSharedDialog } from '@/composables/useSharedDialog'
import {
  getMediaSubscribeId,
  getSubscribeMode,
  useMediaSubscribe,
  type SeasonSubscribeModes,
} from '@/composables/useMediaSubscribe'
import {
  getCachedMediaExistsStatus,
  getCachedMediaSubscribeStatus,
  setCachedMediaExistsStatus,
} from '@/utils/mediaStatusCache'

const SearchSiteDialog = defineAsyncComponent(() => import('@/components/dialog/SearchSiteDialog.vue'))

const TMDB_GENRE_ID_MAP: Record<number, string> = {
  12: '冒险',
  14: '奇幻',
  16: '动画',
  18: '剧情',
  27: '恐怖',
  28: '动作',
  35: '喜剧',
  36: '历史',
  37: '西部',
  53: '惊悚',
  80: '犯罪',
  99: '纪录片',
  878: '科幻',
  9648: '悬疑',
  10402: '音乐',
  10749: '爱情',
  10751: '家庭',
  10752: '战争',
  10759: '动作冒险',
  10762: '儿童',
  10763: '新闻',
  10764: '真人秀',
  10765: '科幻奇幻',
  10766: '肥皂剧',
  10767: '脱口秀',
  10768: '战争政治',
  10770: '电视电影',
}

interface MediaCardMedia extends MediaInfo {
  total_episode?: number
  episode_count?: number
  genre_ids?: number[]
}

// 输入参数
const props = defineProps({
  media: Object as PropType<MediaCardMedia>,
  width: String,
  height: String,
})

// 全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings
const userStore = useUserStore()

// 图片加载状态
const isImageLoaded = ref(false)

// 图片加载失败
const imageLoadError = ref(false)

// 图片请求代际隔离复用卡片的迟到事件。
const imageRequestRevision = ref(0)

// 当前订阅状态
const isSubscribed = ref(false)

// 本地存在状态
const isExists = ref(false)

// 当前媒体已订阅的季号
const subscribedSeasons = ref<number[]>([])

// 当前媒体已订阅季的订阅模式
const subscribedSeasonModes = ref<SeasonSubscribeModes>({})

const subscribedSeasonsLoaded = ref(false)

const subscribedSeasonsLoading = ref(false)

// 悬停/展开懒加载补齐的元数据副本（不篡改 props.media 引用）
const lazyDetail = shallowRef<Partial<MediaInfo> | null>(null)
let hoverDetailTimer: ReturnType<typeof setTimeout> | null = null
let viewportPrefetchTimer: ReturnType<typeof setTimeout> | null = null
let queuedPrefetchTask: (() => Promise<void>) | null = null

// 来源角标字典
const sourceIconDict: Record<string, string> = {
  themoviedb: getLogoUrl('tmdb'),
  douban: getLogoUrl('douban'),
  bangumi: getLogoUrl('bangumi'),
}

const hasSourceBadge = computed(() =>
  Boolean(props.media?.source && (props.media.source === 'anilist' || sourceIconDict[props.media.source])),
)

// 绑定MediaCard元素
const mediaCardRef = ref<HTMLElement | null>(null)

// 创建Intersection Observer实例
const observer = ref<IntersectionObserver | null>(null)

// 所有站点
const allSites = ref<Site[]>([])

// 选中的站点
const selectedSites = ref<number[]>([])

// 搜索菜单显示状态
const searchMenuShow = ref(false)

const mediaCardId = ++mediaCardIdSeed

// 粗指针设备使用点击展开详情，避免 iOS 返回后沿用 VHover 的触摸态。
const isTouchLikePointer = ref(
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(hover: none), (pointer: coarse)').matches),
)

function isSlashSeparatedSubtitle(text?: string) {
  if (!text || !text.includes(' / ')) return false
  const slashIndex = text.indexOf(' / ')
  return Boolean(text.slice(0, slashIndex).trim() && text.slice(slashIndex + 3).trim())
}

function isYearLikeSegment(segment: string) {
  return /^(?:19|20)\d{2}(?:[-./(（].*)?$/.test(segment.trim())
}

// 解析豆瓣 card_subtitle 等斜杠副标题（剥离首段年份，提取地区/类型标签与末尾主演）
const parsedSubtitle = computed(() => {
  const raw = props.media?.overview?.trim()
  if (!raw || !isSlashSeparatedSubtitle(raw)) {
    return { actors: [] as string[], tags: [] as string[] }
  }
  const segments = raw
    .split(' / ')
    .map(item => item.trim())
    .filter(item => Boolean(item) && !isYearLikeSegment(item))

  const tags = segments
    .slice(0, 2)
    .flatMap(seg => seg.split(/\s+/))
    .filter(Boolean)
  const actors = segments.length >= 3 ? segments[segments.length - 1].split(/\s+/).filter(Boolean) : []

  return { actors, tags }
})

const META_EDGE_CHARS = new Set(['[', ']', '(', ')', '（', '）', '"', "'", '“', '”', '‘', '’'])

function sanitizeMetaToken(value: string) {
  let start = 0
  let end = value.length
  while (start < end && (value[start] <= ' ' || META_EDGE_CHARS.has(value[start]))) start += 1
  while (end > start && (value[end - 1] <= ' ' || META_EDGE_CHARS.has(value[end - 1]))) end -= 1
  return value.slice(start, end)
}

// 第 1 行：分类与风格标签（不含年份，最多取前 5 个以“ · ”连接，单行超长省略）
const cardTagsText = computed(() => {
  const tags: string[] = []
  const pushTag = (raw?: unknown) => {
    const label = sanitizeMetaToken(
      typeof raw === 'string'
        ? raw
        : raw && typeof raw === 'object' && 'name' in raw
          ? String((raw as { name?: unknown }).name ?? '')
          : '',
    )
    if (label && !isYearLikeSegment(label) && !tags.includes(label)) {
      tags.push(label)
    }
  }

  pushTag(props.media?.category || lazyDetail.value?.category)
  const rawGenres = props.media?.genres?.length ? props.media.genres : lazyDetail.value?.genres
  if (Array.isArray(rawGenres) && rawGenres.length > 0) {
    rawGenres.forEach(pushTag)
  } else if (Array.isArray(props.media?.genre_ids)) {
    props.media.genre_ids.forEach(id => pushTag(TMDB_GENRE_ID_MAP[id]))
  }
  parsedSubtitle.value.tags.forEach(pushTag)

  return tags.slice(0, 5).join(' · ')
})

// 第 2 行：演员名单（不含年份与外层括号，最多取前 5 位以“ / ”连接，单行超长省略）
const cardActorsText = computed(() => {
  const names: string[] = []
  const pushActor = (actor: unknown) => {
    const name = sanitizeMetaToken(
      typeof actor === 'string'
        ? actor
        : actor && typeof actor === 'object'
          ? String((actor as { name?: unknown; title?: unknown }).name ?? (actor as { title?: unknown }).title ?? '')
          : '',
    )
    if (name && !names.includes(name)) {
      names.push(name)
    }
  }

  const rawActors = props.media?.actors?.length ? props.media.actors : lazyDetail.value?.actors
  if (Array.isArray(rawActors) && rawActors.length > 0) {
    rawActors.forEach(pushActor)
  } else {
    parsedSubtitle.value.actors.forEach(pushActor)
  }

  return names.slice(0, 5).join(' / ')
})

function clearHoverDetailTimer() {
  if (hoverDetailTimer !== null) {
    clearTimeout(hoverDetailTimer)
    hoverDetailTimer = null
  }
}

function clearViewportPrefetch() {
  if (viewportPrefetchTimer !== null) {
    clearTimeout(viewportPrefetchTimer)
    viewportPrefetchTimer = null
  }
  if (queuedPrefetchTask) {
    const idx = detailPrefetchQueue.indexOf(queuedPrefetchTask)
    if (idx !== -1) detailPrefetchQueue.splice(idx, 1)
    queuedPrefetchTask = null
  }
}

async function fetchLazyMediaDetail() {
  if (props.media?.collection_id || cardActorsText.value) return
  const mediaId = getMediaId()
  if (!mediaId) return

  const cached = mediaCardDetailCache.get(mediaId)
  if (cached) {
    lazyDetail.value = cached
    return
  }

  let requestPromise = mediaCardDetailInflight.get(mediaId)
  if (!requestPromise) {
    requestPromise = api
      .get<MediaInfo, MediaInfo>(`media/${mediaId}`, {
        params: {
          include_images: false,
          type_name: props.media?.type,
          title: props.media?.title,
          year: props.media?.year,
        },
      })
      .then(detail => {
        if (!detail || typeof detail !== 'object') return null
        const summary: Partial<MediaInfo> = {
          actors: detail.actors,
          category: detail.category,
          genres: detail.genres,
        }
        mediaCardDetailCache.set(mediaId, summary)
        return summary
      })
      .catch(() => null)
      .finally(() => {
        mediaCardDetailInflight.delete(mediaId)
      })
    mediaCardDetailInflight.set(mediaId, requestPromise)
  }

  const resolved = await requestPromise
  if (resolved && getMediaId() === mediaId) {
    lazyDetail.value = resolved
  }
}

function scheduleViewportDetailPrefetch() {
  clearViewportPrefetch()
  if (props.media?.collection_id || cardActorsText.value) return
  const mediaId = getMediaId()
  if (!mediaId) return
  const cached = mediaCardDetailCache.get(mediaId)
  if (cached) {
    lazyDetail.value = cached
    return
  }

  viewportPrefetchTimer = setTimeout(() => {
    viewportPrefetchTimer = null
    const task = async () => {
      queuedPrefetchTask = null
      await fetchLazyMediaDetail()
    }
    queuedPrefetchTask = task
    detailPrefetchQueue.push(task)
    pumpDetailPrefetchQueue()
  }, 100)
}

function handleCardMouseEnter() {
  void querySubscribedSeasons()
  clearHoverDetailTimer()
  if (props.media?.collection_id || cardActorsText.value) {
    return
  }

  const mediaId = getMediaId()
  if (!mediaId) return
  const cached = mediaCardDetailCache.get(mediaId)
  if (cached) {
    lazyDetail.value = cached
    return
  }

  hoverDetailTimer = setTimeout(() => {
    hoverDetailTimer = null
    void fetchLazyMediaDetail()
  }, 80)
}

// 打开站点选择弹窗，并把选择结果交回当前媒体卡片继续搜索。
function openSearchSiteDialog() {
  openSharedDialog(
    SearchSiteDialog,
    {
      sites: allSites.value,
      selected: selectedSites.value,
    },
    {
      search: searchSites,
    },
    { closeOn: ['close', 'search'] },
  )
}

// 查询所有站点
async function querySites() {
  try {
    const data: Site[] = await api.get('site/')

    // 过滤站点，只有启用的站点才显示
    allSites.value = data.filter(item => item.is_active)
  } catch (error) {
    console.log(error)
  }
}

// 查询用户选中的站点
async function querySelectedSites() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/public/IndexerSites')
    selectedSites.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 获得mediaid
function getMediaId() {
  return getMediaSubscribeId(props.media)
}

function getSubscribeStatusKey(season: number | null = props.media?.season ?? null) {
  return `${getMediaId()}::${season ?? 'all'}`
}

function getExistsStatusKey() {
  return [
    props.media?.tmdb_id ?? '',
    props.media?.title ?? '',
    props.media?.year ?? '',
    props.media?.season ?? '',
    props.media?.type ?? '',
    props.media?.mediaid_prefix ?? '',
    props.media?.media_id ?? '',
  ].join('::')
}

function isSameSubscribeMedia(subscribe: Subscribe) {
  const mediaId = getMediaId()
  if (subscribe.media_source && subscribe.media_id) {
    const prefix = subscribe.media_source === 'themoviedb' ? 'tmdb' : subscribe.media_source
    if (mediaId && mediaId === `${prefix}:${subscribe.media_id}`) return true
  }
  if (mediaId && subscribe.mediaid && subscribe.mediaid === mediaId) return true
  if (props.media?.tmdb_id && subscribe.tmdbid && props.media.tmdb_id === subscribe.tmdbid) return true
  if (props.media?.douban_id && subscribe.doubanid && props.media.douban_id === subscribe.doubanid) return true
  if (
    props.media?.bangumi_id &&
    subscribe.bangumiid &&
    String(props.media.bangumi_id) === String(subscribe.bangumiid)
  ) {
    return true
  }
  if (props.media?.anilist_id && subscribe.anilistid && props.media.anilist_id === subscribe.anilistid) return true
  return false
}

// 类型微圆点语义类名
function getTypeDotClass(type?: string) {
  if (type === '电影') return 'media-card__type-dot--movie'
  if (type === '电视剧') return 'media-card__type-dot--tv'
  return 'media-card__type-dot--other'
}

// 格式化海报卡片评分（十分制统一保留一位小数，如 8 -> 8.0）
function formatCardScore(rating?: number) {
  if (!rating) return ''
  if (rating <= 10) return Number(rating).toFixed(1)
  return formatRating(rating)
}

// 查询当前媒体是否已订阅
async function handleCheckSubscribe() {
  try {
    const subscribed = await getCachedMediaSubscribeStatus(getSubscribeStatusKey(props.media?.season ?? null), () =>
      checkSubscribe(props.media?.season ?? null),
    )
    isSubscribed.value = subscribed
  } catch (error) {
    console.error(error)
  }
}

async function querySubscribedSeasons() {
  if (
    props.media?.type !== '电视剧' ||
    !isSubscribed.value ||
    subscribedSeasonsLoaded.value ||
    subscribedSeasonsLoading.value
  ) {
    return
  }

  subscribedSeasonsLoading.value = true
  try {
    const subscribes: Subscribe[] = await api.get('subscribe/')
    const mediaSubscribes = subscribes.filter(
      item => item.type === '电视剧' && item.season !== undefined && isSameSubscribeMedia(item),
    )

    subscribedSeasons.value = mediaSubscribes.map(item => item.season as number).sort((a, b) => a - b)
    subscribedSeasonModes.value = mediaSubscribes.reduce<SeasonSubscribeModes>((modes, item) => {
      if (item.season !== undefined) modes[item.season] = getSubscribeMode(item)
      return modes
    }, {})
    subscribedSeasonsLoaded.value = true
  } catch (error) {
    console.error(error)
  } finally {
    subscribedSeasonsLoading.value = false
  }
}

// 查询当前媒体是否已入库
async function handleCheckExists() {
  try {
    const exists = await getCachedMediaExistsStatus(getExistsStatusKey(), async () => {
      const result: { [key: string]: any } = await api.get('mediaserver/exists', {
        params: {
          tmdbid: props.media?.tmdb_id,
          title: props.media?.title,
          year: props.media?.year,
          season: props.media?.season,
          mtype: props.media?.type,
        },
      })

      return Boolean(result.success)
    })

    isExists.value = exists
    setCachedMediaExistsStatus(getExistsStatusKey(), exists)
  } catch (error) {
    console.error(error)
  }
}

// 调用API检查是否已订阅，电视剧需要指定季
async function checkSubscribe(season: number | null) {
  return subscribeActions.checkSubscribe(season)
}

// 爱心订阅按钮响应
async function handleSubscribe() {
  await querySubscribedSeasons()
  subscribeActions.handleSubscribe()
}

// 打开详情页
function goMediaDetail(isHovering = false) {
  if (isHovering) {
    resetMediaCardDetailState()

    if (props.media?.collection_id) {
      // 跳转到合集列表
      router.push({
        path: `/browse/tmdb/collection/${props.media?.collection_id}`,
        query: {
          title: props.media?.title,
        },
      })
    } else {
      // 跳转到媒体详情页
      router.push({
        path: '/media',
        query: {
          mediaid: getMediaId(),
          title: props.media?.title,
          year: props.media?.year,
          type: props.media?.type,
        },
      })
    }
  }
}

// 当前卡片是否进入可操作详情态，桌面使用 hover，触摸端使用显式点击态。
function isMediaCardActive(isHovering: boolean | null | undefined) {
  return activeTouchMediaCardId.value === mediaCardId || (!isTouchLikePointer.value && Boolean(isHovering))
}

// 当前卡片详情层是否显示，保留图片错误和站点选择时的强制显示。
function isMediaCardDetailVisible(isHovering: boolean | null | undefined) {
  return isMediaCardActive(isHovering) || imageLoadError.value || searchMenuShow.value
}

// 清理移动端详情层展开态，避免路由返回后继续显示上一次的详情层。
function resetMediaCardDetailState() {
  clearHoverDetailTimer()
  if (activeTouchMediaCardId.value === mediaCardId) {
    activeTouchMediaCardId.value = null
  }
}

// 处理媒体卡片点击：触摸端第一次点击展开，展开后再次点击进入详情。
function handleMediaCardClick(isHovering: boolean | null | undefined) {
  if (isTouchLikePointer.value && !isMediaCardDetailVisible(isHovering)) {
    activeTouchMediaCardId.value = mediaCardId
    void querySubscribedSeasons()
    void fetchLazyMediaDetail()
    return
  }

  goMediaDetail(isMediaCardActive(isHovering) || isMediaCardDetailVisible(isHovering))
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!isTouchLikePointer.value || activeTouchMediaCardId.value !== mediaCardId) return
  if (!(event.target instanceof Node)) return
  if (mediaCardRef.value?.contains(event.target)) return

  resetMediaCardDetailState()
}

// 点击搜索
async function clickSearch() {
  if (allSites.value?.length == 0) {
    await querySites()
    await querySelectedSites()
  }
  if (allSites.value?.length > 0) {
    openSearchSiteDialog()
  } else {
    handleSearch()
  }
}

// 开始搜索
function handleSearch() {
  router.push({
    path: '/resource',
    query: {
      keyword: getMediaId(),
      type: props.media?.type,
      area: 'title',
      title: props.media?.title,
      year: props.media?.year,
      season: props.media?.season,
      sites: selectedSites.value.join(','),
    },
  })
}

// 搜索多站点
function searchSites(sites: number[]) {
  selectedSites.value = sites
  handleSearch()
}

// 懒加载检查
function handleCheckLazy() {
  if (props.media?.collection_id) {
    return
  }
  handleCheckSubscribe()
  handleCheckExists()
  scheduleViewportDetailPrefetch()
}

// 在元素进入视窗时触发懒加载函数
function setupIntersectionObserver() {
  if (mediaCardRef.value) {
    observer.value = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            // 只要MediaCard进入视窗，就调用懒加载的操作
            handleCheckLazy()
            // 加载后销毁观察者实例
            observer.value?.disconnect()
            observer.value = null
          }
        })
      },
      { threshold: 0.1 },
    )
    observer.value.observe(mediaCardRef.value)
  }
}

// 计算图片地址
const getImgUrl: Ref<string> = computed(() => {
  if (imageLoadError.value) return noImage
  const url = props.media?.poster_path?.replace('original', 'w500') ?? noImage
  return getDisplayImageUrl(url, globalSettings.GLOBAL_IMAGE_CACHE)
})

/** 为当前图片实例绑定不可跨媒体复用的成功与失败回调。 */
const imageRequest = computed(() => {
  const revision = imageRequestRevision.value
  const src = getImgUrl.value
  const usesFallback = imageLoadError.value || !props.media?.poster_path

  return {
    handleError: () => {
      if (revision !== imageRequestRevision.value || usesFallback) return

      isImageLoaded.value = false
      imageLoadError.value = true
      imageRequestRevision.value += 1
    },
    handleLoad: () => {
      if (revision !== imageRequestRevision.value) return

      isImageLoaded.value = true
    },
    key: revision,
    src,
  }
})

// 获取媒体类型文本
function getMediaTypeText(type: string | undefined) {
  if (!type) return ''
  return mediaTypeDict[type]
}

const subscribeActions = useMediaSubscribe({
  media: () => props.media,
  isSubscribed,
  isExists: () => isExists.value,
  subscribedSeasons,
  subscribedSeasonModes,
  primarySeason: () => props.media?.season ?? null,
  getSubscribeStatusKey,
})

watch(isSubscribed, subscribed => {
  subscribedSeasonsLoaded.value = false
  if (!subscribed) {
    subscribedSeasons.value = []
    subscribedSeasonModes.value = {}
  }
})

watch(
  [() => props.media, () => props.media?.poster_path],
  ([media], [previousMedia]) => {
    imageRequestRevision.value += 1
    isImageLoaded.value = false
    imageLoadError.value = false
    // 海报补全只重置图片代际；详情和订阅状态绑定媒体对象身份。
    if (media === previousMedia) return

    resetMediaCardDetailState()
    clearViewportPrefetch()
    const nextMediaId = getMediaSubscribeId(media)
    lazyDetail.value = nextMediaId ? (mediaCardDetailCache.get(nextMediaId) ?? null) : null
    subscribedSeasons.value = []
    subscribedSeasonModes.value = {}
    subscribedSeasonsLoaded.value = false
  },
  { flush: 'sync' },
)

onMounted(() => {
  setupIntersectionObserver()
  if (isTouchLikePointer.value) {
    document.addEventListener('pointerdown', handleDocumentPointerDown)
  }
})

onActivated(resetMediaCardDetailState)
onDeactivated(() => {
  resetMediaCardDetailState()
  clearViewportPrefetch()
})

onBeforeUnmount(() => {
  resetMediaCardDetailState()
  clearViewportPrefetch()
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  observer.value?.disconnect()
  observer.value = null
})
</script>

<template>
  <VHover>
    <template #default="hover">
      <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
      <div
        ref="mediaCardRef"
        v-bind="hover.props"
        class="media-card-hover-area"
        @mouseenter="handleCardMouseEnter"
        @mouseleave="clearHoverDetailTimer"
      >
        <VCard
          :height="props.height"
          :width="props.width"
          :ripple="false"
          class="app-hover-lift-card outline-none media-card"
          :class="{
            'app-hover-lift-card--hovering': isMediaCardActive(hover.isHovering),
            'media-card--image-loaded': isImageLoaded,
            'ring-1': isImageLoaded,
          }"
          @click.stop="handleMediaCardClick(hover.isHovering)"
        >
          <VImg
            :key="imageRequest.key"
            aspect-ratio="2/3"
            :src="imageRequest.src"
            class="media-card__poster object-cover aspect-w-2 aspect-h-3"
            cover
            @load="imageRequest.handleLoad"
            @error="imageRequest.handleError"
          >
            <template #placeholder>
              <div class="w-full h-full">
                <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
              </div>
            </template>
          </VImg>

          <!-- 悬停/触摸展开详情层（直接包含 .media-card-title 以保持测试 parentElement 契约） -->
          <VCardText v-show="isMediaCardDetailVisible(hover.isHovering)" class="media-card__overlay">
            <div class="media-card__overlay-meta">
              <span
                v-if="props.media?.year || getMediaTypeText(props.media?.type)"
                class="media-card__overlay-pill media-card__overlay-year"
              >
                <span class="media-card__type-dot" :class="getTypeDotClass(props.media?.type)" />
                <span>{{ props.media?.year || getMediaTypeText(props.media?.type) }}</span>
              </span>
              <span v-else />
              <span v-if="props.media?.vote_average" class="media-card__overlay-pill media-card__overlay-score">
                <VIcon icon="mdi-star" size="11" class="media-card__score-star" />
                <span>{{ formatCardScore(props.media.vote_average) }}</span>
              </span>
            </div>

            <div class="media-card__overlay-spacer" />

            <h1 class="media-card-title" :title="props.media?.title">
              {{ props.media?.title }}
            </h1>

            <div v-if="cardTagsText || cardActorsText" class="media-card__submeta">
              <p v-if="cardTagsText" class="media-card__meta-line media-card__tags" :title="cardTagsText">
                {{ cardTagsText }}
              </p>
              <p v-if="cardActorsText" class="media-card__meta-line media-card__actors" :title="cardActorsText">
                {{ cardActorsText }}
              </p>
            </div>

            <div v-if="props.media?.collection_id" class="media-card__collection-spacer" @click.stop="" />
            <div v-else class="media-card__actions">
              <IconBtn
                v-if="userStore.superUser"
                icon="mdi-magnify"
                color="white"
                size="x-small"
                class="media-card__action-btn"
                @click.stop="clickSearch"
              />
              <VSpacer />
              <IconBtn
                :icon="isSubscribed ? 'mdi-heart' : 'mdi-heart-outline'"
                :color="isSubscribed ? 'error' : 'white'"
                size="x-small"
                class="media-card__action-btn"
                :class="{ 'media-card__action-btn--subscribed': isSubscribed }"
                @click.stop="handleSubscribe"
              />
            </div>
          </VCardText>

          <!-- 常态左上：轻量类型胶囊（进入详情遮罩时自动退场，不再遮挡文字） -->
          <div
            v-show="isImageLoaded && getMediaTypeText(props.media?.type) && !isMediaCardDetailVisible(hover.isHovering)"
            class="media-card__badge media-card__badge--type"
          >
            <span class="media-card__type-dot" :class="getTypeDotClass(props.media?.type)" />
            <span>{{ getMediaTypeText(props.media?.type) }}</span>
          </div>

          <!-- 常态右上：已入库徽章 或 金星评分胶囊 -->
          <ExistIcon v-if="isExists && !isMediaCardDetailVisible(hover.isHovering)" />
          <div
            v-else-if="isImageLoaded && props.media?.vote_average && !isMediaCardDetailVisible(hover.isHovering)"
            class="media-card__badge media-card__badge--score"
          >
            <VIcon icon="mdi-star" size="11" class="media-card__score-star" />
            <span>{{ formatCardScore(props.media?.vote_average) }}</span>
          </div>

          <!-- 常态右下：底座来源角标 -->
          <div
            v-if="!isMediaCardDetailVisible(hover.isHovering) && isImageLoaded && hasSourceBadge && !imageLoadError"
            class="media-card__source-badge"
          >
            <VIcon v-if="props.media?.source === 'anilist'" color="#02a9ff" icon="mdi-alpha-a-circle" size="16" />
            <VImg
              v-else-if="props.media?.source"
              cover
              :src="sourceIconDict[props.media.source]"
              class="media-card__source-img"
            />
          </div>
        </VCard>
      </div>
    </template>
  </VHover>
</template>
<style scoped lang="scss">
/* stylelint-disable selector-pseudo-class-no-unknown */

.media-card-hover-area {
  inline-size: 100%;
}

.media-card {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--mp-border-card);
  border-radius: 11px !important;
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.14) !important;
  transition:
    border-color 0.2s ease,
    box-shadow 0.22s ease,
    transform 0.22s ease;
}

.media-card__poster :deep(.v-img__img) {
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.media-card.app-hover-lift-card--hovering {
  border-color: rgba(255, 255, 255, 0.22);
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.34) !important;

  .media-card__poster :deep(.v-img__img) {
    transform: scale(1.035);
  }
}

/* 常态微胶囊角标 */
.media-card__badge {
  position: absolute;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  background: rgba(12, 15, 24, 0.9);
  block-size: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.24);
  color: rgba(248, 250, 252, 0.96);
  font-size: 11px;
  font-weight: 600;
  gap: 4px;
  inset-block-start: 7px;
  letter-spacing: 0.01em;
  line-height: 1;
  padding-inline: 6.5px;
  pointer-events: none;
  white-space: nowrap;
}

.media-card__badge--type {
  inset-inline-start: 7px;
}

.media-card__badge--score {
  font-variant-numeric: tabular-nums;
  inset-inline-end: 7px;
}

.media-card__type-dot {
  border-radius: 999px;
  block-size: 5px;
  flex-shrink: 0;
  inline-size: 5px;
}

.media-card__type-dot--movie {
  background: #60a5fa;
  box-shadow: 0 0 6px rgba(96, 165, 250, 0.7);
}

.media-card__type-dot--tv {
  background: #818cf8;
  box-shadow: 0 0 6px rgba(129, 140, 248, 0.7);
}

.media-card__type-dot--other {
  background: #c084fc;
}

.media-card__score-star {
  color: #fbbf24;
}

.media-card__source-badge {
  position: absolute;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  background: rgba(12, 15, 24, 0.9);
  block-size: 20px;
  inline-size: 20px;
  inset-block-end: 6px;
  inset-inline-end: 6px;
  pointer-events: none;
}

.media-card__source-img {
  border-radius: 4px;
  block-size: 14px;
  inline-size: 14px;
}

/* 悬停详情遮罩层：悬浮即直接完整显示，无二次位移动画 */
.media-card__overlay {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  flex-direction: column;
  padding: 7px 10px 9px !important;
  background: linear-gradient(
    180deg,
    rgba(8, 11, 18, 0.44) 0%,
    rgba(8, 11, 18, 0.03) 26%,
    rgba(8, 11, 18, 0.12) 48%,
    rgba(8, 11, 18, 0.82) 70%,
    rgba(8, 11, 18, 0.94) 86%,
    rgba(8, 11, 18, 0.98) 100%
  );
  color: #f8fafc;
  cursor: pointer;
}

.media-card__overlay-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 5px;
  min-block-size: 20px;
}

.media-card__overlay-pill {
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  background: rgba(12, 15, 24, 0.9);
  block-size: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  gap: 4px;
  line-height: 1;
  padding-inline: 6.5px;
  white-space: nowrap;
}

.media-card__overlay-year {
  min-inline-size: 0;
  overflow: hidden;
  color: rgba(248, 250, 252, 0.94);
  font-weight: 600;
  text-overflow: ellipsis;
}

.media-card__overlay-score {
  flex-shrink: 0;
  color: rgba(248, 250, 252, 0.96);
  font-weight: 700;
  gap: 3px;
}

.media-card__overlay-spacer {
  flex: 1 1 auto;
  min-block-size: 12px;
}

.media-card-title {
  display: -webkit-box;
  overflow: hidden;
  margin: 0 0 4px;
  -webkit-box-orient: vertical;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.01em;
  -webkit-line-clamp: 2;
  line-height: 1.32;
  text-overflow: ellipsis;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.68);
}

.media-card__submeta {
  display: flex;
  flex-direction: column;
  margin: 0 0 6px;
  gap: 2px;
  min-inline-size: 0;
}

.media-card__meta-line {
  overflow: hidden;
  margin: 0;
  line-height: 1.38;
  text-overflow: ellipsis;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.65);
  white-space: nowrap;
}

.media-card__tags {
  color: rgba(226, 232, 240, 0.9);
  font-size: 11.5px;
  font-weight: 500;
}

.media-card__actors {
  color: rgba(203, 213, 225, 0.78);
  font-size: 11px;
}

.media-card__collection-spacer {
  block-size: 2px;
}

.media-card__actions {
  display: flex;
  align-items: center;
  margin-block-start: 2px;
  min-block-size: 24px;
}

.media-card__action-btn {
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px !important;
  background: rgba(15, 23, 42, 0.78) !important;
  block-size: 26px !important;
  inline-size: 26px !important;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    transform 0.18s ease;
}

.media-card__action-btn:hover {
  border-color: rgba(255, 255, 255, 0.32);
  background: rgba(30, 41, 59, 0.94) !important;
  transform: scale(1.06);
}

.media-card__action-btn--subscribed {
  border-color: rgba(248, 113, 113, 0.42);
  background: rgba(127, 29, 29, 0.38) !important;
}
</style>
