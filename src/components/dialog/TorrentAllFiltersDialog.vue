<script setup lang="ts">
import { useDisplay } from 'vuetify'
import { useI18n } from '@/composables/useChineseText'

const { t } = useI18n()
const display = useDisplay()

const props = withDefaults(
  defineProps<{
    filterForm: Record<string, string[]>
    filterOptions: Record<string, string[]>
    filterTitles: Record<string, string>
    modelValue?: boolean
  }>(),
  {
    modelValue: true,
  },
)

const emit = defineEmits<{
  (event: 'clearAllFilters'): void
  (event: 'clearFilter', key: string): void
  (event: 'close'): void
  (event: 'selectAll', key: string): void
  (event: 'update:filterForm', key: string, values: string[]): void
  (event: 'update:modelValue', value: boolean): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

const selectedCount = computed(() => {
  return Object.values(props.filterForm).reduce((count, values) => count + values.length, 0)
})

// 给定过滤类型返回不同图标。
function getFilterIcon(key: string) {
  const icons: Record<string, string> = {
    site: 'mdi-server-network',
    season: 'mdi-television-classic',
    freeState: 'mdi-gift-outline',
    resolution: 'mdi-monitor-screenshot',
    videoCode: 'mdi-video-vintage',
    edition: 'mdi-quality-high',
    releaseGroup: 'mdi-account-group-outline',
    subtitle: 'mdi-subtitles-outline',
  }
  return icons[key] || 'mdi-filter-variant'
}

// 将筛选值变化回传给过滤条。
function updateFilter(key: string, values: string[]) {
  emit('update:filterForm', key, values)
}
</script>

<template>
  <VDialog
    v-if="visible"
    v-model="visible"
    max-width="50rem"
    location="center"
    scrollable
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard class="mp-dialog-card">
      <VCardItem class="mp-dialog-header">
        <template #prepend>
          <VIcon icon="mdi-filter-variant" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>{{ t('torrent.allFilters') }}</VCardTitle>
        <template v-if="selectedCount > 0" #append>
          <VBtn variant="text" size="small" color="error" @click="emit('clearAllFilters')">
            {{ t('torrent.clearAll') }}
          </VBtn>
        </template>
      </VCardItem>
      <VDialogCloseBtn v-model="visible" />
      <VDivider />
      <VCardText class="mp-dialog-body">
        <div class="all-filters-grid">
          <div
            v-for="(title, key) in props.filterTitles"
            :key="key"
            v-show="props.filterOptions[key].length > 0"
            class="filter-section"
          >
            <div class="filter-section__header">
              <div class="filter-section__title">
                <VIcon :icon="getFilterIcon(String(key))" size="16" class="text-primary" />
                <span>{{ title }}</span>
              </div>
              <div class="filter-section__actions">
                <VBtn variant="text" size="x-small" color="primary" @click="emit('selectAll', String(key))">
                  {{ t('torrent.selectAll') }}
                </VBtn>
                <VBtn
                  v-if="props.filterForm[key].length > 0"
                  variant="text"
                  size="x-small"
                  color="error"
                  @click="emit('clearFilter', String(key))"
                >
                  {{ t('torrent.clear') }}
                </VBtn>
              </div>
            </div>
            <div class="filter-section__body">
              <VChipGroup
                :model-value="props.filterForm[key]"
                column
                multiple
                class="filter-options"
                @update:model-value="(val: string[]) => updateFilter(String(key), val)"
              >
                <VChip
                  v-for="option in props.filterOptions[key]"
                  :key="option"
                  :value="option"
                  filter
                  variant="tonal"
                  rounded="lg"
                  class="filter-chip"
                  size="small"
                >
                  {{ option }}
                </VChip>
              </VChipGroup>
            </div>
          </div>
        </div>
      </VCardText>
      <VDivider />
      <VCardActions class="app-dialog-actions mp-dialog-footer">
        <VSpacer />
        <VBtn
          color="primary"
          variant="flat"
          size="small"
          prepend-icon="mdi-check"
          class="px-4"
          @click="visible = false"
        >
          {{ t('torrent.confirm') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.mp-dialog-header {
  padding-block: 14px;
  padding-inline: 22px 48px;
}

.mp-dialog-body {
  padding: 18px 22px !important;
}

.mp-dialog-footer {
  gap: 8px;
  padding: 10px 20px !important;
}

.all-filters-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
}

.filter-section {
  border: 1px solid var(--mp-border-subtle);
  border-radius: 10px;
  background: var(--mp-item-bg);
  overflow: hidden;
}

.filter-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-end: 1px solid var(--mp-border-subtle);
  gap: 8px;
  padding: 8px 12px;
}

.filter-section__title {
  display: inline-flex;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  gap: 6px;
}

.filter-section__actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.filter-section__body {
  padding: 10px 12px;
}

.filter-options {
  display: flex;
  flex-wrap: wrap;
}

.filter-options :deep(.v-slide-group__content) {
  gap: 5px;
}

.filter-chip {
  border: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.1));
  border-radius: 6px !important;
  block-size: 26px !important;
  margin: 0 !important;
  background-color: rgba(var(--v-theme-on-surface), 0.04) !important;
  color: rgba(var(--v-theme-on-surface), 0.88) !important;
  font-size: 12px !important;
  font-weight: 500;
  padding-inline: 9px !important;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}

.filter-chip:hover {
  border-color: var(--mp-border-hover);
  background-color: rgba(var(--v-theme-on-surface), 0.08) !important;
}

.filter-chip.v-chip--selected {
  border-color: rgba(var(--v-theme-primary), 0.35);
  background-color: rgba(var(--v-theme-primary), 0.14) !important;
  color: rgb(var(--v-theme-primary)) !important;
  font-weight: 600;
}

@media (max-width: 599.98px) {
  .mp-dialog-body {
    padding: 16px !important;
  }
}
</style>
