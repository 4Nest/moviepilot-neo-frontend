<script setup lang="ts">
import { useDisplay } from 'vuetify'
import { useI18n } from '@/composables/useChineseText'

const { t } = useI18n()
const display = useDisplay()

type UnknownRecord = Record<string, any>

const props = withDefaults(
  defineProps<{
    colors?: Record<string, string>
    enabled: Record<string, boolean>
    elevated?: boolean
    hint: string
    items: UnknownRecord[]
    labelGetter?: (item: UnknownRecord) => string
    modelValue?: boolean
    selectAllText?: string
    selectNoneText?: string
    showBulkActions?: boolean
    switchLabel?: string
    title: string
    valueGetter?: (item: UnknownRecord) => string
  }>(),
  {
    colors: undefined,
    elevated: false,
    labelGetter: undefined,
    modelValue: true,
    selectAllText: '',
    selectNoneText: '',
    showBulkActions: false,
    switchLabel: '',
    valueGetter: undefined,
  },
)

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'save', payload: { elevated: boolean; enabled: Record<string, boolean> }): void
  (event: 'update:elevated', value: boolean): void
  (event: 'update:modelValue', value: boolean): void
}>()

const localEnabled = ref<Record<string, boolean>>({})
const localElevated = ref(props.elevated)

const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

const elevatedValue = computed({
  get: () => localElevated.value,
  set: value => {
    localElevated.value = value
    emit('update:elevated', value)
  },
})

watch(
  () => props.enabled,
  () => {
    resetLocalSettings()
  },
  { deep: true, immediate: true },
)

watch(
  () => props.elevated,
  value => {
    localElevated.value = value
  },
)

watch(
  () => props.items.map(item => getItemValue(item)).join('\u0000'),
  () => {
    syncLocalEnabledItems()
  },
)

// 重置弹窗内部设置副本，避免直接修改父级 props。
function resetLocalSettings() {
  localEnabled.value = { ...props.enabled }
  localElevated.value = props.elevated
  syncLocalEnabledItems()
}

// 同步新增设置项的默认状态，避免刷新列表时覆盖用户正在编辑的本地选择。
function syncLocalEnabledItems() {
  props.items.forEach(item => {
    const key = getItemValue(item)
    if (key && !(key in localEnabled.value)) {
      localEnabled.value[key] = Boolean(props.enabled[key])
    }
  })
}

// 获取设置项的稳定键值。
function getItemValue(item: UnknownRecord) {
  return props.valueGetter?.(item) ?? String(item.id ?? item.title ?? item.name ?? '')
}

// 获取设置项展示名称。
function getItemLabel(item: UnknownRecord) {
  return props.labelGetter?.(item) ?? String(item.attrs?.title ?? item.name ?? item.title ?? '')
}

// 切换单个设置项的启用状态。
function toggleItem(item: UnknownRecord) {
  const key = getItemValue(item)
  localEnabled.value[key] = !localEnabled.value[key]
}

// 批量设置所有项目启用状态。
function setAllItems(value: boolean) {
  props.items.forEach(item => {
    localEnabled.value[getItemValue(item)] = value
  })
}

// 提交通用内容开关设置。
function submitSettings() {
  emit('save', {
    elevated: localElevated.value,
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
          <VIcon icon="mdi-tune" size="18" class="me-2" />
          <span>{{ props.title }}</span>
        </VCardTitle>
        <VDialogCloseBtn v-model="visible" />
      </VCardItem>
      <VDivider />
      <VCardText class="settings-card-body">
        <p class="settings-hint">{{ props.hint }}</p>
        <div class="settings-grid">
          <button
            v-for="item in props.items"
            :key="getItemValue(item)"
            type="button"
            class="setting-item"
            :class="{ 'enabled': localEnabled[getItemValue(item)] }"
            :aria-pressed="Boolean(localEnabled[getItemValue(item)])"
            :title="getItemLabel(item)"
            @click="toggleItem(item)"
          >
            <span class="setting-item-inner">
              <span class="setting-check">
                <VIcon
                  :icon="localEnabled[getItemValue(item)] ? 'mdi-check-circle' : 'mdi-checkbox-blank-circle-outline'"
                  size="18"
                  class="setting-check-icon"
                />
              </span>
              <span class="setting-label">{{ getItemLabel(item) }}</span>
            </span>
          </button>
        </div>
        <div v-if="props.switchLabel" class="mp-settings-card mt-4">
          <div class="mp-setting-row">
            <VSwitch
              v-model="elevatedValue"
              :label="props.switchLabel"
              color="primary"
              inset
              density="compact"
              hide-details
            />
          </div>
        </div>
      </VCardText>
      <VDivider />
      <VCardActions class="app-dialog-actions settings-card-actions">
        <VBtn
          v-if="props.showBulkActions"
          color="default"
          variant="outlined"
          size="small"
          class="setting-action-btn"
          @click="setAllItems(true)"
        >
          {{ props.selectAllText }}
        </VBtn>
        <VBtn
          v-if="props.showBulkActions"
          color="default"
          variant="outlined"
          size="small"
          class="setting-action-btn"
          @click="setAllItems(false)"
        >
          {{ props.selectNoneText }}
        </VBtn>
        <VSpacer />
        <VBtn color="default" variant="text" size="small" class="setting-action-btn" @click="visible = false">
          {{ t('common.cancel') }}
        </VBtn>
        <VBtn color="primary" variant="flat" size="small" class="setting-action-btn px-4" @click="submitSettings">
          {{ t('common.save') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped>
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

.settings-hint {
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 13px;
  line-height: 1.45;
  margin-block-end: 14px;
}

.settings-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.setting-item {
  appearance: none;
  position: relative;
  overflow: hidden;
  border: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.1));
  border-radius: 8px;
  background-color: rgba(var(--v-theme-on-surface), 0.02);
  cursor: pointer;
  font: inherit;
  min-block-size: 42px;
  padding-block: 10px;
  padding-inline: 12px;
  text-align: start;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}

.setting-item:hover {
  border-color: var(--mp-border-hover, rgba(var(--v-theme-on-surface), 0.22));
  background-color: rgba(var(--v-theme-on-surface), 0.04);
}

.setting-item.enabled {
  border-color: rgba(var(--v-theme-primary), 0.45);
  background-color: var(--mp-item-active-bg, rgba(var(--v-theme-on-surface), 0.055));
}

.setting-item:focus-visible {
  outline: 2px solid rgba(var(--v-theme-primary), 0.36);
  outline-offset: 2px;
}

.setting-item-inner {
  display: flex;
  align-items: center;
  gap: 8px;
  min-inline-size: 0;
}

.setting-check {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
}

.setting-check-icon {
  color: rgba(var(--v-theme-on-surface), 0.38);
  transition: color 0.16s ease;
}

.setting-item.enabled .setting-check-icon {
  color: rgb(var(--v-theme-primary));
}

.setting-label {
  overflow: hidden;
  flex: 1;
  color: rgba(var(--v-theme-on-surface), 0.56);
  font-size: 13.5px;
  font-weight: 400;
  line-height: 1.35;
  min-inline-size: 0;
  text-align: start;
  text-overflow: ellipsis;
  transition: color 0.16s ease;
  white-space: nowrap;
}

.setting-item.enabled .setting-label {
  color: rgba(var(--v-theme-on-surface), 0.94);
  font-weight: 500;
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
