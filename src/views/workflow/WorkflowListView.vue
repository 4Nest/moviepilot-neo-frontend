<script setup lang="ts">
import { useToast } from 'vue-toastification'
import api from '@/api'
import { Workflow } from '@/api/types'
import WorkflowTaskCard from '@/components/cards/WorkflowTaskCard.vue'
import ImportCodeDialog from '@/components/dialog/ImportCodeDialog.vue'
import NoDataFound from '@/components/states/NoDataFound.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { useI18n } from '@/composables/useChineseText'
import { useKeepAliveRefresh } from '@/composables/useKeepAliveRefresh'
import { usePWA } from '@/composables/usePWA'
import { openSharedDialog } from '@/composables/useSharedDialog'

const WorkflowAddEditDialog = defineAsyncComponent(() => import('@/components/dialog/WorkflowAddEditDialog.vue'))
const WorkflowTemplateDialog = defineAsyncComponent(() => import('@/components/dialog/WorkflowTemplateDialog.vue'))

type StatusFilterValue = 'all' | 'running' | 'ready' | 'failed' | 'paused'
type TriggerFilterValue = 'all' | 'timer' | 'event' | 'manual'

// 国际化
const { t } = useI18n()
const $toast = useToast()
const { appMode } = usePWA()

// 是否刷新完成首次加载
const isRefreshed = ref(false)
const isRefreshing = ref(false)
const loadError = ref(false)

// 所有任务
const workflowList = ref<Workflow[]>([])
let fetchSequence = 0

// 筛选与搜索状态
const statusFilter = ref<StatusFilterValue>('all')
const triggerFilter = ref<TriggerFilterValue>('all')
const searchKeyword = ref('')

// 导入 JSON 新建工作流对话框
const importJsonDialog = ref(false)

// 事件类型列表
const eventTypes = ref<Array<{ title: string; value: string }>>([])

const eventTypeTitleMap = computed(() => {
  return eventTypes.value.reduce(
    (acc, item) => {
      acc[item.value] = item.title
      return acc
    },
    {} as Record<string, string>,
  )
})

// 状态数量统计
const statusCounts = computed(() => {
  const counts = {
    all: workflowList.value.length,
    running: 0,
    ready: 0,
    failed: 0,
    paused: 0,
  }
  workflowList.value.forEach(item => {
    const state = item.state || 'W'
    if (state === 'R') counts.running += 1
    else if (state === 'F') counts.failed += 1
    else if (state === 'P') counts.paused += 1
    else counts.ready += 1
  })
  return counts
})

const statusFilterOptions = computed(() => [
  { value: 'all' as const, label: t('workflow.filter.statusAll', { count: statusCounts.value.all }), color: 'primary' },
  {
    value: 'running' as const,
    label: t('workflow.filter.statusRunning', { count: statusCounts.value.running }),
    color: 'primary',
  },
  {
    value: 'ready' as const,
    label: t('workflow.filter.statusReady', { count: statusCounts.value.ready }),
    color: 'success',
  },
  {
    value: 'failed' as const,
    label: t('workflow.filter.statusFailed', { count: statusCounts.value.failed }),
    color: 'error',
  },
  {
    value: 'paused' as const,
    label: t('workflow.filter.statusPaused', { count: statusCounts.value.paused }),
    color: 'secondary',
  },
])

const triggerFilterOptions = computed(() => [
  { value: 'all' as const, title: t('workflow.filter.triggerAll') },
  { value: 'timer' as const, title: t('workflow.filter.triggerTimer') },
  { value: 'event' as const, title: t('workflow.filter.triggerEvent') },
  { value: 'manual' as const, title: t('workflow.filter.triggerManual') },
])

// 前端过滤后的工作流列表
const filteredWorkflowList = computed(() => {
  const keyword = (searchKeyword.value || '').trim().toLowerCase()
  return workflowList.value.filter(item => {
    const state = item.state || 'W'
    if (statusFilter.value === 'running' && state !== 'R') return false
    if (statusFilter.value === 'ready' && state !== 'W' && state !== 'S') return false
    if (statusFilter.value === 'failed' && state !== 'F') return false
    if (statusFilter.value === 'paused' && state !== 'P') return false

    const trigger = item.trigger_type || 'timer'
    if (triggerFilter.value !== 'all' && trigger !== triggerFilter.value) return false

    if (keyword) {
      const eventTitle = item.event_type ? eventTypeTitleMap.value[item.event_type] || '' : ''
      const haystack = [item.name, item.description, item.timer, item.event_type, eventTitle]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(keyword)) return false
    }

    return true
  })
})

function resetFilters() {
  statusFilter.value = 'all'
  triggerFilter.value = 'all'
  searchKeyword.value = ''
}

// 加载事件类型列表
async function loadEventTypes() {
  try {
    eventTypes.value = await api.get('workflow/event_types')
  } catch (error) {
    console.error('Failed to load event types:', error)
  }
}

// 加载数据
async function fetchData() {
  const sequence = ++fetchSequence
  isRefreshing.value = true
  try {
    const workflows: Workflow[] = await api.get('workflow/', { params: { summary: true } })
    if (sequence !== fetchSequence) return
    workflowList.value = workflows
    loadError.value = false
    isRefreshed.value = true
  } catch (error) {
    if (sequence !== fetchSequence) return
    console.error(error)
    if (!isRefreshed.value) {
      loadError.value = true
    }
  } finally {
    if (sequence === fetchSequence) {
      isRefreshing.value = false
    }
  }
}

// 运行态自动轻量轮询（2500ms 静默刷新）
let pollTimer: ReturnType<typeof setInterval> | null = null
const isComponentActive = ref(true)

const hasRunningWorkflow = computed(() => workflowList.value.some(item => item.state === 'R'))

function stopRunningPoll() {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function syncRunningPoll() {
  if (hasRunningWorkflow.value && isComponentActive.value) {
    if (pollTimer === null) {
      pollTimer = setInterval(() => {
        if (!isRefreshing.value) {
          fetchData()
        }
      }, 2500)
    }
  } else {
    stopRunningPoll()
  }
}

watch(hasRunningWorkflow, () => {
  syncRunningPoll()
})

// 新增完成
async function addDone(id?: Workflow['id']) {
  if (id === undefined || id === null || !isRefreshed.value) {
    await fetchData()
    return
  }
  // 已发出的列表请求不能覆盖新增或删除后的本地结果。
  const sequence = ++fetchSequence
  try {
    const workflow: Workflow = await api.get(`workflow/${id}`)
    if (sequence !== fetchSequence) {
      await fetchData()
      return
    }
    if (!workflowList.value.some(item => String(item.id) === String(id))) workflowList.value.push(workflow)
  } catch (error) {
    console.error(error)
    await fetchData()
  }
}

function removeWorkflow(id: Workflow['id']) {
  ++fetchSequence
  workflowList.value = workflowList.value.filter(item => String(item.id) !== String(id))
}

onMounted(() => {
  isComponentActive.value = true
  loadEventTypes()
  fetchData()
})

onActivated(() => {
  isComponentActive.value = true
  syncRunningPoll()
})

onDeactivated(() => {
  isComponentActive.value = false
  stopRunningPoll()
})

onUnmounted(() => {
  isComponentActive.value = false
  stopRunningPoll()
})

useKeepAliveRefresh(fetchData)

function openAddDialog(initialTemplate?: Partial<Workflow>) {
  openSharedDialog(
    WorkflowAddEditDialog,
    initialTemplate ? { initialTemplate } : {},
    {
      save: addDone,
    },
    { closeOn: ['close', 'save'] },
  )
}

function openTemplateDialog() {
  const dialogCtrl = openSharedDialog(
    WorkflowTemplateDialog,
    { eventTypes: eventTypes.value },
    {
      select: (preset: Partial<Workflow>) => {
        dialogCtrl.close()
        openAddDialog(preset)
      },
    },
    { closeOn: ['close'] },
  )
}

function handleImportJsonSave(_dataType: string, codeRef: { value?: string } | string) {
  const rawText = typeof codeRef === 'string' ? codeRef : codeRef?.value || ''
  try {
    const parsed = JSON.parse(rawText)
    if (!parsed || typeof parsed !== 'object' || (!Array.isArray(parsed.actions) && !Array.isArray(parsed.flows))) {
      $toast.error(t('workflow.quickActions.importJsonInvalid'))
      return
    }
    importJsonDialog.value = false
    const preset: Partial<Workflow> = {
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      description: typeof parsed.description === 'string' ? parsed.description : undefined,
      trigger_type: parsed.trigger_type || 'timer',
      timer: parsed.timer,
      event_type: parsed.event_type,
      event_conditions:
        parsed.event_conditions && typeof parsed.event_conditions === 'object' ? parsed.event_conditions : {},
      execution_config:
        parsed.execution_config && typeof parsed.execution_config === 'object' ? parsed.execution_config : {},
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      flows: Array.isArray(parsed.flows) ? parsed.flows : [],
      state: 'P',
    }
    openAddDialog(preset)
  } catch (error) {
    console.error(error)
    $toast.error(t('workflow.quickActions.importJsonInvalid'))
  }
}

function openImportJsonDialog() {
  importJsonDialog.value = true
}

defineExpose({
  openAddDialog,
  openImportJsonDialog,
  openTemplateDialog,
  refresh: fetchData,
})
</script>

<template>
  <div>
    <LoadingBanner v-if="!isRefreshed && !loadError" class="mt-12" />

    <NoDataFound
      v-if="loadError && !isRefreshed"
      error-code="500"
      :error-title="t('common.serverConnectionFailed')"
      :error-description="t('common.troubleshooting')"
    >
      <template #button>
        <VBtn color="primary" variant="tonal" rounded="lg" size="small" @click="fetchData">
          {{ t('common.retry') }}
        </VBtn>
      </template>
    </NoDataFound>

    <!-- 顶部筛选、搜索与快捷动作工具栏 -->
    <div v-if="workflowList.length > 0 && isRefreshed" class="workflow-list-toolbar mb-3">
      <div class="workflow-list-toolbar__filters">
        <div class="workflow-status-pills" role="group">
          <VChip
            v-for="pill in statusFilterOptions"
            :key="pill.value"
            :color="statusFilter === pill.value ? pill.color : undefined"
            :variant="statusFilter === pill.value ? 'flat' : 'tonal'"
            size="small"
            class="workflow-status-pill"
            @click="statusFilter = pill.value"
          >
            {{ pill.label }}
          </VChip>
        </div>

        <div class="workflow-list-toolbar__inputs">
          <VSelect
            v-model="triggerFilter"
            :items="triggerFilterOptions"
            item-title="title"
            item-value="value"
            density="compact"
            variant="outlined"
            hide-details
            class="workflow-trigger-select"
          />
          <VTextField
            v-model="searchKeyword"
            :placeholder="t('workflow.filter.searchPlaceholder')"
            prepend-inner-icon="mdi-magnify"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            class="workflow-search-field"
          />
        </div>
      </div>

      <div class="workflow-list-toolbar__actions">
        <IconBtn
          :loading="isRefreshing"
          size="small"
          class="workflow-refresh-btn"
          :aria-label="t('workflow.quickActions.refresh')"
          @click="fetchData"
        >
          <VIcon icon="mdi-refresh" size="17" />
          <VTooltip activator="parent" location="top">{{ t('workflow.quickActions.refresh') }}</VTooltip>
        </IconBtn>
        <template v-if="!appMode">
          <VBtn size="small" variant="outlined" rounded="lg" prepend-icon="mdi-code-json" @click="openImportJsonDialog">
            {{ t('workflow.quickActions.importJsonCreate') }}
          </VBtn>
          <VBtn size="small" variant="outlined" rounded="lg" prepend-icon="mdi-auto-fix" @click="openTemplateDialog">
            {{ t('workflow.quickActions.createFromTemplate') }}
          </VBtn>
          <VBtn
            size="small"
            variant="flat"
            color="primary"
            rounded="lg"
            prepend-icon="mdi-plus"
            @click="openAddDialog()"
          >
            {{ t('workflow.quickActions.createWorkflow') }}
          </VBtn>
        </template>
      </div>
    </div>

    <ProgressiveCardGrid
      v-if="filteredWorkflowList.length > 0 && isRefreshed"
      :items="filteredWorkflowList"
      :get-item-key="item => item.id"
      :min-item-width="288"
      :estimated-item-height="196"
    >
      <template #default="{ item }">
        <WorkflowTaskCard :workflow="item" :event-types="eventTypes" @refresh="fetchData" @remove="removeWorkflow" />
      </template>
    </ProgressiveCardGrid>

    <!-- 筛选无匹配结果 -->
    <div v-else-if="workflowList.length > 0 && isRefreshed" class="workflow-empty-filter py-12 px-4 text-center">
      <VIcon icon="mdi-filter-remove-outline" size="42" class="text-medium-emphasis mb-2" />
      <div class="text-subtitle-1 font-weight-medium">{{ t('workflow.filter.noMatchTitle') }}</div>
      <div class="text-body-2 text-medium-emphasis mt-1 mb-4">{{ t('workflow.filter.noMatchDescription') }}</div>
      <VBtn variant="outlined" rounded="lg" size="small" prepend-icon="mdi-restore" @click="resetFilters">
        {{ t('workflow.filter.resetFilter') }}
      </VBtn>
    </div>

    <!-- 空工作流引导状态 -->
    <div v-if="workflowList.length === 0 && isRefreshed && !loadError" class="workflow-empty-state">
      <NoDataFound
        error-code="404"
        :error-title="t('workflow.noWorkflow')"
        :error-description="t('workflow.noWorkflowDescription')"
      />
      <div class="workflow-empty-state__actions">
        <VBtn size="small" color="primary" variant="flat" rounded="lg" prepend-icon="mdi-plus" @click="openAddDialog()">
          {{ t('workflow.quickActions.createWorkflow') }}
        </VBtn>
        <VBtn size="small" variant="outlined" rounded="lg" prepend-icon="mdi-auto-fix" @click="openTemplateDialog()">
          {{ t('workflow.quickActions.quickCreateFromTemplate') }}
        </VBtn>
        <VBtn
          size="small"
          variant="outlined"
          rounded="lg"
          prepend-icon="mdi-code-json"
          @click="importJsonDialog = true"
        >
          {{ t('workflow.quickActions.importJsonCreate') }}
        </VBtn>
      </div>
    </div>

    <!-- 导入 JSON 新建弹窗 -->
    <ImportCodeDialog
      v-if="importJsonDialog"
      v-model="importJsonDialog"
      :title="t('workflow.quickActions.importJsonTitle')"
      data-type="workflow"
      @close="importJsonDialog = false"
      @save="handleImportJsonSave"
    />
  </div>
</template>

<style scoped lang="scss">
.workflow-list-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 13px;
}

.workflow-list-toolbar__filters {
  display: flex;
  min-inline-size: 0;
  flex: 1 1 520px;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.workflow-status-pills {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}

.workflow-status-pill {
  border-radius: 6px !important;
  block-size: 26px !important;
  cursor: pointer;
  font-size: 12px !important;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  padding-inline: 9px !important;
}

.workflow-list-toolbar__inputs {
  display: flex;
  min-inline-size: 0;
  flex: 1 1 268px;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
}

.workflow-trigger-select {
  flex: 0 0 112px;
  max-inline-size: 124px;
}

.workflow-search-field {
  min-inline-size: 140px;
  flex: 1 1 150px;
  max-inline-size: 260px;
}

.workflow-trigger-select :deep(.v-field),
.workflow-search-field :deep(.v-field) {
  border-radius: 7px;
  font-size: 13px;
  min-block-size: 32px;
}

.workflow-trigger-select :deep(.v-field__input),
.workflow-search-field :deep(.v-field__input) {
  min-block-size: 32px;
  padding-block: 4px;
}

.workflow-list-toolbar__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.workflow-refresh-btn {
  border-radius: 7px !important;
  block-size: 28px !important;
  inline-size: 28px !important;
  min-inline-size: 28px !important;
}

.workflow-empty-state__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-block-start: -8px;
  padding-block-end: 24px;
  padding-inline: 16px;
}

@media (width <= 680px) {
  .workflow-list-toolbar__inputs {
    flex-wrap: wrap;
    inline-size: 100%;
  }

  .workflow-trigger-select,
  .workflow-search-field {
    max-inline-size: none;
    flex: 1 1 140px;
  }
}
</style>
