<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import type { Workflow } from '@/api/types'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import { requiredValidator } from '@/@validators'
import api from '@/api'
import { useDisplay } from 'vuetify'
import { useI18n } from '@/composables/useChineseText'

interface EventConditionRow {
  id: string
  field: string
  operator: string
  value: string
}

// 多语言支持
const { t } = useI18n()

// 输入参数
const props = defineProps({
  // 任务信息（编辑已有工作流时传入）
  workflow: Object as PropType<Workflow>,
  // 预设模板（从内置模板或导入 JSON 新建工作流时传入）
  initialTemplate: Object as PropType<Partial<Workflow>>,
})

// 新增或修改字样
const title = computed(() =>
  props.workflow ? t('dialog.workflowAddEdit.editTitle') : t('dialog.workflowAddEdit.addTitle'),
)

// 显示器宽度
const display = useDisplay()

// 注册事件
const emit = defineEmits(['save', 'remove', 'close'])
const saving = ref(false)

let conditionRowSeed = 0
function nextConditionRowId() {
  return `cond_${++conditionRowSeed}`
}

// 事件过滤条件行
const eventConditionRows = ref<EventConditionRow[]>([])

// 反向解析后端 event_conditions 对象为可视化行
function parseEventConditions(conditions?: Record<string, unknown> | null): EventConditionRow[] {
  if (!conditions || typeof conditions !== 'object' || Array.isArray(conditions)) {
    return []
  }
  const rows: EventConditionRow[] = []
  Object.entries(conditions).forEach(([field, rawRule]) => {
    const cleanField = String(field || '').trim()
    if (!cleanField) return
    if (rawRule && typeof rawRule === 'object' && !Array.isArray(rawRule)) {
      Object.entries(rawRule).forEach(([operator, expectedValue]) => {
        if (expectedValue === undefined || expectedValue === null) return
        rows.push({
          id: nextConditionRowId(),
          field: cleanField,
          operator: String(operator || 'equals'),
          value: String(expectedValue),
        })
      })
    } else if (rawRule !== undefined && rawRule !== null) {
      rows.push({
        id: nextConditionRowId(),
        field: cleanField,
        operator: 'equals',
        value: String(rawRule),
      })
    }
  })
  return rows
}

// 将可视化行组装为后端 event_conditions 结构
function buildEventConditions(): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {}
  eventConditionRows.value.forEach(row => {
    const field = String(row.field || '').trim()
    const operator = String(row.operator || 'equals').trim() || 'equals'
    const value = String(row.value ?? '').trim()
    if (!field || !value) return
    if (!result[field]) {
      result[field] = {}
    }
    result[field][operator] = value
  })
  return result
}

function addEventConditionRow() {
  eventConditionRows.value.push({
    id: nextConditionRowId(),
    field: '',
    operator: 'equals',
    value: '',
  })
}

function removeEventConditionRow(id: string) {
  eventConditionRows.value = eventConditionRows.value.filter(row => row.id !== id)
}

function createInitialForm(): Workflow {
  if (props.workflow) {
    return {
      ...props.workflow,
      trigger_type: props.workflow.trigger_type || 'timer',
      execution_config: { ...(props.workflow.execution_config || {}) },
    }
  }
  if (props.initialTemplate) {
    return {
      name: props.initialTemplate.name,
      timer: props.initialTemplate.timer,
      description: props.initialTemplate.description,
      trigger_type: props.initialTemplate.trigger_type || 'timer',
      event_type: props.initialTemplate.event_type,
      event_conditions: { ...(props.initialTemplate.event_conditions || {}) },
      actions: props.initialTemplate.actions ? JSON.parse(JSON.stringify(props.initialTemplate.actions)) : undefined,
      flows: props.initialTemplate.flows ? JSON.parse(JSON.stringify(props.initialTemplate.flows)) : undefined,
      state: props.initialTemplate.state || 'P',
      run_count: 0,
      execution_config: { ...(props.initialTemplate.execution_config || {}) },
    }
  }
  return {
    name: undefined,
    timer: undefined,
    description: undefined,
    trigger_type: 'timer',
    event_type: undefined,
    event_conditions: {},
    state: 'P',
    run_count: 0,
    execution_config: {},
  }
}

// 表单数据
const workflowForm = ref<Workflow>(createInitialForm())

// 预设流程统计
const presetActionCount = computed(() =>
  !props.workflow && Array.isArray(workflowForm.value.actions) ? workflowForm.value.actions.length : 0,
)
const presetFlowCount = computed(() =>
  !props.workflow && Array.isArray(workflowForm.value.flows) ? workflowForm.value.flows.length : 0,
)

// 将并发数清洗为正整数，空值表示使用后端默认值
const normalizePositiveInteger = (value: unknown) => {
  if (value === undefined || value === null || value === '') return undefined
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue) || numberValue < 1) return undefined
  return Math.floor(numberValue)
}

// 工作流级执行配置中的最大并行数
const workflowMaxWorkers = computed<number | null>({
  get() {
    return normalizePositiveInteger(workflowForm.value.execution_config?.max_workers) ?? null
  },
  set(value) {
    const executionConfig = { ...(workflowForm.value.execution_config || {}) }
    const maxWorkers = normalizePositiveInteger(value)
    if (maxWorkers) {
      executionConfig.max_workers = maxWorkers
    } else {
      delete executionConfig.max_workers
    }
    workflowForm.value.execution_config = Object.keys(executionConfig).length ? executionConfig : undefined
  },
})

// 监听props变化，处理存量数据或预设模板
watch(
  () => [props.workflow, props.initialTemplate] as const,
  ([newWorkflow, newTemplate]) => {
    if (newWorkflow) {
      if (!newWorkflow.trigger_type) {
        newWorkflow.trigger_type = 'timer'
      }
      workflowForm.value = {
        ...newWorkflow,
        execution_config: { ...(newWorkflow.execution_config || {}) },
      }
      eventConditionRows.value = parseEventConditions(newWorkflow.event_conditions)
    } else if (newTemplate) {
      workflowForm.value = createInitialForm()
      eventConditionRows.value = parseEventConditions(newTemplate.event_conditions)
    } else {
      eventConditionRows.value = []
    }
  },
  { immediate: true },
)

// 事件类型列表
const eventTypes = ref<Array<{ title: string; value: string }>>([])

// 触发类型选项
const triggerTypeOptions = computed(() => [
  {
    title: t('dialog.workflowAddEdit.triggerTypeTimer'),
    value: 'timer',
    prependIcon: 'mdi-clock-outline',
  },
  {
    title: t('dialog.workflowAddEdit.triggerTypeEvent'),
    value: 'event',
    prependIcon: 'mdi-calendar-check',
  },
  {
    title: t('dialog.workflowAddEdit.triggerTypeManual'),
    value: 'manual',
    prependIcon: 'mdi-hand-pointing-up',
  },
])

// 事件过滤字段预设选项
const conditionFieldOptions = computed(() => [
  { title: t('dialog.workflowAddEdit.conditionFields.type'), value: 'type' },
  { title: t('dialog.workflowAddEdit.conditionFields.category'), value: 'category' },
  { title: t('dialog.workflowAddEdit.conditionFields.title'), value: 'title' },
  { title: t('dialog.workflowAddEdit.conditionFields.year'), value: 'year' },
  { title: t('dialog.workflowAddEdit.conditionFields.site_name'), value: 'site_name' },
  { title: t('dialog.workflowAddEdit.conditionFields.downloader'), value: 'downloader' },
  { title: t('dialog.workflowAddEdit.conditionFields.username'), value: 'username' },
])

// 事件过滤操作符选项
const conditionOperatorOptions = computed(() => [
  { title: t('dialog.workflowAddEdit.conditionOperators.equals'), value: 'equals' },
  { title: t('dialog.workflowAddEdit.conditionOperators.not_equals'), value: 'not_equals' },
  { title: t('dialog.workflowAddEdit.conditionOperators.contains'), value: 'contains' },
  { title: t('dialog.workflowAddEdit.conditionOperators.not_contains'), value: 'not_contains' },
  { title: t('dialog.workflowAddEdit.conditionOperators.regex'), value: 'regex' },
])

// 加载事件类型列表
async function loadEventTypes() {
  try {
    eventTypes.value = await api.get('workflow/event_types')
  } catch (error) {
    console.error('Failed to load event types:', error)
  }
}

// 监听触发类型变化
watch(
  () => workflowForm.value.trigger_type,
  newType => {
    if (newType !== 'event') {
      workflowForm.value.event_type = undefined
      workflowForm.value.event_conditions = {}
      eventConditionRows.value = []
    }
  },
)

// 提示框
const $toast = useToast()

// 保存前统一清洗工作流执行配置与事件过滤条件
function normalizeBeforeSubmit() {
  const executionConfig = { ...(workflowForm.value.execution_config || {}) }
  const maxWorkers = normalizePositiveInteger(executionConfig.max_workers)
  if (maxWorkers) {
    executionConfig.max_workers = maxWorkers
  } else {
    delete executionConfig.max_workers
  }
  workflowForm.value.execution_config = Object.keys(executionConfig).length ? executionConfig : undefined

  if (workflowForm.value.trigger_type === 'event') {
    workflowForm.value.event_conditions = buildEventConditions()
  } else {
    workflowForm.value.event_conditions = {}
  }
}

// 校验必填项
function validateForm() {
  if (!workflowForm.value.name) {
    $toast.error(t('dialog.workflowAddEdit.nameRequired'))
    return false
  }
  if (!workflowForm.value.trigger_type) {
    $toast.error(t('dialog.workflowAddEdit.triggerRequired'))
    return false
  }
  if (workflowForm.value.trigger_type === 'timer' && !workflowForm.value.timer) {
    $toast.error(t('dialog.workflowAddEdit.timerRequired'))
    return false
  }
  if (workflowForm.value.trigger_type === 'event' && !workflowForm.value.event_type) {
    $toast.error(t('dialog.workflowAddEdit.eventTypeRequired'))
    return false
  }
  return true
}

// 调用API 新增任务
async function addWorkflow() {
  if (saving.value) return
  if (!validateForm()) return

  normalizeBeforeSubmit()
  saving.value = true
  startNProgress()
  try {
    const result: { success: boolean; message?: string; data?: { id?: Workflow['id'] } } = await api.post(
      'workflow/',
      workflowForm.value,
    )
    if (result.success) {
      $toast.success(
        presetActionCount.value > 0
          ? t('dialog.workflowAddEdit.addWithFlowSuccess')
          : t('dialog.workflowAddEdit.addSuccess'),
      )
      emit('save', result.data?.id)
    } else {
      $toast.error(t('dialog.workflowAddEdit.addFailed', { message: result.message }))
    }
  } catch (error) {
    console.error(error)
    $toast.error(
      t('dialog.workflowAddEdit.addFailed', {
        message: error instanceof Error ? error.message : t('common.error'),
      }),
    )
  } finally {
    saving.value = false
    doneNProgress()
  }
}

// 调用API 编辑任务
async function editWorkflow() {
  if (saving.value) return
  if (!validateForm()) return

  normalizeBeforeSubmit()
  saving.value = true
  startNProgress()
  try {
    const result: { [key: string]: string } = await api.put(`workflow/${workflowForm.value.id}`, workflowForm.value)
    if (result.success) {
      $toast.success(t('dialog.workflowAddEdit.editSuccess'))
      emit('save')
    } else {
      $toast.error(t('dialog.workflowAddEdit.editFailed', { message: result.message }))
    }
  } catch (error) {
    console.error(error)
    $toast.error(
      t('dialog.workflowAddEdit.editFailed', {
        message: error instanceof Error ? error.message : t('common.error'),
      }),
    )
  } finally {
    saving.value = false
    doneNProgress()
  }
}

// 组件挂载时加载事件类型
onMounted(() => {
  loadEventTypes()
})
</script>

<template>
  <VDialog scrollable :close-on-back="false" eager max-width="42rem" :fullscreen="!display.mdAndUp.value">
    <VCard class="mp-dialog-card">
      <VCardItem class="mp-dialog-header">
        <template #prepend>
          <VIcon icon="mdi-workflow-outline" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>{{ title }}</VCardTitle>
      </VCardItem>
      <VDialogCloseBtn @click="emit('close')" />
      <VDivider />
      <VCardText class="mp-dialog-body">
        <VAlert
          v-if="presetActionCount > 0"
          type="info"
          variant="tonal"
          density="compact"
          icon="mdi-auto-fix"
          class="mb-4"
        >
          {{
            t('dialog.workflowAddEdit.presetFlowBanner', {
              actionCount: presetActionCount,
              flowCount: presetFlowCount,
            })
          }}
        </VAlert>

        <VForm @submit.prevent="() => {}">
          <VRow class="mp-form-grid">
            <VCol cols="12" sm="6">
              <VTextField
                v-model="workflowForm.name"
                :label="t('dialog.workflowAddEdit.name')"
                :rules="[requiredValidator]"
                :hint="t('dialog.workflowAddEdit.namePlaceholder')"
                prepend-inner-icon="mdi-workflow"
              />
            </VCol>
            <VCol cols="12" sm="6">
              <VSelect
                v-model="workflowForm.trigger_type"
                :label="t('dialog.workflowAddEdit.triggerType')"
                :items="triggerTypeOptions"
                item-title="title"
                item-value="value"
                :rules="[requiredValidator]"
                prepend-inner-icon="mdi-run"
              >
                <template #item="{ item, props: itemProps }">
                  <VListItem v-bind="itemProps">
                    <template #prepend>
                      <VIcon :icon="item.raw.prependIcon" />
                    </template>
                  </VListItem>
                </template>
              </VSelect>
            </VCol>
            <VCol v-if="workflowForm.trigger_type === 'timer'" cols="12">
              <VCronField
                v-model="workflowForm.timer"
                :label="t('dialog.workflowAddEdit.schedule')"
                :rules="[requiredValidator]"
                placeholder="5位cron表达式"
                persistent-hint
                :hint="t('dialog.workflowAddEdit.cronExprDesc')"
                prepend-inner-icon="mdi-clock-outline"
              />
            </VCol>
            <VCol v-if="workflowForm.trigger_type === 'event'" cols="12">
              <VSelect
                v-model="workflowForm.event_type"
                :label="t('dialog.workflowAddEdit.eventType')"
                :items="eventTypes"
                item-title="title"
                item-value="value"
                :rules="[requiredValidator]"
                :hint="t('dialog.workflowAddEdit.eventTypePlaceholder')"
                prepend-inner-icon="mdi-calendar-check"
              />
            </VCol>

            <!-- 事件过滤条件可视化配置 -->
            <VCol v-if="workflowForm.trigger_type === 'event'" cols="12">
              <div class="workflow-event-conditions">
                <div class="workflow-event-conditions__header">
                  <div>
                    <div class="workflow-event-conditions__title">
                      <VIcon icon="mdi-filter-variant" size="17" class="text-primary" />
                      <span>{{ t('dialog.workflowAddEdit.eventConditionsTitle') }}</span>
                    </div>
                    <div class="workflow-event-conditions__hint">
                      {{ t('dialog.workflowAddEdit.eventConditionsHint') }}
                    </div>
                  </div>
                  <VBtn
                    color="default"
                    variant="outlined"
                    size="small"
                    prepend-icon="mdi-plus"
                    @click="addEventConditionRow"
                  >
                    {{ t('dialog.workflowAddEdit.addCondition') }}
                  </VBtn>
                </div>

                <div v-if="eventConditionRows.length > 0" class="workflow-event-conditions__rows">
                  <div v-for="row in eventConditionRows" :key="row.id" class="workflow-event-conditions__row">
                    <VCombobox
                      v-model="row.field"
                      :items="conditionFieldOptions"
                      item-title="title"
                      item-value="value"
                      :return-object="false"
                      :label="t('dialog.workflowAddEdit.conditionField')"
                      density="compact"
                      variant="outlined"
                      hide-details
                      class="workflow-event-conditions__field"
                    />
                    <VSelect
                      v-model="row.operator"
                      :items="conditionOperatorOptions"
                      item-title="title"
                      item-value="value"
                      :label="t('dialog.workflowAddEdit.conditionOperator')"
                      density="compact"
                      variant="outlined"
                      hide-details
                      class="workflow-event-conditions__operator"
                    />
                    <VTextField
                      v-model="row.value"
                      :label="t('dialog.workflowAddEdit.conditionValue')"
                      density="compact"
                      variant="outlined"
                      hide-details
                      class="workflow-event-conditions__value"
                    />
                    <IconBtn
                      size="small"
                      color="error"
                      :aria-label="t('common.delete')"
                      @click="removeEventConditionRow(row.id)"
                    >
                      <VIcon icon="mdi-delete-outline" size="18" />
                    </IconBtn>
                  </div>
                </div>
              </div>
            </VCol>

            <VCol cols="12">
              <VTextarea
                v-model="workflowForm.description"
                :label="t('dialog.workflowAddEdit.desc')"
                :placeholder="t('dialog.workflowAddEdit.descPlaceholder')"
                rows="2"
                auto-grow
                hide-details="auto"
                prepend-inner-icon="mdi-text-box-outline"
              />
            </VCol>
            <VCol cols="12">
              <VTextField
                v-model.number="workflowMaxWorkers"
                type="number"
                min="1"
                clearable
                hide-details="auto"
                :label="t('dialog.workflowAddEdit.maxWorkers')"
                prepend-inner-icon="mdi-call-split"
              />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
      <VDivider />
      <VCardActions class="app-dialog-actions mp-dialog-footer">
        <VSpacer />
        <VBtn color="default" variant="text" size="small" :disabled="saving" @click="emit('close')">
          {{ t('common.cancel') }}
        </VBtn>
        <VBtn
          v-if="workflow"
          color="primary"
          variant="flat"
          size="small"
          :loading="saving"
          :disabled="saving"
          class="px-4"
          @click="editWorkflow"
        >
          {{ t('dialog.workflowAddEdit.confirm') }}
        </VBtn>
        <VBtn
          v-else
          color="primary"
          variant="flat"
          size="small"
          :loading="saving"
          :disabled="saving"
          class="px-4"
          @click="addWorkflow"
        >
          {{ t('dialog.workflowAddEdit.confirm') }}
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

.mp-dialog-body {
  padding: 18px 22px !important;
}

.mp-dialog-footer {
  gap: 8px;
  padding: 10px 20px !important;
}

.mp-form-grid {
  row-gap: 6px;
}

.workflow-event-conditions {
  display: flex;
  flex-direction: column;
  padding: 14px 16px;
  border: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.1));
  border-radius: 10px;
  background: var(--mp-item-bg, rgba(var(--v-theme-on-surface), 0.025));
  gap: 12px;
}

.workflow-event-conditions__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.workflow-event-conditions__title {
  display: flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 0.875rem;
  font-weight: 600;
  gap: 6px;
}

.workflow-event-conditions__hint {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  margin-block-start: 2px;
}

.workflow-event-conditions__rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.workflow-event-conditions__row {
  display: grid;
  align-items: center;
  gap: 8px;
  grid-template-columns: minmax(140px, 1.2fr) minmax(110px, 0.9fr) minmax(120px, 1.2fr) auto;
}

@media (width <= 600px) {
  .workflow-event-conditions__header {
    flex-direction: column;
    align-items: flex-start;
  }

  .workflow-event-conditions__row {
    padding: 8px;
    border-radius: var(--app-control-radius);
    background: rgba(var(--v-theme-surface), 0.5);
    grid-template-columns: 1fr auto;
  }

  .workflow-event-conditions__field {
    grid-column: 1 / -1;
  }

  .workflow-event-conditions__operator {
    grid-column: 1 / -1;
  }
}
</style>
