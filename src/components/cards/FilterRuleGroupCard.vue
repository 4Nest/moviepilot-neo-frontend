<script lang="ts" setup>
import type { CustomRule, FilterRuleGroup } from '@/api/types'
import { useI18n } from '@/composables/useChineseText'
import { openSharedDialog } from '@/composables/useSharedDialog'

const FilterRuleGroupInfoDialog = defineAsyncComponent(
  () => import('@/components/dialog/FilterRuleGroupInfoDialog.vue'),
)

// 获取i18n实例
const { t } = useI18n()

// 输入参数
const props = defineProps({
  // 单个规则组
  group: {
    type: Object as PropType<FilterRuleGroup>,
    required: true,
  },
  // 所有规则组
  groups: {
    type: Array as PropType<FilterRuleGroup[]>,
    required: true,
  },
  // 媒体类型字典
  categories: {
    type: Object as PropType<{ [key: string]: any }>,
    required: true,
  },
  // 自定义规则列表
  custom_rules: Array as PropType<CustomRule[]>,
})

// 定义触发的自定义事件
const emit = defineEmits(['close', 'change', 'done'])

const scopeLabel = computed(() => props.group.category || props.group.media_type || t('common.all'))

const priorityLevelCount = computed(() => {
  const raw = props.group.rule_string?.trim()
  if (!raw) return 0
  return raw.split('>').filter(item => item.trim().length > 0).length
})

/** 打开共享过滤规则组配置弹窗。 */
function openGroupInfoDialog() {
  openSharedDialog(
    FilterRuleGroupInfoDialog,
    {
      group: props.group,
      groups: props.groups,
      categories: props.categories,
      custom_rules: props.custom_rules,
    },
    {
      change: (...args: unknown[]) => emit('change', ...args),
      done: () => emit('done'),
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

/** 关闭过滤规则组卡片。 */
function onClose() {
  emit('close')
}
</script>

<template>
  <VCard v-bind="$attrs" variant="flat" class="app-card-shell setting-item-card" @click="openGroupInfoDialog">
    <div class="setting-item-card__body">
      <div class="setting-item-card__icon-box" aria-hidden="true">
        <VIcon icon="mdi-tune-vertical" size="20" class="setting-item-card__glyph" />
      </div>

      <div class="setting-item-card__main">
        <div class="setting-item-card__head">
          <div class="setting-item-card__title-wrap">
            <span class="setting-item-card__title app-card-summary__title" :title="props.group.name">
              {{ props.group.name }}
            </span>
          </div>

          <div class="setting-item-card__actions" @click.stop>
            <VBtn variant="text" icon class="setting-item-card__action-btn" @click.stop>
              <VIcon class="cursor-move" icon="mdi-drag" size="16" />
            </VBtn>
            <VBtn
              variant="text"
              icon
              class="setting-item-card__action-btn"
              :aria-label="t('common.delete')"
              @click.stop="onClose"
            >
              <VIcon icon="mdi-close" size="16" />
            </VBtn>
          </div>
        </div>

        <div class="setting-item-card__subtitle">
          <span class="setting-item-card__scope-pill">{{ scopeLabel }}</span>
          <template v-if="priorityLevelCount > 0">
            <span class="setting-item-card__sep">·</span>
            <span>{{ priorityLevelCount }} 级优先级</span>
          </template>
        </div>
      </div>
    </div>
  </VCard>
</template>

<style scoped>
.setting-item-card {
  position: relative;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px !important;
  background-color: rgba(var(--v-theme-on-surface), 0.025) !important;
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}

.setting-item-card:hover {
  border-color: var(--mp-border-hover);
  background-color: rgba(var(--v-theme-on-surface), 0.045) !important;
}

.setting-item-card__body {
  display: flex;
  align-items: center;
  gap: 12px;
  min-block-size: 66px;
  padding: 12px 14px;
}

.setting-item-card__icon-box {
  display: inline-flex;
  flex: 0 0 38px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 9px;
  background: rgba(var(--v-theme-on-surface), 0.045);
  block-size: 38px;
  inline-size: 38px;
}

.setting-item-card__glyph {
  color: rgba(var(--v-theme-on-surface), 0.72);
}

.setting-item-card__main {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 4px;
  min-inline-size: 0;
}

.setting-item-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-inline-size: 0;
}

.setting-item-card__title-wrap {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 6px;
  min-inline-size: 0;
}

.setting-item-card__title {
  overflow: hidden;
  color: rgb(var(--v-theme-on-surface));
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.setting-item-card__actions {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 2px;
}

.setting-item-card__action-btn {
  border-radius: 6px !important;
  block-size: 26px !important;
  color: rgba(var(--v-theme-on-surface), 0.56);
  inline-size: 26px !important;
  min-inline-size: 26px !important;
  padding: 0 !important;
}

.setting-item-card__action-btn:hover {
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgb(var(--v-theme-on-surface));
}

.setting-item-card__subtitle {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  gap: 4px 6px;
  line-height: 1.35;
  min-inline-size: 0;
}

.setting-item-card__scope-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 5px;
  background: rgba(var(--v-theme-on-surface), 0.07);
  block-size: 20px;
  color: rgba(var(--v-theme-on-surface), 0.78);
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  padding-inline: 6px;
}

.setting-item-card__sep {
  opacity: 0.55;
}
</style>
