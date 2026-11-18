<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/composables/useChineseText'

// 国际化
const { t } = useI18n()

const props = defineProps<Props>()

interface Props {
  errorCode?: string
  errorTitle?: string
  errorDescription?: string
  icon?: string
  iconColor?: string
}

const resolvedIcon = computed(() => {
  if (props.icon) return props.icon
  if (props.errorCode === '500') return 'mdi-alert-circle-outline'
  if (props.errorCode === '404') return 'mdi-compass-off-outline'
  return 'mdi-tray-remove'
})
</script>

<template>
  <div class="no-data-container">
    <div class="no-data-glyph" aria-hidden="true">
      <VIcon :icon="resolvedIcon" :color="props.iconColor" size="24" />
    </div>

    <div class="error-title">
      {{ props.errorTitle || t('common.noData') }}
    </div>

    <div class="error-description">
      {{ props.errorDescription || t('common.noContent') }}
    </div>

    <div v-if="$slots.button" class="actions-container">
      <slot name="button" />
    </div>
  </div>
</template>

<style scoped>
.no-data-container {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.25rem 0.875rem;
  inline-size: 100%;
  min-block-size: 168px;
  text-align: center;
}

.no-data-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--mp-border-card);
  border-radius: 12px;
  background: var(--mp-item-bg);
  block-size: 48px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  inline-size: 48px;
  margin-block-end: 12px;
}

.error-title {
  color: rgba(var(--v-theme-on-surface), 0.9);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  margin-block-end: 4px;
}

.error-description {
  color: rgba(var(--v-theme-on-surface), 0.56);
  font-size: 13px;
  line-height: 1.5;
  margin-inline: auto;
  max-inline-size: 420px;
}

.actions-container {
  margin-block-start: 14px;
}
</style>
