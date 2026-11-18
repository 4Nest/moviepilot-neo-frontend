<script setup lang="ts">
import api from '@/api'
import { Handle, Position } from '@vue-flow/core'
import { useI18n } from '@/composables/useChineseText'

const { t } = useI18n()

interface InvokePluginNodeData {
  plugin_id?: string
  action_id?: string
  action_params?: unknown
}

const props = defineProps({
  id: {
    type: String,
    required: true,
  },
  data: {
    type: Object as PropType<InvokePluginNodeData>,
    required: true,
  },
})

interface ActionItem {
  id: string
  name: string
}

interface PluginAction {
  plugin_id: string
  plugin_name: string
  actions: ActionItem[]
}

// 统一更新 Vue Flow 节点可变数据负载
function patchNodeData(patch: Partial<InvokePluginNodeData>) {
  Object.assign(props.data, patch)
}

// 插件所有动作
const pluginActions = ref<PluginAction[]>([])

// 插件选项
const pluginOptions = computed(() => {
  return pluginActions.value.map((item: PluginAction) => ({
    title: item.plugin_name,
    value: item.plugin_id,
  }))
})

// 动作选项
const actionOptions = computed(() => {
  return pluginActions.value
    .find((item: PluginAction) => item.plugin_id === props.data.plugin_id)
    ?.actions.map((item: ActionItem) => ({
      title: item.name,
      value: item.id,
    }))
})

function formatActionParams(raw: unknown): string {
  try {
    if (raw && typeof raw === 'object') {
      return JSON.stringify(raw, null, 2)
    }
    return typeof raw === 'string' ? raw : ''
  } catch (error) {
    console.error(error)
    return ''
  }
}

// 独立草稿 ref 避免打字期间实时 JSON.stringify 重排导致光标跳动
const actionParamsText = ref(formatActionParams(props.data.action_params))
const actionParamsError = ref(false)
let isEditingActionParams = false

watch(
  () => props.data.plugin_id,
  (nextPluginId, prevPluginId) => {
    if (nextPluginId !== prevPluginId) {
      patchNodeData({ action_id: '' })
    }
  },
)

watch(
  () => props.data.action_params,
  nextParams => {
    if (isEditingActionParams) return
    actionParamsText.value = formatActionParams(nextParams)
    actionParamsError.value = false
  },
)

function handlePluginChange(pluginId: string) {
  patchNodeData({ plugin_id: pluginId, action_id: '' })
}

function handleActionChange(actionId: string) {
  patchNodeData({ action_id: actionId })
}

function handleActionParamsInput(value: string) {
  isEditingActionParams = true
  actionParamsText.value = value
  const trimmed = value.trim()
  if (!trimmed) {
    patchNodeData({ action_params: {} })
    actionParamsError.value = false
    return
  }
  try {
    patchNodeData({ action_params: JSON.parse(trimmed) })
    actionParamsError.value = false
  } catch {
    patchNodeData({ action_params: value })
  }
}

function handleActionParamsBlur() {
  isEditingActionParams = false
  const trimmed = actionParamsText.value.trim()
  if (!trimmed) {
    patchNodeData({ action_params: {} })
    actionParamsText.value = ''
    actionParamsError.value = false
    return
  }
  try {
    const parsed = JSON.parse(trimmed)
    patchNodeData({ action_params: parsed })
    actionParamsText.value = JSON.stringify(parsed, null, 2)
    actionParamsError.value = false
  } catch (error) {
    actionParamsError.value = true
    console.error(error)
  }
}

// 加载动作选项
async function loadPluginActions() {
  try {
    pluginActions.value = await api.get('workflow/plugin/actions')
  } catch (error) {
    console.error(error)
  }
}

onMounted(() => {
  loadPluginActions()
})
</script>
<template>
  <div>
    <VCard max-width="20rem" class="workflow-node-card">
      <Handle id="edge_in" type="target" :position="Position.Left" />
      <VCardItem class="workflow-node-header">
        <template #prepend>
          <VAvatar size="34" rounded="lg" variant="tonal" color="primary" class="workflow-node-avatar">
            <VIcon icon="mdi-run" size="18" />
          </VAvatar>
        </template>
        <VCardTitle class="workflow-node-title">{{ t('workflow.invokePlugin.title') }}</VCardTitle>
        <VCardSubtitle class="workflow-node-subtitle">{{ t('workflow.invokePlugin.subtitle') }}</VCardSubtitle>
      </VCardItem>
      <VDivider />
      <VCardText class="workflow-node-body">
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol cols="12">
              <VSelect
                :model-value="data.plugin_id"
                :items="pluginOptions"
                :label="t('workflow.invokePlugin.plugin')"
                variant="outlined"
                density="compact"
                hide-details="auto"
                @update:model-value="handlePluginChange"
              />
            </VCol>
            <VCol cols="12">
              <VSelect
                :model-value="data.action_id"
                :items="actionOptions"
                :label="t('workflow.invokePlugin.actionid')"
                variant="outlined"
                density="compact"
                hide-details="auto"
                @update:model-value="handleActionChange"
              />
            </VCol>
            <VCol cols="12">
              <VTextarea
                :model-value="actionParamsText"
                :label="t('workflow.invokePlugin.actionParams')"
                :error="actionParamsError"
                variant="outlined"
                density="compact"
                hide-details="auto"
                @update:model-value="handleActionParamsInput"
                @blur="handleActionParamsBlur"
              />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
      <Handle id="edge_out" type="source" :position="Position.Right" />
    </VCard>
  </div>
</template>

<style lang="scss" scoped>
.workflow-node-header {
  padding: 10px 14px;
}

.workflow-node-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
}

.workflow-node-subtitle {
  font-size: 12px;
  line-height: 1.35;
  margin-block-start: 1px;
}

.workflow-node-body {
  padding: 12px 14px !important;
}
</style>
