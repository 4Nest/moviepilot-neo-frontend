<script lang="ts" setup>
import CryptoJS from 'crypto-js'
import { debounce } from 'lodash-es'
import { useToast } from 'vue-toastification'
import { numberValidator } from '@/@validators'
import api from '@/api'
import { transferTypeOptions } from '@/api/constants'
import {
  ApiResponse,
  FileItem,
  ManualTransferHistoryInfo,
  ManualTransferPayload,
  ManualTransferPreviewData,
  ManualTransferPreviewItem,
  MediaDataSource,
  MediaInfo,
  StorageConf,
  TransferDirectoryConf,
  TransferForm,
} from '@/api/types'
import { useBackground } from '@/composables/useBackground'
import MediaIdSelector from '../misc/MediaIdSelector.vue'
import ProgressDialog from './ProgressDialog.vue'
import { useI18n } from '@/composables/useChineseText'
import { useDisplay } from 'vuetify'
import { useGlobalSettingsStore } from '@/stores'
import { buildDownloadDirectoryOptions } from '@/utils/downloadDirectory'

// 国际化
const { t } = useI18n()
const { useProgressSSE } = useBackground()

// 显示器宽度
const display = useDisplay()

// 输入参数
const props = defineProps({
  logids: Array<number>,
  items: Array<FileItem>,
  target_storage: String,
  target_path: String,
})

// 全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

const mediaSourceItems = computed<{ title: string; value: MediaDataSource }[]>(() => [
  { title: t('setting.cache.recognitionSource.themoviedb'), value: 'themoviedb' },
  { title: t('setting.cache.recognitionSource.douban'), value: 'douban' },
  { title: t('setting.cache.recognitionSource.bangumi'), value: 'bangumi' },
  { title: t('setting.cache.recognitionSource.anilist'), value: 'anilist' },
])

// 获取后台设置中的默认识别数据源，未知值兼容回退到TheMovieDb。
function getDefaultMediaSource(): MediaDataSource {
  const configuredSource = globalSettings.RECOGNIZE_SOURCE as MediaDataSource
  return mediaSourceItems.value.some(item => item.value === configuredSource) ? configuredSource : 'themoviedb'
}

// 定义事件
const emit = defineEmits(['done', 'close'])

// 生成1到100季的下拉框选项
const seasonItems = ref(
  Array.from({ length: 101 }, (_, i) => i).map(item => ({
    title: `${t('dialog.subscribeEdit.seasonFormat', { number: item })}`,
    value: item,
  })),
)

// 提示框
const $toast = useToast()

// TMDB选择对话框
const mediaSelectorDialog = ref(false)

// 进度是否激活
const progressActive = ref(false)

// 整理进度条
const progressDialog = ref(false)

// 整理进度文本
const progressText = ref(t('dialog.reorganize.processing'))

// 整理进度
const progressValue = ref(0)

// 整理请求执行期间保持单一提交，避免同一批源文件被重复处理。
const transferSubmitting = ref(false)

// 进度SSE连接
const progressSSE = ref<any>(null)

// 预览加载状态
const previewLoading = ref(false)

// 预览面板显隐
const previewVisible = ref(false)

// 是否已加载预览
const previewLoaded = ref(false)

// 预览数据（使用浅响应避免大批量预览项被深度递归代理）
const previewData = shallowRef<ManualTransferPreviewData | undefined>(undefined)

// 预览列表状态筛选
const previewStatusFilter = ref<'all' | 'failed'>('all')

// 预览请求代际计数与中止控制器，用于取消在途请求并丢弃过期响应
let previewRequestGeneration = 0
let previewAbortController: AbortController | null = null

// 手动整理历史查询状态
const manualHistoryLoading = ref(false)
const manualHistoryCount = ref(0)

interface EpisodeFormatRecommendData {
  rule_name?: string
  rule_index?: number
  pattern?: string
  episode_format?: string
  sample_file?: string
  min_file_size_mb?: number
  message?: string
}

const episodeFormatRecommendState = reactive<{
  loading: boolean
  ruleName?: string
  rulePattern?: string
  generatedFormat?: string
  sampleFile?: string
  lastMessage?: string
}>({
  loading: false,
  ruleName: undefined,
  rulePattern: undefined,
  generatedFormat: undefined,
  sampleFile: undefined,
  lastMessage: undefined,
})

const episodeFormatRuleConfigured = ref<boolean | undefined>(undefined)

interface TargetDirectoryOption {
  title: string
  value: string
}

const AUTO_TARGET_PATH_VALUE = '__moviepilot_auto_target_path__'

// 媒体类型映射到手动整理接口接受的类型名。
function resolveTransferMediaType(type?: string) {
  const normalizedType = type?.trim().toLowerCase()
  if (!normalizedType) return undefined

  const movieTypes = ['电影', 'movie']
  if (movieTypes.includes(normalizedType)) return '电影'

  const tvTypes = ['电视剧', 'tv', 'series']
  if (tvTypes.includes(normalizedType)) return '电视剧'

  return undefined
}

// 生成文件项稳定键，用于去重和状态同步。
function getFileItemKey(item?: FileItem) {
  return [item?.storage ?? '', item?.type ?? '', item?.path ?? ''].join('|')
}

// 按存储、类型和路径去重文件项。
function dedupeFileItems(fileItems?: FileItem[]) {
  if (!fileItems?.length) return []

  const uniqueItems = new Map<string, FileItem>()
  fileItems.forEach(item => {
    uniqueItems.set(getFileItemKey(item), item)
  })

  return Array.from(uniqueItems.values())
}

// 生成预览项稳定键，避免合并多次预览结果时重复展示。
function getPreviewItemKey(item: ManualTransferPreviewItem) {
  return [item.source ?? '', item.target ?? '', item.success === false ? 'failed' : 'success'].join('|')
}

const normalizedItems = computed(() => dedupeFileItems(props.items))

// 分页
const previewPage = ref(1)
const previewPageSize = ref(20)

// 所有存储
const storages = ref<StorageConf[]>([])

// 所有剧集组
const episodeGroups = ref<{ [key: string]: any }[]>([])

// 剧集组加载状态
const episodeGroupLoading = ref(false)

// 剧集组查询防抖句柄
let episodeGroupQueryTimer: ReturnType<typeof setTimeout> | undefined

// 查询存储
async function loadStorages() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/public/Storages')

    storages.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 存储字典
const storageOptions = computed(() => {
  return [
    {
      title: t('dialog.reorganize.auto'),
      value: null,
    },
    ...storages.value.map(item => ({
      title: item.name,
      value: item.type,
    })),
  ]
})

// 整理方式选项，包含可提交 null 的自动项。
const manualTransferTypeOptions = computed(() => {
  return [
    {
      title: t('dialog.reorganize.auto'),
      value: null,
    },
    ...transferTypeOptions,
  ]
})

// 剧集组选项属性
function episodeGroupItemProps(item: { title: string; subtitle?: string }) {
  return {
    title: item.title,
    subtitle: item.subtitle,
  }
}

interface EpisodeGroupOption {
  title: string
  subtitle: string
  value: string | null
}

// 剧集组选项，保留 null 作为不指定剧集组。
const episodeGroupOptions = computed<EpisodeGroupOption[]>(() => {
  const options: EpisodeGroupOption[] = (
    episodeGroups.value as { id: string; name: string; group_count: number; episode_count: number }[]
  ).map(item => {
    return {
      title: item.name,
      subtitle: `${t('dialog.reorganize.seasonCount', { count: item.group_count })} • ${t(
        'dialog.reorganize.episodeCount',
        { count: item.episode_count },
      )}`,
      value: item.id,
    }
  })

  options.unshift({
    title: t('dialog.reorganize.defaultEpisodeGroup'),
    subtitle: t('dialog.reorganize.defaultEpisodeGroupHint'),
    value: null,
  })

  return options
})

// 查询指定 TMDB 剧集的所有剧集组。
async function getEpisodeGroups(tmdbid?: number | string) {
  const normalizedTmdbId = Number(tmdbid)
  if (!Number.isInteger(normalizedTmdbId) || normalizedTmdbId <= 0) {
    episodeGroups.value = []
    return
  }

  episodeGroupLoading.value = true
  try {
    episodeGroups.value = await api.get(`media/groups/${normalizedTmdbId}`)
  } catch (error) {
    console.error(error)
    episodeGroups.value = []
  } finally {
    episodeGroupLoading.value = false
  }
}

// 标题
const dialogTitle = computed(() => {
  return t('dialog.reorganize.manualTitle')
})

// 副标题
const dialogSubtitle = computed(() => {
  if (normalizedItems.value.length) {
    if (normalizedItems.value.length > 1) {
      return t('dialog.reorganize.multipleItemsTitle', { count: normalizedItems.value.length })
    }

    return t('dialog.reorganize.singleItemTitle', { path: normalizedItems.value[0].path })
  } else if (props.logids?.length) {
    return t('dialog.reorganize.multipleItemsTitle', { count: props.logids.length })
  }
})
// 禁用指定集数
const disableEpisodeDetail = computed(() => {
  if (normalizedItems.value.length) {
    if (transferForm.episode_format) return false
    return !(normalizedItems.value.length === 1 && normalizedItems.value[0].type !== 'dir')
  }
})

const initialTargetPath = normalizeTargetPath(props.target_path)

// 表单
const transferForm = reactive<TransferForm>({
  fileitem: {} as FileItem,
  logid: 0,
  target_storage: initialTargetPath ? (props.target_storage ?? 'local') : null,
  target_path: initialTargetPath,
  media_source: getDefaultMediaSource(),
  media_id: null,
  transfer_type: null,
  min_filesize: 0,
  scrape: initialTargetPath ? false : null,
  from_history: false,
  library_type_folder: null,
  library_category_folder: null,
  episode_group: null,
  reorganize: Boolean(props.logids?.length),
})

// 历史记录入口和文件浏览器命中的成功历史都属于重新整理。
const isReorganize = computed(() => Boolean(props.logids?.length || transferForm.reorganize))

// 文件浏览入口默认跳过已成功整理的文件；关闭后才清理旧目标与历史记录重新整理。
const skipTransferred = computed({
  get: () => !transferForm.reorganize,
  set: (value: boolean) => {
    transferForm.reorganize = !value
  },
})
// 当前手动识别与刮削数据源。
const mediaSource = computed(() => transferForm.media_source ?? 'themoviedb')

// 当前数据源对应的原生ID标签。
const mediaIdLabel = computed(() => {
  const labels: Record<MediaDataSource, string> = {
    themoviedb: t('dialog.reorganize.tmdbId'),
    douban: t('dialog.reorganize.doubanId'),
    bangumi: t('dialog.reorganize.bangumiId'),
    anilist: t('dialog.reorganize.anilistId'),
  }
  return labels[mediaSource.value]
})

// 处理媒体搜索结果选择，同步搜索结果中已识别的媒体类型。
function handleMediaSelected(item: Pick<MediaInfo, 'type'>) {
  const typeName = resolveTransferMediaType(item.type)
  if (!typeName) return

  transferForm.type_name = typeName
}

// 所有媒体库目录
const directories = ref<TransferDirectoryConf[]>([])

// 查询目录
async function loadDirectories() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/public/Directories')
    directories.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 目的目录下拉框，第一项用于把目标路径显式重置为后端自动匹配。
const targetDirectoryOptions = computed<TargetDirectoryOption[]>(() => {
  const libraryOptions = buildDownloadDirectoryOptions(directories.value, item => item.library_path)
  return [
    {
      title: t('dialog.reorganize.auto'),
      value: AUTO_TARGET_PATH_VALUE,
    },
    ...libraryOptions.map(option => ({
      title: option.label,
      value: option.value,
    })),
  ]
})

// 目标路径选择值，用哨兵值把界面上的“自动”和接口里的 null 解耦。
const targetPathSelection = computed({
  get() {
    return transferForm.target_path ?? AUTO_TARGET_PATH_VALUE
  },
  set(value: string | null) {
    const targetPath = normalizeTargetPath(value)
    if (!targetPath || targetPath === AUTO_TARGET_PATH_VALUE) {
      resetAutomaticTargetConfig()
      return
    }

    transferForm.target_path = targetPath
  },
})

// 重置为完全自动匹配状态，提交时不携带目标路径及其派生配置。
function resetAutomaticTargetConfig() {
  transferForm.target_storage = null
  transferForm.target_path = null
  transferForm.transfer_type = null
  transferForm.scrape = null
  transferForm.library_type_folder = null
  transferForm.library_category_folder = null
}

// 监听目的路径变化，配置默认值
watch(
  () => transferForm.target_path,
  async newPath => {
    if (newPath) {
      const directory = directories.value.find(item => item.library_path === newPath)
      if (directory) {
        transferForm.target_storage = directory.library_storage ?? 'local'
        transferForm.transfer_type = transferForm.transfer_type || directory.transfer_type
        transferForm.scrape = directory.scraping ?? false
        transferForm.library_category_folder = directory.library_category_folder ?? false
        transferForm.library_type_folder = directory.library_type_folder ?? false
      } else {
        transferForm.target_storage = transferForm.target_storage || 'local'
        transferForm.transfer_type = transferForm.transfer_type || 'copy'
        transferForm.scrape = false
        transferForm.library_category_folder = false
        transferForm.library_type_folder = false
      }
    } else {
      // 路径为空时, 恢复到`自动`条件
      transferForm.transfer_type = null
      transferForm.library_type_folder = null
      transferForm.library_category_folder = null
    }
  },
)

// 监听媒体编号变化，仅在TMDB电视剧场景加载剧集组。
watch(
  () => transferForm.media_id,
  mediaId => {
    transferForm.episode_group = null
    episodeGroups.value = []
    if (episodeGroupQueryTimer) clearTimeout(episodeGroupQueryTimer)
    if (transferForm.type_name !== '电视剧' || mediaSource.value !== 'themoviedb') return
    episodeGroupQueryTimer = setTimeout(() => getEpisodeGroups(mediaId ?? undefined), 400)
  },
)

// 切换媒体类型或识别源时，非 TMDB 电视剧不保留剧集组选择；切回自动媒体类型时清空残留媒体ID。
watch([() => transferForm.type_name, () => mediaSource.value], ([typeName, source]) => {
  if (!typeName) {
    transferForm.media_id = null
    mediaSelectorDialog.value = false
  }
  if (typeName === '电视剧' && source === 'themoviedb' && transferForm.media_id) {
    getEpisodeGroups(transferForm.media_id)
    return
  }
  transferForm.episode_group = null
  episodeGroups.value = []
})

// 切换数据源时清空上一来源的原生ID，避免把同一数字误传给新来源。
watch(
  () => transferForm.media_source,
  (source, previousSource) => {
    if (previousSource && source !== previousSource) {
      transferForm.media_id = null
      mediaSelectorDialog.value = false
    }
  },
)

watch(
  () => transferForm.episode_group,
  episodeGroup => {
    const normalizedEpisodeGroup = normalizeEpisodeGroup(episodeGroup)
    if (episodeGroup !== normalizedEpisodeGroup) {
      transferForm.episode_group = normalizedEpisodeGroup
    }
  },
)

interface PreviewFileRow extends ManualTransferPreviewItem {
  sourceName: string
  sourceDir: string
  targetName: string
  targetDir: string
  sameName: boolean
  seasonNumber?: number
  episodeNumber?: number
}

// 标准化路径
function normalizePath(path?: string) {
  return (path || '').replace(/\\/g, '/')
}

// 一次性拆分目录路径与文件名，避免渲染阶段重复 split
function splitPath(path?: string) {
  const normalizedPath = normalizePath(path).replace(/\/+$/, '')
  if (!normalizedPath) return { dir: '', name: '-' }
  const lastSlashIndex = normalizedPath.lastIndexOf('/')
  if (lastSlashIndex < 0) return { dir: '', name: normalizedPath }
  return {
    dir: normalizedPath.slice(0, lastSlashIndex) || '/',
    name: normalizedPath.slice(lastSlashIndex + 1) || normalizedPath,
  }
}

// 归一化可选目的路径，保证未指定时向接口传递 null 而不是空字符串。
function normalizeTargetPath(path?: string | null) {
  const normalizedPath = path?.trim()
  return normalizedPath || null
}

// 归一化可选文本参数，保证自动项提交 null 而不是空字符串。
function normalizeOptionalText(value?: string | null) {
  const normalizedValue = value?.trim()
  return normalizedValue || null
}

// 归一化剧集组值，兼容历史对象态值。
function normalizeEpisodeGroup(episodeGroup?: string | { value?: string | null } | null) {
  if (!episodeGroup) return null
  if (typeof episodeGroup === 'string') {
    const normalizedEpisodeGroup = episodeGroup.trim()
    return normalizedEpisodeGroup || null
  }
  if (typeof episodeGroup === 'object' && typeof episodeGroup.value === 'string') {
    const normalizedEpisodeGroup = episodeGroup.value.trim()
    return normalizedEpisodeGroup || null
  }
  return null
}

// 统一解析接口返回的数字字段，兼容 string/number
function toPreviewNumber(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

// 从路径或文件名中回退提取季号
function extractSeasonFromText(text?: string) {
  if (!text) return undefined

  const patterns = [/S(\d{1,2})E\d{1,4}/i, /Season[\s._-]*(\d{1,2})/i, /第\s*(\d{1,2})\s*季/i]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) {
      const season = toPreviewNumber(match[1])
      if (season !== undefined) return season
    }
  }

  return undefined
}

// 获取预览项季号，优先使用响应字段，缺失时从目标/源路径回退提取
function getPreviewSeasonNumber(item: ManualTransferPreviewItem, isMovie: boolean) {
  const season = toPreviewNumber(item.season)
  if (season !== undefined) return season

  return (
    extractSeasonFromText(item.target) ??
    extractSeasonFromText(item.target_dir) ??
    extractSeasonFromText(item.source) ??
    (toPreviewNumber(item.episode) !== undefined && !isMovie ? 1 : undefined)
  )
}

// 标准化预览项中的识别词命中详情
function getPreviewApplyWords(item: ManualTransferPreviewItem) {
  if (!item.apply_words?.length) return []
  const words = new Set<string>()
  for (const word of item.apply_words) {
    const trimmed = word?.trim()
    if (trimmed) words.add(trimmed)
  }
  return [...words]
}

// 一次遍历预计算预览元信息、路径拆分与排序后的文件行，避免大批量数据时重复解析和多次 filter
const previewDerived = computed(() => {
  const rawItems = previewData.value?.items ?? []
  const titleSet = new Set<string>()
  const typeSet = new Set<string>()
  for (const item of rawItems) {
    const title = item.title?.trim()
    if (title) titleSet.add(title)
    const type = item.type?.trim()
    if (type) typeSet.add(type)
  }

  const titles = [...titleSet]
  const types = [...typeSet]
  const titleText = titles.length <= 1 ? titles[0] || '-' : `${titles[0]} +${titles.length - 1}`
  const typeText = types.length <= 1 ? types[0] || t('common.unknown') : types.join(' / ')
  const normalizedType = typeText.toLowerCase()
  const isMovie = normalizedType === '电影' || normalizedType === 'movie'

  const seasonSet = new Set<number>()
  const episodeKeys = new Set<string>()
  const groupedWordDetails = new Map<string, { sourceNames: Set<string>; orgString?: string; applyWords: string[] }>()
  const rows: PreviewFileRow[] = new Array(rawItems.length)
  let needsWideLayout = false

  for (let index = 0; index < rawItems.length; index++) {
    const item = rawItems[index]
    const sourceParts = splitPath(item.source)
    const targetParts = splitPath(item.target)
    const seasonNumber = getPreviewSeasonNumber(item, isMovie)
    const episodeNumber = toPreviewNumber(item.episode)

    if (seasonNumber !== undefined) seasonSet.add(seasonNumber)
    if (episodeNumber !== undefined) {
      const seasonKey = seasonNumber ?? 1
      const episodeEnd = toPreviewNumber(item.episode_end) ?? episodeNumber
      for (let currentEpisode = episodeNumber; currentEpisode <= episodeEnd; currentEpisode++) {
        episodeKeys.add(`${seasonKey}-${currentEpisode}`)
      }
    }

    const applyWords = getPreviewApplyWords(item)
    if (applyWords.length) {
      const detailKey = applyWords.join('\u0000')
      const existingDetail = groupedWordDetails.get(detailKey)
      if (existingDetail) {
        existingDetail.sourceNames.add(sourceParts.name)
      } else {
        groupedWordDetails.set(detailKey, {
          sourceNames: new Set([sourceParts.name]),
          orgString: item.org_string?.trim() || undefined,
          applyWords,
        })
      }
    }

    if (!needsWideLayout && sourceParts.name.length + targetParts.name.length > 72) {
      needsWideLayout = true
    }

    rows[index] = {
      ...item,
      sourceName: sourceParts.name,
      sourceDir: sourceParts.dir,
      targetName: targetParts.name,
      targetDir: targetParts.dir,
      sameName: sourceParts.name === targetParts.name,
      seasonNumber,
      episodeNumber,
    }
  }

  rows.sort((a, b) => {
    if (a.seasonNumber !== b.seasonNumber) {
      if (a.seasonNumber === undefined) return 1
      if (b.seasonNumber === undefined) return -1
      return a.seasonNumber - b.seasonNumber
    }

    if (a.episodeNumber !== undefined && b.episodeNumber !== undefined) {
      if (a.episodeNumber !== b.episodeNumber) return a.episodeNumber - b.episodeNumber
    }
    if (a.episodeNumber !== undefined && b.episodeNumber === undefined) return -1
    if (a.episodeNumber === undefined && b.episodeNumber !== undefined) return 1

    const nameA = a.target || a.source || ''
    const nameB = b.target || b.source || ''
    return nameA.localeCompare(nameB, undefined, { numeric: true })
  })

  const seasons = [...seasonSet].sort((a, b) => a - b)
  let seasonText = '-'
  if (seasons.length === 1) {
    seasonText = `S${String(seasons[0]).padStart(2, '0')}`
  } else if (seasons.length > 1) {
    seasonText = `S${String(seasons[0]).padStart(2, '0')} +${seasons.length - 1}`
  }

  let episodeCountText = '-'
  if (episodeKeys.size > 0) {
    episodeCountText = String(episodeKeys.size)
  } else if (rawItems.length > 0) {
    episodeCountText = String(rawItems.length)
  }

  const customWordDetails = [...groupedWordDetails.values()].map(detail => {
    const names = [...detail.sourceNames]
    return {
      sourceName: names.length > 1 ? t('dialog.reorganize.customWordsSameRules', { count: names.length }) : names[0],
      orgString: names.length > 1 ? undefined : detail.orgString,
      applyWords: detail.applyWords,
    }
  })

  return {
    rows,
    mediaInfo: {
      title: titleText,
      type: typeText,
    },
    isMovie,
    seasonText,
    episodeCountText,
    customWordDetails,
    needsWideLayout,
  }
})

// 按状态筛选后的预览文件行
const filteredPreviewRows = computed(() => {
  if (previewStatusFilter.value === 'failed') {
    return previewDerived.value.rows.filter(item => item.success === false)
  }
  return previewDerived.value.rows
})

// 分页后的预览数据（直接切片预计算结果）
const pagedPreviewRows = computed(() => {
  const start = (previewPage.value - 1) * previewPageSize.value
  return filteredPreviewRows.value.slice(start, start + previewPageSize.value)
})

// 预览统计
const previewSummary = computed(() => {
  return (
    previewData.value?.summary ?? {
      total: 0,
      success: 0,
      failed: 0,
    }
  )
})

// 分页总数
const previewTotalPages = computed(() => {
  return Math.ceil(filteredPreviewRows.value.length / previewPageSize.value)
})

// 顶部媒体信息
const previewMediaInfo = computed(() => previewDerived.value.mediaInfo)

// 是否为电影
const previewIsMovie = computed(() => previewDerived.value.isMovie)

// 顶部季信息
const previewSeasonText = computed(() => previewDerived.value.seasonText)

// 顶部总集数
const previewEpisodeCountText = computed(() => previewDerived.value.episodeCountText)

// 手动整理识别词应用详情
const previewCustomWordDetails = computed(() => previewDerived.value.customWordDetails)

// 切换仅查看失败项/查看全部
function setPreviewStatusFilter(nextFilter: 'all' | 'failed') {
  if (nextFilter === 'failed' && previewSummary.value.failed <= 0) return
  if (previewStatusFilter.value === nextFilter) return
  previewStatusFilter.value = nextFilter
  previewPage.value = 1
}

function toggleFailedPreviewFilter() {
  if (previewSummary.value.failed <= 0) return
  setPreviewStatusFilter(previewStatusFilter.value === 'failed' ? 'all' : 'failed')
}

const previewEpisodeFormatRuleDetails = computed(() => {
  const episodeFormat = transferForm.episode_format?.trim()
  if (!episodeFormat) return []

  const rulePattern = episodeFormatRecommendState.rulePattern?.trim()
  const isGeneratedEpisodeFormat =
    Boolean(episodeFormatRecommendState.generatedFormat) &&
    episodeFormatRecommendState.generatedFormat === episodeFormat

  if (!isGeneratedEpisodeFormat || !episodeFormatRecommendState.ruleName) {
    return [
      {
        sourceName: t('dialog.reorganize.episodeFormatManualInput'),
        orgString: t('dialog.reorganize.episodeFormatFinal', {
          format: episodeFormat,
        }),
        applyWords: [],
      },
    ]
  }

  return [
    {
      sourceName: t('dialog.reorganize.episodeFormatRecommendRule', {
        rule: episodeFormatRecommendState.ruleName,
      }),
      orgString: t('dialog.reorganize.episodeFormatFinal', {
        format: episodeFormat,
      }),
      applyWords: rulePattern
        ? [
            t('dialog.reorganize.episodeFormatRulePattern', {
              pattern: rulePattern,
            }),
          ]
        : [],
    },
  ]
})

const previewRecognitionDetails = computed(() => [
  ...previewCustomWordDetails.value,
  ...previewEpisodeFormatRuleDetails.value,
])

const previewRecognitionDetailTitle = computed(() => {
  return previewCustomWordDetails.value.length
    ? t('dialog.reorganize.customWordsApplied')
    : t('dialog.reorganize.episodeFormatRuleDetails')
})

// 是否需要拓宽窗口
const previewNeedsWideLayout = computed(() => previewDerived.value.needsWideLayout)

// 弹窗宽度
const dialogMaxWidth = computed(() => {
  if (!display.mdAndUp.value) return '100%'

  if (!previewVisible.value) return 'min(45rem, calc(100vw - 2rem))'

  const preferredWidth = previewNeedsWideLayout.value ? '126rem' : '110rem'
  return `min(${preferredWidth}, calc(100vw - 2rem))`
})

// 预览按钮图标
const previewToggleIcon = computed(() => {
  return previewVisible.value ? 'mdi-eye-off-outline' : 'mdi-eye-outline'
})

// 获取文件父目录键，用于判断多文件是否来自同一目录。
function getFileParentKey(item?: FileItem) {
  if (!item?.path) return ''
  const storage = item.storage ?? 'local'
  const pathParts = item.path.split('/')
  pathParts.pop()
  const parentPath = pathParts.join('/') || '/'
  return `${storage}|${parentPath}`
}

const episodeFormatRecommendSelectedFileItems = computed(() => {
  return shouldUseBatchFileItems(normalizedItems.value) ? normalizedItems.value : []
})

const episodeFormatRecommendHasValidSelectedFiles = computed(() => {
  if (episodeFormatRecommendSelectedFileItems.value.length <= 1) return false

  const directoryKeys = new Set(episodeFormatRecommendSelectedFileItems.value.map(item => getFileParentKey(item)))
  return directoryKeys.size === 1
})

const episodeFormatRecommendSourceItem = computed<FileItem | undefined>(() => {
  if (normalizedItems.value.length !== 1) return undefined
  return normalizedItems.value[0]
})

const canRecommendEpisodeFormat = computed(() => {
  return (
    (Boolean(episodeFormatRecommendSourceItem.value?.path) || episodeFormatRecommendHasValidSelectedFiles.value) &&
    !progressDialog.value &&
    !episodeFormatRecommendState.loading
  )
})

const episodeFormatRecommendSelectionKey = computed(() => {
  const sourceItem = episodeFormatRecommendSourceItem.value
  if (sourceItem) return getFileItemKey(sourceItem)
  return episodeFormatRecommendSelectedFileItems.value.map(item => getFileItemKey(item)).join('||')
})

const episodeFormatRecommendTooltip = computed(() => {
  if (episodeFormatRecommendState.loading) return t('dialog.reorganize.episodeFormatRecommendLoading')
  if (normalizedItems.value.length > 1 && !episodeFormatRecommendHasValidSelectedFiles.value) {
    return t('dialog.reorganize.episodeFormatRecommendInvalidSelection')
  }
  if (!episodeFormatRecommendSourceItem.value?.path && !episodeFormatRecommendHasValidSelectedFiles.value) {
    return t('dialog.reorganize.episodeFormatRecommendSelectFile')
  }
  if (episodeFormatRuleConfigured.value === false) return t('dialog.reorganize.episodeFormatRecommendNeedWords')
  return t('dialog.reorganize.episodeFormatRecommendAction')
})

watch(
  episodeFormatRecommendSelectionKey,
  () => {
    transferForm.fileitem = episodeFormatRecommendSourceItem.value ?? ({} as FileItem)
    episodeFormatRecommendState.ruleName = undefined
    episodeFormatRecommendState.rulePattern = undefined
    episodeFormatRecommendState.generatedFormat = undefined
    episodeFormatRecommendState.sampleFile = undefined
    episodeFormatRecommendState.lastMessage = undefined
  },
  { immediate: true },
)

// 判断文件集合是否可以按批量文件请求提交。
function shouldUseBatchFileItems(items: FileItem[]) {
  return items.length > 0 && items.every(item => item.type === 'file')
}

// 生成批量文件在提示和错误信息中的显示名称。
function getBatchItemsLabel(items: FileItem[]) {
  if (items.length === 1) return items[0].path || items[0].name
  return t('dialog.reorganize.multipleItemsTitle', { count: items.length })
}

// 生成历史记录在提示和错误信息中的显示名称。
function getHistoryLogidsLabel(logids: number[]) {
  return logids.length === 1 ? `历史记录 ${logids[0]}` : `历史记录 ${logids.join('、')}`
}

// 构造整理请求
function createTransferPayload(options: {
  item?: FileItem
  items?: FileItem[]
  logid?: number
  logids?: number[]
  preview?: boolean
}) {
  const sourceItem = options.item ?? (options.items?.length ? options.items[0] : ({} as FileItem))
  const payload: ManualTransferPayload = {
    ...transferForm,
    fileitem: sourceItem,
    logid: options.logid ?? 0,
    target_storage: normalizeOptionalText(transferForm.target_storage),
    target_path: normalizeTargetPath(transferForm.target_path),
    transfer_type: normalizeOptionalText(transferForm.transfer_type),
    media_source: mediaSource.value,
    media_id: normalizeOptionalText(transferForm.media_id),
    episode_group: normalizeEpisodeGroup(transferForm.episode_group),
  }

  if (options.items?.length) {
    payload.fileitems = options.items
    if (!options.item) {
      // 文件集合请求以 fileitems 为准，避免残留 fileitem 状态把请求误导成目录语义。
      delete payload.fileitem
    }
  }
  if (options.logids?.length) payload.logids = options.logids
  if (options.preview) payload.preview = true
  return payload
}

// 请求整理接口
async function requestManualTransfer<T = unknown>(
  payload: ManualTransferPayload,
  background: boolean = false,
  signal?: AbortSignal,
): Promise<ApiResponse<T>> {
  return await api.post<ApiResponse<T>, ApiResponse<T>>(
    `transfer/manual?background=${background}`,
    payload,
    signal ? { signal } : undefined,
  )
}

// 查询当前文件或目录是否存在成功整理历史，决定是否展示重新整理语义。
async function loadManualTransferHistory() {
  if (props.logids?.length || !normalizedItems.value.length) return

  manualHistoryLoading.value = true
  try {
    const payload =
      normalizedItems.value.length === 1 ? { fileitem: normalizedItems.value[0] } : { fileitems: normalizedItems.value }
    const result = await api.post<ApiResponse<ManualTransferHistoryInfo>, ApiResponse<ManualTransferHistoryInfo>>(
      'transfer/manual/history',
      payload,
    )
    if (!result.success) return

    manualHistoryCount.value = result.data?.history_count ?? 0
  } catch (error) {
    console.error(error)
  } finally {
    manualHistoryLoading.value = false
  }
}

// 加载剧集格式规则配置状态，用于决定是否允许自动推荐。
async function loadEpisodeFormatRuleConfiguration() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/public/EpisodeFormatRuleTable')
    episodeFormatRuleConfigured.value = Boolean(result.data?.value?.length)
  } catch (error) {
    console.log(error)
    episodeFormatRuleConfigured.value = undefined
  }
}

// 根据当前文件或同目录多文件请求推荐剧集格式。
async function handleRecommendEpisodeFormat() {
  const sourceItem = episodeFormatRecommendSourceItem.value
  const selectedFileItems = episodeFormatRecommendSelectedFileItems.value
  const hasValidSelectedFiles = episodeFormatRecommendHasValidSelectedFiles.value
  if (!sourceItem?.path && !hasValidSelectedFiles) {
    $toast.warning(
      normalizedItems.value.length > 1
        ? t('dialog.reorganize.episodeFormatRecommendInvalidSelection')
        : t('dialog.reorganize.episodeFormatRecommendSelectFile'),
    )
    return
  }

  if (episodeFormatRuleConfigured.value === false) {
    $toast.warning(t('dialog.reorganize.episodeFormatRecommendNeedWords'))
    return
  }

  episodeFormatRecommendState.loading = true

  try {
    const hasExistingEpisodeFormat = Boolean(transferForm.episode_format?.trim())
    const result = await api.post<ApiResponse<EpisodeFormatRecommendData>, ApiResponse<EpisodeFormatRecommendData>>(
      'transfer/episode-format/recommend',
      hasValidSelectedFiles
        ? {
            fileitems: selectedFileItems,
          }
        : {
            fileitem: sourceItem,
          },
    )

    if (!result.success) {
      $toast.error(result.message || t('dialog.reorganize.episodeFormatRecommendFailed'))
      return
    }

    const data = result.data ?? {}
    if (!data.episode_format) {
      $toast.error(t('dialog.reorganize.episodeFormatRecommendFailed'))
      return
    }

    transferForm.episode_format = data.episode_format
    episodeFormatRecommendState.ruleName = data.rule_name
    episodeFormatRecommendState.rulePattern = data.pattern
    episodeFormatRecommendState.generatedFormat = data.episode_format
    episodeFormatRecommendState.sampleFile = data.sample_file
    episodeFormatRecommendState.lastMessage = data.message

    $toast.success(
      hasExistingEpisodeFormat
        ? t('dialog.reorganize.episodeFormatRecommendOverwriteSuccess')
        : t('dialog.reorganize.episodeFormatRecommendSuccess'),
    )
  } catch (error: any) {
    console.log(error)
    $toast.error(error?.message || t('dialog.reorganize.episodeFormatRecommendFailed'))
  } finally {
    episodeFormatRecommendState.loading = false
  }
}

// 创建空预览数据，作为多次预览结果的合并目标。
function getDefaultPreviewData(): ManualTransferPreviewData {
  return {
    summary: {
      total: 0,
      success: 0,
      failed: 0,
    },
    items: [],
    message: '',
  }
}

// 重置预览数据、筛选和分页状态。
function resetPreviewState() {
  previewData.value = undefined
  previewLoaded.value = false
  previewPage.value = 1
  previewStatusFilter.value = 'all'
}

// 中止在途预览请求并推进代际号，确保过期响应不会回写状态。
function abortPreviewRequest() {
  previewRequestGeneration += 1
  if (previewAbortController) {
    previewAbortController.abort()
    previewAbortController = null
  }
}

// 判断异常是否源于主动取消请求。
function isPreviewAbortError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const err = error as { name?: string; code?: string }
  return err.name === 'AbortError' || err.name === 'CanceledError' || err.code === 'ERR_CANCELED'
}

// 判断预览结果中是否存在失败项。
function previewHasFailures(data?: ManualTransferPreviewData) {
  if (!data) return false

  return (data.summary.failed ?? 0) > 0 || (data.items ?? []).some(item => item.success === false)
}

// 生成预览结果成功和失败数量摘要。
function getPreviewResultSummaryMessage(data?: ManualTransferPreviewData) {
  const success = data?.summary.success ?? 0
  const failed = data?.summary.failed ?? 0

  return [
    t('dialog.reorganize.previewSuccess', { count: success }),
    t('dialog.reorganize.previewFailed', { count: failed }),
  ].join('，')
}

// 构造单条失败预览数据，便于把异常请求合并到预览列表。
function createFailedPreviewData(options: { source?: string; type?: string; title?: string; message?: string }) {
  const failedItem: ManualTransferPreviewItem = {
    source: options.source,
    target: '',
    success: false,
    message: options.message || t('dialog.reorganize.previewRequestFailed'),
    type: options.type,
    title: options.title,
  }

  return {
    summary: {
      total: 1,
      success: 0,
      failed: 1,
    },
    items: [failedItem],
    message: failedItem.message,
  } satisfies ManualTransferPreviewData
}

// 单次遍历合并预览结果并增量维护计数，避免重复拷贝数组与多次 filter。
function mergePreviewData(
  target: ManualTransferPreviewData,
  incoming?: ManualTransferPreviewData,
  seenItemKeys?: Set<string>,
) {
  if (!incoming) return

  const targetItems = target.items ?? (target.items = [])
  const existingItemKeys = seenItemKeys ?? new Set(targetItems.map(item => getPreviewItemKey(item)))

  for (const item of incoming.items ?? []) {
    const itemKey = getPreviewItemKey(item)
    if (existingItemKeys.has(itemKey)) continue

    existingItemKeys.add(itemKey)
    targetItems.push(item)
    target.summary.total += 1
    if (item.success === false) target.summary.failed += 1
    else target.summary.success += 1
  }

  if (incoming.message) {
    target.message = target.message ? `${target.message}；${incoming.message}` : incoming.message
  }
}

// 从标准响应中提取可展示的整理预览数据，优先保留顶层本地化消息。
function resolvePreviewResponseData(result: ApiResponse<ManualTransferPreviewData>) {
  if (!result.data) return result.data

  const message = result.message_i18n || result.message || result.data.message
  if (!message || message === result.data.message) return result.data

  return {
    ...result.data,
    message,
  }
}

// 预览整理结果
async function previewTransfer() {
  if (!props.logids?.length && !normalizedItems.value.length) return

  abortPreviewRequest()
  const generation = previewRequestGeneration
  const controller = new AbortController()
  previewAbortController = controller

  previewLoading.value = true
  resetPreviewState()

  const mergedPreviewData = getDefaultPreviewData()
  const seenItemKeys = new Set<string>()

  try {
    const tasks: Promise<void>[] = []

    if (normalizedItems.value.length) {
      if (shouldUseBatchFileItems(normalizedItems.value)) {
        try {
          const result = await requestManualTransfer<ManualTransferPreviewData>(
            createTransferPayload({ items: normalizedItems.value, preview: true }),
            false,
            controller.signal,
          )
          if (generation !== previewRequestGeneration) return
          if (!result.success) {
            mergePreviewData(
              mergedPreviewData,
              createFailedPreviewData({
                source: getBatchItemsLabel(normalizedItems.value),
                message: result.message || t('dialog.reorganize.previewRequestFailed'),
              }),
              seenItemKeys,
            )
          } else {
            mergePreviewData(mergedPreviewData, resolvePreviewResponseData(result), seenItemKeys)
          }
        } catch (err: any) {
          if (generation !== previewRequestGeneration || isPreviewAbortError(err)) return
          console.warn(`预览请求异常: ${err?.message}`)
          mergePreviewData(
            mergedPreviewData,
            createFailedPreviewData({
              source: getBatchItemsLabel(normalizedItems.value),
              message: `${getBatchItemsLabel(normalizedItems.value)}: ${err?.message || t('dialog.reorganize.previewRequestFailed')}`,
            }),
            seenItemKeys,
          )
        }
      } else {
        tasks.push(
          ...normalizedItems.value.map(async item => {
            try {
              const result = await requestManualTransfer<ManualTransferPreviewData>(
                createTransferPayload({ item, preview: true }),
                false,
                controller.signal,
              )
              if (generation !== previewRequestGeneration) return
              if (!result.success) {
                mergePreviewData(
                  mergedPreviewData,
                  createFailedPreviewData({
                    source: item.path || item.name,
                    type: item.type,
                    title: item.name,
                    message: result.message || t('dialog.reorganize.previewRequestFailed'),
                  }),
                  seenItemKeys,
                )
                return
              }

              mergePreviewData(mergedPreviewData, resolvePreviewResponseData(result), seenItemKeys)
            } catch (err: any) {
              if (generation !== previewRequestGeneration || isPreviewAbortError(err)) return
              console.warn(`预览请求异常: ${err?.message}`)
              mergePreviewData(
                mergedPreviewData,
                createFailedPreviewData({
                  source: item.path || item.name,
                  type: item.type,
                  title: item.name,
                  message: `${item.name || item.path}: ${err?.message || t('dialog.reorganize.previewRequestFailed')}`,
                }),
                seenItemKeys,
              )
            }
          }),
        )
      }
    }

    if (props.logids?.length) {
      const logids = props.logids
      const historyLabel = getHistoryLogidsLabel(logids)
      tasks.push(
        (async () => {
          try {
            const result = await requestManualTransfer<ManualTransferPreviewData>(
              createTransferPayload({ logids, preview: true }),
              false,
              controller.signal,
            )
            if (generation !== previewRequestGeneration) return
            if (!result.success) {
              mergePreviewData(
                mergedPreviewData,
                createFailedPreviewData({
                  source: historyLabel,
                  message: result.message || t('dialog.reorganize.previewRequestFailed'),
                }),
                seenItemKeys,
              )
              return
            }

            mergePreviewData(mergedPreviewData, resolvePreviewResponseData(result), seenItemKeys)
          } catch (err: any) {
            if (generation !== previewRequestGeneration || isPreviewAbortError(err)) return
            console.warn(`预览请求异常: ${err?.message}`)
            mergePreviewData(
              mergedPreviewData,
              createFailedPreviewData({
                source: historyLabel,
                message: `${historyLabel}: ${err?.message || t('dialog.reorganize.previewRequestFailed')}`,
              }),
              seenItemKeys,
            )
          }
        })(),
      )
    }

    await Promise.all(tasks)

    if (generation !== previewRequestGeneration || !previewVisible.value) return

    previewData.value = mergedPreviewData
    previewLoaded.value = true

    if (previewHasFailures(mergedPreviewData)) {
      $toast.warning(getPreviewResultSummaryMessage(mergedPreviewData))
    }
  } catch (error: any) {
    if (generation !== previewRequestGeneration || isPreviewAbortError(error)) return
    previewVisible.value = false
    resetPreviewState()
    $toast.error(error?.message || t('dialog.reorganize.previewRequestFailed'))
  } finally {
    if (generation === previewRequestGeneration) {
      previewLoading.value = false
      previewAbortController = null
    }
  }
}

// 切换预览面板，收起时中止在途请求，展开时拉取最新预览结果。
async function togglePreview() {
  if (previewVisible.value) {
    debouncedPreviewTransfer.cancel()
    abortPreviewRequest()
    previewLoading.value = false
    previewVisible.value = false
    return
  }

  previewVisible.value = true
  await previewTransfer()
}

// 展开预览后，表单变更合并为一次延迟刷新，允许新代际请求取代旧在途请求。
const debouncedPreviewTransfer = debounce(() => {
  if (previewVisible.value && !transferSubmitting.value) void previewTransfer()
}, 500)

watch(
  transferForm,
  () => {
    if (previewVisible.value) debouncedPreviewTransfer()
  },
  { deep: true },
)

// 整理文件
async function handleTransfer(item: FileItem, background: boolean = false) {
  try {
    const result = await requestManualTransfer(createTransferPayload({ item }), background)
    if (!result.success) {
      $toast.error(result.message || t('dialog.reorganize.transferRequestFailed'))
      return false
    }
    if (background) $toast.success(t('dialog.reorganize.successMessage', { name: item.name }))
    return true
  } catch (error: unknown) {
    console.log(error)
    if (error instanceof Error) $toast.error(error.message)
    return false
  }
}

// 批量整理文件并按后台模式决定是否提示入队成功。
async function handleTransferBatch(items: FileItem[], background: boolean = false) {
  try {
    const result = await requestManualTransfer(createTransferPayload({ items }), background)
    if (!result.success) {
      $toast.error(result.message || t('dialog.reorganize.transferRequestFailed'))
      return false
    }
    if (background) $toast.success(t('dialog.reorganize.successMessage', { name: getBatchItemsLabel(items) }))
    return true
  } catch (error: unknown) {
    console.log(error)
    if (error instanceof Error) $toast.error(error.message)
    return false
  }
}

// 批量整理历史记录，一次请求提交所选全部历史ID。
async function handleTransferLogs(logids: number[], background: boolean = false) {
  try {
    const result = await requestManualTransfer(createTransferPayload({ logids }), background)
    if (!result.success) {
      $toast.error(result.message || t('dialog.reorganize.transferRequestFailed'))
      return false
    }
    if (background) $toast.success(`${getHistoryLogidsLabel(logids)} 已加入整理队列！`)
    return true
  } catch (error: unknown) {
    console.log(error)
    if (error instanceof Error) $toast.error(error.message)
    return false
  }
}

// 进度SSE消息处理函数
function handleProgressMessage(event: MessageEvent) {
  const progress = JSON.parse(event.data)
  if (progress) {
    progressText.value = progress.text_i18n || progress.text
    progressValue.value = progress.value
  }
}

// 使用SSE监听加载进度
function startLoadingProgress(key: string) {
  progressText.value = t('dialog.reorganize.processing')
  progressActive.value = true

  // 如果已经有连接，先停止
  if (progressSSE.value) {
    progressSSE.value.stop()
  }

  const url = `${import.meta.env.VITE_API_BASE_URL}system/progress/${key}`

  // 创建新的SSE连接
  progressSSE.value = useProgressSSE(url, handleProgressMessage, `reorganize-progress-${key}`, progressActive)

  progressSSE.value.start()
}

// 停止监听加载进度
function stopLoadingProgress() {
  progressActive.value = false
  if (progressSSE.value) {
    progressSSE.value.stop()
    progressSSE.value = null
  }
}

// 整理表单引用
const reorganizeFormRef = ref()
const optionalNumberValidator = (val: unknown) =>
  val === undefined || val === null || val === '' || numberValidator(val)

// 整理文件
async function transfer(background: boolean = false) {
  if ((!props.logids?.length && !normalizedItems.value.length) || transferSubmitting.value) return
  const { valid } = (await reorganizeFormRef.value?.validate()) || { valid: true }
  if (!valid) return

  transferSubmitting.value = true
  progressDialog.value = true
  let allSucceeded = true

  try {
    // 文件整理
    if (normalizedItems.value.length) {
      if (shouldUseBatchFileItems(normalizedItems.value)) {
        if (!background) {
          startLoadingProgress('filetransfer')
        }
        allSucceeded = (await handleTransferBatch(normalizedItems.value, background)) && allSucceeded
      } else {
        for (const item of normalizedItems.value) {
          if (!background) {
            // 如果是文件，计算MD5
            const key = item.type === 'dir' ? 'filetransfer' : CryptoJS.MD5(item.path).toString()

            // 开始监听进度
            startLoadingProgress(key)
          }
          allSucceeded = (await handleTransfer(item, background)) && allSucceeded
        }
      }
    }

    // 日志整理
    if (props.logids?.length) {
      if (!background) {
        // 为日志整理任务开启进度监听
        startLoadingProgress('filetransfer')
      }
      allSucceeded = (await handleTransferLogs(props.logids, background)) && allSucceeded
    }

    if (allSucceeded) emit('done')
  } finally {
    if (!background) stopLoadingProgress()
    progressDialog.value = false
    transferSubmitting.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadDirectories(), loadManualTransferHistory()])
  loadStorages()
  loadEpisodeFormatRuleConfiguration()
})

onUnmounted(() => {
  stopLoadingProgress()
  debouncedPreviewTransfer.cancel()
  abortPreviewRequest()
  if (episodeGroupQueryTimer) clearTimeout(episodeGroupQueryTimer)
})
</script>

<template>
  <VDialog
    :scrollable="!previewVisible || !display.mdAndUp.value"
    :max-width="dialogMaxWidth"
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard
      class="reorganize-dialog-card"
      :class="{ 'reorganize-dialog-card--split': previewVisible && display.mdAndUp.value }"
    >
      <VCardItem class="mp-dialog-header">
        <template #prepend> <VIcon icon="mdi-folder-move" size="20" class="me-2 text-primary" /> </template>
        <VCardTitle>{{ dialogTitle }}</VCardTitle>
        <VCardSubtitle>{{ dialogSubtitle }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn :disabled="transferSubmitting" @click="emit('close')" />
      <VDivider />
      <VCardText class="pa-0 reorganize-dialog-card__body">
        <div class="reorganize-main-row" :class="{ 'reorganize-main-row--preview-visible': previewVisible }">
          <div class="reorganize-form-pane">
            <div class="reorganize-form-pane__content">
              <VForm ref="reorganizeFormRef" @submit.prevent="() => {}" class="mp-form-sections">
                <!-- 目标存储与目录 -->
                <section class="mp-form-section">
                  <VRow class="mp-form-grid">
                    <VCol cols="12" sm="6">
                      <VSelect
                        v-model="transferForm.target_storage"
                        :items="storageOptions"
                        :label="t('dialog.reorganize.targetStorage')"
                        :placeholder="t('dialog.reorganize.targetPathPlaceholder')"
                        :hint="t('dialog.reorganize.targetStorageHint')"
                        persistent-hint
                        prepend-inner-icon="mdi-harddisk"
                      />
                    </VCol>
                    <VCol cols="12" sm="6">
                      <VSelect
                        v-model="transferForm.transfer_type"
                        :label="t('dialog.reorganize.transferType')"
                        :items="manualTransferTypeOptions"
                        :hint="t('dialog.reorganize.transferTypeHint')"
                        persistent-hint
                        prepend-inner-icon="mdi-swap-horizontal"
                      />
                    </VCol>
                    <VCol cols="12">
                      <VCombobox
                        v-model="targetPathSelection"
                        :items="targetDirectoryOptions"
                        item-title="title"
                        item-value="value"
                        :return-object="false"
                        :label="t('dialog.reorganize.targetPath')"
                        :placeholder="t('dialog.reorganize.targetPathPlaceholder')"
                        :hint="t('dialog.reorganize.targetPathHint')"
                        persistent-hint
                        prepend-inner-icon="mdi-folder-outline"
                      />
                    </VCol>
                  </VRow>
                </section>

                <!-- 媒体识别与季集规则 -->
                <section class="mp-form-section">
                  <VRow class="mp-form-grid">
                    <VCol cols="12" sm="6">
                      <VSelect
                        v-model="transferForm.type_name"
                        :label="t('dialog.reorganize.mediaType')"
                        :items="[
                          { title: t('dialog.reorganize.auto'), value: '' },
                          { title: t('dialog.reorganize.movie'), value: '电影' },
                          { title: t('dialog.reorganize.tv'), value: '电视剧' },
                        ]"
                        :hint="t('dialog.reorganize.mediaTypeHint')"
                        persistent-hint
                        prepend-inner-icon="mdi-movie-open"
                      />
                    </VCol>
                    <VCol cols="12" sm="6">
                      <VSelect
                        v-model="transferForm.media_source"
                        :items="mediaSourceItems"
                        :label="t('dialog.reorganize.mediaSource')"
                        :hint="t('dialog.reorganize.mediaSourceHint')"
                        persistent-hint
                        prepend-inner-icon="mdi-database-search"
                      />
                    </VCol>
                    <VCol cols="12">
                      <VTextField
                        v-model="transferForm.media_id"
                        :disabled="transferForm.type_name === ''"
                        :label="mediaIdLabel"
                        :placeholder="t('dialog.reorganize.mediaIdPlaceholder')"
                        :rules="[optionalNumberValidator]"
                        append-inner-icon="mdi-magnify"
                        :hint="t('dialog.reorganize.mediaIdHint')"
                        persistent-hint
                        prepend-inner-icon="mdi-identifier"
                        @click:append-inner="mediaSelectorDialog = true"
                      />
                    </VCol>
                  </VRow>
                </section>

                <section v-show="transferForm.type_name === '电视剧'" class="mp-form-section">
                  <VRow class="mp-form-grid">
                    <VCol v-if="mediaSource === 'themoviedb'" cols="12">
                      <VSelect
                        v-model="transferForm.episode_group"
                        :items="episodeGroupOptions"
                        item-title="title"
                        item-value="value"
                        :item-props="episodeGroupItemProps"
                        :loading="episodeGroupLoading"
                        :disabled="!transferForm.media_id"
                        clearable
                        :label="t('dialog.reorganize.episodeGroup')"
                        :placeholder="t('dialog.reorganize.episodeGroupPlaceholder')"
                        :hint="t('dialog.reorganize.episodeGroupHint')"
                        persistent-hint
                        prepend-inner-icon="mdi-view-list"
                      />
                    </VCol>
                    <VCol cols="12" sm="6">
                      <VSelect
                        v-model.number="transferForm.season"
                        :label="t('dialog.reorganize.season')"
                        :items="seasonItems"
                        :hint="t('dialog.reorganize.seasonHint')"
                        persistent-hint
                        prepend-inner-icon="mdi-calendar"
                      />
                    </VCol>
                    <VCol cols="12" sm="6">
                      <VTextField
                        v-model="transferForm.episode_detail"
                        :disabled="disableEpisodeDetail"
                        :label="t('dialog.reorganize.episodeDetail')"
                        :placeholder="t('dialog.reorganize.episodeDetailPlaceholder')"
                        :hint="t('dialog.reorganize.episodeDetailHint')"
                        persistent-hint
                        prepend-inner-icon="mdi-playlist-play"
                      />
                    </VCol>
                    <VCol cols="12" sm="6">
                      <VTextField
                        v-model="transferForm.episode_format"
                        :label="t('dialog.reorganize.episodeFormat')"
                        :placeholder="t('dialog.reorganize.episodeFormatPlaceholder')"
                        :hint="t('dialog.reorganize.episodeFormatHint')"
                        persistent-hint
                        prepend-inner-icon="mdi-format-text"
                      >
                        <template #append-inner>
                          <VTooltip location="top">
                            <template #activator="{ props: tooltipProps }">
                              <IconBtn
                                v-bind="tooltipProps"
                                type="button"
                                color="primary"
                                variant="text"
                                size="small"
                                class="ms-1"
                                icon="mdi-auto-fix"
                                :loading="episodeFormatRecommendState.loading"
                                :disabled="!canRecommendEpisodeFormat"
                                @click.stop="handleRecommendEpisodeFormat"
                              />
                            </template>
                            <span>
                              {{ episodeFormatRecommendTooltip }}
                            </span>
                          </VTooltip>
                        </template>
                      </VTextField>
                    </VCol>
                    <VCol cols="12" sm="6">
                      <VTextField
                        v-model="transferForm.episode_offset"
                        :label="t('dialog.reorganize.episodeOffset')"
                        :placeholder="t('dialog.reorganize.episodeOffsetPlaceholder')"
                        :hint="t('dialog.reorganize.episodeOffsetHint')"
                        persistent-hint
                        prepend-inner-icon="mdi-numeric"
                      />
                    </VCol>
                  </VRow>
                </section>

                <section class="mp-form-section">
                  <VRow class="mp-form-grid">
                    <VCol cols="12" sm="6">
                      <VTextField
                        v-model="transferForm.episode_part"
                        :label="t('dialog.reorganize.episodePart')"
                        :placeholder="t('dialog.reorganize.episodePartPlaceholder')"
                        :hint="t('dialog.reorganize.episodePartHint')"
                        persistent-hint
                        prepend-inner-icon="mdi-file-multiple"
                      />
                    </VCol>
                    <VCol cols="12" sm="6">
                      <VTextField
                        v-model.number="transferForm.min_filesize"
                        :label="t('dialog.reorganize.minFileSize')"
                        :rules="[optionalNumberValidator]"
                        placeholder="0"
                        :hint="t('dialog.reorganize.minFileSizeHint')"
                        persistent-hint
                        prepend-inner-icon="mdi-file-document-outline"
                      />
                    </VCol>
                  </VRow>
                </section>

                <!-- 整理选项紧凑开关组 -->
                <section class="mp-form-section">
                  <div class="mp-settings-card">
                    <div class="mp-setting-row" :title="t('dialog.reorganize.typeFolderHint')">
                      <VSwitch
                        v-model="transferForm.library_type_folder"
                        :label="t('dialog.reorganize.typeFolderOption')"
                        hide-details
                        color="primary"
                        inset
                        density="compact"
                      />
                    </div>
                    <div class="mp-setting-row" :title="t('dialog.reorganize.categoryFolderHint')">
                      <VSwitch
                        v-model="transferForm.library_category_folder"
                        :label="t('dialog.reorganize.categoryFolderOption')"
                        hide-details
                        color="primary"
                        inset
                        density="compact"
                      />
                    </div>
                    <div class="mp-setting-row" :title="t('dialog.reorganize.scrapeHint')">
                      <VSwitch
                        v-model="transferForm.scrape"
                        :label="t('dialog.reorganize.scrapeOption')"
                        hide-details
                        color="primary"
                        inset
                        density="compact"
                      />
                    </div>
                    <div
                      v-if="props.logids?.length"
                      class="mp-setting-row"
                      :title="t('dialog.reorganize.fromHistoryHint')"
                    >
                      <VSwitch
                        v-model="transferForm.from_history"
                        :label="t('dialog.reorganize.fromHistoryOption')"
                        hide-details
                        color="primary"
                        inset
                        density="compact"
                      />
                    </div>
                    <div v-else class="mp-setting-row" :title="t('dialog.reorganize.skipTransferredHint')">
                      <VSwitch
                        v-model="skipTransferred"
                        :label="t('dialog.reorganize.skipTransferredOption')"
                        hide-details
                        color="primary"
                        inset
                        density="compact"
                      />
                    </div>
                  </div>
                </section>

                <Transition name="fade-transition">
                  <div
                    v-if="manualHistoryCount > 0"
                    class="reorganize-history-notice"
                    :class="skipTransferred ? 'reorganize-history-notice--info' : 'reorganize-history-notice--warning'"
                    role="status"
                  >
                    <VIcon
                      :icon="skipTransferred ? 'mdi-check-circle-outline' : 'mdi-history'"
                      size="16"
                      class="reorganize-history-notice__icon"
                    />
                    <span class="reorganize-history-notice__text">
                      {{
                        t(
                          skipTransferred
                            ? 'dialog.reorganize.historyFound'
                            : 'dialog.reorganize.historyFoundReorganize',
                          { count: manualHistoryCount },
                        )
                      }}
                    </span>
                  </div>
                </Transition>
              </VForm>
            </div>
            <VDivider />
            <VCardActions class="app-dialog-actions reorganize-form-pane__actions">
              <VBtn
                color="default"
                variant="outlined"
                size="small"
                @click="togglePreview"
                :prepend-icon="previewToggleIcon"
                class="reorganize-action-btn reorganize-action-btn--preview"
                :class="{ 'reorganize-action-btn--active': previewVisible }"
                :loading="previewLoading"
              >
                {{ t('dialog.reorganize.previewResult') }}
              </VBtn>
              <VBtn
                color="default"
                variant="outlined"
                size="small"
                @click="transfer(true)"
                prepend-icon="mdi-plus"
                class="reorganize-action-btn reorganize-action-btn--queue"
                :loading="transferSubmitting"
                :disabled="transferSubmitting"
              >
                {{ t('dialog.reorganize.addToQueue') }}
              </VBtn>
              <VSpacer />
              <VBtn color="default" variant="text" size="small" :disabled="transferSubmitting" @click="emit('close')">
                {{ t('common.cancel') }}
              </VBtn>
              <VBtn
                color="primary"
                variant="flat"
                size="small"
                @click="transfer(false)"
                :prepend-icon="isReorganize ? 'mdi-refresh' : 'mdi-arrow-right-bold'"
                class="reorganize-action-btn reorganize-action-btn--primary px-4"
                :loading="manualHistoryLoading || transferSubmitting"
                :disabled="transferSubmitting"
              >
                {{ isReorganize ? t('dialog.reorganize.reorganizeAgain') : t('dialog.reorganize.reorganizeNow') }}
              </VBtn>
            </VCardActions>
          </div>
          <div v-show="previewVisible" class="reorganize-preview-pane">
            <div class="reorganize-preview-pane__header">
              <div class="reorganize-preview-pane__title-block">
                <div class="reorganize-preview-pane__title-row">
                  <div class="text-h6">{{ t('dialog.reorganize.previewTitle') }}</div>
                  <div v-if="previewLoaded" class="preview-title-stats">
                    <VChip
                      color="primary"
                      :variant="previewStatusFilter === 'all' ? 'tonal' : 'outlined'"
                      size="small"
                      :class="{ 'preview-stat-chip--clickable': previewStatusFilter === 'failed' }"
                      @click="setPreviewStatusFilter('all')"
                    >
                      {{ t('dialog.reorganize.previewTotal', { count: previewSummary.total }) }}
                    </VChip>
                    <VChip color="success" variant="tonal" size="small">
                      {{ t('dialog.reorganize.previewSuccess', { count: previewSummary.success }) }}
                    </VChip>
                    <VChip
                      color="error"
                      :variant="previewStatusFilter === 'failed' ? 'flat' : 'tonal'"
                      size="small"
                      :class="{ 'preview-stat-chip--clickable': previewSummary.failed > 0 }"
                      :aria-pressed="previewSummary.failed > 0 ? previewStatusFilter === 'failed' : undefined"
                      @click="toggleFailedPreviewFilter"
                    >
                      {{ t('dialog.reorganize.previewFailed', { count: previewSummary.failed }) }}
                    </VChip>
                  </div>
                </div>
                <div class="text-body-2 text-medium-emphasis mt-1">
                  {{ t('dialog.reorganize.previewSubtitle') }}
                </div>
              </div>
            </div>
            <div class="reorganize-preview-pane__body">
              <div v-if="previewLoading" class="reorganize-preview-pane__loading">
                <VProgressCircular indeterminate color="info" />
                <div class="text-body-2 text-medium-emphasis mt-3">{{ t('dialog.reorganize.previewLoading') }}</div>
              </div>
              <template v-else-if="previewLoaded">
                <div class="reorganize-preview-pane__scroll">
                  <div class="reorganize-preview-pane__summary">
                    <div v-if="previewData?.message" class="preview-note">
                      {{ previewData.message }}
                    </div>
                    <div class="preview-summary-strip">
                      <span class="preview-summary-strip__title" :title="previewMediaInfo.title">
                        {{ previewMediaInfo.title }}
                      </span>
                      <div class="preview-summary-strip__meta">
                        <span class="preview-meta-pill">{{ previewMediaInfo.type }}</span>
                        <span v-if="!previewIsMovie" class="preview-meta-pill">{{ previewSeasonText }}</span>
                        <span v-if="!previewIsMovie" class="preview-meta-pill">
                          {{
                            previewEpisodeCountText === '-'
                              ? `${t('dialog.reorganize.previewEpisodeCount')} -`
                              : `共 ${previewEpisodeCountText} 集`
                          }}
                        </span>
                      </div>
                    </div>
                    <div v-if="previewRecognitionDetails.length" class="preview-custom-words">
                      <div class="preview-custom-words__title">
                        <VIcon icon="mdi-tag-text-outline" size="15" />
                        <span>{{ previewRecognitionDetailTitle }}</span>
                      </div>
                      <div class="preview-custom-words__items">
                        <div
                          v-for="(detail, index) in previewRecognitionDetails"
                          :key="`${detail.sourceName}-${index}`"
                          class="preview-custom-words__item"
                        >
                          <div class="preview-custom-words__source">{{ detail.sourceName }}</div>
                          <div v-if="detail.orgString" class="preview-custom-words__original">
                            {{ detail.orgString }}
                          </div>
                          <div v-if="detail.applyWords.length" class="preview-custom-words__chips">
                            <VChip
                              v-for="(word, wordIndex) in detail.applyWords"
                              :key="`${word}-${wordIndex}`"
                              variant="outlined"
                              color="info"
                              size="small"
                              class="preview-custom-words__chip"
                            >
                              {{ word }}
                            </VChip>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="reorganize-preview-list">
                    <div v-if="pagedPreviewRows.length" class="preview-file-body">
                      <div
                        v-for="(item, index) in pagedPreviewRows"
                        :key="`${item.source}-${item.target}-${index}`"
                        class="preview-file-row app-surface-shape"
                        :class="{ 'preview-file-row--failed': item.success === false }"
                      >
                        <div class="preview-file-row__line preview-file-row__line--source">
                          <span class="preview-file-tag preview-file-tag--source">原</span>
                          <div class="preview-file-row__content">
                            <span class="preview-file-row__name" :title="item.source || '-'">
                              {{ item.sourceName }}
                            </span>
                            <span v-if="item.sourceDir" class="preview-file-row__dir" :title="item.sourceDir">
                              {{ item.sourceDir }}
                            </span>
                          </div>
                        </div>
                        <div class="preview-file-row__line preview-file-row__line--target">
                          <span class="preview-file-row__branch" aria-hidden="true">↳</span>
                          <span
                            class="preview-file-tag preview-file-tag--target"
                            :class="{ 'preview-file-tag--failed': item.success === false }"
                          >
                            新
                          </span>
                          <div class="preview-file-row__content">
                            <span
                              class="preview-file-row__name preview-file-row__name--target"
                              :title="item.target || '-'"
                            >
                              {{ item.targetName }}
                            </span>
                            <span v-if="item.targetDir" class="preview-file-row__dir" :title="item.targetDir">
                              {{ item.targetDir }}
                            </span>
                            <span v-if="item.success === false && item.message" class="preview-file-row__message">
                              {{ item.message }}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div v-else class="reorganize-preview-list__empty">
                      {{
                        previewStatusFilter === 'failed'
                          ? t('dialog.reorganize.noFailedPreviewData')
                          : t('dialog.reorganize.noPreviewData')
                      }}
                    </div>
                  </div>
                  <div v-if="previewTotalPages > 1" class="reorganize-preview-pane__pagination">
                    <VBtn
                      size="x-small"
                      icon="mdi-chevron-left"
                      variant="text"
                      :disabled="previewPage <= 1"
                      @click="previewPage--"
                    />
                    <span class="text-caption">{{ previewPage }} / {{ previewTotalPages }}</span>
                    <VBtn
                      size="x-small"
                      icon="mdi-chevron-right"
                      variant="text"
                      :disabled="previewPage >= previewTotalPages"
                      @click="previewPage++"
                    />
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </VCardText>
    </VCard>
    <!-- 手动整理进度框 -->
    <ProgressDialog v-if="progressDialog" v-model="progressDialog" :text="progressText" :value="progressValue" />
    <!-- 媒体数据源ID搜索框 -->
    <VDialog v-model="mediaSelectorDialog" width="40rem" scrollable max-height="85vh">
      <MediaIdSelector
        v-model="transferForm.media_id"
        @close="mediaSelectorDialog = false"
        @select="handleMediaSelected"
        :type="mediaSource"
      />
    </VDialog>
  </VDialog>
</template>

<style lang="scss" scoped>
.mp-dialog-header {
  padding-block: 14px;
  padding-inline: 22px 48px;
}

.mp-form-sections {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.mp-form-grid {
  row-gap: 6px;
}

.reorganize-dialog-card {
  max-block-size: min(92vh, 64rem);
}

.reorganize-dialog-card__body {
  min-block-size: 0;
}

.reorganize-dialog-card--split {
  display: flex;
  flex-direction: column;
  block-size: min(92vh, 64rem);
}

.reorganize-dialog-card--split .reorganize-dialog-card__body {
  display: flex;
  overflow: hidden;
  flex: 1 1 auto;
  flex-direction: column;
}

.reorganize-dialog-card--split .reorganize-main-row {
  flex: 1 1 auto;
  block-size: 100%;
}

.reorganize-main-row {
  display: grid;
  overflow: hidden;
  align-items: stretch;
  grid-template-columns: minmax(0, 1fr);
  inline-size: 100%;
  min-block-size: 0;
  transition: grid-template-columns 0.25s ease;
}

.reorganize-main-row--preview-visible {
  grid-template-columns: minmax(0, 0.94fr) minmax(0, 1.06fr);
}

.reorganize-form-pane {
  display: flex;
  overflow: hidden;
  flex-direction: column;
  max-inline-size: none;
  min-block-size: 0;
  min-inline-size: 0;
}

.reorganize-main-row--preview-visible .reorganize-form-pane {
  border-inline-end: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.1));
}

.reorganize-form-pane__content {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-block-size: 0;
  padding: 18px 22px;
}

.reorganize-dialog-card--split .reorganize-form-pane,
.reorganize-dialog-card--split .reorganize-preview-pane {
  block-size: 100%;
}

.reorganize-dialog-card--split .reorganize-form-pane__content {
  overflow: auto;
}

.reorganize-form-pane__actions {
  gap: 8px;
  margin-block-start: auto;
  padding: 10px 20px !important;
}

.reorganize-action-btn--active {
  border-color: rgba(var(--v-theme-primary), 0.45) !important;
  background: rgba(var(--v-theme-primary), 0.08);
  color: rgb(var(--v-theme-primary));
}

.reorganize-history-notice {
  display: flex;
  align-items: center;
  border-radius: 10px;
  font-size: 0.8125rem;
  gap: 0.5rem;
  line-height: 1.25rem;
  padding-block: 0.5rem;
  padding-inline: 0.875rem;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

.reorganize-history-notice--info {
  border: 1px solid rgba(var(--v-theme-info), 0.22);
  background: rgba(var(--v-theme-info), 0.08);
  color: rgb(var(--v-theme-info));
}

.reorganize-history-notice--warning {
  border: 1px solid rgba(var(--v-theme-warning), 0.26);
  background: rgba(var(--v-theme-warning), 0.1);
  color: rgb(var(--v-theme-warning));
}

.reorganize-history-notice__icon {
  flex: none;
}

.reorganize-history-notice__text {
  overflow: hidden;
  flex: 1 1 auto;
  min-inline-size: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reorganize-preview-pane {
  display: flex;
  overflow: hidden;
  flex-direction: column;
  min-block-size: 0;
  min-inline-size: 0;
}

.reorganize-preview-pane__header {
  display: flex;
  flex: 0 0 auto;
  align-items: flex-start;
  justify-content: space-between;
  border-block-end: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.1));
  gap: 1rem;
  padding-block: 14px 12px;
  padding-inline: 22px;
}

.reorganize-preview-pane__title-block {
  flex: 1 1 auto;
  min-inline-size: 0;
}

.reorganize-preview-pane__title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1rem;
}

.reorganize-preview-pane__body {
  display: flex;
  overflow: hidden;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
}

.preview-title-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  min-inline-size: 0;
}

.preview-stat-chip--clickable {
  cursor: pointer;
  transition:
    transform 0.15s ease,
    opacity 0.15s ease;
}

.preview-stat-chip--clickable:hover {
  opacity: 0.9;
}

.reorganize-preview-pane__summary {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 0.5rem;
  padding-block-start: 12px;
  padding-inline: 22px;
}

.preview-note {
  border: 1px solid rgba(var(--v-theme-error), 0.24);
  border-radius: 10px;
  background: rgba(var(--v-theme-error), 0.06);
  color: rgb(var(--v-theme-error));
  font-size: 0.8125rem;
  line-height: 1.45;
  padding-block: 0.5rem;
  padding-inline: 0.75rem;
}

.preview-summary-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  border: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.1));
  border-radius: 10px;
  background: var(--mp-item-bg, rgba(var(--v-theme-on-surface), 0.025));
  gap: 0.5rem 0.75rem;
  min-block-size: 2.75rem;
  min-inline-size: 0;
  padding-block: 0.5rem;
  padding-inline: 0.875rem;
}

.preview-summary-strip__title {
  overflow: hidden;
  flex: 1 1 10rem;
  color: rgb(var(--v-theme-on-surface));
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1.35;
  min-inline-size: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-summary-strip__meta {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
}

.preview-meta-pill {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.12));
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  color: rgba(var(--v-theme-on-surface), 0.82);
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.2;
  padding-block: 0.2rem;
  padding-inline: 0.55rem;
  white-space: nowrap;
}

.preview-custom-words {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.1));
  border-radius: 10px;
  background: var(--mp-item-bg, rgba(var(--v-theme-on-surface), 0.025));
  gap: 0.375rem;
  padding-block: 0.5rem;
  padding-inline: 0.75rem;
}

.preview-custom-words__title {
  display: inline-flex;
  align-items: center;
  color: rgb(var(--v-theme-info));
  font-size: 0.75rem;
  font-weight: 600;
  gap: 0.3rem;
}

.preview-custom-words__items {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-inline-size: 0;
}

.preview-custom-words__item {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-inline-size: 0;
}

.preview-custom-words__source {
  color: rgb(var(--v-theme-on-surface));
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.preview-custom-words__original {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.preview-custom-words__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  min-inline-size: 0;
}

.preview-custom-words__chip {
  block-size: auto !important;
  max-inline-size: 100%;
  min-block-size: 1.35rem;
  padding-block: 0.15rem;
  white-space: normal;
  word-break: break-all;
}

.reorganize-preview-pane__scroll {
  display: flex;
  overflow: hidden auto;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 0.625rem;
  min-block-size: 0;
  padding-block-end: 0.875rem;
}

.reorganize-preview-pane__pagination {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding-block: 0 0.75rem;
  padding-inline: 1rem;
}

.reorganize-preview-pane__loading {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-block: 2rem;
  padding-inline: 1.5rem;
  text-align: center;
}

.reorganize-preview-list {
  display: flex;
  overflow: visible;
  flex: 0 0 auto;
  flex-direction: column;
  margin-block-end: 0.75rem;
  min-block-size: 0;
  min-inline-size: 0;
  padding-inline: 22px;
}

.preview-file-body {
  display: flex;
  overflow: visible;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 0.5rem;
  min-block-size: 0;
  min-inline-size: 0;
}

.preview-file-row {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.1));
  border-radius: 10px;
  background: var(--mp-item-bg, rgba(var(--v-theme-on-surface), 0.02));
  gap: 0.375rem;
  min-inline-size: 0;
  padding-block: 0.625rem;
  padding-inline: 0.875rem;
}

.preview-file-row--failed {
  border-color: rgba(var(--v-theme-error), 0.3);
  background: rgba(var(--v-theme-error), 0.04);
}

.preview-file-row__line {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  min-inline-size: 0;
}

.preview-file-row__line--target {
  padding-inline-start: 0.125rem;
}

.preview-file-row__branch {
  flex: 0 0 auto;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.8125rem;
  line-height: 1.35rem;
  user-select: none;
}

.preview-file-tag {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  block-size: 1.25rem;
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1;
  margin-block-start: 0.05rem;
  min-inline-size: 1.375rem;
  padding-inline: 0.25rem;
}

.preview-file-tag--source {
  background: rgba(var(--v-theme-on-surface), 0.08);
  color: rgba(var(--v-theme-on-surface), 0.72);
}

.preview-file-tag--target {
  background: rgba(var(--v-theme-primary), 0.14);
  color: rgb(var(--v-theme-primary));
}

.preview-file-tag--failed {
  background: rgba(var(--v-theme-error), 0.14);
  color: rgb(var(--v-theme-error));
}

.preview-file-row__content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 0.125rem;
  min-inline-size: 0;
}

.preview-file-row__name {
  color: rgb(var(--v-theme-on-surface));
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.35;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.preview-file-row__name--target {
  color: rgb(var(--v-theme-primary));
}

.preview-file-row--failed .preview-file-row__name--target {
  color: rgb(var(--v-theme-error));
}

.preview-file-row__dir {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-file-row__message {
  color: rgb(var(--v-theme-error));
  font-size: 0.75rem;
  line-height: 1.4;
  margin-block-start: 0.125rem;
  overflow-wrap: anywhere;
}

.reorganize-preview-list__empty {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  padding-block: 2rem;
  padding-inline: 1rem;
  text-align: center;
}

@media (width <= 1200px) {
  .reorganize-preview-pane__header {
    flex-direction: column;
    align-items: stretch;
  }
}

@media (width <= 959px) {
  .reorganize-dialog-card,
  .reorganize-dialog-card--split {
    block-size: auto;
    max-block-size: none;
  }

  .reorganize-dialog-card--split .reorganize-dialog-card__body,
  .reorganize-dialog-card--split .reorganize-form-pane__content {
    overflow: visible;
  }

  .reorganize-main-row,
  .reorganize-main-row--preview-visible {
    grid-template-columns: 1fr;
  }

  .reorganize-main-row--preview-visible .reorganize-form-pane {
    border-block-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    border-inline-end: none;
  }

  .reorganize-action-btn {
    min-block-size: 2.75rem;
    padding-inline: 1rem;
  }

  .reorganize-preview-pane__summary {
    padding-inline: 1rem;
  }

  .reorganize-preview-list {
    margin-block-end: 1rem;
    padding-inline: 1rem;
  }
}

@media (width <= 640px) {
  .reorganize-form-pane__actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .reorganize-action-btn--primary {
    grid-column: 1 / -1;
  }

  .reorganize-preview-pane__header {
    padding-inline: 1rem;
  }

  .preview-file-body {
    padding-inline: 0.75rem;
  }

  .preview-file-row {
    padding-inline: 0.875rem;
  }
}

@media (width <= 420px) {
  .reorganize-form-pane__actions {
    gap: 0.5rem;
  }

  .reorganize-action-btn {
    font-size: 0.875rem;
  }
}
</style>
