<script lang="ts" setup>
import api from '@/api'
import { MediaInfo, MediaSeason, NotExistMediaInfo } from '@/api/types'
import { PropType } from 'vue'
import noImage from '@images/no-image.jpeg'
import NoDataFound from '@/components/states/NoDataFound.vue'
import { useI18n } from '@/composables/useChineseText'
import { useGlobalSettingsStore } from '@/stores'
import {
  getMediaSubscribeId,
  getMediaSubscribeIdentity,
  type SeasonSubscribeModes,
  type SubscribeMode,
} from '@/composables/useMediaSubscribe'
import { getDisplayImageUrl } from '@/utils/imageUtils'
import { formatSeasonEpisode } from '@/@core/utils/formatters'
import { useDisplay } from 'vuetify'

type SubscribeModeOption = {
  icon: string
  title: string
  value: SubscribeMode
}

type EpisodeGroupOption = {
  title: string
  subtitle: string
  value: string
  icon: string
}

/** 媒体接口提供的剧集组摘要。 */
interface EpisodeGroupInfo {
  id: string
  name: string
  group_count: number
  episode_count: number
}

// 国际化
const { t } = useI18n()
const { mdAndUp } = useDisplay()

// 定义事件
const emit = defineEmits(['subscribe', 'close'])

// 定义输入
const props = defineProps({
  media: Object as PropType<MediaInfo>,
  selectedSeason: Number,
  initialEpisodeGroup: String,
  subscribedSeasons: Array as PropType<number[]>,
  subscribedSeasonModes: Object as PropType<SeasonSubscribeModes>,
  defaultSubscribeMode: String as PropType<SubscribeMode>,
})

// 从 provide 中获取全局设置
// 全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// 季详情
const seasonInfos = ref<MediaSeason[]>([])

// 选中的订阅季号
const seasonsSelected = ref<number[]>([])

// 各季订阅方式
const seasonModes = ref<Record<number, SubscribeMode>>({})

// 用户已手动选择过模式的季号，入库状态异步刷新时不再覆盖。
const manuallySelectedModeSeasons = ref(new Set<number>())

// 各季缺失状态：0-已入库 1-部分缺失 2-全部缺失，没有数据也是已入库
const seasonsNotExisted = ref<{ [key: number]: number }>({})

// 各季缺失明细，供状态标签悬停提示说明缺了哪些集
const seasonsMissingInfo = ref<Record<number, NotExistMediaInfo>>({})

// 缺失状态接口加载状态，未就绪时不展示悬停提示
const missingStateStatus = ref<'loading' | 'ready' | 'error'>('loading')

// 是否刷新过
const isRefreshed = ref(false)

// 异步请求代次计数器，防止切换剧集组时在途旧请求覆盖最新季列表与入库状态
let seasonsRequestSeq = 0
let notExistsRequestSeq = 0

// 所有剧集组
const episodeGroups = ref<EpisodeGroupInfo[]>([])

// 当前选择剧集组
const episodeGroup = ref(
  getMediaSubscribeIdentity(props.media)?.source === 'themoviedb' ? (props.initialEpisodeGroup ?? '') : '',
)

// 剧集组横向轨道
const episodeGroupRail = ref<HTMLElement | null>(null)

// 剧集组轨道左右滚动状态
const canScrollEpisodeGroupsBackward = ref(false)
const canScrollEpisodeGroupsForward = ref(false)

const subscribeModeOptions = computed<SubscribeModeOption[]>(() => [
  {
    title: t('dialog.subscribeMode.normal'),
    value: 'normal',
    icon: 'mdi-plus-circle-outline',
  },
  {
    title: t('dialog.subscribeMode.bestVersionEpisode'),
    value: 'best_version',
    icon: 'mdi-refresh',
  },
  {
    title: t('dialog.subscribeMode.bestVersionFull'),
    value: 'best_version_full',
    icon: 'mdi-shimmer',
  },
])

// 校验弹窗输入是否为支持的订阅模式。
function isSubscribeMode(value: unknown): value is SubscribeMode {
  return value === 'normal' || value === 'best_version' || value === 'best_version_full'
}

const subscribedSeasonSet = computed(() => new Set(props.subscribedSeasons ?? []))

const selectedSeasonSet = computed(() => new Set(seasonsSelected.value))

const visibleSeasonNumbers = computed(() =>
  seasonInfos.value
    .map(item => item.season_number)
    .filter((season): season is number => season !== null && season !== undefined),
)

const hasSelectionChanges = computed(() => {
  const visibleSeasons = new Set(visibleSeasonNumbers.value)

  for (const season of visibleSeasons) {
    if (subscribedSeasonSet.value.has(season) !== selectedSeasonSet.value.has(season)) return true
    if (
      subscribedSeasonSet.value.has(season) &&
      selectedSeasonSet.value.has(season) &&
      (props.subscribedSeasonModes?.[season] ?? 'normal') !== (seasonModes.value[season] ?? 'normal')
    ) {
      return true
    }
  }

  return false
})

const submitButtonText = computed(() => {
  if (!hasSelectionChanges.value && seasonsSelected.value.length === 0) return t('dialog.subscribeSeason.selectSeasons')

  return t('dialog.subscribeSeason.submit')
})

// 剧集组选项
const episodeGroupOptions = computed<EpisodeGroupOption[]>(() => {
  const options = episodeGroups.value.map(item => {
    return {
      title: item.name,
      subtitle: `${t('dialog.subscribeSeason.seasonCount', { count: item.group_count })} • ${t(
        'dialog.subscribeSeason.episodeCount',
        { count: item.episode_count },
      )}`,
      value: item.id,
      icon: 'mdi-folder-play-outline',
    }
  })
  // 添加不使用选项
  options.unshift({
    title: t('dialog.subscribeSeason.defaultGroup'),
    subtitle: t('dialog.subscribeSeason.seasonCount', { count: seasonInfos.value.length }),
    value: '',
    icon: 'mdi-layers-outline',
  })
  return options
})

// 获得mediaid
function getMediaId() {
  return getMediaSubscribeId(props.media)
}

// 查询所有剧集组
async function getEpisodeGroups() {
  if (getMediaSubscribeIdentity(props.media)?.source !== 'themoviedb') return
  if (!props.media?.tmdb_id) {
    console.warn('tmdbid is not set or is empty')
    return
  }
  try {
    episodeGroups.value = await api.get(`media/groups/${props.media?.tmdb_id}`)
  } catch (error) {
    console.error(error)
  } finally {
    nextTick(updateEpisodeGroupScrollState)
  }
}

// 查询媒体的季信息
async function getMediaSeasons() {
  const requestSeq = ++seasonsRequestSeq
  isRefreshed.value = false
  try {
    const seasons: MediaSeason[] = await api.get('media/seasons', {
      params: {
        mediaid: getMediaId(),
        title: props.media?.title,
        year: props.media?.year,
        season: props.media?.season,
      },
    })
    if (requestSeq === seasonsRequestSeq) {
      seasonInfos.value = seasons
    }
  } catch (error) {
    if (requestSeq === seasonsRequestSeq) {
      console.error(error)
    }
  } finally {
    if (requestSeq === seasonsRequestSeq) {
      isRefreshed.value = true
    }
  }
}

// 查询剧集组的剧集
async function getGroupSeasons() {
  if (getMediaSubscribeIdentity(props.media)?.source !== 'themoviedb' || !episodeGroup.value) return
  const requestSeq = ++seasonsRequestSeq
  isRefreshed.value = false
  try {
    const seasons: MediaSeason[] = await api.get(`media/group/seasons/${episodeGroup.value}`)
    if (requestSeq === seasonsRequestSeq) {
      seasonInfos.value = seasons
    }
  } catch (error) {
    if (requestSeq === seasonsRequestSeq) {
      console.error(error)
    }
  } finally {
    if (requestSeq === seasonsRequestSeq) {
      isRefreshed.value = true
    }
  }
}

// 检查所有季的缺失状态（数据库）
async function checkSeasonsNotExists() {
  const requestSeq = ++notExistsRequestSeq
  missingStateStatus.value = 'loading'
  // 开始处理
  try {
    const tmpMedia = {
      ...(props.media ?? {}),
      episode_group: episodeGroup.value || '',
    }
    const result: NotExistMediaInfo[] = await api.post('mediaserver/notexists', tmpMedia)
    if (requestSeq !== notExistsRequestSeq) return
    if (result) {
      const nextStates: { [key: number]: number } = {}
      const nextMissingInfo: Record<number, NotExistMediaInfo> = {}
      result.forEach(item => {
        // 0-已入库 1-部分缺失 2-全部缺失
        let state = 0
        if (item.episodes.length === 0) state = 2
        else if (item.episodes.length < item.total_episode) state = 1
        nextStates[item.season] = state
        nextMissingInfo[item.season] = item
      })
      seasonsNotExisted.value = nextStates
      seasonsMissingInfo.value = nextMissingInfo
      missingStateStatus.value = 'ready'
    }
  } catch (error) {
    if (requestSeq === notExistsRequestSeq) {
      seasonsNotExisted.value = {}
      seasonsMissingInfo.value = {}
      missingStateStatus.value = 'error'
      console.error(error)
    }
  }
}

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
  if (!state) return t('dialog.subscribeSeason.status.exists')

  if (state === 1) return t('dialog.subscribeSeason.status.partial')
  else if (state === 2) return t('dialog.subscribeSeason.status.missing')
  else return t('dialog.subscribeSeason.status.exists')
}

// 计算存在状态的悬停提示，说明判断依据和缺失的集；状态未就绪时不显示
function getExistHint(season: number) {
  if (missingStateStatus.value !== 'ready') return ''
  const state = seasonsNotExisted.value[season]
  const info = seasonsMissingInfo.value[season]
  if (!state || !info) return t('media.status.inLibraryHint')
  if (state === 2) return t('media.status.missingHint', { count: info.total_episode })
  return t('media.status.partiallyMissingHint', {
    episodes: formatSeasonEpisode(null, info.episodes),
    count: info.episodes.length,
  })
}

// 获取季海报地址，数据源未提供季海报时使用主海报。
function getSeasonPoster(posterPath?: string) {
  const resolvedPosterPath = posterPath?.trim() || props.media?.poster_path?.trim()
  if (!resolvedPosterPath) return noImage

  const posterUrl = resolvedPosterPath.startsWith('/')
    ? `https://${globalSettings.TMDB_IMAGE_DOMAIN}/t/p/w500${resolvedPosterPath}`
    : resolvedPosterPath.replace('/t/p/original/', '/t/p/w500/')

  return getDisplayImageUrl(posterUrl, globalSettings.GLOBAL_IMAGE_CACHE)
}

// 按简体中文格式化数据源返回的首播日期。
function formatAirDate(airDate: string) {
  if (!airDate) return ''
  const dateParts = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(airDate)
  if (!dateParts) return airDate

  const date = new Date(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]))
  if (Number.isNaN(date.getTime())) return airDate

  return new Intl.DateTimeFormat('zh-CN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

// 获取本地化季号标题，确保数据源未返回名称时仍有稳定文本。
function getSeasonTitle(item: MediaSeason) {
  return t('dialog.subscribeSeason.seasonNumber', { number: item.season_number ?? 0 })
}

// 获取数据源提供的非重复季名称，保留特别篇等来源语义。
function getSeasonName(item: MediaSeason) {
  const name = item.name?.trim()
  if (!name || item.season_number === undefined) return ''

  const number = item.season_number
  const normalizedName = name.toLocaleLowerCase().replaceAll(/\s/g, '')
  const genericNames = new Set([
    `第${number}季`,
    `season${number}`,
    `season${String(number).padStart(2, '0')}`,
    `s${number}`,
    `s${String(number).padStart(2, '0')}`,
  ])

  return genericNames.has(normalizedName) ? '' : name
}

// 获取同时包含季号和来源季名称的海报替代文本。
function getSeasonPosterAlt(item: MediaSeason) {
  return [getSeasonTitle(item), getSeasonName(item)].filter(Boolean).join(' - ')
}

// 切换当前剧集组并清空上一组的派生数据。
function setEpisodeGroup(value: string) {
  if (episodeGroup.value === value) return

  seasonsNotExisted.value = {}
  seasonsMissingInfo.value = {}
  missingStateStatus.value = 'loading'
  seasonInfos.value = []
  episodeGroup.value = value
  nextTick(updateEpisodeGroupScrollState)
}

// 刷新剧集组横向轨道的左右滚动按钮状态。
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

// 按一屏内可辨识的距离横向滚动剧集组轨道。
function scrollEpisodeGroups(direction: 'backward' | 'forward') {
  const rail = episodeGroupRail.value
  if (!rail) return

  rail.scrollBy({
    behavior: 'smooth',
    left: direction === 'backward' ? -Math.max(rail.clientWidth * 0.72, 240) : Math.max(rail.clientWidth * 0.72, 240),
  })
}

// 提交当前剧集组下选中的季及其订阅模式。
function subscribeSeasons() {
  const selectedSeasons = seasonInfos.value.filter(item => {
    const seasonNumber = item.season_number ?? null
    return seasonNumber !== null && selectedSeasonSet.value.has(seasonNumber)
  })

  emit(
    'subscribe',
    selectedSeasons,
    seasonsNotExisted.value,
    episodeGroup.value,
    { ...seasonModes.value },
    visibleSeasonNumbers.value,
  )
}

// 写入指定季的订阅模式。
function setSeasonMode(season: number, mode: SubscribeMode) {
  seasonModes.value = {
    ...seasonModes.value,
    [season]: mode,
  }
}

// 处理用户手动切换指定季的订阅模式。
function updateSeasonMode(season: number, mode: unknown) {
  if (!isSubscribeMode(mode)) return
  manuallySelectedModeSeasons.value.add(season)
  setSeasonMode(season, mode)
}

// 根据入库状态和系统配置计算指定季的默认订阅模式。
function getDefaultSeasonMode(season: number) {
  if (!seasonsNotExisted.value[season]) return 'best_version_full'

  return props.defaultSubscribeMode ?? 'normal'
}

// 确保指定季已初始化订阅模式。
function ensureSeasonMode(season: number) {
  if (!seasonModes.value[season])
    setSeasonMode(season, props.subscribedSeasonModes?.[season] ?? getDefaultSeasonMode(season))
}

// 在入库状态刷新后同步尚未手动修改的默认模式。
function syncDefaultSeasonModes() {
  seasonsSelected.value.forEach(season => {
    if (subscribedSeasonSet.value.has(season) || manuallySelectedModeSeasons.value.has(season)) return
    setSeasonMode(season, getDefaultSeasonMode(season))
  })
}

// 判断指定季是否已有订阅。
function isSeasonSubscribed(season: number) {
  return subscribedSeasonSet.value.has(season)
}

// 判断指定季是否在本次提交选择中。
function isSeasonSelected(season: number) {
  return selectedSeasonSet.value.has(season)
}

// 设置指定季的选择状态并同步其订阅模式。
function setSeasonSelected(season: number, selected: boolean | null) {
  const nextSeasons = new Set(seasonsSelected.value)
  if (selected) {
    nextSeasons.add(season)
    ensureSeasonMode(season)
  } else {
    nextSeasons.delete(season)
  }
  seasonsSelected.value = [...nextSeasons].sort((a, b) => a - b)
}

// 切换指定季的选择状态。
function toggleSeasonSelected(season: number) {
  setSeasonSelected(season, !isSeasonSelected(season))
}

// 将入口预选季和已有订阅同步到当前剧集组的可见季列表。
function syncSelectedSeason() {
  if (!seasonInfos.value.length) return

  const seasonNumbers = new Set<number>()
  props.subscribedSeasons?.forEach(season => seasonNumbers.add(season))
  if (props.selectedSeason !== undefined) seasonNumbers.add(props.selectedSeason)

  const validSeasonNumbers = new Set(
    seasonInfos.value
      .map(item => item.season_number)
      .filter((season): season is number => season !== null && season !== undefined),
  )

  seasonsSelected.value = [...seasonNumbers].filter(season => validSeasonNumbers.has(season)).sort((a, b) => a - b)
  seasonsSelected.value.forEach(ensureSeasonMode)
  Object.entries(props.subscribedSeasonModes ?? {}).forEach(([season, mode]) => {
    const seasonNumber = Number(season)
    if (!validSeasonNumbers.has(seasonNumber)) return
    setSeasonMode(seasonNumber, mode)
  })
}

// 季信息与缺失状态共享剧集组上下文，剧集组变化时统一刷新两者。
watchEffect(() => {
  if (episodeGroup.value) getGroupSeasons()
  else getMediaSeasons()
  checkSeasonsNotExists()
})

watch(seasonInfos, syncSelectedSeason)

watch(seasonsNotExisted, syncDefaultSeasonModes, { deep: true })

watch(() => props.selectedSeason, syncSelectedSeason)

watch(() => props.subscribedSeasons, syncSelectedSeason)

watch(() => props.subscribedSeasonModes, syncSelectedSeason)

watch(episodeGroupOptions, () => nextTick(updateEpisodeGroupScrollState), { flush: 'post' })

onMounted(async () => {
  window.addEventListener('resize', updateEpisodeGroupScrollState)
  getEpisodeGroups()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateEpisodeGroupScrollState)
})
</script>

<template>
  <VDialog max-width="45rem" scrollable :fullscreen="!mdAndUp">
    <VCard class="subscribe-season-dialog mp-dialog-card">
      <VCardItem class="mp-dialog-header">
        <template #prepend>
          <VIcon icon="mdi-clipboard-list-outline" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>
          {{ t('dialog.subscribeSeason.selectSeasons') }}
        </VCardTitle>
        <VCardSubtitle>
          {{ props.media?.title }}
        </VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn @click="emit('close')" />
      <VDivider />
      <VCardText>
        <div class="subscribe-season-group-selector">
          <div class="subscribe-season-group-label">
            {{ t('dialog.subscribeSeason.selectGroup') }}
          </div>
          <div class="subscribe-season-group-rail-shell">
            <button
              v-if="mdAndUp && canScrollEpisodeGroupsBackward"
              type="button"
              class="subscribe-season-group-nav subscribe-season-group-nav--backward"
              :aria-label="t('media.episodeGroups.previous')"
              @click="scrollEpisodeGroups('backward')"
            >
              <VIcon icon="mdi-chevron-left" />
            </button>
            <div
              ref="episodeGroupRail"
              class="subscribe-season-group-options"
              @scroll.passive="updateEpisodeGroupScrollState"
            >
              <button
                v-for="group in episodeGroupOptions"
                :key="group.value || 'default'"
                type="button"
                class="subscribe-season-group-option"
                :class="{ 'subscribe-season-group-option--active': episodeGroup === group.value }"
                @click="setEpisodeGroup(group.value)"
              >
                <VIcon :icon="group.icon" size="small" />
                <span class="subscribe-season-group-text">
                  <span class="subscribe-season-group-title">{{ group.title }}</span>
                  <span class="subscribe-season-group-subtitle">{{ group.subtitle }}</span>
                </span>
              </button>
            </div>
            <button
              v-if="mdAndUp && canScrollEpisodeGroupsForward"
              type="button"
              class="subscribe-season-group-nav subscribe-season-group-nav--forward"
              :aria-label="t('media.episodeGroups.next')"
              @click="scrollEpisodeGroups('forward')"
            >
              <VIcon icon="mdi-chevron-right" />
            </button>
          </div>
        </div>
        <LoadingBanner v-if="!isRefreshed" class="mt-5" />
        <div v-else-if="seasonInfos.length > 0">
          <VList lines="three" class="subscribe-season-list">
            <VListItem
              v-for="(item, i) in seasonInfos"
              :key="item.season_number ?? i"
              :active="isSeasonSelected(item.season_number ?? 0)"
              rounded="lg"
              class="subscribe-season-list-item"
              @click="toggleSeasonSelected(item.season_number ?? 0)"
            >
              <template #prepend>
                <VImg
                  height="90"
                  width="60"
                  :src="getSeasonPoster(item.poster_path)"
                  :alt="getSeasonPosterAlt(item)"
                  aspect-ratio="2/3"
                  class="subscribe-season-poster object-cover rounded ring-gray-500 me-3"
                  cover
                >
                  <template #placeholder>
                    <div class="w-full h-full">
                      <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
                    </div>
                  </template>
                </VImg>
              </template>
              <VListItemTitle>
                <span>{{ getSeasonTitle(item) }}</span>
                <span v-if="getSeasonName(item)" class="subscribe-season-name"> · {{ getSeasonName(item) }}</span>
              </VListItemTitle>
              <VListItemSubtitle
                v-if="item.vote_average || item.air_date || typeof item.episode_count === 'number'"
                class="mt-1 me-2"
              >
                <div class="subscribe-season-meta">
                  <VChip v-if="item.vote_average" color="primary" size="small" class="mb-1">
                    <VIcon icon="mdi-star" />
                    {{ t('dialog.subscribeSeason.voteAverage', { score: item.vote_average }) }}
                  </VChip>
                  <span v-if="item.air_date" class="subscribe-season-meta-item">
                    <VIcon icon="mdi-calendar-blank-outline" size="x-small" />
                    {{ t('dialog.subscribeSeason.airDate', { date: formatAirDate(item.air_date) }) }}
                  </span>
                  <span v-if="typeof item.episode_count === 'number'" class="subscribe-season-meta-item">
                    <VIcon icon="mdi-play-box-multiple-outline" size="x-small" />
                    {{ t('dialog.subscribeSeason.episodeCount', { count: item.episode_count }) }}
                  </span>
                </div>
              </VListItemSubtitle>
              <VListItemSubtitle>
                <VChip
                  v-if="seasonsNotExisted"
                  class="mt-2"
                  size="small"
                  :color="getExistColor(item.season_number ?? 0)"
                >
                  {{ getExistText(item.season_number ?? 0) }}
                  <VTooltip v-if="getExistHint(item.season_number ?? 0)" activator="parent" location="top">
                    {{ getExistHint(item.season_number ?? 0) }}
                  </VTooltip>
                </VChip>
                <VChip v-if="isSeasonSubscribed(item.season_number ?? 0)" class="mt-2 ms-2" size="small" color="error">
                  {{ t('media.status.subscribed') }}
                </VChip>
              </VListItemSubtitle>
              <template #append>
                <VListItemAction start class="subscribe-season-actions">
                  <VSwitch
                    class="subscribe-season-switch"
                    :model-value="isSeasonSelected(item.season_number ?? 0)"
                    :aria-label="getSeasonTitle(item)"
                    inset
                    hide-details
                    @click.stop
                    @update:model-value="setSeasonSelected(item.season_number ?? 0, $event)"
                  />
                  <VBtnToggle
                    v-if="isSeasonSelected(item.season_number ?? 0)"
                    :model-value="seasonModes[item.season_number ?? 0] || 'normal'"
                    density="compact"
                    mandatory
                    variant="text"
                    class="subscribe-season-mode-toggle"
                    @click.stop
                    @update:model-value="updateSeasonMode(item.season_number ?? 0, $event)"
                  >
                    <VBtn
                      v-for="mode in subscribeModeOptions"
                      :key="mode.value"
                      :value="mode.value"
                      size="small"
                      class="subscribe-season-mode-button"
                    >
                      <VIcon :icon="mode.icon" size="14" />
                      <span>{{ mode.title }}</span>
                    </VBtn>
                  </VBtnToggle>
                </VListItemAction>
              </template>
            </VListItem>
          </VList>
        </div>
        <NoDataFound v-else errorTitle="出错啦！" :errorDescription="`${props.media?.title} 未查询到季集信息`" />
      </VCardText>
      <VDivider />
      <VCardActions class="app-dialog-actions mp-dialog-footer">
        <VSpacer />
        <VBtn color="default" variant="text" size="small" @click="emit('close')">
          {{ t('common.cancel') }}
        </VBtn>
        <VBtn
          :disabled="!hasSelectionChanges"
          color="primary"
          variant="flat"
          size="small"
          class="subscribe-season-submit px-4"
          @click="subscribeSeasons"
        >
          <template #prepend>
            <VIcon icon="mdi-check" />
          </template>
          {{ submitButtonText }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.mp-dialog-header {
  padding-block: 14px;
  padding-inline: 22px 48px;
}

.mp-dialog-footer {
  gap: 8px;
  padding: 10px 20px !important;
}

.subscribe-season-actions {
  display: grid;
  align-content: space-between;
  align-self: stretch;
  block-size: 100%;
  gap: 0.5rem;
  justify-items: end;
  min-inline-size: 0;
}

/* 固定无标签开关的自适应胶囊宽度，避免操作区缺少模式按钮时被网格收缩。 */
.subscribe-season-switch {
  inline-size: 28px;
  min-inline-size: 28px;
  max-inline-size: 28px;
}

.subscribe-season-group-selector {
  display: grid;
  gap: 0.5rem;
  margin-block-end: 1rem;
}

.subscribe-season-group-label {
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 0.75rem;
  line-height: 1rem;
}

.subscribe-season-group-rail-shell {
  position: relative;
  min-inline-size: 0;
}

.subscribe-season-group-options {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  padding-block: 0.125rem 0.375rem;
  scroll-behavior: smooth;
  scroll-snap-type: inline proximity;
  scrollbar-width: none;
}

.subscribe-season-group-options::-webkit-scrollbar {
  display: none;
}

.subscribe-season-group-option {
  display: inline-flex;
  flex: 0 0 12rem;
  align-items: center;
  border: 1px solid var(--mp-border-card);
  border-radius: 8px;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  gap: 0.5rem;
  min-inline-size: 0;
  padding-block: 0.5rem;
  padding-inline: 0.75rem;
  scroll-snap-align: start;
  text-align: start;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease,
    color 0.16s ease;
}

.subscribe-season-group-option:hover {
  border-color: rgba(var(--v-theme-primary), 0.45);
  background: var(--mp-elevated-bg);
}

.subscribe-season-group-option--active {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.18);
  color: rgb(var(--v-theme-primary));
}

.subscribe-season-group-option--active:hover {
  background: rgba(var(--v-theme-primary), 0.24);
}

.subscribe-season-group-option:focus-visible,
.subscribe-season-group-nav:focus-visible {
  outline: 2px solid rgba(var(--v-theme-primary), 0.45);
  outline-offset: 2px;
}

.subscribe-season-group-text {
  display: grid;
  min-inline-size: 0;
}

.subscribe-season-group-title,
.subscribe-season-group-subtitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subscribe-season-group-title {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.125rem;
}

.subscribe-season-group-subtitle {
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 0.75rem;
  line-height: 1rem;
}

.subscribe-season-group-option--active .subscribe-season-group-subtitle {
  color: rgba(var(--v-theme-primary), 0.82);
}

.subscribe-season-group-nav {
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

.subscribe-season-group-nav:hover {
  border-color: rgba(var(--v-theme-primary), 0.45);
  background: rgba(var(--v-theme-surface), 0.96);
  box-shadow: 0 6px 18px rgba(var(--v-theme-on-surface), 0.12);
  color: rgb(var(--v-theme-primary));
}

.subscribe-season-group-nav--backward {
  inset-inline-start: -0.5rem;
}

.subscribe-season-group-nav--forward {
  inset-inline-end: -0.5rem;
}

.subscribe-season-list {
  display: grid;
  gap: 0.5rem;
}

.subscribe-season-list-item {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.subscribe-season-poster {
  flex: 0 0 3.75rem;
}

.subscribe-season-name {
  color: rgba(var(--v-theme-on-surface), 0.68);
  font-size: 0.875rem;
  font-weight: 400;
}

.subscribe-season-meta {
  display: flex;
  align-items: center;
  gap: 0.375rem 0.75rem;
  flex-wrap: wrap;
}

.subscribe-season-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.subscribe-season-list-item :deep(.v-list-item__append) {
  align-items: stretch;
  align-self: stretch;
}

.subscribe-season-mode-toggle {
  display: inline-flex;
  align-items: center;
  padding: 2px;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 8px;
  background: var(--mp-tab-groove-bg);
  block-size: 30px;
  gap: 2px;
}

.subscribe-season-mode-button {
  border-radius: 6px !important;
  block-size: 24px !important;
  color: rgba(var(--v-theme-on-surface), 0.65) !important;
  font-weight: 500;
  letter-spacing: 0;
  min-block-size: 24px !important;
  min-inline-size: 0 !important;
  padding-inline: 8px !important;
  text-transform: none;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.subscribe-season-mode-button:hover {
  background: rgba(var(--v-theme-on-surface), 0.05) !important;
  color: rgba(var(--v-theme-on-surface), 0.9) !important;
}

.subscribe-season-mode-button.v-btn--active {
  background: var(--mp-tab-active-bg) !important;
  box-shadow: var(--mp-tab-active-shadow);
  color: rgb(var(--v-theme-primary)) !important;
  font-weight: 600;
}

.subscribe-season-mode-button span {
  font-size: 0.75rem;
  line-height: 1rem;
  margin-inline-start: 0.25rem;
  white-space: nowrap;
}

@media (width <= 960px) {
  .subscribe-season-actions {
    gap: 0.375rem;
    min-inline-size: 0;
  }

  .subscribe-season-mode-toggle {
    max-inline-size: 6.75rem;
  }

  .subscribe-season-mode-button {
    flex: 1 1 0;
    padding-inline: 0.375rem !important;
  }

  .subscribe-season-mode-button span {
    display: none;
  }
}

@media (width <= 640px) {
  .subscribe-season-submit {
    inline-size: 100% !important;
  }

  .subscribe-season-list-item :deep(.v-list-item__content) {
    min-inline-size: 0;
  }

  .subscribe-season-group-option {
    flex-basis: 10rem;
  }
}

@media (hover: none) and (pointer: coarse) {
  .subscribe-season-group-nav {
    display: none;
  }
}
</style>
