<script setup lang="ts">
import draggable from 'vuedraggable'
import type { DiscoverSource } from '@/api/types'
import { useDisplay } from 'vuetify'
import { useI18n } from '@/composables/useChineseText'

const { t } = useI18n()
const display = useDisplay()

export interface DiscoverTabOrderSavePayload {
  tabs: DiscoverSource[]
  enabled: Record<string, boolean>
}

const BUILT_IN_SOURCE_ORDER = ['themoviedb', 'douban', 'bangumi', 'anilist', 'bilibili', 'tencentvideo', 'mangguo']
const BUILT_IN_SOURCE_SET = new Set(BUILT_IN_SOURCE_ORDER)

const SOURCE_ICON_MAP: Record<string, string> = {
  themoviedb: 'mdi-movie-search-outline',
  douban: 'mdi-book-open-page-variant-outline',
  bangumi: 'mdi-calendar-star-outline',
  anilist: 'mdi-alpha-a-circle-outline',
  bilibili: 'mdi-television-classic',
  tencentvideo: 'mdi-television-play',
  mangguo: 'mdi-movie-open-outline',
}

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    tabs: DiscoverSource[]
    defaultTabs?: DiscoverSource[]
    enabled?: Record<string, boolean>
  }>(),
  {
    modelValue: true,
    defaultTabs: undefined,
    enabled: undefined,
  },
)

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'save', payload: DiscoverTabOrderSavePayload): void
  (event: 'update:modelValue', value: boolean): void
}>()

const localTabs = ref<DiscoverSource[]>([])
const localEnabled = ref<Record<string, boolean>>({})

const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

const enabledCount = computed(
  () => localTabs.value.filter(item => localEnabled.value[item.mediaid_prefix] !== false).length,
)

const isSaveDisabled = computed(() => localTabs.value.length > 0 && enabledCount.value === 0)

watch(
  [() => props.tabs, () => props.enabled],
  () => {
    resetLocalTabs()
  },
  { deep: true, immediate: true },
)

function isBuiltInSource(prefix: string) {
  return BUILT_IN_SOURCE_SET.has(prefix)
}

function getSourceIcon(prefix: string) {
  return SOURCE_ICON_MAP[prefix] || 'mdi-puzzle-outline'
}

// 重置弹窗内部排序与显隐副本（撤销本次弹窗内未保存修改）。
function resetLocalTabs() {
  localTabs.value = props.tabs.map(item => ({ ...item }))
  const nextEnabled: Record<string, boolean> = {}
  props.tabs.forEach(item => {
    nextEnabled[item.mediaid_prefix] = props.enabled?.[item.mediaid_prefix] !== false
  })
  localEnabled.value = nextEnabled
}

// 一键开启全部探索源。
function enableAllTabs() {
  const nextEnabled: Record<string, boolean> = {}
  localTabs.value.forEach(item => {
    nextEnabled[item.mediaid_prefix] = true
  })
  localEnabled.value = nextEnabled
}

// 恢复默认排序并开启全部探索源。
function restoreDefaultTabs() {
  let ordered: DiscoverSource[]
  if (props.defaultTabs && props.defaultTabs.length > 0) {
    ordered = props.defaultTabs.map(item => ({ ...item }))
  } else {
    ordered = [...localTabs.value]
      .map(item => ({ ...item }))
      .sort((a, b) => {
        const aBuiltInIndex = BUILT_IN_SOURCE_ORDER.indexOf(a.mediaid_prefix)
        const bBuiltInIndex = BUILT_IN_SOURCE_ORDER.indexOf(b.mediaid_prefix)
        const aRank = aBuiltInIndex === -1 ? 999 : aBuiltInIndex
        const bRank = bBuiltInIndex === -1 ? 999 : bBuiltInIndex
        return aRank - bRank
      })
  }
  localTabs.value = ordered
  const nextEnabled: Record<string, boolean> = {}
  ordered.forEach(item => {
    nextEnabled[item.mediaid_prefix] = true
  })
  localEnabled.value = nextEnabled
}

// 计算已启用标签在当前列表中的可见序号（从 1 开始）。
function getVisibleOrder(element: DiscoverSource) {
  let order = 0
  for (const item of localTabs.value) {
    if (localEnabled.value[item.mediaid_prefix] !== false) {
      order += 1
    }
    if (item.mediaid_prefix === element.mediaid_prefix) {
      return order
    }
  }
  return 0
}

// 保存当前拖拽后的发现标签顺序与显隐状态（至少保留 1 个启用源）。
function submitOrder() {
  if (isSaveDisabled.value) return

  emit('save', {
    tabs: localTabs.value.map(item => ({ ...item })),
    enabled: { ...localEnabled.value },
  })
}
</script>

<template>
  <VDialog
    v-if="visible"
    v-model="visible"
    max-width="44rem"
    width="100%"
    class="settings-dialog"
    scrollable
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard class="settings-card">
      <VCardItem class="settings-card-header">
        <VCardTitle class="d-flex align-center">
          <VIcon icon="mdi-order-alphabetical-ascending" size="18" class="me-2" />
          <span>{{ t('discover.setTabOrder') }}</span>
        </VCardTitle>
        <VDialogCloseBtn v-model="visible" />
      </VCardItem>
      <VDivider />
      <VCardText class="settings-card-body">
        <div class="settings-toolbar">
          <div class="settings-toolbar-meta">
            <p class="settings-hint">{{ t('discover.dragToReorder') }}</p>
            <span class="settings-count-badge" data-testid="discover-enabled-count">
              {{ t('discover.enabledCount', { enabled: enabledCount, total: localTabs.length }) }}
            </span>
          </div>
          <div class="settings-toolbar-actions">
            <VBtn
              color="primary"
              variant="tonal"
              size="x-small"
              class="setting-quick-btn"
              prepend-icon="mdi-check-all"
              :disabled="enabledCount === localTabs.length"
              @click="enableAllTabs"
            >
              {{ t('discover.enableAll') }}
            </VBtn>
            <VBtn
              color="default"
              variant="outlined"
              size="x-small"
              class="setting-quick-btn"
              prepend-icon="mdi-restore"
              @click="restoreDefaultTabs"
            >
              {{ t('discover.restoreDefault') }}
            </VBtn>
          </div>
        </div>

        <div v-if="isSaveDisabled" class="settings-empty-warning" role="alert" data-testid="discover-keep-one-warning">
          <VIcon icon="mdi-alert-circle-outline" size="16" class="flex-shrink-0" />
          <span>{{ t('discover.keepAtLeastOneHint') }}</span>
        </div>

        <draggable
          v-model="localTabs"
          handle=".cursor-move"
          item-key="mediaid_prefix"
          tag="div"
          :animation="180"
          :component-data="{ 'class': 'settings-grid' }"
        >
          <template #item="{ element }">
            <div
              class="setting-item"
              :class="{ 'is-disabled': localEnabled[element.mediaid_prefix] === false }"
              :title="element.name"
            >
              <div class="setting-item-inner">
                <VIcon icon="mdi-drag-vertical" size="18" class="drag-icon cursor-move" />
                <VIcon :icon="getSourceIcon(element.mediaid_prefix)" size="16" class="setting-source-icon" />
                <span class="setting-label">{{ element.name }}</span>
                <span
                  class="setting-source-tag"
                  :class="isBuiltInSource(element.mediaid_prefix) ? 'is-builtin' : 'is-plugin'"
                >
                  {{
                    isBuiltInSource(element.mediaid_prefix) ? t('discover.sourceBuiltIn') : t('discover.sourcePlugin')
                  }}
                </span>
                <span v-if="localEnabled[element.mediaid_prefix] !== false" class="setting-order-badge">
                  {{ getVisibleOrder(element) }}
                </span>
                <VSwitch
                  v-model="localEnabled[element.mediaid_prefix]"
                  color="primary"
                  density="compact"
                  hide-details
                  inset
                  class="setting-switch"
                  :aria-label="element.name"
                />
              </div>
            </div>
          </template>
        </draggable>
      </VCardText>
      <VDivider />
      <VCardActions class="app-dialog-actions settings-card-actions">
        <VBtn
          color="default"
          variant="outlined"
          size="small"
          class="setting-action-btn"
          prepend-icon="mdi-restore"
          @click="resetLocalTabs"
        >
          {{ t('common.reset') }}
        </VBtn>
        <VSpacer />
        <VBtn color="default" variant="text" size="small" class="setting-action-btn" @click="visible = false">
          {{ t('common.cancel') }}
        </VBtn>
        <VBtn
          color="primary"
          variant="flat"
          size="small"
          class="setting-action-btn px-4"
          :disabled="isSaveDisabled"
          @click="submitOrder"
        >
          <template #prepend>
            <VIcon icon="mdi-content-save-outline" size="18" />
          </template>
          {{ t('common.save') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.settings-card {
  border: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.1));
  border-radius: 14px;
  background-color: rgb(var(--v-theme-surface));
}

.settings-card-header {
  padding-block: 14px;
  padding-inline: 20px;
}

.settings-card-body {
  padding-block: 16px 18px;
  padding-inline: 20px;
}

.settings-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  margin-block-end: 14px;
}

.settings-toolbar-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.settings-hint {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 13px;
  line-height: 1.45;
}

.settings-count-badge {
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(var(--v-theme-primary), 0.22);
  border-radius: 999px;
  background-color: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  line-height: 1;
  padding-block: 4px;
  padding-inline: 8px;
}

.settings-toolbar-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.setting-quick-btn {
  border-radius: 6px;
  font-weight: 500;
}

.settings-empty-warning {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(var(--v-theme-warning), 0.34);
  border-radius: 8px;
  background-color: rgba(var(--v-theme-warning), 0.1);
  color: rgb(var(--v-theme-warning));
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.4;
  margin-block-end: 12px;
  padding-block: 7px;
  padding-inline: 11px;
}

.settings-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.setting-item {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.1));
  border-radius: 8px;
  background-color: var(--mp-item-bg, rgba(var(--v-theme-on-surface), 0.03));
  min-block-size: 44px;
  padding-block: 6px;
  padding-inline: 10px 12px;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease,
    opacity 0.16s ease;
}

.setting-item.is-disabled {
  opacity: 0.56;
}

.setting-item:hover {
  border-color: var(--mp-border-hover, rgba(var(--v-theme-on-surface), 0.22));
  background-color: rgba(var(--v-theme-on-surface), 0.065);
}

.setting-item-inner {
  display: flex;
  align-items: center;
  gap: 7px;
  min-inline-size: 0;
}

.setting-switch {
  flex-shrink: 0;
}

.drag-icon {
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), 0.42);
  cursor: grab;
  transition: color 0.16s ease;
}

.drag-icon:active {
  cursor: grabbing;
}

.setting-item:hover .drag-icon {
  color: rgba(var(--v-theme-on-surface), 0.82);
}

.setting-source-icon {
  flex-shrink: 0;
  color: rgba(var(--v-theme-primary), 0.85);
}

.setting-label {
  overflow: hidden;
  flex: 1;
  color: rgba(var(--v-theme-on-surface), 0.92);
  font-size: 13.5px;
  font-weight: 500;
  line-height: 1.35;
  min-inline-size: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.setting-source-tag {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  border-radius: 5px;
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1;
  padding-block: 3px;
  padding-inline: 5px;
  white-space: nowrap;
}

.setting-source-tag.is-builtin {
  background-color: rgba(var(--v-theme-primary), 0.1);
  color: rgba(var(--v-theme-primary), 0.92);
}

.setting-source-tag.is-plugin {
  background-color: rgba(var(--v-theme-on-surface), 0.07);
  color: rgba(var(--v-theme-on-surface), 0.64);
}

.setting-order-badge {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.1));
  border-radius: 6px;
  background-color: rgba(var(--v-theme-on-surface), 0.04);
  block-size: 20px;
  color: rgba(var(--v-theme-on-surface), 0.56);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  min-inline-size: 20px;
  padding-inline: 5px;
}

.settings-card-actions {
  gap: 8px;
  padding-block: 12px 16px;
  padding-inline: 20px;
}

.setting-action-btn {
  border-radius: 8px;
}

@media (width <= 760px) {
  .settings-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (width <= 480px) {
  .settings-card {
    border-radius: 0;
  }

  .settings-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
