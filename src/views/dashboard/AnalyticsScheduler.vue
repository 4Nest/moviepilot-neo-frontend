<script setup lang="ts">
import api from '@/api'
import type { ScheduleInfo, TransferQueue } from '@/api/types'
import { useI18n } from '@/composables/useChineseText'
import { useBackground } from '@/composables/useBackground'
import {
  getScheduleName,
  getScheduleNextRunText,
  getScheduleProvider,
  getScheduleStatusText,
  isScheduleRunning,
  useScheduleProgress,
} from '@/composables/useScheduleProgress'
import { getSchedulerVisual } from '@/utils/schedulerVisual'

// 国际化
const { t } = useI18n()
const { useDataRefresh } = useBackground()

// 输入参数
const props = defineProps({
  // 是否允许刷新数据
  allowRefresh: {
    type: Boolean,
    default: true,
  },
})

// 定时服务列表
const schedulerList = ref<ScheduleInfo[]>([])
const transferQueue = ref<TransferQueue[]>([])
const { getScheduleProgressText, getScheduleProgressValue } = useScheduleProgress(
  schedulerList,
  'dashboard-scheduler-progress',
)

interface BackgroundTaskItem {
  color: string
  icon: string
  id: string
  progress?: number
  status: string
  subtitle: string
  title: string
}

const BACKGROUND_TASK_RUNNING_ICON = 'mdi-loading'

// 将正在运行的服务和整理队列排在前面，再补充最近即将执行的定时任务。
const backgroundTasks = computed<BackgroundTaskItem[]>(() => {
  const runningSchedulers = schedulerList.value.filter(isScheduleRunning)
  const waitingSchedulers = schedulerList.value.filter(item => !isScheduleRunning(item))
  const schedulerTasks = [...runningSchedulers, ...waitingSchedulers].map(item => {
    const isRunning = isScheduleRunning(item)
    const visual = getSchedulerVisual(item)

    return {
      id: `schedule-${item.id}`,
      title: getScheduleName(item) || t('dashboard.scheduler'),
      subtitle:
        (isRunning && getScheduleProgressText(item)) || getScheduleProvider(item) || getScheduleNextRunText(item),
      status: isRunning ? t('dashboard.taskRunning') : getScheduleStatusText(item) || t('dashboard.taskWaiting'),
      icon: visual.icon,
      color: visual.color,
      progress: isRunning ? getScheduleProgressValue(item) : undefined,
    }
  })
  const transferTasks = transferQueue.value.map((item, index) => {
    const tasks = item.tasks ?? []
    const completed = tasks.filter(task => task.state === 'completed').length
    const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0
    const isRunning = tasks.some(task => task.state === 'running')

    return {
      id: `transfer-${item.media?.tmdb_id ?? index}-${item.season ?? ''}`,
      title: item.media?.title_year || item.media?.title || t('dashboard.transferQueue'),
      subtitle: t('dashboard.transferProgress', { completed, total: tasks.length }),
      status: isRunning ? t('dashboard.taskRunning') : t('dashboard.taskWaiting'),
      icon: 'mdi-folder-sync-outline',
      color: 'warning',
      progress: isRunning ? progress : undefined,
    }
  })

  return [...transferTasks, ...schedulerTasks]
})

// 调用API加载定时服务列表
async function loadSchedulerList() {
  if (!props.allowRefresh) {
    return
  }
  try {
    const [schedulers, queue] = await Promise.all([api.get('dashboard/schedule'), api.get('transfer/queue')])
    schedulerList.value = schedulers as unknown as ScheduleInfo[]
    transferQueue.value = queue as unknown as TransferQueue[]
  } catch (e) {
    console.log(e)
  }
}

// 使用数据刷新定时器
useDataRefresh(
  'dashboard-scheduler',
  loadSchedulerList,
  10000, // 任务清单每十秒更新，运行中进度继续由独立轮询刷新。
  true, // 立即执行
)
</script>

<template>
  <VCard class="dashboard-work-card dashboard-grid-fill">
    <VCardItem class="dashboard-work-header">
      <VCardTitle>{{ t('dashboard.scheduler') }}</VCardTitle>
      <template v-if="backgroundTasks.length > 0" #append>
        <span class="scheduler-count-badge">{{ backgroundTasks.length }}</span>
      </template>
    </VCardItem>

    <VCardText class="dashboard-work-content">
      <VList v-if="backgroundTasks.length > 0" class="card-list">
        <VListItem v-for="item in backgroundTasks" :key="item.id" class="background-task-item">
          <template #prepend>
            <VAvatar size="34" variant="tonal" :color="item.color" class="background-task-avatar">
              <VIcon :icon="item.icon" size="18" />
            </VAvatar>
          </template>

          <div class="background-task-body">
            <div class="background-task-summary">
              <div class="background-task-copy">
                <VListItemTitle class="background-task-title">
                  {{ item.title }}
                </VListItemTitle>
                <VListItemSubtitle class="background-task-subtitle">
                  {{ item.subtitle }}
                </VListItemSubtitle>
              </div>

              <div class="background-task-state" :class="{ 'is-running': item.progress !== undefined }">
                <i v-if="item.progress === undefined" class="background-task-dot" aria-hidden="true" />
                <VIcon
                  v-else
                  :icon="BACKGROUND_TASK_RUNNING_ICON"
                  color="primary"
                  class="background-task-running-icon"
                  size="13"
                />
                <span class="background-task-status">{{ item.status }}</span>
              </div>
            </div>

            <VProgressLinear
              v-if="item.progress !== undefined"
              :model-value="item.progress"
              :color="item.color"
              height="3"
              rounded
              class="background-task-progress"
            />
          </div>
        </VListItem>
      </VList>
      <div v-if="backgroundTasks.length === 0" class="scheduler-empty text-medium-emphasis">
        <VIcon icon="mdi-clock-check-outline" size="28" />
        <span>{{ t('dashboard.noSchedulers') }}</span>
      </div>
    </VCardText>
  </VCard>
</template>

<style lang="scss" scoped>
.dashboard-work-card {
  display: flex;
  flex-direction: column;
  block-size: 100%;
  max-block-size: 350px;
  min-block-size: 350px;
}

.dashboard-work-header {
  padding: 14px 16px 6px;
}

.scheduler-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 6px;
  background-color: var(--mp-item-bg);
  block-size: 21px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  min-inline-size: 24px;
  padding-inline: 7px;
}

.card-list {
  --v-card-list-gap: 4px;

  overflow: hidden auto;
  flex: 1 1 auto;
  background: transparent !important;
  min-block-size: 0;
  overscroll-behavior: contain;
  padding-block: 0;
  scrollbar-width: none;
}

.scheduler-empty {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
}

.background-task-item {
  min-block-size: 46px;
  border-radius: 8px;
  padding-block: 5px !important;
  padding-inline: 2px !important;
}

.background-task-item + .background-task-item {
  border-block-start: 1px solid var(--mp-border-subtle);
  border-radius: 0;
}

.background-task-avatar {
  flex-shrink: 0;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 8px !important;
  margin-inline-end: 10px;
}

.background-task-body,
.background-task-copy {
  min-inline-size: 0;
}

.background-task-body {
  inline-size: 100%;
}

.background-task-summary {
  display: grid;
  align-items: center;
  gap: 10px;
  grid-template-columns: minmax(0, 1fr) auto;
}

.background-task-state {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 6px;
  background-color: var(--mp-item-bg);
  block-size: 21px;
  gap: 5px;
  padding-inline: 7px;
}

.background-task-state.is-running {
  border-color: rgba(var(--v-theme-primary), 0.28);
  background-color: rgba(var(--v-theme-primary), 0.1);
}

.background-task-dot {
  flex-shrink: 0;
  border-radius: 50%;
  background-color: rgba(var(--v-theme-on-surface), 0.36);
  block-size: 6px;
  inline-size: 6px;
}

.background-task-title {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
}

.background-task-subtitle {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11.5px;
  line-height: 1.3;
  margin-block-start: 2px;
}

.background-task-status {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
}

.background-task-state.is-running .background-task-status {
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}

.background-task-progress {
  margin-block-start: 6px;
}

.background-task-running-icon {
  animation: background-task-rotate 1s linear infinite;
}

.dashboard-work-content {
  display: flex;
  overflow: hidden;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
  padding: 2px 16px 12px;
}

@supports not (scrollbar-width: none) {
  .card-list::-webkit-scrollbar {
    display: none;
  }
}

@keyframes background-task-rotate {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

@media (width <= 600px) {
  .dashboard-work-card {
    max-block-size: 320px;
    min-block-size: 0;
  }

  .dashboard-work-header {
    padding: 12px 14px 6px;
  }

  .dashboard-work-content {
    padding: 2px 14px 12px;
  }

  .background-task-avatar {
    block-size: 30px !important;
    inline-size: 30px !important;
    margin-inline-end: 8px;
  }

  .background-task-summary {
    gap: 8px;
  }

  .background-task-title {
    font-size: 12.5px;
  }

  .background-task-subtitle,
  .background-task-status {
    font-size: 11px;
  }
}
</style>
