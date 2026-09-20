<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import { numberValidator } from '@/@validators'
import api from '@/api'
import type { DownloaderConf, FilterRuleGroup, Site, Subscribe, SubscribeVersionRule, SubscribeVersionSettings, TransferDirectoryConf } from '@/api/types'
import { useDisplay } from 'vuetify'
import { useConfirm } from '@/composables/useConfirm'
import { useI18n } from '@/composables/useChineseText'
import { qualityOptions, resolutionOptions, effectOptions } from '@/api/constants'
import { formatSeason } from '@/@core/utils/formatters'

// 从变更请求异常中提取可展示消息，并为非标准错误提供稳定兜底。
function getRequestErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null) {
    const responseMessage = (error as { response?: { data?: { message?: unknown } } }).response?.data?.message
    if (typeof responseMessage === 'string' && responseMessage) return responseMessage
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

// i18n
const { t } = useI18n()

// 显示器宽度
const display = useDisplay()

// 确认框
const createConfirm = useConfirm()

// 输入参数
const props = defineProps({
  subid: Number,
  default: Boolean,
  type: String,
  // 指定编辑的版本 ID；多版本订阅由版本选择页传入
  versionId: String,
  // 新增版本模式：打开时基于当前订阅设置创建一个新版本
  addVersion: Boolean,
})

// 定义触发的自定义事件
const emit = defineEmits(['remove', 'save', 'close'])

const activeTab = ref('basic')

// 站点数据列表
const siteList = ref<Site[]>([])

// 下载目录列表
const downloadDirectories = ref<TransferDirectoryConf[]>([])

// 站点选择下载框
const selectSitesOptions = ref<{ [key: number]: string }[]>([])

// 所有规则组列表
const filterRuleGroups = ref<FilterRuleGroup[]>([])

// 版本编辑状态：每个版本保存完整设置快照，运行进度永不进入写请求
const versionRules = ref<SubscribeVersionRule[]>([])
const activeVersionId = ref<string | null>(null)
// 版本规则是否已从服务端加载完成:加载前不渲染依赖规则数量的开关,避免闪烁
const versionRulesLoaded = ref(false)

const versionSettingKeys: (keyof SubscribeVersionSettings)[] = [
  'keyword', 'filter', 'include', 'exclude', 'quality', 'resolution', 'effect',
  'total_episode', 'start_episode', 'sites', 'downloader', 'best_version',
  'best_version_full', 'save_path', 'search_imdbid', 'manual_total_episode',
  'custom_words', 'media_category', 'filter_groups', 'episode_group',
]

function makeVersionId() {
  // crypto.randomUUID 仅在安全上下文可用；局域网 IP 访问等场景降级为随机 ID
  return globalThis.crypto?.randomUUID?.() ?? `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
function settingsFromSubscribe(value: Subscribe): SubscribeVersionSettings {
  const settings = {} as SubscribeVersionSettings
  for (const key of versionSettingKeys) settings[key] = value[key] as never
  settings.sites = [...(value.sites ?? [])]
  settings.filter_groups = [...(value.filter_groups ?? [])]
  return settings
}

function ensureVersionRules(value: Subscribe) {
  const existing = value.version_rules ?? []
  if (existing.length) {
    versionRules.value = JSON.parse(JSON.stringify(existing)) as SubscribeVersionRule[]
    activeVersionId.value = versionRules.value[0].id
    return
  }
  const id = makeVersionId()
  versionRules.value = [{ id, name: '默认版本', enabled: true, settings: settingsFromSubscribe(value) }]
  activeVersionId.value = id
}

const activeVersion = computed(() => versionRules.value.find(rule => rule.id === activeVersionId.value))
const activeVersionSettings = computed(() => activeVersion.value?.settings)

// 版本名称就地编辑：默认纯文本展示，点击切换为输入框
const editingVersionName = ref(false)
const versionNameInput = ref<HTMLInputElement | null>(null)
let versionNameOriginal = ''

async function startEditVersionName() {
  if (!activeVersion.value) return
  versionNameOriginal = activeVersion.value.name
  editingVersionName.value = true
  await nextTick()
  versionNameInput.value?.focus()
  versionNameInput.value?.select()
}

function finishEditVersionName() {
  // 留空时恢复原名称，版本名不能为空
  if (activeVersion.value && !activeVersion.value.name.trim()) {
    activeVersion.value.name = versionNameOriginal
  }
  editingVersionName.value = false
}

function cancelEditVersionName() {
  if (activeVersion.value) activeVersion.value.name = versionNameOriginal
  editingVersionName.value = false
}

function syncActiveVersionToForm() {
  if (!activeVersionSettings.value) return
  Object.assign(subscribeForm.value, JSON.parse(JSON.stringify(activeVersionSettings.value)) as Partial<Subscribe>)
}

function syncFormToActiveVersion() {
  if (!activeVersion.value) return
  activeVersion.value.settings = settingsFromSubscribe(subscribeForm.value)
}

// 新增版本：基于当前表单设置创建完整设置快照，不复制任何运行事实
function appendVersion() {
  syncFormToActiveVersion()
  const id = makeVersionId()
  versionRules.value.push({
    id,
    name: t('dialog.subscribeEdit.newVersion'),
    enabled: true,
    release_group: activeVersion.value?.release_group,
    settings: settingsFromSubscribe(subscribeForm.value),
  })
  activeVersionId.value = id
  syncActiveVersionToForm()
}


// 订阅编辑表单
const subscribeForm = ref<Subscribe>({
  id: props.subid ?? 0,
  name: '', year: '', type: '', tmdbid: 0,
  state: '', last_update: '', username: '', sites: [],
  best_version: undefined, best_version_full: undefined, current_priority: 0,
  downloader: '', date: '', show_edit_dialog: false, episode_group: '',
})

// 提示框
const $toast = useToast()

// 下载器选项
const downloaderOptions = ref<{ title: string; value: string }[]>([])

// 所有剧集组
const episodeGroups = ref<{ [key: string]: any }[]>([])

// 剧集组选项
const episodeGroupOptions = computed(() => {
  return (episodeGroups.value as { id: number; name: string; group_count: number; episode_count: number }[]).map(
    item => {
      return {
        title: item.name,
        subtitle: `${item.group_count} 季 • ${item.episode_count} 集`,
        value: item.id,
      }
    },
  )
})

// 生成1到100季的下拉框选项
const seasonItems = ref(
  Array.from({ length: 101 }, (_, i) => i).map(item => ({
    title: t('dialog.subscribeEdit.seasonFormat', { number: item }),
    value: item,
  })),
)

function getSubscribeDisplayName() {
  const name = subscribeForm.value.name || ''
  const season = subscribeForm.value.season
  if (season === null || season === undefined) return name
  return `${name} ${formatSeason(season.toString())}`
}

function getDefaultSubscribeTypeName() {
  if (props.type === '电影') return t('mediaType.movie')
  if (props.type === '电视剧') return t('mediaType.tv')
  return props.type ?? ''
}

// 剧集组选项属性
function episodeGroupItemProps(item: { title: string; subtitle: string }) {
  return {
    title: item.title,
    subtitle: item.subtitle,
  }
}

// 查询所有剧集组
async function getEpisodeGroups() {
  // 兼容未记录主来源的旧 TMDB 订阅；明确为其他来源时不使用辅助 TMDB ID 查询剧集组。
  if (subscribeForm.value.media_source && subscribeForm.value.media_source !== 'themoviedb') return
  if (!subscribeForm.value.tmdbid) {
    console.warn('tmdbid is not set or is empty')
    return
  }
  try {
    episodeGroups.value = await api.get(`media/groups/${subscribeForm.value.tmdbid}`)
  } catch (error) {
    console.error(error)
  }
}

async function loadDownloaderSetting() {
  try {
    const downloaders: DownloaderConf[] = await api.get('download/clients')
    downloaderOptions.value = [
      { title: t('common.default'), value: '' },
      ...downloaders.map((item: { name: any }) => ({
        title: item.name,
        value: item.name,
      })),
    ]
  } catch (error) {
    console.error('加载下载器设置失败:', error)
  }
}

// 加载规则组
async function queryFilterRuleGroups() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/UserFilterRuleGroups')
    filterRuleGroups.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 过滤规则组选择项
const filterRuleGroupOptions = computed(() => {
  return filterRuleGroups.value.map(item => ({
    title: item.name,
    value: item.name,
  }))
})

// 调用API修改订阅
async function updateSubscribeInfo() {
  // 版本数据尚未从服务端加载时禁止保存，避免提交空数组清空已有版本
  if (!versionRules.value.length) {
    $toast.error(t('dialog.subscribeEdit.versionNotLoaded'))
    return
  }
  syncFormToActiveVersion()
  const displayName = getSubscribeDisplayName()
  try {
    const payload = { ...subscribeForm.value, version_rules: JSON.parse(JSON.stringify(versionRules.value)) as SubscribeVersionRule[], version_mode: 'all' as const }
    const result: { [key: string]: unknown } = await api.put('subscribe/', payload)
    if (result.success) {
      $toast.success(t('dialog.subscribeEdit.updateSuccess', { name: displayName }))
      emit('save', payload)
    } else {
      $toast.error(t('dialog.subscribeEdit.updateFailed', { name: displayName, message: result.message ?? t('subscribe.requestFailed') }))
    }
  } catch (e) {
    $toast.error(t('dialog.subscribeEdit.updateFailed', { name: displayName, message: getRequestErrorMessage(e, t('subscribe.requestFailed')) }))
  }
}
// 设置用户设置的默认订阅规则
async function saveDefaultSubscribeConfig() {
  const typeName = getDefaultSubscribeTypeName()
  try {
    let subscribe_config_url = ''
    if (props.type === '电影') subscribe_config_url = 'system/setting/DefaultMovieSubscribeConfig'
    else subscribe_config_url = 'system/setting/DefaultTvSubscribeConfig'

    const result: { [key: string]: any } = await api.post(subscribe_config_url, subscribeForm.value)
    if (result.success) {
      $toast.success(t('dialog.subscribeEdit.defaultSaveSuccess', { type: typeName }))
      // 通知父组件刷新
      emit('save', subscribeForm.value)
    } else {
      $toast.error(
        t('dialog.subscribeEdit.defaultSaveFailed', {
          type: typeName,
          message: result.message ?? t('subscribe.requestFailed'),
        }),
      )
    }
  } catch (error) {
    console.log(error)
    $toast.error(
      t('dialog.subscribeEdit.defaultSaveFailed', {
        type: typeName,
        message: getRequestErrorMessage(error, t('subscribe.requestFailed')),
      }),
    )
  }
}

// 查询用户设置的默认订阅规则
async function queryDefaultSubscribeConfig() {
  try {
    let subscribe_config_url = ''
    if (props.type === '电影') subscribe_config_url = 'system/setting/public/DefaultMovieSubscribeConfig'
    else subscribe_config_url = 'system/setting/public/DefaultTvSubscribeConfig'

    const result: { [key: string]: any } = await api.get(subscribe_config_url)

    if (result.data.value) subscribeForm.value = result.data?.value ?? ''
  } catch (error) {
    console.log(error)
  }
}

// 获取站点列表数据
async function loadSites() {
  try {
    const data: Site[] = await api.get('site/rss')

    // 过滤站点，只有启用的站点才显示
    siteList.value = data.filter(item => item.is_active)
  } catch (error) {
    console.error(error)
  }
}

// 获取站点列表选择框数据
async function getSiteList() {
  // 加载订阅站点列表
  if (!siteList.value.length) await loadSites()

  const maps = siteList.value.map(item => {
    return {
      title: item.name,
      value: item.id,
    }
  })

  selectSitesOptions.value = maps.flat()
}

// 获取订阅信息
async function getSubscribeInfo() {
  try {
    const result: Subscribe = await api.get(`subscribe/${props.subid}`)
    subscribeForm.value = result
    ensureVersionRules(result)
    if (props.addVersion) {
      appendVersion()
    } else if (props.versionId && versionRules.value.some(rule => rule.id === props.versionId)) {
      activeVersionId.value = props.versionId
    }
    syncActiveVersionToForm()
    subscribeForm.value.best_version = subscribeForm.value.best_version === 1
    subscribeForm.value.best_version_full = subscribeForm.value.best_version_full === 1
    subscribeForm.value.search_imdbid = subscribeForm.value.search_imdbid === 1
    subscribeForm.value.skip_library_check = subscribeForm.value.skip_library_check === 1
    versionRulesLoaded.value = true
    // 加载剧集组
    if (subscribeForm.value.type == '电视剧') getEpisodeGroups()
  } catch (e) {
    console.log(e)
  }
}

// 删除订阅
async function removeSubscribe() {
  const isConfirmed = await createConfirm({
    title: t('common.confirm'),
    content: t('dialog.subscribeEdit.cancelSubscribeConfirm'),
  })

  if (!isConfirmed) return
  const displayName = getSubscribeDisplayName()
  try {
    const result: { [key: string]: unknown } = await api.delete(`subscribe/${props.subid}`)
    if (result.success) {
      $toast.success(`${displayName} ${t('subscribe.cancelSuccess')}`)
      emit('remove')
    } else {
      $toast.error(`${displayName} ${t('subscribe.cancelFailed', { message: result.message ?? t('subscribe.requestFailed') })}`)
    }
  } catch (e) {
    $toast.error(`${displayName} ${t('subscribe.cancelFailed', { message: getRequestErrorMessage(e, t('subscribe.requestFailed')) })}`)
  }
}

// 查询下载目录
async function loadDownloadDirectories() {
  try {
    const result: { [key: string]: unknown } = await api.get('system/setting/public/Directories')
    if (result.success && typeof result.data === 'object' && result.data !== null && 'value' in result.data) {
      const value = result.data.value
      if (Array.isArray(value)) downloadDirectories.value = value as TransferDirectoryConf[]
    }
  } catch (error) {
    console.log(error)
  }
}

// 保存目录下拉框
const targetDirectories = computed(() => {
  const paths = downloadDirectories.value
    .map(item => item.download_path?.trim())
    .filter((path): path is string => Boolean(path))
  return [...new Set(paths)]
})

// 仅电视剧订阅支持全集洗版，电影保持原有洗版逻辑
const isTvSubscribe = computed(() => props.type === '电视剧' || subscribeForm.value.type === '电视剧')

watch(
  () => subscribeForm.value.best_version,
  bestVersion => {
    if (!bestVersion) subscribeForm.value.best_version_full = false
  },
)

onMounted(() => {
  queryFilterRuleGroups()
  loadDownloadDirectories()
  getSiteList()
  loadDownloaderSetting()
  if (props.subid) getSubscribeInfo()
  if (props.default) queryDefaultSubscribeConfig()
})
</script>

<template>
  <VDialog scrollable max-width="45rem" :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VCardItem class="py-2">
        <VDialogCloseBtn @click="emit('close')" />
        <template #prepend>
          <VIcon icon="mdi-clipboard-list-outline" class="me-2" />
        </template>
        <VCardTitle>
          {{ props.default ? t('dialog.subscribeEdit.titleDefault') : props.addVersion ? t('dialog.subscribeEdit.titleAddVersion') : t('dialog.subscribeEdit.titleEdit') }}
        </VCardTitle>
        <VCardSubtitle v-if="!props.default">
          {{ getSubscribeDisplayName() }}
          <template v-if="activeVersion">
            <span class="mx-1">·</span><input
              v-if="editingVersionName"
              ref="versionNameInput"
              v-model="activeVersion.name"
              class="version-name-input text-primary"
              :size="Math.max(activeVersion.name.length + 2, 8)"
              :aria-label="t('dialog.subscribeEdit.versionName')"
              @blur="finishEditVersionName"
              @keyup.enter="finishEditVersionName"
              @keyup.esc="cancelEditVersionName"
            /><span
              v-else
              class="text-primary version-name-label"
              role="button"
              tabindex="0"
              @click="startEditVersionName"
              @keydown.enter="startEditVersionName"
            >{{ activeVersion.name }}<VIcon icon="mdi-pencil" size="12" class="version-name-edit-icon" /><VTooltip activator="parent" location="top">{{ t('dialog.subscribeEdit.versionNameHint') }}</VTooltip></span>
          </template>
        </VCardSubtitle>
        <VCardSubtitle v-else>
          {{ props.type }}
        </VCardSubtitle>
      </VCardItem>
      <VCardText>
        <VForm @submit.prevent="() => {}">
          <VTabs v-model="activeTab" show-arrows>
            <VTab value="basic">
              <div>{{ t('dialog.subscribeEdit.tabs.basic') }}</div>
            </VTab>
            <VTab value="advance">
              <div>{{ t('dialog.subscribeEdit.tabs.advance') }}</div>
            </VTab>
          </VTabs>
          <VWindow v-model="activeTab" class="mt-5 disable-tab-transition" :touch="false">
            <VWindowItem value="basic">
              <div>
                <VRow v-if="!props.default">
                  <VCol cols="12" md="4">
                    <VTextField
                      v-model="subscribeForm.keyword"
                      :label="t('dialog.subscribeEdit.searchKeyword')"
                      :hint="t('dialog.subscribeEdit.searchKeywordHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-magnify"
                    />
                  </VCol>
                  <VCol v-if="subscribeForm.type === '电视剧'" cols="12" md="4">
                    <VTextField
                      v-model="subscribeForm.total_episode"
                      :label="t('dialog.subscribeEdit.totalEpisode')"
                      :rules="[numberValidator]"
                      :hint="t('dialog.subscribeEdit.totalEpisodeHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-playlist-play"
                    />
                  </VCol>
                  <VCol v-if="subscribeForm.type === '电视剧'" cols="12" md="4">
                    <VTextField
                      v-model="subscribeForm.start_episode"
                      :label="t('dialog.subscribeEdit.startEpisode')"
                      :rules="[numberValidator]"
                      :hint="t('dialog.subscribeEdit.startEpisodeHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-play-circle-outline"
                    />
                  </VCol>
                </VRow>
                <VRow>
                  <VCol cols="12" md="4">
                    <VAutocomplete
                      v-model="subscribeForm.quality"
                      :label="t('dialog.subscribeEdit.quality')"
                      :items="qualityOptions"
                      :hint="t('dialog.subscribeEdit.qualityHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-quality-high"
                    />
                  </VCol>
                  <VCol cols="12" md="4">
                    <VAutocomplete
                      v-model="subscribeForm.resolution"
                      :label="t('dialog.subscribeEdit.resolution')"
                      :items="resolutionOptions"
                      :hint="t('dialog.subscribeEdit.resolutionHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-monitor"
                    />
                  </VCol>
                  <VCol cols="12" md="4">
                    <VAutocomplete
                      v-model="subscribeForm.effect"
                      :label="t('dialog.subscribeEdit.effect')"
                      :items="effectOptions"
                      :hint="t('dialog.subscribeEdit.effectHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-auto-fix"
                    />
                  </VCol>
                </VRow>
                <VRow>
                  <VCol cols="12">
                    <VAutocomplete
                      v-model="subscribeForm.sites"
                      :items="selectSitesOptions"
                      chips
                      :label="t('dialog.subscribeEdit.subscribeSites')"
                      multiple
                      clearable
                      :hint="t('dialog.subscribeEdit.subscribeSitesHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-web"
                    />
                  </VCol>
                </VRow>
                <VRow>
                  <VCol cols="12" md="6">
                    <VAutocomplete
                      v-model="subscribeForm.downloader"
                      :items="downloaderOptions"
                      :label="t('dialog.subscribeEdit.downloader')"
                      :hint="t('dialog.subscribeEdit.downloaderHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-download"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VCombobox
                      v-model="subscribeForm.save_path"
                      :items="targetDirectories"
                      :label="t('dialog.subscribeEdit.savePath')"
                      :hint="t('dialog.subscribeEdit.savePathHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-folder"
                    />
                  </VCol>
                </VRow>
                <VRow>
                  <VCol cols="12" md="4">
                    <VSwitch
                      v-model="subscribeForm.best_version"
                      :label="t('dialog.subscribeEdit.bestVersion')"
                      :hint="t('dialog.subscribeEdit.bestVersionHint')"
                      persistent-hint
                    />
                  </VCol>
                  <VCol v-if="isTvSubscribe && subscribeForm.best_version" cols="12" md="4">
                    <VSwitch
                      v-model="subscribeForm.best_version_full"
                      :label="t('dialog.subscribeEdit.bestVersionFull')"
                      :hint="t('dialog.subscribeEdit.bestVersionFullHint')"
                      persistent-hint
                    />
                  </VCol>
                  <VCol cols="12" md="4">
                    <VSwitch
                      v-model="subscribeForm.search_imdbid"
                      :label="t('dialog.subscribeEdit.searchImdbid')"
                      :hint="t('dialog.subscribeEdit.searchImdbidHint')"
                      persistent-hint
                    />
                  </VCol>
                  <VCol v-if="(props.default || versionRulesLoaded) && versionRules.length <= 1" cols="12" md="4">
                    <VSwitch
                      v-model="subscribeForm.skip_library_check"
                      :label="t('dialog.subscribeEdit.skipLibraryCheck')"
                      :hint="t('dialog.subscribeEdit.skipLibraryCheckHint')"
                      persistent-hint
                    />
                  </VCol>
                  <VCol v-if="props.default" cols="12" md="4">
                    <VSwitch
                      v-model="subscribeForm.show_edit_dialog"
                      :label="t('dialog.subscribeEdit.showEditDialog')"
                      :hint="t('dialog.subscribeEdit.showEditDialogHint')"
                      persistent-hint
                    />
                  </VCol>
                </VRow>
              </div>
            </VWindowItem>
            <VWindowItem value="advance">
              <div>
                <VRow v-if="!props.default && activeVersion">
                  <VCol cols="12">
                    <VTextField
                      v-model="activeVersion.release_group"
                      :label="t('dialog.subscribeEdit.releaseGroup')"
                      :hint="t('dialog.subscribeEdit.releaseGroupHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-account-group-outline"
                    />
                  </VCol>
                </VRow>
                <VRow>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="subscribeForm.include"
                      :label="t('dialog.subscribeEdit.include')"
                      :hint="t('dialog.subscribeEdit.includeHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-plus-circle-outline"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="subscribeForm.exclude"
                      :label="t('dialog.subscribeEdit.exclude')"
                      :hint="t('dialog.subscribeEdit.excludeHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-minus-circle-outline"
                    />
                  </VCol>
                </VRow>
                <VRow>
                  <VCol cols="12">
                    <VAutocomplete
                      v-model="subscribeForm.filter_groups"
                      :items="filterRuleGroupOptions"
                      chips
                      multiple
                      clearable
                      :label="t('dialog.subscribeEdit.filterGroups')"
                      :hint="t('dialog.subscribeEdit.filterGroupsHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-filter"
                    />
                  </VCol>
                  <VCol v-if="!props.default && subscribeForm.type === '电视剧'" cols="12" md="6">
                    <VAutocomplete
                      v-model="subscribeForm.episode_group"
                      :items="episodeGroupOptions"
                      :item-props="episodeGroupItemProps"
                      :label="t('dialog.subscribeEdit.episodeGroup')"
                      :hint="t('dialog.subscribeEdit.episodeGroupHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-view-list"
                    />
                  </VCol>
                  <VCol v-if="!props.default && subscribeForm.type === '电视剧'" cols="12" md="6">
                    <VAutocomplete
                      v-model="subscribeForm.season"
                      :items="seasonItems"
                      :label="t('dialog.subscribeEdit.season')"
                      :hint="t('dialog.subscribeEdit.seasonHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-calendar"
                    />
                  </VCol>
                </VRow>
                <VRow v-if="!props.default">
                  <VCol cols="12">
                    <VTextarea
                      v-model="subscribeForm.custom_words"
                      :label="t('dialog.subscribeEdit.customWords')"
                      :hint="t('dialog.subscribeEdit.customWordsHint')"
                      persistent-hint
                      :placeholder="t('dialog.subscribeEdit.customWordsPlaceholder')"
                      prepend-inner-icon="mdi-text"
                    />
                  </VCol>
                </VRow>
              </div>
            </VWindowItem>
          </VWindow>
        </VForm>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VBtn v-if="!props.default" color="error" variant="tonal" @click="removeSubscribe">
          {{ t('dialog.subscribeEdit.cancelSubscribe') }}
        </VBtn>
        <VSpacer />
        <VBtn
          color="primary"
          variant="flat"
          @click="props.default ? saveDefaultSubscribeConfig() : updateSubscribeInfo()"
          prepend-icon="mdi-content-save"
          class="px-5"
        >
          {{ t('dialog.subscribeEdit.save') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped>
// 版本名称就地编辑：默认与副标题文本一致，铅笔图标提示可点击，悬停浮出底色
.version-name-label {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 6px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.version-name-label:hover {
  background: rgba(var(--v-theme-primary), 0.12);
}

.version-name-edit-icon {
  opacity: 0.7;
}

// 编辑态输入框：贴合副标题字号的内联输入，仅底部一条主题色细线
.version-name-input {
  padding: 1px 2px;
  border: none;
  border-block-end: 1px solid currentColor;
  background: transparent;
  color: inherit;
  font: inherit;
  outline: none;
}
</style>
