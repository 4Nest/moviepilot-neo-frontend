<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import api from '@/api'
import { RecommendSource } from '@/api/types'
import { useI18n } from '@/composables/useChineseText'

const { t } = useI18n()

defineProps({
  id: {
    type: String,
    required: true,
  },
  data: {
    type: Object,
    required: true,
  },
})

// 内置榜单
const innerList = [
  {
    'api_path': 'recommend/tmdb_trending',
    'name': t('workflow.fetchMedias.tmdbTrending'),
  },
  {
    'api_path': 'recommend/douban_showing',
    'name': t('workflow.fetchMedias.doubanShowing'),
  },
  {
    'api_path': 'recommend/bangumi_calendar',
    'name': t('workflow.fetchMedias.bangumiCalendar'),
  },
  {
    'api_path': 'recommend/tmdb_movies',
    'name': t('workflow.fetchMedias.tmdbMovies'),
  },
  {
    'api_path': 'recommend/tmdb_tvs?with_original_language=zh|en|ja|ko',
    'name': t('workflow.fetchMedias.tmdbTvs'),
  },
  {
    'api_path': 'recommend/douban_movie_hot',
    'name': t('workflow.fetchMedias.doubanMovieHot'),
  },
  {
    'api_path': 'recommend/douban_tv_hot',
    'name': t('workflow.fetchMedias.doubanTvHot'),
  },
  {
    'api_path': 'recommend/douban_tv_animation',
    'name': t('workflow.fetchMedias.doubanTvAnimation'),
  },
  {
    'api_path': 'recommend/douban_movies',
    'name': t('workflow.fetchMedias.doubanMovies'),
  },
  {
    'api_path': 'recommend/douban_tvs',
    'name': t('workflow.fetchMedias.doubanTvs'),
  },
  {
    'api_path': 'recommend/douban_movie_top250',
    'name': t('workflow.fetchMedias.doubanMovieTop250'),
  },
  {
    'api_path': 'recommend/douban_tv_weekly_chinese',
    'name': t('workflow.fetchMedias.doubanTvWeeklyChinese'),
  },
  {
    'api_path': 'recommend/douban_tv_weekly_global',
    'name': t('workflow.fetchMedias.doubanTvWeeklyGlobal'),
  },
]

// 额外的数据源
const extraRecommendSources = ref<RecommendSource[]>([])

// 加载额外的发现数据源
async function loadExtraRecommendSources() {
  try {
    const extra: RecommendSource[] = await api.get('recommend/source')
    extraRecommendSources.value = Array.isArray(extra) ? extra : []
  } catch (error) {
    console.log(error)
  }
}

// 来源类型下拉框
const sourceTypeOptions = [
  { value: 'ranking', title: t('workflow.fetchMedias.ranking') },
  { value: 'api', title: t('workflow.fetchMedias.api') },
]

// 计算下拉框（响应式合并内置与扩展推荐源）
const sourceOptions = computed(() => [
  ...innerList.map(item => ({ value: item.api_path, title: item.name })),
  ...extraRecommendSources.value.map(source => ({ value: source.api_path, title: source.name })),
])

onMounted(() => {
  loadExtraRecommendSources()
})
</script>
<template>
  <div>
    <VCard max-width="20rem" class="workflow-node-card">
      <Handle id="edge_in" type="target" :position="Position.Left" />
      <VCardItem class="workflow-node-header">
        <template #prepend>
          <VAvatar size="34" rounded="lg" variant="tonal" color="primary" class="workflow-node-avatar">
            <VIcon icon="mdi-movie-search" size="18" />
          </VAvatar>
        </template>
        <VCardTitle class="workflow-node-title">{{ t('workflow.fetchMedias.title') }}</VCardTitle>
        <VCardSubtitle class="workflow-node-subtitle">{{ t('workflow.fetchMedias.subtitle') }}</VCardSubtitle>
      </VCardItem>
      <VDivider />
      <VCardText class="workflow-node-body">
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol cols="12">
              <VSelect
                v-model="data.source_type"
                :items="sourceTypeOptions"
                :label="t('workflow.fetchMedias.source')"
                variant="outlined"
                density="compact"
                hide-details="auto"
              />
            </VCol>
            <VCol v-if="data.source_type === 'ranking'" cols="12">
              <VSelect
                v-model="data.sources"
                :items="sourceOptions"
                :label="t('workflow.fetchMedias.selectRanking')"
                chips
                multiple
                variant="outlined"
                density="compact"
                hide-details="auto"
                clearable
              />
            </VCol>
            <VCol v-else cols="12">
              <VTextField
                v-model="data.api_path"
                :label="t('workflow.fetchMedias.apiPath')"
                placeholder="/api/v1/plugin/xxx/xxxx"
                variant="outlined"
                density="compact"
                hide-details="auto"
                clearable
              />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
      <Handle id="edge_out" type="source" :position="Position.Right" />
    </VCard>
  </div>
</template>

<style lang="scss" scoped>
.workflow-node-header {
  padding: 10px 14px;
}

.workflow-node-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
}

.workflow-node-subtitle {
  font-size: 12px;
  line-height: 1.35;
  margin-block-start: 1px;
}

.workflow-node-body {
  padding: 12px 14px !important;
}
</style>
