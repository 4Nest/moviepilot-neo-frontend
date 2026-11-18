<script setup lang="ts">
// 先注册 ace 主题/模式 URL（与全局懒加载路径一致，否则进阶模式主题回退默认浅色）
import '@/ace-config'
import { VAceEditor } from 'vue3-ace-editor'
import { useI18n } from '@/composables/useChineseText'
import { useDisplay } from 'vuetify'
import {
  evalExpr,
  exprBody,
  parseFormat,
  replaceTokenField,
  serializeTokens,
  setTokenExpr,
  type RenameToken,
} from './renameFormatTokens'

const props = defineProps({
  modelValue: { type: String, default: '' },
  // 媒体类型：movie / tv
  mediaType: { type: String, default: 'movie' },
  // Ace 编辑器主题
  editorTheme: { type: String, default: 'chrome' },
})

const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()

const display = useDisplay()
const editorMinLines = computed(() => (display.smAndDown.value ? 6 : 8))
const editorMaxLines = computed(() => (display.smAndDown.value ? 14 : 20))

// ===== 模式 =====
type EditorMode = 'simple' | 'advanced'
const mode = ref<EditorMode>((localStorage.getItem('MP_RENAME_FORMAT_MODE') as EditorMode) || 'simple')

watch(mode, value => {
  localStorage.setItem('MP_RENAME_FORMAT_MODE', value)
})

const format = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

// ===== 字段与预设模板定义 =====
interface FieldDef {
  key: string
  label: string
}

interface FormatPreset {
  id: string
  title: string
  desc: string
  value: string
}

// 默认格式（与后端 settings 默认值一致）
const DEFAULT_FORMATS: Record<string, string> = {
  movie:
    '{{title}}{% if year %} ({{year}}){% endif %}/{{title}}{% if year %} ({{year}}){% endif %}{% if part %}-{{part}}{% endif %}{% if videoFormat %} - {{videoFormat}}{% endif %}{{fileExt}}',
  tv: '{{title}}{% if year %} ({{year}}){% endif %}/Season {{season}}/{{title}} - {{season_episode}}{% if part %}-{{part}}{% endif %}{% if episode %} - 第 {{episode}} 集{% endif %}{{fileExt}}',
}

const presets = computed<FormatPreset[]>(() =>
  props.mediaType === 'tv'
    ? [
        {
          id: 'standard',
          title: t('renameFormat.presetStandard'),
          desc: t('renameFormat.presetStandardDesc'),
          value: DEFAULT_FORMATS.tv,
        },
        {
          id: 'library',
          title: t('renameFormat.presetLibrary'),
          desc: t('renameFormat.presetLibraryDesc'),
          value:
            '{{title}}{% if year %} ({{year}}){% endif %}{% if tmdbid %} {tmdbid={{tmdbid}}}{% endif %}/Season {{season}}/{{title}}.{{season_episode}}{% if part %}.{{part}}{% endif %}{% if videoFormat %}.{{videoFormat}}{% endif %}{% if videoCodec %}.{{videoCodec}}{% endif %}{% if releaseGroup %}-{{releaseGroup}}{% endif %}{{fileExt}}',
        },
        {
          id: 'collector',
          title: t('renameFormat.presetCollector'),
          desc: t('renameFormat.presetCollectorDesc'),
          value:
            '{{title}}{% if year %} ({{year}}){% endif %}{% if tmdbid %} {tmdbid={{tmdbid}}}{% endif %}/Season {{season}}/{{title}}{% if en_title %}.{{en_title}}{% endif %}.{{season_episode}}{% if part %}.{{part}}{% endif %}{% if webSource %}.{{webSource}}{% endif %}{% if edition %}.{{edition}}{% endif %}{% if videoFormat %}.{{videoFormat}}{% endif %}{% if effect %}.{{effect}}{% endif %}{% if videoCodec %}.{{videoCodec}}{% endif %}{% if audioCodec %}.{{audioCodec}}{% endif %}{% if customization %}-{{customization}}{% endif %}{% if releaseGroup %}-{{releaseGroup}}{% endif %}{{fileExt}}',
        },
      ]
    : [
        {
          id: 'standard',
          title: t('renameFormat.presetStandard'),
          desc: t('renameFormat.presetStandardDesc'),
          value: DEFAULT_FORMATS.movie,
        },
        {
          id: 'library',
          title: t('renameFormat.presetLibrary'),
          desc: t('renameFormat.presetLibraryDesc'),
          value:
            '{{title}}{% if year %} ({{year}}){% endif %}{% if tmdbid %} {tmdbid={{tmdbid}}}{% endif %}/{{title}}{% if year %}.{{year}}{% endif %}{% if part %}.{{part}}{% endif %}{% if videoFormat %}.{{videoFormat}}{% endif %}{% if videoCodec %}.{{videoCodec}}{% endif %}{% if releaseGroup %}-{{releaseGroup}}{% endif %}{{fileExt}}',
        },
        {
          id: 'collector',
          title: t('renameFormat.presetCollector'),
          desc: t('renameFormat.presetCollectorDesc'),
          value:
            '{{title}}{% if year %} ({{year}}){% endif %}{% if tmdbid %} {tmdbid={{tmdbid}}}{% endif %}/{{title}}{% if en_title %}.{{en_title}}{% endif %}{% if year %}.{{year}}{% endif %}{% if webSource %}.{{webSource}}{% endif %}{% if edition %}.{{edition}}{% endif %}{% if part %}.{{part}}{% endif %}{% if videoFormat %}.{{videoFormat}}{% endif %}{% if effect %}.{{effect}}{% endif %}{% if videoCodec %}.{{videoCodec}}{% endif %}{% if audioCodec %}.{{audioCodec}}{% endif %}{% if customization %}-{{customization}}{% endif %}{% if releaseGroup %}-{{releaseGroup}}{% endif %}{{fileExt}}',
        },
      ],
)

function applyPreset(preset: FormatPreset) {
  format.value = preset.value
}

function resetToDefault() {
  format.value = DEFAULT_FORMATS[props.mediaType] ?? DEFAULT_FORMATS.movie
}

defineExpose({ resetToDefault })

const fieldLabelMap = computed<Record<string, string>>(() => ({
  title: t('renameFormat.fieldTitle'),
  en_title: t('renameFormat.fieldEnTitle'),
  original_title: t('renameFormat.fieldOriginalTitle'),
  original_name: t('renameFormat.fieldOriginalName'),
  year: t('renameFormat.fieldYear'),
  title_year: t('renameFormat.fieldTitleYear'),
  season: t('renameFormat.fieldSeason'),
  season_fmt: t('renameFormat.fieldSeasonFmt'),
  season_year: t('renameFormat.fieldSeasonYear'),
  episode: t('renameFormat.fieldEpisode'),
  season_episode: t('renameFormat.fieldSeasonEpisode'),
  episode_title: t('renameFormat.fieldEpisodeTitle'),
  episode_date: t('renameFormat.fieldEpisodeDate'),
  part: t('renameFormat.fieldPart'),
  videoFormat: t('renameFormat.fieldVideoFormat'),
  effect: t('renameFormat.fieldEffect'),
  videoCodec: t('renameFormat.fieldVideoCodec'),
  videoBit: t('renameFormat.fieldVideoBit'),
  audioCodec: t('renameFormat.fieldAudioCodec'),
  fps: t('renameFormat.fieldFps'),
  edition: t('renameFormat.fieldEdition'),
  releaseGroup: t('renameFormat.fieldReleaseGroup'),
  resourceType: t('renameFormat.fieldResourceType'),
  tmdbid: 'TMDB ID',
  imdbid: 'IMDB ID',
  doubanid: t('renameFormat.fieldDoubanId'),
  bangumiid: 'Bangumi ID',
  anilistid: 'AniList ID',
  fileExt: t('renameFormat.fieldFileExt'),
  customization: t('renameFormat.fieldCustomization'),
  webSource: t('renameFormat.fieldWebSource'),
}))

const fieldGroups = computed(() => [
  {
    name: t('renameFormat.groupBasic'),
    fields: [
      'title',
      'en_title',
      'original_title',
      'year',
      'title_year',
      ...(props.mediaType === 'tv'
        ? ['season', 'season_fmt', 'season_year', 'episode', 'season_episode', 'episode_title']
        : []),
      'part',
    ].map(key => ({ key, label: fieldLabelMap.value[key] }) as FieldDef),
  },
  {
    name: t('renameFormat.groupTech'),
    fields: ['videoFormat', 'effect', 'videoCodec', 'audioCodec', 'edition', 'releaseGroup', 'resourceType', 'fps'].map(
      key => ({
        key,
        label: fieldLabelMap.value[key],
      }),
    ),
  },
  {
    name: t('renameFormat.groupId'),
    fields: ['tmdbid', 'imdbid', 'doubanid', ...(props.mediaType === 'tv' ? ['bangumiid', 'anilistid'] : [])].map(
      key => ({ key, label: fieldLabelMap.value[key] }),
    ),
  },
  {
    name: t('renameFormat.groupOther'),
    fields: ['fileExt', 'customization', 'webSource', 'original_name'].map(key => ({
      key,
      label: fieldLabelMap.value[key],
    })),
  },
])

// ===== Token 模型 =====
const tokens = ref<RenameToken[]>(parseFormat(props.modelValue))

watch(
  tokens,
  value => {
    const serialized = serializeTokens(value)
    if (serialized !== props.modelValue) emit('update:modelValue', serialized)
  },
  { deep: true },
)

watch(
  () => props.modelValue,
  value => {
    if (serializeTokens(tokens.value) !== value) tokens.value = parseFormat(value)
  },
)

// ===== 简易模式操作 =====
const draggingIndex = ref<number | null>(null)
const editingIndex = ref<number | null>(null)
const insertAsOptional = ref(false)

function appendField(key: string) {
  tokens.value.push({
    type: 'field',
    value: key,
    cond: insertAsOptional.value ? key : undefined,
  })
}

const customText = ref('')
// 常用连接符，保留单行高频快捷插入
const quickTexts = ['/', ' - ', '.', ' ', ' (', ')']

function appendText() {
  const text = customText.value
  if (!text) return
  tokens.value.push({ type: 'text', value: text })
  customText.value = ''
}

/** token 显示文本：字段用中文标签（表达式加 * 标记），文本用符号化显示 */
function tokenLabel(token: RenameToken): string {
  if (token.type !== 'field') return displayText(token.value)
  const label = fieldLabelMap.value[token.value] || token.value
  return token.expr ? `${label}*` : label
}

/** 文本 token 显示：空格等不可见字符用符号表示 */
function displayText(value: string): string {
  return value.replace(/ /g, '␣').replace(/\t/g, '→').replace(/\n/g, '↵')
}

function removeToken(index: number) {
  if (editingIndex.value === index) editingIndex.value = null
  tokens.value.splice(index, 1)
}

// ===== 标签编辑（点击标签弹出） =====
const fieldOptions = computed(() =>
  fieldGroups.value.flatMap(group => group.fields.map(field => ({ title: field.label, value: field.key }))),
)

const condOptions = computed(() => [
  { title: t('renameFormat.condAlways'), value: '' },
  ...fieldOptions.value.map(option => ({
    title: t('renameFormat.condWhen', { field: option.title }),
    value: option.value,
  })),
])

function setTokenCond(token: RenameToken, cond: string) {
  token.cond = cond || undefined
}

function onTokenDrop(targetIndex: number) {
  const from = draggingIndex.value
  draggingIndex.value = null
  if (from === null || from === targetIndex) return
  editingIndex.value = null
  const [moved] = tokens.value.splice(from, 1)
  tokens.value.splice(targetIndex, 0, moved)
}

function onFieldDrop() {
  draggingIndex.value = null
}

// ===== 字段流分层与条件聚合渲染 =====
interface TokenEntry {
  token: RenameToken
  index: number
}

interface TokenGroup {
  cond?: string
  items: TokenEntry[]
}

interface PathLevel {
  kind: 'dir' | 'file'
  dirIndex: number
  groups: TokenGroup[]
  separator?: TokenEntry
}

function isPathSeparator(token: RenameToken): boolean {
  return token.type === 'text' && !token.cond && token.value.trim() === '/'
}

function groupLevelEntries(entries: TokenEntry[]): TokenGroup[] {
  const groups: TokenGroup[] = []
  for (const entry of entries) {
    const last = groups[groups.length - 1]
    if (entry.token.cond && last?.cond === entry.token.cond) {
      last.items.push(entry)
    } else {
      groups.push({ cond: entry.token.cond, items: [entry] })
    }
  }
  return groups
}

const pathLevels = computed<PathLevel[]>(() => {
  const rawLevels: { entries: TokenEntry[]; separator?: TokenEntry }[] = []
  let currentEntries: TokenEntry[] = []

  tokens.value.forEach((token, index) => {
    if (isPathSeparator(token)) {
      rawLevels.push({ entries: currentEntries, separator: { token, index } })
      currentEntries = []
    } else {
      currentEntries.push({ token, index })
    }
  })
  rawLevels.push({ entries: currentEntries })

  return rawLevels.map((raw, idx) => {
    const isFile = idx === rawLevels.length - 1
    return {
      kind: isFile ? 'file' : 'dir',
      dirIndex: idx + 1,
      groups: groupLevelEntries(raw.entries),
      separator: raw.separator,
    }
  })
})

function pathLevelLabel(level: PathLevel, totalDirs: number): string {
  if (level.kind === 'file') return '文件名'
  return totalDirs > 1 ? `目录 ${level.dirIndex}` : '目录'
}

function condLabel(cond: string): string {
  return t('renameFormat.condShort', { field: fieldLabelMap.value[cond] || cond })
}

// ===== 实时预览 =====
const sampleData: ComputedRef<Record<string, string>> = computed(() =>
  props.mediaType === 'tv'
    ? ({
        title: '庆余年',
        en_title: 'Joy of Life',
        original_title: '庆余年',
        original_name: 'Joy.of.Life.S01E01.2019.2160p.WEB-DL.H265-ADWeb',
        year: '2019',
        title_year: '庆余年 (2019)',
        season: '01',
        season_fmt: 'S01',
        season_year: '2019',
        episode: '01',
        season_episode: 'S01E01',
        episode_title: '初出茅庐',
        episode_date: '2019-11-26',
        part: '',
        videoFormat: '2160p',
        effect: 'DV',
        videoCodec: 'H265',
        videoBit: '10bit',
        audioCodec: 'DTS-HD MA',
        fps: '60fps',
        edition: 'BluRay',
        releaseGroup: 'ADWeb',
        resourceType: 'WEB-DL',
        tmdbid: '84958',
        imdbid: 'tt11235748',
        doubanid: '30493960',
        bangumiid: '275806',
        anilistid: '108632',
        fileExt: '.mkv',
        customization: '',
        webSource: 'iQIYI',
      } as Record<string, string>)
    : ({
        title: '流浪地球',
        en_title: 'The Wandering Earth',
        original_title: '流浪地球',
        original_name: 'The.Wandering.Earth.2019.2160p.BluRay.H265.DTS-HD.MA-ADWeb',
        year: '2019',
        title_year: '流浪地球 (2019)',
        part: '',
        videoFormat: '2160p',
        effect: 'HDR',
        videoCodec: 'H265',
        videoBit: '10bit',
        audioCodec: 'DTS-HD MA',
        fps: '24fps',
        edition: 'BluRay',
        releaseGroup: 'ADWeb',
        resourceType: 'BluRay',
        tmdbid: '535167',
        imdbid: 'tt7605074',
        doubanid: '26266893',
        fileExt: '.mkv',
        customization: '',
        webSource: '',
      } as Record<string, string>),
)

const preview = computed(() => {
  const data = sampleData.value
  const parts: string[] = []
  let i = 0
  const list = tokens.value
  while (i < list.length) {
    const token = list[i]
    if (token.cond) {
      const group: RenameToken[] = []
      while (i < list.length && list[i].cond === token.cond) {
        group.push(list[i])
        i++
      }
      if (data[token.cond]) {
        parts.push(
          group
            .map(item =>
              item.type === 'field' ? (item.expr ? evalExpr(item.expr, data) : (data[item.value] ?? '')) : item.value,
            )
            .join(''),
        )
      }
    } else {
      parts.push(
        token.type === 'field' ? (token.expr ? evalExpr(token.expr, data) : (data[token.value] ?? '')) : token.value,
      )
      i++
    }
  }
  return parts
    .join('')
    .replace(/\s{2,}/g, ' ')
    .trim()
})

const previewSegments = computed(() =>
  preview.value
    .split('/')
    .map(segment => segment.trim())
    .filter(Boolean),
)

// Ace 编辑器配置
const aceOptions = {
  enableBasicAutocompletion: true,
  enableSnippets: false,
  enableLiveAutocompletion: false,
  showPrintMargin: false,
  highlightActiveLine: true,
  showGutter: true,
  fontSize: 13,
  tabSize: 2,
}

function onAceInit(editor: { renderer: { setPadding: (n: number) => void } }) {
  editor.renderer.setPadding(12)
}
</script>

<template>
  <div class="rename-format-editor">
    <!-- 顶部工具栏：媒体类型分段 + 预设模板 | 简易/进阶 + 重置默认 -->
    <div class="rename-format-editor__toolbar">
      <div class="rename-format-editor__toolbar-start">
        <slot name="toolbar" />
        <VBtn
          size="small"
          variant="outlined"
          prepend-icon="mdi-bookmark-outline"
          append-icon="mdi-chevron-down"
          class="rename-format-editor__preset-btn"
        >
          {{ t('renameFormat.presets') }}
          <VMenu activator="parent" location="bottom start" close-on-content-click>
            <VList density="compact" class="rename-format-editor__preset-menu">
              <VListItem
                v-for="preset in presets"
                :key="preset.id"
                :active="format === preset.value"
                @click="applyPreset(preset)"
              >
                <VListItemTitle>{{ preset.title }}</VListItemTitle>
                <VListItemSubtitle>{{ preset.desc }}</VListItemSubtitle>
                <template v-if="format === preset.value" #append>
                  <VIcon icon="mdi-check" size="15" color="primary" />
                </template>
              </VListItem>
            </VList>
          </VMenu>
        </VBtn>
      </div>

      <div class="rename-format-editor__toolbar-end">
        <div class="rename-format-editor__segmented" role="tablist" :aria-label="t('renameFormat.sectionTitle')">
          <button
            type="button"
            role="tab"
            :aria-selected="mode === 'simple'"
            class="rename-format-editor__segment-btn"
            :class="{ 'is-active': mode === 'simple' }"
            @click="mode = 'simple'"
          >
            <VIcon icon="mdi-cursor-default-click-outline" size="14" />
            <span>{{ t('renameFormat.modeSimple') }}</span>
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="mode === 'advanced'"
            class="rename-format-editor__segment-btn"
            :class="{ 'is-active': mode === 'advanced' }"
            @click="mode = 'advanced'"
          >
            <VIcon icon="mdi-code-tags" size="14" />
            <span>{{ t('renameFormat.modeAdvanced') }}</span>
          </button>
        </div>
        <VBtn
          size="small"
          variant="text"
          prepend-icon="mdi-restore"
          class="rename-format-editor__reset-btn"
          @click="resetToDefault"
        >
          {{ t('renameFormat.reset') }}
        </VBtn>
      </div>
    </div>

    <!-- 单一整合编辑器面板：预览条 + 路径轨道/源码 + 单行快捷插入栏 -->
    <div class="rename-format-editor__surface">
      <!-- 顶部内嵌实时预览 -->
      <div class="rename-format-editor__preview" data-testid="rename-preview">
        <span class="rename-format-editor__preview-label">
          <VIcon icon="mdi-eye-outline" size="13" />
          <span>{{ t('renameFormat.preview') }}</span>
        </span>
        <div class="rename-format-editor__preview-value">
          <template v-if="previewSegments.length">
            <template v-for="(segment, i) in previewSegments" :key="i">
              <span
                class="rename-format-editor__preview-segment"
                :class="
                  i < previewSegments.length - 1
                    ? 'rename-format-editor__preview-segment--folder'
                    : 'rename-format-editor__preview-segment--file'
                "
              >
                <VIcon
                  :icon="i < previewSegments.length - 1 ? 'mdi-folder-outline' : 'mdi-file-video-outline'"
                  size="13"
                  class="rename-format-editor__preview-icon"
                />
                <span>{{ segment }}</span>
              </span>
              <VIcon
                v-if="i < previewSegments.length - 1"
                icon="mdi-chevron-right"
                size="14"
                class="rename-format-editor__preview-sep"
              />
            </template>
          </template>
          <span v-else class="rename-format-editor__preview-empty">—</span>
        </div>
      </div>

      <!-- 简易模式：扁平自然路径流 + 单行紧凑插入栏 -->
      <template v-if="mode === 'simple'">
        <div class="rename-format-editor__token-area" @drop.prevent="onFieldDrop" @dragover.prevent>
          <template v-if="tokens.length">
            <div
              v-for="(level, levelIdx) in pathLevels"
              :key="levelIdx"
              class="rename-format-editor__level-row"
              :class="{ 'rename-format-editor__level-row--file': level.kind === 'file' }"
            >
              <div class="rename-format-editor__level-badge">
                <VIcon
                  :icon="level.kind === 'file' ? 'mdi-file-video-outline' : 'mdi-folder-outline'"
                  size="14"
                  class="rename-format-editor__level-icon"
                />
                <span>{{ pathLevelLabel(level, pathLevels.length - 1) }}</span>
              </div>

              <div class="rename-format-editor__level-tokens">
                <template v-if="level.groups.length">
                  <span
                    v-for="(group, groupIndex) in level.groups"
                    :key="groupIndex"
                    :class="group.cond ? 'rename-format-editor__cond-group' : 'rename-format-editor__plain-group'"
                    :title="group.cond ? condLabel(group.cond) : undefined"
                  >
                    <span v-if="group.cond" class="rename-format-editor__cond-label">{{ condLabel(group.cond) }}</span>
                    <span
                      v-for="{ token, index } in group.items"
                      :key="index"
                      class="rename-format-editor__token"
                      :class="{
                        'rename-format-editor__token--field': token.type === 'field',
                        'rename-format-editor__token--text': token.type === 'text' && !isPathSeparator(token),
                        'rename-format-editor__token--separator': isPathSeparator(token),
                        'is-editing': editingIndex === index,
                      }"
                      draggable="true"
                      @dragstart="draggingIndex = index"
                      @drop.stop="onTokenDrop(index)"
                      @dragover.prevent
                    >
                      <span class="rename-format-editor__token-text">{{ tokenLabel(token) }}</span>
                      <VIcon
                        icon="mdi-close"
                        size="11"
                        class="rename-format-editor__token-remove"
                        @click.stop="removeToken(index)"
                      />
                      <VMenu
                        :model-value="editingIndex === index"
                        activator="parent"
                        :close-on-content-click="false"
                        location="bottom start"
                        @update:model-value="open => (editingIndex = open ? index : null)"
                      >
                        <VCard class="rename-format-editor__token-editor" data-testid="rename-token-editor">
                          <VCardText class="d-flex flex-column ga-3 pa-3">
                            <template v-if="token.type === 'field'">
                              <VSelect
                                :model-value="token.value"
                                :items="fieldOptions"
                                :label="t('renameFormat.editField')"
                                density="compact"
                                variant="outlined"
                                hide-details
                                @update:model-value="key => replaceTokenField(tokens, index, key)"
                              />
                              <VTextField
                                :model-value="exprBody(token)"
                                :label="t('renameFormat.editExpr')"
                                :placeholder="t('renameFormat.editExprPlaceholder')"
                                density="compact"
                                variant="outlined"
                                class="rename-format-editor__token-editor-mono"
                                hide-details
                                @update:model-value="body => setTokenExpr(token, body)"
                              />
                            </template>
                            <VTextField
                              v-else
                              v-model="token.value"
                              :label="t('renameFormat.editText')"
                              density="compact"
                              variant="outlined"
                              class="rename-format-editor__token-editor-mono"
                              hide-details
                              autofocus
                            />
                            <VSelect
                              :model-value="token.cond ?? ''"
                              :items="condOptions"
                              :label="t('renameFormat.editCond')"
                              density="compact"
                              variant="outlined"
                              hide-details
                              @update:model-value="cond => setTokenCond(token, cond)"
                            />
                          </VCardText>
                        </VCard>
                      </VMenu>
                    </span>
                  </span>
                </template>
                <span v-else class="rename-format-editor__level-placeholder">点击下方插入变量或符号</span>

                <!-- 目录尾部的 `/` 分隔符 token -->
                <span
                  v-if="level.separator"
                  class="rename-format-editor__token rename-format-editor__token--separator"
                  :class="{ 'is-editing': editingIndex === level.separator.index }"
                  draggable="true"
                  title="目录层级分隔符 (/)"
                  @dragstart="draggingIndex = level.separator.index"
                  @drop.stop="onTokenDrop(level.separator.index)"
                  @dragover.prevent
                >
                  <span class="rename-format-editor__token-text">{{ tokenLabel(level.separator.token) }}</span>
                  <VIcon
                    icon="mdi-close"
                    size="11"
                    class="rename-format-editor__token-remove"
                    @click.stop="removeToken(level.separator.index)"
                  />
                  <VMenu
                    :model-value="editingIndex === level.separator.index"
                    activator="parent"
                    :close-on-content-click="false"
                    location="bottom start"
                    @update:model-value="open => (editingIndex = open ? level.separator!.index : null)"
                  >
                    <VCard class="rename-format-editor__token-editor" data-testid="rename-token-editor">
                      <VCardText class="d-flex flex-column ga-3 pa-3">
                        <VTextField
                          v-model="level.separator.token.value"
                          :label="t('renameFormat.editText')"
                          density="compact"
                          variant="outlined"
                          class="rename-format-editor__token-editor-mono"
                          hide-details
                          autofocus
                        />
                        <VSelect
                          :model-value="level.separator.token.cond ?? ''"
                          :items="condOptions"
                          :label="t('renameFormat.editCond')"
                          density="compact"
                          variant="outlined"
                          hide-details
                          @update:model-value="cond => setTokenCond(level.separator!.token, cond)"
                        />
                      </VCardText>
                    </VCard>
                  </VMenu>
                </span>
              </div>
            </div>
          </template>
          <span v-else class="rename-format-editor__token-empty">{{ t('renameFormat.emptyHint') }}</span>
        </div>

        <!-- 底部单行紧凑插入栏 -->
        <div class="rename-format-editor__palette">
          <div class="rename-format-editor__palette-main">
            <VBtn
              size="small"
              color="primary"
              variant="tonal"
              prepend-icon="mdi-plus"
              append-icon="mdi-chevron-down"
              class="rename-format-editor__field-menu-btn"
            >
              {{ t('renameFormat.insertField') }}
              <VMenu activator="parent" :close-on-content-click="false" location="top start">
                <VCard class="rename-format-editor__field-popover">
                  <div class="rename-format-editor__field-popover-head">
                    <VCheckbox
                      v-model="insertAsOptional"
                      :label="t('renameFormat.insertOptional')"
                      density="compact"
                      color="primary"
                      hide-details
                    />
                  </div>
                  <div class="rename-format-editor__field-popover-body">
                    <div v-for="group in fieldGroups" :key="group.name" class="rename-format-editor__field-group">
                      <div class="rename-format-editor__field-group-title">{{ group.name }}</div>
                      <div class="rename-format-editor__field-group-items">
                        <button
                          v-for="field in group.fields"
                          :key="field.key"
                          type="button"
                          class="rename-format-editor__field-chip"
                          @click="appendField(field.key)"
                        >
                          <span>{{ field.label }}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </VCard>
              </VMenu>
            </VBtn>

            <span class="rename-format-editor__palette-divider" aria-hidden="true" />

            <div class="rename-format-editor__quick-group">
              <button
                v-for="text in quickTexts"
                :key="text"
                type="button"
                class="rename-format-editor__quick-text"
                :title="text === '/' ? '新增子目录层级 (/)' : undefined"
                @click="tokens.push({ type: 'text', value: text })"
              >
                {{ displayText(text) }}
              </button>
            </div>
          </div>

          <div class="rename-format-editor__palette-side">
            <div class="rename-format-editor__text-input">
              <input
                v-model="customText"
                type="text"
                class="rename-format-editor__custom-input"
                :placeholder="t('renameFormat.customTextPlaceholder')"
                @keydown.enter.prevent="appendText"
              />
              <button
                type="button"
                class="rename-format-editor__custom-submit"
                :disabled="!customText"
                :title="t('renameFormat.insertText')"
                @click="appendText"
              >
                <VIcon icon="mdi-plus" size="14" />
              </button>
            </div>
            <span class="rename-format-editor__legend">虚线 = 有值时输出 · 点击任意片段编辑</span>
          </div>
        </div>
      </template>

      <!-- 进阶模式：Jinja2 源码编辑器 -->
      <template v-else>
        <VAceEditor
          v-model:value="format"
          lang="jinja2"
          :theme="editorTheme"
          :options="aceOptions"
          :print-margin="false"
          :min-lines="editorMinLines"
          :max-lines="editorMaxLines"
          wrap
          class="rename-format-editor__ace"
          @init="onAceInit"
        />
        <div class="rename-format-editor__advanced-foot">
          {{ t('setting.directory.movieRenameFormatHint') }}
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.rename-format-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ===== 顶部工具栏 ===== */
.rename-format-editor__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.rename-format-editor__toolbar-start,
.rename-format-editor__toolbar-end {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.rename-format-editor__preset-btn {
  border-color: var(--mp-border-card) !important;
  block-size: 32px !important;
  color: rgba(var(--v-theme-on-surface), 0.82) !important;
  font-size: 12.5px !important;
}

.rename-format-editor__preset-btn:hover {
  border-color: var(--mp-border-hover) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
}

.rename-format-editor__preset-menu {
  max-inline-size: 20rem;
  min-inline-size: 16rem;
}

.rename-format-editor__segmented {
  display: inline-flex;
  align-items: center;
  padding: 3px;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 8px;
  background: var(--mp-tab-groove-bg);
  gap: 2px;
}

.rename-format-editor__segment-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  block-size: 26px;
  color: rgba(var(--v-theme-on-surface), 0.65);
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 500;
  gap: 4px;
  line-height: 1;
  transition:
    background-color 0.14s ease,
    border-color 0.14s ease,
    color 0.14s ease;
  white-space: nowrap;
}

.rename-format-editor__segment-btn:hover:not(.is-active) {
  color: rgba(var(--v-theme-on-surface), 0.9);
}

.rename-format-editor__segment-btn.is-active {
  border-color: var(--mp-tab-active-border);
  background: var(--mp-tab-active-bg);
  box-shadow: var(--mp-tab-active-shadow);
  color: rgb(var(--v-theme-on-surface));
}

.rename-format-editor__reset-btn {
  block-size: 28px !important;
  color: rgba(var(--v-theme-on-surface), 0.62) !important;
  font-size: 12px !important;
  padding-inline: 8px !important;
}

.rename-format-editor__reset-btn:hover {
  color: rgb(var(--v-theme-on-surface)) !important;
}

/* ===== 单一整合编辑器面板 ===== */
.rename-format-editor__surface {
  overflow: hidden;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: rgb(var(--v-theme-surface));
}

/* 顶部内嵌预览条 */
.rename-format-editor__preview {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  padding: 8px 12px;
  border-block-end: 1px solid var(--mp-border-subtle);
  background: var(--mp-item-bg);
  gap: 6px 10px;
}

.rename-format-editor__preview-label {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), 0.56);
  font-size: 11.5px;
  font-weight: 500;
  gap: 4px;
  line-height: 1.3;
}

.rename-format-editor__preview-value {
  display: flex;
  flex: 1 1 16rem;
  flex-wrap: wrap;
  align-items: center;
  font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  gap: 4px;
  line-height: 1.45;
  min-inline-size: 0;
}

.rename-format-editor__preview-segment {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 5px;
  gap: 5px;
  max-inline-size: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.rename-format-editor__preview-segment--folder {
  color: rgba(var(--v-theme-on-surface), 0.78);
}

.rename-format-editor__preview-segment--folder .rename-format-editor__preview-icon {
  color: rgba(var(--v-theme-warning), 0.85);
}

.rename-format-editor__preview-segment--file {
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgba(var(--v-theme-on-surface), 0.96);
  font-weight: 500;
}

.rename-format-editor__preview-segment--file .rename-format-editor__preview-icon {
  color: rgb(var(--v-theme-primary));
}

.rename-format-editor__preview-icon {
  flex-shrink: 0;
}

.rename-format-editor__preview-sep {
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), 0.34);
}

.rename-format-editor__preview-empty {
  color: rgba(var(--v-theme-on-surface), 0.45);
}

/* ===== 路径轨道区 ===== */
.rename-format-editor__token-area {
  display: flex;
  flex-direction: column;
}

.rename-format-editor__level-row {
  display: grid;
  align-items: start;
  padding: 10px 12px;
  border-block-end: 1px solid var(--mp-border-subtle);
  gap: 8px;
  grid-template-columns: 4.5rem minmax(0, 1fr);
}

.rename-format-editor__level-row:last-child {
  border-block-end: 0;
}

.rename-format-editor__level-badge {
  display: inline-flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 12px;
  font-weight: 500;
  gap: 5px;
  line-height: 26px;
  white-space: nowrap;
}

.rename-format-editor__level-badge .rename-format-editor__level-icon {
  color: rgba(var(--v-theme-warning), 0.82);
}

.rename-format-editor__level-row--file .rename-format-editor__level-badge {
  color: rgba(var(--v-theme-on-surface), 0.84);
}

.rename-format-editor__level-row--file .rename-format-editor__level-icon {
  color: rgb(var(--v-theme-primary));
}

.rename-format-editor__level-tokens {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 5px;
  min-block-size: 26px;
}

.rename-format-editor__level-placeholder {
  color: rgba(var(--v-theme-on-surface), 0.4);
  font-size: 12px;
  line-height: 26px;
}

.rename-format-editor__plain-group {
  display: contents;
}

/* 单层扁平可选块：柔和虚线胶囊，内部零二次边框套娃 */
.rename-format-editor__cond-group {
  position: relative;
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  padding: 0 3px;
  border: 1px dashed rgba(var(--v-theme-primary), 0.36);
  border-radius: 6px;
  background: rgba(var(--v-theme-primary), 0.05);
  min-block-size: 26px;
  transition:
    border-color 0.14s ease,
    background-color 0.14s ease;
}

.rename-format-editor__cond-group:hover {
  border-color: rgba(var(--v-theme-primary), 0.62);
  background: rgba(var(--v-theme-primary), 0.09);
}

/* 保留无障碍与单测语义文本，消除视觉 12 次重复刷屏 */
.rename-format-editor__cond-label {
  position: absolute;
  overflow: hidden;
  border: 0;
  block-size: 1px;
  clip-path: inset(50%);
  inline-size: 1px;
  white-space: nowrap;
}

/* 顶层必选 Token 胶囊 */
.rename-format-editor__token {
  display: inline-flex;
  align-items: center;
  border: 1px solid transparent;
  border-radius: 6px;
  block-size: 26px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  padding-inline: 8px;
  transition:
    border-color 0.14s ease,
    background-color 0.14s ease,
    color 0.14s ease;
  user-select: none;
}

.rename-format-editor__token--field {
  border-color: rgba(var(--v-theme-primary), 0.28);
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
  font-weight: 500;
}

.rename-format-editor__token--text {
  border-color: var(--mp-border-card);
  background: var(--mp-item-bg);
  color: rgba(var(--v-theme-on-surface), 0.82);
  font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
  padding-inline: 6px;
}

.rename-format-editor__token--separator {
  border-color: var(--mp-border-subtle);
  background: var(--mp-tab-groove-bg);
  color: rgba(var(--v-theme-on-surface), 0.56);
  font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  font-weight: 600;
  padding-inline: 6px;
}

/* 可选块内部子片段去框扁平化：让 `.分辨率`、`␣(年份)` 像自然路径一样一眼可读 */
.rename-format-editor__cond-group .rename-format-editor__token {
  border: 0;
  border-radius: 4px;
  background: transparent;
  block-size: 22px;
  padding-inline: 3px;
}

.rename-format-editor__cond-group .rename-format-editor__token--text {
  color: rgba(var(--v-theme-on-surface), 0.58);
  padding-inline: 2px;
}

.rename-format-editor__cond-group .rename-format-editor__token--field {
  color: rgb(var(--v-theme-primary));
  font-weight: 500;
}

.rename-format-editor__token:hover,
.rename-format-editor__token.is-editing {
  border-color: rgba(var(--v-theme-primary), 0.52);
}

.rename-format-editor__cond-group .rename-format-editor__token:hover,
.rename-format-editor__cond-group .rename-format-editor__token.is-editing {
  background: rgba(var(--v-theme-primary), 0.14);
}

/* 悬停当前片段时才浮现删除按钮 */
.rename-format-editor__token-remove {
  overflow: hidden;
  inline-size: 0;
  margin-inline-start: 0;
  opacity: 0;
  pointer-events: none;
  transition:
    inline-size 0.12s ease,
    margin-inline-start 0.12s ease,
    opacity 0.12s ease;
}

.rename-format-editor__token:hover .rename-format-editor__token-remove,
.rename-format-editor__token:focus-within .rename-format-editor__token-remove,
.rename-format-editor__token.is-editing .rename-format-editor__token-remove {
  inline-size: 11px;
  margin-inline-start: 3px;
  opacity: 0.65;
  pointer-events: auto;
}

.rename-format-editor__token-remove:hover {
  color: rgb(var(--v-theme-error));
  opacity: 1 !important;
}

@media (hover: none) {
  .rename-format-editor__token-remove {
    inline-size: 11px;
    margin-inline-start: 3px;
    opacity: 0.55;
    pointer-events: auto;
  }
}

.rename-format-editor__token-editor {
  border: 1px solid var(--mp-border-hover);
  border-radius: 10px !important;
  inline-size: 18rem;
  max-inline-size: calc(100vw - 2rem);
}

.rename-format-editor__token-editor-mono :deep(input) {
  font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
}

.rename-format-editor__token-empty {
  padding: 14px 12px;
  color: rgba(var(--v-theme-on-surface), 0.52);
  font-size: 12.5px;
}

/* ===== 底部单行紧凑插入栏 ===== */
.rename-format-editor__palette {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  padding: 7px 12px;
  border-block-start: 1px solid var(--mp-border-subtle);
  background: var(--mp-item-bg);
  gap: 8px 12px;
}

.rename-format-editor__palette-main,
.rename-format-editor__palette-side {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.rename-format-editor__field-menu-btn {
  block-size: 28px !important;
  font-size: 12px !important;
  padding-inline: 10px !important;
}

.rename-format-editor__palette-divider {
  background: var(--mp-border-card);
  block-size: 15px;
  inline-size: 1px;
}

.rename-format-editor__quick-group {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.rename-format-editor__quick-text {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 7px;
  border: 1px solid var(--mp-border-card);
  border-radius: 6px;
  background: rgb(var(--v-theme-surface));
  block-size: 26px;
  color: rgba(var(--v-theme-on-surface), 0.8);
  cursor: pointer;
  font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1;
  min-inline-size: 26px;
  transition:
    border-color 0.14s ease,
    background-color 0.14s ease,
    color 0.14s ease;
}

.rename-format-editor__quick-text:hover {
  border-color: rgba(var(--v-theme-primary), 0.45);
  background: rgba(var(--v-theme-primary), 0.08);
  color: rgb(var(--v-theme-primary));
}

.rename-format-editor__text-input {
  display: inline-flex;
  overflow: hidden;
  align-items: center;
  border: 1px solid var(--mp-border-card);
  border-radius: 6px;
  background: rgb(var(--v-theme-surface));
  block-size: 26px;
  transition: border-color 0.14s ease;
}

.rename-format-editor__text-input:focus-within {
  border-color: rgba(var(--v-theme-primary), 0.55);
}

.rename-format-editor__custom-input {
  padding: 0 8px;
  border: 0;
  background: transparent;
  block-size: 100%;
  color: rgb(var(--v-theme-on-surface));
  font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  inline-size: 7.5rem;
  outline: none;
}

.rename-format-editor__custom-input::placeholder {
  color: rgba(var(--v-theme-on-surface), 0.42);
  font-family: inherit;
}

.rename-format-editor__custom-submit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-inline-start: 1px solid var(--mp-border-subtle);
  background: transparent;
  block-size: 100%;
  color: rgb(var(--v-theme-primary));
  cursor: pointer;
  inline-size: 26px;
  transition: background-color 0.14s ease;
}

.rename-format-editor__custom-submit:disabled {
  color: rgba(var(--v-theme-on-surface), 0.28);
  cursor: default;
}

.rename-format-editor__custom-submit:not(:disabled):hover {
  background: rgba(var(--v-theme-primary), 0.1);
}

.rename-format-editor__legend {
  color: rgba(var(--v-theme-on-surface), 0.45);
  font-size: 11.5px;
  white-space: nowrap;
}

/* 变量插入浮层 */
.rename-format-editor__field-popover {
  border: 1px solid var(--mp-border-hover);
  border-radius: 10px !important;
  inline-size: 24rem;
  max-inline-size: calc(100vw - 2rem);
}

.rename-format-editor__field-popover-head {
  padding: 6px 12px;
  border-block-end: 1px solid var(--mp-border-subtle);
  background: var(--mp-item-bg);
}

.rename-format-editor__field-popover-head :deep(.v-label) {
  font-size: 12px;
}

.rename-format-editor__field-popover-body {
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  gap: 10px;
  max-block-size: 18rem;
  overflow-y: auto;
}

.rename-format-editor__field-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.rename-format-editor__field-group-title {
  color: rgba(var(--v-theme-on-surface), 0.52);
  font-size: 11px;
  font-weight: 600;
}

.rename-format-editor__field-group-items {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.rename-format-editor__field-chip {
  display: inline-flex;
  align-items: center;
  padding: 0 8px;
  border: 1px solid var(--mp-border-card);
  border-radius: 6px;
  background: var(--mp-item-bg);
  block-size: 25px;
  color: rgba(var(--v-theme-on-surface), 0.86);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  transition:
    border-color 0.14s ease,
    background-color 0.14s ease,
    color 0.14s ease;
}

.rename-format-editor__field-chip:hover {
  border-color: rgba(var(--v-theme-primary), 0.45);
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
}

/* ===== 进阶模式 Ace 容器 ===== */
.rename-format-editor__ace {
  min-block-size: 9rem;
}

.rename-format-editor__advanced-foot {
  padding: 7px 12px;
  border-block-start: 1px solid var(--mp-border-subtle);
  background: var(--mp-item-bg);
  color: rgba(var(--v-theme-on-surface), 0.54);
  font-size: 11.5px;
  line-height: 1.45;
}

@media (width <= 600px) {
  .rename-format-editor__toolbar-start,
  .rename-format-editor__toolbar-end {
    inline-size: 100%;
    justify-content: space-between;
  }

  .rename-format-editor__level-row {
    gap: 4px;
    grid-template-columns: 1fr;
  }

  .rename-format-editor__legend {
    display: none;
  }
}
</style>
