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

// ===== 字段定义 =====
interface FieldDef {
  key: string
  label: string
}

// 默认格式（与后端 settings 默认值一致）
const DEFAULT_FORMATS: Record<string, string> = {
  movie:
    '{{title}}{% if year %} ({{year}}){% endif %}/{{title}}{% if year %} ({{year}}){% endif %}{% if part %}-{{part}}{% endif %}{% if videoFormat %} - {{videoFormat}}{% endif %}{{fileExt}}',
  tv: '{{title}}{% if year %} ({{year}}){% endif %}/Season {{season}}/{{title}} - {{season_episode}}{% if part %}-{{part}}{% endif %}{% if episode %} - 第 {{episode}} 集{% endif %}{{fileExt}}',
}

function resetToDefault() {
  format.value = DEFAULT_FORMATS[props.mediaType] ?? DEFAULT_FORMATS.movie
}

defineExpose({ resetToDefault })

const fieldLabelMap = computed<Record<string, string>>(() => ({
  title: t('renameFormat.fieldTitle'),
  year: t('renameFormat.fieldYear'),
  title_year: t('renameFormat.fieldTitleYear'),
  season: t('renameFormat.fieldSeason'),
  season_fmt: t('renameFormat.fieldSeasonFmt'),
  episode: t('renameFormat.fieldEpisode'),
  season_episode: t('renameFormat.fieldSeasonEpisode'),
  episode_title: t('renameFormat.fieldEpisodeTitle'),
  part: t('renameFormat.fieldPart'),
  videoFormat: t('renameFormat.fieldVideoFormat'),
  videoCodec: t('renameFormat.fieldVideoCodec'),
  audioCodec: t('renameFormat.fieldAudioCodec'),
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
      'year',
      'title_year',
      ...(props.mediaType === 'tv' ? ['season', 'season_fmt', 'episode', 'season_episode', 'episode_title'] : []),
      'part',
    ].map(key => ({ key, label: fieldLabelMap.value[key] }) as FieldDef),
  },
  {
    name: t('renameFormat.groupTech'),
    fields: ['videoFormat', 'videoCodec', 'audioCodec', 'edition', 'releaseGroup', 'resourceType'].map(key => ({
      key,
      label: fieldLabelMap.value[key],
    })),
  },
  {
    name: t('renameFormat.groupId'),
    fields: ['tmdbid', 'imdbid', 'doubanid', ...(props.mediaType === 'tv' ? ['bangumiid', 'anilistid'] : [])].map(
      key => ({ key, label: fieldLabelMap.value[key] }),
    ),
  },
  {
    name: t('renameFormat.groupOther'),
    fields: ['fileExt', 'customization', 'webSource'].map(key => ({ key, label: fieldLabelMap.value[key] })),
  },
])

// ===== Token 模型（模块提供：parseFormat/serializeTokens/evalExpr/RenameToken） =====

// 简易模式 token 状态
const tokens = ref<RenameToken[]>(parseFormat(props.modelValue))

// token -> 保存格式
watch(
  tokens,
  value => {
    const serialized = serializeTokens(value)
    if (serialized !== props.modelValue) emit('update:modelValue', serialized)
  },
  { deep: true },
)

// 外部格式变化（进阶模式编辑后切回）-> 重新解析
watch(
  () => props.modelValue,
  value => {
    if (serializeTokens(tokens.value) !== value) tokens.value = parseFormat(value)
  },
)

// ===== 简易模式操作 =====
const draggingIndex = ref<number | null>(null)
// 正在编辑的标签下标（点击标签弹出编辑面板）
const editingIndex = ref<number | null>(null)

function appendField(key: string) {
  tokens.value.push({ type: 'field', value: key })
}

const customText = ref('')
// 常用连接符，一键插入
const quickTexts = ['/', ' - ', ' ', '.', ' (', ')', '[', ']']

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
/** 当前媒体类型可用的全部字段，供字段/条件下拉使用 */
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

// ===== 字段流分组渲染 =====
interface TokenGroup {
  /** 可选块条件，为空表示必选 */
  cond?: string
  items: { token: RenameToken; index: number }[]
}

/** 相邻且条件相同的 token 合为一组，可选块整体框起来显示 */
const tokenGroups = computed<TokenGroup[]>(() => {
  const groups: TokenGroup[] = []
  tokens.value.forEach((token, index) => {
    const last = groups[groups.length - 1]
    if (token.cond && last?.cond === token.cond) last.items.push({ token, index })
    else groups.push({ cond: token.cond, items: [{ token, index }] })
  })
  return groups
})

/** 纯 / 文本是目录分隔符 */
function isPathSeparator(token: RenameToken): boolean {
  return token.type === 'text' && !token.cond && token.value.trim() === '/'
}

/** 可选块框上的简短条件说明 */
function condLabel(cond: string): string {
  return t('renameFormat.condShort', { field: fieldLabelMap.value[cond] || cond })
}

// ===== 实时预览 =====
const sampleData: ComputedRef<Record<string, string>> = computed(() =>
  props.mediaType === 'tv'
    ? ({
        title: '庆余年',
        year: '2019',
        title_year: '庆余年 (2019)',
        season: '01',
        season_fmt: 'S01',
        episode: '01',
        season_episode: 'S01E01',
        episode_title: '初出茅庐',
        part: '',
        videoFormat: '2160p',
        videoCodec: 'H265',
        audioCodec: 'DTS-HD MA',
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
        year: '2019',
        title_year: '流浪地球 (2019)',
        part: '',
        videoFormat: '2160p',
        videoCodec: 'H265',
        audioCodec: 'DTS-HD MA',
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

/** 预览按目录层级拆分：前面是文件夹，最后一段是文件名 */
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
  fontSize: 14,
  tabSize: 2,
}

function onAceInit(editor: { renderer: { setPadding: (n: number) => void } }) {
  editor.renderer.setPadding(12)
}
</script>

<template>
  <div class="rename-format-editor">
    <!-- 工具栏：左侧由父组件放媒体类型切换，右侧为模式切换与重置 -->
    <div class="rename-format-editor__toolbar">
      <div class="rename-format-editor__toolbar-start">
        <slot name="toolbar" />
      </div>
      <div class="rename-format-editor__toolbar-end">
        <VBtnToggle v-model="mode" color="primary" density="compact" mandatory variant="outlined" divided>
          <VBtn value="simple" size="small">
            <VIcon icon="mdi-cursor-default-click-outline" size="16" class="me-1" />
            {{ t('renameFormat.modeSimple') }}
          </VBtn>
          <VBtn value="advanced" size="small">
            <VIcon icon="mdi-code-tags" size="16" class="me-1" />
            {{ t('renameFormat.modeAdvanced') }}
          </VBtn>
        </VBtnToggle>
        <VBtn size="small" variant="text" prepend-icon="mdi-restore" @click="resetToDefault">
          {{ t('renameFormat.reset') }}
        </VBtn>
      </div>
    </div>

    <!-- 实时示例：按目录层级展示 -->
    <div class="rename-format-editor__preview" data-testid="rename-preview">
      <div class="rename-format-editor__preview-label">
        <VIcon icon="mdi-eye-outline" size="16" class="me-1" />
        {{ t('renameFormat.preview') }}
      </div>
      <div class="rename-format-editor__preview-value">
        <template v-if="previewSegments.length">
          <span v-for="(segment, i) in previewSegments" :key="i" class="rename-format-editor__preview-segment">
            <VIcon
              :icon="i < previewSegments.length - 1 ? 'mdi-folder-outline' : 'mdi-file-video-outline'"
              size="16"
              class="rename-format-editor__preview-icon"
            />
            <span>{{ segment }}</span>
            <VIcon
              v-if="i < previewSegments.length - 1"
              icon="mdi-chevron-right"
              size="16"
              class="rename-format-editor__preview-sep"
            />
          </span>
        </template>
        <span v-else>—</span>
      </div>
    </div>

    <!-- 简易模式：字段流编辑（不显示 jinja 语法） -->
    <template v-if="mode === 'simple'">
      <div class="rename-format-editor__token-area" @drop.prevent="onFieldDrop" @dragover.prevent>
        <template v-if="tokens.length">
          <span
            v-for="(group, groupIndex) in tokenGroups"
            :key="groupIndex"
            :class="group.cond ? 'rename-format-editor__cond-group' : 'rename-format-editor__plain-group'"
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
              }"
              draggable="true"
              @dragstart="draggingIndex = index"
              @drop.stop="onTokenDrop(index)"
              @dragover.prevent
            >
              {{ tokenLabel(token) }}
              <VIcon
                icon="mdi-close"
                size="12"
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
                  <VCardText class="d-flex flex-column ga-3">
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
        <span v-else class="rename-format-editor__token-empty">{{ t('renameFormat.emptyHint') }}</span>
      </div>
      <div class="rename-format-editor__tip">{{ t('renameFormat.editTip') }}</div>

      <!-- 添加面板：字段分组 + 自定义文本，每组一行 -->
      <div class="rename-format-editor__palette">
        <div v-for="group in fieldGroups" :key="group.name" class="rename-format-editor__palette-row">
          <div class="rename-format-editor__palette-label">{{ group.name }}</div>
          <div class="rename-format-editor__palette-items">
            <VChip
              v-for="field in group.fields"
              :key="field.key"
              size="small"
              variant="tonal"
              color="primary"
              prepend-icon="mdi-plus"
              class="rename-format-editor__field-chip"
              @click="appendField(field.key)"
            >
              {{ field.label }}
            </VChip>
          </div>
        </div>
        <div class="rename-format-editor__palette-row">
          <div class="rename-format-editor__palette-label">{{ t('renameFormat.groupText') }}</div>
          <div class="rename-format-editor__palette-items">
            <VChip
              v-for="text in quickTexts"
              :key="text"
              size="small"
              variant="tonal"
              class="rename-format-editor__quick-text"
              @click="tokens.push({ type: 'text', value: text })"
            >
              {{ displayText(text) }}
            </VChip>
            <div class="rename-format-editor__text-input">
              <VTextField
                v-model="customText"
                :placeholder="t('renameFormat.customTextPlaceholder')"
                density="compact"
                variant="outlined"
                hide-details
                @keydown.enter.prevent="appendText"
              />
              <VBtn size="small" variant="tonal" color="primary" :disabled="!customText" @click="appendText">
                {{ t('renameFormat.insertText') }}
              </VBtn>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 进阶模式 -->
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
      <div class="rename-format-editor__tip">
        {{ t('setting.directory.movieRenameFormatHint') }}
      </div>
    </template>
  </div>
</template>

<style scoped>
.rename-format-editor {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* ===== 工具栏 ===== */
.rename-format-editor__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.rename-format-editor__toolbar-start,
.rename-format-editor__toolbar-end {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

/* ===== 实时示例 ===== */
.rename-format-editor__preview {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  padding: 0.625rem 0.75rem;
  border: 1px solid rgba(var(--v-theme-primary), 0.22);
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.05);
  gap: 0.25rem 0.75rem;
}

.rename-format-editor__preview-label {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  color: rgb(var(--v-theme-primary));
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1.5rem;
}

.rename-format-editor__preview-value {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 0.8125rem;
  line-height: 1.5rem;
  min-inline-size: 0;
  word-break: break-all;
}

.rename-format-editor__preview-segment {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.rename-format-editor__preview-icon {
  opacity: 0.6;
}

.rename-format-editor__preview-sep {
  margin-inline: 0.125rem;
  opacity: 0.4;
}

/* ===== 字段流编辑区 ===== */
.rename-format-editor__token-area {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  padding: 0.75rem;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.16);
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.02);
  gap: 0.5rem 0.375rem;
  min-block-size: 3.5rem;
}

.rename-format-editor__plain-group {
  display: contents;
}

/* 可选块：虚线框包住整组，并标注显示条件 */
.rename-format-editor__cond-group {
  position: relative;
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  padding: 0.625rem 0.375rem 0.3125rem;
  border: 1px dashed rgba(var(--v-theme-primary), 0.45);
  border-radius: 8px;
  gap: 0.25rem;
  margin-block-start: 0.375rem;
}

.rename-format-editor__cond-label {
  position: absolute;
  padding-inline: 0.25rem;
  background: rgb(var(--v-theme-surface));
  color: rgba(var(--v-theme-primary), 0.9);
  font-size: 0.6875rem;
  inset-block-start: -0.5rem;
  inset-inline-start: 0.5rem;
  line-height: 1rem;
  white-space: nowrap;
}

.rename-format-editor__token {
  display: inline-flex;
  align-items: center;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8125rem;
  gap: 0.25rem;
  line-height: 1.25rem;
  padding-block: 0.1875rem;
  padding-inline: 0.5rem;
  transition: box-shadow 0.15s;
  user-select: none;
}

.rename-format-editor__token:hover {
  box-shadow: 0 0 0 1px rgba(var(--v-theme-primary), 0.5);
}

.rename-format-editor__token--field {
  background: rgba(var(--v-theme-primary), 0.15);
  color: rgb(var(--v-theme-primary));
  font-weight: 500;
}

.rename-format-editor__token--text {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.16);
  background: rgba(var(--v-theme-on-surface), 0.05);
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-family: 'SFMono-Regular', Consolas, monospace;
}

/* 目录分隔符：弱化底色、加粗斜杠，突出层级 */
.rename-format-editor__token--separator {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 1rem;
  font-weight: 700;
  padding-inline: 0.25rem;
}

.rename-format-editor__token-remove {
  opacity: 0.45;
  transition: opacity 0.15s;
}

.rename-format-editor__token-remove:hover {
  opacity: 1;
}

.rename-format-editor__token-editor {
  inline-size: 18rem;
  max-inline-size: calc(100vw - 2rem);
}

.rename-format-editor__token-editor-mono :deep(input) {
  font-family: 'SFMono-Regular', Consolas, monospace;
}

.rename-format-editor__token-empty {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.8125rem;
}

.rename-format-editor__tip {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  line-height: 1.5;
  margin-block-start: -0.25rem;
}

/* ===== 添加面板 ===== */
.rename-format-editor__palette {
  display: flex;
  flex-direction: column;
  padding: 0.75rem;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.03);
  gap: 0.625rem;
}

.rename-format-editor__palette-row {
  display: grid;
  align-items: start;
  gap: 0.75rem;
  grid-template-columns: 4.5rem minmax(0, 1fr);
}

.rename-format-editor__palette-label {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.5rem;
}

.rename-format-editor__palette-items {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
}

.rename-format-editor__field-chip,
.rename-format-editor__quick-text {
  cursor: pointer;
}

.rename-format-editor__quick-text {
  font-family: 'SFMono-Regular', Consolas, monospace;
  min-inline-size: 2rem;
  justify-content: center;
}

.rename-format-editor__text-input {
  display: flex;
  flex: 1 1 16rem;
  align-items: center;
  gap: 0.375rem;
  max-inline-size: 26rem;
}

.rename-format-editor__text-input :deep(.v-field__input) {
  min-block-size: 2rem;
  padding-block: 0.25rem;
}

@media (width <= 600px) {
  .rename-format-editor__palette-row {
    gap: 0.25rem;
    grid-template-columns: minmax(0, 1fr);
  }

  .rename-format-editor__text-input {
    flex-basis: 100%;
    max-inline-size: none;
  }
}

/* ===== 进阶模式 ===== */
.rename-format-editor__ace {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 8px;
  min-block-size: 10rem;
}

@media (width >= 601px) {
  .rename-format-editor__ace {
    min-block-size: 13rem;
  }
}
</style>
