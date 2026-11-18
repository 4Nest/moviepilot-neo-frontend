<script setup lang="ts">
import api from '@/api'
import { Site } from '@/api/types'
import { Handle, Position } from '@vue-flow/core'
import { useI18n } from '@/composables/useChineseText'

const { t } = useI18n()

const props = defineProps({
  id: {
    type: String,
    required: true,
  },
  data: {
    type: Object,
    required: true,
  },
})

const nodeData = computed(() => props.data)

// 电影/电视剧下拉框
const typeOptions = ref([
  {
    title: t('mediaType.movie'),
    value: '电影',
  },
  {
    title: t('mediaType.tv'),
    value: '电视剧',
  },
])

// 搜索方式下拉框
const searchOptions = ref([
  {
    title: t('workflow.fetchTorrents.searchOptions.name'),
    value: 'keyword',
  },
  {
    title: t('workflow.fetchTorrents.searchOptions.mediaList'),
    value: 'media',
  },
])

// 站点数据列表
const siteList = ref<Site[]>([])

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

// 站点选项
const siteOptions = computed(() => {
  return siteList.value.map(item => {
    return {
      title: item.name,
      value: item.id,
    }
  })
})

onMounted(() => {
  loadSites()
})
</script>
<template>
  <div>
    <VCard max-width="20rem" class="workflow-node-card">
      <Handle id="edge_in" type="target" :position="Position.Left" />
      <VCardItem class="workflow-node-header">
        <template #prepend>
          <VAvatar size="34" rounded="lg" variant="tonal" color="primary" class="workflow-node-avatar">
            <VIcon icon="mdi-search-web" size="18" />
          </VAvatar>
        </template>
        <VCardTitle class="workflow-node-title">{{ t('workflow.fetchTorrents.title') }}</VCardTitle>
        <VCardSubtitle class="workflow-node-subtitle">{{ t('workflow.fetchTorrents.subtitle') }}</VCardSubtitle>
      </VCardItem>
      <VDivider />
      <VCardText class="workflow-node-body">
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol cols="12">
              <VSelect
                v-model="nodeData.search_type"
                :label="t('workflow.fetchTorrents.searchType')"
                :items="searchOptions"
                variant="outlined"
                density="compact"
                hide-details="auto"
              />
            </VCol>
            <template v-if="nodeData.search_type === 'keyword'">
              <VCol cols="6">
                <VTextField
                  v-model="nodeData.name"
                  :label="t('workflow.fetchTorrents.name')"
                  variant="outlined"
                  density="compact"
                  hide-details="auto"
                />
              </VCol>
              <VCol cols="6">
                <VTextField
                  v-model="nodeData.year"
                  :label="t('workflow.fetchTorrents.year')"
                  variant="outlined"
                  density="compact"
                  hide-details="auto"
                />
              </VCol>
              <VCol cols="6">
                <VSelect
                  v-model="nodeData.type"
                  :label="t('workflow.fetchTorrents.type')"
                  :items="typeOptions"
                  variant="outlined"
                  density="compact"
                  hide-details="auto"
                />
              </VCol>
              <VCol cols="6">
                <VTextField
                  v-model="nodeData.season"
                  type="number"
                  :label="t('workflow.fetchTorrents.season')"
                  variant="outlined"
                  density="compact"
                  hide-details="auto"
                />
              </VCol>
            </template>
            <VCol cols="12">
              <VSelect
                v-model="nodeData.sites"
                :label="t('workflow.fetchTorrents.sites')"
                :items="siteOptions"
                chips
                multiple
                variant="outlined"
                density="compact"
                hide-details="auto"
                clearable
              />
            </VCol>
            <VCol v-if="nodeData.search_type === 'keyword'" cols="12">
              <div class="mp-switch-card workflow-node-switch">
                <VSwitch
                  v-model="nodeData.match_media"
                  :label="t('workflow.fetchTorrents.matchMedia')"
                  color="primary"
                  density="compact"
                  hide-details
                  inset
                  :mobile-layout="false"
                />
              </div>
            </VCol>
            <VCol cols="12">
              <div class="mp-switch-card workflow-node-switch">
                <VSwitch
                  v-model="nodeData.only_new"
                  :label="t('workflow.fetchTorrents.onlyNew')"
                  color="primary"
                  density="compact"
                  hide-details
                  inset
                  :mobile-layout="false"
                />
                <VTooltip location="top" max-width="260">
                  <template #activator="{ props: tipProps }">
                    <VIcon
                      v-bind="tipProps"
                      icon="mdi-help-circle-outline"
                      size="15"
                      class="flex-shrink-0 text-medium-emphasis"
                    />
                  </template>
                  <span>{{ t('workflow.fetchTorrents.onlyNewHint') }}</span>
                </VTooltip>
              </div>
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

.workflow-node-switch {
  justify-content: space-between;
  gap: 6px;
  min-block-size: 32px;
  padding: 3px 10px;
}
</style>
