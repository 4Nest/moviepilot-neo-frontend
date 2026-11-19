<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api from '@/api'
import type { ScheduleInfo, SchedulerHistory } from '@/api/types'
import { useI18n } from '@/composables/useChineseText'
import { useBackground } from '@/composables/useBackground'
import {
  getScheduleName,
  getScheduleNextRunText,
  getScheduleProvider,
  getScheduleStatusText,
  isScheduleRunning,
  isScheduleWaiting,
  useScheduleProgress,
} from '@/composables/useScheduleProgress'
import { getSchedulerVisual } from '@/utils/schedulerVisual'

// 国际化
const { t } = useI18n()
const { useDataRefresh } = useBackground()

// 提示框
const $toast = useToast()

// 定时服务列表
const schedulerList = ref<ScheduleInfo[]>([])
const failedHistory = ref<SchedulerHistory[]>([])
const runningIds = reactive(new Set<string>())
let refreshTimerId: ReturnType<typeof setTimeout> | null = null
const { getScheduleProgressText, getScheduleProgressValue } = useScheduleProgress(
  schedulerList,
  'scheduler-service-progress',
)

/** 调用 API 加载定时服务列表。 */
async function loadSchedulerList() {
  try {
    const res: ScheduleInfo[] = await api.get('dashboard/schedule')

    schedulerList.value = Array.isArray(res) ? res : []
  } catch (e) {
    console.log(e)
  }
}

async function loadFailedHistory() {
  try {
    const res: SchedulerHistory[] = await api.get('dashboard/schedule/history', {
      params: { failed_only: true, limit: 20 },
    })
    failedHistory.value = Array.isArray(res) ? res : []
  } catch (e) {
    console.log(e)
  }
}

function openMainLog() {
  window.open(`${import.meta.env.VITE_API_BASE_URL}system/logging?length=-1`, '_blank', 'noopener,noreferrer')
}

/** 根据任务状态返回桌面端状态标签颜色。 */
function getSchedulerColor(scheduler: ScheduleInfo) {
  if (isScheduleRunning(scheduler)) return 'success'
  if (isScheduleWaiting(scheduler)) return ''
  return ''
}

/** 根据任务状态返回移动端状态胶囊的语义样式。 */
function getSchedulerStatusVariant(scheduler: ScheduleInfo) {
  if (isScheduleRunning(scheduler)) return 'running'
  if (isScheduleWaiting(scheduler)) return 'waiting'
  return 'default'
}

/** 获取界面上应展示的任务状态文案，优先保证运行态语义正确。 */
function getDisplayedSchedulerStatusText(scheduler: ScheduleInfo) {
  if (isScheduleRunning(scheduler)) return t('setting.scheduler.running')
  if (isScheduleWaiting(scheduler)) return t('setting.scheduler.waiting')
  return getScheduleStatusText(scheduler)
}

/** 将后端返回的紧凑时间差转换为更适合移动端展示的文本。 */
function formatMobileNextRunTime(nextRun?: string) {
  return nextRun?.trim() || ''
}

/** 获取移动端状态胶囊文案；等待状态展示为下次运行倒计时。 */
function getMobileSchedulerStatusText(scheduler: ScheduleInfo) {
  if (isScheduleWaiting(scheduler)) {
    const readableNextRun = formatMobileNextRunTime(getScheduleNextRunText(scheduler))

    return readableNextRun
      ? t('setting.scheduler.mobileWaitingAfter', { time: readableNextRun })
      : t('setting.scheduler.mobileNoNextRun')
  }

  return getDisplayedSchedulerStatusText(scheduler)
}

/** 执行指定定时服务，并在短延迟后刷新列表。 */
async function runCommand(id: string) {
  if (!id || runningIds.has(id)) return
  runningIds.add(id)
  try {
    const res: { success?: boolean; message?: string } = await api.get('system/runscheduler', { params: { jobid: id } })
    if (!res?.success) {
      $toast.error(res?.message || t('common.error'))
      return
    }
    $toast.success(t('setting.scheduler.executeSuccess'))
    if (refreshTimerId) clearTimeout(refreshTimerId)
    refreshTimerId = setTimeout(() => {
      refreshTimerId = null
      loadSchedulerList()
      loadFailedHistory()
    }, 1000)
  } catch (e) {
    console.error(e)
    $toast.error(e instanceof Error ? e.message : t('common.error'))
  } finally {
    runningIds.delete(id)
  }
}

onBeforeUnmount(() => {
  if (refreshTimerId) {
    clearTimeout(refreshTimerId)
    refreshTimerId = null
  }
})

// 移动端任务卡片展示模型。
const mobileSchedulerCards = computed(() =>
  schedulerList.value.map(scheduler => {
    const isRunning = isScheduleRunning(scheduler)

    return {
      isRunning,
      progressText: isRunning ? getScheduleProgressText(scheduler) : '',
      progressValue: isRunning ? getScheduleProgressValue(scheduler) : 0,
      scheduler,
      statusText: getMobileSchedulerStatusText(scheduler),
      statusVariant: getSchedulerStatusVariant(scheduler),
      visual: getSchedulerVisual(scheduler),
    }
  }),
)

// 使用数据刷新定时器
const { loading: schedulerLoading } = useDataRefresh(
  'scheduler-list',
  loadSchedulerList,
  3000, // 3秒间隔，及时发现任务启停；运行中进度由独立轮询每秒刷新
  true, // 立即执行
)

useDataRefresh('scheduler-failed-history', loadFailedHistory, 10000, true)
</script>

<template>
  <VCard class="service-desktop-card d-none d-md-block">
    <VTable v-if="schedulerList.length" class="service-table text-no-wrap">
      <thead>
        <tr>
          <th scope="col">{{ t('setting.scheduler.provider') }}</th>
          <th scope="col">{{ t('setting.scheduler.taskName') }}</th>
          <th scope="col">{{ t('setting.scheduler.taskStatus') }}</th>
          <th scope="col">{{ t('setting.scheduler.nextRunTime') }}</th>
          <th scope="col" class="text-end">{{ t('setting.cache.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="scheduler in schedulerList" :key="scheduler.id">
          <td class="service-provider-cell">
            {{ getScheduleProvider(scheduler) }}
          </td>
          <td class="scheduler-task-cell">
            <div class="service-task-name">{{ getScheduleName(scheduler) }}</div>
            <div v-if="isScheduleRunning(scheduler)" class="scheduler-progress">
              <VProgressLinear :model-value="getScheduleProgressValue(scheduler)" color="primary" height="3" rounded />
              <div class="scheduler-progress-meta">
                <span>{{ getScheduleProgressText(scheduler) || getScheduleStatusText(scheduler) }}</span>
                <strong>{{ Math.round(getScheduleProgressValue(scheduler)) }}%</strong>
              </div>
            </div>
          </td>
          <td>
            <VChip variant="tonal" size="small" class="service-status-chip" :color="getSchedulerColor(scheduler)">
              {{ getDisplayedSchedulerStatusText(scheduler) }}
            </VChip>
          </td>
          <td class="service-next-run">
            {{ getScheduleNextRunText(scheduler) }}
          </td>
          <td class="text-end">
            <VBtn
              icon
              size="small"
              variant="text"
              color="primary"
              class="service-icon-trigger"
              :aria-label="t('setting.scheduler.execute')"
              :loading="runningIds.has(scheduler.id)"
              :disabled="isScheduleRunning(scheduler) || runningIds.has(scheduler.id)"
              @click="runCommand(scheduler.id)"
            >
              <VIcon icon="mdi-play" size="16" />
              <VTooltip activator="parent" location="top">{{ t('setting.scheduler.execute') }}</VTooltip>
            </VBtn>
          </td>
        </tr>
      </tbody>
    </VTable>

    <div v-else-if="!schedulerLoading" class="desktop-scheduler-empty">
      <VIcon icon="mdi-timer-off-outline" size="36" />
      <p>{{ t('setting.scheduler.noService') }}</p>
    </div>

    <div v-else class="desktop-scheduler-empty">
      <VProgressCircular indeterminate color="primary" size="20" width="2" />
      <p>{{ t('common.loadingText') }}</p>
    </div>
  </VCard>

  <VCard v-if="failedHistory.length" class="service-desktop-card mt-3 d-none d-md-block">
    <VCardItem class="service-card-header">
      <VCardTitle class="service-card-title">最近失败</VCardTitle>
    </VCardItem>
    <VTable class="service-table text-no-wrap">
      <thead>
        <tr>
          <th scope="col">任务</th>
          <th scope="col">失败时间</th>
          <th scope="col">错误</th>
          <th scope="col" class="text-end">{{ t('setting.cache.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="history in failedHistory" :key="history.id">
          <td class="service-task-name">{{ history.name || history.job_id }}</td>
          <td class="service-next-run">{{ history.finished_at }}</td>
          <td class="scheduler-error-cell" :title="history.error">{{ history.error || '未知错误' }}</td>
          <td class="text-end">
            <div class="service-row-actions">
              <VBtn
                icon
                size="small"
                variant="text"
                color="primary"
                class="service-icon-trigger"
                aria-label="重试"
                :loading="runningIds.has(history.job_id)"
                :disabled="runningIds.has(history.job_id)"
                @click="runCommand(history.job_id)"
              >
                <VIcon icon="mdi-refresh" size="15" />
                <VTooltip activator="parent" location="top">重试</VTooltip>
              </VBtn>
              <VBtn
                icon
                size="small"
                variant="text"
                class="service-icon-trigger"
                aria-label="查看日志"
                @click="openMainLog"
              >
                <VIcon icon="mdi-text-box-search-outline" size="15" />
                <VTooltip activator="parent" location="top">查看日志</VTooltip>
              </VBtn>
            </div>
          </td>
        </tr>
      </tbody>
    </VTable>
  </VCard>

  <div class="mobile-scheduler-view d-md-none">
    <div v-if="mobileSchedulerCards.length" class="mobile-scheduler-list">
      <article
        v-for="{
          scheduler,
          visual,
          statusText,
          statusVariant,
          isRunning,
          progressText,
          progressValue,
        } in mobileSchedulerCards"
        :key="scheduler.id"
        class="mobile-scheduler-card"
        :style="{
          '--scheduler-accent': visual.color,
          '--scheduler-accent-rgb': visual.rgb,
        }"
      >
        <div class="mobile-scheduler-icon">
          <VIcon :icon="visual.icon" size="18" />
        </div>

        <div class="mobile-scheduler-content">
          <h3>{{ getScheduleName(scheduler) }}</h3>
          <div class="mobile-scheduler-meta">
            <p>{{ getScheduleProvider(scheduler) }}</p>
            <span class="mobile-scheduler-status" :class="`mobile-scheduler-status--${statusVariant}`">
              {{ statusText }}
            </span>
          </div>
        </div>

        <div class="mobile-scheduler-actions">
          <VBtn
            icon
            size="small"
            variant="text"
            color="primary"
            class="service-icon-trigger"
            :aria-label="t('setting.scheduler.execute')"
            :loading="runningIds.has(scheduler.id)"
            :disabled="isRunning || runningIds.has(scheduler.id)"
            @click="runCommand(scheduler.id)"
          >
            <VIcon icon="mdi-play" size="16" />
          </VBtn>
        </div>

        <div v-if="isRunning" class="mobile-scheduler-progress">
          <VProgressLinear :model-value="progressValue" color="primary" height="3" rounded />
          <div class="scheduler-progress-meta">
            <span>{{ progressText || getDisplayedSchedulerStatusText(scheduler) }}</span>
            <strong>{{ Math.round(progressValue) }}%</strong>
          </div>
        </div>
      </article>
    </div>

    <div v-else-if="!schedulerLoading" class="mobile-scheduler-empty">
      <VIcon icon="mdi-timer-off-outline" size="34" />
      <p>{{ t('setting.scheduler.noService') }}</p>
    </div>

    <section v-if="failedHistory.length" class="mobile-failure-list">
      <h3 class="mobile-failure-heading">最近失败</h3>
      <article v-for="history in failedHistory" :key="history.id" class="mobile-failure-card">
        <div class="mobile-failure-head">
          <strong>{{ history.name || history.job_id }}</strong>
          <small>{{ history.finished_at }}</small>
        </div>
        <p>{{ history.error || '未知错误' }}</p>
        <div class="d-flex ga-2">
          <VBtn
            size="small"
            variant="tonal"
            :loading="runningIds.has(history.job_id)"
            :disabled="runningIds.has(history.job_id)"
            @click="runCommand(history.job_id)"
          >
            重试
          </VBtn>
          <VBtn size="small" variant="text" @click="openMainLog">查看日志</VBtn>
        </div>
      </article>
    </section>

    <footer v-if="schedulerLoading" class="mobile-scheduler-footer">
      <div class="mobile-scheduler-loading">
        <VProgressCircular indeterminate color="primary" size="16" width="2" />
        <span>{{ t('common.loadingText') }}</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.service-desktop-card {
  overflow: hidden;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
}

.service-card-header {
  padding: 13px 16px 6px;
}

.service-card-title {
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.35;
}

.service-table :deep(thead th) {
  block-size: 36px !important;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px !important;
  font-weight: 600 !important;
  padding-inline: 16px !important;
}

.service-table :deep(tbody td) {
  block-size: 44px !important;
  font-size: 13px !important;
  padding-inline: 16px !important;
}

.service-provider-cell {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12.5px;
}

.service-task-name {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 13px;
  font-weight: 600;
}

.service-status-chip {
  block-size: 21px;
  font-size: 11.5px;
  font-weight: 600;
}

.service-next-run {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
}

.service-row-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
}

.service-icon-trigger {
  border: 1px solid var(--mp-border-subtle);
  border-radius: 7px !important;
  background: var(--mp-item-bg);
  block-size: 28px !important;
  inline-size: 28px !important;
  min-inline-size: 28px !important;
}

.service-icon-trigger:hover:not(:disabled) {
  border-color: rgba(var(--v-theme-primary), 0.36);
  background: rgba(var(--v-theme-primary), 0.1);
}

.desktop-scheduler-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: rgba(var(--v-theme-on-surface), 0.52);
  gap: 10px;
  min-block-size: 220px;
}

.desktop-scheduler-empty p {
  margin: 0;
  font-size: 13px;
}

.scheduler-task-cell {
  min-inline-size: 220px;
}

.scheduler-progress {
  margin-block-start: 6px;
  max-inline-size: 300px;
}

.scheduler-progress-meta {
  display: flex;
  justify-content: space-between;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11.5px;
  gap: 10px;
  margin-block-start: 3px;
}

.scheduler-error-cell {
  max-inline-size: 28rem;
  overflow: hidden;
  color: rgb(var(--v-theme-error));
  font-size: 12px;
  text-overflow: ellipsis;
}

.mobile-failure-list {
  display: grid;
  gap: 10px;
  margin-block-start: 16px;
}

.mobile-failure-heading {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 13.5px;
  font-weight: 600;
}

.mobile-failure-card {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid rgba(var(--v-theme-error), 0.24);
  border-radius: 10px;
  background: rgba(var(--v-theme-error), 0.05);
}

.mobile-failure-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.mobile-failure-head strong {
  font-size: 13px;
  font-weight: 600;
}

.mobile-failure-head small {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}

.mobile-failure-card p {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
  word-break: normal;
}

.scheduler-progress-meta span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scheduler-progress-meta strong {
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
}

.mobile-scheduler-view {
  background: transparent;
  min-block-size: 100%;
  padding-block: 10px calc(18px + env(safe-area-inset-bottom, 0px));
  padding-inline: 14px;
}

.mobile-scheduler-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mobile-scheduler-card {
  display: grid;
  align-items: center;
  padding: 12px 14px;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: rgb(var(--v-theme-surface));
  column-gap: 12px;
  grid-template-columns: 36px minmax(0, 1fr) auto;
}

.mobile-scheduler-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 9px;
  background: rgba(var(--scheduler-accent-rgb), 0.1);
  block-size: 36px;
  color: var(--scheduler-accent);
  inline-size: 36px;
}

.mobile-scheduler-content {
  min-inline-size: 0;
}

.mobile-scheduler-content h3 {
  overflow: hidden;
  margin: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-scheduler-content p {
  overflow: hidden;
  min-inline-size: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  line-height: 1.2;
  margin: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-scheduler-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-block-start: 4px;
  min-inline-size: 0;
}

.mobile-scheduler-actions {
  display: inline-flex;
  align-items: center;
}

.mobile-scheduler-progress {
  grid-column: 2 / -1;
  margin-block-start: 6px;
  min-inline-size: 0;
}

.mobile-scheduler-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 6px;
  background: var(--mp-item-bg);
  block-size: 20px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  line-height: 1;
  padding-inline: 7px;
  white-space: nowrap;
}

.mobile-scheduler-status--running {
  border-color: rgba(var(--v-theme-success), 0.28);
  background: rgba(var(--v-theme-success), 0.12);
  color: rgb(var(--v-theme-success));
}

.mobile-scheduler-status--stopped {
  border-color: rgba(var(--v-theme-error), 0.28);
  background: rgba(var(--v-theme-error), 0.1);
  color: rgb(var(--v-theme-error));
}

.mobile-scheduler-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: rgba(var(--v-theme-on-surface), 0.52);
  gap: 10px;
  min-block-size: 36vh;
}

.mobile-scheduler-empty p {
  margin: 0;
  font-size: 13px;
}

.mobile-scheduler-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 12.5px;
  gap: 6px;
  padding-block: 20px 4px;
}

.mobile-scheduler-loading {
  display: inline-flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 13px;
  font-weight: 600;
  gap: 8px;
}

@media (width <= 600px) {
  .mobile-scheduler-view {
    padding-inline: 12px;
  }

  .mobile-scheduler-list {
    gap: 8px;
  }

  .mobile-scheduler-card {
    padding: 10px 12px;
    column-gap: 10px;
    grid-template-columns: 32px minmax(0, 1fr) auto;
  }

  .mobile-scheduler-icon {
    border-radius: 8px;
    block-size: 32px;
    inline-size: 32px;
  }

  .mobile-failure-card {
    padding: 10px 12px;
  }
}
</style>
