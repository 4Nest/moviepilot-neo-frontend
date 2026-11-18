<script lang="ts">
import { ref } from 'vue'

const activeTouchMediaCardId = ref<number | null>(null)
let mediaCardIdSeed = 0
</script>

<script lang="ts" setup>
import noImage from '@images/no-image.jpeg'
import { getDisplayImageUrl, getLogoUrl } from '@/utils/imageUtils'
import api from '@/api'
import { formatRating } from '@/@core/utils/formatters'
import type { MediaInfo, Site, Subscribe } from '@/api/types'
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

// 国际化
const { t } = useI18n()

interface MediaCardMedia extends MediaInfo {
  total_episode?: number
  episode_count?: number
}

// 输入参数
const props = defineProps({
  media: Object as PropType<MediaCardMedia>,
  width: String,
  height: String,
})

// 从 provide 中获取全局设置
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
    return mediaId === `${prefix}:${subscribe.media_id}`
  }
  if (subscribe.mediaid) return mediaId === subscribe.mediaid
  if (props.media?.tmdb_id && subscribe.tmdbid) return props.media.tmdb_id === subscribe.tmdbid
  if (props.media?.douban_id && subscribe.doubanid) return props.media.douban_id === subscribe.doubanid
  if (props.media?.bangumi_id && subscribe.bangumiid) return props.media.bangumi_id === subscribe.bangumiid
  if (props.media?.anilist_id && subscribe.anilistid) return props.media.anilist_id === subscribe.anilistid
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
  if (activeTouchMediaCardId.value === mediaCardId) {
    activeTouchMediaCardId.value = null
  }
}

// 处理媒体卡片点击：触摸端第一次点击展开，展开后再次点击进入详情。
function handleMediaCardClick(isHovering: boolean | null | undefined) {
  if (isTouchLikePointer.value && !isMediaCardDetailVisible(isHovering)) {
    activeTouchMediaCardId.value = mediaCardId
    querySubscribedSeasons()
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
onDeactivated(resetMediaCardDetailState)

onBeforeUnmount(() => {
  resetMediaCardDetailState()
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  observer.value?.disconnect()
  observer.value = null
})
</script>

<template>
  <VHover>
    <template #default="hover">
      <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
      <div ref="mediaCardRef" v-bind="hover.props" class="media-card-hover-area" @mouseenter="querySubscribedSeasons">
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
              <span class="media-card__overlay-year">
                <template v-if="props.media?.year">{{ props.media.year }}</template>
                <template v-if="props.media?.year && getMediaTypeText(props.media?.type)"> · </template>
                <template v-if="getMediaTypeText(props.media?.type)">{{
                  getMediaTypeText(props.media?.type)
                }}</template>
              </span>
              <span v-if="props.media?.vote_average" class="media-card__overlay-score">
                <VIcon icon="mdi-star" size="11" />
                <span>{{ formatCardScore(props.media.vote_average) }}</span>
              </span>
            </div>

            <div class="media-card__overlay-spacer" />

            <h1 class="media-card-title">
              {{ props.media?.title }}
            </h1>
            <p v-if="props.media?.overview" class="media-card-overview">
              {{ props.media?.overview }}
            </p>

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

          <!-- 常态左上：轻量磨砂类型胶囊（进入详情遮罩时自动退场，不再遮挡文字） -->
          <div
            v-show="isImageLoaded && getMediaTypeText(props.media?.type) && !isMediaCardDetailVisible(hover.isHovering)"
            class="media-card__badge media-card__badge--type"
          >
            <span class="media-card__type-dot" :class="getTypeDotClass(props.media?.type)" />
            <span>{{ getMediaTypeText(props.media?.type) }}</span>
          </div>

          <!-- 常态右上：已入库徽章 或 磨砂金星评分胶囊 -->
          <ExistIcon v-if="isExists && !isMediaCardDetailVisible(hover.isHovering)" />
          <div
            v-else-if="isImageLoaded && props.media?.vote_average && !isMediaCardDetailVisible(hover.isHovering)"
            class="media-card__badge media-card__badge--score"
          >
            <VIcon icon="mdi-star" size="11" class="media-card__score-star" />
            <span>{{ formatCardScore(props.media?.vote_average) }}</span>
          </div>

          <!-- 常态右下：磨砂底座来源角标 -->
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
.media-card-hover-area {
  inline-size: 100%;
}

.media-card {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px !important;
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.14) !important;
  transition:
    border-color 0.18s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}

.media-card.app-hover-lift-card--hovering {
  border-color: rgba(255, 255, 255, 0.22);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.34) !important;
}

/* 常态磨砂微胶囊角标 */
.media-card__badge {
  position: absolute;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  background: rgba(12, 15, 24, 0.74);
  backdrop-filter: blur(8px);
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
  background: rgba(12, 15, 24, 0.72);
  backdrop-filter: blur(6px);
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

/* 悬停详情遮罩层 */
.media-card__overlay {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  flex-direction: column;
  padding: 9px 10px 9px !important;
  background: linear-gradient(
    180deg,
    rgba(10, 13, 21, 0.56) 0%,
    rgba(10, 13, 21, 0.76) 38%,
    rgba(10, 13, 21, 0.96) 100%
  );
  backdrop-filter: blur(2.5px);
  color: #f8fafc;
  cursor: pointer;
}

.media-card__overlay-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  min-block-size: 18px;
}

.media-card__overlay-year {
  overflow: hidden;
  color: rgba(226, 232, 240, 0.76);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.media-card__overlay-score {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  color: #fbbf24;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  gap: 2px;
  line-height: 1;
}

.media-card__overlay-spacer {
  flex: 1 1 auto;
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
  line-height: 1.3;
  text-overflow: ellipsis;
}

.media-card-overview {
  display: -webkit-box;
  overflow: hidden;
  margin: 0 0 8px;
  -webkit-box-orient: vertical;
  color: rgba(226, 232, 240, 0.76);
  font-size: 11.5px;
  -webkit-line-clamp: 3;
  line-height: 1.45;
  text-overflow: ellipsis;
}

.media-card__collection-spacer {
  block-size: 4px;
}

.media-card__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-start: 1px solid rgba(255, 255, 255, 0.1);
  padding-block-start: 6px;
}

.media-card__action-btn {
  border: 1px solid rgba(255, 255, 255, 0.16) !important;
  border-radius: 7px !important;
  background: rgba(255, 255, 255, 0.08) !important;
  block-size: 26px !important;
  inline-size: 26px !important;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    transform 0.15s ease;

  &:hover {
    border-color: rgba(255, 255, 255, 0.34) !important;
    background: rgba(255, 255, 255, 0.18) !important;
  }
}

.media-card__action-btn--subscribed {
  border-color: rgba(239, 68, 68, 0.4) !important;
  background: rgba(239, 68, 68, 0.16) !important;
}
</style>
