<script lang="ts" setup>
import type { CustomRule } from '@/api/types'
import { useI18n } from '@/composables/useChineseText'
import { openSharedDialog } from '@/composables/useSharedDialog'

const CustomRuleInfoDialog = defineAsyncComponent(() => import('@/components/dialog/CustomRuleInfoDialog.vue'))

const { t } = useI18n()

// 输入参数
const props = defineProps({
  // 单条规则
  rule: {
    type: Object as PropType<CustomRule>,
    required: true,
  },
  // 所有规则
  rules: {
    type: Array as PropType<CustomRule[]>,
    required: true,
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['close', 'change', 'done'])

const ruleSummary = computed(() => {
  const parts: string[] = []
  if (props.rule.include) parts.push(`包含: ${props.rule.include}`)
  if (props.rule.exclude) parts.push(`排除: ${props.rule.exclude}`)
  if (props.rule.size_range) parts.push(`体积: ${props.rule.size_range}`)
  if (props.rule.seeders) parts.push(`做种: ${props.rule.seeders}`)
  return parts.join(' · ')
})

/** 打开共享自定义规则配置弹窗。 */
function openRuleInfoDialog() {
  openSharedDialog(
    CustomRuleInfoDialog,
    {
      rule: props.rule,
      rules: props.rules,
    },
    {
      change: (...args: unknown[]) => emit('change', ...args),
      done: () => emit('done'),
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

/** 关闭自定义规则卡片。 */
function onClose() {
  emit('close')
}
</script>

<template>
  <VCard v-bind="$attrs" variant="flat" class="app-card-shell setting-item-card" @click="openRuleInfoDialog">
    <div class="setting-item-card__body">
      <div class="setting-item-card__icon-box" aria-hidden="true">
        <VIcon icon="mdi-filter-cog-outline" size="20" class="setting-item-card__glyph" />
      </div>

      <div class="setting-item-card__main">
        <div class="setting-item-card__head">
          <div class="setting-item-card__title-wrap">
            <span class="setting-item-card__title app-card-summary__title" :title="props.rule.name">
              {{ props.rule.name }}
            </span>
            <span v-if="props.rule.id" class="setting-item-card__code-pill">
              {{ props.rule.id }}
            </span>
          </div>

          <div class="setting-item-card__actions" @click.stop>
            <VBtn variant="text" icon class="setting-item-card__action-btn" @click.stop>
              <VIcon class="cursor-move" icon="mdi-drag" size="17" />
            </VBtn>
            <VBtn
              variant="text"
              icon
              class="setting-item-card__action-btn"
              :aria-label="t('common.delete')"
              @click.stop="onClose"
            >
              <VIcon icon="mdi-close" size="17" />
            </VBtn>
          </div>
        </div>

        <div class="setting-item-card__subtitle" :title="ruleSummary || props.rule.id">
          <span>{{ ruleSummary || `ID: ${props.rule.id}` }}</span>
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
  background-color: var(--mp-item-bg) !important;
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}

.setting-item-card:hover {
  border-color: var(--mp-border-hover);
  background-color: var(--mp-item-active-bg) !important;
}

.setting-item-card__body {
  display: flex;
  align-items: center;
  gap: 11px;
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
  background: rgba(var(--v-theme-on-surface), 0.05);
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

.setting-item-card__code-pill {
  flex-shrink: 0;
  border-radius: 5px;
  background: rgba(var(--v-theme-on-surface), 0.07);
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.3;
  padding-block: 1px;
  padding-inline: 6px;
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
  color: rgb(var(--v-theme-on-surface));
}

.setting-item-card__subtitle {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  line-height: 1.35;
  min-inline-size: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
