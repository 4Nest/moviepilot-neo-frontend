<script setup lang="ts">
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

// 来源下拉框（兼容模板与后端契约中的 fileitems 与存量 files）
const sourceOptions = computed(() => [
  {
    title: t('workflow.transferFile.sourceOptions.fileList'),
    value: props.data?.source === 'fileitems' ? 'fileitems' : 'files',
  },
  {
    title: t('workflow.transferFile.sourceOptions.downloads'),
    value: 'downloads',
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
            <VIcon icon="mdi-file-move" size="18" />
          </VAvatar>
        </template>
        <VCardTitle class="workflow-node-title">{{ t('workflow.transferFile.title') }}</VCardTitle>
        <VCardSubtitle class="workflow-node-subtitle">{{ t('workflow.transferFile.subtitle') }}</VCardSubtitle>
      </VCardItem>
      <VDivider />
      <VCardText class="workflow-node-body">
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol cols="12">
              <VSelect
                v-model="data.source"
                :label="t('workflow.transferFile.source')"
                :items="sourceOptions"
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
