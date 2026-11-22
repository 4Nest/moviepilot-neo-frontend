<script setup lang="ts">
import { useI18n } from '@/composables/useChineseText'

const props = withDefaults(
  defineProps<{
    showShortDramaToggle?: boolean
    excludeShortDrama?: boolean
    activeFilterCount?: number
    canCollapse?: boolean
    expanded?: boolean
  }>(),
  {
    showShortDramaToggle: false,
    excludeShortDrama: true,
    activeFilterCount: 0,
    canCollapse: true,
    expanded: true,
  },
)

const emit = defineEmits<{
  (event: 'update:excludeShortDrama', value: boolean): void
  (event: 'reset'): void
  (event: 'toggle-expand'): void
}>()

const { t } = useI18n()

function handleShortDramaClick() {
  emit('update:excludeShortDrama', !props.excludeShortDrama)
}
</script>

<template>
  <div class="discover-filter-toolbar">
    <button
      v-if="showShortDramaToggle"
      type="button"
      class="discover-toolbar-pill"
      :class="excludeShortDrama ? 'discover-toolbar-pill--active' : 'discover-toolbar-pill--inactive'"
      :aria-pressed="excludeShortDrama"
      :title="t('discover.excludeShortDramaHint')"
      data-testid="short-drama-toggle"
      @click="handleShortDramaClick"
    >
      <VIcon :icon="excludeShortDrama ? 'mdi-filter-check-outline' : 'mdi-filter-outline'" size="14" />
      <span>{{ t('discover.excludeShortDrama') }}</span>
      <VTooltip activator="parent" location="top">{{ t('discover.excludeShortDramaHint') }}</VTooltip>
    </button>

    <button
      v-if="activeFilterCount > 0"
      type="button"
      class="discover-toolbar-pill discover-toolbar-pill--reset"
      data-testid="discover-filter-reset"
      @click="emit('reset')"
    >
      <VIcon icon="mdi-restore" size="13" />
      <span>{{ t('common.reset') }}</span>
      <span class="discover-toolbar-badge">{{ activeFilterCount }}</span>
    </button>

    <button
      v-if="canCollapse"
      type="button"
      class="discover-toolbar-pill discover-toolbar-pill--collapse"
      :aria-expanded="expanded"
      data-testid="discover-filter-collapse"
      @click="emit('toggle-expand')"
    >
      <span>{{ expanded ? t('discover.collapseFilters') : t('discover.expandFilters') }}</span>
      <VIcon :icon="expanded ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="14" />
    </button>
  </div>
</template>

<style scoped>
.discover-filter-toolbar {
  display: inline-flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  margin-inline-start: auto;
}

.discover-toolbar-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.12));
  border-radius: 6px;
  background-color: transparent;
  block-size: 26px;
  color: rgba(var(--v-theme-on-surface), 0.72);
  cursor: pointer;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  line-height: 1;
  padding-inline: 8px;
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    color 0.16s ease;
  white-space: nowrap;
}

.discover-toolbar-pill:hover {
  border-color: rgba(var(--v-theme-on-surface), 0.24);
  background-color: rgba(var(--v-theme-on-surface), 0.05);
  color: rgba(var(--v-theme-on-surface), 0.92);
}

.discover-toolbar-pill--active {
  border-color: rgba(var(--v-theme-primary), 0.28);
  background-color: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}

.discover-toolbar-pill--active:hover {
  border-color: rgba(var(--v-theme-primary), 0.42);
  background-color: rgba(var(--v-theme-primary), 0.18);
  color: rgb(var(--v-theme-primary));
}

.discover-toolbar-pill--reset {
  border-color: rgba(var(--v-theme-primary), 0.22);
  color: rgb(var(--v-theme-primary));
}

.discover-toolbar-pill--collapse {
  border-color: transparent;
  color: rgba(var(--v-theme-on-surface), 0.62);
  padding-inline: 6px;
}

.discover-toolbar-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background-color: rgba(var(--v-theme-primary), 0.16);
  block-size: 16px;
  color: rgb(var(--v-theme-primary));
  font-size: 11px;
  font-weight: 600;
  min-inline-size: 16px;
  padding-inline: 4px;
}
</style>
