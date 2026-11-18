<script lang="ts" setup>
import { formatDateDifference } from '@/@core/utils/formatters'
import type { WorkflowShare } from '@/api/types'
import { useI18n } from '@/composables/useChineseText'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useGlobalSettingsStore } from '@/stores'
import { isOwnShare } from '@/utils/sharePermissions'

const ForkWorkflowDialog = defineAsyncComponent(() => import('../dialog/ForkWorkflowDialog.vue'))

// 输入参数
const props = defineProps({
  workflow: Object as PropType<WorkflowShare>,
  eventTypes: {
    type: Array as PropType<Array<{ title: string; value: string }>>,
    default: () => [],
  },
  batchMode: Boolean,
  selected: Boolean,
  deletable: {
    type: Boolean,
    default: undefined,
  },
})

// 定义事件
const emit = defineEmits(['delete', 'update', 'toggle-select'])

const { t } = useI18n()
const globalSettingsStore = useGlobalSettingsStore()

// 工作流ID
const workflowId = ref<string>()

// 响应式分享相对时间
const dateText = computed(() => (props.workflow?.date ? formatDateDifference(props.workflow.date) : ''))

const isMine = computed(() => isOwnShare(props.workflow?.share_uid, globalSettingsStore.globalSettings.USER_UNIQUE_ID))

const isSelectableInBatch = computed(() => props.deletable ?? true)

const displayTitle = computed(() => props.workflow?.share_title || props.workflow?.name || t('common.unknown'))

const commentText = computed(() => {
  const comment = props.workflow?.share_comment?.trim()
  if (comment) return comment
  return props.workflow?.description?.trim() || ''
})

// 解析动作节点数量
const actionCount = computed(() => {
  const raw = props.workflow?.actions
  if (!raw) return 0
  if (Array.isArray(raw)) return raw.length
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.length : 0
    } catch {
      return 0
    }
  }
  return 0
})

// 触发类型展示文案
const triggerBadgeText = computed(() => {
  const trigger = props.workflow?.trigger_type
  if (trigger === 'event') {
    const matched = props.eventTypes.find(item => item.value === props.workflow?.event_type)
    return matched?.title || t('workflow.task.info.eventConditionCount', { count: 1 }).split(' ')[0] || '事件触发'
  }
  if (trigger === 'manual') return t('workflow.task.info.manualTrigger')
  if (props.workflow?.timer) return props.workflow.timer
  if (trigger === 'timer') return t('workflow.task.info.timer')
  return ''
})

function handleCardClick() {
  if (props.batchMode) {
    if (isSelectableInBatch.value) {
      emit('toggle-select')
    }
    return
  }
  showForkWorkflow()
}

// 复用工作流
function showForkWorkflow() {
  openSharedDialog(
    ForkWorkflowDialog,
    {
      workflow: props.workflow,
      eventTypes: props.eventTypes,
    },
    {
      fork: finishForkWorkflow,
      delete: doDelete,
    },
    { closeOn: ['close', 'fork', 'delete'] },
  )
}

// 完成复用工作流
function finishForkWorkflow(wid: string) {
  workflowId.value = wid
  emit('update')
}

// 删除工作流分享时处理
function doDelete() {
  emit('delete')
}
</script>

<template>
  <div class="h-full">
    <VHover>
      <template #default="hover">
        <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
        <div v-bind="hover.props" class="workflow-share-card-hover-area h-full">
          <VCard
            :key="props.workflow?.id"
            class="workflow-share-card app-hover-lift-card h-full overflow-hidden"
            :class="{
              'workflow-share-card--selected': props.batchMode && props.selected,
              'workflow-share-card--disabled': props.batchMode && !isSelectableInBatch,
              'app-hover-lift-card--hovering': hover.isHovering && !(props.batchMode && !isSelectableInBatch),
            }"
            @click="handleCardClick"
          >
            <div class="workflow-share-card__layout">
              <div class="workflow-share-card__header">
                <div class="workflow-share-card__icon-box" aria-hidden="true">
                  <VIcon icon="mdi-sitemap-outline" size="20" />
                </div>

                <div class="workflow-share-card__title-wrap">
                  <VCardTitle class="workflow-share-card__title pa-0" :title="displayTitle">
                    {{ displayTitle }}
                  </VCardTitle>
                </div>

                <div class="workflow-share-card__badges">
                  <template v-if="props.batchMode">
                    <VIcon
                      v-if="isSelectableInBatch"
                      :icon="props.selected ? 'mdi-checkbox-marked-circle' : 'mdi-checkbox-blank-circle-outline'"
                      :color="props.selected ? 'primary' : undefined"
                      size="20"
                    />
                    <VIcon v-else icon="mdi-lock-outline" size="16" class="text-disabled" />
                  </template>
                  <span v-else-if="isMine" class="workflow-share-card__mine-badge">
                    {{ t('subscribe.myShareBadge') }}
                  </span>
                </div>
              </div>

              <div v-if="commentText" class="workflow-share-card__comment" :title="commentText">
                {{ commentText }}
              </div>

              <div v-if="actionCount > 0 || triggerBadgeText" class="workflow-share-card__pills">
                <span v-if="actionCount > 0" class="workflow-share-card__pill workflow-share-card__pill--accent">
                  {{ actionCount }} 个节点
                </span>
                <span v-if="triggerBadgeText" class="workflow-share-card__pill" :title="triggerBadgeText">
                  {{ triggerBadgeText }}
                </span>
              </div>

              <div class="workflow-share-card__footer">
                <div
                  class="workflow-share-card__author"
                  :class="{ 'workflow-share-card__author--mine': isMine }"
                  :title="props.workflow?.share_user"
                >
                  <VIcon icon="mdi-account-circle-outline" size="15" aria-hidden="true" />
                  <span class="workflow-share-card__author-name">
                    {{ props.workflow?.share_user || t('common.unknown') }}
                  </span>
                </div>

                <div class="workflow-share-card__stats">
                  <span v-if="props.workflow?.count" class="workflow-share-card__heat">
                    <VIcon icon="mdi-fire" size="14" aria-hidden="true" />
                    <span>{{ props.workflow.count.toLocaleString() }}</span>
                  </span>
                  <span v-if="dateText" class="workflow-share-card__date" :title="props.workflow?.date">
                    <VIcon icon="mdi-calendar" size="14" aria-hidden="true" />
                    <span>{{ dateText }}</span>
                  </span>
                </div>
              </div>
            </div>
          </VCard>
        </div>
      </template>
    </VHover>
  </div>
</template>

<style lang="scss" scoped>
.workflow-share-card-hover-area {
  inline-size: 100%;
}

.workflow-share-card {
  position: relative;
  border: 1px solid var(--mp-border-card);
  border-radius: 12px !important;
  background-color: rgb(var(--v-theme-surface)) !important;
  color: rgb(var(--v-theme-on-surface));
  cursor: pointer;
  min-block-size: 148px;
  min-inline-size: 0;
  transition: border-color 0.16s ease;
}

.workflow-share-card:hover {
  border-color: var(--mp-border-hover);
}

.workflow-share-card--selected {
  border-color: rgb(var(--v-theme-primary));
  box-shadow: 0 0 0 2px rgba(var(--v-theme-primary), 0.28);
}

.workflow-share-card--disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.workflow-share-card__layout {
  display: flex;
  flex-direction: column;
  block-size: 100%;
  gap: 0.5rem;
  min-inline-size: 0;
  padding: 0.875rem 1rem;
}

.workflow-share-card__header {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-inline-size: 0;
}

.workflow-share-card__icon-box {
  display: inline-flex;
  flex: 0 0 36px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.05);
  block-size: 36px;
  color: rgba(var(--v-theme-on-surface), 0.76);
  inline-size: 36px;
}

.workflow-share-card__title-wrap {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  min-inline-size: 0;
}

.workflow-share-card__title {
  overflow: hidden;
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-share-card__badges {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.3rem;
}

.workflow-share-card__mine-badge {
  border-radius: 6px;
  background: rgba(var(--v-theme-success), 0.14);
  color: rgb(var(--v-theme-success));
  font-size: 0.68rem;
  font-weight: 700;
  line-height: 1.2;
  padding-block: 2px;
  padding-inline: 6px;
}

.workflow-share-card__comment {
  display: -webkit-box;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.8rem;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.workflow-share-card__pills {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  min-inline-size: 0;
}

.workflow-share-card__pill {
  overflow: hidden;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), 0.78);
  font-size: 0.7rem;
  font-weight: 500;
  line-height: 1.35;
  max-inline-size: 10rem;
  padding-block: 1px;
  padding-inline: 6px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-share-card__pill--accent {
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}

.workflow-share-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-block-start: auto;
  min-inline-size: 0;
  padding-block-start: 0.25rem;
}

.workflow-share-card__author {
  display: inline-flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  font-weight: 500;
  gap: 0.25rem;
  min-inline-size: 0;
}

.workflow-share-card__author--mine {
  color: rgb(var(--v-theme-success));
  font-weight: 600;
}

.workflow-share-card__author-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-share-card__stats {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.74rem;
  font-variant-numeric: tabular-nums;
  gap: 0.55rem;
}

.workflow-share-card__heat {
  display: inline-flex;
  align-items: center;
  color: rgb(var(--v-theme-warning));
  font-weight: 600;
  gap: 0.18rem;
}

.workflow-share-card__date {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
}
</style>
