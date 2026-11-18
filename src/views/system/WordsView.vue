<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api from '@/api'
import { useI18n } from '@/composables/useChineseText'
import { useConfirm } from '@/composables/useConfirm'
import { useTheme } from 'vuetify'
import { configureAceEditorPadding } from '@/utils/aceEditor'
import type { Ace } from 'ace-builds'
import type { ApiResponse } from '@/api/types'

const { t } = useI18n()
const $toast = useToast()
const createConfirm = useConfirm()
const { global: globalTheme } = useTheme()

const WORDS_LINE_NUMBERS_STORAGE_KEY = 'MP_WORDS_SHOW_LINE_NUMBERS'
const WORDS_SYNTAX_HIGHLIGHTING_STORAGE_KEY = 'MP_WORDS_SYNTAX_HIGHLIGHTING'

type TextSectionKey = 'identifiers' | 'releaseGroups' | 'customization' | 'excludeWords'
type WordSectionKey = TextSectionKey | 'sync'

interface WordSectionDefinition {
  color: string
  description: string
  icon: string
  key: WordSectionKey
  shortTitle: string
  title: string
}

interface TextSectionSetting {
  endpoint: string
  failedMessage: string
  successMessage: string
}

const customIdentifiers = ref('')
const customReleaseGroups = ref('')
const customization = ref('')
const transferExcludeWords = ref('')
const activeSection = ref<WordSectionKey>('identifiers')
const expandedHelp = ref<string | null>(null)
const saving = ref(false)
const showLineNumbers = ref(localStorage.getItem(WORDS_LINE_NUMBERS_STORAGE_KEY) === 'true')
const showSyntaxHighlighting = ref(localStorage.getItem(WORDS_SYNTAX_HIGHLIGHTING_STORAGE_KEY) === 'true')

interface WordListModeConfig {
  path: 'ace/mode/word_list'
  syntax: boolean
}

const aceEditor = shallowRef<Ace.Editor | null>(null)

function onAceInit(editor: Ace.Editor) {
  aceEditor.value = editor
  configureAceEditorPadding(editor)
  applyWordListSyntax()
}

function applyWordListSyntax() {
  if (!aceEditor.value) return
  const mode: WordListModeConfig = {
    path: 'ace/mode/word_list',
    syntax: showSyntaxHighlighting.value,
  }
  aceEditor.value.session.setMode(mode as unknown as Ace.SyntaxMode)
}
const textEditorTheme = computed(() => (globalTheme.current.value.dark ? 'github_dark' : 'github_light_default'))
const textEditorOptions = computed(() => ({
  fontSize: 13,
  highlightActiveLine: false,
  scrollPastEnd: 0,
  showFoldWidgets: false,
  showGutter: showLineNumbers.value,
  showLineNumbers: showLineNumbers.value,
  showPrintMargin: false,
  tabSize: 2,
}))

watch(showLineNumbers, value => {
  localStorage.setItem(WORDS_LINE_NUMBERS_STORAGE_KEY, String(value))
})

watch(showSyntaxHighlighting, value => {
  localStorage.setItem(WORDS_SYNTAX_HIGHLIGHTING_STORAGE_KEY, String(value))
})

watch(showSyntaxHighlighting, applyWordListSyntax)

const savedTextValues = reactive<Record<TextSectionKey, string>>({
  identifiers: '',
  releaseGroups: '',
  customization: '',
  excludeWords: '',
})

const textSectionModels: Record<TextSectionKey, typeof customIdentifiers> = {
  identifiers: customIdentifiers,
  releaseGroups: customReleaseGroups,
  customization,
  excludeWords: transferExcludeWords,
}

const textSectionSettings = computed<Record<TextSectionKey, TextSectionSetting>>(() => ({
  identifiers: {
    endpoint: 'system/setting/CustomIdentifiers',
    failedMessage: t('setting.words.identifierSaveFailed'),
    successMessage: t('setting.words.identifierSaveSuccess'),
  },
  releaseGroups: {
    endpoint: 'system/setting/CustomReleaseGroups',
    failedMessage: t('setting.words.releaseGroupSaveFailed'),
    successMessage: t('setting.words.releaseGroupSaveSuccess'),
  },
  customization: {
    endpoint: 'system/setting/Customization',
    failedMessage: t('setting.words.customizationSaveFailed'),
    successMessage: t('setting.words.customizationSaveSuccess'),
  },
  excludeWords: {
    endpoint: 'system/setting/TransferExcludeWords',
    failedMessage: t('setting.words.excludeWordsSaveFailed'),
    successMessage: t('setting.words.excludeWordsSaveSuccess'),
  },
}))

const wordSections = computed<WordSectionDefinition[]>(() => [
  {
    color: 'primary',
    description: t('setting.words.identifiersDesc'),
    icon: 'mdi-tag-outline',
    key: 'identifiers',
    shortTitle: t('setting.words.identifiersShort'),
    title: t('setting.words.customIdentifiers'),
  },
  {
    color: 'secondary',
    description: t('setting.words.releaseGroupsDesc'),
    icon: 'mdi-account-group-outline',
    key: 'releaseGroups',
    shortTitle: t('setting.words.releaseGroupsShort'),
    title: t('setting.words.customReleaseGroups'),
  },
  {
    color: 'info',
    description: t('setting.words.customizationDesc'),
    icon: 'mdi-code-braces',
    key: 'customization',
    shortTitle: t('setting.words.customizationShort'),
    title: t('setting.words.customization'),
  },
  {
    color: 'success',
    description: t('setting.words.excludeWordsDesc'),
    icon: 'mdi-shield-off-outline',
    key: 'excludeWords',
    shortTitle: t('setting.words.excludeWordsShort'),
    title: t('setting.words.transferExcludeWords'),
  },
  {
    color: 'warning',
    description: t('setting.words.syncDesc'),
    icon: 'mdi-cloud-sync-outline',
    key: 'sync',
    shortTitle: t('setting.words.syncShort'),
    title: t('setting.words.syncTitle'),
  },
])

const activeSectionDefinition = computed(
  () => wordSections.value.find(section => section.key === activeSection.value) ?? wordSections.value[0],
)

const isTextSection = computed(() => activeSection.value !== 'sync')

const activeTextValue = computed({
  get: () => (isTextSection.value ? textSectionModels[activeSection.value as TextSectionKey].value : ''),
  set: value => {
    if (isTextSection.value) textSectionModels[activeSection.value as TextSectionKey].value = value
  },
})

const activeTextPlaceholder = computed(() => {
  switch (activeSection.value) {
    case 'identifiers':
      return t('setting.words.identifiersPlaceholder')
    case 'releaseGroups':
      return t('setting.words.releaseGroupsPlaceholder')
    case 'customization':
      return t('setting.words.customizationPlaceholder')
    case 'excludeWords':
      return t('setting.words.excludeWordsPlaceholder')
    default:
      return ''
  }
})

const activeTextHint = computed(() => {
  switch (activeSection.value) {
    case 'identifiers':
      return t('setting.words.identifiersHint')
    case 'releaseGroups':
      return t('setting.words.releaseGroupsHint')
    case 'customization':
      return t('setting.words.customizationHint')
    case 'excludeWords':
      return t('setting.words.excludeWordsHint')
    default:
      return ''
  }
})

const activeGuideTitle = computed(() =>
  activeSection.value === 'identifiers' ? t('setting.words.formatTitle') : t('setting.words.guideTitle'),
)

const activeGuideContent = computed(() =>
  activeSection.value === 'identifiers' ? t('setting.words.formatContent') : activeTextHint.value,
)

// 仅在提示内容能补充行内说明时展示折叠面板，避免捷径弹窗内重复出现相同文案。
const shouldShowGuidePanel = computed(() => activeSection.value === 'identifiers')

/** 统计多行词表中非空配置的数量。 */
function countConfiguredLines(value: string) {
  return value.split('\n').filter(line => line.trim().length > 0).length
}

/** 返回指定词表分类当前配置条目数;远程同步分类不统计词条。 */
function getSectionCount(section: WordSectionKey) {
  if (section === 'sync') return 0
  return countConfiguredLines(textSectionModels[section].value)
}

/** 判断指定词表分类是否存在未保存修改;远程同步分类设置独立保存,无脏状态。 */
function isSectionDirty(section: WordSectionKey) {
  if (section === 'sync') return false
  return textSectionModels[section].value !== savedTextValues[section]
}

const activeSectionDirty = computed(() => isSectionDirty(activeSection.value))
const activeSectionCount = computed(() => getSectionCount(activeSection.value))
const totalConfiguredEntries = computed(() =>
  wordSections.value.reduce((total, section) => total + getSectionCount(section.key), 0),
)

/** 切换当前正在编辑的词表分类，并收起帮助内容。 */
function selectSection(section: WordSectionKey) {
  activeSection.value = section
  expandedHelp.value = null
}

/** 查询一个多行词表配置，并同步其已保存快照。 */
async function queryTextSection(section: TextSectionKey) {
  try {
    const result = (await api.get(textSectionSettings.value[section].endpoint)) as ApiResponse<{ value?: string[] }>
    const value = Array.isArray(result?.data?.value) ? result.data.value.join('\n') : ''
    textSectionModels[section].value = value
    savedTextValues[section] = value
  } catch (error) {
    console.log(error)
  }
}

/** 保存一个多行词表配置，并在成功后更新已保存快照。 */
async function saveTextSection(section: TextSectionKey) {
  const setting = textSectionSettings.value[section]

  try {
    const value = textSectionModels[section].value
    const result = (await api.post(setting.endpoint, value.split('\n'))) as ApiResponse<unknown>

    if (result.success) {
      savedTextValues[section] = value
      $toast.success(setting.successMessage)
      return true
    }

    $toast.error(setting.failedMessage)
  } catch (error) {
    console.log(error)
    $toast.error(setting.failedMessage)
  }

  return false
}

/** 保存当前正在编辑的词表分类。 */
async function saveActiveSection() {
  if (saving.value) return

  saving.value = true
  try {
    await saveTextSection(activeSection.value as TextSectionKey)
  } finally {
    saving.value = false
  }
}

/** 将当前分类恢复为最近一次成功加载或保存的内容。 */
function resetActiveSection() {
  textSectionModels[activeSection.value as TextSectionKey].value =
    savedTextValues[activeSection.value as TextSectionKey]
}

// ---- 词表远程同步(多源、追加模式) ----
interface WordsSyncSource {
  url: string
  enabled: boolean
  interval_days: number
  tables: string[]
  last_sync?: string | null
  last_status?: string | null
  last_message?: string | null
}

// 远程同步内容:词表标识 -> [{ source, lines }]
type SyncedWordsMap = Record<string, Array<{ source: string; lines: string[] }>>

const syncSources = ref<WordsSyncSource[]>([])
const syncedWords = ref<SyncedWordsMap>({})
const savingSyncSources = ref(false)
const syncingUrl = ref<string | null>(null)
const syncingAll = ref(false)

const SYNC_TABLE_OPTIONS: Array<{ id: string; section: TextSectionKey }> = [
  { id: 'identifiers', section: 'identifiers' },
  { id: 'releaseGroups', section: 'releaseGroups' },
  { id: 'customization', section: 'customization' },
  { id: 'excludeWords', section: 'excludeWords' },
]

/** 指定词表的远程同步行总数。 */
function syncedCountFor(section: TextSectionKey) {
  return (syncedWords.value[section] ?? []).reduce((sum, item) => sum + item.lines.length, 0)
}

/** 指定词表的远程同步来源列表(分源展示)。 */
function syncedSourcesFor(section: TextSectionKey) {
  return syncedWords.value[section] ?? []
}

function sourceStatusText(source: WordsSyncSource) {
  if (!source.last_sync) return t('setting.words.syncNever')
  const status =
    source.last_status === 'success'
      ? t('setting.words.syncStatusSuccess')
      : source.last_status === 'skipped'
        ? t('setting.words.syncStatusSkipped')
        : t('setting.words.syncStatusPartial')
  return `${source.last_sync} · ${status}`
}

/** 加载同步源列表。 */
async function loadSyncSources() {
  try {
    const result = (await api.get('system/words/sync/status')) as ApiResponse<{ sources?: WordsSyncSource[] }>
    syncSources.value = result?.data?.sources ?? []
  } catch (error) {
    console.log(error)
  }
}

/** 加载各词表的远程同步内容(单独展示,不进编辑框)。 */
async function loadSyncedWords() {
  try {
    const result = (await api.get('system/words/synced')) as ApiResponse<SyncedWordsMap>
    syncedWords.value = result?.data ?? {}
  } catch (error) {
    console.log(error)
  }
}

/** 保存同步源列表。 */
async function saveSyncSources(showToast = true) {
  savingSyncSources.value = true
  try {
    const payload = syncSources.value.map(source => ({
      url: source.url.trim(),
      enabled: source.enabled,
      interval_days: Number(source.interval_days) || 7,
      tables: source.tables,
      last_sync: source.last_sync ?? null,
      last_status: source.last_status ?? null,
      last_message: source.last_message ?? null,
    }))
    const result = (await api.post('system/setting/WordsSyncSources', payload)) as ApiResponse<unknown>
    if (result.success) {
      const sourceUrls = new Set(payload.map(source => source.url))
      for (const section of Object.keys(syncedWords.value)) {
        syncedWords.value[section] = syncedWords.value[section].filter(item => sourceUrls.has(item.source))
      }
      await loadSyncedWords()
      if (showToast) $toast.success(t('setting.words.syncSettingsSaved'))
      return true
    } else {
      $toast.error(result.message || t('setting.words.syncSettingsSaveFailed'))
    }
  } catch (error) {
    console.log(error)
    $toast.error(t('setting.words.syncSettingsSaveFailed'))
  } finally {
    savingSyncSources.value = false
  }
  return false
}

/** 添加一个空白同步源。 */
function addSyncSource() {
  syncSources.value.push({
    url: '',
    enabled: true,
    interval_days: 7,
    tables: SYNC_TABLE_OPTIONS.map(item => item.id),
  })
}

/** 删除同步源并保存。 */
async function removeSyncSource(index: number) {
  if (savingSyncSources.value) return
  const target = syncSources.value[index]
  if (!target) return
  if (target.url.trim()) {
    const confirmed = await createConfirm({
      type: 'warn',
      title: t('common.confirm'),
      content: `确认删除远程同步源「${target.url.trim()}」及其已同步词条？`,
    })
    if (!confirmed) return
  }
  const previousSources = [...syncSources.value]
  syncSources.value.splice(index, 1)
  if (await saveSyncSources(false)) {
    $toast.success(t('setting.words.syncSourceRemoved'))
  } else {
    syncSources.value = previousSources
  }
}

/** 先保存当前远程同步源配置，成功后再触发单源立即同步。 */
async function saveAndRunSync(source: WordsSyncSource) {
  if (await saveSyncSources(false)) {
    await runSync(source)
  }
}

/** 同步指定源(缺省全部),完成后刷新远程词表展示。 */
async function runSync(source?: WordsSyncSource) {
  if (syncingAll.value || syncingUrl.value) return
  if (source) syncingUrl.value = source.url
  else syncingAll.value = true
  try {
    const result = (await api.post('system/words/sync', null, {
      params: source ? { source_url: source.url } : {},
    })) as ApiResponse<unknown>
    if (result.success) {
      $toast.success(t('setting.words.syncSuccess', { message: result.message || '' }))
    } else {
      $toast.error(result.message || t('setting.words.syncFailed'))
    }
    await Promise.all([loadSyncSources(), loadSyncedWords()])
  } catch (error) {
    console.log(error)
    $toast.error(t('setting.words.syncFailed'))
  } finally {
    syncingUrl.value = null
    syncingAll.value = false
  }
}

onMounted(() => {
  Promise.all([
    queryTextSection('identifiers'),
    queryTextSection('releaseGroups'),
    queryTextSection('customization'),
    queryTextSection('excludeWords'),
    loadSyncSources(),
    loadSyncedWords(),
  ])
})
</script>

<template>
  <div class="words-view">
    <header class="words-summary d-none d-md-flex">
      <span>{{ t('setting.words.summary', { sections: wordSections.length, entries: totalConfiguredEntries }) }}</span>
    </header>

    <div class="words-workspace">
      <nav class="words-sidebar d-none d-md-flex" :aria-label="t('setting.words.sectionListLabel')">
        <button
          v-for="section in wordSections"
          :key="section.key"
          type="button"
          class="words-sidebar-item"
          :class="{ 'words-sidebar-item--active': activeSection === section.key }"
          :aria-current="activeSection === section.key ? 'page' : undefined"
          @click="selectSection(section.key)"
        >
          <VAvatar :color="section.color" variant="tonal" size="34" class="words-section-icon">
            <VIcon :icon="section.icon" size="18" />
          </VAvatar>

          <span class="words-sidebar-copy">
            <strong>{{ section.title }}</strong>
            <small>{{ section.description }}</small>
          </span>

          <span class="words-sidebar-state">
            <small>
              {{
                section.key === 'sync'
                  ? syncSources.length === 0
                    ? t('setting.words.syncAutoOff')
                    : t('setting.words.syncSourcesSummary', {
                        total: syncSources.length,
                        enabled: syncSources.filter(s => s.enabled).length,
                      })
                  : t('setting.words.entryCount', { count: getSectionCount(section.key) })
              }}
            </small>
            <VIcon
              :icon="isSectionDirty(section.key) ? 'mdi-circle-medium' : 'mdi-check'"
              :color="isSectionDirty(section.key) ? 'warning' : 'success'"
              size="15"
            />
          </span>
        </button>

        <div class="words-sidebar-hint">
          <VIcon icon="mdi-information-outline" size="15" />
          <span>{{ t('setting.words.switchHint') }}</span>
        </div>
      </nav>

      <nav class="words-mobile-tabs d-md-none" :aria-label="t('setting.words.sectionListLabel')">
        <button
          v-for="section in wordSections"
          :key="section.key"
          type="button"
          class="words-mobile-tab"
          :class="{ 'words-mobile-tab--active': activeSection === section.key }"
          :aria-current="activeSection === section.key ? 'page' : undefined"
          @click="selectSection(section.key)"
        >
          <span class="words-mobile-tab-icon">
            <VIcon :icon="section.icon" size="18" />
            <span v-if="isSectionDirty(section.key)" class="words-dirty-dot" />
          </span>
          <span>{{ section.shortTitle }}</span>
        </button>
      </nav>

      <section class="words-editor">
        <header class="words-editor-header">
          <div class="words-editor-heading">
            <h2>{{ activeSectionDefinition.title }}</h2>
            <p>{{ activeSectionDefinition.description }}</p>
          </div>

          <div class="words-save-state" :class="{ 'words-save-state--dirty': activeSectionDirty }">
            <VIcon :icon="activeSectionDirty ? 'mdi-circle-medium' : 'mdi-check-circle-outline'" size="14" />
            <span>{{ activeSectionDirty ? t('setting.words.unsaved') : t('setting.words.saved') }}</span>
          </div>
        </header>

        <div class="words-editor-scroll">
          <template v-if="isTextSection">
            <div class="words-field-meta">
              <strong>{{ t('setting.words.listLabel') }}</strong>
              <div class="words-field-actions">
                <span class="words-entry-badge">{{
                  t('setting.words.entryCount', { count: activeSectionCount })
                }}</span>
                <VSwitch
                  v-if="activeSection === 'identifiers'"
                  v-model="showLineNumbers"
                  class="words-editor-switch"
                  color="primary"
                  density="compact"
                  hide-details
                  :label="t('setting.words.lineNumbers')"
                  :mobile-layout="false"
                />
                <VSwitch
                  v-if="activeSection === 'identifiers'"
                  v-model="showSyntaxHighlighting"
                  class="words-editor-switch"
                  color="primary"
                  density="compact"
                  hide-details
                  :label="t('setting.words.syntaxHighlighting')"
                  :mobile-layout="false"
                />
              </div>
            </div>

            <VAceEditor
              v-if="activeSection === 'identifiers'"
              v-model:value="activeTextValue"
              lang="word_list"
              :theme="textEditorTheme"
              :options="textEditorOptions"
              :placeholder="activeTextPlaceholder"
              :print-margin="false"
              wrap
              class="words-text-editor"
              @init="onAceInit"
            />
            <VTextarea
              v-else
              v-model="activeTextValue"
              class="words-textarea"
              :placeholder="activeTextPlaceholder"
              variant="outlined"
              rows="11"
              hide-details
              spellcheck="false"
            />

            <div class="words-inline-hint">
              <VIcon icon="mdi-information-outline" size="15" />
              <span>{{ activeTextHint }}</span>
            </div>

            <div v-if="syncedCountFor(activeSection as TextSectionKey) > 0" class="words-remote-block">
              <div class="words-remote-header">
                <VIcon icon="mdi-cloud-sync-outline" size="15" />
                <span>
                  {{
                    t('setting.words.syncRemoteSummary', {
                      count: syncedCountFor(activeSection as TextSectionKey),
                      sources: syncedSourcesFor(activeSection as TextSectionKey).length,
                    })
                  }}
                </span>
              </div>
              <div
                v-for="item in syncedSourcesFor(activeSection as TextSectionKey)"
                :key="item.source"
                class="words-remote-source"
              >
                <div class="words-remote-source-url" :title="item.source">{{ item.source }}</div>
                <pre class="words-remote-lines">{{ item.lines.join('\n') }}</pre>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="words-sync-panel">
              <div class="words-sync-toolbar">
                <VBtn size="small" variant="outlined" prepend-icon="mdi-plus" @click="addSyncSource">
                  {{ t('setting.words.syncAddSource') }}
                </VBtn>
                <VBtn
                  size="small"
                  color="primary"
                  variant="flat"
                  prepend-icon="mdi-sync"
                  :loading="syncingAll"
                  :disabled="syncSources.length === 0"
                  @click="runSync()"
                >
                  {{ t('setting.words.syncAll') }}
                </VBtn>
              </div>

              <div v-if="syncSources.length === 0" class="words-sync-empty">
                <VIcon icon="mdi-cloud-sync-outline" size="28" />
                <span>{{ t('setting.words.syncNoSource') }}</span>
              </div>

              <article v-for="(source, index) in syncSources" :key="index" class="words-sync-source">
                <div class="words-sync-source-head">
                  <VTextField
                    v-model="source.url"
                    class="words-sync-source-url"
                    density="compact"
                    variant="outlined"
                    hide-details="auto"
                    :label="t('setting.words.syncUrl')"
                    :placeholder="t('setting.words.syncUrlPlaceholder')"
                  />
                  <VBtn
                    icon
                    size="small"
                    variant="text"
                    color="error"
                    class="words-icon-trigger"
                    :disabled="savingSyncSources"
                    :aria-label="t('common.delete')"
                    @click.stop="removeSyncSource(index)"
                  >
                    <VIcon icon="mdi-delete-outline" size="16" />
                    <VTooltip activator="parent" location="top">{{ t('common.delete') }}</VTooltip>
                  </VBtn>
                </div>

                <div class="words-sync-source-row">
                  <div class="mp-switch-card words-sync-switch-card">
                    <VSwitch
                      v-model="source.enabled"
                      class="words-sync-enabled"
                      color="primary"
                      density="compact"
                      hide-details
                      inset
                      :mobile-layout="false"
                      :label="t('setting.words.syncEnabled')"
                    />
                  </div>
                  <VTextField
                    v-model.number="source.interval_days"
                    class="words-sync-interval"
                    type="number"
                    min="1"
                    density="compact"
                    variant="outlined"
                    hide-details
                    :mobile-layout="false"
                    :label="t('setting.words.syncIntervalDays')"
                  />
                </div>

                <div class="words-sync-source-tables">
                  <span class="words-sync-tables-label">{{ t('setting.words.syncTables') }}</span>
                  <VChip
                    v-for="option in SYNC_TABLE_OPTIONS"
                    :key="option.id"
                    class="words-sync-table-chip"
                    :class="{ 'words-sync-table-chip--active': source.tables.includes(option.id) }"
                    variant="outlined"
                    size="small"
                    @click="
                      source.tables.includes(option.id)
                        ? source.tables.splice(source.tables.indexOf(option.id), 1)
                        : source.tables.push(option.id)
                    "
                  >
                    {{ wordSections.find(s => s.key === option.section)?.shortTitle }}
                  </VChip>
                </div>

                <div class="words-sync-source-actions">
                  <VBtn
                    size="small"
                    variant="tonal"
                    prepend-icon="mdi-content-save"
                    :loading="savingSyncSources"
                    @click="saveSyncSources()"
                  >
                    {{ t('setting.words.syncSaveSettings') }}
                  </VBtn>
                  <VBtn
                    size="small"
                    color="primary"
                    variant="flat"
                    prepend-icon="mdi-sync"
                    :loading="syncingUrl === source.url"
                    :disabled="!source.url || source.tables.length === 0 || savingSyncSources"
                    @click="saveAndRunSync(source)"
                  >
                    {{ t('setting.words.syncNow') }}
                  </VBtn>
                  <span class="words-sync-last">
                    {{ t('setting.words.syncLastSync') }}: {{ sourceStatusText(source) }}
                  </span>
                </div>
              </article>

              <div class="words-inline-hint">
                <VIcon icon="mdi-information-outline" size="15" />
                <span>{{ t('setting.words.syncFileHint') }}</span>
              </div>
            </div>
          </template>

          <VExpansionPanels
            v-if="shouldShowGuidePanel"
            v-model="expandedHelp"
            class="words-help-panels"
            variant="accordion"
          >
            <VExpansionPanel value="guide" elevation="0">
              <VExpansionPanelTitle>
                <template #default>
                  <span class="words-help-title">
                    <VIcon icon="mdi-information-outline" color="primary" size="16" />
                    {{ activeGuideTitle }}
                  </span>
                </template>
              </VExpansionPanelTitle>
              <VExpansionPanelText>
                <div class="words-help-content">{{ activeGuideContent }}</div>
              </VExpansionPanelText>
            </VExpansionPanel>
          </VExpansionPanels>
        </div>

        <footer v-if="activeSection !== 'sync'" class="words-editor-footer">
          <div class="words-footer-state" :class="{ 'words-footer-state--dirty': activeSectionDirty }">
            <VIcon :icon="activeSectionDirty ? 'mdi-circle-medium' : 'mdi-check-circle-outline'" size="15" />
            <span>{{ activeSectionDirty ? t('setting.words.unsaved') : t('setting.words.saved') }}</span>
          </div>

          <div class="words-footer-actions">
            <VBtn
              size="small"
              variant="text"
              :disabled="!activeSectionDirty || saving"
              prepend-icon="mdi-restore"
              @click="resetActiveSection"
            >
              {{ t('common.reset') }}
            </VBtn>
            <VBtn
              size="small"
              color="primary"
              variant="flat"
              :loading="saving"
              prepend-icon="mdi-content-save"
              @click="saveActiveSection"
            >
              {{ t('setting.words.saveChanges') }}
            </VBtn>
          </div>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.words-view {
  --words-surface-background: var(--app-grouped-list-background);
  --words-surface-border: 1px solid var(--mp-border-card);
  --words-surface-radius: 10px;
  --words-separator-color: var(--mp-border-subtle);
  --words-hover-background: var(--app-grouped-list-hover-background);
  --words-active-background: var(--app-grouped-list-active-background);

  display: flex;
  min-block-size: 0;
  flex-direction: column;
  background: transparent;
}

.words-summary {
  align-items: center;
  min-block-size: 34px;
  padding: 6px 16px;
  border-block-end: 1px solid var(--words-separator-color);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.words-workspace {
  display: grid;
  overflow: hidden;
  min-block-size: 30rem;
  block-size: min(40rem, calc(100dvh - 10rem));
  border: var(--words-surface-border);
  border-radius: var(--words-surface-radius);
  background: var(--words-surface-background);
  grid-template-columns: 16.25rem minmax(0, 1fr);
}

.words-sidebar {
  display: flex;
  min-block-size: 0;
  border-inline-end: 1px solid var(--words-separator-color);
  flex-direction: column;
  gap: 4px;
  padding: 8px;
}

.words-sidebar-item {
  display: grid;
  align-items: center;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  gap: 10px;
  grid-template-columns: 34px minmax(0, 1fr) max-content;
  padding: 9px 10px;
  text-align: start;
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease;
}

.words-sidebar-item:hover,
.words-sidebar-item:focus-visible {
  background: var(--words-hover-background);
  outline: none;
}

.words-sidebar-item--active {
  border-color: var(--mp-border-subtle);
  background: var(--words-active-background);
  color: rgb(var(--v-theme-on-surface));
  font-weight: 600;
}

.words-section-icon {
  flex: 0 0 auto;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 8px !important;
}

.words-sidebar-copy {
  display: flex;
  min-inline-size: 0;
  flex-direction: column;
  gap: 2px;
}

.words-sidebar-copy strong {
  overflow: hidden;
  color: rgb(var(--v-theme-on-surface));
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.words-sidebar-copy small {
  display: -webkit-box;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11.5px;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.words-sidebar-state {
  display: flex;
  align-items: flex-end;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  flex-direction: column;
  gap: 3px;
}

.words-sidebar-state small {
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.words-sidebar-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-block-start: auto;
  padding: 10px 8px 4px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11.5px;
  line-height: 1.4;
}

.words-editor {
  display: flex;
  overflow: hidden;
  min-block-size: 0;
  flex: 1 1 auto;
  flex-direction: column;
}

.words-editor-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 13px;
  padding: 14px 18px 10px;
}

.words-editor-heading {
  min-inline-size: 0;
}

.words-editor-heading h2 {
  margin: 0;
  color: rgb(var(--v-theme-on-surface));
  font-size: 15.5px;
  font-weight: 600;
  line-height: 1.35;
}

.words-editor-heading p {
  margin: 4px 0 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  line-height: 1.45;
}

.words-save-state,
.words-footer-state {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 6px;
  background-color: var(--mp-item-bg);
  block-size: 22px;
  color: rgb(var(--v-theme-success));
  font-size: 11.5px;
  font-weight: 600;
  gap: 4px;
  padding-inline: 8px;
  white-space: nowrap;
}

.words-save-state--dirty,
.words-footer-state--dirty {
  border-color: rgba(var(--v-theme-warning), 0.32);
  background-color: rgba(var(--v-theme-warning), 0.08);
  color: rgb(var(--v-theme-warning));
}

.words-editor-scroll {
  overflow: auto;
  min-block-size: 0;
  flex: 1 1 auto;
  padding: 0 18px 14px;
}

.words-field-meta {
  display: flex;
  min-block-size: 34px;
  align-items: center;
  justify-content: space-between;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 8px;
  background: var(--mp-field-bg);
  gap: 10px;
  margin-block-end: 8px;
  padding: 4px 10px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
}

.words-field-meta strong {
  color: rgb(var(--v-theme-on-surface));
  font-size: 12.5px;
  font-weight: 600;
}

.words-entry-badge {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 5px;
  background-color: var(--mp-item-bg);
  block-size: 20px;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  padding-inline: 7px;
}

.words-field-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

@media (width <= 599.98px) {
  .words-field-meta {
    flex-wrap: wrap;
    gap: 6px 10px;
  }

  .words-field-actions {
    justify-content: flex-start;
    gap: 4px 10px;
  }
}

.words-editor-switch {
  flex: 0 0 auto;
}

.words-editor-switch :deep(.v-label) {
  font-size: 12px;
}

.words-textarea :deep(textarea) {
  font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 13px;
  line-height: 1.55;
}

.words-textarea :deep(.v-field) {
  border-radius: 10px;
  background: var(--mp-field-bg);
}

.words-text-editor {
  --words-token-block: #af00db;
  --words-token-replaced: #001080;
  --words-token-replacement: #a31515;
  --words-token-parameter-syntax: #795e26;
  --words-token-parameter-key: #0451a5;
  --words-token-parameter-value: #098658;
  --words-token-front: #267f99;
  --words-token-back: #795e26;
  --words-token-offset: #098658;
  --words-token-comment: #008000;
  --words-token-operator: #000;

  overflow: hidden;
  min-block-size: 12rem;
  block-size: 18.8rem;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  contain: paint;
  overscroll-behavior: contain;
  resize: vertical;
  transform: translateZ(0);
}

.words-text-editor.ace-github-dark {
  --words-token-block: #c586c0;
  --words-token-replaced: #9cdcfe;
  --words-token-replacement: #ce9178;
  --words-token-parameter-syntax: #dcdcaa;
  --words-token-parameter-key: #9cdcfe;
  --words-token-parameter-value: #b5cea8;
  --words-token-front: #4ec9b0;
  --words-token-back: #dcdcaa;
  --words-token-offset: #b5cea8;
  --words-token-comment: #6a9955;
  --words-token-operator: #d4d4d4;
}

.words-text-editor :deep(.ace_scroller),
.words-text-editor :deep(.ace_content),
.words-text-editor :deep(.ace_text-layer) {
  transform: translateZ(0);
  will-change: transform;
}

.words-text-editor :deep(.ace_comment) {
  color: var(--words-token-comment) !important;
  font-style: normal;
}

.words-text-editor :deep(.ace_gutter-layer) {
  text-align: start;
}

.words-text-editor :deep(.ace_gutter-cell) {
  padding-inline: 0.35rem 0.25rem;
}

.words-text-editor :deep(.ace_word_list_block) {
  color: var(--words-token-block);
}

.words-text-editor :deep(.ace_word_list_replaced) {
  color: var(--words-token-replaced);
}

.words-text-editor :deep(.ace_word_list_replacement) {
  color: var(--words-token-replacement);
}

.words-text-editor :deep(.ace_word_list_parameter_syntax) {
  color: var(--words-token-parameter-syntax);
}

.words-text-editor :deep(.ace_word_list_parameter_key) {
  color: var(--words-token-parameter-key);
}

.words-text-editor :deep(.ace_word_list_parameter_value) {
  color: var(--words-token-parameter-value);
}

.words-text-editor :deep(.ace_invalid.ace_word-list) {
  color: #f44336 !important;
  background-color: transparent !important;
  text-decoration: underline wavy #f44336 !important;
  text-underline-offset: 0.12em;
}

.words-text-editor :deep(.ace_word_list_front) {
  color: var(--words-token-front);
}

.words-text-editor :deep(.ace_word_list_back) {
  color: var(--words-token-back);
}

.words-text-editor :deep(.ace_word_list_offset) {
  color: var(--words-token-offset);
}

.words-text-editor :deep(.ace_keyword.ace_operator.ace_word-list) {
  color: var(--words-token-operator);
}

.words-inline-hint {
  display: flex;
  align-items: flex-start;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  gap: 6px;
  line-height: 1.5;
  margin-block-start: 8px;
}

.words-remote-block {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: var(--mp-field-bg);
  gap: 8px;
  margin-block-start: 10px;
  padding: 10px 13px;
}

.words-remote-header {
  display: flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  font-weight: 500;
  gap: 6px;
}

.words-remote-source-url {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.words-remote-lines {
  overflow: auto;
  max-block-size: 9rem;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 8px;
  background: var(--mp-item-bg);
  font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  margin-block: 4px 6px;
  margin-inline: 0;
  padding: 8px 10px;
  white-space: pre-wrap;
  word-break: break-all;
}

.words-sync-panel {
  display: flex;
  flex-direction: column;
  gap: 13px;
  max-inline-size: 38rem;
  padding: 4px 0;
}

.words-sync-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.words-sync-empty {
  display: flex;
  min-block-size: 7rem;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--mp-border-card);
  border-radius: 10px;
  background: var(--mp-field-bg);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  flex-direction: column;
  font-size: 12.5px;
  gap: 8px;
}

.words-sync-source {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: var(--mp-field-bg);
  gap: 10px;
  padding: 13px;
}

.words-sync-source-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.words-sync-source-url {
  flex: 1 1 auto;
}

.words-icon-trigger {
  flex-shrink: 0;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 7px !important;
  background: var(--mp-item-bg);
  block-size: 28px !important;
  inline-size: 28px !important;
  min-inline-size: 28px !important;
}

.words-sync-source-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.words-sync-switch-card {
  flex: 0 0 auto;
  min-block-size: 32px;
  padding-block: 3px;
}

.words-sync-enabled {
  flex: 0 0 auto;
}

.words-sync-interval {
  flex: 0 1 9.5rem;
  min-inline-size: 7.5rem;
}

.words-sync-interval :deep(input[type='number']::-webkit-outer-spin-button),
.words-sync-interval :deep(input[type='number']::-webkit-inner-spin-button) {
  margin: 0;
  -webkit-appearance: none;
}

.words-sync-interval :deep(input[type='number']) {
  appearance: textfield;
}

.words-sync-source-tables {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.words-sync-tables-label {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
}

.words-sync-table-chip {
  block-size: 22px;
  cursor: pointer;
  font-size: 11.5px;
}

.words-sync-table-chip--active {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.14);
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}

.words-sync-source-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.words-sync-last {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.words-help-panels {
  min-inline-size: 0;
  margin-block-start: 10px;
}

.words-help-panels :deep(.v-expansion-panel) {
  overflow: hidden;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px !important;
  background: var(--mp-field-bg);
}

.words-help-panels :deep(.v-expansion-panel-title) {
  min-block-size: 38px;
  padding: 8px 13px;
}

.words-help-title {
  display: flex;
  align-items: center;
  color: rgb(var(--v-theme-primary));
  font-size: 12.5px;
  font-weight: 600;
  gap: 6px;
}

.words-help-content {
  min-inline-size: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  line-height: 1.65;
  overflow-wrap: anywhere;
  white-space: pre-line;
  word-break: break-word;
}

.words-editor-footer {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  min-block-size: 48px;
  border-block-start: 1px solid var(--words-separator-color);
  background: var(--words-surface-background);
  gap: 10px;
  padding: 8px 18px;
}

.words-footer-state {
  display: none;
}

.words-footer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-inline-start: auto;
}

@media (width <= 959.98px) {
  .words-view {
    flex: 1 1 auto;
    block-size: 100%;
    min-block-size: 0;
  }

  .words-workspace {
    display: flex;
    overflow: hidden;
    min-block-size: 0;
    block-size: 100%;
    border: 0;
    border-radius: 0;
    flex-direction: column;
  }

  .words-mobile-tabs {
    display: flex;
    overflow-x: auto;
    flex: 0 0 auto;
    border-block-end: 1px solid var(--words-separator-color);
    background: var(--words-surface-background);
    scrollbar-width: none;
  }

  .words-mobile-tabs::-webkit-scrollbar {
    display: none;
  }

  .words-mobile-tab {
    position: relative;
    display: flex;
    min-inline-size: 4.5rem;
    min-block-size: 52px;
    align-items: center;
    justify-content: center;
    border: 0;
    background: transparent;
    color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
    cursor: pointer;
    flex: 1 0 auto;
    flex-direction: column;
    font-size: 12px;
    font-weight: 500;
    gap: 4px;
    padding: 8px 8px 6px;
  }

  .words-mobile-tab::after {
    position: absolute;
    background: transparent;
    block-size: 2px;
    border-radius: 999px;
    content: '';
    inset-block-end: 0;
    inset-inline: 10px;
  }

  .words-mobile-tab--active {
    color: rgb(var(--v-theme-primary));
    font-weight: 600;
  }

  .words-mobile-tab--active::after {
    background: rgb(var(--v-theme-primary));
  }

  .words-mobile-tab-icon {
    position: relative;
    display: inline-flex;
  }

  .words-dirty-dot {
    position: absolute;
    border: 2px solid var(--words-surface-background);
    border-radius: 50%;
    background: rgb(var(--v-theme-warning));
    block-size: 8px;
    inline-size: 8px;
    inset-block-start: -2px;
    inset-inline-end: -4px;
  }

  .words-editor-header {
    padding: 13px 14px 8px;
  }

  .words-editor-heading h2 {
    font-size: 15.5px;
  }

  .words-editor-heading p {
    font-size: 12px;
  }

  .words-save-state {
    display: none;
  }

  .words-editor-scroll {
    padding: 0 14px 14px;
  }

  .words-field-meta {
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .words-field-actions {
    gap: 8px;
    inline-size: 100%;
  }

  .words-textarea :deep(.v-field__input) {
    min-block-size: 16rem;
  }

  .words-text-editor {
    block-size: 16rem;
  }

  .words-editor-footer {
    position: relative;
    min-block-size: calc(48px + env(safe-area-inset-bottom));
    padding: 8px 14px calc(8px + env(safe-area-inset-bottom));
  }

  .words-footer-state {
    display: inline-flex;
  }

  .words-footer-actions {
    gap: 6px;
  }

  .words-footer-actions .v-btn {
    min-inline-size: 0;
  }
}
</style>
