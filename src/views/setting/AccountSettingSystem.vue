<!-- eslint-disable sonarjs/no-duplicate-string -->
<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api, { getApiErrorMessage } from '@/api'

import { DownloaderConf, MediaServerConf } from '@/api/types'
import DownloaderCard from '@/components/cards/DownloaderCard.vue'
import MediaServerCard from '@/components/cards/MediaServerCard.vue'
import { copyToClipboard } from '@/@core/utils/navigator'
import { useI18n } from '@/composables/useChineseText'
import { downloaderOptions, mediaServerOptions } from '@/api/constants'
import { useDisplay } from 'vuetify'

import { useSilentSettingRefresh } from '@/composables/useSilentSettingRefresh'

const display = useDisplay()

// 国际化
const { t } = useI18n()

const props = defineProps({
  active: {
    type: Boolean,
    default: true,
  },
})

// 下载器/媒体服务器排序按需加载，降低系统设置页入口解析量。
const Draggable = defineAsyncComponent(() => import('vuedraggable').then(module => module.default))

// 系统设置项
const SystemSettings = ref<any>({
  // 基础设置
  Basic: {
    DB_TYPE: 'sqlite',
    APP_DOMAIN: null,
    API_TOKEN: null,
    WALLPAPER: 'tmdb',
    GITHUB_TOKEN: null,
    CUSTOMIZE_WALLPAPER_API_URL: null,
  },
  // 高级系统设置
  Advanced: {
    // 全局
    GLOBAL_IMAGE_CACHE: false,
    SUBSCRIBE_STATISTIC_SHARE: true,
    PLUGIN_STATISTIC_SHARE: true,
    USAGE_STATISTIC_SHARE: true,
    WORKFLOW_STATISTIC_SHARE: true,
    BIG_MEMORY_MODE: false,
    DB_WAL_ENABLE: false,
    AUTO_UPDATE_RESOURCE: true,
    MOVIEPILOT_AUTO_UPDATE: false,
    DATA_CLEANUP_ENABLE: false,
    DATA_CLEANUP_MESSAGE_DAYS: 90,
    DATA_CLEANUP_DOWNLOAD_HISTORY_DAYS: 180,
    DATA_CLEANUP_SITE_USERDATA_DAYS: 180,
    DATA_CLEANUP_TRANSFER_HISTORY_DAYS: 365 * 3,
    // 媒体
    RECOGNIZE_PLUGIN_FIRST: false,
    MEDIA_RECOGNIZE_SHARE: true,
    TMDB_API_DOMAIN: null,
    TMDB_API_KEY: null,
    TMDB_IMAGE_DOMAIN: null,
    TMDB_LOCALE: null,
    META_CACHE_EXPIRE: 0,
    SCRAP_FOLLOW_TMDB: true,
    FANART_ENABLE: false,
    FANART_LANG: 'zh,en',
    TMDB_SCRAP_ORIGINAL_IMAGE: null,
    // 网络
    PROXY_HOST: null,
    GITHUB_PROXY: null,
    PIP_PROXY: null,
    DOH_ENABLE: false,
    DOH_RESOLVERS: null,
    DOH_DOMAINS: null,
    SECURITY_IMAGE_DOMAINS: [],
    IMAGE_PROXY_ALLOWED_PRIVATE_RANGES: [],
    // 日志
    DEBUG: false,
    LOG_LEVEL: 'INFO',
    LOG_MAX_FILE_SIZE: '5',
    LOG_BACKUP_COUNT: '3',
    LOG_FILE_FORMAT: '【%(levelname)s】%(asctime)s - %(message)s',
    // 实验室
    PLUGIN_AUTO_RELOAD: false,
    PLUGIN_LOCAL_REPO_PATHS: '',
    RUST_ACCEL: false,
    ENCODING_DETECTION_PERFORMANCE_MODE: true,
    TRANSFER_THREADS: 1,
  },
})

// 刮削配置
const scrapingConfig = [
  {
    section: 'movie',
    items: [
      { key: 'movie_nfo', label: 'setting.system.movieNfo' },
      { key: 'movie_poster', label: 'setting.system.moviePoster' },
      { key: 'movie_backdrop', label: 'setting.system.movieBackdrop' },
      { key: 'movie_logo', label: 'setting.system.movieLogo' },
      { key: 'movie_disc', label: 'setting.system.movieDisc' },
      { key: 'movie_banner', label: 'setting.system.movieBanner' },
      { key: 'movie_thumb', label: 'setting.system.movieThumb' },
    ],
  },
  {
    section: 'tv',
    items: [
      { key: 'tv_nfo', label: 'setting.system.tvNfo' },
      { key: 'tv_poster', label: 'setting.system.tvPoster' },
      { key: 'tv_backdrop', label: 'setting.system.tvBackdrop' },
      { key: 'tv_banner', label: 'setting.system.tvBanner' },
      { key: 'tv_logo', label: 'setting.system.tvLogo' },
      { key: 'tv_thumb', label: 'setting.system.tvThumb' },
    ],
  },
  {
    section: 'season',
    items: [
      { key: 'season_nfo', label: 'setting.system.seasonNfo' },
      { key: 'season_poster', label: 'setting.system.seasonPoster' },
      { key: 'season_banner', label: 'setting.system.seasonBanner' },
      { key: 'season_thumb', label: 'setting.system.seasonThumb' },
    ],
  },
  {
    section: 'episode',
    items: [
      { key: 'episode_nfo', label: 'setting.system.episodeNfo' },
      { key: 'episode_thumb', label: 'setting.system.episodeThumb' },
    ],
  },
]

// 刮削策略设置
const ScrapingPolicies = ref<Record<string, 'skip' | 'missingOnly' | 'overwrite'>>(
  Object.fromEntries(scrapingConfig.flatMap(section => section.items.map(item => [item.key, 'missingOnly']))),
)

const scrapingPolicyOptions = computed(() => [
  {
    value: 'skip' as const,
    icon: 'mdi-file-remove-outline',
    label: t('setting.system.policy.skipDesc'),
  },
  {
    value: 'missingOnly' as const,
    icon: 'mdi-file-plus-outline',
    label: t('setting.system.policy.missingOnlyDesc'),
  },
  {
    value: 'overwrite' as const,
    icon: 'mdi-file-replace-outline',
    label: t('setting.system.policy.overwriteDesc'),
  },
])

// 是否发送请求的总开关
const isRequest = ref(true)

// 选中的媒体服务器
const mediaServers = ref<MediaServerConf[]>([])

// 为媒体服务器和下载器提供不随改名漂移的稳定渲染键，弹窗保存替换对象时继承键以防组件卸载重挂载
const mediaServerKeys = new WeakMap<MediaServerConf, string>()
let mediaServerKeySeed = 0
function getMediaServerKey(server: MediaServerConf): string {
  const existing = mediaServerKeys.get(server)
  if (existing) return existing
  mediaServerKeySeed += 1
  const nextKey = `ms-${mediaServerKeySeed}`
  mediaServerKeys.set(server, nextKey)
  return nextKey
}

// 旧版全局媒体服务器同步间隔，仅用于未单独设置时的默认值提示
const legacyMediaServerSyncInterval = ref<number | null>(null)

// 下载器
const downloaders = ref<DownloaderConf[]>([])

const downloaderKeys = new WeakMap<DownloaderConf, string>()
let downloaderKeySeed = 0
function getDownloaderKey(downloader: DownloaderConf): string {
  const existing = downloaderKeys.get(downloader)
  if (existing) return existing
  downloaderKeySeed += 1
  const nextKey = `dl-${downloaderKeySeed}`
  downloaderKeys.set(downloader, nextKey)
  return nextKey
}

// 提示框
const $toast = useToast()

// 表单引用
const basicFormRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)
const advancedFormRef = ref<{
  validate: () => Promise<{ valid: boolean; errors?: Array<{ id: string | number; errorMessages: string[] }> }>
} | null>(null)

// 高级设置对话框
const advancedDialog = ref(false)

const savingBasic = ref(false)
const savingAdvanced = ref(false)
const savingDownloaders = ref(false)
const savingMediaServers = ref(false)
const rustAccelAvailable = ref(false)

const rustAccelHint = computed(() =>
  rustAccelAvailable.value ? t('setting.system.rustAccelHint') : t('setting.system.rustAccelUnavailableHint'),
)

const activeTab = ref('system')

// 高级设置左侧双栏导航定义
const advancedNavItems = computed(() => [
  {
    value: 'system',
    icon: 'mdi-tune-vertical',
    title: t('setting.system.system'),
    desc: '全局缓存、自动更新与匿名统计共享策略',
  },
  {
    value: 'media',
    icon: 'mdi-movie-open-outline',
    title: t('setting.system.media'),
    desc: 'TMDB 元数据接口、语言偏好与刮削策略',
  },
  {
    value: 'network',
    icon: 'mdi-lan',
    title: t('setting.system.network'),
    desc: '网络代理、镜像加速、DoH 与图片安全域名',
  },
  {
    value: 'data',
    icon: 'mdi-database-outline',
    title: t('setting.system.data'),
    desc: '历史消息、下载记录与整理记录自动清理',
  },
  {
    value: 'log',
    icon: 'mdi-file-document-outline',
    title: t('setting.system.log'),
    desc: '调试开关、日志输出级别与文件轮转格式',
  },
  {
    value: 'dev',
    icon: 'mdi-flask-outline',
    title: t('setting.system.lab'),
    desc: '本地插件仓库、多线程转移与实验性性能加速',
  },
])

const currentAdvancedNav = computed(
  () => advancedNavItems.value.find(item => item.value === activeTab.value) ?? advancedNavItems.value[0],
)

const cancelLabel = computed(() => {
  const label = t('common.cancel')
  return label === 'common.cancel' ? '取消' : label
})

// 元数据语言
const tmdbLanguageItems = [
  { title: t('setting.system.tmdbLanguage.zhCN'), value: 'zh' },
  { title: t('setting.system.tmdbLanguage.zhTW'), value: 'zh-TW' },
  { title: t('setting.system.tmdbLanguage.en'), value: 'en' },
]

// Fanart语言选项
const fanartLanguageItems = [
  { title: t('setting.system.fanartLanguage.zh'), value: 'zh' },
  { title: t('setting.system.fanartLanguage.en'), value: 'en' },
  { title: t('setting.system.fanartLanguage.ja'), value: 'ja' },
  { title: t('setting.system.fanartLanguage.ko'), value: 'ko' },
  { title: t('setting.system.fanartLanguage.de'), value: 'de' },
  { title: t('setting.system.fanartLanguage.fr'), value: 'fr' },
  { title: t('setting.system.fanartLanguage.es'), value: 'es' },
  { title: t('setting.system.fanartLanguage.it'), value: 'it' },
  { title: t('setting.system.fanartLanguage.pt'), value: 'pt' },
  { title: t('setting.system.fanartLanguage.ru'), value: 'ru' },
]

// 日志等级
const logLevelItems = [
  { title: t('setting.system.logLevelItems.debug'), value: 'DEBUG' },
  { title: t('setting.system.logLevelItems.info'), value: 'INFO' },
  { title: t('setting.system.logLevelItems.warning'), value: 'WARNING' },
  { title: t('setting.system.logLevelItems.error'), value: 'ERROR' },
  { title: t('setting.system.logLevelItems.critical'), value: 'CRITICAL' },
]

const dataCleanupFieldRules = [
  (v: any) => v === 0 || !!v || t('setting.system.dataCleanupDaysRequired'),
  (v: any) => v >= 0 || t('setting.system.dataCleanupDaysMin'),
]

// 安全域名添加变量
const newSecurityDomain = ref('')
// 图片代理允许非公网网段添加变量
const newImageProxyAllowedPrivateRange = ref('')

// 添加安全域名
function addSecurityDomain() {
  if (
    newSecurityDomain.value &&
    !SystemSettings.value.Advanced.SECURITY_IMAGE_DOMAINS.includes(newSecurityDomain.value)
  ) {
    SystemSettings.value.Advanced.SECURITY_IMAGE_DOMAINS.push(newSecurityDomain.value)
    newSecurityDomain.value = ''
  }
}

// 添加图片代理允许访问的非公网网段
function addImageProxyAllowedPrivateRange() {
  if (
    newImageProxyAllowedPrivateRange.value &&
    !SystemSettings.value.Advanced.IMAGE_PROXY_ALLOWED_PRIVATE_RANGES.includes(newImageProxyAllowedPrivateRange.value)
  ) {
    SystemSettings.value.Advanced.IMAGE_PROXY_ALLOWED_PRIVATE_RANGES.push(newImageProxyAllowedPrivateRange.value)
    newImageProxyAllowedPrivateRange.value = ''
  }
}

// 调用API查询下载器设置
async function loadDownloaderSetting() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/Downloaders')
    downloaders.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 调用API保存下载器设置
async function saveDownloaderSetting() {
  if (savingDownloaders.value) return
  savingDownloaders.value = true
  try {
    // 提取启用的下载器
    const enabledDownloaders = downloaders.value.filter(item => item.enabled)
    // 有启动的下载器时
    if (enabledDownloaders.length > 0) {
      downloaders.value = handleDefaultDownloaders(enabledDownloaders, downloaders.value)
    }
    const result: { [key: string]: any } = await api.post('system/setting/Downloaders', downloaders.value)
    if (result.success) $toast.success(t('setting.system.downloaderSaveSuccess'))
    else $toast.error(result.message || t('setting.system.downloaderSaveFailed'))

    await loadDownloaderSetting()
  } catch (error) {
    console.log(error)
    $toast.error(getApiErrorMessage(error) || t('setting.system.downloaderSaveFailed'))
  } finally {
    savingDownloaders.value = false
  }
}

// 处理默认下载器状态
function handleDefaultDownloaders(enabledDownloaders: any[], list: any[]) {
  const enabledDefaultDownloader = enabledDownloaders.find(item => item.default)
  if (enabledDownloaders.length > 0 && !enabledDefaultDownloader) {
    list = list.map(item => {
      const prevKey = getDownloaderKey(item)
      if (item === enabledDownloaders[0]) {
        $toast.info(t('setting.system.defaultDownloaderNotice', { name: item.name }))
        const nextItem = { ...item, default: true }
        downloaderKeys.set(nextItem, prevKey)
        return nextItem
      }
      // 清除其他下载器的默认下载器状态
      const nextItem = { ...item, default: false }
      downloaderKeys.set(nextItem, prevKey)
      return nextItem
    })
  }
  return list
}

// 调用API查询媒体服务器设置
async function loadMediaServerSetting() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/MediaServers')
    mediaServers.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 调用API保存媒体服务器设置
async function saveMediaServerSetting() {
  if (savingMediaServers.value) return
  savingMediaServers.value = true
  try {
    const result: { [key: string]: any } = await api.post('system/setting/MediaServers', mediaServers.value)
    if (result.success) $toast.success(t('setting.system.mediaServerSaveSuccess'))
    else $toast.error(result.message || t('setting.system.mediaServerSaveFailed'))

    await loadMediaServerSetting()
  } catch (error) {
    console.log(error)
    $toast.error(getApiErrorMessage(error) || t('setting.system.mediaServerSaveFailed'))
  } finally {
    savingMediaServers.value = false
  }
}

// 加载系统设置
async function loadSystemSettings() {
  try {
    const result: { [key: string]: any } = await api.get('system/env')
    if (result.success) {
      const defaultSyncInterval = Number(result.data.MEDIASERVER_SYNC_INTERVAL ?? Number.NaN)
      legacyMediaServerSyncInterval.value = Number.isFinite(defaultSyncInterval) ? defaultSyncInterval : null
      // 将API返回的值赋值给SystemSettings
      for (const sectionKey of Object.keys(SystemSettings.value) as Array<keyof typeof SystemSettings.value>) {
        Object.keys(SystemSettings.value[sectionKey]).forEach((key: string) => {
          if (result.data.hasOwnProperty(key)) (SystemSettings.value[sectionKey] as any)[key] = result.data[key]
        })
      }
      const accelAvailable = Boolean(result.data.RUST_ACCEL_AVAILABLE ?? result.data.RUST_ACCEL_ENABLED)
      rustAccelAvailable.value = accelAvailable
      if (!accelAvailable) SystemSettings.value.Advanced.RUST_ACCEL = false
    }
  } catch (error) {
    console.log(error)
  }
}

// 调用API保存设置
async function saveSystemSetting(value: { [key: string]: any }) {
  try {
    const result: { [key: string]: any } = await api.post('system/env', value)
    if (result.success) {
      return true
    } else {
      $toast.error(t('setting.system.saveFailed', { message: result?.message }))
      return false
    }
  } catch (error) {
    console.log(error)
    $toast.error(t('setting.system.saveFailed', { message: getApiErrorMessage(error) || '' }))
  }
  return false
}

// 保存基础设置
async function saveBasicSettings() {
  if (savingBasic.value) return
  if (basicFormRef.value?.validate) {
    const { valid } = await basicFormRef.value.validate()
    if (!valid) return
  }
  savingBasic.value = true
  try {
    if (await saveSystemSetting(SystemSettings.value.Basic)) {
      $toast.success(t('setting.system.basicSaveSuccess'))
    }
  } finally {
    savingBasic.value = false
  }
}

// 保存高级设置
async function saveAdvancedSettings() {
  if (savingAdvanced.value) return
  if (advancedFormRef.value?.validate) {
    const { valid, errors } = await advancedFormRef.value.validate()
    if (!valid) {
      const firstError = errors?.[0]
      const firstMessage = firstError?.errorMessages?.[0]
      if (firstError?.id && typeof document !== 'undefined') {
        const paneEl = document.getElementById(String(firstError.id))?.closest('[data-advanced-tab]')
        const errorTab = paneEl?.getAttribute('data-advanced-tab')
        if (errorTab && errorTab !== activeTab.value) {
          activeTab.value = errorTab
        }
      }
      $toast.error(firstMessage || t('validators.required'))
      return
    }
  }
  savingAdvanced.value = true
  try {
    if (!rustAccelAvailable.value) SystemSettings.value.Advanced.RUST_ACCEL = false
    cleanEmptyFields(SystemSettings.value.Advanced, ['LOG_FILE_FORMAT'])

    // 同时保存高级设置和刮削开关设置
    const advancedResult = await saveSystemSetting(SystemSettings.value.Advanced)
    const scrapingResult = await saveScrapingSwitchs()

    if (advancedResult && scrapingResult) {
      advancedDialog.value = false
      $toast.success(t('setting.system.advancedSaveSuccess'))
    }
  } catch (error) {
    console.log(error)
    $toast.error(t('setting.system.saveFailed', { message: getApiErrorMessage(error) || '' }))
  } finally {
    savingAdvanced.value = false
  }
}

// 当字段为空时，将其设置为 null 提交，以便后端恢复为默认值
function cleanEmptyFields(settings: any, fields: string[]) {
  fields.forEach(field => {
    if (settings[field]?.trim?.() === '') {
      settings[field] = null
    }
  })
}

// 快捷复制到剪贴板
async function copyValue(value: string) {
  try {
    let success
    success = copyToClipboard(value)
    if (await success) $toast.success(t('setting.system.copySuccess'))
    else $toast.error(t('setting.system.copyFailed'))
  } catch (error) {
    $toast.error(t('setting.system.copyError'))
    console.log(error)
  }
}

// 预设部分Github加速站
const githubMirrorsItems: string[] = []

// 预设部分PIP镜像站
const pipMirrorsItems = [
  'https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple',
  'https://pypi.mirrors.ustc.edu.cn/simple',
  'https://mirrors.pku.edu.cn/pypi/web/simple',
  'https://mirrors.aliyun.com/pypi/simple',
  'https://mirrors.cloud.tencent.com/pypi/simple',
  'https://mirrors.163.com/pypi/simple',
  'https://pypi.doubanio.com/simple',
  'https://mirrors.hust.edu.cn/pypi/web/simple',
  'https://mirrors.bfsu.edu.cn/pypi/web/simple',
]

// Github加速代理显示处理
const githubProxyDisplay = computed({
  get: () => {
    return SystemSettings.value.Advanced.GITHUB_PROXY || null
  },
  set: val => {
    SystemSettings.value.Advanced.GITHUB_PROXY = val === null ? '' : val
  },
})

// PIP加速代理显示处理
const pipProxyDisplay = computed({
  get: () => {
    return SystemSettings.value.Advanced.PIP_PROXY || null
  },
  set: val => {
    SystemSettings.value.Advanced.PIP_PROXY = val === null ? '' : val
  },
})

// 创建随机字符串
function createRandomString() {
  const charset = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_'
  const array = new Uint8Array(32)
  window.crypto.getRandomValues(array)
  SystemSettings.value.Basic.API_TOKEN = Array.from(array, byte => charset[byte % charset.length]).join('')
}

// 添加下载器
function addDownloader(downloader: string) {
  let name = `下载器${downloaders.value.length + 1}`
  while (downloaders.value.some(item => item.name === name)) {
    name = `下载器${parseInt(name.split('下载器')[1]) + 1}`
  }
  downloaders.value.push({
    name: name,
    type: downloader,
    default: false,
    enabled: false,
    config: {},
  })
}

// 删除下载器
function removeDownloader(ele: DownloaderConf) {
  const index = downloaders.value.indexOf(ele)
  downloaders.value.splice(index, 1)
}

// 下载器变化（继承原对象的 WeakMap 键，防止改名后组件卸载重挂载）
function onDownloaderChange(downloader: DownloaderConf, name: string) {
  const index = downloaders.value.findIndex(item => item.name === name)
  if (index !== -1) {
    const prevKey = getDownloaderKey(downloaders.value[index])
    downloaderKeys.set(downloader, prevKey)
    downloaders.value[index] = downloader
  }
}

// 添加媒体服务器
function addMediaServer(mediaserver: string) {
  let name = `服务器${mediaServers.value.length + 1}`
  while (mediaServers.value.some(item => item.name === name)) {
    name = `服务器${parseInt(name.split('服务器')[1]) + 1}`
  }
  mediaServers.value.push({
    name: name,
    type: mediaserver,
    enabled: false,
    config: {},
  })
}

// 删除媒体服务器
function removeMediaServer(ele: MediaServerConf) {
  const index = mediaServers.value.indexOf(ele)
  if (index !== -1) mediaServers.value.splice(index, 1)
}

// 变更媒体服务器（继承原对象的 WeakMap 键，防止改名后组件卸载重挂载）
function onMediaServerChange(mediaserver: MediaServerConf, name: string) {
  const index = mediaServers.value.findIndex(item => item.name === name)
  if (index !== -1) {
    const prevKey = getMediaServerKey(mediaServers.value[index])
    mediaServerKeys.set(mediaserver, prevKey)
    mediaServers.value[index] = mediaserver
  }
}

// 添加计算属性
const moviePilotAutoUpdate = computed({
  get: () => {
    return ['release', 'dev'].includes(SystemSettings.value.Advanced.MOVIEPILOT_AUTO_UPDATE)
  },
  set: val => {
    SystemSettings.value.Advanced.MOVIEPILOT_AUTO_UPDATE = val ? 'release' : 'false'
  },
})

// Fanart语言多选处理
const fanartLanguageSelection = computed({
  get: () => {
    if (!SystemSettings.value.Advanced.FANART_LANG) return []
    return SystemSettings.value.Advanced.FANART_LANG.split(',')
      .filter(Boolean)
      .map((lang: any) => lang.trim())
  },
  set: (val: string[]) => {
    SystemSettings.value.Advanced.FANART_LANG = val.join(',')
  },
})

// 加载刮削开关设置
async function loadScrapingSwitchs() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/ScrapingSwitchs')
    if (result.success && result.data?.value) {
      const loadedSwitches = result.data.value
      for (const key in loadedSwitches) {
        if (typeof loadedSwitches[key] === 'boolean') {
          // 兼容旧数据
          loadedSwitches[key] = loadedSwitches[key] ? 'missingOnly' : 'skip'
        }
      }
      ScrapingPolicies.value = { ...ScrapingPolicies.value, ...loadedSwitches }
    }
  } catch (error) {
    console.log(error)
  }
}

// 保存刮削开关设置
async function saveScrapingSwitchs() {
  try {
    const result: { [key: string]: any } = await api.post('system/setting/ScrapingSwitchs', ScrapingPolicies.value)
    if (result.success) {
      return true
    } else {
      $toast.error(t('setting.system.scrapingSwitchSaveFailed', { message: result?.message }))
      return false
    }
  } catch (error) {
    console.log(error)
    $toast.error(t('setting.system.scrapingSwitchSaveError'))
    return false
  }
}

// 加载数据
async function loadPageData() {
  await Promise.all([loadDownloaderSetting(), loadMediaServerSetting(), loadSystemSettings(), loadScrapingSwitchs()])
}

onMounted(loadPageData)

onActivated(async () => {
  isRequest.value = true
})

onDeactivated(() => {
  isRequest.value = false
})

useSilentSettingRefresh(
  async () => {
    if (advancedDialog.value || savingBasic.value || savingDownloaders.value || savingMediaServers.value) return
    await loadPageData()
  },
  {
    active: computed(() => props.active),
  },
)

function openAdvancedTab(tabValue = 'system') {
  activeTab.value = tabValue
  advancedDialog.value = true
}

defineExpose({
  openAdvancedTab,
})
</script>

<template>
  <div class="mp-setting-stack">
    <VCard id="sec-system-basic" class="mp-setting-card">
      <VCardItem>
        <template #prepend>
          <div class="mp-setting-card__icon">
            <VIcon icon="mdi-shield-key-outline" size="18" />
          </div>
        </template>
        <VCardTitle>{{ t('setting.system.basicSettings') }}</VCardTitle>
        <VCardSubtitle>{{ t('setting.system.basicSettingsDesc') }}</VCardSubtitle>
        <template #append>
          <VBtn
            size="small"
            color="primary"
            variant="tonal"
            rounded="lg"
            prepend-icon="mdi-tune-variant"
            class="text-no-wrap"
            @click="openAdvancedTab('system')"
          >
            {{ t('setting.system.advancedSettings') }}
          </VBtn>
        </template>
      </VCardItem>
      <VCardText>
        <VForm ref="basicFormRef" @submit.prevent="() => {}">
          <VRow>
            <VCol cols="12" md="6">
              <VTextField
                v-model="SystemSettings.Basic.APP_DOMAIN"
                :label="t('setting.system.appDomain')"
                :hint="t('setting.system.appDomainHint')"
                placeholder="http://localhost:3000"
                persistent-hint
                prepend-inner-icon="mdi-web"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="SystemSettings.Basic.API_TOKEN"
                :label="t('setting.system.apiToken')"
                :hint="t('setting.system.apiTokenHint')"
                :placeholder="t('setting.system.apiTokenMinChars')"
                persistent-hint
                prepend-inner-icon="mdi-key"
                :append-inner-icon="SystemSettings.Basic.API_TOKEN ? 'mdi-content-copy' : 'mdi-reload'"
                @click:append-inner="
                  SystemSettings.Basic.API_TOKEN ? copyValue(SystemSettings.Basic.API_TOKEN) : createRandomString()
                "
                :rules="[
                  (v: string | null) => !!v || t('setting.system.apiTokenRequired'),
                  (v: string | null) => (v?.length ?? 0) >= 16 || t('setting.system.apiTokenLength'),
                ]"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="SystemSettings.Basic.GITHUB_TOKEN"
                :label="t('setting.system.githubToken')"
                :placeholder="t('setting.system.githubTokenFormat')"
                :hint="t('setting.system.githubTokenHint')"
                persistent-hint
                prepend-inner-icon="mdi-github"
              />
            </VCol>
          </VRow>

          <div class="mp-card-footer">
            <span class="mp-card-footer__hint">保存外部访问域名、API 鉴权令牌与 GitHub 接口凭据</span>
            <VBtn
              type="submit"
              size="small"
              color="primary"
              variant="flat"
              rounded="lg"
              prepend-icon="mdi-content-save-outline"
              :loading="savingBasic"
              :disabled="savingBasic"
              class="px-4 text-no-wrap"
              @click="saveBasicSettings"
            >
              {{ t('common.save') }}
            </VBtn>
          </div>
        </VForm>
      </VCardText>
    </VCard>

    <!-- 高级参数与网络/TMDB 快捷矩阵：将原先隐藏在二级弹窗内的 6 大模块外显直达 -->
    <VCard id="sec-system-advanced" class="mp-setting-card">
      <VCardItem>
        <template #prepend>
          <div class="mp-setting-card__icon mp-setting-card__icon--info">
            <VIcon icon="mdi-tune-vertical" size="18" />
          </div>
        </template>
        <VCardTitle>
          <span>高级参数与网络环境</span>
          <span class="mp-count-pill">6 模块</span>
        </VCardTitle>
        <VCardSubtitle
          >点击任一模块直接打开对应的高级系统配置面板（TMDB、代理加速、刮削策略、日志与性能）</VCardSubtitle
        >
      </VCardItem>
      <VCardText>
        <div class="system-adv-grid">
          <div
            v-for="nav in advancedNavItems"
            :key="nav.value"
            role="link"
            tabindex="0"
            class="system-adv-tile"
            @click="openAdvancedTab(nav.value)"
            @keydown.enter.prevent="openAdvancedTab(nav.value)"
          >
            <span class="system-adv-tile__icon">
              <VIcon :icon="nav.icon" size="18" />
            </span>
            <span class="system-adv-tile__body">
              <span class="system-adv-tile__title">{{ nav.title }}</span>
              <span class="system-adv-tile__desc">{{ nav.desc }}</span>
            </span>
            <VIcon icon="mdi-chevron-right" size="17" class="system-adv-tile__arrow" />
          </div>
        </div>
      </VCardText>
    </VCard>

    <VCard id="sec-system-downloaders" class="mp-setting-card">
      <VCardItem>
        <template #prepend>
          <div class="mp-setting-card__icon mp-setting-card__icon--success">
            <VIcon icon="mdi-download-network-outline" size="18" />
          </div>
        </template>
        <VCardTitle>
          <span>{{ t('setting.system.downloaders') }}</span>
          <span v-if="downloaders.length" class="mp-count-pill">{{ downloaders.length }}</span>
        </VCardTitle>
        <VCardSubtitle>{{ t('setting.system.downloadersDesc') }}</VCardSubtitle>
        <template #append>
          <VBtn size="small" color="secondary" variant="outlined" rounded="lg" prepend-icon="mdi-plus">
            添加下载器
            <VMenu activator="parent" close-on-content-click>
              <VList>
                <VListItem v-for="item in downloaderOptions" :key="item.value" @click="addDownloader(item.value)">
                  <VListItemTitle>{{ item.title }}</VListItemTitle>
                </VListItem>
                <VListItem @click="addDownloader('custom')">
                  <VListItemTitle>{{ t('setting.system.custom') }}</VListItemTitle>
                </VListItem>
              </VList>
            </VMenu>
          </VBtn>
        </template>
      </VCardItem>
      <VCardText>
        <Draggable
          v-if="downloaders.length"
          v-model="downloaders"
          handle=".cursor-move"
          :item-key="getDownloaderKey"
          tag="div"
          :component-data="{ 'class': 'grid gap-3 grid-app-card' }"
        >
          <template #item="{ element }">
            <DownloaderCard
              :downloader="element"
              :downloaders="downloaders"
              @close="removeDownloader(element)"
              @change="onDownloaderChange"
              :allow-refresh="isRequest"
            />
          </template>
        </Draggable>
        <div v-else class="mp-empty-hint">
          <VIcon icon="mdi-download-outline" size="16" class="mp-empty-hint__icon" />
          <span>暂未添加下载器，可点击右上角「添加下载器」新增配置</span>
        </div>

        <VForm class="mp-card-footer" @submit.prevent="() => {}">
          <span class="mp-card-footer__hint">保存下载客户端连接参数与卡片排序</span>
          <VBtn
            type="submit"
            size="small"
            color="primary"
            variant="flat"
            rounded="lg"
            prepend-icon="mdi-content-save-outline"
            :loading="savingDownloaders"
            :disabled="savingDownloaders"
            class="px-4"
            @click="saveDownloaderSetting"
          >
            {{ t('common.save') }}
          </VBtn>
        </VForm>
      </VCardText>
    </VCard>

    <VCard id="sec-system-mediaservers" class="mp-setting-card">
      <VCardItem>
        <template #prepend>
          <div class="mp-setting-card__icon mp-setting-card__icon--warning">
            <VIcon icon="mdi-television-play" size="18" />
          </div>
        </template>
        <VCardTitle>
          <span>{{ t('setting.system.mediaServers') }}</span>
          <span v-if="mediaServers.length" class="mp-count-pill">{{ mediaServers.length }}</span>
        </VCardTitle>
        <VCardSubtitle>{{ t('setting.system.mediaServersDesc') }}</VCardSubtitle>
        <template #append>
          <VBtn size="small" color="secondary" variant="outlined" rounded="lg" prepend-icon="mdi-plus">
            添加媒体服务器
            <VMenu activator="parent" close-on-content-click>
              <VList>
                <VListItem v-for="item in mediaServerOptions" :key="item.value" @click="addMediaServer(item.value)">
                  <VListItemTitle>{{ item.title }}</VListItemTitle>
                </VListItem>
                <VListItem @click="addMediaServer('custom')">
                  <VListItemTitle>{{ t('setting.system.custom') }}</VListItemTitle>
                </VListItem>
              </VList>
            </VMenu>
          </VBtn>
        </template>
      </VCardItem>
      <VCardText>
        <Draggable
          v-if="mediaServers.length"
          v-model="mediaServers"
          handle=".cursor-move"
          :item-key="getMediaServerKey"
          tag="div"
          :component-data="{ 'class': 'grid gap-3 grid-app-card' }"
        >
          <template #item="{ element }">
            <MediaServerCard
              :mediaserver="element"
              :mediaservers="mediaServers"
              :default-sync-interval="legacyMediaServerSyncInterval ?? undefined"
              @close="removeMediaServer(element)"
              @change="onMediaServerChange"
            />
          </template>
        </Draggable>
        <div v-else class="mp-empty-hint">
          <VIcon icon="mdi-server-outline" size="16" class="mp-empty-hint__icon" />
          <span>暂未添加媒体服务器，可点击右上角「添加媒体服务器」新增配置</span>
        </div>

        <VForm class="mp-card-footer" @submit.prevent="() => {}">
          <span class="mp-card-footer__hint">保存媒体库服务器连接与同步间隔配置</span>
          <VBtn
            type="submit"
            size="small"
            color="primary"
            variant="flat"
            rounded="lg"
            prepend-icon="mdi-content-save-outline"
            :loading="savingMediaServers"
            :disabled="savingMediaServers"
            class="px-4"
            @click="saveMediaServerSetting"
          >
            {{ t('common.save') }}
          </VBtn>
        </VForm>
      </VCardText>
    </VCard>
  </div>

  <!-- 高级系统设置（Antigravity IDE 双栏设置面板范式） -->
  <VDialog
    v-if="advancedDialog"
    v-model="advancedDialog"
    scrollable
    max-width="58rem"
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard class="advanced-dialog" :class="{ 'advanced-dialog--desktop': display.mdAndUp.value }">
      <!-- 移动端顶部栏与紧凑分段导航 -->
      <div v-if="!display.mdAndUp.value" class="advanced-dialog__mobile-top">
        <div class="advanced-dialog__mobile-titlebar">
          <span class="advanced-dialog__mobile-title">{{ t('setting.system.advancedSettings') }}</span>
          <VDialogCloseBtn @click="advancedDialog = false" />
        </div>
        <div class="advanced-settings-mobile-nav" role="tablist" aria-label="高级设置分类">
          <button
            v-for="nav in advancedNavItems"
            :key="nav.value"
            type="button"
            role="tab"
            :aria-selected="activeTab === nav.value"
            class="advanced-nav-btn advanced-nav-btn--mobile"
            :class="{ 'is-active': activeTab === nav.value }"
            @click="activeTab = nav.value"
          >
            <VIcon :icon="nav.icon" size="16" />
            <span>{{ nav.title }}</span>
          </button>
        </div>
      </div>

      <div class="advanced-dialog__body">
        <!-- 桌面端左栏垂直导航 -->
        <aside
          v-if="display.mdAndUp.value"
          class="advanced-settings-nav"
          role="tablist"
          aria-orientation="vertical"
          :aria-label="t('setting.system.advancedSettings')"
        >
          <div class="advanced-settings-nav__heading">{{ t('setting.system.advancedSettings') }}</div>
          <button
            v-for="nav in advancedNavItems"
            :key="nav.value"
            type="button"
            role="tab"
            :aria-selected="activeTab === nav.value"
            class="advanced-nav-btn"
            :class="{ 'is-active': activeTab === nav.value }"
            @click="activeTab = nav.value"
          >
            <VIcon :icon="nav.icon" size="17" class="advanced-nav-btn__icon" />
            <span class="advanced-nav-btn__label">{{ nav.title }}</span>
          </button>
        </aside>

        <!-- 右栏主内容滚动区 -->
        <div class="advanced-dialog__main">
          <header class="advanced-dialog__header">
            <div class="advanced-dialog__header-copy">
              <h3 class="advanced-dialog__section-title">{{ currentAdvancedNav.title }}</h3>
              <p class="advanced-dialog__section-desc">{{ currentAdvancedNav.desc }}</p>
            </div>
            <VDialogCloseBtn v-if="display.mdAndUp.value" @click="advancedDialog = false" />
          </header>

          <div class="advanced-dialog__scroll">
            <VForm ref="advancedFormRef" @submit.prevent="() => {}">
              <!-- 1. 系统 -->
              <div v-show="activeTab === 'system'" data-advanced-tab="system" class="advanced-pane">
                <div class="setting-group-label">运行与更新</div>
                <div class="setting-group-card">
                  <div class="setting-row" :title="t('setting.system.globalImageCacheHint')">
                    <VSwitch
                      v-model="SystemSettings.Advanced.GLOBAL_IMAGE_CACHE"
                      :aria-label="t('setting.system.globalImageCache')"
                      color="primary"
                      density="compact"
                      hide-details
                      inset
                    />
                    <div class="setting-row__copy">
                      <div class="setting-row__title">{{ t('setting.system.globalImageCache') }}</div>
                      <div class="setting-row__desc">{{ t('setting.system.globalImageCacheHint') }}</div>
                    </div>
                  </div>
                  <div class="setting-row" :title="t('setting.system.bigMemoryModeHint')">
                    <VSwitch
                      v-model="SystemSettings.Advanced.BIG_MEMORY_MODE"
                      :aria-label="t('setting.system.bigMemoryMode')"
                      color="primary"
                      density="compact"
                      hide-details
                      inset
                    />
                    <div class="setting-row__copy">
                      <div class="setting-row__title">{{ t('setting.system.bigMemoryMode') }}</div>
                      <div class="setting-row__desc">{{ t('setting.system.bigMemoryModeHint') }}</div>
                    </div>
                  </div>
                  <div
                    v-if="SystemSettings.Basic.DB_TYPE === 'sqlite'"
                    class="setting-row"
                    :title="t('setting.system.dbWalEnableHint')"
                  >
                    <VSwitch
                      v-model="SystemSettings.Advanced.DB_WAL_ENABLE"
                      :aria-label="t('setting.system.dbWalEnable')"
                      color="primary"
                      density="compact"
                      hide-details
                      inset
                    />
                    <div class="setting-row__copy">
                      <div class="setting-row__title">{{ t('setting.system.dbWalEnable') }}</div>
                      <div class="setting-row__desc">{{ t('setting.system.dbWalEnableHint') }}</div>
                    </div>
                  </div>
                  <div class="setting-row" :title="t('setting.system.moviePilotAutoUpdateHint')">
                    <VSwitch
                      v-model="moviePilotAutoUpdate"
                      :aria-label="t('setting.system.moviePilotAutoUpdate')"
                      color="primary"
                      density="compact"
                      hide-details
                      inset
                    />
                    <div class="setting-row__copy">
                      <div class="setting-row__title">{{ t('setting.system.moviePilotAutoUpdate') }}</div>
                      <div class="setting-row__desc">{{ t('setting.system.moviePilotAutoUpdateHint') }}</div>
                    </div>
                  </div>
                  <div class="setting-row" :title="t('setting.system.autoUpdateResourceHint')">
                    <VSwitch
                      v-model="SystemSettings.Advanced.AUTO_UPDATE_RESOURCE"
                      :aria-label="t('setting.system.autoUpdateResource')"
                      color="primary"
                      density="compact"
                      hide-details
                      inset
                    />
                    <div class="setting-row__copy">
                      <div class="setting-row__title">{{ t('setting.system.autoUpdateResource') }}</div>
                      <div class="setting-row__desc">{{ t('setting.system.autoUpdateResourceHint') }}</div>
                    </div>
                  </div>
                </div>

                <div class="setting-group-label">匿名统计共享</div>
                <div class="setting-group-card">
                  <div class="setting-row" :title="t('setting.system.subscribeStatisticShareHint')">
                    <VSwitch
                      v-model="SystemSettings.Advanced.SUBSCRIBE_STATISTIC_SHARE"
                      :aria-label="t('setting.system.subscribeStatisticShare')"
                      color="primary"
                      density="compact"
                      hide-details
                      inset
                    />
                    <div class="setting-row__copy">
                      <div class="setting-row__title">{{ t('setting.system.subscribeStatisticShare') }}</div>
                      <div class="setting-row__desc">{{ t('setting.system.subscribeStatisticShareHint') }}</div>
                    </div>
                  </div>
                  <div class="setting-row" :title="t('setting.system.pluginStatisticShareHint')">
                    <VSwitch
                      v-model="SystemSettings.Advanced.PLUGIN_STATISTIC_SHARE"
                      :aria-label="t('setting.system.pluginStatisticShare')"
                      color="primary"
                      density="compact"
                      hide-details
                      inset
                    />
                    <div class="setting-row__copy">
                      <div class="setting-row__title">{{ t('setting.system.pluginStatisticShare') }}</div>
                      <div class="setting-row__desc">{{ t('setting.system.pluginStatisticShareHint') }}</div>
                    </div>
                  </div>
                  <div class="setting-row" :title="t('setting.system.usageStatisticShareHint')">
                    <VSwitch
                      v-model="SystemSettings.Advanced.USAGE_STATISTIC_SHARE"
                      :aria-label="t('setting.system.usageStatisticShare')"
                      color="primary"
                      density="compact"
                      hide-details
                      inset
                    />
                    <div class="setting-row__copy">
                      <div class="setting-row__title">{{ t('setting.system.usageStatisticShare') }}</div>
                      <div class="setting-row__desc">{{ t('setting.system.usageStatisticShareHint') }}</div>
                    </div>
                  </div>
                  <div class="setting-row" :title="t('setting.system.workflowStatisticShareHint')">
                    <VSwitch
                      v-model="SystemSettings.Advanced.WORKFLOW_STATISTIC_SHARE"
                      :aria-label="t('setting.system.workflowStatisticShare')"
                      color="primary"
                      density="compact"
                      hide-details
                      inset
                    />
                    <div class="setting-row__copy">
                      <div class="setting-row__title">{{ t('setting.system.workflowStatisticShare') }}</div>
                      <div class="setting-row__desc">{{ t('setting.system.workflowStatisticShareHint') }}</div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 2. 媒体 -->
              <div v-show="activeTab === 'media'" data-advanced-tab="media" class="advanced-pane">
                <div class="setting-group-label">TMDB 元数据服务</div>
                <div class="setting-fields-card">
                  <VRow>
                    <VCol cols="12" md="6">
                      <VCombobox
                        v-model="SystemSettings.Advanced.TMDB_API_DOMAIN"
                        :label="t('setting.system.tmdbApiDomain')"
                        :hint="t('setting.system.tmdbApiDomainHint')"
                        persistent-hint
                        :placeholder="t('setting.system.tmdbApiDomainPlaceholder')"
                        :items="['api.themoviedb.org', 'api.tmdb.org']"
                        :rules="[
                          (v: string | null) => v === null || !!v?.trim() || t('setting.system.tmdbApiDomainRequired'),
                        ]"
                        prepend-inner-icon="mdi-api"
                      />
                    </VCol>
                    <VCol cols="12" md="6">
                      <VTextField
                        v-model="SystemSettings.Advanced.TMDB_API_KEY"
                        :label="t('setting.system.tmdbApiKey')"
                        :hint="t('setting.system.tmdbApiKeyHint')"
                        persistent-hint
                        :placeholder="t('setting.system.tmdbApiKeyPlaceholder')"
                        :rules="[
                          (v: string | null) => v === null || !!v?.trim() || t('setting.system.tmdbApiKeyRequired'),
                        ]"
                        prepend-inner-icon="mdi-key-variant"
                      />
                    </VCol>
                    <VCol cols="12" md="6">
                      <VCombobox
                        v-model="SystemSettings.Advanced.TMDB_IMAGE_DOMAIN"
                        :label="t('setting.system.tmdbImageDomain')"
                        :hint="t('setting.system.tmdbImageDomainHint')"
                        persistent-hint
                        :placeholder="t('setting.system.tmdbImageDomainPlaceholder')"
                        :items="['image.tmdb.org']"
                        :rules="[
                          (v: string | null) =>
                            v === null || !!v?.trim() || t('setting.system.tmdbImageDomainRequired'),
                        ]"
                        prepend-inner-icon="mdi-image"
                      />
                    </VCol>
                    <VCol cols="12" md="6">
                      <VSelect
                        v-model="SystemSettings.Advanced.TMDB_LOCALE"
                        :label="t('setting.system.tmdbLocale')"
                        :hint="t('setting.system.tmdbLocaleHint')"
                        persistent-hint
                        :placeholder="t('setting.system.tmdbLocalePlaceholder')"
                        :items="tmdbLanguageItems"
                        prepend-inner-icon="mdi-translate"
                      />
                    </VCol>
                    <VCol cols="12" md="6">
                      <VTextField
                        v-model="SystemSettings.Advanced.META_CACHE_EXPIRE"
                        :label="t('setting.system.metaCacheExpire')"
                        :hint="t('setting.system.metaCacheExpireHint')"
                        persistent-hint
                        min="0"
                        type="number"
                        :suffix="t('setting.system.hour')"
                        :rules="[
                          (v: any) => v === 0 || !!v || t('setting.system.metaCacheExpireRequired'),
                          (v: any) => v >= 0 || t('setting.system.metaCacheExpireMin'),
                        ]"
                        prepend-inner-icon="mdi-timer"
                      />
                    </VCol>
                  </VRow>
                </div>

                <div class="setting-group-label">识别与刮削选项</div>
                <div class="setting-group-card">
                  <div class="setting-row" :title="t('setting.system.scrapFollowTmdbHint')">
                    <VSwitch
                      v-model="SystemSettings.Advanced.SCRAP_FOLLOW_TMDB"
                      :aria-label="t('setting.system.scrapFollowTmdb')"
                      color="primary"
                      density="compact"
                      hide-details
                      inset
                    />
                    <div class="setting-row__copy">
                      <div class="setting-row__title">{{ t('setting.system.scrapFollowTmdb') }}</div>
                      <div class="setting-row__desc">{{ t('setting.system.scrapFollowTmdbHint') }}</div>
                    </div>
                  </div>
                  <div class="setting-row" :title="t('setting.system.scrapOriginalImageHint')">
                    <VSwitch
                      v-model="SystemSettings.Advanced.TMDB_SCRAP_ORIGINAL_IMAGE"
                      :aria-label="t('setting.system.scrapOriginalImage')"
                      color="primary"
                      density="compact"
                      hide-details
                      inset
                    />
                    <div class="setting-row__copy">
                      <div class="setting-row__title">{{ t('setting.system.scrapOriginalImage') }}</div>
                      <div class="setting-row__desc">{{ t('setting.system.scrapOriginalImageHint') }}</div>
                    </div>
                  </div>
                  <div class="setting-row" :title="t('setting.system.recognizePluginFirstHint')">
                    <VSwitch
                      v-model="SystemSettings.Advanced.RECOGNIZE_PLUGIN_FIRST"
                      :aria-label="t('setting.system.recognizePluginFirst')"
                      color="primary"
                      density="compact"
                      hide-details
                      inset
                    />
                    <div class="setting-row__copy">
                      <div class="setting-row__title">{{ t('setting.system.recognizePluginFirst') }}</div>
                      <div class="setting-row__desc">{{ t('setting.system.recognizePluginFirstHint') }}</div>
                    </div>
                  </div>
                  <div class="setting-row" :title="t('setting.system.mediaRecognizeShareHint')">
                    <VSwitch
                      v-model="SystemSettings.Advanced.MEDIA_RECOGNIZE_SHARE"
                      :aria-label="t('setting.system.mediaRecognizeShare')"
                      color="primary"
                      density="compact"
                      hide-details
                      inset
                    />
                    <div class="setting-row__copy">
                      <div class="setting-row__title">{{ t('setting.system.mediaRecognizeShare') }}</div>
                      <div class="setting-row__desc">{{ t('setting.system.mediaRecognizeShareHint') }}</div>
                    </div>
                  </div>
                  <div class="setting-row" :title="t('setting.system.fanartEnableHint')">
                    <VSwitch
                      v-model="SystemSettings.Advanced.FANART_ENABLE"
                      :aria-label="t('setting.system.fanartEnable')"
                      color="primary"
                      density="compact"
                      hide-details
                      inset
                    />
                    <div class="setting-row__copy">
                      <div class="setting-row__title">{{ t('setting.system.fanartEnable') }}</div>
                      <div class="setting-row__desc">{{ t('setting.system.fanartEnableHint') }}</div>
                    </div>
                  </div>
                  <div v-if="SystemSettings.Advanced.FANART_ENABLE" class="setting-row setting-row--block">
                    <VSelect
                      v-model="fanartLanguageSelection"
                      :label="t('setting.system.fanartLang')"
                      :hint="t('setting.system.fanartLangHint')"
                      persistent-hint
                      :items="fanartLanguageItems"
                      multiple
                      chips
                      closable-chips
                      prepend-inner-icon="mdi-translate"
                    />
                  </div>
                </div>

                <!-- 刮削开关设置 -->
                <VExpansionPanels class="setting-expansion">
                  <VExpansionPanel elevation="0">
                    <VExpansionPanelTitle class="setting-expansion__title">
                      <VIcon icon="mdi-checkbox-multiple-outline" size="18" class="me-2" />
                      <span>{{ t('setting.system.scrapingSwitchSettings') }}</span>
                      <VTooltip location="bottom" open-delay="200">
                        <template #activator="{ props: tooltipProps }">
                          <VBtn
                            v-bind="tooltipProps"
                            icon="mdi-help-circle-outline"
                            size="x-small"
                            variant="text"
                            color="default"
                            class="ms-1"
                            @click.stop
                          />
                        </template>
                        <div class="d-flex flex-column gap-2 py-2">
                          <div class="d-flex align-center">
                            <VIcon icon="mdi-file-remove" color="error" class="mr-2" />
                            <span>{{ t('setting.system.policy.skipDesc') }}</span>
                          </div>
                          <div class="d-flex align-center">
                            <VIcon icon="mdi-file-plus" color="success" class="mr-2" />
                            <span>{{ t('setting.system.policy.missingOnlyDesc') }}</span>
                          </div>
                          <div class="d-flex align-center">
                            <VIcon icon="mdi-file-replace" color="primary" class="mr-2" />
                            <span>{{ t('setting.system.policy.overwriteDesc') }}</span>
                          </div>
                        </div>
                      </VTooltip>
                    </VExpansionPanelTitle>
                    <VExpansionPanelText>
                      <div
                        v-for="(section, sIdx) in scrapingConfig"
                        :key="section.section"
                        class="scraping-section"
                        :class="{ 'scraping-section--bordered': sIdx > 0 }"
                      >
                        <div class="scraping-section__title">
                          {{ t(`setting.system.${section.section}`) }}
                        </div>
                        <div class="scraping-section__grid">
                          <div v-for="item in section.items" :key="item.key" class="scraping-policy-item">
                            <span class="scraping-policy-item__label">{{ t(item.label) }}</span>
                            <div
                              class="mp-segmented scraping-policy-segmented"
                              role="radiogroup"
                              :aria-label="`${t(`setting.system.${section.section}`)} - ${t(item.label)}`"
                            >
                              <button
                                v-for="opt in scrapingPolicyOptions"
                                :key="opt.value"
                                type="button"
                                role="radio"
                                :aria-checked="ScrapingPolicies[item.key] === opt.value"
                                :aria-label="opt.label"
                                :title="opt.label"
                                class="mp-segmented__btn scraping-policy-segmented__btn"
                                :class="[
                                  `scraping-policy-segmented__btn--${opt.value}`,
                                  { 'is-active': ScrapingPolicies[item.key] === opt.value },
                                ]"
                                @click="ScrapingPolicies[item.key] = opt.value"
                              >
                                <VIcon :icon="opt.icon" size="14" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </VExpansionPanelText>
                  </VExpansionPanel>
                </VExpansionPanels>
              </div>

              <!-- 3. 网络 -->
              <div v-show="activeTab === 'network'" data-advanced-tab="network" class="advanced-pane">
                <div class="setting-group-label">代理与加速镜像</div>
                <div class="setting-fields-card">
                  <VRow>
                    <VCol cols="12" md="6">
                      <VTextField
                        v-model="SystemSettings.Advanced.PROXY_HOST"
                        :label="t('setting.system.proxyHost')"
                        placeholder="http://127.0.0.1:7890"
                        :hint="t('setting.system.proxyHostHint')"
                        persistent-hint
                        prepend-inner-icon="mdi-server-network"
                      />
                    </VCol>
                    <VCol cols="12" md="6">
                      <VCombobox
                        v-model="githubProxyDisplay"
                        :label="t('setting.system.githubProxy')"
                        :placeholder="t('setting.system.githubProxyPlaceholder')"
                        :hint="t('setting.system.githubProxyHint')"
                        persistent-hint
                        :items="githubMirrorsItems"
                        clearable
                        prepend-inner-icon="mdi-github"
                      />
                    </VCol>
                    <VCol cols="12">
                      <VCombobox
                        v-model="pipProxyDisplay"
                        :label="t('setting.system.pipProxy')"
                        :placeholder="t('setting.system.pipProxyPlaceholder')"
                        :hint="t('setting.system.pipProxyHint')"
                        persistent-hint
                        :items="pipMirrorsItems"
                        clearable
                        prepend-inner-icon="mdi-package"
                      />
                    </VCol>
                  </VRow>
                </div>

                <div class="setting-group-label">DNS over HTTPS</div>
                <div class="setting-group-card">
                  <div class="setting-row" :title="t('setting.system.dohEnableHint')">
                    <VSwitch
                      v-model="SystemSettings.Advanced.DOH_ENABLE"
                      :aria-label="t('setting.system.dohEnable')"
                      color="primary"
                      density="compact"
                      hide-details
                      inset
                    />
                    <div class="setting-row__copy">
                      <div class="setting-row__title">{{ t('setting.system.dohEnable') }}</div>
                      <div class="setting-row__desc">{{ t('setting.system.dohEnableHint') }}</div>
                    </div>
                  </div>
                  <div v-show="SystemSettings.Advanced.DOH_ENABLE" class="setting-row setting-row--block">
                    <VRow>
                      <VCol cols="12">
                        <VTextarea
                          v-model="SystemSettings.Advanced.DOH_RESOLVERS"
                          :label="t('setting.system.dohResolvers')"
                          :placeholder="t('setting.system.dohResolversPlaceholder')"
                          :hint="t('setting.system.dohResolversHint')"
                          rows="2"
                          auto-grow
                          persistent-hint
                          prepend-inner-icon="mdi-dns"
                        />
                      </VCol>
                      <VCol cols="12">
                        <VTextarea
                          v-model="SystemSettings.Advanced.DOH_DOMAINS"
                          :label="t('setting.system.dohDomains')"
                          :placeholder="t('setting.system.dohDomainsPlaceholder')"
                          :hint="t('setting.system.dohDomainsHint')"
                          rows="2"
                          auto-grow
                          persistent-hint
                          prepend-inner-icon="mdi-domain"
                        />
                      </VCol>
                    </VRow>
                  </div>
                </div>

                <VExpansionPanels class="setting-expansion">
                  <VExpansionPanel elevation="0">
                    <VExpansionPanelTitle class="setting-expansion__title">
                      <VIcon icon="mdi-shield-check-outline" size="18" class="me-2" />
                      <span>{{ t('setting.system.securityImageDomains') }}</span>
                    </VExpansionPanelTitle>
                    <VExpansionPanelText>
                      <div class="d-flex flex-wrap gap-2 mb-3">
                        <VChip
                          v-for="(domain, index) in SystemSettings.Advanced.SECURITY_IMAGE_DOMAINS"
                          :key="index"
                          size="small"
                          variant="tonal"
                          closable
                          @click:close="SystemSettings.Advanced.SECURITY_IMAGE_DOMAINS.splice(index, 1)"
                        >
                          {{ domain }}
                        </VChip>
                        <VChip
                          v-if="SystemSettings.Advanced.SECURITY_IMAGE_DOMAINS.length === 0"
                          size="small"
                          variant="tonal"
                          color="warning"
                        >
                          {{ t('setting.system.noSecurityImageDomains') }}
                        </VChip>
                      </div>
                      <div class="d-flex align-center gap-2">
                        <VTextField
                          v-model="newSecurityDomain"
                          :placeholder="t('setting.system.securityImageDomainAdd')"
                          hide-details
                          density="compact"
                          prepend-inner-icon="mdi-shield-check-outline"
                          @keyup.enter="addSecurityDomain"
                        />
                        <VBtn
                          size="small"
                          color="primary"
                          variant="tonal"
                          rounded="lg"
                          prepend-icon="mdi-plus"
                          :disabled="!newSecurityDomain"
                          @click="addSecurityDomain"
                        >
                          添加
                        </VBtn>
                      </div>

                      <VDivider class="my-4" />

                      <div class="setting-row__title mb-1">
                        {{ t('setting.system.imageProxyAllowedPrivateRanges') }}
                      </div>
                      <div class="setting-row__desc mb-3">
                        {{ t('setting.system.imageProxyAllowedPrivateRangesHint') }}
                      </div>
                      <div class="d-flex flex-wrap gap-2 mb-3">
                        <VChip
                          v-for="(range, index) in SystemSettings.Advanced.IMAGE_PROXY_ALLOWED_PRIVATE_RANGES"
                          :key="index"
                          size="small"
                          variant="tonal"
                          closable
                          @click:close="SystemSettings.Advanced.IMAGE_PROXY_ALLOWED_PRIVATE_RANGES.splice(index, 1)"
                        >
                          {{ range }}
                        </VChip>
                        <VChip
                          v-if="SystemSettings.Advanced.IMAGE_PROXY_ALLOWED_PRIVATE_RANGES.length === 0"
                          size="small"
                          variant="tonal"
                          color="warning"
                        >
                          {{ t('setting.system.noImageProxyAllowedPrivateRanges') }}
                        </VChip>
                      </div>
                      <div class="d-flex align-center gap-2">
                        <VTextField
                          v-model="newImageProxyAllowedPrivateRange"
                          :placeholder="t('setting.system.imageProxyAllowedPrivateRangeAdd')"
                          hide-details
                          density="compact"
                          prepend-inner-icon="mdi-ip-network-outline"
                          @keyup.enter="addImageProxyAllowedPrivateRange"
                        />
                        <VBtn
                          size="small"
                          color="primary"
                          variant="tonal"
                          rounded="lg"
                          prepend-icon="mdi-plus"
                          :disabled="!newImageProxyAllowedPrivateRange"
                          @click="addImageProxyAllowedPrivateRange"
                        >
                          添加
                        </VBtn>
                      </div>
                    </VExpansionPanelText>
                  </VExpansionPanel>
                </VExpansionPanels>
              </div>

              <!-- 4. 数据 -->
              <div v-show="activeTab === 'data'" data-advanced-tab="data" class="advanced-pane">
                <div class="setting-group-label">自动数据清理</div>
                <div class="setting-group-card">
                  <div class="setting-row" :title="t('setting.system.dataCleanupEnableHint')">
                    <VSwitch
                      v-model="SystemSettings.Advanced.DATA_CLEANUP_ENABLE"
                      :aria-label="t('setting.system.dataCleanupEnable')"
                      color="primary"
                      density="compact"
                      hide-details
                      inset
                    />
                    <div class="setting-row__copy">
                      <div class="setting-row__title">{{ t('setting.system.dataCleanupEnable') }}</div>
                      <div class="setting-row__desc">{{ t('setting.system.dataCleanupEnableHint') }}</div>
                    </div>
                  </div>
                </div>

                <div v-if="SystemSettings.Advanced.DATA_CLEANUP_ENABLE" class="setting-fields-card">
                  <VRow>
                    <VCol cols="12" md="6">
                      <VTextField
                        v-model.number="SystemSettings.Advanced.DATA_CLEANUP_MESSAGE_DAYS"
                        :label="t('setting.system.dataCleanupMessageDays')"
                        :hint="t('setting.system.dataCleanupMessageDaysHint')"
                        persistent-hint
                        min="0"
                        type="number"
                        :suffix="t('setting.system.day')"
                        :rules="dataCleanupFieldRules"
                        prepend-inner-icon="mdi-email-outline"
                      />
                    </VCol>
                    <VCol cols="12" md="6">
                      <VTextField
                        v-model.number="SystemSettings.Advanced.DATA_CLEANUP_DOWNLOAD_HISTORY_DAYS"
                        :label="t('setting.system.dataCleanupDownloadHistoryDays')"
                        :hint="t('setting.system.dataCleanupDownloadHistoryDaysHint')"
                        persistent-hint
                        min="0"
                        type="number"
                        :suffix="t('setting.system.day')"
                        :rules="dataCleanupFieldRules"
                        prepend-inner-icon="mdi-download-circle-outline"
                      />
                    </VCol>
                    <VCol cols="12" md="6">
                      <VTextField
                        v-model.number="SystemSettings.Advanced.DATA_CLEANUP_SITE_USERDATA_DAYS"
                        :label="t('setting.system.dataCleanupSiteUserDataDays')"
                        :hint="t('setting.system.dataCleanupSiteUserDataDaysHint')"
                        persistent-hint
                        min="0"
                        type="number"
                        :suffix="t('setting.system.day')"
                        :rules="dataCleanupFieldRules"
                        prepend-inner-icon="mdi-chart-line"
                      />
                    </VCol>
                    <VCol cols="12" md="6">
                      <VTextField
                        v-model.number="SystemSettings.Advanced.DATA_CLEANUP_TRANSFER_HISTORY_DAYS"
                        :label="t('setting.system.dataCleanupTransferHistoryDays')"
                        :hint="t('setting.system.dataCleanupTransferHistoryDaysHint')"
                        persistent-hint
                        min="0"
                        type="number"
                        :suffix="t('setting.system.day')"
                        :rules="dataCleanupFieldRules"
                        prepend-inner-icon="mdi-swap-horizontal"
                      />
                    </VCol>
                  </VRow>
                </div>
              </div>

              <!-- 5. 日志 -->
              <div v-show="activeTab === 'log'" data-advanced-tab="log" class="advanced-pane">
                <div class="setting-group-label">调试模式</div>
                <div class="setting-group-card">
                  <div class="setting-row" :title="t('setting.system.debugHint')">
                    <VSwitch
                      v-model="SystemSettings.Advanced.DEBUG"
                      :aria-label="t('setting.system.debug')"
                      color="primary"
                      density="compact"
                      hide-details
                      inset
                    />
                    <div class="setting-row__copy">
                      <div class="setting-row__title">{{ t('setting.system.debug') }}</div>
                      <div class="setting-row__desc">{{ t('setting.system.debugHint') }}</div>
                    </div>
                  </div>
                </div>

                <div class="setting-group-label">日志轮转与格式</div>
                <div class="setting-fields-card">
                  <VRow>
                    <VCol v-if="!SystemSettings.Advanced.DEBUG" cols="12" md="6">
                      <VSelect
                        v-model="SystemSettings.Advanced.LOG_LEVEL"
                        :label="t('setting.system.logLevel')"
                        :hint="t('setting.system.logLevelHint')"
                        persistent-hint
                        :items="logLevelItems"
                        prepend-inner-icon="mdi-format-list-bulleted"
                      />
                    </VCol>
                    <VCol cols="12" md="6">
                      <VTextField
                        v-model="SystemSettings.Advanced.LOG_MAX_FILE_SIZE"
                        :label="t('setting.system.logMaxFileSize')"
                        :hint="t('setting.system.logMaxFileSizeHint')"
                        persistent-hint
                        min="1"
                        type="number"
                        :suffix="t('setting.system.mb')"
                        :rules="[
                          (v: any) => v === 0 || !!v || t('setting.system.logMaxFileSizeRequired'),
                          (v: any) => v >= 1 || t('setting.system.logMaxFileSizeMin'),
                        ]"
                        prepend-inner-icon="mdi-file-document-outline"
                      />
                    </VCol>
                    <VCol cols="12" md="6">
                      <VTextField
                        v-model="SystemSettings.Advanced.LOG_BACKUP_COUNT"
                        :label="t('setting.system.logBackupCount')"
                        :hint="t('setting.system.logBackupCountHint')"
                        persistent-hint
                        min="1"
                        type="number"
                        :rules="[
                          (v: any) => v === 0 || !!v || t('setting.system.logBackupCountRequired'),
                          (v: any) => v >= 1 || t('setting.system.logBackupCountMin'),
                        ]"
                        prepend-inner-icon="mdi-backup-restore"
                      />
                    </VCol>
                    <VCol cols="12">
                      <VTextField
                        v-model="SystemSettings.Advanced.LOG_FILE_FORMAT"
                        :label="t('setting.system.logFileFormat')"
                        :hint="t('setting.system.logFileFormatHint')"
                        persistent-hint
                        prepend-inner-icon="mdi-format-text"
                      />
                    </VCol>
                  </VRow>
                </div>
              </div>

              <!-- 6. 实验室 -->
              <div v-show="activeTab === 'dev'" data-advanced-tab="dev" class="advanced-pane">
                <div class="setting-group-label">实验性开关</div>
                <div class="setting-group-card">
                  <div class="setting-row" :title="t('setting.system.pluginAutoReloadHint')">
                    <VSwitch
                      v-model="SystemSettings.Advanced.PLUGIN_AUTO_RELOAD"
                      :aria-label="t('setting.system.pluginAutoReload')"
                      color="primary"
                      density="compact"
                      hide-details
                      inset
                    />
                    <div class="setting-row__copy">
                      <div class="setting-row__title">{{ t('setting.system.pluginAutoReload') }}</div>
                      <div class="setting-row__desc">{{ t('setting.system.pluginAutoReloadHint') }}</div>
                    </div>
                  </div>
                  <div class="setting-row" :title="t('setting.system.encodingDetectionPerformanceModeHint')">
                    <VSwitch
                      v-model="SystemSettings.Advanced.ENCODING_DETECTION_PERFORMANCE_MODE"
                      :aria-label="t('setting.system.encodingDetectionPerformanceMode')"
                      color="primary"
                      density="compact"
                      hide-details
                      inset
                    />
                    <div class="setting-row__copy">
                      <div class="setting-row__title">{{ t('setting.system.encodingDetectionPerformanceMode') }}</div>
                      <div class="setting-row__desc">
                        {{ t('setting.system.encodingDetectionPerformanceModeHint') }}
                      </div>
                    </div>
                  </div>
                  <div class="setting-row" :title="rustAccelHint">
                    <VSwitch
                      v-model="SystemSettings.Advanced.RUST_ACCEL"
                      :aria-label="t('setting.system.rustAccel')"
                      :disabled="!rustAccelAvailable"
                      color="primary"
                      density="compact"
                      hide-details
                      inset
                    />
                    <div class="setting-row__copy">
                      <div class="setting-row__title">{{ t('setting.system.rustAccel') }}</div>
                      <div class="setting-row__desc">{{ rustAccelHint }}</div>
                    </div>
                  </div>
                </div>

                <div class="setting-group-label">开发与性能参数</div>
                <div class="setting-fields-card">
                  <VRow>
                    <VCol cols="12" md="6">
                      <VTextField
                        v-model="SystemSettings.Advanced.PLUGIN_LOCAL_REPO_PATHS"
                        :label="t('setting.system.pluginLocalRepoPaths')"
                        :hint="t('setting.system.pluginLocalRepoPathsHint')"
                        persistent-hint
                        prepend-inner-icon="mdi-folder-outline"
                      />
                    </VCol>
                    <VCol cols="12" md="6">
                      <VTextField
                        v-model.number="SystemSettings.Advanced.TRANSFER_THREADS"
                        :label="t('setting.system.transferThreads')"
                        :hint="t('setting.system.transferThreadsHint')"
                        persistent-hint
                        type="number"
                        min="1"
                        prepend-inner-icon="mdi-swap-horizontal"
                      />
                    </VCol>
                  </VRow>
                </div>
              </div>
            </VForm>
          </div>
        </div>
      </div>

      <footer class="advanced-dialog__footer">
        <VBtn variant="text" color="default" size="small" rounded="lg" @click="advancedDialog = false">
          {{ cancelLabel }}
        </VBtn>
        <VBtn
          color="primary"
          variant="flat"
          size="small"
          rounded="lg"
          prepend-icon="mdi-content-save-outline"
          :loading="savingAdvanced"
          :disabled="savingAdvanced"
          class="px-4"
          @click="saveAdvancedSettings"
        >
          {{ t('common.save') }}
        </VBtn>
      </footer>
    </VCard>
  </VDialog>
</template>

<style scoped>
/* ===== Antigravity IDE 双栏高级设置面板 ===== */
.advanced-dialog {
  display: flex;
  overflow: hidden;
  flex-direction: column;
}

.advanced-dialog--desktop {
  block-size: min(80vh, 640px);
}

.advanced-dialog__body {
  display: flex;
  overflow: hidden;
  flex: 1 1 auto;
  min-block-size: 0;
}

.advanced-settings-nav {
  display: flex;
  flex: 0 0 176px;
  flex-direction: column;
  padding: 12px 10px;
  border-inline-end: 1px solid var(--mp-border-subtle);
  background: rgba(var(--v-theme-on-surface), 0.02);
  gap: 3px;
  inline-size: 176px;
}

.advanced-settings-nav__heading {
  padding: 4px 10px 8px;
  color: rgba(var(--v-theme-on-surface), 0.52);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.advanced-nav-btn {
  display: flex;
  align-items: center;
  padding: 0 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  block-size: 34px;
  color: rgba(var(--v-theme-on-surface), 0.72);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  gap: 9px;
  text-align: start;
  transition:
    background-color 0.14s ease,
    color 0.14s ease;
  white-space: nowrap;
}

.advanced-nav-btn:hover {
  background: rgba(var(--v-theme-on-surface), 0.045);
  color: rgb(var(--v-theme-on-surface));
}

.advanced-nav-btn.is-active {
  background: var(--mp-nav-pill-active-bg, rgba(var(--v-theme-on-surface), 0.08));
  color: rgb(var(--v-theme-on-surface));
  font-weight: 600;
}

.advanced-nav-btn__icon {
  flex-shrink: 0;
  opacity: 0.85;
}

.advanced-nav-btn.is-active .advanced-nav-btn__icon {
  opacity: 1;
}

/* 移动端紧凑顶栏 */
.advanced-dialog__mobile-top {
  border-block-end: 1px solid var(--mp-border-subtle);
  background: rgba(var(--v-theme-on-surface), 0.015);
}

.advanced-dialog__mobile-titlebar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 8px;
}

.advanced-dialog__mobile-title {
  color: rgb(var(--v-theme-on-surface));
  font-size: 15px;
  font-weight: 600;
}

.advanced-settings-mobile-nav {
  display: flex;
  overflow-x: auto;
  padding: 4px 12px 10px;
  gap: 6px;
  scrollbar-width: none;
}

.advanced-settings-mobile-nav::-webkit-scrollbar {
  display: none;
}

.advanced-nav-btn--mobile {
  flex: 0 0 auto;
  block-size: 30px;
  padding-inline: 10px;
}

/* 右侧主区 */
.advanced-dialog__main {
  display: flex;
  overflow: hidden;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
  min-inline-size: 0;
}

.advanced-dialog__header {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px 24px 12px;
  border-block-end: 1px solid var(--mp-border-subtle);
  gap: 12px;
}

.advanced-dialog__header :deep(.v-btn) {
  position: static !important;
  inset: auto !important;
  transform: none !important;
}

.advanced-dialog__header-copy {
  min-inline-size: 0;
}

.advanced-dialog__section-title {
  margin: 0;
  color: rgb(var(--v-theme-on-surface));
  font-size: 16px;
  font-weight: 600;
  line-height: 1.35;
}

.advanced-dialog__section-desc {
  margin: 2px 0 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  line-height: 1.45;
}

.advanced-dialog__scroll {
  overflow-y: auto;
  flex: 1 1 auto;
  padding: 20px 24px;
}

.advanced-pane {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.setting-group-label {
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 12px;
  font-weight: 600;
  margin-block-end: -6px;
}

/* Grouped Setting Rows 紧凑自适应开关网格（与全站 .mp-settings-card 视觉统一） */
.setting-group-card {
  display: grid;
  overflow: hidden;
  align-items: center;
  padding: 8px 12px;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 8px;
  background: var(--mp-item-bg);
  gap: 6px 14px;
  grid-template-columns: repeat(auto-fit, minmax(195px, 1fr));
}

.setting-row {
  display: flex;
  align-items: center;
  padding: 2px 4px;
  gap: 8px;
  min-block-size: 26px;
}

.setting-row--block {
  display: block;
  border-block-start: 1px solid var(--mp-border-subtle);
  background: rgba(var(--v-theme-on-surface), 0.015);
  grid-column: 1 / -1;
  margin-block: 4px -8px;
  margin-inline: -12px;
  padding: 12px 14px 10px;
}

.setting-row__copy {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  min-inline-size: 0;
}

.setting-row__title {
  color: rgba(var(--v-theme-on-surface), 0.9);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.35;
}

.setting-row:not(.setting-row--block) .setting-row__desc {
  position: absolute;
  overflow: hidden;
  border: 0;
  block-size: 1px;
  clip-path: inset(50%);
  inline-size: 1px;
  margin: 0;
  padding: 0;
  white-space: nowrap;
}

.setting-row__desc {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  line-height: 1.45;
}

.setting-row :deep(.v-selection-control) {
  flex: 0 0 auto;
  min-block-size: 24px;
}

/* 文本与下拉输入分组面板 */
.setting-fields-card {
  padding: 16px;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.015);
}

/* 折叠面板净化 */
.setting-expansion {
  overflow: hidden;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
}

.setting-expansion :deep(.v-expansion-panel) {
  background: rgba(var(--v-theme-on-surface), 0.015);
}

.setting-expansion__title {
  font-size: 13.5px;
  font-weight: 500;
  min-block-size: 44px !important;
}

.scraping-section {
  padding-block: 10px;
}

.scraping-section--bordered {
  border-block-start: 1px solid var(--mp-border-subtle);
}

.scraping-section__title {
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 12.5px;
  font-weight: 600;
  margin-block-end: 8px;
}

.scraping-section__grid {
  display: grid;
  gap: 8px 13px;
  grid-template-columns: repeat(auto-fill, minmax(195px, 1fr));
}

.scraping-policy-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.02);
  gap: 8px;
}

.scraping-policy-item__label {
  overflow: hidden;
  color: rgb(var(--v-theme-on-surface));
  font-size: 12.5px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scraping-policy-segmented {
  flex: 0 0 auto;
  block-size: 28px;
  padding: 2px;
}

.scraping-policy-segmented__btn {
  block-size: 22px;
  min-inline-size: 26px;
  padding-inline: 6px;
}

.scraping-policy-segmented__btn--skip.is-active {
  color: rgb(var(--v-theme-error));
}

.scraping-policy-segmented__btn--missingOnly.is-active {
  color: rgb(var(--v-theme-success));
}

.scraping-policy-segmented__btn--overwrite.is-active {
  color: rgb(var(--v-theme-primary));
}

.advanced-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 10px 20px;
  border-block-start: 1px solid var(--mp-border-subtle);
  background: rgb(var(--v-theme-surface));
  gap: 8px;
}

@media (width <= 959px) {
  .advanced-dialog__header {
    padding: 14px 16px 10px;
  }

  .advanced-dialog__scroll {
    padding: 16px;
  }
}

.mp-empty-hint {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  padding: 16px 14px;
  border: 1px dashed var(--mp-border-card);
  border-radius: 8px;
  background: var(--mp-item-bg);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12.5px;
  gap: 5px;
  line-height: 1.5;
}

.mp-empty-hint__icon {
  color: rgba(var(--v-theme-on-surface), 0.45);
}

/* 高级系统参数 6 宫格直达入口 */
.system-adv-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fill, minmax(248px, 1fr));
}

.system-adv-tile {
  display: flex;
  align-items: center;
  padding: 11px 13px;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: var(--mp-item-bg);
  cursor: pointer;
  gap: 11px;
  outline: none;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease,
    transform 0.16s ease;

  &:hover,
  &:focus-visible {
    border-color: rgba(var(--v-theme-primary), 0.45);
    background: rgba(var(--v-theme-primary), 0.06);
    transform: translateY(-1px);

    .system-adv-tile__arrow {
      color: rgb(var(--v-theme-primary));
      transform: translateX(2px);
    }
  }
}

.system-adv-tile__icon {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(var(--v-theme-primary), 0.18);
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.1);
  block-size: 34px;
  color: rgb(var(--v-theme-primary));
  inline-size: 34px;
}

.system-adv-tile__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-inline-size: 0;
}

.system-adv-tile__title {
  color: rgb(var(--v-theme-on-surface));
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
}

.system-adv-tile__desc {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.56);
  font-size: 11.5px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.system-adv-tile__arrow {
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), 0.36);
  transition:
    color 0.16s ease,
    transform 0.16s ease;
}
</style>
