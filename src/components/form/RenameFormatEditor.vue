<script setup lang="ts">
// 先注册 ace 主题/模式 URL（与全局懒加载路径一致，否则进阶模式主题回退默认浅色）
import '@/ace-config'
import { VAceEditor } from 'vue3-ace-editor'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'
import { evalExpr, parseFormat, serializeTokens, type RenameToken } from './renameFormatTokens'

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

function appendField(key: string) {
  tokens.value.push({ type: 'field', value: key })
}

const customText = ref('')

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
  tokens.value.splice(index, 1)
}

function onTokenDrop(targetIndex: number) {
  const from = draggingIndex.value
  draggingIndex.value = null
  if (from === null || from === targetIndex) return
  const [moved] = tokens.value.splice(from, 1)
  tokens.value.splice(targetIndex, 0, moved)
}

function onFieldDrop() {
  draggingIndex.value = null
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
    <!-- 模式切换 -->
    <div class="rename-format-editor__mode-bar">
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
    </div>

    <!-- 简易模式：字段流编辑（不显示 jinja 语法） -->
    <template v-if="mode === 'simple'">
      <div class="rename-format-editor__token-area" @drop.prevent="onFieldDrop" @dragover.prevent>
        <template v-if="tokens.length">
          <span
            v-for="(token, index) in tokens"
            :key="index"
            class="rename-format-editor__token"
            :class="{
              'rename-format-editor__token--field': token.type === 'field',
              'rename-format-editor__token--text': token.type === 'text',
              'rename-format-editor__token--optional': Boolean(token.cond),
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
          </span>
        </template>
        <span v-else class="rename-format-editor__token-empty">{{ t('renameFormat.emptyHint') }}</span>
      </div>

      <!-- 插入自定义文本 -->
      <div class="rename-format-editor__text-input">
        <VTextField
          v-model="customText"
          :placeholder="t('renameFormat.customTextPlaceholder')"
          density="compact"
          variant="outlined"
          hide-details
          @keydown.enter="appendText"
        >
          <template #append>
            <VBtn size="small" variant="tonal" color="primary" :disabled="!customText" @click="appendText">
              {{ t('renameFormat.insertText') }}
            </VBtn>
          </template>
        </VTextField>
      </div>

      <!-- 字段选择区（两列填满） -->
      <div class="rename-format-editor__fields">
        <div v-for="group in fieldGroups" :key="group.name" class="rename-format-editor__field-group">
          <div class="rename-format-editor__field-group-name">{{ group.name }}</div>
          <div class="rename-format-editor__field-chips">
            <VChip
              v-for="field in group.fields"
              :key="field.key"
              size="small"
              variant="tonal"
              color="primary"
              class="rename-format-editor__field-chip"
              @click="appendField(field.key)"
            >
              {{ field.label }}
            </VChip>
          </div>
        </div>
      </div>

      <!-- 实时预览 -->
      <div class="rename-format-editor__preview">
        <div class="rename-format-editor__preview-label">
          <VIcon icon="mdi-eye-outline" size="16" class="me-1" />
          {{ t('renameFormat.preview') }}
        </div>
        <code class="rename-format-editor__preview-value">{{ preview || '—' }}</code>
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
      <div class="rename-format-editor__hint">
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

.rename-format-editor__mode-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
  gap: 0.375rem;
  min-block-size: 4rem;
}

.rename-format-editor__token {
  display: inline-flex;
  align-items: center;
  border-radius: 6px;
  cursor: grab;
  font-size: 0.8125rem;
  gap: 0.25rem;
  padding-block: 0.25rem;
  padding-inline: 0.5rem;
  user-select: none;
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

.rename-format-editor__token--optional {
  /* 可选块：左侧细条标识，替代整圈虚线 */
  box-shadow: inset 2px 0 0 rgba(var(--v-theme-primary), 0.55);
}

.rename-format-editor__token-cond-icon {
  opacity: 0.7;
}

.rename-format-editor__token-remove {
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.15s;
}

.rename-format-editor__token-remove:hover {
  opacity: 1;
}

.rename-format-editor__token-empty {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.8125rem;
}

/* ===== 自定义文本插入 ===== */
.rename-format-editor__text-input {
  inline-size: 100%;
}

/* ===== 字段选择区 ===== */
.rename-format-editor__fields {
  display: grid;
  gap: 0.5rem 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
}

.rename-format-editor__field-group-name {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  font-weight: 500;
  margin-block-end: 0.25rem;
}

.rename-format-editor__field-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.rename-format-editor__field-chip {
  cursor: pointer;
}

/* ===== 预览 ===== */
.rename-format-editor__preview {
  display: flex;
  border: 1px solid rgba(var(--v-theme-primary), 0.22);
  padding: 0.75rem;

  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.04);
  gap: 0.5rem;
}

.rename-format-editor__preview-label {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  color: rgb(var(--v-theme-primary));
  font-size: 0.8125rem;
  font-weight: 500;
}

.rename-format-editor__preview-value {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 0.8125rem;
  line-height: 1.5;
  word-break: break-all;
}

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

.rename-format-editor__hint {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  line-height: 1.5;
}
</style>
