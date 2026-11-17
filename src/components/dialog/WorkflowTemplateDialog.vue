<script setup lang="ts">
import { useDisplay } from 'vuetify'
import type { Workflow } from '@/api/types'
import WorkflowSummaryPreview from '@/components/workflow/WorkflowSummaryPreview.vue'
import { useI18n } from '@/composables/useChineseText'
import {
  buildWorkflowPresetFromTemplate,
  getWorkflowTemplates,
  type ResolvedWorkflowTemplate,
} from '@/views/workflow/workflowTemplates'

const props = defineProps({
  eventTypes: {
    type: Array as PropType<Array<{ title: string; value: string }>>,
    default: () => [],
  },
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select', preset: Partial<Workflow>): void
}>()

const { t } = useI18n()
const display = useDisplay()

const templates = computed(() => getWorkflowTemplates(t))

function resolveTriggerText(template: ResolvedWorkflowTemplate) {
  if (template.trigger_type === 'event') {
    const matched = props.eventTypes.find(item => item.value === template.event_type)
    return matched ? matched.title : template.event_type || t('workflow.filter.triggerEvent')
  }
  if (template.trigger_type === 'manual') {
    return t('workflow.filter.triggerManual')
  }
  return template.timer || t('workflow.filter.triggerTimer')
}

function resolveTriggerIcon(template: ResolvedWorkflowTemplate) {
  if (template.trigger_type === 'event') return 'mdi-calendar-check-outline'
  if (template.trigger_type === 'manual') return 'mdi-hand-pointing-up'
  return 'mdi-clock-outline'
}

function handleSelect(template: ResolvedWorkflowTemplate) {
  emit('select', buildWorkflowPresetFromTemplate(template))
}
</script>

<template>
  <VDialog scrollable max-width="64rem" :fullscreen="!display.mdAndUp.value">
    <VCard class="workflow-template-dialog">
      <VCardItem>
        <template #prepend>
          <VAvatar color="primary" variant="tonal" rounded="md" size="36" class="me-2">
            <VIcon icon="mdi-auto-fix" />
          </VAvatar>
        </template>
        <VCardTitle>{{ t('workflow.templates.dialogTitle') }}</VCardTitle>
        <VCardSubtitle>{{ t('workflow.templates.dialogSubtitle') }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn @click="emit('close')" />
      <VDivider />

      <VCardText class="pa-4">
        <div class="workflow-template-grid">
          <VCard
            v-for="tpl in templates"
            :key="tpl.id"
            variant="outlined"
            class="workflow-template-card"
            @click="handleSelect(tpl)"
          >
            <div class="workflow-template-card__top">
              <div class="workflow-template-card__meta">
                <div class="workflow-template-card__header">
                  <VAvatar :color="tpl.color" variant="tonal" rounded="md" size="34">
                    <VIcon :icon="tpl.icon" size="19" />
                  </VAvatar>
                  <div class="workflow-template-card__titles">
                    <div class="workflow-template-card__name">{{ tpl.name }}</div>
                    <div class="workflow-template-card__badges">
                      <VChip :color="tpl.color" size="x-small" variant="tonal" label>
                        {{ tpl.badge }}
                      </VChip>
                      <span class="workflow-template-card__trigger">
                        <VIcon :icon="resolveTriggerIcon(tpl)" size="14" />
                        {{ resolveTriggerText(tpl) }}
                      </span>
                    </div>
                  </div>
                </div>
                <p class="workflow-template-card__desc">{{ tpl.description }}</p>
              </div>

              <WorkflowSummaryPreview
                :actions="tpl.actions"
                :flows="tpl.flows"
                class="workflow-template-card__preview"
              />
            </div>

            <div class="workflow-template-card__footer">
              <VBtn
                color="primary"
                variant="tonal"
                size="small"
                prepend-icon="mdi-plus-circle-outline"
                @click.stop="handleSelect(tpl)"
              >
                {{ t('workflow.templates.useTemplate') }}
              </VBtn>
            </div>
          </VCard>
        </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped lang="scss">
.workflow-template-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 440px), 1fr));
}

.workflow-template-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 14px;
  border-color: rgba(var(--v-theme-on-surface), 0.1);
  border-radius: var(--app-control-radius);
  cursor: pointer;
  gap: 12px;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;

  &:hover {
    border-color: rgba(var(--v-theme-primary), 0.45);
    transform: translateY(-2px);
  }
}

.workflow-template-card__top {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 14px;
}

.workflow-template-card__meta {
  display: flex;
  min-inline-size: 0;
  flex: 1;
  flex-direction: column;
  gap: 8px;
}

.workflow-template-card__header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.workflow-template-card__titles {
  display: flex;
  min-inline-size: 0;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}

.workflow-template-card__name {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.35;
}

.workflow-template-card__badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.workflow-template-card__trigger {
  display: inline-flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  gap: 4px;
}

.workflow-template-card__desc {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.8125rem;
  line-height: 1.5;
}

.workflow-template-card__preview {
  flex: 0 0 auto;
}

.workflow-template-card__footer {
  display: flex;
  justify-content: flex-end;
  border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  padding-block-start: 10px;
}

@media (width <= 680px) {
  .workflow-template-card__top {
    flex-direction: column;
  }

  .workflow-template-card__preview {
    inline-size: 100%;
  }
}
</style>
