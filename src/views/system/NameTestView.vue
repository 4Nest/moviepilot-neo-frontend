<script setup lang="ts">
import { computed, ref } from 'vue'
import { useToast } from 'vue-toastification'
import { requiredValidator } from '@/@validators'
import api from '@/api'
import type { Context, MediaInfo } from '@/api/types'
import { getMediaSubscribeIdentity } from '@/composables/useMediaSubscribe'
import { useNameTestSession } from '@/composables/useNameTestSession'
import { useShortcutTools } from '@/composables/useShortcutTools'
import { useI18n } from 'vue-i18n'

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
        <VRow class="shortcut-form">
          <VCol cols="12" class="shortcut-form-col">
            <VTextarea
              v-model="nameTestForm.title"
              :label="t('nameTest.title')"
              :hint="t('nameTest.titleHint')"
              persistent-hint
              :rules="[requiredValidator]"
              rows="2"
              auto-grow
              prepend-inner-icon="mdi-movie-open"
            />
          </VCol>
          <VCol cols="12" class="shortcut-form-col">
            <VTextarea
              v-model="nameTestForm.subtitle"
              :label="t('nameTest.subtitle')"
              :hint="t('nameTest.subtitleHint')"
              persistent-hint
              rows="2"
              auto-grow
              prepend-inner-icon="mdi-subtitles"
            />
          </VCol>
          <VCol cols="12" class="shortcut-form-col">
            <VTextarea
              v-model="nameTestForm.customWords"
              :label="t('nameTest.customWords')"
              :placeholder="t('nameTest.customWordsPlaceholder')"
              :hint="t('nameTest.customWordsHint')"
              persistent-hint
              rows="3"
              auto-grow
              prepend-inner-icon="mdi-tag-text-outline"
            />
            <div class="custom-words-toolbar">
              <VBtn
                type="button"
                size="small"
                variant="text"
                color="primary"
                class="me-auto"
                @click="openWordsShortcut"
              >
                <template #prepend>
                  <VIcon icon="mdi-format-list-bulleted" />
                </template>
                {{ t('nameTest.openWords') }}
              </VBtn>
              <VBtn
                type="button"
                size="small"
                variant="tonal"
                color="primary"
                :disabled="!nameTestForm.customWords?.trim()"
                :loading="savingCustomWords"
                @click="saveCustomWords"
              >
                <template #prepend>
                  <VIcon icon="mdi-content-save-outline" />
                </template>
                {{ t('nameTest.saveWords') }}
              </VBtn>
            </div>
          </VCol>
          <VCol cols="12" class="shortcut-form-col">
            <VBtn block type="submit" :disabled="nameTestLoading" :loading="nameTestLoading">
              <template #prepend>
                <VIcon icon="mdi-movie-search-outline" />
              </template>
              {{ nameTestText }}
            </VBtn>
          </VCol>
        </VRow>
      </VForm>

      <VAlert
        v-if="nameTestError"
        class="mt-4"
        density="comfortable"
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
            <VIcon :icon="isRecognized ? 'mdi-movie-open-check' : 'mdi-movie-open-remove'" size="32" />
          </div>

          <div class="min-w-0 hero-body">
            <div class="hero-heading">
              <VIcon v-if="!isRecognized" icon="mdi-alert-circle-outline" color="primary" size="20" />
              <span class="hero-title-text text-h6 font-weight-bold">{{ resultTitle }}</span>
            </div>
            <div v-if="metaInfo?.season_episode" class="hero-episode">
              {{ metaInfo.season_episode }}
            </div>
            <div v-if="mediaClassification" class="text-body-2 text-medium-emphasis mt-1">
              {{ mediaClassification }}
            </div>
            <div v-if="resourceChips.length || canViewMediaDetail" class="hero-chips mt-3">
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
              <a
                v-if="canViewMediaDetail"
                class="media-id-badge"
                :href="mediaIdentity?.link"
                target="_blank"
                rel="noopener noreferrer"
              >
                <VIcon icon="mdi-open-in-new" size="13" />
                {{ mediaIdentity?.idPrefix }}ID：{{ mediaIdentity?.id }}
              </a>
            </div>
          </div>
        </div>

        <div class="pipeline">
          <div v-for="(step, idx) in pipelineSteps" :key="step.title" class="pipeline-step">
            <div class="pipeline-marker">
              <VIcon :icon="step.icon" color="primary" size="18" />
              <span v-if="idx < pipelineSteps.length - 1" class="pipeline-connector" />
            </div>
            <div class="pipeline-body">
              <div class="text-caption text-medium-emphasis pipeline-label">
                {{ step.title }}
              </div>
              <div class="text-body-2 font-weight-medium pipeline-value">
                {{ step.value }}
              </div>
            </div>
          </div>
        </div>

        <div v-if="metaInfo?.apply_words?.length" class="applied-words">
          <div class="text-caption text-medium-emphasis applied-words-label">
            {{ t('nameTest.steps.words.title') }}
          </div>
          <div class="words-chips">
            <VChip v-for="word in metaInfo.apply_words" :key="word" size="small" variant="tonal">
              {{ word }}
            </VChip>
          </div>
        </div>
      </div>
      <div v-else class="empty-state">
        <VIcon icon="mdi-movie-search-outline" size="36" />
        <div class="text-body-2 text-medium-emphasis">
          {{ t('nameTest.waitingResult') }}
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.shortcut-workbench {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  padding-block-start: 0.5rem;
}

.shortcut-panel {
  padding: 1rem;
  border: var(--app-surface-border);
  border-radius: var(--app-surface-radius);
  backdrop-filter: var(--app-grouped-list-backdrop-filter);
  background: var(--app-grouped-list-background);
  box-shadow: var(--app-surface-shadow);
}

.shortcut-form {
  margin: 0;
}

.shortcut-form-col {
  padding-inline: 0;
}

.shortcut-form-col:first-child {
  padding-block-start: 0;
}

.shortcut-form-col:last-child {
  padding-block-end: 0;
}

.custom-words-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-block-start: 0.5rem;
}

.result-stack {
  display: grid;
  gap: 1rem;
}

.result-hero {
  display: grid;
  align-items: center;
  padding: 0.75rem;
  border: var(--app-surface-border);
  border-radius: var(--app-surface-radius);
  background: rgba(var(--v-theme-primary), 0.08);
  gap: 1rem;
  grid-template-columns: 6.5rem minmax(0, 1fr);
}

.result-hero--failed {
  background: rgba(var(--v-theme-error), 0.08);
}

.hero-poster {
  overflow: hidden;
  border: var(--app-surface-border);
  border-radius: var(--app-control-radius);
  aspect-ratio: 2 / 3;
  background: rgba(var(--v-theme-surface-variant), 0.35);
}

.hero-poster--empty {
  display: grid;
  place-items: center;
}

.hero-body {
  overflow: hidden;
  min-inline-size: 0;
}

.hero-heading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.hero-title-text {
  min-inline-size: 0;
}

/* 季集突出显示 */
.hero-episode {
  color: rgb(var(--v-theme-primary));
  font-size: 1.05rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  margin-block-start: 0.25rem;
}

.hero-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  min-inline-size: 0;
}

.hero-chip {
  max-inline-size: 100%;
}

/* 媒体 ID 徽章：与资源标签区分开的虚线描边药丸 */
.media-id-badge {
  display: inline-flex;
  overflow: hidden;
  align-items: center;
  padding: 0.3rem 0.7rem;
  border: 1px dashed rgba(var(--v-theme-primary), 0.55);
  font-size: 0.78rem;
  font-weight: 600;
  max-inline-size: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-decoration: none;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;
}

.media-id-badge:hover {
  background: rgba(var(--v-theme-primary), 0.1);
  border-color: rgb(var(--v-theme-primary));
}

.pipeline {
  display: flex;
  min-inline-size: 0;
  flex-direction: column;
}

.shortcut-result-panel {
  min-inline-size: 0;
}

.pipeline-step {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: 1.75rem minmax(0, 1fr);
}

.pipeline-marker {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-block-size: 100%;
}

.pipeline-connector {
  flex: 1;
  background: rgba(var(--v-theme-primary), 0.25);
  inline-size: 2px;
  margin-block-start: 0.3rem;
}

.pipeline-body {
  min-inline-size: 0;
  padding-block-end: 0.9rem;
}

.pipeline-step:last-child .pipeline-body {
  padding-block-end: 0;
}

.pipeline-label {
  letter-spacing: 0.02em;
}

.pipeline-value {
  margin-block-start: 0.2rem;
  overflow-wrap: anywhere;
  word-break: break-all;
}

.applied-words {
  display: grid;
  border-block-start: var(--app-surface-border);
  gap: 0.5rem;
  padding-block: 0.4rem;
}

.applied-words-label {
  letter-spacing: 0.02em;
}

.words-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.empty-state {
  display: grid;
  align-content: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  gap: 0.75rem;
  min-block-size: 14rem;
  place-items: center;
  text-align: center;
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
    padding: 0.8rem;
  }

  .result-hero {
    grid-template-columns: 5.5rem minmax(0, 1fr);
  }
}
</style>
