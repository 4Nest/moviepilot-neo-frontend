<script setup lang="ts">
import api from '@/api'
import MarkdownIt from 'markdown-it'
import mdLinkAttributes from 'markdown-it-link-attributes'
import { useI18n } from 'vue-i18n'

const emit = defineEmits(['close'])

const { t } = useI18n()

// Release 内容来自 GitHub,禁止透传原始 HTML,避免外部内容注入脚本或事件属性。
const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
})
md.use(mdLinkAttributes, {
  attrs: {
    target: '_blank',
    rel: 'noopener noreferrer',
  },
})

// 渲染 Markdown
function renderMarkdown(value: string) {
  if (!value) return ''
  return md.render(value)
}

// 系统环境信息
const systemEnv = ref<Record<string, string>>({})

// 更新日志条目(GitHub Release)
interface ReleaseInfo {
  tag: string
  body: string
  date: string
}

const changelogLoading = ref(true)
const changelogFailed = ref(false)
const releases = ref<ReleaseInfo[]>([])

// 按版本号折叠,默认全部收起
const expandedPanels = ref<number[]>([])

// 查询系统环境
async function querySystemEnv() {
  try {
    const result = (await api.get('system/env')) as { data?: Record<string, string> }
    systemEnv.value = result.data ?? {}
  } catch (error) {
    console.log(error)
  }
}

// 查询 GitHub Release 更新日志,仅保留 neo-v2.x 版本,最多 20 条
async function queryReleaseHistory() {
  changelogLoading.value = true
  changelogFailed.value = false
  try {
    const result = (await api.get('system/versions')) as { data?: Array<Record<string, unknown>> }
    const payload = Array.isArray(result.data) ? result.data : []
    const items: ReleaseInfo[] = []
    for (const release of payload) {
      const tag = String(release?.tag_name || '')
      if (!/^neo-v2\./.test(tag)) continue
      const published = Date.parse(String(release?.published_at ?? ''))
      items.push({
        tag,
        body: String(release?.body || ''),
        date: Number.isNaN(published) ? '' : new Date(published).toLocaleDateString(),
      })
      if (items.length >= 20) break
    }
    releases.value = items
  } catch (error) {
    changelogFailed.value = true
    console.log(error)
  } finally {
    changelogLoading.value = false
  }
}

onMounted(() => {
  querySystemEnv()
  queryReleaseHistory()
})
</script>

<template>
  <VDialog max-width="36rem" scrollable>
    <VCard>
      <VCardItem>
        <VCardTitle>
          <VIcon icon="mdi-information" class="me-2" />
          {{ t('setting.about.title') }}
        </VCardTitle>
        <VDialogCloseBtn @click="emit('close')" />
      </VCardItem>
      <VDivider />
      <VCardText>
        <dl class="about-list">
          <div class="about-row">
            <dt>{{ t('setting.about.softwareVersion') }}</dt>
            <dd>
              <a
                href="https://github.com/4Nest/moviepilot-neo"
                target="_blank"
                rel="noopener noreferrer"
                class="about-version-link"
              >
                <code>{{ systemEnv.VERSION }}</code>
              </a>
            </dd>
          </div>
          <div v-if="systemEnv.FRONTEND_VERSION" class="about-row">
            <dt>{{ t('setting.about.frontendVersion') }}</dt>
            <dd>
              <a
                href="https://github.com/4Nest/moviepilot-neo-frontend"
                target="_blank"
                rel="noopener noreferrer"
                class="about-version-link"
              >
                <code>{{ systemEnv.FRONTEND_VERSION }}</code>
              </a>
            </dd>
          </div>
        </dl>
      </VCardText>
      <VDivider />
      <VCardText class="about-changelog">
        <div class="about-changelog__title">
          <VIcon icon="mdi-history" size="small" class="me-1" />
          {{ t('setting.about.changelog') }}
        </div>
        <VProgressLinear v-if="changelogLoading" indeterminate color="primary" />
        <div v-else-if="changelogFailed" class="text-body-2 text-medium-emphasis">
          {{ t('setting.about.changelogLoadFailed') }}
        </div>
        <div v-else-if="!releases.length" class="text-body-2 text-medium-emphasis">
          {{ t('setting.about.changelogEmpty') }}
        </div>
        <VExpansionPanels v-else v-model="expandedPanels" multiple variant="accordion">
          <VExpansionPanel v-for="(item, index) in releases" :key="item.tag" :value="index">
            <VExpansionPanelTitle class="about-changelog__panel-title">
              <span class="about-changelog__version">{{ item.tag }}</span>
              <span class="text-caption text-medium-emphasis ms-2">{{ item.date }}</span>
            </VExpansionPanelTitle>
            <VExpansionPanelText>
              <div class="markdown-body text-medium-emphasis" v-html="renderMarkdown(item.body)" />
            </VExpansionPanelText>
          </VExpansionPanel>
        </VExpansionPanels>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
.about-list {
  display: grid;
  gap: 1rem;
  margin: 0;
  padding: 0.5rem 0;
}

.about-row {
  display: grid;
  align-items: baseline;
  gap: 0.75rem;
  grid-template-columns: 7rem minmax(0, 1fr);
}

.about-row dt {
  font-size: 0.875rem;
  font-weight: 600;
}


.about-changelog__title {
  display: flex;
  align-items: center;
  font-size: 0.875rem;
  font-weight: 600;
  margin-block-end: 0.5rem;
}

.about-changelog__panel-title {
  min-height: 2.75rem;
}

.about-changelog__version {
  font-size: 0.875rem;
  font-weight: 600;
}

.about-changelog :deep(.markdown-body h1),
.about-changelog :deep(.markdown-body h2),
.about-changelog :deep(.markdown-body h3),
.about-changelog :deep(.markdown-body h4) {
  font-size: 0.875rem;
  font-weight: 600;
  margin-block: 0.5rem;
}

.about-changelog :deep(.markdown-body p) {
  margin-block-end: 0.5rem;
}

.about-changelog :deep(.markdown-body ul),
.about-changelog :deep(.markdown-body ol) {
  margin-block-end: 0.5rem;
  padding-inline-start: 1.25rem;
}

.about-row dd {
  min-inline-size: 0;
  margin: 0;
}

.about-version-link {
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
}

.about-version-link:hover {
  text-decoration: underline;
}
</style>
