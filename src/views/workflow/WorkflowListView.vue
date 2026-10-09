<script setup lang="ts">
import api from '@/api'
import { Workflow } from '@/api/types'
import WorkflowTaskCard from '@/components/cards/WorkflowTaskCard.vue'
import NoDataFound from '@/components/states/NoDataFound.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { useI18n } from '@/composables/useChineseText'
import { useKeepAliveRefresh } from '@/composables/useKeepAliveRefresh'
import { openSharedDialog } from '@/composables/useSharedDialog'

const WorkflowAddEditDialog = defineAsyncComponent(() => import('@/components/dialog/WorkflowAddEditDialog.vue'))

// 国际化
const { t } = useI18n()

// 是否刷新
const isRefreshed = ref(false)

// 所有任务
const workflowList = ref<Workflow[]>([])
let fetchSequence = 0

// 事件类型列表
const eventTypes = ref<Array<{ title: string; value: string }>>([])

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
  try {
    const workflows: Workflow[] = await api.get('workflow/', { params: { summary: true } })
    if (sequence !== fetchSequence) return
    workflowList.value = workflows
    isRefreshed.value = true
  } catch (error) {
    console.error(error)
  }
}

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
  loadEventTypes()
  fetchData()
})

useKeepAliveRefresh(fetchData)

function openAddDialog() {
  openSharedDialog(
    WorkflowAddEditDialog,
    {},
    {
      save: addDone,
    },
    { closeOn: ['close', 'save'] },
  )
}

defineExpose({
  openAddDialog,
  refresh: fetchData,
})
</script>
<template>
  <div>
    <LoadingBanner v-if="!isRefreshed" class="mt-12" />
    <ProgressiveCardGrid
      v-if="workflowList.length > 0 && isRefreshed"
      :items="workflowList"
      :get-item-key="item => item.id"
      :min-item-width="288"
      :estimated-item-height="420"
      class="px-2"
    >
      <template #default="{ item }">
        <WorkflowTaskCard :workflow="item" :event-types="eventTypes" @refresh="fetchData" @remove="removeWorkflow" />
      </template>
    </ProgressiveCardGrid>
    <NoDataFound
      v-if="workflowList.length === 0 && isRefreshed"
      error-code="404"
      :error-title="t('workflow.noWorkflow')"
      :error-description="t('workflow.noWorkflowDescription')"
    />
  </div>
</template>
