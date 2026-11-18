<script setup lang="ts">
import { computed, ref } from 'vue'
import { useToast } from 'vue-toastification'
import { requiredValidator } from '@/@validators'
import api from '@/api'
import type { Context, MediaInfo } from '@/api/types'
import { getMediaSubscribeIdentity } from '@/composables/useMediaSubscribe'
import { useNameTestSession } from '@/composables/useNameTestSession'
import { useShortcutTools } from '@/composables/useShortcutTools'
import { useI18n } from '@/composables/useChineseText'

interface PipelineStep {
  icon: string
  title: string
  value: string
}

interface MediaIdentity {
  id: string
  idPrefix: string
  link?: string
}

// 国际化
const { t } = useI18n()
// 提示
const $toast = useToast()

// 捷径工具（用于跳转到词表管理）
const { visibleShortcuts, openShortcutDialog } = useShortcutTools()

/** 打开词表管理弹窗（叠加在当前弹窗之上，关闭后编辑内容仍在）。 */
function openWordsShortcut() {
  const wordsTool = visibleShortcuts.value.find(shortcut => shortcut.dialog === 'words')
  if (wordsTool) openShortcutDialog(wordsTool)
}

// 识别结果
const nameTestResult = ref<Context>()

// 名称识别表单（会话级保留，弹窗关闭重开不丢失）
const nameTestForm = useNameTestSession()

// 识别按钮状态
const nameTestLoading = ref(false)

// 识别按钮文本
const nameTestText = ref(t('nameTest.recognize'))

// 是否显示结果
const showResult = ref(false)

// 请求错误提示
const nameTestError = ref('')

// 识别词保存中状态
const savingCustomWords = ref(false)

const metaInfo = computed(() => nameTestResult.value?.meta_info)
const mediaInfo = computed(() => nameTestResult.value?.media_info)
const isRecognized = computed(() => Boolean(metaInfo.value?.name))
// 名称（年份）作为结果主标题
const resultTitle = computed(() => {
  const name = mediaInfo.value?.title || metaInfo.value?.name || t('nameTest.unrecognized')
  const year = mediaInfo.value?.year || metaInfo.value?.year
  return year ? `${name}（${year}）` : name
})
const mediaClassification = computed(() => {
  return [mediaInfo.value?.type || metaInfo.value?.type, mediaInfo.value?.category].filter(Boolean).join(' · ') || ''
})
const resourceChips = computed(() => {
  return [
    metaInfo.value?.web_source,
    metaInfo.value?.edition,
    metaInfo.value?.resource_pix,
    metaInfo.value?.video_encode,
    metaInfo.value?.audio_encode,
    metaInfo.value?.resource_team,
  ].filter(Boolean) as string[]
})
// 有媒体源官方链接时展示「查看详情」入口（跳转 TMDB 等官方页面）
const canViewMediaDetail = computed(() => Boolean(mediaIdentity.value?.link))

/** 生成媒体源官方详情页地址。 */
function getMediaOfficialLink(media: MediaInfo, source: string, mediaId: string) {
  const encodedId = encodeURIComponent(mediaId)

  switch (source) {
    case 'themoviedb': {
      const mediaType = media.type?.trim().toLowerCase()
      return `https://www.themoviedb.org/${mediaType === '电影' || mediaType === 'movie' ? 'movie' : 'tv'}/${encodedId}`
    }
    case 'douban':
      return `https://movie.douban.com/subject/${encodedId}`
    case 'bangumi':
      return `https://bgm.tv/subject/${encodedId}`
    case 'anilist':
      return `https://anilist.co/anime/${encodedId}`
    default:
      return undefined
  }
}

// 媒体源 ID 前缀（徽章展示用）
const MEDIA_SOURCE_ID_PREFIX: Record<string, string> = {
  anilist: 'AniList',
  bangumi: 'BGM',
  douban: '豆瓣',
  themoviedb: 'TMDB',
}

/** 生成识别结果中的数据源原生 ID，并兼容旧接口字段。 */
function getMediaIdentity(media?: MediaInfo): MediaIdentity | undefined {
  if (!media) return undefined

  const identity = getMediaSubscribeIdentity(media)
  if (!identity) return undefined

  return {
    id: identity.mediaId,
    idPrefix: MEDIA_SOURCE_ID_PREFIX[identity.source] || identity.source.toUpperCase(),
    link: getMediaOfficialLink(media, identity.source, identity.mediaId),
  }
}

const mediaIdentity = computed(() => getMediaIdentity(mediaInfo.value))

const pipelineSteps = computed<PipelineStep[]>(() => {
  const steps: PipelineStep[] = [
    {
      icon: 'mdi-file-document-outline',
      title: t('nameTest.steps.original.title'),
      // 原始输入标题（识别词处理前）
      value: metaInfo.value?.title || nameTestForm.title || '-',
    },
  ]

  // 识别词生效时展示处理后的识别标题
  if (metaInfo.value?.apply_words?.length) {
    steps.push({
      icon: 'mdi-tag-check-outline',
      title: t('nameTest.steps.recognized.title'),
      value: metaInfo.value?.org_string || '-',
    })
  }

  return steps
})

/** 将 TMDB 原始图片地址转换为弹窗内更轻量的海报缩略图。 */
function getPosterImage(url = '') {
  if (!url) return ''
  return url.replace('original', 'w500')
}

/** 调用媒体识别接口并刷新解析工作台，输入的识别词会临时应用于本次识别测试。 */
async function nameTest() {
  const normalizedTitle = nameTestForm.title?.trim() || ''
  if (!normalizedTitle) return

  nameTestForm.title = normalizedTitle

  try {
    nameTestLoading.value = true
    nameTestText.value = t('nameTest.recognizing')
    nameTestError.value = ''
    showResult.value = false
    nameTestResult.value = await api.get<Context, Context>('media/recognize', {
      params: {
        title: nameTestForm.title,
        subtitle: nameTestForm.subtitle,
        custom_words: nameTestForm.customWords?.trim() || undefined,
      },
    })
    nameTestText.value = t('nameTest.recognizeAgain')
    showResult.value = true
  } catch (error) {
    console.error(error)
    nameTestError.value = error instanceof Error ? error.message : t('nameTest.requestFailed')
  } finally {
    nameTestLoading.value = false
  }
}

/** 将识别词文本拆分为按行的规则列表，过滤掉空白行。 */
function parseCustomWordLines(text: string) {
  return text.split('\n').filter(line => line.trim().length > 0)
}

/** 将当前输入的识别词追加保存到系统识别词表末尾。 */
async function saveCustomWords() {
  if (savingCustomWords.value) return

  const newLines = parseCustomWordLines(nameTestForm.customWords || '')
  if (!newLines.length) return

  savingCustomWords.value = true
  try {
    const queryResult: { [key: string]: any } = await api.get('system/setting/CustomIdentifiers')
    const existingLines: string[] = Array.isArray(queryResult?.data?.value) ? queryResult.data.value : []
    const appendLines = newLines.filter(line => !existingLines.includes(line))

    if (!appendLines.length) {
      $toast.warning(t('nameTest.saveWordsNoChange'))
      return
    }

    const saveResult: { [key: string]: any } = await api.post('system/setting/CustomIdentifiers', [
      ...existingLines,
      ...appendLines,
    ])

    if (saveResult.success) $toast.success(t('nameTest.saveWordsSuccess'))
    else $toast.error(saveResult.message || t('nameTest.saveWordsFailed'))
  } catch (error) {
    console.error(error)
    $toast.error(t('nameTest.saveWordsFailed'))
  } finally {
    savingCustomWords.value = false
  }
}
</script>

<template>
  <div class="shortcut-workbench">
    <section class="shortcut-panel shortcut-input-panel">
      <VForm validate-on="submit lazy" @submit.prevent="nameTest">
        <div class="shortcut-form-stack">
          <VTextarea
            v-model="nameTestForm.title"
            :label="t('nameTest.title')"
            :hint="t('nameTest.titleHint')"
            persistent-hint
            density="compact"
            variant="outlined"
            :rules="[requiredValidator]"
            rows="2"
            auto-grow
            prepend-inner-icon="mdi-movie-open"
          />
          <VTextarea
            v-model="nameTestForm.subtitle"
            :label="t('nameTest.subtitle')"
            :hint="t('nameTest.subtitleHint')"
            persistent-hint
            density="compact"
            variant="outlined"
            rows="2"
            auto-grow
            prepend-inner-icon="mdi-subtitles"
          />
          <div>
            <VTextarea
              v-model="nameTestForm.customWords"
              :label="t('nameTest.customWords')"
              :placeholder="t('nameTest.customWordsPlaceholder')"
              :hint="t('nameTest.customWordsHint')"
              persistent-hint
              density="compact"
              variant="outlined"
              rows="2"
              auto-grow
              prepend-inner-icon="mdi-tag-text-outline"
            />
          </div>

          <div class="shortcut-action-bar">
            <VBtn type="button" size="small" variant="text" color="primary" class="me-auto" @click="openWordsShortcut">
              <template #prepend>
                <VIcon icon="mdi-format-list-bulleted" size="16" />
              </template>
              {{ t('nameTest.openWords') }}
            </VBtn>
            <VBtn
              type="button"
              variant="tonal"
              color="primary"
              :disabled="!nameTestForm.customWords?.trim()"
              :loading="savingCustomWords"
              @click="saveCustomWords"
            >
              <template #prepend>
                <VIcon icon="mdi-content-save-outline" size="16" />
              </template>
              {{ t('nameTest.saveWords') }}
            </VBtn>
            <VBtn
              type="submit"
              color="primary"
              variant="flat"
              class="shortcut-submit-btn"
              :disabled="nameTestLoading"
              :loading="nameTestLoading"
            >
              <template #prepend>
                <VIcon icon="mdi-movie-search-outline" size="16" />
              </template>
              {{ nameTestText }}
            </VBtn>
          </div>
        </div>
      </VForm>

      <VAlert
        v-if="nameTestError"
        class="mt-3"
        density="compact"
        icon="mdi-alert-circle-outline"
        type="error"
        variant="tonal"
      >
        {{ nameTestError }}
      </VAlert>
    </section>

    <section class="shortcut-panel shortcut-result-panel">
      <div v-if="showResult" class="result-stack">
        <div class="result-hero" :class="{ 'result-hero--failed': !isRecognized }">
          <div v-if="mediaInfo?.poster_path" class="hero-poster">
            <VImg :src="getPosterImage(mediaInfo.poster_path)" aspect-ratio="2/3" cover>
              <template #placeholder>
                <VSkeletonLoader class="h-100 w-100" />
              </template>
            </VImg>
          </div>
          <div v-else class="hero-poster hero-poster--empty">
            <VIcon :icon="isRecognized ? 'mdi-movie-open-check' : 'mdi-movie-open-remove'" size="26" />
          </div>

          <div class="min-w-0 hero-body">
            <div class="hero-heading">
              <VIcon v-if="!isRecognized" icon="mdi-alert-circle-outline" color="error" size="18" />
              <span class="hero-title-text">{{ resultTitle }}</span>
            </div>
            <div v-if="metaInfo?.season_episode" class="hero-episode">
              {{ metaInfo.season_episode }}
            </div>
            <div v-if="mediaClassification" class="hero-classification">
              {{ mediaClassification }}
            </div>
            <div v-if="resourceChips.length || canViewMediaDetail" class="hero-chips">
              <VChip
                v-for="chip in resourceChips"
                :key="chip"
                class="hero-chip"
                color="primary"
                size="small"
                variant="tonal"
              >
                {{ chip }}
              </VChip>
              <VChip
                v-if="canViewMediaDetail"
                class="media-id-badge"
                color="primary"
                size="small"
                variant="tonal"
                :href="mediaIdentity?.link"
                target="_blank"
                rel="noopener noreferrer"
              >
                <template #prepend>
                  <VIcon icon="mdi-open-in-new" size="13" />
                </template>
                {{ mediaIdentity?.idPrefix }}ID：{{ mediaIdentity?.id }}
              </VChip>
            </div>
          </div>
        </div>

        <div class="pipeline">
          <div v-for="(step, idx) in pipelineSteps" :key="step.title" class="pipeline-step">
            <div class="pipeline-marker">
              <VIcon :icon="step.icon" color="primary" size="16" />
              <span v-if="idx < pipelineSteps.length - 1" class="pipeline-connector" />
            </div>
            <div class="pipeline-body">
              <div class="pipeline-label">
                {{ step.title }}
              </div>
              <div class="pipeline-value">
                {{ step.value }}
              </div>
            </div>
          </div>
        </div>

        <div v-if="metaInfo?.apply_words?.length" class="applied-words">
          <div class="applied-words-label">
            {{ t('nameTest.steps.words.title') }}
          </div>
          <div class="words-chips">
            <VChip
              v-for="word in metaInfo.apply_words"
              :key="word"
              class="applied-word-chip"
              size="small"
              variant="tonal"
            >
              {{ word }}
            </VChip>
          </div>
        </div>
      </div>
      <div v-else class="empty-state">
        <span class="empty-state__icon">
          <VIcon icon="mdi-movie-search-outline" size="22" />
        </span>
        <div class="empty-state__text">
          {{ t('nameTest.waitingResult') }}
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.shortcut-workbench {
  display: grid;
  gap: 13px;
  grid-template-columns: minmax(0, 1.08fr) minmax(0, 1fr);
  padding-block-start: 6px;
  inline-size: 100%;
  min-inline-size: 0;
}

.shortcut-panel {
  padding: 14px 16px;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: rgb(var(--v-theme-surface));
  min-inline-size: 0;
}

.shortcut-form-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.shortcut-form-stack :deep(.v-field) {
  border-radius: 8px;
  background: var(--mp-field-bg);
}

.shortcut-action-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  border-block-start: 1px solid var(--mp-border-subtle);
  gap: 8px;
  margin-block-start: 2px;
  padding-block-start: 10px;
}

.shortcut-submit-btn {
  min-inline-size: 88px;
}

.result-stack {
  display: grid;
  gap: 10px;
  grid-template-columns: minmax(0, 1fr);
  min-inline-size: 0;
}

.result-stack > * {
  min-inline-size: 0;
}

.result-hero {
  display: grid;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: var(--mp-field-bg);
  gap: 13px;
  grid-template-columns: 68px minmax(0, 1fr);
  inline-size: 100%;
  min-inline-size: 0;
}

.result-hero--failed {
  border-color: rgba(var(--v-theme-error), 0.28);
  background: rgba(var(--v-theme-error), 0.05);
}

.hero-poster {
  overflow: hidden;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 8px;
  aspect-ratio: 2 / 3;
  background: var(--mp-item-bg);
}

.hero-poster--empty {
  display: grid;
  place-items: center;
  color: rgba(var(--v-theme-on-surface), 0.45);
}

.hero-body {
  overflow: hidden;
  min-inline-size: 0;
}

.hero-heading {
  display: flex;
  align-items: center;
  gap: 6px;
}

.hero-title-text {
  min-inline-size: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 15.5px;
  font-weight: 650;
  line-height: 1.3;
}

/* 季集突出显示 */
.hero-episode {
  color: rgb(var(--v-theme-primary));
  font-size: 13.5px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  letter-spacing: 0.02em;
  margin-block-start: 3px;
}

.hero-classification {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  margin-block-start: 3px;
}

.hero-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-block-start: 8px;
  min-inline-size: 0;
}

.hero-chip,
.media-id-badge {
  block-size: 22px;
  font-size: 11.5px;
  max-inline-size: 100%;
}

/* 媒体 ID 标签：沿用资源标签样式，同时保留官方详情页链接。 */
.media-id-badge {
  font-variant-numeric: tabular-nums;
  text-decoration: none;
}

.pipeline {
  display: flex;
  min-inline-size: 0;
  flex-direction: column;
  padding: 12px 14px;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: var(--mp-field-bg);
  inline-size: 100%;
}

.shortcut-result-panel {
  min-inline-size: 0;
}

.pipeline-step {
  display: grid;
  gap: 10px;
  grid-template-columns: 20px minmax(0, 1fr);
  min-inline-size: 0;
}

.pipeline-marker {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-block-size: 100%;
  padding-block-start: 2px;
}

.pipeline-connector {
  flex: 1;
  background: var(--mp-border-subtle);
  inline-size: 1px;
  margin-block-start: 4px;
}

.pipeline-body {
  min-inline-size: 0;
  padding-block-end: 10px;
}

.pipeline-step:last-child .pipeline-body {
  padding-block-end: 0;
}

.pipeline-label {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11.5px;
  line-height: 1.3;
}

.pipeline-value {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 13px;
  font-weight: 500;
  line-height: 1.45;
  margin-block-start: 3px;
  overflow-wrap: anywhere;
  word-break: break-all;
}

.applied-words {
  display: grid;
  padding: 10px 14px;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: var(--mp-field-bg);
  gap: 8px;
}

.applied-words-label {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11.5px;
}

.words-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-inline-size: 0;
}

.applied-word-chip {
  block-size: auto;
  max-inline-size: 100%;
  padding: 4px 10px;
  border-radius: 7px;
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 12px;
  line-height: 1.45;
  white-space: normal;
}

.applied-word-chip :deep(.v-chip__content) {
  min-inline-size: 0;
  overflow-wrap: anywhere;
  white-space: normal;
}

.empty-state {
  display: grid;
  align-content: center;
  padding: 24px;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: var(--mp-field-bg);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  gap: 10px;
  min-block-size: 14rem;
  place-items: center;
  text-align: center;
}

.empty-state__icon {
  display: grid;
  place-items: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 9px;
  background: rgba(var(--v-theme-primary), 0.1);
  block-size: 36px;
  color: rgb(var(--v-theme-primary));
  inline-size: 36px;
}

.empty-state__text {
  font-size: 12.5px;
}

@media (width <= 760px) {
  .shortcut-workbench {
    grid-template-columns: minmax(0, 1fr);
  }

  .hero-heading {
    flex-wrap: wrap;
  }

  .hero-title-text {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
  }
}

@media (width <= 420px) {
  .shortcut-panel {
    padding: 12px;
  }

  .result-hero {
    grid-template-columns: 60px minmax(0, 1fr);
  }
}
</style>
