<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
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
</script>
<template>
  <div>
    <VCard max-width="20rem" class="workflow-node-card">
      <Handle id="edge_in" type="target" :position="Position.Left" />
      <VCardItem class="workflow-node-header">
        <template #prepend>
          <VAvatar size="34" rounded="lg" variant="tonal" color="primary" class="workflow-node-avatar">
            <VIcon icon="mdi-filter-check" size="18" />
          </VAvatar>
        </template>
        <VCardTitle class="workflow-node-title">{{ t('workflow.filterMedias.title') }}</VCardTitle>
        <VCardSubtitle class="workflow-node-subtitle">{{ t('workflow.filterMedias.subtitle') }}</VCardSubtitle>
      </VCardItem>
      <VDivider />
      <VCardText class="workflow-node-body">
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol cols="12">
              <VSelect
                v-model="data.type"
                :label="t('workflow.filterMedias.type')"
                :items="typeOptions"
                variant="outlined"
                density="compact"
                hide-details="auto"
              />
            </VCol>
            <VCol cols="6">
              <VTextField
                v-model="data.year"
                :label="t('workflow.filterMedias.year')"
                variant="outlined"
                density="compact"
                hide-details="auto"
              />
            </VCol>
            <VCol cols="6">
              <VTextField
                v-model="data.vote"
                type="number"
                :label="t('workflow.filterMedias.vote')"
                variant="outlined"
                density="compact"
                hide-details="auto"
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
