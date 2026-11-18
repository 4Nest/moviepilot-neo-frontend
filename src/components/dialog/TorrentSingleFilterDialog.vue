<script setup lang="ts">
import { useI18n } from '@/composables/useChineseText'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    filterForm: Record<string, string[]>
    filterKey: string
    filterOptions: Record<string, string[]>
    filterTitle: string
    modelValue?: boolean
  }>(),
  {
    modelValue: true,
  },
)

const emit = defineEmits<{
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

const filterValues = computed(() => props.filterForm[props.filterKey] ?? [])
const options = computed(() => props.filterOptions[props.filterKey] ?? [])

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

// 将当前筛选值变化回传给过滤条。
function updateFilter(values: string[]) {
  emit('update:filterForm', props.filterKey, values)
}
</script>

<template>
  <VDialog v-if="visible" v-model="visible" max-width="25rem" max-height="85vh" location="center" scrollable>
    <VCard class="mp-dialog-card">
      <VCardItem class="mp-dialog-header">
        <template #prepend>
          <VIcon :icon="getFilterIcon(props.filterKey)" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>{{ props.filterTitle }}</VCardTitle>
        <template #append>
          <div class="d-flex align-center gap-0.5">
            <VBtn variant="text" size="x-small" color="primary" @click="emit('selectAll', props.filterKey)">
              {{ t('torrent.selectAll') }}
            </VBtn>
            <VBtn
              v-if="filterValues.length > 0"
              variant="text"
              size="x-small"
              color="error"
              @click="emit('clearFilter', props.filterKey)"
            >
              {{ t('torrent.clear') }}
            </VBtn>
          </div>
        </template>
      </VCardItem>
      <VDialogCloseBtn v-model="visible" />
      <VDivider />
      <VCardText class="mp-dialog-body">
        <VChipGroup
          :model-value="filterValues"
          column
          multiple
          class="filter-options"
          @update:model-value="updateFilter"
        >
          <VChip
            v-for="option in options"
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
  padding-block: 12px;
  padding-inline: 18px 48px;
}

.mp-dialog-body {
  padding: 14px 18px !important;
}

.mp-dialog-footer {
  gap: 8px;
  padding: 10px 18px !important;
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
</style>
