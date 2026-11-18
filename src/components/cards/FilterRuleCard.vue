<script lang="ts" setup>
import { innerFilterRules } from '@/api/constants'
import { CustomRule } from '@/api/types'
import { cloneDeep } from 'lodash-es'
import { useI18n } from '@/composables/useChineseText'

// 获取i18n实例
const { t } = useI18n()

// 输入参数
const props = defineProps({
  pri: String,
  rules: Array as PropType<string[]>,
  custom_rules: Array as PropType<CustomRule[]>,
})

// 定义触发的自定义事件
const emit = defineEmits(['close', 'changed'])

/** 关闭当前优先级规则卡片。 */
function onClose() {
  emit('close')
}

/** 将当前优先级的规则选择结果通知父组件。 */
function filtersChanged(value: string[]) {
  emit('changed', props.pri, value)
}

// 过滤规则下拉框
// 同时包含内置规则与用户自定义规则；使用 computed 而非 onMounted 一次性赋值，
// 是为了在父组件异步加载完 custom_rules 或后续新增/删除规则时，
// 选项与已选 chip 的显示名（title）能跟随刷新，避免回退到原始 ID（如 "zhong"）。
const selectFilterOptions = computed<{ [key: string]: string }[]>(() => {
  const options = cloneDeep(innerFilterRules)
  props.custom_rules?.forEach(rule => {
    options.push({
      title: rule.name,
      value: rule.id,
    })
  })
  return options
})
</script>

<template>
  <VCard v-bind="$attrs" variant="flat" class="app-card-shell filter-rule-card">
    <div class="filter-rule-card__head">
      <span class="filter-rule-card__title">{{ t('filterRule.priority') }} {{ props.pri }}</span>
      <div class="filter-rule-card__actions" @click.stop>
        <VBtn variant="text" icon class="filter-rule-card__action-btn" @click.stop>
          <VIcon class="cursor-move" icon="mdi-drag" size="17" />
        </VBtn>
        <VBtn
          variant="text"
          icon
          class="filter-rule-card__action-btn"
          :aria-label="t('common.delete')"
          @click.stop="onClose"
        >
          <VIcon icon="mdi-close" size="17" />
        </VBtn>
      </div>
    </div>
    <div class="filter-rule-card__body">
      <VAutocomplete
        :model-value="props.rules"
        variant="outlined"
        density="compact"
        hide-details
        :items="selectFilterOptions"
        chips
        :label="t('filterRule.rules')"
        mobile-control-width="80%"
        multiple
        clearable
        @update:modelValue="filtersChanged"
      />
    </div>
  </VCard>
</template>

<style scoped>
.filter-rule-card {
  border: 1px solid var(--mp-border-card);
  border-radius: 12px !important;
  background-color: rgba(var(--v-theme-on-surface), 0.03) !important;
  padding: 12px 14px 14px;
  transition: border-color 0.16s ease;
}

.filter-rule-card:hover {
  border-color: var(--mp-border-hover);
}

.filter-rule-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-block-end: 10px;
}

.filter-rule-card__title {
  color: rgb(var(--v-theme-on-surface));
  font-size: 14px;
  font-weight: 600;
}

.filter-rule-card__actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.filter-rule-card__action-btn {
  border-radius: 6px !important;
  block-size: 28px !important;
  color: rgba(var(--v-theme-on-surface), 0.56);
  inline-size: 28px !important;
  min-inline-size: 28px !important;
  padding: 0 !important;
}

.filter-rule-card__action-btn:hover {
  color: rgb(var(--v-theme-on-surface));
}

.filter-rule-card :deep(.v-field) {
  border-radius: 8px;
}
</style>
