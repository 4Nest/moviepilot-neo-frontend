<script setup lang="ts">
import { useToast } from 'vue-toastification'
import PersonCardSlideView from './PersonCardSlideView.vue'
import MediaCardSlideView from './MediaCardSlideView.vue'
import api from '@/api'
import type {
  ApiResponse,
  MediaInfo,
  MediaRelease,
  MediaSeason,
  NotExistMediaInfo,
  Site,
  Subscribe,
  TmdbEpisode,
} from '@/api/types'
import NoDataFound from '@/components/states/NoDataFound.vue'
import { formatSeasonLabel } from '@/@core/utils/season'
import { formatSeasonEpisode } from '@/@core/utils/formatters'
import router from '@/router'
import { isNullOrEmptyObject } from '@/@core/utils'
import { useI18n } from '@/composables/useChineseText'
import { useGlobalSettingsStore, useUserStore } from '@/stores'
import { openMediaServerItem, openDoubanApp } from '@/utils/appDeepLink'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { getDisplayImageUrl } from '@/utils/imageUtils'
import {
  getMediaSubscribeId,
  getMediaSubscribeIdentity,
  getSubscribeMode,
  useMediaSubscribe,
  type SeasonSubscribeModes,
} from '@/composables/useMediaSubscribe'

const SearchSiteDialog = defineAsyncComponent(() => import('@/components/dialog/SearchSiteDialog.vue'))

// 国际化
const { t } = useI18n()

const $toast = useToast()

// 输入参数
const mediaProps = defineProps({
  mediaid: String,
  title: String,
  year: String,
  type: String,
})

// 从 provide 中获取全局设置
// 全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings
const userStore = useUserStore()

// 媒体详情
const mediaDetail = ref<MediaInfo>({} as MediaInfo)

// 本地是否存在，存在则包括Item信息
const existsItemId = ref('')

// 是否已订阅
const isSubscribed = ref(false)

// 是否已加载完成
const isRefreshed = ref(false)

// 主详情请求失败时与合法空媒体分开展示，并允许用户重试。
const detailLoadFailed = ref(false)

// 存储每一季的集信息
const seasonEpisodesInfo = ref({} as { [key: number]: TmdbEpisode[] })

// 存储存在的季集
const existsEpisodes = ref({} as { [key: number]: number[] })

// 各季缺失状态：0-已入库 1-部分缺失 2-全部缺失，没有数据也是已入库
const seasonsNotExisted = ref<{ [key: number]: number }>({})

// 各季缺失明细，供状态标签悬停提示说明缺了哪些集
const seasonsMissingInfo = ref<{ [key: number]: NotExistMediaInfo }>({})

// 各季的订阅状态
const seasonsSubscribed = ref<{ [key: number]: boolean }>({})

// 各季的订阅模式
const subscribedSeasonModes = ref<SeasonSubscribeModes>({})

// 所有站点
const allSites = ref<Site[]>([])

// 选中的站点
const selectedSites = ref<number[]>([])

// 搜索方式 title/imdbid
const searchType = ref('title')

interface MediaSearchOptions {
  season?: number | null
  episode?: number | null
}

interface EpisodeGroupInfo {
  id: string
  name: string
  group_count: number
  episode_count: number
}

interface EpisodeGroupOption extends EpisodeGroupInfo {
  icon: string
}

// 站点选择后待执行的搜索类型
const pendingSearchResultType = ref<'torrent' | 'subtitle'>('torrent')

// 站点选择后待执行的季集参数
const pendingSearchOptions = ref<MediaSearchOptions>({})

// 首次拉取站点、主订阅、分季订阅及播放防连点加载态
const searchingSites = ref(false)
const mainSubscribing = ref(false)
const seasonSubscribing = ref<{ [key: number]: boolean }>({})
const playingLoading = ref(false)

// 可用剧集组
const episodeGroups = ref<EpisodeGroupInfo[]>([])

// 当前选中的剧集组，空字符串表示 TMDB 默认排序
const selectedEpisodeGroup = ref('')

// 当前自定义剧集组的季信息
const episodeGroupSeasons = ref<MediaSeason[]>([])

// 剧集组列表加载状态
const episodeGroupsLoading = ref(false)

// 自定义剧集组季信息加载状态
const episodeGroupSeasonsLoading = ref(false)

// 剧集组横向轨道
const episodeGroupRail = ref<HTMLElement | null>(null)

// 剧集组轨道左右滚动状态
const canScrollEpisodeGroupsBackward = ref(false)
const canScrollEpisodeGroupsForward = ref(false)

// 防止快速切换剧集组时旧请求覆盖新结果
let episodeGroupSeasonRequestId = 0
let seasonNotExistsRequestId = 0
let episodeExistsRequestId = 0
let seasonEpisodesRequestGeneration = 0

// 打开站点选择弹窗，并把站点选择结果交回详情页执行搜索。
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
    const result: ApiResponse<{ value?: number[] }> = await api.get('system/setting/public/IndexerSites')

    selectedSites.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 获得mediaid
function getMediaId() {
  return getMediaSubscribeId(mediaDetail.value)
}

// 判断详情是否包含可用于后续操作的稳定媒体身份。
function hasMediaIdentity() {
  return Boolean(getMediaId())
}

// 生成当前媒体指定季的订阅状态缓存键
function getSubscribeStatusKey(season: number | null = mediaDetail.value?.season ?? null) {
  return `${getMediaId()}::${season ?? 'all'}`
}

let detailRequestGeneration = 0

// 重置当前媒体的衍生局部状态，避免实例复用切换媒体时残留旧数据
function resetMediaLocalState() {
  mediaDetail.value = {} as MediaInfo
  existsItemId.value = ''
  isSubscribed.value = false
  seasonEpisodesInfo.value = {}
  existsEpisodes.value = {}
  seasonsNotExisted.value = {}
  seasonsMissingInfo.value = {}
  seasonsSubscribed.value = {}
  subscribedSeasonModes.value = {}
  episodeGroups.value = []
  selectedEpisodeGroup.value = ''
  episodeGroupSeasons.value = []
  episodeGroupsLoading.value = false
  episodeGroupSeasonsLoading.value = false
  episodeGroupSeasonRequestId += 1
  seasonNotExistsRequestId += 1
  episodeExistsRequestId += 1
  seasonEpisodesRequestGeneration += 1
}

// 调用API查询详情
async function getMediaDetail() {
  const generation = ++detailRequestGeneration
  resetMediaLocalState()
  if (mediaProps.mediaid && mediaProps.type) {
    detailLoadFailed.value = false
    isRefreshed.value = false
    try {
      const detail: MediaInfo = await api.get(`media/${mediaProps.mediaid}`, {
        params: {
          title: mediaProps.title,
          year: mediaProps.year,
          type_name: mediaProps.type,
        },
      })
      if (generation !== detailRequestGeneration) return
      mediaDetail.value = detail
      if (!hasMediaIdentity()) return

      const supportsEpisodeGroups = getMediaSubscribeIdentity(mediaDetail.value)?.source === 'themoviedb'
      selectedEpisodeGroup.value = supportsEpisodeGroups ? mediaDetail.value.episode_group || '' : ''
      if (!supportsEpisodeGroups) {
        episodeGroups.value = []
        episodeGroupSeasons.value = []
      }
      if (mediaDetail.value.type === '电视剧' && supportsEpisodeGroups && mediaDetail.value.tmdb_id) {
        getEpisodeGroups()
        if (selectedEpisodeGroup.value) loadEpisodeGroupSeasons(selectedEpisodeGroup.value)
      }

      // 检查存在状态
      checkExists()
      if (mediaDetail.value.type === '电视剧') checkSeasonsNotExists()
      // 检查订阅状态
      if (mediaDetail.value.type === '电影') checkMovieSubscribed()
      else checkSeasonsSubscribed()
    } catch (error) {
      if (generation !== detailRequestGeneration) return
      console.error(error)
      detailLoadFailed.value = true
    } finally {
      if (generation === detailRequestGeneration) {
        isRefreshed.value = true
      }
    }
  } else {
    detailLoadFailed.value = false
    isRefreshed.value = true
  }
}

// 调用API加载季集信息（TMDB）
async function loadSeasonEpisodes(season: number) {
  // 加载季集存在信息
  loadEpisodeExists()
  // 加载季集信息
  if (seasonEpisodesInfo.value[season]) return
  const requestGeneration = seasonEpisodesRequestGeneration
  try {
    const params = selectedEpisodeGroup.value ? { episode_group: selectedEpisodeGroup.value } : undefined
    const result: TmdbEpisode[] = await api.get(
      `tmdb/${mediaDetail.value.tmdb_id}/${season}`,
      params ? { params } : undefined,
    )
    if (requestGeneration === seasonEpisodesRequestGeneration) seasonEpisodesInfo.value[season] = result || []
  } catch (error) {
    console.error(error)
  }
}

// 调用API加载季集存在信息（媒体服务器）
async function loadEpisodeExists() {
  // 查询季集存在状态
  if (!isNullOrEmptyObject(existsEpisodes.value)) return
  const requestId = ++episodeExistsRequestId
  try {
    const media = {
      ...mediaDetail.value,
      episode_group: selectedEpisodeGroup.value || '',
    }
    const result: { [key: number]: number[] } = await api.post(`mediaserver/exists_remote`, media)
    if (requestId === episodeExistsRequestId) existsEpisodes.value = result || {}
  } catch (error) {
    console.error(error)
  }
}

// 查询当前媒体是否已入库（数据库）
async function checkExists() {
  try {
    const result: ApiResponse<{ item: { id: string } }> = await api.get('mediaserver/exists', {
      params: {
        tmdbid: mediaDetail.value.tmdb_id,
        title: mediaDetail.value.title,
        year: mediaDetail.value.year,
        season: mediaDetail.value.season,
        mtype: mediaDetail.value.type,
      },
    })

    if (result.success) existsItemId.value = result.data.item.id
  } catch (error) {
    console.error(error)
  }
}

// 查询当前媒体是否已订阅
async function checkSubscribe(season: number | null = null) {
  try {
    return await subscribeActions.checkSubscribe(season)
  } catch (error) {
    console.error(error)
  }

  return false
}

// 判断订阅记录是否属于当前媒体
function isSameSubscribeMedia(subscribe: Subscribe) {
  const mediaId = getMediaId()
  if (subscribe.media_source && subscribe.media_id) {
    const prefix = subscribe.media_source === 'themoviedb' ? 'tmdb' : subscribe.media_source
    return mediaId === `${prefix}:${subscribe.media_id}`
  }
  if (subscribe.mediaid) return mediaId === subscribe.mediaid
  if (mediaDetail.value?.tmdb_id && subscribe.tmdbid) return mediaDetail.value.tmdb_id === subscribe.tmdbid
  if (mediaDetail.value?.douban_id && subscribe.doubanid) return mediaDetail.value.douban_id === subscribe.doubanid
  if (mediaDetail.value?.bangumi_id && subscribe.bangumiid) return mediaDetail.value.bangumi_id === subscribe.bangumiid
  if (mediaDetail.value?.anilist_id && subscribe.anilistid) {
    return mediaDetail.value.anilist_id === subscribe.anilistid
  }
  return false
}

// 检查所有季的缺失状态
async function checkSeasonsNotExists() {
  if (mediaDetail.value.type !== '电视剧') return
  const requestId = ++seasonNotExistsRequestId
  seasonsNotExisted.value = {}
  seasonsMissingInfo.value = {}
  try {
    const media = {
      ...mediaDetail.value,
      episode_group: selectedEpisodeGroup.value || '',
    }
    const result: NotExistMediaInfo[] = await api.post('mediaserver/notexists', media)
    if (requestId === seasonNotExistsRequestId && result) {
      result.forEach(item => {
        // 0-已入库 1-部分缺失 2-全部缺失
        let state = 0
        if (item.episodes.length === 0) state = 2
        else if (item.episodes.length < item.total_episode) state = 1
        seasonsNotExisted.value[item.season] = state
        seasonsMissingInfo.value[item.season] = item
      })
    }
  } catch (error) {
    console.error(error)
  }
}

// 检查电影订阅状态
async function checkMovieSubscribed() {
  if (mediaDetail.value.type !== '电影') return
  isSubscribed.value = await checkSubscribe()
}

// 默认排序的总集数
const defaultEpisodeCount = computed(() =>
  (mediaDetail.value?.season_info ?? []).reduce((total, season) => total + (season.episode_count ?? 0), 0),
)

// 剧集组选项，首项固定为 TMDB 默认排序
const episodeGroupOptions = computed<EpisodeGroupOption[]>(() => [
  {
    id: '',
    name: t('media.episodeGroups.default'),
    group_count: mediaDetail.value?.season_info?.length ?? 0,
    episode_count: defaultEpisodeCount.value,
    icon: 'mdi-layers-outline',
  },
  ...episodeGroups.value.map(group => ({
    ...group,
    icon: 'mdi-folder-play-outline',
  })),
])

// 当前选中的剧集组选项
const selectedEpisodeGroupOption = computed(
  () =>
    episodeGroupOptions.value.find(group => group.id === selectedEpisodeGroup.value) ?? episodeGroupOptions.value[0]!,
)

// 季列表，第0季排在最后
const getMediaSeasons = computed(() => {
  const seasons = selectedEpisodeGroup.value ? episodeGroupSeasons.value : mediaDetail.value?.season_info
  if (!seasons) return []
  return [...seasons].sort((a, b) => {
    if (a.season_number === 0) return 1
    if (b.season_number === 0) return -1
    return (a.season_number || 0) - (b.season_number || 0)
  })
})

// 查询当前媒体可用的剧集组
async function getEpisodeGroups() {
  if (getMediaSubscribeIdentity(mediaDetail.value)?.source !== 'themoviedb' || !mediaDetail.value.tmdb_id) return

  episodeGroupsLoading.value = true
  try {
    const result: EpisodeGroupInfo[] = await api.get(`media/groups/${mediaDetail.value.tmdb_id}`)
    episodeGroups.value = result || []
  } catch (error) {
    console.error(error)
    episodeGroups.value = []
  } finally {
    episodeGroupsLoading.value = false
    nextTick(updateEpisodeGroupScrollState)
  }
}

// 查询指定剧集组的季信息，并忽略过期响应
async function loadEpisodeGroupSeasons(groupId: string) {
  if (getMediaSubscribeIdentity(mediaDetail.value)?.source !== 'themoviedb' || !groupId) {
    episodeGroupSeasons.value = []
    episodeGroupSeasonsLoading.value = false
    return
  }

  const requestId = ++episodeGroupSeasonRequestId
  episodeGroupSeasonsLoading.value = true
  try {
    const result: MediaSeason[] = await api.get(`media/group/seasons/${groupId}`)
    if (requestId === episodeGroupSeasonRequestId) episodeGroupSeasons.value = result || []
  } catch (error) {
    console.error(error)
    if (requestId === episodeGroupSeasonRequestId) episodeGroupSeasons.value = []
  } finally {
    if (requestId === episodeGroupSeasonRequestId) episodeGroupSeasonsLoading.value = false
  }
}

// 切换详情页当前浏览的剧集组
async function setEpisodeGroup(groupId: string) {
  if (selectedEpisodeGroup.value === groupId) return

  selectedEpisodeGroup.value = groupId
  seasonEpisodesInfo.value = {}
  existsEpisodes.value = {}
  episodeGroupSeasons.value = []
  episodeGroupSeasonRequestId += 1
  episodeExistsRequestId += 1
  seasonEpisodesRequestGeneration += 1

  await Promise.all([loadEpisodeGroupSeasons(groupId), checkSeasonsNotExists()])
}

// 刷新剧集组横向轨道的左右滚动按钮状态
function updateEpisodeGroupScrollState() {
  const rail = episodeGroupRail.value
  if (!rail) {
    canScrollEpisodeGroupsBackward.value = false
    canScrollEpisodeGroupsForward.value = false
    return
  }

  const maxScrollLeft = Math.max(rail.scrollWidth - rail.clientWidth, 0)
  canScrollEpisodeGroupsBackward.value = rail.scrollLeft > 4
  canScrollEpisodeGroupsForward.value = rail.scrollLeft < maxScrollLeft - 4
}

// 按一屏内可辨识的距离横向滚动剧集组轨道
function scrollEpisodeGroups(direction: 'backward' | 'forward') {
  const rail = episodeGroupRail.value
  if (!rail) return

  rail.scrollBy({
    behavior: 'smooth',
    left: direction === 'backward' ? -Math.max(rail.clientWidth * 0.72, 240) : Math.max(rail.clientWidth * 0.72, 240),
  })
}

// 检查所有季的订阅状态
async function checkSeasonsSubscribed() {
  if (mediaDetail.value.type !== '电视剧') return
  try {
    const subscribes: Subscribe[] = await api.get('subscribe/')
    const mediaSubscribes = subscribes.filter(
      item => item.type === '电视剧' && item.season !== undefined && isSameSubscribeMedia(item),
    )
    const nextSubscribed: { [key: number]: boolean } = {}
    const nextModes: SeasonSubscribeModes = {}

    mediaDetail.value?.season_info?.forEach(item => {
      const season = item.season_number ?? 0
      nextSubscribed[season] = false
    })

    mediaSubscribes.forEach(item => {
      const season = item.season as number
      nextSubscribed[season] = true
      nextModes[season] = getSubscribeMode(item)
    })

    seasonsSubscribed.value = nextSubscribed
    subscribedSeasonModes.value = nextModes
  } catch (error) {
    console.error(error)
  }
}

// 已订阅季号列表
const subscribedSeasonNumbers = computed(() =>
  Object.entries(seasonsSubscribed.value)
    .filter(([, subscribed]) => subscribed)
    .map(([season]) => Number(season))
    .sort((a, b) => a - b),
)

// 默认季结构中的季号集合
const defaultSubscribeSeasonNumbers = computed(() =>
  (mediaDetail.value?.season_info ?? []).map(season => season.season_number ?? 0),
)

// 当前媒体是否已订阅默认季结构中的全部季
const isAllSeasonsSubscribed = computed(
  () =>
    mediaDetail.value.type === '电视剧' &&
    defaultSubscribeSeasonNumbers.value.length > 0 &&
    defaultSubscribeSeasonNumbers.value.every(season => seasonsSubscribed.value[season]),
)

// 订阅按钮响应；单季入口同时传递详情页当前选择的剧集组。
async function handleSubscribe(season: number | null = null, episodeGroup = '') {
  if (season !== null) {
    if (seasonSubscribing.value[season]) return
    seasonSubscribing.value[season] = true
    try {
      if (seasonsSubscribed.value[season]) {
        await subscribeActions.removeSubscribe(season)
      } else {
        await subscribeActions.openSubscribeSeasonDialog(season, episodeGroup)
      }
    } finally {
      seasonSubscribing.value[season] = false
    }
    return
  }

  if (mainSubscribing.value) return
  mainSubscribing.value = true
  try {
    if (mediaDetail.value.type === '电视剧') {
      await subscribeActions.openSubscribeSeasonDialog()
    } else if (isSubscribed.value) {
      await subscribeActions.removeSubscribe(mediaDetail.value?.season ?? null)
    } else if (existsItemId.value) {
      subscribeActions.handleSubscribe()
    } else {
      await subscribeActions.addSubscribe(null)
    }
  } finally {
    mainSubscribing.value = false
  }
}

// 安全提取运行时长（兼容电影 runtime 与剧集 episode_run_time）
const displayRuntime = computed(() => mediaDetail.value.runtime || mediaDetail.value.episode_run_time?.[0])

interface CrewMemberItem {
  id: number | string
  job?: string
  name: string
  roles?: string[]
  url?: string
}

interface GroupedCrewEntry {
  label: string
  members: Array<{ id: number | string; name: string; url?: string }>
}

const CREW_JOB_LABEL_MAP: Record<string, string> = {
  Creator: '主创',
  Director: '导演',
  'Director of Photography': '摄影',
  Editor: '剪辑',
  'Executive Producer': '执行制片',
  Novel: '原著',
  'Original Music Composer': '配乐',
  Producer: '制片人',
  Screenplay: '编剧',
  Series_Composition: '系列构成',
  Story: '故事',
  Writer: '编剧',
}

const MEDIA_STATUS_LABEL_MAP: Record<string, string> = {
  Released: '已上映',
  'Returning Series': '连载中',
  Ended: '已完结',
  Canceled: '已取消',
  Cancelled: '已取消',
  'In Production': '制作中',
  'Post Production': '后期制作',
  Planned: '筹备中',
  Rumored: '传闻中',
  Pilot: '试播集',
}

function formatMediaStatus(status?: string) {
  if (!status) return ''
  return MEDIA_STATUS_LABEL_MAP[status] ?? status
}

function formatCrewJobLabel(job?: string) {
  if (!job) return '主创'
  return CREW_JOB_LABEL_MAP[job] ?? job
}

const CREW_ROLE_PRIORITY: Record<string, number> = {
  导演: 1,
  主创: 2,
  系列构成: 3,
  编剧: 4,
  故事: 5,
  原著: 6,
  制片人: 7,
  执行制片: 8,
  摄影: 9,
  配乐: 10,
  剪辑: 11,
}

function getCrewRolePriority(label: string) {
  if (label in CREW_ROLE_PRIORITY) return CREW_ROLE_PRIORITY[label]
  for (const [role, priority] of Object.entries(CREW_ROLE_PRIORITY)) {
    if (label.includes(role)) return priority
  }
  return 99
}

// 按职位合并同职能主创人员并按工业标准优先级排序（确保导演始终排在制片人之前）
const groupedTmdbCrew = computed<GroupedCrewEntry[]>(() => {
  const rawList = (mediaDetail.value.directors ?? []) as CrewMemberItem[]
  const map = new Map<string, Array<{ id: number | string; name: string }>>()
  for (const item of rawList) {
    if (!item?.name) continue
    const label = formatCrewJobLabel(item.job)
    let bucket = map.get(label)
    if (!bucket) {
      bucket = []
      map.set(label, bucket)
    }
    if (!bucket.some(existing => existing.id === item.id && existing.name === item.name)) {
      bucket.push({ id: item.id, name: item.name })
    }
  }
  return Array.from(map.entries())
    .map(([label, members]) => ({ label, members }))
    .sort((a, b) => getCrewRolePriority(a.label) - getCrewRolePriority(b.label))
})

// 豆瓣主创同职能归并并按职能优先级排序，保留每位成员独立外链可点击
const groupedDoubanCrew = computed<GroupedCrewEntry[]>(() => {
  const rawList = (mediaDetail.value.directors ?? []) as CrewMemberItem[]
  const map = new Map<string, Array<{ id: number | string; name: string; url?: string }>>()
  for (const item of rawList) {
    if (!item?.name) continue
    const label = item.roles?.length ? joinArray(item.roles) : '主创'
    let bucket = map.get(label)
    if (!bucket) {
      bucket = []
      map.set(label, bucket)
    }
    if (!bucket.some(existing => existing.id === item.id && existing.name === item.name)) {
      bucket.push({ id: item.id, name: item.name, url: item.url })
    }
  }
  return Array.from(map.entries())
    .map(([label, members]) => ({ label, members }))
    .sort((a, b) => getCrewRolePriority(a.label) - getCrewRolePriority(b.label))
})

// 格式化十分制评分显示（如 8.4）
const formattedVoteScore = computed(() => {
  const score = Number(mediaDetail.value.vote_average)
  if (!Number.isFinite(score) || score <= 0) return ''
  return score.toFixed(1)
})

// 提取流派名称列表，供 Hero 区胶囊标签渲染
const displayGenres = computed(() => {
  const rawGenres = (mediaDetail.value.genres ?? []) as Array<string | { name?: string }>
  return rawGenres.map(genre => (typeof genre === 'string' ? genre : genre?.name || '')).filter(Boolean)
})

const hasExternalLinks = computed(() =>
  Boolean(
    mediaDetail.value.tmdb_id ||
    mediaDetail.value.douban_id ||
    mediaDetail.value.imdb_id ||
    mediaDetail.value.tvdb_id ||
    mediaDetail.value.bangumi_id ||
    mediaDetail.value.anilist_id,
  ),
)

const hasActiveCrew = computed(() =>
  Boolean(
    (mediaDetail.value.tmdb_id && groupedTmdbCrew.value.length > 0) ||
    (!mediaDetail.value.tmdb_id && mediaDetail.value.douban_id && groupedDoubanCrew.value.length > 0),
  ),
)

const hasOverviewCardContent = computed(() =>
  Boolean(mediaDetail.value.overview || hasActiveCrew.value || hasExternalLinks.value),
)

// 拼装TheMovieDb地址
function getTheMovieDbLink() {
  const mtype = mediaProps.type === '电影' ? 'movie' : 'tv'
  return `https://www.themoviedb.org/${mtype}/${mediaDetail.value.tmdb_id}`
}

// 处理豆瓣链接点击
async function handleDoubanClick() {
  if (mediaDetail.value.douban_id) {
    await openDoubanApp(
      mediaDetail.value.douban_id,
      mediaDetail.value.type,
      mediaDetail.value.title,
      mediaDetail.value.year,
    )
  }
}

// 拼装IMDB地址
function getImdbLink() {
  return `https://www.imdb.com/title/${mediaDetail.value.imdb_id}`
}

// 拼装TVDB地址
function getTvdbLink() {
  return `https://www.thetvdb.com/series/${mediaDetail.value.tvdb_id}`
}

// 拼装Bangumi地址
function getBangumiLink() {
  return `https://bgm.tv/subject/${mediaDetail.value.bangumi_id}`
}

// 拼装 AniList 地址
function getAniListLink() {
  return `https://anilist.co/anime/${mediaDetail.value.anilist_id}`
}

// 拼装集图片地址
function getEpisodeImage(stillPath: string) {
  if (!stillPath) return ''
  return `https://${globalSettings.TMDB_IMAGE_DOMAIN}/t/p/w500${stillPath}`
}

// TMDB图片转换为w500大小
function getW500Image(url = '') {
  if (!url) return ''
  url = url.replace('original', 'w500')
  return getDisplayImageUrl(url, globalSettings.GLOBAL_IMAGE_CACHE)
}

// 计算Poster地址
const getPosterUrl: Ref<string> = computed(() => {
  const url = mediaDetail.value.poster_path ?? ''
  return getDisplayImageUrl(url, globalSettings.GLOBAL_IMAGE_CACHE)
})

// 计算backdrop地址
const getBackdropUrl: Ref<string> = computed(() => {
  const url = mediaDetail.value.backdrop_path ?? ''
  return getDisplayImageUrl(url, globalSettings.GLOBAL_IMAGE_CACHE)
})

// 获取发行国家名称
const getProductionCountries = computed(() => {
  return mediaDetail.value.production_countries?.map(country => country.name)
})

// 获取发行公司名称
const getProductionCompanies = computed(() => {
  return mediaDetail.value.production_companies?.map(company => company.name)
})

// 获取指定类型的最早发行日期
function getEarliestReleaseDateByType(type: number): MediaRelease | null {
  const filteredDates = mediaDetail.value.release_dates?.filter(date => date.type === type)
  if (!filteredDates || filteredDates.length === 0) return null

  return filteredDates.reduce((earliest, current) =>
    new Date(current.date) < new Date(earliest.date) ? current : earliest,
  )
}

// 获取最早数字发行日期
const getEarliestDigitalReleaseDate = computed(() => getEarliestReleaseDateByType(4))

// 获取最早实体发行日期
const getEarliestPhysicalReleaseDate = computed(() => getEarliestReleaseDateByType(5))

// 计算存在状态的颜色
function getExistColor(season: number) {
  const state = seasonsNotExisted.value[season]
  if (!state) return 'success'

  if (state === 1) return 'warning'
  else if (state === 2) return 'error'
  else return 'success'
}

// 计算存在状态的文本
function getExistText(season: number) {
  const state = seasonsNotExisted.value[season]
  if (!state) return t('media.status.inLibrary')

  if (state === 1) return t('media.status.partiallyMissing')
  else if (state === 2) return t('media.status.missing')
  else return t('media.status.inLibrary')
}

// 计算存在状态的悬停提示，说明判断依据和缺失的集
function getExistHint(season: number) {
  const state = seasonsNotExisted.value[season]
  const info = seasonsMissingInfo.value[season]
  if (!state || !info) return t('media.status.inLibraryHint')
  if (state === 2) return t('media.status.missingHint', { count: info.total_episode })
  return t('media.status.partiallyMissingHint', {
    episodes: formatSeasonEpisode(null, info.episodes),
    count: info.episodes.length,
  })
}

// 判断指定季集是否已存在于媒体服务器
function isEpisodeExists(season: number, episode: number) {
  return existsEpisodes.value[season]?.includes(episode) ?? false
}

// 计算订阅图标
const getSubscribeIcon = computed(() => {
  if (mediaDetail.value.type === '电视剧')
    return subscribedSeasonNumbers.value.length > 0 ? 'mdi-heart' : 'mdi-heart-outline'
  if (isSubscribed.value) return 'mdi-heart'
  else return 'mdi-heart-outline'
})

// 计算订阅按钮文案
const getSubscribeText = computed(() => {
  if (mediaDetail.value.type === '电视剧') {
    if (isAllSeasonsSubscribed.value) return t('media.status.allSeasonsSubscribed')
    if (subscribedSeasonNumbers.value.length > 0) {
      return t('media.status.seasonsSubscribed', { count: subscribedSeasonNumbers.value.length })
    }
    return t('media.actions.subscribe')
  }
  return isSubscribed.value ? t('media.status.subscribed') : t('media.actions.subscribe')
})

// 使用、拼装数组为字符串
function joinArray(arr: string[]) {
  return arr.join('、')
}

// 开始搜索
function handleSearch(resultType: 'torrent' | 'subtitle' = 'torrent', options: MediaSearchOptions = {}) {
  const keyword = getMediaId()
  const season = options.season ?? mediaDetail.value.season
  const episode = options.episode ?? null
  router.push({
    path: '/resource',
    query: {
      keyword,
      type: mediaDetail.value.type,
      area: searchType.value,
      title: mediaDetail.value.title,
      year: mediaDetail.value.year,
      season,
      episode,
      sites: selectedSites.value.join(','),
      result_type: resultType,
    },
  })
}

// 跳转播放页面
async function handlePlay() {
  if (playingLoading.value) return
  playingLoading.value = true
  // 获取播放链接地址
  try {
    const result: ApiResponse<{ item_id: string; server_id: string; server_type: string; url: string }> = await api.get(
      `mediaserver/play/${existsItemId.value}`,
    )
    if (result?.success) {
      // 使用深度链接工具，优先跳转到APP，失败后跳转到网页
      await openMediaServerItem({
        link: result.data.url,
        item_id: result.data.item_id,
        server_id: result.data.server_id,
        server_type: result.data.server_type,
      })
    } else {
      $toast.error(`获取播放链接失败：${result.message}！`)
    }
  } catch (error) {
    console.error(error)
    $toast.error('获取播放链接失败！')
  } finally {
    playingLoading.value = false
  }
}

// 删除订阅处理
function onSubscribeEditRemove() {
  if (mediaDetail.value.type === '电影') checkMovieSubscribed()
  else checkSeasonsSubscribed()
}

const subscribeActions = useMediaSubscribe({
  media: () => mediaDetail.value,
  isSubscribed,
  isExists: () => Boolean(existsItemId.value),
  seasonsSubscribed,
  subscribedSeasons: subscribedSeasonNumbers,
  subscribedSeasonModes,
  primarySeason: () => mediaDetail.value?.season ?? null,
  getSubscribeStatusKey,
  onEditRemove: onSubscribeEditRemove,
})

// 搜索前弹出站点选择框，确认后执行资源或字幕搜索。
async function clickSearch(
  type: string,
  resultType: 'torrent' | 'subtitle' = 'torrent',
  options: MediaSearchOptions = {},
) {
  if (searchingSites.value) return
  searchType.value = type
  pendingSearchResultType.value = resultType
  pendingSearchOptions.value = options
  if (allSites.value?.length == 0) {
    searchingSites.value = true
    try {
      await querySites()
      await querySelectedSites()
    } finally {
      searchingSites.value = false
    }
  }
  if (allSites.value?.length > 0) {
    openSearchSiteDialog()
  } else {
    handleSearch(pendingSearchResultType.value, pendingSearchOptions.value)
  }
}

// 搜索多站点
function searchSites(sites: number[]) {
  selectedSites.value = sites
  handleSearch(pendingSearchResultType.value, pendingSearchOptions.value)
}

// 搜索字幕
async function handleSubtitleSearch() {
  await clickSearch('title', 'subtitle')
}

watch(
  () => [mediaProps.mediaid, mediaProps.type, mediaProps.title, mediaProps.year],
  () => {
    void getMediaDetail()
  },
)

onBeforeMount(() => {
  getMediaDetail()
})

onMounted(() => {
  window.addEventListener('resize', updateEpisodeGroupScrollState)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateEpisodeGroupScrollState)
})
</script>

<template>
  <LoadingBanner v-if="!isRefreshed" class="mt-12" />
  <div v-if="hasMediaIdentity()" class="media-detail-shell">
    <div class="media-page">
      <section class="media-hero-stage" :class="{ 'media-hero-stage--no-backdrop': !(getBackdropUrl || getPosterUrl) }">
        <template v-if="getBackdropUrl || getPosterUrl">
          <div class="vue-media-back vue-media-back-image">
            <VImg class="w-full h-full" position="center 20%" :src="getBackdropUrl || getPosterUrl" cover />
          </div>
          <div class="vue-media-back vue-media-back-overlay" />
        </template>
        <div class="media-header">
          <div class="media-poster">
            <VImg :src="getW500Image(mediaDetail.poster_path)" cover class="object-cover aspect-w-2 aspect-h-3">
              <template #placeholder>
                <div class="w-full h-full">
                  <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
                </div>
              </template>
            </VImg>
          </div>
          <div class="media-title">
            <div v-if="existsItemId" class="media-status">
              <span class="media-in-library-badge">
                <VIcon icon="mdi-check-circle" size="13" class="me-1" />
                <span>{{ t('media.status.inLibrary') }}</span>
              </span>
            </div>
            <h1 class="media-heading">
              <span class="media-heading__text">{{ mediaDetail.title }}</span>
              <span v-if="mediaDetail.year" class="media-heading__year">（{{ mediaDetail.year }}）</span>
            </h1>
            <div v-if="formattedVoteScore || displayRuntime || displayGenres.length > 0" class="media-attributes">
              <span v-if="formattedVoteScore" class="media-inline-score">
                <VIcon icon="mdi-star" size="13" />
                <span>{{ formattedVoteScore }}</span>
              </span>
              <span v-if="displayRuntime" class="media-runtime-pill">
                <VIcon icon="mdi-clock-outline" size="12" />
                <span>{{ displayRuntime }} {{ t('media.minutes') }}</span>
              </span>
              <div v-if="displayGenres.length > 0" class="media-genre-list">
                <span v-for="genre in displayGenres" :key="genre" class="media-genre-pill">{{ genre }}</span>
              </div>
            </div>
            <blockquote v-if="mediaDetail.tagline" class="tagline">
              {{ mediaDetail.tagline }}
            </blockquote>
          </div>
          <div class="media-actions">
            <VBtn
              v-if="userStore.superUser && hasMediaIdentity()"
              size="small"
              variant="outlined"
              rounded="lg"
              class="media-action-button media-action-button--ghost"
              :loading="searchingSites && pendingSearchResultType === 'torrent'"
              :disabled="searchingSites"
            >
              <template #prepend>
                <VIcon icon="mdi-magnify" />
              </template>
              {{ t('media.actions.searchResource') }}
              <VMenu activator="parent" close-on-content-click>
                <VList>
                  <VListItem @click="clickSearch('title')">
                    <VListItemTitle>{{ t('media.search.byTitle') }}</VListItemTitle>
                  </VListItem>
                  <VListItem @click="clickSearch('imdbid')">
                    <VListItemTitle>{{ t('media.search.byImdb') }}</VListItemTitle>
                  </VListItem>
                </VList>
              </VMenu>
            </VBtn>
            <VBtn
              v-if="userStore.superUser && hasMediaIdentity()"
              size="small"
              variant="outlined"
              rounded="lg"
              class="media-action-button media-action-button--ghost"
              :loading="searchingSites && pendingSearchResultType === 'subtitle'"
              :disabled="searchingSites"
              @click="handleSubtitleSearch"
            >
              <template #prepend>
                <VIcon icon="mdi-subtitles-outline" />
              </template>
              {{ t('media.actions.searchSubtitle') }}
            </VBtn>
            <VBtn
              v-if="mediaDetail.type === '电影' || hasMediaIdentity()"
              size="small"
              class="media-action-button"
              :color="isSubscribed || subscribedSeasonNumbers.length > 0 ? 'error' : 'primary'"
              :variant="isSubscribed || subscribedSeasonNumbers.length > 0 ? 'tonal' : 'flat'"
              rounded="lg"
              :loading="mainSubscribing"
              :disabled="mainSubscribing"
              @click="handleSubscribe()"
            >
              <template #prepend>
                <VIcon :icon="getSubscribeIcon" />
              </template>
              {{ getSubscribeText }}
            </VBtn>
            <VBtn
              v-if="existsItemId"
              size="small"
              class="media-action-button media-action-button--play"
              variant="tonal"
              color="primary"
              rounded="lg"
              :loading="playingLoading"
              :disabled="playingLoading"
              @click="handlePlay()"
            >
              <template #prepend>
                <VIcon icon="mdi-play" />
              </template>
              {{ t('media.actions.playOnline') }}
            </VBtn>
          </div>
        </div>
      </section>

      <div class="media-overview">
        <div class="media-overview-left">
          <div v-if="hasOverviewCardContent" class="media-detail-card">
            <section v-if="mediaDetail.overview" class="media-story-block">
              <h2 class="media-section-heading">{{ t('media.overview') }}</h2>
              <p class="media-overview-text">{{ mediaDetail.overview }}</p>
            </section>
            <ul
              v-if="mediaDetail.tmdb_id && groupedTmdbCrew.length"
              class="media-crew"
              :class="{ 'media-crew--standalone': !mediaDetail.overview }"
            >
              <li v-for="group in groupedTmdbCrew" :key="group.label">
                <span class="crew-role">{{ group.label }}</span>
                <div class="crew-members">
                  <template v-for="(member, idx) in group.members" :key="`${member.id}-${member.name}`">
                    <RouterLink
                      :to="`/person?personid=${member.id}&source=themoviedb`"
                      class="crew-name"
                      target="_blank"
                    >
                      {{ member.name }}
                    </RouterLink>
                    <span v-if="idx < group.members.length - 1" class="crew-sep">·</span>
                  </template>
                </div>
              </li>
            </ul>
            <ul
              v-if="!mediaDetail.tmdb_id && mediaDetail.douban_id && groupedDoubanCrew.length"
              class="media-crew"
              :class="{ 'media-crew--standalone': !mediaDetail.overview }"
            >
              <li v-for="group in groupedDoubanCrew" :key="group.label">
                <span class="crew-role">{{ group.label }}</span>
                <div class="crew-members">
                  <template v-for="(member, idx) in group.members" :key="`${member.id}-${member.name}`">
                    <a class="crew-name" :href="`${member.url || ''}`" target="_blank" rel="noopener noreferrer">
                      {{ member.name }}
                    </a>
                    <span v-if="idx < group.members.length - 1" class="crew-sep">·</span>
                  </template>
                </div>
              </li>
            </ul>
            <div
              v-if="hasExternalLinks"
              class="media-ext-links"
              :class="{ 'media-ext-links--standalone': !mediaDetail.overview && !hasActiveCrew }"
            >
              <a
                v-if="mediaDetail.tmdb_id"
                class="inline-flex"
                :href="getTheMovieDbLink()"
                target="_blank"
                rel="noopener noreferrer"
              >
                <div class="media-ext-link-pill">
                  <VIcon icon="mdi-open-in-new" size="13" />
                  <span>TheMovieDb</span>
                </div>
              </a>
              <div v-if="mediaDetail.douban_id" class="inline-flex" @click="handleDoubanClick">
                <div class="media-ext-link-pill">
                  <VIcon icon="mdi-open-in-new" size="13" />
                  <span>豆瓣</span>
                </div>
              </div>
              <a
                v-if="mediaDetail.imdb_id"
                class="inline-flex"
                :href="getImdbLink()"
                target="_blank"
                rel="noopener noreferrer"
              >
                <div class="media-ext-link-pill">
                  <VIcon icon="mdi-open-in-new" size="13" />
                  <span>IMDb</span>
                </div>
              </a>
              <a
                v-if="mediaDetail.tvdb_id"
                class="inline-flex"
                :href="getTvdbLink()"
                target="_blank"
                rel="noopener noreferrer"
              >
                <div class="media-ext-link-pill">
                  <VIcon icon="mdi-open-in-new" size="13" />
                  <span>TheTvDb</span>
                </div>
              </a>
              <a
                v-if="mediaDetail.bangumi_id"
                class="inline-flex"
                :href="getBangumiLink()"
                target="_blank"
                rel="noopener noreferrer"
              >
                <div class="media-ext-link-pill">
                  <VIcon icon="mdi-open-in-new" size="13" />
                  <span>Bangumi</span>
                </div>
              </a>
              <a
                v-if="mediaDetail.anilist_id"
                class="inline-flex"
                :href="getAniListLink()"
                target="_blank"
                rel="noopener noreferrer"
              >
                <div class="media-ext-link-pill">
                  <VIcon icon="mdi-open-in-new" size="13" />
                  <span>AniList</span>
                </div>
              </a>
            </div>
          </div>

          <section v-if="mediaDetail.type === '电视剧' && mediaDetail.tmdb_id" class="media-seasons-section">
            <h2 class="media-section-heading mb-3">
              {{ t('media.seasons') }}
            </h2>
            <div class="flex w-full flex-col space-y-2">
              <div v-if="episodeGroupsLoading || episodeGroupOptions.length > 1" class="episode-group-selector">
                <div class="episode-group-label">{{ t('media.episodeGroups.select') }}</div>
                <VProgressLinear v-if="episodeGroupsLoading" color="primary" indeterminate rounded />
                <template v-else>
                  <div class="episode-group-rail-shell">
                    <button
                      v-if="canScrollEpisodeGroupsBackward"
                      type="button"
                      class="episode-group-nav episode-group-nav--backward"
                      :aria-label="t('media.episodeGroups.previous')"
                      @click="scrollEpisodeGroups('backward')"
                    >
                      <VIcon icon="mdi-chevron-left" />
                    </button>
                    <div
                      ref="episodeGroupRail"
                      class="episode-group-rail"
                      @scroll.passive="updateEpisodeGroupScrollState"
                    >
                      <button
                        v-for="group in episodeGroupOptions"
                        :key="group.id || 'default'"
                        type="button"
                        class="episode-group-option"
                        :class="{ 'episode-group-option--active': selectedEpisodeGroup === group.id }"
                        :aria-pressed="selectedEpisodeGroup === group.id"
                        @click="setEpisodeGroup(group.id)"
                      >
                        <VIcon :icon="group.icon" size="small" class="episode-group-option__icon" />
                        <span class="episode-group-option__text">
                          <span class="episode-group-option__title">{{ group.name }}</span>
                          <span class="episode-group-option__meta">
                            {{
                              t('media.episodeGroups.summary', {
                                seasons: group.group_count,
                                episodes: group.episode_count,
                              })
                            }}
                          </span>
                        </span>
                      </button>
                    </div>
                    <button
                      v-if="canScrollEpisodeGroupsForward"
                      type="button"
                      class="episode-group-nav episode-group-nav--forward"
                      :aria-label="t('media.episodeGroups.next')"
                      @click="scrollEpisodeGroups('forward')"
                    >
                      <VIcon icon="mdi-chevron-right" />
                    </button>
                  </div>
                  <div class="episode-group-current">
                    {{
                      t('media.episodeGroups.current', {
                        name: selectedEpisodeGroupOption.name,
                        seasons: selectedEpisodeGroupOption.group_count,
                        episodes: selectedEpisodeGroupOption.episode_count,
                      })
                    }}
                  </div>
                </template>
              </div>
              <LoadingBanner v-if="episodeGroupSeasonsLoading" class="mt-3" />
              <VExpansionPanels v-else :key="selectedEpisodeGroup || 'default'">
                <VExpansionPanel
                  v-for="season in getMediaSeasons"
                  :key="season.season_number"
                  @group:selected="loadSeasonEpisodes(season.season_number || 0)"
                >
                  <VExpansionPanelTitle>
                    <template #default>
                      <div class="d-flex align-center w-full pr-2">
                        <span class="font-weight-semibold text-body-2">{{
                          season.season_number === 0
                            ? season.name || formatSeasonLabel(0, t('media.specials'))
                            : t('media.seasonNumber', { number: season.season_number })
                        }}</span>
                        <VChip size="x-small" class="ms-2">
                          {{ t('media.episodeCount', { count: season.episode_count }) }}
                        </VChip>
                        <div class="ms-auto d-flex align-center gap-1">
                          <VChip
                            v-if="seasonsNotExisted"
                            :color="getExistColor(season.season_number || 0)"
                            variant="tonal"
                            size="x-small"
                          >
                            {{ getExistText(season.season_number || 0) }}
                            <VTooltip activator="parent" location="top">
                              {{ getExistHint(season.season_number || 0) }}
                            </VTooltip>
                          </VChip>
                          <IconBtn
                            size="small"
                            :color="seasonsSubscribed[season.season_number || 0] ? 'error' : undefined"
                            variant="text"
                            :loading="Boolean(seasonSubscribing[season.season_number || 0])"
                            :disabled="Boolean(seasonSubscribing[season.season_number || 0])"
                            @click.stop="handleSubscribe(season.season_number ?? null, selectedEpisodeGroup)"
                          >
                            <VIcon
                              size="18"
                              :icon="seasonsSubscribed[season.season_number || 0] ? 'mdi-heart' : 'mdi-heart-outline'"
                            />
                          </IconBtn>
                        </div>
                      </div>
                    </template>
                  </VExpansionPanelTitle>
                  <VExpansionPanelText>
                    <template #default>
                      <LoadingBanner v-if="!seasonEpisodesInfo[season.season_number || 0]" class="mt-3" />
                      <div class="media-episode-list flex flex-col justify-center">
                        <div
                          v-for="episode in seasonEpisodesInfo[season.season_number || 0]"
                          :key="episode.episode_number"
                          class="media-episode-row flex flex-col space-y-3 py-3.5 xl:flex-row xl:items-start xl:space-y-0 xl:space-x-4"
                        >
                          <div class="episode-info flex-1">
                            <VIcon
                              v-if="isEpisodeExists(season.season_number || 0, episode.episode_number || 0)"
                              color="success"
                              icon="mdi-check-circle"
                              class="episode-exists-badge"
                              size="small"
                            />
                            <div
                              class="flex flex-col space-y-1.5 lg:flex-row lg:items-center lg:space-y-0 lg:space-x-2"
                            >
                              <h3 class="media-episode-title">{{ episode.episode_number }} - {{ episode.name }}</h3>
                              <div v-if="episode.air_date" class="flex items-center space-x-2">
                                <span class="media-episode-date">
                                  {{ episode.air_date }}
                                </span>
                              </div>
                            </div>
                            <p v-if="episode.overview" class="media-episode-overview">{{ episode.overview }}</p>
                          </div>
                          <VImg
                            v-if="episode.still_path"
                            cover
                            width="176"
                            max-width="176"
                            aspect-ratio="16/9"
                            class="media-episode-still rounded-lg flex-grow-0 flex-shrink-0"
                            :src="getEpisodeImage(episode.still_path)"
                            alt=""
                          />
                        </div>
                      </div>
                    </template>
                  </VExpansionPanelText>
                </VExpansionPanel>
              </VExpansionPanels>
            </div>
          </section>
        </div>
        <div v-if="mediaDetail.tmdb_id" class="media-overview-right">
          <div class="media-facts">
            <div v-if="formattedVoteScore" class="media-ratings">
              <div class="media-ratings__score-group">
                <VIcon icon="mdi-star" size="16" class="media-ratings__star-icon" />
                <span class="media-ratings__score">{{ formattedVoteScore }}</span>
                <span class="media-ratings__scale">/ 10</span>
              </div>
              <VRating
                :model-value="(mediaDetail.vote_average || 0) / 2"
                density="compact"
                length="5"
                size="14"
                half-increments
                readonly
              />
            </div>
            <div v-if="mediaDetail.tmdb_id" class="media-fact">
              <span>TMDB ID</span>
              <span class="media-fact-value media-fact-value--mono">{{ mediaDetail.tmdb_id }}</span>
            </div>
            <div v-if="mediaDetail.original_title || mediaDetail.original_name" class="media-fact">
              <span>{{ t('media.info.originalTitle') }}</span>
              <span class="media-fact-value">{{ mediaDetail.original_title || mediaDetail.original_name }}</span>
            </div>
            <div v-if="mediaDetail.status" class="media-fact">
              <span>{{ t('media.info.status') }}</span>
              <span class="media-fact-value">{{ formatMediaStatus(mediaDetail.status) }}</span>
            </div>
            <div v-if="mediaDetail.release_date || mediaDetail.first_air_date" class="media-fact">
              <span>{{ t('media.info.releaseDate') }}</span>
              <span class="media-fact-value">
                <span class="media-fact-inline">
                  <VIcon icon="mdi-calendar-blank-outline" size="13" class="media-fact-icon" />
                  <span class="media-fact-value--mono">{{
                    mediaDetail.release_date || mediaDetail.first_air_date
                  }}</span>
                </span>
              </span>
            </div>
            <div v-if="mediaDetail.type === '电影' && getEarliestDigitalReleaseDate" class="media-fact">
              <span>{{ t('media.info.digitalRelease') }}</span>
              <span class="media-fact-value">
                <span class="media-fact-inline">
                  <span class="media-iso-badge">{{ getEarliestDigitalReleaseDate.iso_code }}</span>
                  <span class="media-fact-value--mono">{{ getEarliestDigitalReleaseDate.date.slice(0, 10) }}</span>
                </span>
              </span>
            </div>
            <div v-if="mediaDetail.type === '电影' && getEarliestPhysicalReleaseDate" class="media-fact">
              <span>{{ t('media.info.physicalRelease') }}</span>
              <span class="media-fact-value">
                <span class="media-fact-inline">
                  <span class="media-iso-badge">{{ getEarliestPhysicalReleaseDate.iso_code }}</span>
                  <span class="media-fact-value--mono">{{ getEarliestPhysicalReleaseDate.date.slice(0, 10) }}</span>
                </span>
              </span>
            </div>
            <div v-if="mediaDetail.original_language" class="media-fact">
              <span>{{ t('media.info.originalLanguage') }}</span>
              <span class="media-fact-value media-fact-value--upper">{{ mediaDetail.original_language }}</span>
            </div>
            <div v-if="getProductionCountries?.length" class="media-fact">
              <span>{{ t('media.info.productionCountries') }}</span>
              <span class="media-fact-value media-fact-stack">
                <span v-for="country in getProductionCountries" :key="country">{{ country }}</span>
              </span>
            </div>
            <div v-if="getProductionCompanies?.length" class="media-fact border-b-0">
              <span>{{ t('media.info.productionCompanies') }}</span>
              <span class="media-fact-value media-fact-stack">
                <span v-for="company in getProductionCompanies" :key="company">{{ company }}</span>
              </span>
            </div>
          </div>
        </div>
        <div v-else-if="mediaDetail.douban_id" class="media-overview-right">
          <div class="media-facts">
            <div v-if="formattedVoteScore" class="media-ratings">
              <div class="media-ratings__score-group">
                <VIcon icon="mdi-star" size="16" class="media-ratings__star-icon" />
                <span class="media-ratings__score">{{ formattedVoteScore }}</span>
                <span class="media-ratings__scale">/ 10</span>
              </div>
              <VRating
                :model-value="(mediaDetail.vote_average || 0) / 2"
                density="compact"
                length="5"
                size="14"
                half-increments
                readonly
              />
            </div>
            <div v-if="mediaDetail.douban_id" class="media-fact">
              <span>{{ t('media.info.doubanId') }}</span>
              <span class="media-fact-value media-fact-value--mono">{{ mediaDetail.douban_id }}</span>
            </div>
            <div v-if="mediaDetail.original_title" class="media-fact">
              <span>{{ t('media.info.originalTitle') }}</span>
              <span class="media-fact-value">{{ mediaDetail.original_title }}</span>
            </div>
            <div v-if="mediaDetail.release_date" class="media-fact">
              <span>{{ t('media.info.releaseDate') }}</span>
              <span class="media-fact-value media-fact-value--mono">
                {{ mediaDetail.release_date }}
              </span>
            </div>
            <div v-if="getProductionCountries?.length" class="media-fact border-b-0">
              <span>{{ t('media.info.productionCountries') }}</span>
              <span class="media-fact-value media-fact-stack">
                <span v-for="country in getProductionCountries" :key="country">{{ country }}</span>
              </span>
            </div>
          </div>
        </div>
        <div v-else-if="mediaDetail.bangumi_id || mediaDetail.anilist_id" class="media-overview-right">
          <div class="media-facts">
            <div v-if="formattedVoteScore" class="media-ratings">
              <div class="media-ratings__score-group">
                <VIcon icon="mdi-star" size="16" class="media-ratings__star-icon" />
                <span class="media-ratings__score">{{ formattedVoteScore }}</span>
                <span class="media-ratings__scale">/ 10</span>
              </div>
              <VRating
                :model-value="(mediaDetail.vote_average || 0) / 2"
                density="compact"
                length="5"
                size="14"
                half-increments
                readonly
              />
            </div>
            <div v-if="mediaDetail.bangumi_id" class="media-fact">
              <span>Bangumi ID</span>
              <span class="media-fact-value media-fact-value--mono">{{ mediaDetail.bangumi_id }}</span>
            </div>
            <div v-if="mediaDetail.anilist_id" class="media-fact">
              <span>AniList ID</span>
              <span class="media-fact-value media-fact-value--mono">{{ mediaDetail.anilist_id }}</span>
            </div>
            <div v-if="mediaDetail.original_title" class="media-fact">
              <span>{{ t('media.info.originalTitle') }}</span>
              <span class="media-fact-value">{{ mediaDetail.original_title }}</span>
            </div>
            <div v-if="mediaDetail.release_date" class="media-fact border-b-0">
              <span>{{ t('media.info.releaseDate') }}</span>
              <span class="media-fact-value media-fact-value--mono">
                {{ mediaDetail.release_date }}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div class="media-related-stack">
        <div v-if="mediaDetail.tmdb_id">
          <PersonCardSlideView
            :apipath="`tmdb/credits/${mediaDetail.tmdb_id}/${mediaProps.type}`"
            :linkurl="`/credits/tmdb/credits/${mediaDetail.tmdb_id}/${mediaProps.type}?title=${t(
              'media.castAndCrew',
            )}&type=tmdb`"
            :title="t('media.castAndCrew')"
            type="tmdb"
          />
        </div>
        <div v-else-if="mediaDetail.douban_id">
          <PersonCardSlideView
            :apipath="`douban/credits/${mediaDetail.douban_id}/${mediaProps.type}`"
            :linkurl="`/credits/douban/credits/${mediaDetail.douban_id}/${mediaProps.type}?title=${t(
              'media.castAndCrew',
            )}&type=douban`"
            :title="t('media.castAndCrew')"
            type="douban"
          />
        </div>
        <div v-else-if="mediaDetail.bangumi_id">
          <PersonCardSlideView
            :apipath="`bangumi/credits/${mediaDetail.bangumi_id}`"
            :linkurl="`/credits/bangumi/credits/${mediaDetail.bangumi_id}?title=${t('media.castAndCrew')}&type=bangumi`"
            :title="t('media.castAndCrew')"
            type="bangumi"
          />
        </div>
        <div v-else-if="mediaDetail.anilist_id">
          <PersonCardSlideView
            :apipath="`anilist/credits/${mediaDetail.anilist_id}`"
            :linkurl="`/credits/anilist/credits/${mediaDetail.anilist_id}?title=${t('media.castAndCrew')}&type=anilist`"
            :title="t('media.castAndCrew')"
            type="anilist"
          />
        </div>
        <div v-if="mediaDetail.tmdb_id">
          <MediaCardSlideView
            :apipath="`tmdb/recommend/${mediaDetail.tmdb_id}/${mediaProps.type}`"
            :linkurl="`/browse/tmdb/recommend/${mediaDetail.tmdb_id}/${mediaProps.type}?title=${t(
              'media.recommendations',
            )}`"
            :title="t('media.recommendations')"
          />
        </div>
        <div v-else-if="mediaDetail.douban_id">
          <MediaCardSlideView
            :apipath="`douban/recommend/${mediaDetail.douban_id}/${mediaProps.type}`"
            :linkurl="`/browse/douban/recommend/${mediaDetail.douban_id}/${mediaProps.type}?title=${t(
              'media.recommendations',
            )}`"
            :title="t('media.recommendations')"
          />
        </div>
        <div v-else-if="mediaDetail.bangumi_id">
          <MediaCardSlideView
            :apipath="`bangumi/recommend/${mediaDetail.bangumi_id}`"
            :linkurl="`/browse/bangumi/recommend/${mediaDetail.bangumi_id}?title=${t('media.recommendations')}`"
            :title="t('media.recommendations')"
          />
        </div>
        <div v-else-if="mediaDetail.anilist_id">
          <MediaCardSlideView
            :apipath="`anilist/recommend/${mediaDetail.anilist_id}`"
            :linkurl="`/browse/anilist/recommend/${mediaDetail.anilist_id}?title=${t('media.recommendations')}`"
            :title="t('media.recommendations')"
          />
        </div>
        <div v-if="mediaDetail.tmdb_id">
          <MediaCardSlideView
            :apipath="`tmdb/similar/${mediaDetail.tmdb_id}/${mediaProps.type}`"
            :linkurl="`/browse/tmdb/similar/${mediaDetail.tmdb_id}/${mediaProps.type}?title=${t('media.similar')}`"
            :title="t('media.similar')"
          />
        </div>
      </div>
    </div>
  </div>
  <NoDataFound
    v-if="detailLoadFailed"
    error-code="500"
    :error-title="t('media.error.title')"
    :error-description="t('error.networkError')"
  >
    <template #button>
      <VBtn prepend-icon="mdi-refresh" variant="tonal" @click="getMediaDetail">{{ t('common.retry') }}</VBtn>
    </template>
  </NoDataFound>
  <NoDataFound
    v-else-if="!hasMediaIdentity() && isRefreshed"
    error-code="500"
    :error-title="t('media.error.title')"
    :error-description="t('media.error.noMediaInfo')"
  />
</template>

<style lang="scss" scoped>
.media-detail-shell {
  inline-size: 100%;
  min-inline-size: 0;
}

.media-page {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
}

// 闭合式宽银幕 Hero 舞台：彻底消除绝对定位背景硬切文字与不同影片上下跳动问题
.media-hero-stage {
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: flex-end;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background:
    radial-gradient(120% 100% at 15% 0%, rgba(56, 189, 248, 0.14), transparent 55%),
    linear-gradient(135deg, #121621 0%, #191e2c 100%);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
  min-block-size: 17.5rem;
  padding-block: 1.25rem;
  padding-inline: 1.25rem;
}

.media-hero-stage--no-backdrop {
  background:
    radial-gradient(90% 120% at 88% 12%, rgba(var(--v-theme-primary), 0.2), transparent 62%),
    radial-gradient(70% 100% at 8% 100%, rgba(99, 102, 241, 0.14), transparent 58%),
    linear-gradient(135deg, #131824 0%, #1b2232 100%);
}

@media (width >= 1280px) {
  .media-hero-stage {
    min-block-size: 20rem;
    padding-block: 1.375rem;
    padding-inline: 1.5rem;
  }
}

.vue-media-back {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

.vue-media-back-image {
  opacity: 0.94;
}

.vue-media-back-overlay {
  background:
    linear-gradient(180deg, rgba(12, 15, 23, 0.14) 0%, rgba(12, 15, 23, 0.44) 52%, rgba(12, 15, 23, 0.92) 100%),
    linear-gradient(
      90deg,
      rgba(12, 15, 23, 0.88) 0%,
      rgba(12, 15, 23, 0.48) 38%,
      rgba(12, 15, 23, 0.22) 68%,
      rgba(12, 15, 23, 0.68) 100%
    );
}

.media-header {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  inline-size: 100%;
}

@media (width >= 1280px) {
  .media-header {
    flex-direction: row;
    align-items: flex-end;
    gap: 1.375rem;
  }
}

.media-overview {
  display: flex;
  flex-direction: column;
  gap: 1.125rem;
  margin-block-start: 1.125rem;
}

@media (width >= 1024px) {
  .media-overview {
    flex-direction: row;
    align-items: flex-start;
    gap: 1.125rem;
  }
}

.media-poster {
  flex-shrink: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.42);
  inline-size: 7.75rem;
  transition: border-radius 0.2s ease;
}

@media (width >= 768px) {
  .media-poster {
    inline-size: 9.5rem;
  }
}

@media (width >= 1280px) {
  .media-poster {
    inline-size: 10.5rem;
  }
}

.media-title {
  display: flex;
  flex: 1 1 0%;
  flex-direction: column;
  align-items: center;
  margin-block-start: 0.875rem;
  min-inline-size: 0;
  text-align: center;
}

@media (width >= 1280px) {
  .media-title {
    align-items: flex-start;
    margin-block-start: 0;
    padding-block-end: 2px;
    text-align: start;
  }
}

.media-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: center;
  color: #f8fafc;
  font-size: 1.375rem;
  font-weight: 700;
  gap: 0.25rem;
  letter-spacing: -0.015em;
  line-height: 1.25;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.45);
}

@media (width >= 1280px) {
  .media-heading {
    justify-content: flex-start;
    font-size: 1.6875rem;
  }
}

.media-heading__year {
  color: rgba(241, 245, 249, 0.66);
  font-size: 1.0625rem;
  font-weight: 500;
}

.media-inline-score {
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(245, 158, 11, 0.28);
  border-radius: 6px;
  background: rgba(245, 158, 11, 0.16);
  color: #fbbf24;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  gap: 3px;
  line-height: 1.25;
  padding-block: 2px;
  padding-inline: 7px;
}

.media-runtime-pill {
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  background: rgba(12, 15, 24, 0.88);
  color: rgba(241, 245, 249, 0.9);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  gap: 4px;
  line-height: 1.25;
  padding-block: 2px;
  padding-inline: 7px;
}

.media-genre-list {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 5px;
}

@media (width >= 1280px) {
  .media-genre-list {
    justify-content: flex-start;
  }
}

.media-genre-pill {
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  background: rgba(12, 15, 24, 0.88);
  color: rgba(248, 250, 252, 0.92);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.25;
  padding-block: 2px;
  padding-inline: 8px;
}

.media-detail-card {
  border: 1px solid var(--mp-border-card);
  border-radius: 12px;
  background: rgb(var(--v-theme-surface));
  padding-block: 18px;
  padding-inline: 20px;
}

.media-story-block {
  margin-block-end: 0;
}

.media-section-heading {
  display: flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), 0.94);
  font-size: 0.9375rem;
  font-weight: 600;
  gap: 8px;
  letter-spacing: 0.01em;
  line-height: 1.35;
  margin-block-end: 0.625rem;

  &::before {
    border-radius: 999px;
    background: rgb(var(--v-theme-primary));
    block-size: 14px;
    content: '';
    flex-shrink: 0;
    inline-size: 3px;
  }
}

.media-overview-text {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.82);
  font-size: 0.859375rem;
  line-height: 1.72;
}

ul.media-crew {
  display: grid;
  padding: 0;
  border-block-start: 1px solid var(--mp-border-subtle);
  gap: 12px 20px;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 150px), 1fr));
  list-style: none;
  margin-block-start: 1rem;
  padding-block-start: 0.9375rem;
}

ul.media-crew.media-crew--standalone {
  border-block-start: 0;
  margin-block-start: 0;
  padding-block-start: 0;
}

ul.media-crew > li {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-inline-size: 0;
}

.crew-role {
  color: rgba(var(--v-theme-on-surface), 0.48);
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.3;
}

.crew-members {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 5px;
  line-height: 1.4;
}

.crew-sep {
  color: rgba(var(--v-theme-on-surface), 0.32);
  font-size: 12px;
}

a.crew-name {
  color: rgba(var(--v-theme-on-surface), 0.92);
  font-size: 13px;
  font-weight: 500;
  overflow-wrap: anywhere;
  transition: color 0.15s ease;
  word-break: normal;

  &:hover {
    color: rgb(var(--v-theme-primary));
  }
}

.media-status {
  margin-block-end: 0.4375rem;
}

.media-in-library-badge {
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(34, 197, 94, 0.42);
  border-radius: 6px;
  background: rgba(14, 42, 28, 0.92);
  color: #4ade80;
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1.25;
  padding-block: 2px;
  padding-inline: 8px;
  white-space: nowrap;
}

.media-ext-links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  border-block-start: 1px solid var(--mp-border-subtle);
  gap: 6px;
  margin-block-start: 0.9375rem;
  padding-block-start: 0.875rem;
}

.media-ext-links--standalone {
  border-block-start: 0;
  margin-block-start: 0;
  padding-block-start: 0;
}

.media-ext-link-pill {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 6px;
  background: var(--mp-item-bg);
  color: rgba(var(--v-theme-on-surface), 0.78);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  gap: 4px;
  line-height: 1.3;
  padding-block: 3.5px;
  padding-inline: 9px;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease,
    color 0.16s ease;

  &:hover {
    border-color: var(--mp-border-hover);
    background: var(--mp-item-active-bg);
    color: rgba(var(--v-theme-on-surface), 0.96);
  }
}

.media-seasons-section {
  margin-block-start: 1.125rem;
}

.media-related-stack {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-block-start: 1.25rem;
}

.media-episode-list > .media-episode-row + .media-episode-row {
  border-block-start: 1px solid var(--mp-border-subtle);
}

.media-episode-title {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.94);
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.4;
}

.media-episode-overview {
  margin: 0.25rem 0 0;
  color: rgba(var(--v-theme-on-surface), 0.68);
  font-size: 0.78125rem;
  line-height: 1.55;
}

.media-episode-still {
  flex: 0 0 auto !important;
  border: 1px solid var(--mp-border-subtle);
  inline-size: 176px;
  max-inline-size: 176px;
}

.media-episode-date {
  display: inline-flex;
  align-items: center;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.25rem;
  padding-block: 1px;
  padding-inline: 8px;
  white-space: nowrap;
}

.media-attributes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px;
  line-height: 1.4;
  margin-block-start: 0.5rem;
}

@media (width >= 1280px) {
  .media-attributes {
    justify-content: flex-start;
  }
}

.media-actions {
  --media-action-gap: 0.5rem;

  position: relative;
  display: grid;
  flex-shrink: 0;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--media-action-gap);
  inline-size: min(100%, 20rem);
  justify-content: center;
  margin-block-start: 1rem;
}

.media-action-button {
  inline-size: 100%;
  min-inline-size: 0;
}

.media-action-button--ghost {
  border-color: rgba(255, 255, 255, 0.2) !important;
  background: rgba(12, 15, 24, 0.9) !important;
  color: #f8fafc !important;

  &:hover {
    border-color: rgba(255, 255, 255, 0.36) !important;
    background: rgba(24, 30, 44, 0.94) !important;
  }
}

.media-action-button--play {
  border: 1px solid rgba(var(--v-theme-primary), 0.45) !important;
  background: rgba(12, 15, 24, 0.9) !important;
}

.media-actions > .media-action-button:only-child,
.media-actions > .media-action-button:last-child:nth-child(odd):not(:first-child) {
  grid-column: 1 / -1;
  inline-size: calc((100% - var(--media-action-gap)) / 2);
  justify-self: center;
}

@media (width >= 1280px) {
  .media-actions {
    margin-block-start: 0;
    padding-block-end: 2px;
  }
}

@media (width >= 640px) {
  .media-actions {
    display: flex;
    gap: 0.5rem;
    inline-size: auto;
    justify-content: flex-end;
  }

  .media-action-button,
  .media-actions > .media-action-button:only-child,
  .media-actions > .media-action-button:last-child:nth-child(odd):not(:first-child) {
    inline-size: auto;
  }
}

.media-overview-left {
  flex: 1 1 0%;
  min-inline-size: 0;
}

.episode-group-selector {
  display: grid;
  gap: 0.5rem;
  margin-block-end: 0.5rem;
  min-inline-size: 0;
}

.episode-info {
  position: relative;
  min-inline-size: 0;
  padding-inline-end: 2rem;
}

.episode-exists-badge {
  position: absolute;
  inset-block-start: 0.125rem;
  inset-inline-end: 0;
}

.episode-group-label {
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 0.75rem;
  line-height: 1rem;
}

.episode-group-rail-shell {
  position: relative;
  min-inline-size: 0;
}

.episode-group-rail {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  padding-block: 0.125rem 0.375rem;
  scroll-behavior: smooth;
  scroll-snap-type: inline proximity;
  scrollbar-width: none;
}

.episode-group-rail::-webkit-scrollbar {
  display: none;
}

.episode-group-option {
  display: inline-flex;
  flex: 0 0 12rem;
  align-items: center;
  border: 1px solid var(--mp-border-card);
  border-radius: var(--app-control-radius);
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  gap: 0.625rem;
  min-inline-size: 0;
  padding-block: 0.625rem;
  padding-inline: 0.75rem;
  scroll-snap-align: start;
  text-align: start;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease,
    color 0.16s ease;
}

.episode-group-option:hover {
  border-color: rgba(var(--v-theme-primary), 0.5);
  background: var(--mp-elevated-bg);
}

.episode-group-option--active {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.18);
  color: rgb(var(--v-theme-primary));
}

.episode-group-option--active:hover {
  background: rgba(var(--v-theme-primary), 0.24);
}

.episode-group-option:focus-visible,
.episode-group-nav:focus-visible {
  outline: 2px solid rgba(var(--v-theme-primary), 0.45);
  outline-offset: 2px;
}

.episode-group-option__icon {
  flex: 0 0 auto;
}

.episode-group-option__text {
  display: grid;
  min-inline-size: 0;
}

.episode-group-option__title,
.episode-group-option__meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.episode-group-option__title {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.125rem;
}

.episode-group-option__meta {
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 0.75rem;
  line-height: 1rem;
}

.episode-group-option--active .episode-group-option__meta {
  color: rgba(var(--v-theme-primary), 0.82);
}

.episode-group-nav {
  position: absolute;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--mp-border-hover);
  border-radius: 9999px;
  background: var(--mp-elevated-bg);
  block-size: 2.5rem;
  color: rgb(var(--v-theme-on-surface));
  inline-size: 2.5rem;
  inset-block-start: 50%;
  transform: translateY(-55%);
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease,
    color 0.16s ease;
}

.episode-group-nav:hover {
  border-color: rgba(var(--v-theme-primary), 0.45);
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-primary));
}

.episode-group-nav--backward {
  inset-inline-start: -0.5rem;
}

.episode-group-nav--forward {
  inset-inline-end: -0.5rem;
}

.episode-group-current {
  color: rgba(var(--v-theme-on-surface), 0.66);
  font-size: 0.8125rem;
  line-height: 1.25rem;
}

@media (width <= 640px) {
  .episode-group-option {
    flex-basis: 9.75rem;
    padding-block: 0.5625rem;
    padding-inline: 0.625rem;
  }

  .episode-group-nav {
    display: none;
  }

  .episode-group-current {
    font-size: 0.75rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .episode-group-rail {
    scroll-behavior: auto;
  }
}

.media-overview-right {
  flex-shrink: 0;
  inline-size: 100%;
}

@media (width >= 1024px) {
  .media-overview-right {
    inline-size: 19rem;
  }
}

.media-facts {
  overflow: hidden;
  border: 1px solid var(--mp-border-card);
  border-radius: 12px;
  background: rgb(var(--v-theme-surface));
  font-size: 12.5px;
  line-height: 1.4;
}

.media-ratings {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-end: 1px solid var(--mp-border-subtle);
  background: rgba(var(--v-theme-on-surface), 0.02);
  padding-block: 10px;
  padding-inline: 14px;
}

.media-ratings__score-group {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
}

.media-ratings__star-icon {
  align-self: center;
  color: #f59e0b;
}

.media-ratings__score {
  color: rgb(var(--v-theme-on-surface));
  font-size: 16px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  line-height: 1;
}

.media-ratings__scale {
  color: rgba(var(--v-theme-on-surface), 0.45);
  font-size: 11.5px;
  font-weight: 500;
}

.media-fact {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  border-block-end: 1px solid var(--mp-border-subtle);
  padding-block: 7.5px;
  padding-inline: 14px;

  > span:first-child {
    flex-shrink: 0;
    color: rgba(var(--v-theme-on-surface), 0.54);
    font-size: 12px;
    font-weight: 500;
  }

  .media-fact-value {
    color: rgba(var(--v-theme-on-surface), 0.9);
    font-size: 12.5px;
    font-weight: 500;
    min-inline-size: 0;
    overflow-wrap: anywhere;
    text-align: end;
  }
}

.media-fact-value--mono {
  font-variant-numeric: tabular-nums;
}

.media-fact-value--upper {
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.media-fact-inline {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
}

.media-fact-icon {
  color: rgba(var(--v-theme-on-surface), 0.48);
}

.media-iso-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--mp-border-hover);
  border-radius: 4px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  block-size: 15px;
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.03em;
  line-height: 1;
  padding-inline: 4px;
}

.media-fact-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  line-height: 1.35;
}

.tagline {
  margin: 0.625rem 0 0;
  border-inline-start: 2px solid rgba(251, 191, 36, 0.78);
  color: rgba(241, 245, 249, 0.8);
  font-size: 0.875rem;
  font-style: italic;
  line-height: 1.45;
  max-inline-size: 42rem;
  padding-inline-start: 9px;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.5);
}

@media (width <= 600px) {
  .media-hero-stage {
    border-radius: 12px;
    min-block-size: auto;
    padding-block: 16px 14px;
    padding-inline: 14px;
  }

  .media-poster {
    inline-size: 7rem;
  }

  .media-title {
    margin-block-start: 12px;
  }

  .media-heading {
    font-size: 1.25rem;
    line-height: 1.3;
    overflow-wrap: anywhere;
    word-break: normal;
  }

  .media-heading__year {
    font-size: 0.9375rem;
  }

  .media-attributes {
    gap: 5px;
    margin-block-start: 8px;
  }

  .tagline {
    border-inline-start: 0;
    font-size: 12.5px;
    margin-block-start: 8px;
    padding-inline-start: 0;
    text-align: center;
  }

  .media-actions {
    gap: 8px;
    inline-size: 100%;
    margin-block-start: 14px;
    max-inline-size: 100%;
  }

  .media-action-button {
    border-radius: 8px !important;
    block-size: 34px !important;
    font-size: 12.5px !important;
    padding-inline: 10px !important;
  }

  .media-actions > .media-action-button:only-child,
  .media-actions > .media-action-button:last-child:nth-child(odd):not(:first-child) {
    inline-size: 100%;
  }

  .media-overview {
    gap: 12px;
    margin-block-start: 12px;
  }

  .media-detail-card {
    border-radius: 11px;
    padding-block: 14px;
    padding-inline: 14px;
  }

  ul.media-crew {
    gap: 10px 14px;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 132px), 1fr));
  }

  .media-seasons-section {
    margin-block-start: 14px;
  }

  .media-seasons-section :deep(.v-expansion-panel-title) {
    min-block-size: 46px;
    padding-block: 10px;
    padding-inline: 12px;
  }

  .media-seasons-section :deep(.v-expansion-panel-text__wrapper) {
    padding-block: 0 12px;
    padding-inline: 12px;
  }

  .media-episode-row {
    gap: 10px;
    padding-block: 12px;
  }

  .media-episode-title {
    font-size: 13.5px;
    overflow-wrap: anywhere;
    word-break: normal;
  }

  .media-episode-still {
    border-radius: 8px;
    inline-size: 100% !important;
    max-inline-size: 100% !important;
  }

  .media-facts {
    border-radius: 11px;
  }

  .media-ratings,
  .media-fact {
    padding-inline: 12px;
  }

  .media-related-stack {
    margin-block-start: 14px;
  }
}
</style>
