<script setup lang="ts">
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
</script>
<template>
  <div>
    <VCard max-width="20rem" class="workflow-node-card note-card">
      <VCardItem class="workflow-node-header">
        <template #prepend>
          <VAvatar size="34" rounded="lg" variant="tonal" color="warning" class="workflow-node-avatar">
            <VIcon icon="mdi-note-text" size="18" />
          </VAvatar>
        </template>
        <VCardTitle class="workflow-node-title">{{ t('workflow.note.title') }}</VCardTitle>
      </VCardItem>
      <VDivider />
      <VCardText class="workflow-node-body">
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol cols="12">
              <VTextarea
                v-model="data.content"
                :label="t('workflow.note.content')"
                :placeholder="t('workflow.note.placeholder')"
                variant="outlined"
                density="compact"
                hide-details="auto"
                auto-grow
                rows="3"
                max-rows="6"
                clearable
              />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
    </VCard>
  </div>
</template>

<style lang="scss" scoped>
.note-card {
  border: 1px solid rgba(var(--v-theme-warning), 0.22);
  background-color: rgb(var(--v-theme-surface));

  &:hover {
    border-color: rgba(var(--v-theme-warning), 0.38);
  }
}

.workflow-node-header {
  padding: 10px 14px;
}

.workflow-node-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
}

.workflow-node-body {
  padding: 12px 14px !important;
}
</style>
