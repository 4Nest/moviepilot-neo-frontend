<script setup lang="ts">
import api from '@/api'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import type { WorkflowShare } from '@/api/types'
import WorkflowSummaryPreview from '@/components/workflow/WorkflowSummaryPreview.vue'
import { useConfirm } from '@/composables/useConfirm'
import { useToast } from 'vue-toastification'
import { useI18n } from '@/composables/useChineseText'
import { useGlobalSettingsStore, useUserStore } from '@/stores'
import { canDeleteWorkflowShare } from '@/utils/sharePermissions'

interface WorkflowActionResponse {
  success?: boolean
  message?: string
  data?: {
    id?: number | string
  } | null
}

// 国际化
const { t } = useI18n()

// 输入参数
const props = defineProps({
  workflow: Object as PropType<WorkflowShare>,
  eventTypes: {
    type: Array as PropType<Array<{ title: string; value: string }>>,
    default: () => [],
  },
})

// 定义事件
const emit = defineEmits(['fork', 'delete', 'close'])

// 全局设置与当前用户
const globalSettingsStore = useGlobalSettingsStore()
const userStore = useUserStore()
const createConfirm = useConfirm()

// 提示框
const $toast = useToast()

// 处理中
const processing = ref(false)

// 删除中
const deleting = ref(false)

// 仅对超级管理员且具备分享所有权或中心端管理权限的用户展示删除按钮（对齐后端 get_current_admin_async）
const canDeleteShare = computed(() =>
  canDeleteWorkflowShare(props.workflow, {
    superUser: userStore.superUser,
    userUniqueId: globalSettingsStore.globalSettings.USER_UNIQUE_ID,
    canManageAll: Boolean(globalSettingsStore.globalSettings.WORKFLOW_SHARE_MANAGE),
  }),
)

// 根据事件类型值获取显示文本
const getEventTypeText = (eventTypeValue: string) => {
  const eventType = props.eventTypes.find(item => item.value === eventTypeValue)
  return eventType ? eventType.title : eventTypeValue
}

// 解析工作流数据
const parsedWorkflow = computed(() => {
  if (!props.workflow) return null

  try {
    const workflow = { ...props.workflow }

    // 解析actions
    if (typeof workflow.actions === 'string') {
      workflow.actions = JSON.parse(workflow.actions)
    }

    // 解析flows
    if (typeof workflow.flows === 'string') {
      workflow.flows = JSON.parse(workflow.flows)
    }

    return workflow
  } catch (error) {
    console.error('解析工作流数据失败:', error)
    return props.workflow
  }
})

const previewActions = computed(() =>
  Array.isArray(parsedWorkflow.value?.actions) ? parsedWorkflow.value.actions : [],
)
const previewFlows = computed(() => (Array.isArray(parsedWorkflow.value?.flows) ? parsedWorkflow.value.flows : []))

// 复用工作流
async function doFork() {
  if (processing.value) return
  // 开始处理
  startNProgress()
  try {
    processing.value = true
    // 请求API
    const result: WorkflowActionResponse = await api.post('workflow/fork', props.workflow)
    // 工作流状态
    if (result.success) {
      $toast.success(t('workflow.addSuccess', { name: props.workflow?.share_title }))
      // 完成
      emit('fork', result.data?.id)
    } else {
      $toast.error(t('workflow.addFailed', { name: props.workflow?.share_title, message: result.message }))
    }
  } catch (error) {
    console.error(error)
    $toast.error(
      t('workflow.addFailed', {
        name: props.workflow?.share_title,
        message: error instanceof Error ? error.message : t('subscribe.requestFailed'),
      }),
    )
  } finally {
    processing.value = false
    doneNProgress()
  }
}

// 删除工作流分享
async function doDelete() {
  if (!props.workflow?.id || !canDeleteShare.value) return

  const isConfirmed = await createConfirm({
    title: t('common.confirm'),
    content: t('workflow.confirmCancelShare', {
      name: props.workflow?.share_title || props.workflow?.name || '',
    }),
  })
  if (!isConfirmed) return

  // 开始处理
  startNProgress()
  try {
    deleting.value = true
    // 携带被删记录自身的 share_uid 请求 API
    const result: WorkflowActionResponse = await api.delete(`workflow/share/${props.workflow.id}`, {
      params: {
        share_uid: props.workflow.share_uid || globalSettingsStore.globalSettings.USER_UNIQUE_ID,
      },
    })
    // 工作流状态
    if (result.success) {
      $toast.success(t('workflow.cancelSuccess'))
      // 完成
      emit('delete')
    } else {
      $toast.error(t('workflow.cancelFailed', { message: result.message || t('subscribe.requestFailed') }))
    }
  } catch (error) {
    console.error(error)
    $toast.error(t('workflow.cancelFailed', { message: t('subscribe.requestFailed') }))
  } finally {
    deleting.value = false
    doneNProgress()
  }
}
</script>
<template>
  <VDialog max-width="38rem" scrollable>
    <VCard class="mp-dialog-card">
      <VCardText class="workflow-share-body">
        <div class="workflow-share-layout">
          <div class="workflow-share-preview">
            <WorkflowSummaryPreview :actions="previewActions" :flows="previewFlows" />
          </div>

          <!-- 右侧内容 -->
          <div class="workflow-share-detail">
            <h2 class="workflow-share-detail__title">
              {{ props.workflow?.share_title }}
            </h2>
            <p v-if="props.workflow?.share_comment" class="workflow-share-detail__description">
              {{ props.workflow?.share_comment }}
            </p>
            <dl class="workflow-share-detail__metadata">
              <div class="workflow-share-detail__metadata-row">
                <dt>{{ t('workflow.sharer') }}：</dt>
                <dd>{{ props.workflow?.share_user }}</dd>
              </div>
              <div
                v-if="props.workflow?.trigger_type || props.workflow?.timer"
                class="workflow-share-detail__metadata-row"
              >
                <dt>{{ t('workflow.trigger') }}：</dt>
                <dd>
                  <span v-if="props.workflow?.trigger_type === 'timer' || !props.workflow?.trigger_type">
                    <VIcon icon="mdi-clock-outline" size="15" class="me-1" />
                    {{ props.workflow?.timer }}
                  </span>
                  <span v-else-if="props.workflow?.trigger_type === 'event'">
                    <VIcon icon="mdi-calendar-check" size="15" class="me-1" />
                    {{ getEventTypeText(props.workflow?.event_type || '') }}
                  </span>
                  <span v-else-if="props.workflow?.trigger_type === 'manual'">
                    <VIcon icon="mdi-hand-pointing-up" size="15" class="me-1" />
                    {{ t('workflow.manualTrigger') }}
                  </span>
                </dd>
              </div>
              <div v-if="parsedWorkflow?.actions" class="workflow-share-detail__metadata-row">
                <dt>{{ t('workflow.actionCount') }}：</dt>
                <dd>{{ parsedWorkflow?.actions?.length }}</dd>
              </div>
            </dl>
            <div class="workflow-share-detail__actions">
              <div class="workflow-share-detail__buttons">
                <VBtn
                  color="primary"
                  variant="flat"
                  size="small"
                  :disabled="processing"
                  @click="doFork"
                  prepend-icon="mdi-heart"
                  :loading="processing"
                  class="workflow-share-detail__button px-4"
                >
                  {{ t('workflow.normalFork') }}
                </VBtn>
                <VBtn
                  v-if="canDeleteShare"
                  color="error"
                  variant="tonal"
                  size="small"
                  :disabled="deleting"
                  @click="doDelete"
                  prepend-icon="mdi-delete"
                  :loading="deleting"
                  class="workflow-share-detail__button px-4"
                >
                  {{ t('workflow.cancelShare') }}
                </VBtn>
              </div>
              <div class="workflow-share-detail__usage" v-if="props.workflow?.count">
                <VIcon icon="mdi-fire" size="15" />
                <span>{{ t('workflow.usageCount', { count: props.workflow?.count?.toLocaleString() }) }}</span>
              </div>
            </div>
          </div>
        </div>
      </VCardText>
      <VDialogCloseBtn @click="emit('close')" />
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped>
.workflow-share-body {
  padding: 1.25rem !important;
}

.workflow-share-layout {
  display: grid;
  grid-template-columns: 12.5rem minmax(0, 1fr);
  align-items: start;
  gap: 1.25rem;
}

.workflow-share-preview {
  min-inline-size: 0;
}

.workflow-share-detail {
  display: flex;
  flex-direction: column;
  min-inline-size: 0;
}

.workflow-share-detail__title {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.3;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow-wrap: anywhere;
  padding-inline-end: 2.25rem;
}

.workflow-share-detail__description {
  display: -webkit-box;
  overflow: hidden;
  margin: 0.4rem 0 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.84rem;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow-wrap: anywhere;
}

.workflow-share-detail__metadata {
  display: grid;
  gap: 0.45rem;
  margin: 0.875rem 0 0;
}

.workflow-share-detail__metadata-row {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  min-inline-size: 0;
}

.workflow-share-detail__metadata dt {
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
}

.workflow-share-detail__metadata dd {
  min-inline-size: 0;
  margin: 0;
  font-size: 0.84rem;
  font-weight: 500;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.workflow-share-detail__actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
  margin-block-start: 1rem;
}

.workflow-share-detail__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  inline-size: 100%;
}

.workflow-share-detail__usage {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  line-height: 1.4;
}

@media (width < 360px) {
  .workflow-share-detail__buttons {
    flex-direction: column;
  }

  .workflow-share-detail__button {
    inline-size: 100%;
  }
}

@media screen and (width <= 600px) {
  .workflow-share-layout {
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
    padding-block-start: 2rem;
  }

  .workflow-share-detail__title {
    padding-inline-end: 0;
  }
}
</style>
