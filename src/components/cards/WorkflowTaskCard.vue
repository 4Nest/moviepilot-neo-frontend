<script lang="ts" setup>
import { Workflow } from '@/api/types'
import { useToast } from 'vue-toastification'
import { useConfirm } from '@/composables/useConfirm'
import api from '@/api'
import { useI18n } from '@/composables/useChineseText'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { formatDateDifference } from '@/@core/utils/formatters'

const WorkflowActionsDialog = defineAsyncComponent(() => import('@/components/dialog/WorkflowActionsDialog.vue'))
const WorkflowAddEditDialog = defineAsyncComponent(() => import('@/components/dialog/WorkflowAddEditDialog.vue'))
const WorkflowShareDialog = defineAsyncComponent(() => import('@/components/dialog/WorkflowShareDialog.vue'))
const WorkflowExecutionDialog = defineAsyncComponent(() => import('@/components/dialog/WorkflowExecutionDialog.vue'))

const { t } = useI18n()

// 定义输入参数
const props = defineProps({
  workflow: {
    required: true,
    type: Object as PropType<Workflow>,
  },
  eventTypes: {
    type: Array as PropType<Array<{ title: string; value: string }>>,
    default: () => [],
  },
})

// 定义事件
const emit = defineEmits(['refresh', 'remove'])

// 提示框
const $toast = useToast()

// 确认框
const createConfirm = useConfirm()

// 加载中
const loading = ref(false)

// 根据事件类型值获取显示文本
const getEventTypeText = (eventTypeValue: string) => {
  const eventType = props.eventTypes.find(item => item.value === eventTypeValue)
  return eventType ? eventType.title : eventTypeValue
}

// 读取编辑所需的完整配置
async function loadWorkflow(item: Workflow): Promise<Workflow | null> {
  if (loading.value) return null
  loading.value = true
  try {
    // 卡片只持有摘要，编辑必须读取完整配置，避免保存时丢失动作参数或连线。
    return await api.get(`workflow/${item.id}`)
  } catch (error) {
    console.error(error)
    $toast.error(t('common.error'))
    return null
  } finally {
    loading.value = false
  }
}

// 编辑任务
async function handleEdit(item: Workflow) {
  const workflow = await loadWorkflow(item)
  if (!workflow) return
  openSharedDialog(
    WorkflowAddEditDialog,
    { workflow },
    {
      save: editDone,
    },
    { closeOn: ['close', 'save'] },
  )
}

// 编辑流程
async function handleFlow(item: Workflow) {
  const workflow = await loadWorkflow(item)
  if (!workflow) return
  openSharedDialog(
    WorkflowActionsDialog,
    { workflow },
    {
      save: editDone,
    },
    { closeOn: ['close', 'save'] },
  )
}

// 执行详情透视
function handleExecutionDetail(item: Workflow) {
  const dialogCtrl = openSharedDialog(
    WorkflowExecutionDialog,
    { workflow: item },
    {
      refresh: editDone,
      'open-flow': async (targetWorkflow: Workflow) => {
        dialogCtrl.close()
        await handleFlow(targetWorkflow || item)
      },
    },
    { closeOn: ['close'] },
  )
}

// 复制工作流副本
async function handleClone(item: Workflow) {
  if (loading.value) return
  loading.value = true
  try {
    const result: { success: boolean; message?: string; data?: { id?: number | string; name?: string } } =
      await api.post(`workflow/${item.id}/clone`)
    if (result.success) {
      $toast.success(t('workflow.task.cloneSuccess', { name: result.data?.name || `${item.name}` }))
      emit('refresh')
    } else {
      $toast.error(t('workflow.task.cloneFailed', { message: result.message || '' }))
    }
  } catch (error) {
    console.error(error)
    $toast.error(t('common.error'))
  } finally {
    loading.value = false
  }
}

// 分享工作流
function handleShare(item: Workflow) {
  openSharedDialog(WorkflowShareDialog, { workflow: item }, {}, { closeOn: ['close'] })
}

// 编辑完成
function editDone() {
  emit('refresh')
}

// 删除任务
async function handleDelete(item: Workflow) {
  if (loading.value) return
  loading.value = true
  try {
    const isConfirmed = await createConfirm({
      title: t('common.confirm'),
      content: t('workflow.task.confirmDelete', { name: item.name }),
    })
    if (!isConfirmed) return
    const result: { [key: string]: string } = await api.delete(`workflow/${item.id}`)
    if (result.success) {
      $toast.success(t('workflow.task.deleteSuccess'))
      emit('remove', item.id)
    } else {
      $toast.error(t('workflow.task.deleteFailed', { message: result.message }))
    }
  } catch (error) {
    console.error(error)
    $toast.error(t('common.error'))
  } finally {
    loading.value = false
  }
}

// 开始任务
async function handleEnable(item: Workflow) {
  if (loading.value) return
  loading.value = true
  try {
    const result: { [key: string]: string } = await api.post(`workflow/${item.id}/start`)
    if (result.success) {
      $toast.success(t('workflow.task.enableSuccess'))
      emit('refresh')
    } else {
      $toast.error(t('workflow.task.enableFailed', { message: result.message }))
    }
  } catch (error) {
    console.error(error)
    $toast.error(t('common.error'))
  } finally {
    loading.value = false
  }
}

// 停用任务
async function handlePause(item: Workflow) {
  if (loading.value) return
  loading.value = true
  try {
    const result: { [key: string]: string } = await api.post(`workflow/${item.id}/pause`)
    if (result.success) {
      $toast.success(t('workflow.task.pauseSuccess'))
      emit('refresh')
    } else {
      $toast.error(t('workflow.task.pauseFailed', { message: result.message }))
    }
  } catch (error) {
    console.error(error)
    $toast.error(t('common.error'))
  } finally {
    loading.value = false
  }
}

// 立即执行任务
async function handleRun(item: Workflow, from_begin: boolean) {
  if (loading.value) return
  loading.value = true
  try {
    setTimeout(() => {
      emit('refresh')
    }, 500)
    const result: { [key: string]: string } = await api.post(`workflow/${item.id}/run?from_begin=${from_begin}`, {
      from_begin,
    })
    if (result.success) {
      $toast.success(t('workflow.task.runSuccess'))
      emit('refresh')
    } else {
      $toast.error(t('workflow.task.runFailed', { message: result.message }))
      emit('refresh')
    }
  } catch (error) {
    console.error(error)
    $toast.error(t('common.error'))
  } finally {
    loading.value = false
  }
}

// 重置任务
async function handleReset(item: Workflow) {
  if (loading.value) return
  const isConfirmed = await createConfirm({
    title: t('common.confirm'),
    content: t('workflow.task.confirmReset', { name: item.name }),
  })

  if (!isConfirmed) return

  loading.value = true
  try {
    const result: { [key: string]: string } = await api.post(`workflow/${item.id}/reset`)
    if (result.success) {
      $toast.success(t('workflow.task.resetSuccess'))
      emit('refresh')
    } else {
      $toast.error(t('workflow.task.resetFailed', { message: result.message }))
    }
  } catch (error) {
    console.error(error)
    $toast.error(t('common.error'))
  } finally {
    loading.value = false
  }
}

type WorkflowStatusColor = 'error' | 'info' | 'primary' | 'secondary' | 'success' | 'warning'
type WorkflowActionSegmentState = 'active' | 'complete' | 'failed' | 'pending'

interface WorkflowActionDisplay {
  id?: string
  name?: string
  type?: string
}

interface WorkflowExecutionNode {
  state?: string
}

const resolveStatusVariant = (status: string | undefined) => {
  const variants: Record<
    string,
    {
      color: WorkflowStatusColor
      icon: string
      text: string
    }
  > = {
    S: { color: 'success', icon: 'mdi-check-circle-outline', text: t('workflow.task.status.success') },
    R: { color: 'primary', icon: 'mdi-progress-clock', text: t('workflow.task.status.running') },
    F: { color: 'error', icon: 'mdi-alert-circle-outline', text: t('workflow.task.status.failed') },
    P: { color: 'secondary', icon: 'mdi-pause-circle-outline', text: t('workflow.task.status.paused') },
    W: { color: 'warning', icon: 'mdi-clock-outline', text: t('workflow.task.status.waiting') },
  }

  return variants[status || 'W'] || variants.W
}

const statusVariant = computed(() => resolveStatusVariant(props.workflow.state))

const triggerDisplay = computed(() => {
  if (props.workflow.trigger_type === 'event') {
    return {
      icon: 'mdi-calendar-check-outline',
      isCron: false,
      text: getEventTypeText(props.workflow.event_type || ''),
    }
  }

  if (props.workflow.trigger_type === 'manual') {
    return {
      icon: 'mdi-hand-pointing-up',
      isCron: false,
      text: t('workflow.task.info.manualTrigger'),
    }
  }

  return {
    icon: 'mdi-clock-outline',
    isCron: Boolean(props.workflow.timer),
    text: props.workflow.timer || t('workflow.task.info.timer'),
  }
})

// 事件触发条件数量统计（支持单字段多操作符计算）
const eventConditionCount = computed(() => {
  if (props.workflow.trigger_type !== 'event') return 0
  const conditions = props.workflow.event_conditions
  if (!conditions || typeof conditions !== 'object' || Array.isArray(conditions)) return 0
  let count = 0
  Object.values(conditions).forEach(rule => {
    if (rule && typeof rule === 'object' && !Array.isArray(rule)) {
      count += Object.keys(rule).length
    } else if (rule !== undefined && rule !== null && rule !== '') {
      count += 1
    }
  })
  return count
})

const workflowActions = computed<WorkflowActionDisplay[]>(() =>
  Array.isArray(props.workflow.actions) ? props.workflow.actions : [],
)

const totalActionCount = computed(() => workflowActions.value.length)

const formattedRunCount = computed(() => Number(props.workflow.run_count || 0).toLocaleString('zh-CN'))

const currentActionIds = computed(() => {
  return new Set(
    (props.workflow.current_action || '')
      .split(',')
      .map(actionId => actionId.trim())
      .filter(Boolean),
  )
})

const executionNodes = computed<Record<string, WorkflowExecutionNode>>(() => {
  const nodes = props.workflow.execution_state?.nodes
  return nodes && typeof nodes === 'object' && !Array.isArray(nodes)
    ? (nodes as Record<string, WorkflowExecutionNode>)
    : {}
})

const finishedActionCount = computed(() => {
  const runtimeCount = Number(props.workflow.execution_state?.runtime?.finished_actions)
  const knownActionIds = new Set(workflowActions.value.map(action => String(action.id || '')).filter(Boolean))
  const fallbackCount = [...currentActionIds.value].filter(actionId => knownActionIds.has(actionId)).length
  const count = Number.isFinite(runtimeCount) && runtimeCount >= 0 ? Math.trunc(runtimeCount) : fallbackCount

  return Math.min(Math.max(count, 0), totalActionCount.value)
})

const actionSegments = computed<WorkflowActionSegmentState[]>(() => {
  return workflowActions.value.map((action, index) => {
    const actionId = action.id ? String(action.id) : ''
    const nodeState = actionId ? executionNodes.value[actionId]?.state : undefined

    if (nodeState === 'failed') return 'failed'
    if (nodeState === 'running' || nodeState === 'queued') return 'active'
    if (nodeState === 'success' || nodeState === 'completed' || nodeState === 'skipped') return 'complete'
    if (actionId && currentActionIds.value.has(actionId)) return 'complete'
    if (index < finishedActionCount.value) return 'complete'
    if (props.workflow.state === 'R' && index === finishedActionCount.value) return 'active'

    return 'pending'
  })
})

const runningActionName = computed(() => {
  const runningAction = workflowActions.value.find(action => {
    if (!action.id) return false
    const nodeState = executionNodes.value[String(action.id)]?.state
    return nodeState === 'running' || nodeState === 'queued'
  })

  return runningAction?.name || runningAction?.type || ''
})

const executionStatus = computed(() => {
  if (props.workflow.state === 'R') {
    if (runningActionName.value) {
      return {
        color: 'primary' as WorkflowStatusColor,
        icon: 'mdi-pulse',
        text: t('workflow.task.info.executingAction', { name: runningActionName.value }),
      }
    }

    if (totalActionCount.value > 0) {
      return {
        color: 'primary' as WorkflowStatusColor,
        icon: 'mdi-pulse',
        text: t('workflow.task.info.preparingAction', {
          current: Math.min(finishedActionCount.value + 1, totalActionCount.value),
        }),
      }
    }

    return {
      color: 'secondary' as WorkflowStatusColor,
      icon: 'mdi-vector-polyline-remove',
      text: t('workflow.task.info.noActions'),
    }
  }

  if (props.workflow.state === 'F') {
    return {
      color: 'error' as WorkflowStatusColor,
      icon: 'mdi-alert-circle-outline',
      text: props.workflow.result || t('workflow.task.status.failed'),
    }
  }

  if (props.workflow.last_time) {
    return {
      color: undefined,
      icon: 'mdi-history',
      text: t('workflow.task.info.lastExecuted', { time: formatDateDifference(props.workflow.last_time) }),
    }
  }

  if (finishedActionCount.value > 0) {
    return {
      color: undefined,
      icon: 'mdi-history',
      text: t('workflow.task.info.executionIncomplete'),
    }
  }

  return {
    color: undefined,
    icon: 'mdi-history',
    text: t('workflow.task.info.neverExecuted'),
  }
})
</script>
<template>
  <div class="h-full">
    <VHover v-slot="hover">
      <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
      <div v-bind="hover.props" class="workflow-task-card-hover-area h-full">
        <VCard
          class="workflow-task-card app-hover-lift-card mx-auto h-full"
          @click="handleFlow(workflow)"
          :ripple="false"
          :loading="loading"
          :class="[
            `workflow-task-card--status-${statusVariant.color}`,
            {
              'workflow-task-card--paused': workflow.state === 'P',
              'app-hover-lift-card--hovering': hover.isHovering,
            },
          ]"
        >
          <!-- 顶栏：触发图标 + 名称/触发规则 + 状态胶囊 + 更多菜单 -->
          <div class="workflow-task-card__header">
            <div class="workflow-task-card__trigger-badge">
              <VIcon :icon="triggerDisplay.icon" size="18" :data-workflow-trigger-icon="triggerDisplay.icon" />
            </div>

            <div class="workflow-task-card__heading">
              <div class="workflow-task-card__title" :title="workflow.description || workflow.name">
                {{ workflow.name }}
              </div>
              <div class="workflow-task-card__trigger-meta">
                <span :class="{ 'workflow-task-card__cron': triggerDisplay.isCron }">{{ triggerDisplay.text }}</span>
                <span v-if="eventConditionCount > 0" class="workflow-task-card__condition-hint">
                  · {{ t('workflow.task.info.eventConditionCount', { count: eventConditionCount }) }}
                </span>
              </div>
            </div>

            <div class="workflow-task-card__header-actions">
              <VChip
                :color="statusVariant.color"
                size="x-small"
                variant="tonal"
                class="workflow-task-card__status-chip"
              >
                <span class="workflow-task-card__status-dot" aria-hidden="true" />
                {{ statusVariant.text }}
              </VChip>

              <IconBtn
                class="workflow-task-card__menu"
                :disabled="loading"
                size="x-small"
                density="comfortable"
                :aria-label="t('workflow.task.moreActions')"
                @click.stop
              >
                <VIcon icon="mdi-dots-vertical" size="16" />
                <VTooltip activator="parent" location="top">{{ t('workflow.task.moreActions') }}</VTooltip>
                <VMenu activator="parent" close-on-content-click>
                  <VList density="compact">
                    <VListItem base-color="primary" @click="handleEdit(workflow)">
                      <template #prepend>
                        <VIcon icon="mdi-note-edit" size="18" />
                      </template>
                      <VListItemTitle>{{ t('workflow.task.edit') }}</VListItemTitle>
                    </VListItem>
                    <VListItem base-color="success" @click="handleFlow(workflow)">
                      <template #prepend>
                        <VIcon icon="mdi-vector-polyline" size="18" />
                      </template>
                      <VListItemTitle>{{ t('workflow.task.editFlow') }}</VListItemTitle>
                    </VListItem>
                    <VListItem base-color="primary" @click="handleExecutionDetail(workflow)">
                      <template #prepend>
                        <VIcon icon="mdi-timeline-text-outline" size="18" />
                      </template>
                      <VListItemTitle>{{ t('workflow.task.executionDetail') }}</VListItemTitle>
                    </VListItem>
                    <VListItem base-color="info" @click="handleClone(workflow)">
                      <template #prepend>
                        <VIcon icon="mdi-content-copy" size="18" />
                      </template>
                      <VListItemTitle>{{ t('workflow.task.clone') }}</VListItemTitle>
                    </VListItem>
                    <VListItem v-if="workflow.current_action" base-color="info" @click="handleRun(workflow, false)">
                      <template #prepend>
                        <VIcon icon="mdi-play-speed" size="18" />
                      </template>
                      <VListItemTitle>{{ t('workflow.task.continue') }}</VListItemTitle>
                    </VListItem>
                    <VListItem v-if="workflow.current_action" base-color="info" @click="handleRun(workflow, true)">
                      <template #prepend>
                        <VIcon icon="mdi-replay" size="18" />
                      </template>
                      <VListItemTitle>{{ t('workflow.task.restart') }}</VListItemTitle>
                    </VListItem>
                    <VListItem v-else base-color="info" @click="handleRun(workflow, true)">
                      <template #prepend>
                        <VIcon icon="mdi-run" size="18" />
                      </template>
                      <VListItemTitle>{{ t('workflow.task.run') }}</VListItemTitle>
                    </VListItem>
                    <VListItem base-color="warning" @click="handleReset(workflow)">
                      <template #prepend>
                        <VIcon icon="mdi-restore-alert" size="18" />
                      </template>
                      <VListItemTitle>{{ t('workflow.task.reset') }}</VListItemTitle>
                    </VListItem>
                    <VListItem base-color="info" @click="handleShare(workflow)">
                      <template #prepend>
                        <VIcon icon="mdi-share" size="18" />
                      </template>
                      <VListItemTitle>{{ t('workflow.task.share') }}</VListItemTitle>
                    </VListItem>
                    <VDivider class="my-1" />
                    <VListItem base-color="error" @click="handleDelete(workflow)">
                      <template #prepend>
                        <VIcon icon="mdi-delete" size="18" />
                      </template>
                      <VListItemTitle>{{ t('workflow.task.delete') }}</VListItemTitle>
                    </VListItem>
                  </VList>
                </VMenu>
              </IconBtn>
            </div>
          </div>

          <VCardText class="workflow-task-card__body">
            <!-- 中段：动作分段进度与累计运行指标合一面板 -->
            <div class="workflow-task-card__progress-panel">
              <div class="workflow-task-card__telemetry-row">
                <div class="workflow-task-card__progress-summary">
                  <span class="workflow-task-card__telemetry-label">{{ t('workflow.task.info.actionProgress') }}</span>
                  <strong class="workflow-task-card__telemetry-value">
                    {{ finishedActionCount }} / {{ totalActionCount }}
                  </strong>
                </div>

                <div
                  class="workflow-task-card__run-stat"
                  :title="`${t('workflow.task.info.runCount')}: ${formattedRunCount}`"
                >
                  <span class="workflow-task-card__telemetry-label">{{ t('workflow.task.info.runCount') }}</span>
                  <strong class="workflow-task-card__telemetry-value">{{ formattedRunCount }}</strong>
                </div>
              </div>

              <div
                class="workflow-task-card__action-track"
                role="progressbar"
                :aria-label="`${t('workflow.task.info.actionProgress')}: ${finishedActionCount} / ${totalActionCount}`"
                aria-valuemin="0"
                :aria-valuemax="Math.max(totalActionCount, 1)"
                :aria-valuenow="finishedActionCount"
              >
                <span
                  v-for="(segment, index) in actionSegments"
                  :key="workflowActions[index]?.id || index"
                  class="workflow-task-card__action-segment"
                  :class="`workflow-task-card__action-segment--${segment}`"
                />
                <span
                  v-if="totalActionCount === 0"
                  class="workflow-task-card__action-segment workflow-task-card__action-segment--empty"
                />
              </div>
            </div>

            <!-- 底栏：左侧最近执行动态 + 右侧统一同色系工具栏 -->
            <div class="workflow-task-card__footer">
              <div
                class="workflow-task-card__execution-status"
                :class="executionStatus.color ? `text-${executionStatus.color}` : 'text-medium-emphasis'"
                :title="executionStatus.text"
              >
                <VIcon :icon="executionStatus.icon" size="15" />
                <span>{{ executionStatus.text }}</span>
              </div>

              <div class="workflow-task-card__toolbar" @click.stop>
                <button
                  v-if="workflow.state === 'R'"
                  type="button"
                  class="workflow-task-card__tool-btn workflow-task-card__tool-btn--danger"
                  :disabled="loading"
                  :aria-label="t('workflow.task.stop')"
                  @click.stop="handlePause(workflow)"
                >
                  <VIcon icon="mdi-stop" size="15" />
                  <VTooltip activator="parent" location="top">{{ t('workflow.task.stop') }}</VTooltip>
                </button>
                <button
                  v-else
                  type="button"
                  class="workflow-task-card__tool-btn"
                  :disabled="loading"
                  :aria-label="t('workflow.task.run')"
                  @click.stop="handleRun(workflow, true)"
                >
                  <VIcon icon="mdi-play-outline" size="16" />
                  <VTooltip activator="parent" location="top">{{ t('workflow.task.run') }}</VTooltip>
                </button>

                <button
                  type="button"
                  class="workflow-task-card__tool-btn"
                  :disabled="loading"
                  :aria-label="t('workflow.task.executionDetail')"
                  @click.stop="handleExecutionDetail(workflow)"
                >
                  <VIcon icon="mdi-timeline-text-outline" size="15" />
                  <VTooltip activator="parent" location="top">{{ t('workflow.task.executionDetail') }}</VTooltip>
                </button>

                <button
                  v-if="workflow.state === 'P'"
                  type="button"
                  class="workflow-task-card__toggle-btn workflow-task-card__toggle-btn--enable"
                  :disabled="loading"
                  :aria-label="t('common.enable')"
                  @click.stop="handleEnable(workflow)"
                >
                  <VIcon icon="mdi-play" size="14" />
                  <span>{{ t('common.enable') }}</span>
                </button>
                <button
                  v-else
                  type="button"
                  class="workflow-task-card__toggle-btn"
                  :disabled="loading"
                  :aria-label="t('common.pause')"
                  @click.stop="handlePause(workflow)"
                >
                  <VIcon icon="mdi-pause" size="14" />
                  <span>{{ t('common.pause') }}</span>
                </button>
              </div>
            </div>
          </VCardText>
        </VCard>
      </div>
    </VHover>
  </div>
</template>

<style scoped>
.workflow-task-card-hover-area {
  inline-size: 100%;
}

.workflow-task-card {
  --workflow-status-rgb: var(--v-theme-info);
  --workflow-status-on-rgb: var(--v-theme-on-info);
  --workflow-card-header-content-rgb: var(--v-theme-on-surface);

  display: flex;
  min-block-size: 176px;
  flex-direction: column;
  border: 1px solid var(--mp-border-card);
  background-color: rgb(var(--v-theme-surface));
  overflow: hidden;
  cursor: pointer;
}

.workflow-task-card--paused {
  opacity: 0.88;
}

.workflow-task-card--status-primary {
  --workflow-status-rgb: var(--v-theme-primary);
  --workflow-status-on-rgb: var(--v-theme-on-primary);
}

.workflow-task-card--status-secondary {
  --workflow-status-rgb: var(--v-theme-secondary);
  --workflow-status-on-rgb: var(--v-theme-on-secondary);
}

.workflow-task-card--status-info {
  --workflow-status-rgb: var(--v-theme-info);
  --workflow-status-on-rgb: var(--v-theme-on-info);
}

.workflow-task-card--status-success {
  --workflow-status-rgb: var(--v-theme-success);
  --workflow-status-on-rgb: var(--v-theme-on-success);
}

.workflow-task-card--status-warning {
  --workflow-status-rgb: var(--v-theme-warning);
  --workflow-status-on-rgb: var(--v-theme-on-warning);
}

.workflow-task-card--status-error {
  --workflow-status-rgb: var(--v-theme-error);
  --workflow-status-on-rgb: var(--v-theme-on-error);
}

.workflow-task-card__header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 11px;
  padding: 13px 14px 11px 15px;
  border-block-end: 1px solid var(--mp-border-subtle);
  background-color: rgb(var(--v-theme-surface));
}

.workflow-task-card__trigger-badge {
  display: inline-flex;
  flex: 0 0 38px;
  align-items: center;
  justify-content: center;
  inline-size: 38px;
  block-size: 38px;
  border-radius: 9px;
  background: rgba(var(--workflow-status-rgb), 0.14);
  color: rgb(var(--workflow-status-rgb));
}

.workflow-task-card__heading {
  display: flex;
  min-inline-size: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
}

.workflow-task-card__title {
  min-inline-size: 0;
  overflow: hidden;
  color: rgba(var(--workflow-card-header-content-rgb), var(--v-high-emphasis-opacity));
  font-size: 14.5px;
  font-weight: 600;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-task-card__trigger-meta {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  overflow: hidden;
  color: rgba(var(--workflow-card-header-content-rgb), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-task-card__cron {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11.5px;
  letter-spacing: 0.01em;
}

.workflow-task-card__condition-hint {
  margin-inline-start: 4px;
  opacity: 0.85;
}

.workflow-task-card__header-actions {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
}

.workflow-task-card__status-chip {
  border-radius: 6px !important;
  block-size: 21px !important;
  font-size: 11.5px !important;
  font-weight: 500;
  letter-spacing: 0;
  padding-inline: 7px !important;
}

.workflow-task-card__status-dot {
  display: inline-block;
  flex-shrink: 0;
  border-radius: 50%;
  background-color: rgb(var(--workflow-status-rgb));
  block-size: 6px;
  inline-size: 6px;
  margin-inline-end: 5px;
}

.workflow-task-card__menu {
  flex: 0 0 26px;
  border-radius: 6px !important;
  block-size: 26px !important;
  inline-size: 26px !important;
  min-inline-size: 26px !important;
  padding: 0 !important;
  color: rgba(var(--workflow-card-header-content-rgb), var(--v-medium-emphasis-opacity)) !important;
}

.workflow-task-card__menu:hover {
  background: rgba(var(--workflow-card-header-content-rgb), 0.06);
  color: rgba(var(--workflow-card-header-content-rgb), var(--v-high-emphasis-opacity)) !important;
}

.workflow-task-card__body {
  display: flex;
  min-inline-size: 0;
  flex: 1 1 auto;
  flex-direction: column;
  justify-content: space-between;
  gap: 11px;
  padding: 12px 15px 13px !important;
}

.workflow-task-card__progress-panel {
  display: flex;
  min-inline-size: 0;
  flex-direction: column;
  gap: 7px;
  padding: 8px 11px;
  border-radius: var(--app-control-radius);
  background: rgba(var(--v-theme-on-surface), 0.03);
  box-shadow: inset 0 0 0 1px rgba(var(--v-theme-on-surface), 0.05);
}

.workflow-task-card__telemetry-row {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.workflow-task-card__progress-summary,
.workflow-task-card__run-stat {
  display: inline-flex;
  min-inline-size: 0;
  align-items: baseline;
  gap: 6px;
}

.workflow-task-card__telemetry-label {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  line-height: 1.25;
}

.workflow-task-card__telemetry-value {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 12.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.25;
}

.workflow-task-card__action-track {
  display: flex;
  min-inline-size: 0;
  gap: 5px;
}

.workflow-task-card__action-segment {
  block-size: 5px;
  min-inline-size: 3px;
  flex: 1 1 0;
  border-radius: var(--app-control-radius);
  background: rgba(var(--v-theme-on-surface), 0.12);
  transition:
    background-color 0.25s ease,
    opacity 0.25s ease;
}

.workflow-task-card__action-segment--complete {
  background: rgb(var(--workflow-status-rgb));
}

.workflow-task-card__action-segment--active {
  background: rgba(var(--workflow-status-rgb), 0.35);
  box-shadow: inset 0 0 0 1px rgb(var(--workflow-status-rgb));
  animation: workflow-segment-pulse 1.5s ease-in-out infinite;
}

.workflow-task-card__action-segment--failed {
  background: rgb(var(--v-theme-error));
}

.workflow-task-card__action-segment--empty {
  background: rgba(var(--v-theme-on-surface), 0.08);
}

@keyframes workflow-segment-pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.45;
  }
}

@media (prefers-reduced-motion: reduce) {
  .workflow-task-card__action-segment--active {
    animation: none;
  }
}

.workflow-task-card__footer {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-block-start: auto;
  padding-block-start: 2px;
}

.workflow-task-card__execution-status {
  display: flex;
  min-inline-size: 0;
  flex: 1 1 auto;
  align-items: center;
  gap: 5px;
  font-size: 0.76rem;
}

.workflow-task-card__execution-status .v-icon {
  flex: 0 0 auto;
}

.workflow-task-card__execution-status span {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-task-card__toolbar {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
}

.workflow-task-card__tool-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 26px;
  block-size: 26px;
  padding: 0;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: var(--app-control-radius);
  background: rgba(var(--v-theme-on-surface), 0.03);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;
}

.workflow-task-card__tool-btn:hover:not(:disabled) {
  border-color: rgba(var(--v-theme-primary), 0.35);
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
}

.workflow-task-card__tool-btn--danger {
  border-color: rgba(var(--v-theme-error), 0.3);
  background: rgba(var(--v-theme-error), 0.1);
  color: rgb(var(--v-theme-error));
}

.workflow-task-card__tool-btn--danger:hover:not(:disabled) {
  border-color: rgba(var(--v-theme-error), 0.5);
  background: rgba(var(--v-theme-error), 0.18);
  color: rgb(var(--v-theme-error));
}

.workflow-task-card__toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  block-size: 26px;
  padding-inline: 8px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: var(--app-control-radius);
  background: rgba(var(--v-theme-on-surface), 0.03);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.74rem;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;
}

.workflow-task-card__toggle-btn:hover:not(:disabled) {
  border-color: rgba(var(--v-theme-on-surface), 0.22);
  background: rgba(var(--v-theme-on-surface), 0.08);
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
}

.workflow-task-card__toggle-btn--enable {
  border-color: rgba(var(--v-theme-success), 0.32);
  background: rgba(var(--v-theme-success), 0.12);
  color: rgb(var(--v-theme-success));
}

.workflow-task-card__toggle-btn--enable:hover:not(:disabled) {
  border-color: rgba(var(--v-theme-success), 0.5);
  background: rgba(var(--v-theme-success), 0.2);
  color: rgb(var(--v-theme-success));
}

.workflow-task-card__tool-btn:disabled,
.workflow-task-card__toggle-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (width <= 599.98px) {
  .workflow-task-card {
    min-block-size: 170px;
  }

  .workflow-task-card__header,
  .workflow-task-card__body {
    padding-inline: 12px !important;
  }
}
</style>
