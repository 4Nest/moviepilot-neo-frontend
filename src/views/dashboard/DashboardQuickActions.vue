<script setup lang="ts">
import { useShortcutTools } from '@/composables/useShortcutTools'
import { useI18n } from '@/composables/useChineseText'

const { t } = useI18n()
const { visibleShortcuts, openShortcutDialog } = useShortcutTools()
</script>

<template>
  <VCard class="dashboard-quick-card dashboard-grid-fill">
    <VCardItem class="dashboard-quick-heading">
      <VCardTitle>{{ t('dashboard.quickActions.title') }}</VCardTitle>
    </VCardItem>
    <VCardText class="dashboard-quick-actions">
      <button
        v-for="action in visibleShortcuts"
        :key="action.dialog"
        type="button"
        class="dashboard-quick-action dashboard-grid-no-drag"
        @click="openShortcutDialog(action)"
      >
        <span class="dashboard-quick-action__icon-box" aria-hidden="true">
          <VIcon :icon="action.icon" size="16" />
        </span>
        <span class="dashboard-quick-action__label">{{ action.title }}</span>
      </button>
    </VCardText>
  </VCard>
</template>

<style scoped>
.dashboard-quick-card {
  display: flex;
  flex-direction: column;
  block-size: 100%;
}

.dashboard-quick-heading {
  padding: 14px 16px 8px;
}

.dashboard-quick-actions {
  display: grid;
  flex: 1 1 auto;
  align-content: start;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 4px 16px 14px;
}

.dashboard-quick-action {
  display: flex;
  min-inline-size: 0;
  block-size: 40px;
  align-items: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 8px;
  background-color: var(--mp-item-bg);
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  cursor: pointer;
  gap: 8px;
  padding: 0 10px;
  text-align: start;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease,
    color 0.16s ease;
}

.dashboard-quick-action__icon-box {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  border-radius: 6px;
  background-color: rgba(var(--v-theme-primary), 0.1);
  block-size: 26px;
  color: rgb(var(--v-theme-primary));
  inline-size: 26px;
  transition:
    background-color 0.16s ease,
    color 0.16s ease;
}

.dashboard-quick-action:hover,
.dashboard-quick-action:focus-visible {
  border-color: rgba(var(--v-theme-primary), 0.36);
  background-color: rgba(var(--v-theme-primary), 0.08);
  color: rgb(var(--v-theme-primary));
  outline: none;
}

.dashboard-quick-action:hover .dashboard-quick-action__icon-box,
.dashboard-quick-action:focus-visible .dashboard-quick-action__icon-box {
  background-color: rgba(var(--v-theme-primary), 0.16);
}

.dashboard-quick-action__label {
  overflow: hidden;
  flex: 1 1 auto;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
