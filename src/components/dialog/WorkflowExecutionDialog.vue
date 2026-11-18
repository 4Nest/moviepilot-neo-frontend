<script setup lang="ts">
import { useDisplay } from 'vuetify'
import { useToast } from 'vue-toastification'
import api from '@/api'
import type { Workflow, WorkflowExecutionDetail, WorkflowExecutionNodeDetail } from '@/api/types'
import { actionStepDict } from '@/api/constants'
import { useI18n } from '@/composables/useChineseText'
import { formatDateDifference } from '@/@core/utils/formatters'

const props = defineProps({
  workflow: {
    type: Object as PropType<Workflow>,
    required: true,
  },
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'open-flow', workflow: Workflow): void
  (e: 'refresh'): void
}>()

const { t } = useI18n()
const display = useDisplay()
const $toast = useToast()

const loading = ref(false)
const running = ref(false)
const detail = ref<WorkflowExecutionDetail | null>(null)
const showHistory = ref(false)

const actionIconMap: Record<string, string> = {
  AddDownloadAction: 'mdi-download',
  AddSubscribeAction: 'mdi-star-plus',
  FetchDownloadsAction: 'mdi-progress-download',
  FetchMediasAction: 'mdi-movie-search',
  FetchRssAction: 'mdi-rss',
  FetchTorrentsAction: 'mdi-search-web',
  FilterMediasAction: 'mdi-filter-check',
  FilterTorrentsAction: 'mdi-filter-multiple',
  InvokePluginAction: 'mdi-run',
  NoteAction: 'mdi-note-text',
  ScanFileAction: 'mdi-folder-search',
  ScrapeFileAction: 'mdi-file-find',
  SendEventAction: 'mdi-send-check',
  SendMessageAction: 'mdi-message-arrow-right',
  TransferFileAction: 'mdi-file-move',
}

async function fetchExecutionDetail() {
  if (!props.workflow?.id) return
  loading.value = true
  try {
    const res: { success: boolean; message?: string; data?: WorkflowExecutionDetail } = await api.get(
      `workflow/${props.workflow.id}/execution`,
    )
    if (res.success && res.data) {
      detail.value = res.data
    } else if (typeof res === 'object' && res !== null && 'nodes' in res) {
      detail.value = res as unknown as WorkflowExecutionDetail
    } else {
      $toast.error(res.message || t('dialog.workflowExecution.loadFailed'))
    }
  } catch (error) {
    console.error(error)
    $toast.error(t('dialog.workflowExecution.loadFailed'))
  } finally {
    loading.value = false
  }
}

async function handleRerun() {
  if (!props.workflow?.id || running.value) return
  running.value = true
  try {
    const res: { success: boolean; message?: string } = await api.post(
      `workflow/${props.workflow.id}/run?from_begin=true`,
      { from_begin: true },
    )
    if (res.success) {
      $toast.success(t('workflow.task.runSuccess'))
      emit('refresh')
      await fetchExecutionDetail()
    } else {
      $toast.error(t('workflow.task.runFailed', { message: res.message }))
      emit('refresh')
      await fetchExecutionDetail()
    }
  } catch (error) {
    console.error(error)
  } finally {
    running.value = false
  }
}

function resolveWorkflowStatus(state?: string) {
  const variants: Record<string, { color: string; icon: string; text: string }> = {
    S: { color: 'success', icon: 'mdi-check-circle-outline', text: t('workflow.task.status.success') },
    R: { color: 'primary', icon: 'mdi-progress-clock', text: t('workflow.task.status.running') },
    F: { color: 'error', icon: 'mdi-alert-circle-outline', text: t('workflow.task.status.failed') },
    P: { color: 'secondary', icon: 'mdi-pause-circle-outline', text: t('workflow.task.status.paused') },
    W: { color: 'warning', icon: 'mdi-clock-outline', text: t('workflow.task.status.waiting') },
  }
  return variants[state || 'W'] || variants.W
}

function resolveNodeStatus(state?: string) {
  const normalized = state || 'pending'
  const map: Record<string, { color: string; icon: string; labelKey: string }> = {
    success: {
      color: 'success',
      icon: 'mdi-check-circle-outline',
      labelKey: 'dialog.workflowExecution.nodeStatus.success',
    },
    completed: {
      color: 'success',
      icon: 'mdi-check-circle-outline',
      labelKey: 'dialog.workflowExecution.nodeStatus.completed',
    },
    failed: {
      color: 'error',
      icon: 'mdi-alert-circle-outline',
      labelKey: 'dialog.workflowExecution.nodeStatus.failed',
    },
    skipped: {
      color: 'secondary',
      icon: 'mdi-debug-step-over',
      labelKey: 'dialog.workflowExecution.nodeStatus.skipped',
    },
    running: { color: 'primary', icon: 'mdi-loading', labelKey: 'dialog.workflowExecution.nodeStatus.running' },
    queued: { color: 'info', icon: 'mdi-timer-sand', labelKey: 'dialog.workflowExecution.nodeStatus.queued' },
    pending: { color: 'default', icon: 'mdi-clock-outline', labelKey: 'dialog.workflowExecution.nodeStatus.pending' },
  }
  const matched = map[normalized] || map.pending
  return {
    color: matched.color,
    icon: matched.icon,
    text: t(matched.labelKey),
  }
}

function formatDuration(durationMs?: number | null) {
  if (durationMs === undefined || durationMs === null || !Number.isFinite(durationMs) || durationMs < 0) {
    return ''
  }
  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`
  }
  const seconds = durationMs / 1000
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`
  }
  const minutes = Math.floor(seconds / 60)
  const remainSec = Math.round(seconds % 60)
  return `${minutes}m ${remainSec}s`
}

function getOutputChips(summary?: Record<string, number>) {
  if (!summary || typeof summary !== 'object') return []
  const supportedKeys = ['torrents', 'medias', 'downloads', 'fileitems', 'subscribes', 'sites'] as const
  const chips: Array<{ key: string; label: string }> = []
  supportedKeys.forEach(key => {
    const count = Number(summary[key])
    if (Number.isFinite(count) && count > 0) {
      chips.push({
        key,
        label: t(`dialog.workflowExecution.outputs.${key}`, { count }),
      })
    }
  })
  Object.entries(summary).forEach(([key, rawVal]) => {
    if ((supportedKeys as readonly string[]).includes(key)) return
    const count = Number(rawVal)
    if (Number.isFinite(count) && count > 0) {
      chips.push({ key, label: `${key} ${count}` })
    }
  })
  return chips
}

function getNodeDisplayName(node: WorkflowExecutionNodeDetail) {
  if (node.name) {
    return actionStepDict[node.name] || node.name
  }
  return node.type?.replace(/Action$/, '') || node.id
}

function getNodeIcon(type?: string) {
  return (type && actionIconMap[type]) || 'mdi-puzzle-outline'
}

const currentStatus = computed(() => resolveWorkflowStatus(detail.value?.state ?? props.workflow.state))
const displayLastTime = computed(() => {
  const rawTime = detail.value?.last_time ?? props.workflow.last_time
  return rawTime ? formatDateDifference(rawTime) : t('dialog.workflowExecution.neverExecuted')
})
const displayProgress = computed(() => {
  const val = Number(detail.value?.progress ?? 0)
  return Number.isFinite(val) ? Math.min(Math.max(Math.round(val), 0), 100) : 0
})

onMounted(() => {
  fetchExecutionDetail()
})
</script>

<template>
  <VDialog scrollable max-width="50rem" :fullscreen="!display.mdAndUp.value">
    <VCard class="workflow-execution-dialog mp-dialog-card">
      <VCardItem class="mp-dialog-header">
        <template #prepend>
          <VAvatar :color="currentStatus.color" variant="tonal" rounded="lg" size="32" class="me-2">
            <VIcon icon="mdi-timeline-text-outline" size="18" />
          </VAvatar>
        </template>
        <VCardTitle> {{ t('dialog.workflowExecution.title') }} · {{ detail?.name || workflow.name }} </VCardTitle>
        <template #append>
          <IconBtn
            :loading="loading"
            size="small"
            :aria-label="t('dialog.workflowExecution.refresh')"
            @click="fetchExecutionDetail"
          >
            <VIcon icon="mdi-refresh" size="18" />
          </IconBtn>
        </template>
      </VCardItem>
      <VDialogCloseBtn @click="emit('close')" />
      <VDivider />

      <VCardText class="pa-4">
        <div v-if="loading && !detail" class="workflow-execution-loading py-10 text-center">
          <VProgressCircular indeterminate color="primary" size="36" />
          <div class="text-body-2 text-medium-emphasis mt-3">
            {{ t('dialog.workflowExecution.loading') }}
          </div>
        </div>

        <template v-else>
          <!-- 顶部概览指标栏 -->
          <div class="workflow-execution-summary">
            <div class="workflow-execution-stat">
              <span class="workflow-execution-stat__label">{{ t('workflow.task.info.status') }}</span>
              <div>
                <VChip :color="currentStatus.color" :prepend-icon="currentStatus.icon" size="small" variant="tonal">
                  {{ currentStatus.text }}
                </VChip>
              </div>
            </div>

            <div class="workflow-execution-stat">
              <span class="workflow-execution-stat__label">{{ t('dialog.workflowExecution.runCount') }}</span>
              <strong class="workflow-execution-stat__value">{{ detail?.run_count ?? workflow.run_count ?? 0 }}</strong>
            </div>

            <div class="workflow-execution-stat">
              <span class="workflow-execution-stat__label">{{ t('dialog.workflowExecution.lastTime') }}</span>
              <strong class="workflow-execution-stat__value" :title="detail?.last_time || workflow.last_time">
                {{ displayLastTime }}
              </strong>
            </div>

            <div class="workflow-execution-stat">
              <span class="workflow-execution-stat__label">{{ t('dialog.workflowExecution.overallProgress') }}</span>
              <div class="workflow-execution-progress">
                <VProgressLinear :model-value="displayProgress" :color="currentStatus.color" height="6" rounded />
                <strong>{{ displayProgress }}%</strong>
              </div>
            </div>
          </div>

          <!-- 失败摘要告警 -->
          <VAlert
            v-if="(detail?.state || workflow.state) === 'F' && (detail?.result || workflow.result)"
            type="error"
            variant="tonal"
            density="compact"
            icon="mdi-alert-circle-outline"
            class="mt-3"
          >
            <strong>{{ t('dialog.workflowExecution.failureSummary') }}：</strong>
            {{ detail?.result || workflow.result }}
          </VAlert>

          <!-- 节点执行明细 -->
          <div class="workflow-execution-section mt-4">
            <div class="workflow-execution-section__title">
              <VIcon icon="mdi-sitemap-outline" size="18" />
              <span>{{ t('dialog.workflowExecution.nodesTitle') }}</span>
            </div>

            <div v-if="detail?.nodes?.length" class="workflow-execution-nodes">
              <div v-for="node in detail.nodes" :key="node.id" class="workflow-execution-node">
                <div class="workflow-execution-node__main">
                  <div class="workflow-execution-node__identity">
                    <VAvatar :color="resolveNodeStatus(node.state).color" variant="tonal" rounded="md" size="32">
                      <VIcon :icon="getNodeIcon(node.type)" size="17" />
                    </VAvatar>
                    <div class="workflow-execution-node__titles">
                      <span class="workflow-execution-node__name">{{ getNodeDisplayName(node) }}</span>
                      <span v-if="node.started_at" class="workflow-execution-node__time">{{ node.started_at }}</span>
                    </div>
                  </div>

                  <div class="workflow-execution-node__badges">
                    <span v-if="formatDuration(node.duration_ms)" class="workflow-execution-node__duration">
                      <VIcon icon="mdi-timer-outline" size="13" />
                      {{ formatDuration(node.duration_ms) }}
                    </span>
                    <VChip v-if="(node.attempt || 0) > 1" color="warning" size="x-small" variant="tonal">
                      {{ t('dialog.workflowExecution.retryBadge', { count: node.attempt }) }}
                    </VChip>
                    <VChip
                      :color="resolveNodeStatus(node.state).color"
                      :prepend-icon="resolveNodeStatus(node.state).icon"
                      size="small"
                      variant="tonal"
                    >
                      {{ resolveNodeStatus(node.state).text }}
                    </VChip>
                  </div>
                </div>

                <!-- 节点产物统计与消息 -->
                <div
                  v-if="getOutputChips(node.outputs_summary).length > 0 || node.error || node.message"
                  class="workflow-execution-node__extra"
                >
                  <div v-if="getOutputChips(node.outputs_summary).length > 0" class="workflow-execution-node__outputs">
                    <VChip
                      v-for="chip in getOutputChips(node.outputs_summary)"
                      :key="chip.key"
                      color="primary"
                      size="x-small"
                      variant="outlined"
                    >
                      {{ chip.label }}
                    </VChip>
                  </div>
                  <div
                    v-if="node.error || node.message"
                    class="workflow-execution-node__message"
                    :class="node.error || node.state === 'failed' ? 'text-error' : 'text-medium-emphasis'"
                  >
                    {{ node.error || node.message }}
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="workflow-execution-empty text-body-2 text-medium-emphasis py-6 text-center">
              {{ t('dialog.workflowExecution.noNodes') }}
            </div>
          </div>

          <!-- 可展开的历史步骤记录 -->
          <div v-if="detail?.execute_history?.length" class="workflow-execution-history mt-4">
            <VBtn
              variant="text"
              size="small"
              color="primary"
              class="px-1"
              :prepend-icon="showHistory ? 'mdi-chevron-up' : 'mdi-chevron-down'"
              @click="showHistory = !showHistory"
            >
              {{ t('dialog.workflowExecution.historyTitle', { count: detail.execute_history.length }) }}
            </VBtn>

            <VExpandTransition>
              <div v-show="showHistory" class="workflow-execution-history__list mt-2">
                <div v-for="(step, idx) in detail.execute_history" :key="idx" class="workflow-execution-history__item">
                  <VIcon
                    :icon="step.result ? 'mdi-check-circle-outline' : 'mdi-close-circle-outline'"
                    :color="step.result ? 'success' : 'error'"
                    size="16"
                  />
                  <span class="workflow-execution-history__action">{{ step.action }}</span>
                  <span v-if="step.message" class="workflow-execution-history__msg text-medium-emphasis">
                    {{ step.message }}
                  </span>
                </div>
              </div>
            </VExpandTransition>
          </div>
        </template>
      </VCardText>

      <VDivider />
      <VCardActions class="app-dialog-actions mp-dialog-footer">
        <VBtn
          color="default"
          variant="outlined"
          size="small"
          prepend-icon="mdi-vector-polyline"
          @click="emit('open-flow', workflow)"
        >
          {{ t('dialog.workflowExecution.openFlow') }}
        </VBtn>
        <VSpacer />
        <VBtn color="default" variant="text" size="small" @click="emit('close')">
          {{ t('dialog.workflowExecution.close') }}
        </VBtn>
        <VBtn
          color="primary"
          variant="flat"
          size="small"
          class="px-4"
          :loading="running"
          prepend-icon="mdi-replay"
          @click="handleRerun"
        >
          {{ t('dialog.workflowExecution.rerun') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped lang="scss">
.mp-dialog-header {
  padding-block: 14px;
  padding-inline: 22px 48px;
}

.mp-dialog-footer {
  gap: 8px;
  padding: 10px 20px !important;
}

.workflow-execution-summary {
  display: grid;
  padding: 12px 14px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: var(--app-control-radius);
  background: rgba(var(--v-theme-on-surface), 0.03);
  gap: 12px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.workflow-execution-stat {
  display: flex;
  min-inline-size: 0;
  flex-direction: column;
  gap: 4px;
}

.workflow-execution-stat__label {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
}

.workflow-execution-stat__value {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 0.9rem;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-execution-progress {
  display: flex;
  align-items: center;
  gap: 8px;

  strong {
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
  }
}

.workflow-execution-section__title {
  display: flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 0.875rem;
  font-weight: 600;
  gap: 6px;
  margin-block-end: 10px;
}

.workflow-execution-nodes {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workflow-execution-node {
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: var(--app-control-radius);
  background: rgba(var(--v-theme-surface), 0.6);
  gap: 8px;
}

.workflow-execution-node__main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.workflow-execution-node__identity {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  gap: 10px;
}

.workflow-execution-node__titles {
  display: flex;
  min-inline-size: 0;
  flex-direction: column;
}

.workflow-execution-node__name {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 0.875rem;
  font-weight: 600;
}

.workflow-execution-node__time {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.72rem;
}

.workflow-execution-node__badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.workflow-execution-node__duration {
  display: inline-flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  gap: 3px;
}

.workflow-execution-node__extra {
  display: flex;
  flex-direction: column;
  border-block-start: 1px dashed rgba(var(--v-theme-on-surface), 0.08);
  gap: 6px;
  padding-block-start: 6px;
}

.workflow-execution-node__outputs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.workflow-execution-node__message {
  font-size: 0.8rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.workflow-execution-history__list {
  display: flex;
  flex-direction: column;
  padding: 8px 10px;
  border-radius: var(--app-control-radius);
  background: rgba(var(--v-theme-on-surface), 0.03);
  gap: 6px;
}

.workflow-execution-history__item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  font-size: 0.8rem;
  gap: 8px;
}

.workflow-execution-history__action {
  font-weight: 500;
}

@media (width <= 600px) {
  .workflow-execution-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
