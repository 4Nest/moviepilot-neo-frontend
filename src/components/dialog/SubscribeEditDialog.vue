<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import { numberValidator } from '@/@validators'
import api from '@/api'
import type {
  DownloaderConf,
  FilterRuleGroup,
  Site,
  Subscribe,
  SubscribeVersionRule,
  SubscribeVersionSettings,
  TransferDirectoryConf,
} from '@/api/types'
import { useDisplay } from 'vuetify'
import { useConfirm } from '@/composables/useConfirm'
import { useI18n } from '@/composables/useChineseText'
import { qualityOptions, resolutionOptions, effectOptions } from '@/api/constants'
import { formatSeason } from '@/@core/utils/formatters'
import {
  buildDownloadDirectoryOptions,
  filterDownloadDirectoryOption,
  toDownloadDirectoryValue,
  toDownloadPath,
} from '@/utils/downloadDirectory'

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
const subscribeFormRef = ref()
const saving = ref(false)
const deleting = ref(false)

const optionalNumberValidator = (val: unknown) =>
  val === undefined || val === null || val === '' || numberValidator(val)

function toBooleanFlag(val: unknown): boolean {
  return val === 1 || val === true
}

function normalizeVersionSettingsFlags(settings?: Record<string, unknown> | null) {
  if (!settings || typeof settings !== 'object') return
  settings.best_version = toBooleanFlag(settings.best_version)
  settings.best_version_full = toBooleanFlag(settings.best_version_full)
  settings.search_imdbid = toBooleanFlag(settings.search_imdbid)
  if ('manual_total_episode' in settings && settings.manual_total_episode !== undefined) {
    settings.manual_total_episode = toBooleanFlag(settings.manual_total_episode)
  }
  if ('wash' in settings && settings.wash !== undefined) {
    settings.wash = toBooleanFlag(settings.wash)
  }
}

function normalizeSubscribeFlags(target?: object | null) {
  if (!target || typeof target !== 'object') return
  const record = target as Record<string, unknown>
  normalizeVersionSettingsFlags(record)
  record.skip_library_check = toBooleanFlag(record.skip_library_check)
  if ('show_edit_dialog' in record && record.show_edit_dialog !== undefined) {
    record.show_edit_dialog = toBooleanFlag(record.show_edit_dialog)
  }
  if (Array.isArray(record.version_rules)) {
    record.version_rules.forEach((rule: SubscribeVersionRule) => {
      normalizeVersionSettingsFlags(rule?.settings as unknown as Record<string, unknown>)
    })
  }
}

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
  'keyword',
  'filter',
  'include',
  'exclude',
  'quality',
  'resolution',
  'effect',
  'total_episode',
  'start_episode',
  'sites',
  'downloader',
  'best_version',
  'best_version_full',
  'save_path',
  'search_imdbid',
  'manual_total_episode',
  'custom_words',
  'media_category',
  'filter_groups',
  'episode_group',
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
    // 字幕组是区分版本资源的核心依据，继承当前版本的字幕组会让用户误以为已按需配置
    release_group: undefined,
    settings: settingsFromSubscribe(subscribeForm.value),
  })
  activeVersionId.value = id
  syncActiveVersionToForm()
}

// 订阅编辑表单
const subscribeForm = ref<Subscribe>({
  id: props.subid ?? 0,
  name: '',
  year: '',
  type: '',
  tmdbid: 0,
  state: '',
  last_update: '',
  username: '',
  sites: [],
  best_version: undefined,
  best_version_full: undefined,
  current_priority: 0,
  downloader: '',
  date: '',
  show_edit_dialog: false,
  episode_group: '',
})

// 提示框
const $toast = useToast()

// 下载器选项
const downloaderOptions = ref<{ title: string; value: string }[]>([])

// 所有剧集组
interface EpisodeGroupSummary {
  id: number
  name: string
  group_count: number
  episode_count: number
}
const episodeGroups = ref<EpisodeGroupSummary[]>([])

// 剧集组选项
const episodeGroupOptions = computed(() => {
  return episodeGroups.value.map(item => {
    return {
      title: item.name,
      subtitle: `${item.group_count} 季 • ${item.episode_count} 集`,
      value: item.id,
    }
  })
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
      ...downloaders.map((item: DownloaderConf) => ({
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
    const result: { data?: { value?: FilterRuleGroup[] } } = await api.get('system/setting/UserFilterRuleGroups')
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

async function validateSubscribeForm() {
  const { valid } = (await subscribeFormRef.value?.validate()) || { valid: true }
  if (!valid) return false
  if (!props.default && subscribeForm.value.type === '电视剧') {
    if (
      optionalNumberValidator(subscribeForm.value.total_episode) !== true ||
      optionalNumberValidator(subscribeForm.value.start_episode) !== true
    ) {
      activeTab.value = 'basic'
      await nextTick()
      await subscribeFormRef.value?.validate()
      return false
    }
  }
  return true
}

// 调用API修改订阅
async function updateSubscribeInfo() {
  if (saving.value || deleting.value) return
  if (!(await validateSubscribeForm())) return
  // 版本数据尚未从服务端加载时禁止保存，避免提交空数组清空已有版本
  if (!versionRules.value.length) {
    $toast.error(t('dialog.subscribeEdit.versionNotLoaded'))
    return
  }
  syncFormToActiveVersion()
  const displayName = getSubscribeDisplayName()
  saving.value = true
  try {
    const payload = {
      ...subscribeForm.value,
      version_rules: JSON.parse(JSON.stringify(versionRules.value)) as SubscribeVersionRule[],
      version_mode: 'all' as const,
    }
    const result: { [key: string]: unknown } = await api.put('subscribe/', payload)
    if (result.success) {
      $toast.success(t('dialog.subscribeEdit.updateSuccess', { name: displayName }))
      emit('save', payload)
    } else {
      $toast.error(
        t('dialog.subscribeEdit.updateFailed', {
          name: displayName,
          message: result.message ?? t('subscribe.requestFailed'),
        }),
      )
    }
  } catch (e) {
    $toast.error(
      t('dialog.subscribeEdit.updateFailed', {
        name: displayName,
        message: getRequestErrorMessage(e, t('subscribe.requestFailed')),
      }),
    )
  } finally {
    saving.value = false
  }
}
// 设置用户设置的默认订阅规则
async function saveDefaultSubscribeConfig() {
  if (saving.value || deleting.value) return
  if (!(await validateSubscribeForm())) return
  const typeName = getDefaultSubscribeTypeName()
  saving.value = true
  try {
    let subscribe_config_url = ''
    if (props.type === '电影') subscribe_config_url = 'system/setting/DefaultMovieSubscribeConfig'
    else subscribe_config_url = 'system/setting/DefaultTvSubscribeConfig'

    const result: { success?: boolean; message?: string } = await api.post(subscribe_config_url, subscribeForm.value)
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
  } finally {
    saving.value = false
  }
}

// 查询用户设置的默认订阅规则
async function queryDefaultSubscribeConfig() {
  try {
    let subscribe_config_url = ''
    if (props.type === '电影') subscribe_config_url = 'system/setting/public/DefaultMovieSubscribeConfig'
    else subscribe_config_url = 'system/setting/public/DefaultTvSubscribeConfig'

    const result: { data?: { value?: Subscribe & Record<string, unknown> } } = await api.get(subscribe_config_url)

    if (result.data?.value) {
      normalizeSubscribeFlags(result.data.value)
      subscribeForm.value = result.data.value
    }
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
    normalizeSubscribeFlags(result)
    subscribeForm.value = result
    const hadVersions = Boolean(result.version_rules?.length)
    ensureVersionRules(result)
    if (props.addVersion) {
      syncActiveVersionToForm()
      appendVersion()
      // 旧订阅首次进入多版本会同时保留一份默认版本，需提示用户两个版本都要检查约束
      if (!hadVersions) $toast.info(t('dialog.subscribeEdit.legacyVersionNotice'))
    } else if (props.versionId && versionRules.value.some(rule => rule.id === props.versionId)) {
      activeVersionId.value = props.versionId
      syncActiveVersionToForm()
    } else {
      syncActiveVersionToForm()
    }
    normalizeSubscribeFlags(subscribeForm.value)
    versionRulesLoaded.value = true
    // 加载剧集组
    if (subscribeForm.value.type == '电视剧') getEpisodeGroups()
  } catch (e) {
    console.log(e)
  }
}

// 删除订阅
async function removeSubscribe() {
  if (deleting.value || saving.value) return
  const isConfirmed = await createConfirm({
    title: t('common.confirm'),
    content: t('dialog.subscribeEdit.cancelSubscribeConfirm'),
  })

  if (!isConfirmed) return
  const displayName = getSubscribeDisplayName()
  deleting.value = true
  try {
    const result: { [key: string]: unknown } = await api.delete(`subscribe/${props.subid}`)
    if (result.success) {
      $toast.success(`${displayName} ${t('subscribe.cancelSuccess')}`)
      emit('remove')
    } else {
      $toast.error(
        `${displayName} ${t('subscribe.cancelFailed', { message: result.message ?? t('subscribe.requestFailed') })}`,
      )
    }
  } catch (e) {
    $toast.error(
      `${displayName} ${t('subscribe.cancelFailed', { message: getRequestErrorMessage(e, t('subscribe.requestFailed')) })}`,
    )
  } finally {
    deleting.value = false
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

// 保存目录下拉选项：列表显示「别名 (路径)」，值为无存储前缀的路径
const targetDirectories = computed(() => buildDownloadDirectoryOptions(downloadDirectories.value, toDownloadPath))

// 保存路径输入框绑定：统一归一为路径字符串；清空写回 null，保证更新请求显式携带 save_path
const savePathModel = computed({
  get: () => subscribeForm.value.save_path ?? null,
  set: (value: unknown) => {
    subscribeForm.value.save_path = toDownloadDirectoryValue(value)
  },
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
  <VDialog scrollable max-width="46rem" :fullscreen="!display.mdAndUp.value">
    <VCard class="mp-dialog-card">
      <VCardItem class="mp-dialog-header">
        <VDialogCloseBtn @click="emit('close')" />
        <template #prepend>
          <VIcon icon="mdi-clipboard-list-outline" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>
          {{
            props.default
              ? t('dialog.subscribeEdit.titleDefault')
              : props.addVersion
                ? t('dialog.subscribeEdit.titleAddVersion')
                : t('dialog.subscribeEdit.titleEdit')
          }}
        </VCardTitle>
        <VCardSubtitle v-if="!props.default">
          {{ getSubscribeDisplayName() }}
          <template v-if="activeVersion">
            <span class="mx-1">·</span
            ><input
              v-if="editingVersionName"
              ref="versionNameInput"
              v-model="activeVersion.name"
              class="version-name-input text-primary"
              :size="Math.max(activeVersion.name.length + 2, 8)"
              :aria-label="t('dialog.subscribeEdit.versionName')"
              @blur="finishEditVersionName"
              @keyup.enter="finishEditVersionName"
              @keydown.esc.stop="cancelEditVersionName"
            /><span
              v-else
              class="text-primary version-name-label"
              role="button"
              tabindex="0"
              @click="startEditVersionName"
              @keydown.enter="startEditVersionName"
              >{{ activeVersion.name }}<VIcon icon="mdi-pencil" size="12" class="version-name-edit-icon" /><VTooltip
                activator="parent"
                location="top"
                >{{ t('dialog.subscribeEdit.versionNameHint') }}</VTooltip
              ></span
            >
          </template>
        </VCardSubtitle>
        <VCardSubtitle v-else>
          {{ props.type }}
        </VCardSubtitle>
      </VCardItem>
      <VDivider />
      <VCardText class="mp-dialog-body">
        <VForm ref="subscribeFormRef" @submit.prevent="() => {}">
          <div class="mp-segmented-bar mb-4">
            <VTabs v-model="activeTab" density="compact" class="mp-segmented-tabs">
              <VTab value="basic" :ripple="false">
                {{ t('dialog.subscribeEdit.tabs.basic') }}
              </VTab>
              <VTab value="advance" :ripple="false">
                {{ t('dialog.subscribeEdit.tabs.advance') }}
              </VTab>
            </VTabs>
          </div>

          <VWindow v-model="activeTab" class="disable-tab-transition" :touch="false">
            <VWindowItem value="basic">
              <div class="mp-form-sections">
                <!-- 基础匹配信息 -->
                <section v-if="!props.default" class="mp-form-section">
                  <VRow class="mp-form-grid">
                    <VCol cols="12">
                      <VTextField
                        v-model="subscribeForm.keyword"
                        :label="t('dialog.subscribeEdit.searchKeyword')"
                        :hint="t('dialog.subscribeEdit.searchKeywordHint')"
                        prepend-inner-icon="mdi-magnify"
                      />
                    </VCol>
                    <VCol v-if="subscribeForm.type === '电视剧'" cols="12" sm="6">
                      <VTextField
                        v-model="subscribeForm.total_episode"
                        :label="t('dialog.subscribeEdit.totalEpisode')"
                        :rules="[optionalNumberValidator]"
                        :hint="t('dialog.subscribeEdit.totalEpisodeHint')"
                        prepend-inner-icon="mdi-playlist-play"
                      />
                    </VCol>
                    <VCol v-if="subscribeForm.type === '电视剧'" cols="12" sm="6">
                      <VTextField
                        v-model="subscribeForm.start_episode"
                        :label="t('dialog.subscribeEdit.startEpisode')"
                        :rules="[optionalNumberValidator]"
                        :hint="t('dialog.subscribeEdit.startEpisodeHint')"
                        prepend-inner-icon="mdi-play-circle-outline"
                      />
                    </VCol>
                  </VRow>
                </section>

                <!-- 过滤与质量规则 -->
                <section class="mp-form-section">
                  <VRow class="mp-form-grid">
                    <VCol cols="12" sm="4">
                      <VAutocomplete
                        v-model="subscribeForm.quality"
                        :label="t('dialog.subscribeEdit.quality')"
                        :items="qualityOptions"
                        :hint="t('dialog.subscribeEdit.qualityHint')"
                        prepend-inner-icon="mdi-quality-high"
                      />
                    </VCol>
                    <VCol cols="12" sm="4">
                      <VAutocomplete
                        v-model="subscribeForm.resolution"
                        :label="t('dialog.subscribeEdit.resolution')"
                        :items="resolutionOptions"
                        :hint="t('dialog.subscribeEdit.resolutionHint')"
                        prepend-inner-icon="mdi-monitor"
                      />
                    </VCol>
                    <VCol cols="12" sm="4">
                      <VAutocomplete
                        v-model="subscribeForm.effect"
                        :label="t('dialog.subscribeEdit.effect')"
                        :items="effectOptions"
                        :hint="t('dialog.subscribeEdit.effectHint')"
                        prepend-inner-icon="mdi-auto-fix"
                      />
                    </VCol>
                  </VRow>
                </section>

                <!-- 站点、目录与下载器设置 -->
                <section class="mp-form-section">
                  <VRow class="mp-form-grid">
                    <VCol cols="12">
                      <VAutocomplete
                        v-model="subscribeForm.sites"
                        :items="selectSitesOptions"
                        chips
                        :label="t('dialog.subscribeEdit.subscribeSites')"
                        multiple
                        clearable
                        :hint="t('dialog.subscribeEdit.subscribeSitesHint')"
                        prepend-inner-icon="mdi-web"
                      />
                    </VCol>
                    <VCol cols="12" sm="6">
                      <VAutocomplete
                        v-model="subscribeForm.downloader"
                        :items="downloaderOptions"
                        :label="t('dialog.subscribeEdit.downloader')"
                        :hint="t('dialog.subscribeEdit.downloaderHint')"
                        prepend-inner-icon="mdi-download"
                      />
                    </VCol>
                    <VCol cols="12" sm="6">
                      <VCombobox
                        v-model="savePathModel"
                        :items="targetDirectories"
                        item-title="title"
                        item-value="value"
                        :custom-filter="filterDownloadDirectoryOption"
                        :label="t('dialog.subscribeEdit.savePath')"
                        :hint="t('dialog.subscribeEdit.savePathHint')"
                        prepend-inner-icon="mdi-folder"
                      >
                        <template #item="{ props: itemProps, item }">
                          <VListItem v-bind="itemProps" :title="item.raw.label" role="option" />
                        </template>
                      </VCombobox>
                    </VCol>
                  </VRow>
                </section>

                <!-- 洗版与检索策略紧凑开关组 -->
                <section class="mp-form-section">
                  <div class="mp-settings-card">
                    <div class="mp-setting-row" :title="t('dialog.subscribeEdit.bestVersionHint')">
                      <VSwitch
                        v-model="subscribeForm.best_version"
                        :label="t('dialog.subscribeEdit.bestVersion')"
                        hide-details
                        color="primary"
                        inset
                        density="compact"
                      />
                    </div>
                    <div
                      v-if="isTvSubscribe && subscribeForm.best_version"
                      class="mp-setting-row"
                      :title="t('dialog.subscribeEdit.bestVersionFullHint')"
                    >
                      <VSwitch
                        v-model="subscribeForm.best_version_full"
                        :label="t('dialog.subscribeEdit.bestVersionFull')"
                        hide-details
                        color="primary"
                        inset
                        density="compact"
                      />
                    </div>
                    <div class="mp-setting-row" :title="t('dialog.subscribeEdit.searchImdbidHint')">
                      <VSwitch
                        v-model="subscribeForm.search_imdbid"
                        :label="t('dialog.subscribeEdit.searchImdbid')"
                        hide-details
                        color="primary"
                        inset
                        density="compact"
                      />
                    </div>
                    <div
                      v-if="(props.default || versionRulesLoaded) && versionRules.length <= 1"
                      class="mp-setting-row"
                      :title="t('dialog.subscribeEdit.skipLibraryCheckHint')"
                    >
                      <VSwitch
                        v-model="subscribeForm.skip_library_check"
                        :label="t('dialog.subscribeEdit.skipLibraryCheck')"
                        hide-details
                        color="primary"
                        inset
                        density="compact"
                      />
                    </div>
                    <div
                      v-if="props.default"
                      class="mp-setting-row"
                      :title="t('dialog.subscribeEdit.showEditDialogHint')"
                    >
                      <VSwitch
                        v-model="subscribeForm.show_edit_dialog"
                        :label="t('dialog.subscribeEdit.showEditDialog')"
                        hide-details
                        color="primary"
                        inset
                        density="compact"
                      />
                    </div>
                  </div>
                </section>
              </div>
            </VWindowItem>

            <VWindowItem value="advance">
              <div class="mp-form-sections">
                <section class="mp-form-section">
                  <VRow class="mp-form-grid">
                    <VCol v-if="!props.default && activeVersion" cols="12">
                      <VTextField
                        v-model="activeVersion.release_group"
                        :label="t('dialog.subscribeEdit.releaseGroup')"
                        :hint="t('dialog.subscribeEdit.releaseGroupHint')"
                        prepend-inner-icon="mdi-account-group-outline"
                      />
                    </VCol>
                    <VCol cols="12" sm="6">
                      <VTextField
                        v-model="subscribeForm.include"
                        :label="t('dialog.subscribeEdit.include')"
                        :hint="t('dialog.subscribeEdit.includeHint')"
                        prepend-inner-icon="mdi-plus-circle-outline"
                      />
                    </VCol>
                    <VCol cols="12" sm="6">
                      <VTextField
                        v-model="subscribeForm.exclude"
                        :label="t('dialog.subscribeEdit.exclude')"
                        :hint="t('dialog.subscribeEdit.excludeHint')"
                        prepend-inner-icon="mdi-minus-circle-outline"
                      />
                    </VCol>
                    <VCol cols="12">
                      <VAutocomplete
                        v-model="subscribeForm.filter_groups"
                        :items="filterRuleGroupOptions"
                        chips
                        multiple
                        clearable
                        :label="t('dialog.subscribeEdit.filterGroups')"
                        :hint="t('dialog.subscribeEdit.filterGroupsHint')"
                        prepend-inner-icon="mdi-filter"
                      />
                    </VCol>
                    <VCol v-if="!props.default && subscribeForm.type === '电视剧'" cols="12" sm="6">
                      <VAutocomplete
                        v-model="subscribeForm.episode_group"
                        :items="episodeGroupOptions"
                        :item-props="episodeGroupItemProps"
                        :label="t('dialog.subscribeEdit.episodeGroup')"
                        :hint="t('dialog.subscribeEdit.episodeGroupHint')"
                        prepend-inner-icon="mdi-view-list"
                      />
                    </VCol>
                    <VCol v-if="!props.default && subscribeForm.type === '电视剧'" cols="12" sm="6">
                      <VAutocomplete
                        v-model="subscribeForm.season"
                        :items="seasonItems"
                        :label="t('dialog.subscribeEdit.season')"
                        :hint="t('dialog.subscribeEdit.seasonHint')"
                        prepend-inner-icon="mdi-calendar"
                      />
                    </VCol>
                    <VCol v-if="!props.default" cols="12">
                      <VTextarea
                        v-model="subscribeForm.custom_words"
                        :label="t('dialog.subscribeEdit.customWords')"
                        :hint="t('dialog.subscribeEdit.customWordsHint')"
                        rows="3"
                        auto-grow
                        :placeholder="t('dialog.subscribeEdit.customWordsPlaceholder')"
                        prepend-inner-icon="mdi-text"
                      />
                    </VCol>
                  </VRow>
                </section>
              </div>
            </VWindowItem>
          </VWindow>
        </VForm>
      </VCardText>
      <VDivider />
      <VCardActions class="app-dialog-actions mp-dialog-footer">
        <VBtn
          v-if="!props.default"
          color="error"
          variant="tonal"
          size="small"
          :loading="deleting"
          :disabled="saving || deleting"
          @click="removeSubscribe"
        >
          {{ t('dialog.subscribeEdit.cancelSubscribe') }}
        </VBtn>
        <VSpacer />
        <VBtn color="default" variant="text" size="small" :disabled="saving || deleting" @click="emit('close')">
          {{ t('common.cancel') }}
        </VBtn>
        <VBtn
          color="primary"
          variant="flat"
          size="small"
          class="px-4"
          :loading="saving"
          :disabled="saving || deleting"
          @click="props.default ? saveDefaultSubscribeConfig() : updateSubscribeInfo()"
        >
          {{ t('dialog.subscribeEdit.save') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped>
.mp-dialog-header {
  padding-block: 14px;
  padding-inline: 22px 48px;
}

.mp-dialog-body {
  padding: 18px 22px !important;
}

.mp-dialog-footer {
  gap: 8px;
  padding: 10px 20px !important;
}

.mp-form-sections {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.mp-form-grid {
  row-gap: 6px;
}

.mp-segmented-bar {
  display: flex;
  align-items: center;
}

.mp-segmented-tabs {
  display: inline-flex;
  border: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.1));
  border-radius: 8px;
  background: var(--mp-item-bg, rgba(var(--v-theme-on-surface), 0.04));
  block-size: 36px !important;
  inline-size: fit-content;
  max-inline-size: 100%;
  min-block-size: 36px !important;
  padding: 3px;

  :deep(.v-slide-group__container),
  :deep(.v-slide-group__content) {
    align-items: center;
    gap: 2px;
  }

  :deep(.v-tab__slider) {
    display: none !important;
  }

  :deep(.v-tab) {
    border-radius: 6px !important;
    block-size: 28px !important;
    color: rgba(var(--v-theme-on-surface), 0.64);
    font-size: 0.8125rem;
    font-weight: 500;
    letter-spacing: 0.01em;
    min-block-size: 28px !important;
    min-inline-size: 84px;
    padding-inline: 16px;
    text-transform: none;
    transition:
      background-color 0.16s ease,
      color 0.16s ease,
      box-shadow 0.16s ease;
  }

  :deep(.v-tab--selected) {
    background: rgb(var(--v-theme-surface));
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.08),
      0 0 0 1px var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.08));
    color: rgb(var(--v-theme-on-surface)) !important;
    font-weight: 600;
  }
}

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

@media (max-width: 599.98px) {
  .mp-dialog-body {
    padding: 16px !important;
  }
}
</style>
