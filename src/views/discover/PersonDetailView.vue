<script setup lang="ts">
import MediaCardListView from './MediaCardListView.vue'
import api from '@/api'
import personIcon from '@images/misc/person.png'
import type { Person } from '@/api/types'
import NoDataFound from '@/components/states/NoDataFound.vue'
import { useI18n } from '@/composables/useChineseText'
import { useGlobalSettingsStore } from '@/stores'
import { getDisplayImageUrl } from '@/utils/imageUtils'
import MarkdownIt from 'markdown-it'
import mdLinkAttributes from 'markdown-it-link-attributes'

// 国际化
const { t } = useI18n()

// 输入参数
const personProps = defineProps({
  personid: String,
  type: String,
  source: String,
})

// 全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// AniList 人物简介使用 Markdown；禁用原始 HTML，避免第三方内容注入标签或事件属性。
const markdown = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: true,
  typographer: true,
})
markdown.use(mdLinkAttributes, {
  attrs: {
    target: '_blank',
    rel: 'noopener noreferrer',
  },
})

// 人物详情
const personDetail = ref<Person>({} as Person)

// 是否已加载完成
const isRefreshed = ref(false)

// 缺省 source 默认回退为 themoviedb
const effectiveSource = computed(() => personProps.source || 'themoviedb')

// 仅转换 AniList 的 Markdown 简介，其他数据源保持纯文本展示。
const personBiographyHtml = computed(() => {
  const bio = personDetail.value.biography?.trim()
  if (effectiveSource.value !== 'anilist' || !bio) return ''
  return markdown.render(bio)
})

const hasPersonBiography = computed(() =>
  Boolean(personBiographyHtml.value.trim() || personDetail.value?.biography?.trim()),
)

// 合并出生日期与出生地，避免单边缺失时裸露分隔符
const personBirthSummary = computed(() =>
  [personDetail.value?.birthday?.trim(), personDetail.value?.place_of_birth?.trim()].filter(Boolean).join(' · '),
)

// 过滤空白别名项，仅在有效别名非空时展示
const personAliasesText = computed(() => {
  const aliases = (personDetail.value?.also_known_as ?? []).map(item => item?.trim()).filter(Boolean) as string[]
  if (aliases.length === 0) return ''
  if (effectiveSource.value === 'themoviedb') {
    return t('person.alias') + aliases.join('、')
  }
  return aliases.join('，')
})

// 调用API查询详情
async function getPersonDetail() {
  personDetail.value = {} as Person
  if (!personProps.personid) {
    isRefreshed.value = true
    return
  }

  isRefreshed.value = false
  try {
    if (effectiveSource.value === 'themoviedb') {
      personDetail.value = await api.get(`tmdb/person/${personProps.personid}`)
    } else if (effectiveSource.value === 'douban') {
      personDetail.value = await api.get(`douban/person/${personProps.personid}`)
    } else if (effectiveSource.value === 'bangumi') {
      personDetail.value = await api.get(`bangumi/person/${personProps.personid}`)
    } else if (effectiveSource.value === 'anilist') {
      personDetail.value = await api.get(`anilist/person/${personProps.personid}`)
    }
  } catch (error) {
    console.error(error)
  } finally {
    isRefreshed.value = true
  }
}

// 人物图片地址
function getPersonImage() {
  let url = ''
  if (effectiveSource.value === 'themoviedb') {
    if (!personDetail.value?.profile_path) return personIcon
    url = `https://${globalSettings.TMDB_IMAGE_DOMAIN}/t/p/w600_and_h900_bestv2${personDetail.value?.profile_path}`
  } else if (effectiveSource.value === 'douban') {
    if (!personDetail.value?.avatar) return personIcon
    if (typeof personDetail.value?.avatar === 'object') {
      url = personDetail.value?.avatar?.normal
    } else {
      url = personDetail.value?.avatar
    }
  } else if (effectiveSource.value === 'bangumi') {
    if (!personDetail.value?.images) return personIcon
    url = personDetail.value?.images?.medium
  } else if (effectiveSource.value === 'anilist') {
    if (!personDetail.value?.images) return personIcon
    url = personDetail.value?.images?.large || personDetail.value?.images?.medium
  } else {
    return personIcon
  }
  return getDisplayImageUrl(url, globalSettings.GLOBAL_IMAGE_CACHE)
}

// 参演作品路由地址
function getPersonCreditsPath() {
  let apipath = 'tmdb'
  if (effectiveSource.value === 'douban') {
    apipath = 'douban'
  } else if (effectiveSource.value === 'bangumi') {
    apipath = 'bangumi'
  } else if (effectiveSource.value === 'anilist') {
    apipath = 'anilist'
  }
  return `/browse/${apipath}/person/credits/${personDetail.value.id}?title=${t('person.credits')}`
}

// 参演作品API路径
function getPersonCreditsApiPath() {
  let apipath = 'tmdb'
  if (effectiveSource.value === 'douban') {
    apipath = 'douban'
  } else if (effectiveSource.value === 'bangumi') {
    apipath = 'bangumi'
  } else if (effectiveSource.value === 'anilist') {
    apipath = 'anilist'
  }
  return `${apipath}/person/credits/${personDetail.value.id}`
}

watch(
  () => [personProps.personid, personProps.source],
  () => {
    void getPersonDetail()
  },
)

onBeforeMount(() => {
  void getPersonDetail()
})
</script>

<template>
  <LoadingBanner v-if="!isRefreshed" class="mt-12" />
  <div v-if="personDetail.id" class="person-page">
    <div class="person-header">
      <div class="person-portrait">
        <VImg :src="getPersonImage()" aspect-ratio="2/3" cover class="w-full h-full" />
      </div>
      <div class="person-meta">
        <h1 class="person-heading">
          {{ personDetail.name }}
        </h1>
        <div v-if="personBirthSummary || personAliasesText" class="person-attributes">
          <div v-if="personBirthSummary" class="person-birth">{{ personBirthSummary }}</div>
          <div v-if="personAliasesText" class="person-aliases">{{ personAliasesText }}</div>
        </div>
      </div>
    </div>

    <section v-if="hasPersonBiography" class="person-story-block">
      <h2 class="person-section-heading">{{ t('person.biography') }}</h2>
      <div v-if="effectiveSource === 'anilist'" class="person-biography" v-html="personBiographyHtml" />
      <p v-else class="person-biography-text">
        {{ personDetail.biography }}
      </p>
    </section>

    <section class="person-credits-section">
      <div class="person-credits-header">
        <RouterLink :to="getPersonCreditsPath()" class="person-credits-link">
          <span>{{ t('person.credits') }}</span>
          <VIcon icon="mdi-chevron-right" size="18" class="ms-0.5" />
        </RouterLink>
      </div>
      <MediaCardListView :apipath="getPersonCreditsApiPath()" />
    </section>
  </div>
  <NoDataFound
    v-if="!personDetail.id && isRefreshed"
    error-code="500"
    :error-title="t('error.title')"
    :error-description="t('error.networkError')"
  >
    <template v-if="personProps.personid" #button>
      <VBtn prepend-icon="mdi-refresh" size="small" variant="tonal" @click="getPersonDetail">
        {{ t('common.retry') }}
      </VBtn>
    </template>
  </NoDataFound>
</template>

<style scoped>
.person-page {
  padding-block: 0.75rem 1.5rem;
}

.person-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.875rem;
  margin-block-end: 1.375rem;
}

.person-portrait {
  flex-shrink: 0;
  overflow: hidden;
  border: 1px solid var(--mp-border-hover);
  border-radius: 10px;
  aspect-ratio: 2 / 3;
  background: var(--mp-item-bg);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.24);
  inline-size: 7.5rem;
}

.person-meta {
  display: flex;
  flex: 1 1 0%;
  flex-direction: column;
  gap: 0.375rem;
  min-inline-size: 0;
  text-align: center;
}

.person-heading {
  margin: 0;
  color: rgb(var(--v-theme-on-surface));
  font-size: 1.375rem;
  font-weight: 700;
  letter-spacing: -0.015em;
  line-height: 1.3;
}

.person-attributes {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  color: rgba(var(--v-theme-on-surface), 0.68);
  font-size: 13px;
  line-height: 1.45;
}

.person-aliases {
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 12.5px;
  overflow-wrap: break-word;
}

@media (width >= 768px) {
  .person-header {
    flex-direction: row;
    align-items: flex-end;
    gap: 1.25rem;
  }

  .person-portrait {
    inline-size: 9rem;
  }

  .person-meta {
    padding-block-end: 2px;
    text-align: start;
  }

  .person-heading {
    font-size: 1.625rem;
  }
}

.person-story-block {
  padding: 12px 14px;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 10px;
  background: var(--mp-item-bg);
  margin-block-end: 1.5rem;
}

.person-section-heading {
  margin: 0 0 0.45rem;
  color: rgba(var(--v-theme-on-surface), 0.92);
  font-size: 0.9375rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1.4;
}

.person-biography,
.person-biography-text {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.8);
  font-size: 0.84375rem;
  line-height: 1.7;
  overflow-wrap: break-word;
}

.person-biography-text {
  white-space: pre-line;
}

.person-biography :deep(p),
.person-biography :deep(ul),
.person-biography :deep(ol),
.person-biography :deep(blockquote) {
  margin-block: 0 0.65rem;
}

.person-biography :deep(ul),
.person-biography :deep(ol) {
  padding-inline-start: 1.5rem;
}

.person-biography :deep(a) {
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
}

.person-biography :deep(a:hover) {
  text-decoration: underline;
}

.person-biography :deep(blockquote) {
  border-inline-start: 3px solid rgba(var(--v-theme-on-surface), 0.25);
  color: rgba(var(--v-theme-on-surface), 0.7);
  padding-inline-start: 0.75rem;
}

.person-biography :deep(:last-child) {
  margin-block-end: 0;
}

.person-credits-section {
  margin-block-start: 1.25rem;
}

.person-credits-header {
  display: flex;
  align-items: center;
  margin-block-end: 0.25rem;
}

.person-credits-link {
  display: inline-flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), 0.92);
  font-size: 0.9375rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1.4;
  text-decoration: none;
  transition: color 0.15s ease;
}

.person-credits-link:hover {
  color: rgb(var(--v-theme-primary));
}

@media (width <= 600px) {
  .person-page {
    padding-block: 4px 16px;
  }

  .person-header {
    padding: 14px;
    border: 1px solid var(--mp-border-card);
    border-radius: 12px;
    background: rgb(var(--v-theme-surface));
    gap: 10px;
    margin-block-end: 12px;
  }

  .person-portrait {
    border-color: var(--mp-border-card);
    border-radius: 10px;
    box-shadow: none;
    inline-size: 6.5rem;
  }

  .person-heading {
    font-size: 1.2rem;
    overflow-wrap: anywhere;
    word-break: normal;
  }

  .person-attributes {
    font-size: 12px;
  }

  .person-aliases {
    font-size: 11.5px;
    overflow-wrap: anywhere;
    word-break: normal;
  }

  .person-story-block {
    padding: 12px 14px;
    border: 1px solid var(--mp-border-card);
    border-radius: 12px;
    background: rgb(var(--v-theme-surface));
    margin-block-end: 12px;
  }

  .person-section-heading {
    font-size: 14px;
  }

  .person-biography,
  .person-biography-text {
    font-size: 13px;
    line-height: 1.65;
    overflow-wrap: anywhere;
    word-break: normal;
  }

  .person-credits-section {
    margin-block-start: 14px;
  }
}
</style>
