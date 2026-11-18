<script lang="ts" setup>
import type { Component } from 'vue'
import { cloneDeep } from 'lodash-es'
import {
  VueFlow,
  useVueFlow,
  type Connection,
  type Edge,
  type EdgeMouseEvent,
  type GraphEdge,
  type GraphNode,
  type Node,
  type NodeMouseEvent,
} from '@vue-flow/core'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import { copyToClipboard } from '@/@core/utils/navigator'
import useDragAndDrop from '@core/utils/workflow'
import type {
  Workflow,
  WorkflowSimulationNodeResult,
  WorkflowSimulationResult,
  WorkflowSimulationScenario,
} from '@/api/types'
import { actionStepDict } from '@/api/constants'
import { useToast } from 'vue-toastification'
import { useConfirm } from '@/composables/useConfirm'
import api from '@/api'
import WorkflowSidebar from '@/components/workflow/WorkflowSidebar.vue'
import DropzoneBackground from '@/components/workflow/DropzoneBackground.vue'
import ImportCodeDialog from '@/components/dialog/ImportCodeDialog.vue'
import { useI18n } from '@/composables/useChineseText'

interface ActionContractField {
  name?: string
  label?: string
  kind?: string
}

interface ActionContract {
  inputs?: Array<ActionContractField | string>
  outputs?: Array<ActionContractField | string>
  condition_fields?: Array<ActionContractField | string>
  concurrency_key?: string
}

interface ActionDefinition {
  type: string
  name?: string
  description?: string
  contract?: ActionContract
  data?: Record<string, unknown>
}

interface NodeRetryConfig {
  max_attempts?: number
  interval?: number
  backoff?: number
}

interface WorkflowNodeLike {
  id: string
  type?: string
  name?: string
  description?: string
  desc?: string
  class?: unknown
  position?: { x: number; y: number }
  data?: Record<string, unknown>
  inputs?: string[]
  outputs?: Record<string, unknown>
  fail_policy?: string
  join_policy?: string
  branch_policy?: string
  concurrency_key?: string
  timeout?: number
  retry?: NodeRetryConfig
}

interface WorkflowEdgeLike {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  animated?: boolean
  type?: string
  label?: string
  class?: unknown
  condition?: string
  data?: Record<string, unknown>
}

// 多语言支持
const { t } = useI18n()
const createConfirm = useConfirm()

const {
  onConnect,
  addEdges,
  nodes,
  edges,
  addNodes,
  setNodes,
  setEdges,
  removeNodes,
  removeEdges,
  screenToFlowCoordinate,
  fitView,
  updateNode,
  updateNodeInternals,
} = useVueFlow()

const { onDragOver, onDrop, onDragLeave, isDragOver } = useDragAndDrop()

// 定义输入参数
const props = defineProps({
  workflow: Object as PropType<Workflow>,
})

// 定义事件
const emit = defineEmits(['close', 'save'])

// 表单数据
const workflowForm = ref<Workflow>(props.workflow ? cloneDeep(props.workflow) : {})

// 提示框
const $toast = useToast()

// 导入代码对话框
const importCodeDialog = ref(false)
// 侧边栏是否折叠
const isSidebarCollapsed = ref(false)

// 当前选中的流程边 ID
const selectedEdgeId = ref<string | null>(null)
// 流程边配置表单
const edgeForm = ref({
  condition: '',
})

// 当前选中的动作节点 ID（用于节点运行策略面板）
const selectedNodeId = ref<string | null>(null)
const nodePolicyExpanded = ref(false)
const nodePolicyForm = ref({
  fail_policy: 'stop',
  join_policy: 'all_success',
  max_attempts: 1 as number | null,
  retry_interval: 0 as number | null,
  timeout: null as number | null,
})

// 模拟试跑与画布逐步推演动画状态
const simulationLoading = ref(false)
const simulationScenario = ref<WorkflowSimulationScenario>('live_dry_run')
const simulationResult = ref<WorkflowSimulationResult | null>(null)
const simulationPanelOpen = ref(false)
const isSimAnimating = ref(false)
const activeSimNodeId = ref<string | null>(null)
const isLayoutAnimating = ref(false)
const simNodeVisuals = ref<Record<string, { stateClass: string; badgeText: string }>>({})
const simEdgeVisuals = ref<Record<string, string>>({})
let simWalkthroughToken = 0
let simTimers: Array<ReturnType<typeof setTimeout>> = []
let layoutAnimTimer: ReturnType<typeof setTimeout> | null = null

// 未保存状态快照签名
const savedSnapshot = ref('')

// 后端动作固定契约，供条件构造器读取上一节点输出
const actionDefinitions = ref<ActionDefinition[]>([])

// 动作类型到契约的映射
const actionContractMap = computed(() => {
  return actionDefinitions.value.reduce(
    (result, action) => {
      result[action.type] = action.contract || {}
      return result
    },
    {} as Record<string, ActionContract>,
  )
})

// 获取指定节点端口的类型（输入/输出；兼容动态节点尚未完成 DOM 测量时的默认端口名）
const getPortType = (node: GraphNode, handleId?: string | null) => {
  if (handleId) {
    const isInput = node.handleBounds?.target?.some(h => h.id === handleId)
    if (isInput) return 'input'

    const isOutput = node.handleBounds?.source?.some(h => h.id === handleId)
    if (isOutput) return 'output'

    const hasMeasuredHandles = Boolean(node.handleBounds?.source?.length) || Boolean(node.handleBounds?.target?.length)
    if (!hasMeasuredHandles) {
      if (handleId === 'edge_in' || handleId.endsWith('_in')) return 'input'
      if (handleId === 'edge_out' || handleId.endsWith('_out')) return 'output'
    }
  } else {
    const hasMeasuredHandles = Boolean(node.handleBounds?.source?.length) || Boolean(node.handleBounds?.target?.length)
    if (!hasMeasuredHandles) return 'auto'
  }
  return null
}

// 校验连接是否合法
const isValidConnection = (connection: Connection) => {
  if (!connection.source || !connection.target || connection.source === connection.target) return false
  const sourceNode = nodes.value.find(n => n.id === connection.source)
  const targetNode = nodes.value.find(n => n.id === connection.target)

  if (!sourceNode || !targetNode) return false

  const sourcePortType = getPortType(sourceNode, connection.sourceHandle)
  const targetPortType = getPortType(targetNode, connection.targetHandle)

  return (
    (sourcePortType === 'output' || sourcePortType === 'auto') &&
    (targetPortType === 'input' || targetPortType === 'auto')
  )
}

// 连接事件
onConnect((connection: Connection) => {
  if (!isValidConnection(connection)) {
    $toast.warning(t('dialog.workflowActions.invalidConnection'))
    return
  }
  addEdges(
    normalizeWorkflowEdge({
      ...connection,
      id: `edge_${connection.source}_${connection.target}_${Date.now()}`,
      type: 'animation',
      animated: true,
    }) as unknown as Edge,
  )
})

// 读取流程边扩展配置，兼容后端支持的顶层字段与 data 字段
const getEdgeConfigValue = (edge: WorkflowEdgeLike | GraphEdge | null | undefined, key: string) => {
  if (!edge) return ''
  const record = edge as unknown as Record<string, unknown>
  const dataRecord = (edge.data || {}) as Record<string, unknown>
  return record[key] ?? dataRecord[key] ?? ''
}

// 复制对象并移除指定键
const omitConfigKeys = (value: Record<string, unknown> | undefined | null, keys: string[]): Record<string, unknown> => {
  const result: Record<string, unknown> = { ...(value || {}) }
  keys.forEach(key => delete result[key])
  return result
}

// 清理模拟高亮附加的 class
function stripSimulationClasses(rawClass?: unknown): string {
  if (typeof rawClass !== 'string') return ''
  return rawClass
    .replace(/\bworkflow-sim-(?:node|edge)--[a-z_]+\b/g, '')
    .replace(/\bhas-sim-badge\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// 标准化单条流程边（用于保存或发送模拟请求）
const normalizeWorkflowEdge = (edge: WorkflowEdgeLike | GraphEdge, includeSimulationClass = false): GraphEdge => {
  const condition = String(getEdgeConfigValue(edge, 'condition') || '').trim()
  const baseClass = stripSimulationClasses(edge?.class)
    .replace(/\bworkflow-conditional-edge\b/g, '')
    .trim()

  let simClass = ''
  let animated = edge?.animated ?? true
  if (includeSimulationClass && simulationResult.value) {
    const visualState = simEdgeVisuals.value[edge.id] ?? findSimulatedEdge(edge)?.state
    if (visualState) {
      simClass = `workflow-sim-edge--${visualState}`
      animated = visualState === 'matched' || visualState === 'running'
    }
  } else if (!includeSimulationClass && simulationResult.value) {
    animated = true
  }

  const vueFlowRuntimeEdgeKeys = ['join_policy', 'branch_policy', 'sourceNode', 'targetNode', 'events', 'selected']
  const data = omitConfigKeys(edge?.data as Record<string, unknown>, ['join_policy', 'branch_policy'])
  data.condition = condition || undefined
  const edgePayload = omitConfigKeys(edge as unknown as Record<string, unknown>, vueFlowRuntimeEdgeKeys)

  return {
    ...edgePayload,
    sourceHandle: edge?.sourceHandle || 'edge_out',
    targetHandle: edge?.targetHandle || 'edge_in',
    animated,
    type: edge?.type || 'animation',
    label: condition ? t('dialog.workflowActions.edgeConditionalLabel') : undefined,
    class: [baseClass, condition ? 'workflow-conditional-edge' : '', simClass].filter(Boolean).join(' ') || undefined,
    condition: condition || undefined,
    data,
  } as unknown as GraphEdge
}

// 标准化动作节点：保留后端支持的运行策略字段，剥离纯展示契约与 VueFlow 内部运行期字段
const normalizeWorkflowNode = (node: WorkflowNodeLike | GraphNode, includeSimulationClass = false): GraphNode => {
  const metadataOnlyKeys = [
    'contract',
    '_contract',
    'computedPosition',
    'dimensions',
    'handleBounds',
    'selected',
    'dragging',
    'resizing',
    'initialized',
    'isParent',
    'events',
    'style',
  ]
  const data = omitConfigKeys(node?.data as Record<string, unknown>, ['contract', '_contract'])
  const nodePayload = omitConfigKeys(node as unknown as Record<string, unknown>, metadataOnlyKeys)

  // 兼容从 data 中迁移或读取节点高级策略到节点顶层
  const failPolicy = nodePayload.fail_policy ?? data.fail_policy
  const joinPolicy = nodePayload.join_policy ?? data.join_policy
  const branchPolicy = nodePayload.branch_policy ?? data.branch_policy
  const concurrencyKey = nodePayload.concurrency_key ?? data.concurrency_key
  const rawTimeout = nodePayload.timeout ?? data.timeout
  const rawRetry = (nodePayload.retry ?? data.retry) as NodeRetryConfig | undefined

  delete data.fail_policy
  delete data.join_policy
  delete data.branch_policy
  delete data.retry

  const baseClass = stripSimulationClasses(node?.class)
  let simClass = ''
  let badgeStyle: Record<string, string> | undefined
  if (includeSimulationClass && simulationResult.value) {
    const visual = simNodeVisuals.value[node.id]
    if (visual) {
      simClass = visual.stateClass
      if (visual.badgeText) {
        simClass = `${simClass} has-sim-badge`.trim()
        badgeStyle = { '--sim-badge-text': JSON.stringify(visual.badgeText) }
      }
    } else {
      const simNode = simulationResult.value.nodes?.[node.id]
      if (simNode?.state) {
        simClass = `workflow-sim-node--${simNode.state}`
      }
    }
  }

  const currentPos = (node as GraphNode)?.position
  const normalized: Record<string, unknown> = {
    ...nodePayload,
    position: {
      x: Number(currentPos?.x ?? 0),
      y: Number(currentPos?.y ?? 0),
    },
    class: [baseClass, simClass].filter(Boolean).join(' ') || undefined,
    ...(badgeStyle ? { style: badgeStyle } : {}),
    data,
  }

  if (failPolicy && failPolicy !== 'stop') {
    normalized.fail_policy = failPolicy
  } else if (failPolicy === 'stop') {
    normalized.fail_policy = 'stop'
  } else {
    delete normalized.fail_policy
  }

  if (joinPolicy && joinPolicy !== 'all_success') {
    normalized.join_policy = joinPolicy
  } else if (joinPolicy === 'all_success') {
    normalized.join_policy = 'all_success'
  } else {
    delete normalized.join_policy
  }

  if (branchPolicy) {
    normalized.branch_policy = branchPolicy
  }

  if (concurrencyKey) {
    normalized.concurrency_key = concurrencyKey
  }

  // 节点级超时只读取顶层 nodePayload.timeout，避免与 FetchRssAction 的 data.timeout 混淆
  const nodeLevelTimeout = nodePayload.timeout !== undefined ? Number(nodePayload.timeout) : NaN
  if (Number.isFinite(nodeLevelTimeout) && nodeLevelTimeout > 0) {
    normalized.timeout = Math.floor(nodeLevelTimeout)
  } else if (rawTimeout !== undefined && nodePayload.timeout === undefined && node.type !== 'FetchRssAction') {
    const fallbackTimeout = Number(rawTimeout)
    if (Number.isFinite(fallbackTimeout) && fallbackTimeout > 0) {
      normalized.timeout = Math.floor(fallbackTimeout)
    } else {
      delete normalized.timeout
    }
  } else {
    delete normalized.timeout
  }

  if (rawRetry && typeof rawRetry === 'object' && !Array.isArray(rawRetry)) {
    const maxAttempts = Math.max(Math.floor(Number(rawRetry.max_attempts || 1)), 1)
    const interval = Math.max(Number(rawRetry.interval || 0), 0)
    const backoff = rawRetry.backoff !== undefined ? Math.max(Number(rawRetry.backoff || 1), 1) : undefined
    if (maxAttempts > 1 || interval > 0 || (backoff !== undefined && backoff > 1)) {
      normalized.retry = {
        max_attempts: maxAttempts,
        interval,
        ...(backoff !== undefined ? { backoff } : {}),
      }
    } else {
      delete normalized.retry
    }
  } else {
    delete normalized.retry
  }

  return normalized as unknown as GraphNode
}

// 生成干净持久化的节点与边列表（不含模拟临时样式）
function getCleanNodesAndEdges() {
  const cleanNodes = (nodes.value || []).map(node => normalizeWorkflowNode(node, false))
  const cleanEdges = (edges.value || []).map(edge => normalizeWorkflowEdge(edge, false))
  return { cleanNodes, cleanEdges }
}

// 就地同步画布上的模拟视觉样式，避免替换 GraphNode/GraphEdge 实例或触发重入循环
function syncCanvasNormalization(keepSimulation = false) {
  ;(nodes.value || []).forEach(node => {
    const baseClass = stripSimulationClasses(node.class)
    let simClass = ''
    let nextStyle: Record<string, string> | undefined
    if (keepSimulation && simulationResult.value) {
      const visual = simNodeVisuals.value[node.id]
      if (visual) {
        simClass = visual.stateClass
        if (visual.badgeText) {
          simClass = `${simClass} has-sim-badge`.trim()
          nextStyle = { '--sim-badge-text': JSON.stringify(visual.badgeText) }
        }
      }
    }
    const mergedClass = [baseClass, simClass].filter(Boolean).join(' ') || undefined
    if (node.class !== mergedClass || JSON.stringify(node.style || null) !== JSON.stringify(nextStyle || null)) {
      node.class = mergedClass
      node.style = nextStyle
      if ((node as GraphNode).computedPosition) {
        updateNode(node.id, { class: mergedClass, style: nextStyle })
      }
    }
  })

  ;(edges.value || []).forEach(edge => {
    const condition = String(getEdgeConfigValue(edge, 'condition') || '').trim()
    const baseClass = stripSimulationClasses(edge.class)
      .replace(/\bworkflow-conditional-edge\b/g, '')
      .trim()
    let simClass = ''
    let animated = true
    if (keepSimulation && simulationResult.value) {
      const visualState = simEdgeVisuals.value[edge.id]
      if (visualState) {
        simClass = `workflow-sim-edge--${visualState}`
        animated = visualState === 'matched' || visualState === 'running'
      } else {
        animated = false
      }
    }
    const nextClass =
      [baseClass, condition ? 'workflow-conditional-edge' : '', simClass].filter(Boolean).join(' ') || undefined
    const nextLabel = condition ? t('dialog.workflowActions.edgeConditionalLabel') : ''
    if (edge.class !== nextClass) edge.class = nextClass
    if (edge.animated !== animated) edge.animated = animated
    if (edge.label !== nextLabel) edge.label = nextLabel
  })
}

// 生成确定性的画布快照签名，用于检测未保存修改
function computeCanvasSignature(): string {
  const { cleanNodes, cleanEdges } = getCleanNodesAndEdges()
  const minimalNodes = cleanNodes.map(nodeItem => {
    const n = nodeItem as unknown as WorkflowNodeLike
    return {
      id: n.id,
      type: n.type,
      name: n.name,
      description: n.description || '',
      position: {
        x: Math.round(Number(n.position?.x || 0)),
        y: Math.round(Number(n.position?.y || 0)),
      },
      data: n.data || {},
      fail_policy: n.fail_policy || 'stop',
      join_policy: n.join_policy || 'all_success',
      branch_policy: n.branch_policy || null,
      concurrency_key: n.concurrency_key || null,
      timeout: n.timeout || null,
      retry: n.retry || null,
      inputs: n.inputs || [],
      outputs: n.outputs || {},
    }
  })
  const minimalEdges = cleanEdges.map(edgeItem => {
    const e = edgeItem as unknown as WorkflowEdgeLike
    return {
      id: e.id,
      source: e.source,
      sourceHandle: e.sourceHandle || 'edge_out',
      target: e.target,
      targetHandle: e.targetHandle || 'edge_in',
      condition: e.condition || '',
    }
  })
  return JSON.stringify({
    nodes: minimalNodes,
    edges: minimalEdges,
    execution_config: workflowForm.value?.execution_config || {},
  })
}

const currentSnapshot = computed(() => computeCanvasSignature())
const isDirty = computed(() => Boolean(savedSnapshot.value) && currentSnapshot.value !== savedSnapshot.value)

// 获取节点名称
const getNodeName = (nodeId?: string) => {
  const node = nodes.value.find(item => item.id === nodeId) as (GraphNode & { name?: string }) | undefined
  const label = typeof node?.data?.label === 'string' ? node.data.label : ''
  const rawName = node?.name || label || nodeId || ''
  return actionStepDict[rawName] || rawName
}

// 获取流程边源节点可用于条件判断的输出字段
const getEdgeConditionFields = (edge: WorkflowEdgeLike | GraphEdge | null) => {
  const sourceNode = edge ? nodes.value.find(node => node.id === edge.source) : null
  const contract = sourceNode && sourceNode.type ? actionContractMap.value[sourceNode.type] || {} : {}
  const fields = contract.condition_fields || contract.outputs || []
  return Array.isArray(fields)
    ? fields.filter((field): field is ActionContractField | string =>
        typeof field === 'string' ? Boolean(field) : Boolean(field?.name),
      )
    : []
}

// 判断流程边是否存在可编辑条件
const canConfigureEdge = (edge: WorkflowEdgeLike | GraphEdge) => {
  const condition = String(getEdgeConfigValue(edge, 'condition') || '').trim()
  return Boolean(condition || getEdgeConditionFields(edge).length)
}

// 选中流程边时打开设置面板
async function handleEdgeClick(params: EdgeMouseEvent) {
  const edge = params?.edge
  if (!edge) return
  closeNodePolicy()
  simulationPanelOpen.value = false
  if (!actionDefinitions.value.length) {
    await loadActionDefinitions()
  }
  if (!canConfigureEdge(edge)) {
    closeEdgeSettings()
    $toast.info(t('dialog.workflowActions.edgeNoConditionFields'))
    return
  }
  selectedEdgeId.value = edge.id
  edgeForm.value = {
    condition: String(getEdgeConfigValue(edge, 'condition') || ''),
  }
}

// 关闭流程边设置面板
function closeEdgeSettings() {
  selectedEdgeId.value = null
  edgeForm.value = {
    condition: '',
  }
}

// 保存流程边设置
function saveEdgeSettings() {
  if (!selectedEdgeId.value) return
  const condition = String(edgeForm.value.condition || '').trim()
  const target = edges.value.find(edge => edge.id === selectedEdgeId.value)
  if (target) {
    ;(target as unknown as WorkflowEdgeLike).condition = condition || undefined
    target.data = {
      ...(target.data || {}),
      condition: condition || undefined,
    }
    syncCanvasNormalization(Boolean(simulationResult.value))
  }
  $toast.success(t('dialog.workflowActions.edgeSaveSuccess'))
}

// 删除当前选中的流程边
function deleteSelectedEdge() {
  if (!selectedEdgeId.value) return
  removeEdges([selectedEdgeId.value])
  closeEdgeSettings()
}

// 当前选中的流程边
const selectedEdge = computed(() => {
  if (!selectedEdgeId.value) return null
  return edges.value.find(edge => edge.id === selectedEdgeId.value) || null
})

// 当前边可用于条件判断的输出字段
const selectedEdgeConditionFields = computed(() =>
  selectedEdge.value ? getEdgeConditionFields(selectedEdge.value) : [],
)

// 当前边的条件下拉选项
const edgeConditionOptions = computed(() => {
  const sourceNode = selectedEdge.value ? nodes.value.find(node => node.id === selectedEdge.value?.source) : null
  const options = [{ title: t('dialog.workflowActions.conditionAlways'), value: '' }]
  selectedEdgeConditionFields.value.forEach(field => {
    const fieldName = typeof field === 'string' ? field : field.name
    if (!fieldName) return
    const fieldLabel = typeof field === 'string' ? fieldName : field.label || fieldName
    const fieldKind = typeof field === 'string' ? undefined : field.kind
    if (fieldKind === 'list') {
      options.push({
        title: t('dialog.workflowActions.conditionHasOutput', { field: fieldLabel }),
        value: `outputs.${sourceNode?.id}.${fieldName}.count > 0`,
      })
      options.push({
        title: t('dialog.workflowActions.conditionNoOutput', { field: fieldLabel }),
        value: `outputs.${sourceNode?.id}.${fieldName}.count == 0`,
      })
      return
    }
    options.push({
      title: t('dialog.workflowActions.conditionHasValue', { field: fieldLabel }),
      value: `outputs.${sourceNode?.id}.${fieldName} != None`,
    })
  })
  if (edgeForm.value.condition && !options.some(item => item.value === edgeForm.value.condition)) {
    options.push({
      title: t('dialog.workflowActions.conditionCustom'),
      value: edgeForm.value.condition,
    })
  }
  return options
})

// 节点运行策略相关选项与状态
const selectedNode = computed(() => {
  if (!selectedNodeId.value) return null
  return nodes.value.find(node => node.id === selectedNodeId.value) || null
})

const failPolicyOptions = computed(() => [
  { title: t('dialog.workflowActions.nodePolicy.failStop'), value: 'stop' },
  { title: t('dialog.workflowActions.nodePolicy.failContinue'), value: 'continue' },
  { title: t('dialog.workflowActions.nodePolicy.failIgnore'), value: 'ignore' },
])

const joinPolicyOptions = computed(() => [
  { title: t('dialog.workflowActions.nodePolicy.joinAllSuccess'), value: 'all_success' },
  { title: t('dialog.workflowActions.nodePolicy.joinAnySuccess'), value: 'any_success' },
  { title: t('dialog.workflowActions.nodePolicy.joinAllDone'), value: 'all_done' },
  { title: t('dialog.workflowActions.nodePolicy.joinFailFast'), value: 'fail_fast' },
])

function loadNodePolicyForm(rawNode: GraphNode | WorkflowNodeLike) {
  const node = rawNode as unknown as WorkflowNodeLike
  const retry = node?.retry && typeof node.retry === 'object' ? node.retry : {}
  nodePolicyForm.value = {
    fail_policy: node?.fail_policy || 'stop',
    join_policy: node?.join_policy || 'all_success',
    max_attempts: Math.max(Number(retry.max_attempts || 1), 1),
    retry_interval: Math.max(Number(retry.interval || 0), 0),
    timeout: node?.timeout && Number(node.timeout) > 0 ? Number(node.timeout) : null,
  }
}

const selectedNodePolicyBadges = computed(() => {
  const node = selectedNode.value as unknown as WorkflowNodeLike | null
  if (!node) return []
  const badges: string[] = []
  if (node.fail_policy && node.fail_policy !== 'stop') {
    badges.push(node.fail_policy)
  }
  if (node.join_policy && node.join_policy !== 'all_success') {
    badges.push(node.join_policy)
  }
  const attempts = Number(node.retry?.max_attempts || 1)
  if (attempts > 1) {
    badges.push(t('dialog.workflowActions.nodePolicy.summaryRetry', { count: attempts }))
  }
  if (node.timeout && Number(node.timeout) > 0) {
    badges.push(t('dialog.workflowActions.nodePolicy.summaryTimeout', { seconds: node.timeout }))
  }
  return badges
})

// 选中动作节点：展示右上角紧凑可收起运行策略胶囊，不遮挡节点内部表单操作
function handleNodeClick(params: NodeMouseEvent) {
  closeEdgeSettings()
  const node = params?.node
  if (!node || node.type === 'NoteAction') {
    closeNodePolicy()
    return
  }
  if (selectedNodeId.value !== node.id) {
    selectedNodeId.value = node.id
    loadNodePolicyForm(node)
  }
}

function handlePaneClick() {
  closeEdgeSettings()
  closeNodePolicy()
}

function closeNodePolicy() {
  selectedNodeId.value = null
  nodePolicyExpanded.value = false
}

function saveNodePolicy() {
  if (!selectedNodeId.value) return
  const maxAttempts = Math.max(Math.floor(Number(nodePolicyForm.value.max_attempts || 1)), 1)
  const retryInterval = Math.max(Number(nodePolicyForm.value.retry_interval || 0), 0)
  const timeoutVal =
    nodePolicyForm.value.timeout !== null &&
    nodePolicyForm.value.timeout !== undefined &&
    Number(nodePolicyForm.value.timeout) > 0
      ? Math.floor(Number(nodePolicyForm.value.timeout))
      : undefined

  const targetNode = nodes.value.find(node => node.id === selectedNodeId.value)
  if (targetNode) {
    const currentLike = targetNode as unknown as WorkflowNodeLike
    const nextRetry =
      maxAttempts > 1 || retryInterval > 0
        ? {
            ...(typeof currentLike.retry === 'object' ? currentLike.retry : {}),
            max_attempts: maxAttempts,
            interval: retryInterval,
          }
        : undefined
    currentLike.fail_policy = nodePolicyForm.value.fail_policy || 'stop'
    currentLike.join_policy = nodePolicyForm.value.join_policy || 'all_success'
    currentLike.timeout = timeoutVal
    currentLike.retry = nextRetry
    updateNode(targetNode.id, {
      fail_policy: currentLike.fail_policy,
      join_policy: currentLike.join_policy,
      timeout: timeoutVal,
      retry: nextRetry,
    } as Record<string, unknown>)
  }
  nodePolicyExpanded.value = false
  $toast.success(t('dialog.workflowActions.nodePolicy.saveSuccess'))
}

function deleteSelectedNode() {
  if (!selectedNodeId.value) return
  const targetId = selectedNodeId.value
  const relatedEdgeIds = edges.value
    .filter(edge => edge.source === targetId || edge.target === targetId)
    .map(edge => edge.id)
  if (relatedEdgeIds.length > 0) {
    removeEdges(relatedEdgeIds)
  }
  removeNodes([targetId])
  closeNodePolicy()
}

// 一键 DAG Kahn 拓扑分层自动排版（基于节点真实尺寸测量与 VueFlow 响应式位置更新）
function autoLayoutWorkflow() {
  if (!nodes.value.length) return
  const allNodes = [...nodes.value]
  const noteNodes = allNodes.filter(n => n.type === 'NoteAction')
  const actionNodes = allNodes.filter(n => n.type !== 'NoteAction')

  const newPositions = new Map<string, { x: number; y: number }>()
  const startX = 340

  // 顶部横排放置备注节点
  let noteCursorX = startX
  let maxNoteBottom = 24
  noteNodes.forEach(note => {
    const noteW = Math.max(Number(note.dimensions?.width || 0), 280)
    const noteH = Math.max(Number(note.dimensions?.height || 0), 170)
    newPositions.set(note.id, {
      x: Math.round(noteCursorX),
      y: 24,
    })
    noteCursorX += noteW + 48
    maxNoteBottom = Math.max(maxNoteBottom, 24 + noteH)
  })

  if (actionNodes.length > 0) {
    const actionIdSet = new Set(actionNodes.map(n => n.id))
    const indegree = new Map<string, number>()
    const outgoing = new Map<string, string[]>()
    const originalOrder = new Map<string, number>()

    actionNodes.forEach((n, idx) => {
      indegree.set(n.id, 0)
      outgoing.set(n.id, [])
      originalOrder.set(n.id, idx)
    })

    edges.value.forEach(edge => {
      if (!edge.source || !edge.target || edge.source === edge.target) return
      if (!actionIdSet.has(edge.source) || !actionIdSet.has(edge.target)) return
      const list = outgoing.get(edge.source)!
      if (!list.includes(edge.target)) {
        list.push(edge.target)
        indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
      }
    })

    const layerMap = new Map<string, number>()
    const queue = actionNodes.filter(n => (indegree.get(n.id) ?? 0) === 0).map(n => n.id)
    const visited = new Set<string>()

    while (queue.length > 0) {
      queue.sort((a, b) => (originalOrder.get(a) ?? 0) - (originalOrder.get(b) ?? 0))
      const currId = queue.shift()!
      if (visited.has(currId)) continue
      visited.add(currId)
      const currLayer = layerMap.get(currId) ?? 0

      for (const nextId of outgoing.get(currId) ?? []) {
        layerMap.set(nextId, Math.max(layerMap.get(nextId) ?? 0, currLayer + 1))
        const nextDeg = (indegree.get(nextId) ?? 1) - 1
        indegree.set(nextId, nextDeg)
        if (nextDeg <= 0) {
          queue.push(nextId)
        }
      }
    }

    // 处理可能存在的环路未访问节点
    let maxLayer = layerMap.size > 0 ? Math.max(...layerMap.values()) : -1
    actionNodes.forEach(n => {
      if (!visited.has(n.id)) {
        maxLayer += 1
        layerMap.set(n.id, maxLayer)
      }
    })

    // 按层归组并按原纵坐标排序
    const layers = new Map<number, GraphNode[]>()
    actionNodes.forEach(n => {
      const l = layerMap.get(n.id) ?? 0
      const group = layers.get(l) ?? []
      group.push(n)
      layers.set(l, group)
    })

    const sortedLayerIndices = Array.from(layers.keys()).sort((a, b) => a - b)
    const colGap = 96
    const rowGap = 44
    const baseY = noteNodes.length > 0 ? maxNoteBottom + 48 : 72

    const getNodeWidth = (n: GraphNode) => Math.max(Number(n.dimensions?.width || 0), 320)
    const getNodeHeight = (n: GraphNode) => Math.max(Number(n.dimensions?.height || 0), 340)

    const layerHeights = new Map<number, number>()
    const layerWidths = new Map<number, number>()
    let maxLayerHeight = 0

    sortedLayerIndices.forEach(layerIdx => {
      const group = layers.get(layerIdx)!
      group.sort((a, b) => {
        const dy = (a.position?.y ?? 0) - (b.position?.y ?? 0)
        if (Math.abs(dy) > 1) return dy
        return (originalOrder.get(a.id) ?? 0) - (originalOrder.get(b.id) ?? 0)
      })
      const totalH = group.reduce((acc, n) => acc + getNodeHeight(n), 0) + Math.max(group.length - 1, 0) * rowGap
      const maxW = Math.max(...group.map(n => getNodeWidth(n)), 320)
      layerHeights.set(layerIdx, totalH)
      layerWidths.set(layerIdx, maxW)
      maxLayerHeight = Math.max(maxLayerHeight, totalH)
    })

    let cursorX = startX
    sortedLayerIndices.forEach(layerIdx => {
      const group = layers.get(layerIdx)!
      const layerH = layerHeights.get(layerIdx) ?? 0
      const layerW = layerWidths.get(layerIdx) ?? 320
      let cursorY = baseY + Math.round((maxLayerHeight - layerH) / 2)

      group.forEach(n => {
        const nodeW = getNodeWidth(n)
        const nodeH = getNodeHeight(n)
        newPositions.set(n.id, {
          x: Math.round(cursorX + (layerW - nodeW) / 2),
          y: Math.round(cursorY),
        })
        cursorY += nodeH + rowGap
      })
      cursorX += layerW + colGap
    })
  }

  if (layoutAnimTimer) {
    clearTimeout(layoutAnimTimer)
  }
  isLayoutAnimating.value = true
  layoutAnimTimer = setTimeout(() => {
    isLayoutAnimating.value = false
    layoutAnimTimer = null
  }, 360)

  // 直接更新存活 GraphNode 的 position 并通过 updateNode 触发内部 computedPosition 重算
  nodes.value.forEach(node => {
    const pos = newPositions.get(node.id)
    if (!pos) return
    node.position = { x: pos.x, y: pos.y }
    updateNode(node.id, { position: { x: pos.x, y: pos.y } })
  })

  nextTick(() => {
    if (typeof window !== 'undefined' && typeof window.DOMMatrixReadOnly === 'function') {
      updateNodeInternals(nodes.value.map(n => n.id))
    }
    setTimeout(() => {
      fitView({ padding: 0.2, duration: 280 })
    }, 50)
  })
  $toast.success(t('dialog.workflowActions.autoLayoutSuccess'))
}

// 模拟试跑与画布逐步推演逻辑
const simulationScenarios = computed(() => [
  {
    value: 'live_dry_run' as const,
    label: t('dialog.workflowActions.simulation.scenarios.live_dry_run'),
    icon: 'mdi-radar',
  },
  {
    value: 'normal' as const,
    label: t('dialog.workflowActions.simulation.scenarios.normal'),
    icon: 'mdi-flask-outline',
  },
  {
    value: 'empty_source' as const,
    label: t('dialog.workflowActions.simulation.scenarios.empty_source'),
    icon: 'mdi-tray-remove',
  },
  {
    value: 'empty_filter' as const,
    label: t('dialog.workflowActions.simulation.scenarios.empty_filter'),
    icon: 'mdi-filter-off-outline',
  },
])

const currentScenarioIcon = computed(() => {
  return simulationScenarios.value.find(item => item.value === simulationScenario.value)?.icon || 'mdi-radar'
})

function isNoteNode(nodeId: string, simNode?: WorkflowSimulationNodeResult): boolean {
  if (simNode?.type === 'NoteAction') return true
  return nodes.value.some(n => n.id === nodeId && n.type === 'NoteAction')
}

function cleanSimulationMessage(raw?: string): string {
  if (!raw) return ''
  return raw.replace(/^\[(?:模拟|演练|演练拦截)\]\s*/, '').trim()
}

function findSimulatedEdge(edge: WorkflowEdgeLike | GraphEdge) {
  if (!simulationResult.value?.edges) return undefined
  if (edge.id && simulationResult.value.edges[edge.id]) {
    return simulationResult.value.edges[edge.id]
  }
  return Object.values(simulationResult.value.edges).find(
    item => item.source === edge.source && item.target === edge.target,
  )
}

function stopSimWalkthrough() {
  simWalkthroughToken += 1
  simTimers.forEach(timer => clearTimeout(timer))
  simTimers = []
  isSimAnimating.value = false
  activeSimNodeId.value = null
}

function buildNodeSimBadge(simNode: WorkflowSimulationNodeResult, orderIndex?: number): string {
  const prefix = orderIndex ? `#${orderIndex} ` : ''
  const chips = getSimulationOutputChips(simNode.outputs_summary)
  const mainOutput = chips[0] ? ` · ${chips[0]}` : ''

  if (simNode.dry_run_intercepted && simNode.state === 'success') {
    return `${prefix}${t('dialog.workflowActions.simulation.interceptedBadge')}${mainOutput}`
  }
  if (simNode.state === 'success') {
    return `${prefix}✓ ${chips[0] || t('dialog.workflowActions.simulation.nodeStates.success')}`
  }
  if (simNode.state === 'failed') {
    return `${prefix}✗ ${t('dialog.workflowActions.simulation.nodeStates.failed')}`
  }
  if (simNode.state === 'skipped') {
    return t('dialog.workflowActions.simulation.nodeStates.skipped')
  }
  return t('dialog.workflowActions.simulation.nodeStates.unreached')
}

function resolveNodeSimClass(simNode: WorkflowSimulationNodeResult): string {
  if (simNode.dry_run_intercepted && simNode.state === 'success') {
    return 'workflow-sim-node--intercepted'
  }
  return `workflow-sim-node--${simNode.state || 'unreached'}`
}

function applyFinalSimulationVisuals(resData: WorkflowSimulationResult) {
  const nextNodes: Record<string, { stateClass: string; badgeText: string }> = {}
  const orderMap = new Map<string, number>()
  let actionStepSeq = 0
  ;(resData.execution_order || []).forEach(id => {
    const simNode = resData.nodes?.[id]
    if (!simNode || isNoteNode(id, simNode)) return
    actionStepSeq += 1
    orderMap.set(id, actionStepSeq)
  })

  Object.values(resData.nodes || {}).forEach(simNode => {
    if (isNoteNode(simNode.id, simNode)) return
    nextNodes[simNode.id] = {
      stateClass: resolveNodeSimClass(simNode),
      badgeText: buildNodeSimBadge(simNode, orderMap.get(simNode.id)),
    }
  })

  const nextEdges: Record<string, string> = {}
  ;(edges.value || []).forEach(edge => {
    const simEdge =
      (edge.id && resData.edges?.[edge.id]) ||
      Object.values(resData.edges || {}).find(item => item.source === edge.source && item.target === edge.target)
    if (simEdge?.state) {
      nextEdges[edge.id] = simEdge.state
    }
  })

  simNodeVisuals.value = nextNodes
  simEdgeVisuals.value = nextEdges
  syncCanvasNormalization(true)
}

function playSimulationWalkthrough(resData: WorkflowSimulationResult, instant = false) {
  stopSimWalkthrough()
  const currentToken = simWalkthroughToken
  const execOrder = (resData.execution_order || []).filter(id => {
    const simNode = resData.nodes?.[id]
    return Boolean(simNode) && !isNoteNode(id, simNode)
  })

  if (instant || execOrder.length === 0) {
    applyFinalSimulationVisuals(resData)
    return
  }

  isSimAnimating.value = true
  const initialNodes: Record<string, { stateClass: string; badgeText: string }> = {}
  nodes.value.forEach(node => {
    if (node.type === 'NoteAction') return
    initialNodes[node.id] = {
      stateClass: 'workflow-sim-node--pending',
      badgeText: '',
    }
  })
  const initialEdges: Record<string, string> = {}
  edges.value.forEach(edge => {
    initialEdges[edge.id] = 'pending'
  })

  simNodeVisuals.value = initialNodes
  simEdgeVisuals.value = initialEdges
  syncCanvasNormalization(true)

  const stepInterval = 420
  execOrder.forEach((nodeId, idx) => {
    const startDelay = idx * stepInterval
    // 半拍1：流入边点亮 + 当前节点脉冲高亮执行中
    simTimers.push(
      setTimeout(() => {
        if (simWalkthroughToken !== currentToken) return
        activeSimNodeId.value = nodeId
        edges.value.forEach(edge => {
          if (edge.target === nodeId) {
            const simEdge = findSimulatedEdge(edge)
            if (simEdge?.state === 'matched') {
              simEdgeVisuals.value = { ...simEdgeVisuals.value, [edge.id]: 'matched' }
            }
          }
        })
        simNodeVisuals.value = {
          ...simNodeVisuals.value,
          [nodeId]: {
            stateClass: 'workflow-sim-node--running',
            badgeText: `#${idx + 1} ${t('dialog.workflowActions.simulation.runningBadge')}`,
          },
        }
        syncCanvasNormalization(true)
      }, startDelay),
    )

    // 半拍2：当前节点结算结果徽章 + 流出边按匹配与否分流点亮
    simTimers.push(
      setTimeout(() => {
        if (simWalkthroughToken !== currentToken) return
        const simNode = resData.nodes?.[nodeId]
        if (simNode) {
          simNodeVisuals.value = {
            ...simNodeVisuals.value,
            [nodeId]: {
              stateClass: resolveNodeSimClass(simNode),
              badgeText: buildNodeSimBadge(simNode, idx + 1),
            },
          }
        }
        edges.value.forEach(edge => {
          if (edge.source === nodeId) {
            const simEdge = findSimulatedEdge(edge)
            if (simEdge?.state) {
              simEdgeVisuals.value = { ...simEdgeVisuals.value, [edge.id]: simEdge.state }
            }
          }
        })
        syncCanvasNormalization(true)
      }, startDelay + 240),
    )
  })

  // 收尾：补齐跳过与未触达节点状态
  simTimers.push(
    setTimeout(
      () => {
        if (simWalkthroughToken !== currentToken) return
        isSimAnimating.value = false
        activeSimNodeId.value = null
        applyFinalSimulationVisuals(resData)
      },
      execOrder.length * stepInterval + 100,
    ),
  )
}

function skipSimulationAnimation() {
  if (!simulationResult.value) return
  stopSimWalkthrough()
  applyFinalSimulationVisuals(simulationResult.value)
}

function replaySimulationWalkthrough() {
  if (!simulationResult.value) return
  playSimulationWalkthrough(simulationResult.value, false)
}

function focusSimulatedNode(nodeId: string) {
  const target = nodes.value.find(n => n.id === nodeId)
  if (!target) return
  activeSimNodeId.value = nodeId
  fitView({ nodes: [nodeId], padding: 0.45, duration: 260 })
}

function applySimulationHighlights() {
  if (simulationResult.value) {
    applyFinalSimulationVisuals(simulationResult.value)
  } else {
    syncCanvasNormalization(false)
  }
}

function clearSimulation() {
  stopSimWalkthrough()
  simulationResult.value = null
  simulationPanelOpen.value = false
  simNodeVisuals.value = {}
  simEdgeVisuals.value = {}
  syncCanvasNormalization(false)
}

async function runSimulation(scenario?: WorkflowSimulationScenario) {
  if (simulationLoading.value) return
  if (scenario) {
    simulationScenario.value = scenario
  }
  closeEdgeSettings()
  nodePolicyExpanded.value = false
  stopSimWalkthrough()

  const { cleanNodes, cleanEdges } = getCleanNodesAndEdges()
  const rawId = workflowForm.value?.id
  const numericWorkflowId =
    rawId !== undefined && rawId !== null && !Number.isNaN(Number(rawId)) ? Number(rawId) : undefined

  simulationLoading.value = true
  try {
    const res: { success: boolean; message?: string; data?: WorkflowSimulationResult } = await api.post(
      'workflow/simulate',
      {
        workflow_id: numericWorkflowId,
        actions: cleanNodes,
        flows: cleanEdges,
        execution_config: workflowForm.value?.execution_config,
        scenario: simulationScenario.value,
      },
    )
    if (res.success && res.data) {
      simulationResult.value = res.data
      simulationPanelOpen.value = true
      playSimulationWalkthrough(res.data, false)
    } else {
      $toast.error(t('dialog.workflowActions.simulation.failedMessage', { message: res.message || '' }))
    }
  } catch (error: unknown) {
    console.error(error)
    const msg = error instanceof Error ? error.message : ''
    $toast.error(t('dialog.workflowActions.simulation.failedMessage', { message: msg }))
  } finally {
    simulationLoading.value = false
  }
}

// 整理模拟步骤列表（自动剔除 NoteAction 便签节点，按真实业务执行顺序连续编号）
const orderedSimulationSteps = computed<WorkflowSimulationNodeResult[]>(() => {
  if (!simulationResult.value?.nodes) return []
  const nodeMap = simulationResult.value.nodes
  const seen = new Set<string>()
  const steps: WorkflowSimulationNodeResult[] = []

  ;(simulationResult.value.execution_order || []).forEach(id => {
    const item = nodeMap[id]
    if (item && !seen.has(id) && !isNoteNode(id, item)) {
      seen.add(id)
      steps.push(item)
    }
  })

  Object.values(nodeMap).forEach(item => {
    if (!seen.has(item.id) && !isNoteNode(item.id, item)) {
      seen.add(item.id)
      steps.push(item)
    }
  })
  return steps
})

// 面板核心统计指标（剔除备注节点）
const simulationKpi = computed(() => {
  const steps = orderedSimulationSteps.value
  let success = 0
  let intercepted = 0
  let skippedOrUnreached = 0
  let failed = 0
  steps.forEach(step => {
    if (step.state === 'failed') {
      failed += 1
    } else if (step.state === 'success') {
      success += 1
      if (step.dry_run_intercepted) {
        intercepted += 1
      }
    } else {
      skippedOrUnreached += 1
    }
  })
  return {
    total: steps.length,
    success,
    intercepted,
    skippedOrUnreached,
    failed,
  }
})

function resolveSimNodeBadge(step: WorkflowSimulationNodeResult) {
  if (step.dry_run_intercepted && step.state === 'success') {
    return {
      color: 'info',
      icon: 'mdi-shield-check-outline',
      text: t('dialog.workflowActions.simulation.interceptedBadge'),
    }
  }
  const map: Record<string, { color: string; icon: string; text: string }> = {
    success: {
      color: 'success',
      icon: 'mdi-check-circle-outline',
      text: t('dialog.workflowActions.simulation.nodeStates.success'),
    },
    failed: {
      color: 'error',
      icon: 'mdi-alert-circle-outline',
      text: t('dialog.workflowActions.simulation.nodeStates.failed'),
    },
    skipped: {
      color: 'secondary',
      icon: 'mdi-debug-step-over',
      text: t('dialog.workflowActions.simulation.nodeStates.skipped'),
    },
    unreached: {
      color: 'default',
      icon: 'mdi-minus-circle-outline',
      text: t('dialog.workflowActions.simulation.nodeStates.unreached'),
    },
  }
  return map[step.state] || map.unreached
}

function getSimulationOutputChips(outputs?: Record<string, number>) {
  if (!outputs || typeof outputs !== 'object') return []
  const supported = ['torrents', 'medias', 'downloads', 'fileitems', 'subscribes', 'sites'] as const
  const result: string[] = []
  supported.forEach(key => {
    const count = Number(outputs[key])
    if (Number.isFinite(count) && count > 0) {
      result.push(t(`dialog.workflowExecution.outputs.${key}`, { count }))
    }
  })
  return result
}

// 自定义节点类型
const nodeTypes = ref<Record<string, Component>>({})

// 自动扫描目录下所有的 .vue 文件
const components = import.meta.glob<{ default: Component }>('../workflow/*Action.vue')

// 动态加载某个组件
const loadComponent = async (componentName: string): Promise<Component> => {
  const component = components[`../workflow/${componentName}.vue`]
  if (component) {
    return (await component()).default
  }
  throw new Error(t('dialog.workflowActions.componentNotFound', { component: componentName }))
}

// 将所有 components 中的组件加载到 nodeTypes 中
for (const path in components) {
  const componentName = path.match(/\.\/workflow\/(.*).vue$/)?.[1]
  if (!componentName) {
    continue
  }
  loadComponent(componentName).then(component => {
    nodeTypes.value[componentName] = markRaw(component)
  })
}

// 加载动作契约，供边条件构造器使用
async function loadActionDefinitions() {
  try {
    const actionList = await api.get('workflow/actions')
    actionDefinitions.value = Array.isArray(actionList) ? actionList : []
  } catch (error) {
    console.error(error)
    actionDefinitions.value = []
  }
}

// 生成节点 ID
function getId() {
  return 'act_' + Math.random().toString(36).slice(2, 11)
}

// 处理侧边栏点击/快捷添加组件事件
let quickAddCascade = 0
function handleComponentClick(action: {
  name: string
  type: string
  desc?: string
  description?: string
  data?: Record<string, unknown>
}) {
  const centerX = window.innerWidth / 2
  const centerY = window.innerHeight / 3

  const basePos = screenToFlowCoordinate({
    x: centerX,
    y: centerY,
  })

  const hasOverlap = nodes.value.some(
    n => Math.abs((n.position?.x ?? 0) - basePos.x) < 40 && Math.abs((n.position?.y ?? 0) - basePos.y) < 40,
  )
  quickAddCascade = hasOverlap ? (quickAddCascade + 1) % 8 : 0

  const nodeId = getId()
  const newNode: WorkflowNodeLike = {
    id: nodeId,
    type: action.type,
    name: action.name,
    description: action.description || action.desc || '',
    position: {
      x: basePos.x + quickAddCascade * 28,
      y: basePos.y + quickAddCascade * 28,
    },
    data: action.data ? cloneDeep(action.data) : {},
  }

  addNodes(normalizeWorkflowNode(newNode, Boolean(simulationResult.value)) as unknown as Node)
  $toast.success(t('dialog.workflowActions.componentAdded'))
}

// 保存处理中状态
const saving = ref(false)

// 调用 API 保存工作流流程（不替换存活 GraphNode 实例，保持画布拖拽与自动排版响应性）
async function updateWorkflow() {
  if (saving.value) return
  const { cleanNodes, cleanEdges } = getCleanNodesAndEdges()
  workflowForm.value.actions = cleanNodes
  workflowForm.value.flows = cleanEdges

  saving.value = true
  try {
    const result: { [key: string]: string } = await api.put(`workflow/${workflowForm.value.id}`, workflowForm.value)
    if (result.success) {
      savedSnapshot.value = computeCanvasSignature()
      if (simulationResult.value) {
        applySimulationHighlights()
      } else {
        syncCanvasNormalization(false)
      }
      $toast.success(t('dialog.workflowActions.saveSuccess'))
      emit('save')
    } else {
      $toast.error(t('dialog.workflowActions.saveFailed', { message: result.message }))
    }
  } catch (error) {
    console.error(error)
    $toast.error(
      t('dialog.workflowActions.saveFailed', {
        message: error instanceof Error ? error.message : t('common.error'),
      }),
    )
  } finally {
    saving.value = false
  }
}

// 未保存变更拦截关闭
async function handleClose() {
  if (saving.value) return
  if (isDirty.value) {
    const confirmed = await createConfirm({
      title: t('dialog.workflowActions.unsavedConfirmTitle'),
      content: t('dialog.workflowActions.unsavedConfirmContent'),
    })
    if (!confirmed) return
  }
  emit('close')
}

// Ctrl/Cmd + S 快捷保存
function handleKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    if (!saving.value) {
      updateWorkflow()
    }
  }
}

// 通过 VueFlow 官方 setNodes/setEdges 初始化画布元素，确保生成合法的 handleBounds 与 computedPosition
function applyCanvasElements(rawNodes: WorkflowNodeLike[] | GraphNode[], rawEdges: WorkflowEdgeLike[] | GraphEdge[]) {
  const normalizedNodes = (rawNodes || []).map(n => normalizeWorkflowNode(n, false)) as unknown as Node[]
  const normalizedEdges = (rawEdges || []).map(e => normalizeWorkflowEdge(e, false)) as unknown as Edge[]
  if (normalizedNodes.length > 0) {
    setNodes(normalizedNodes)
  } else {
    nodes.value = []
  }
  if (normalizedEdges.length > 0) {
    setEdges(normalizedEdges)
  } else {
    edges.value = []
  }
}

// 保存导入的代码，直接覆盖原有值
function saveCodeString(type: string, code: { value?: string } | null | undefined) {
  try {
    if (code?.value) {
      const codeObject = JSON.parse(code.value) as {
        actions?: GraphNode[]
        flows?: GraphEdge[]
        execution_config?: Record<string, unknown>
      }
      if (type === 'workflow') {
        clearSimulation()
        applyCanvasElements(codeObject.actions || [], codeObject.flows || [])
        if (codeObject.execution_config) {
          workflowForm.value.execution_config = codeObject.execution_config
        }
      }
      importCodeDialog.value = false
      $toast.success(t('dialog.workflowActions.importSuccess'))
    }
  } catch (error) {
    $toast.error(t('dialog.workflowActions.importFailed'))
    console.error(error)
  }
}

// 复制工作流程 JSON
async function shareWorkflow() {
  const { cleanNodes, cleanEdges } = getCleanNodesAndEdges()
  const codeString = JSON.stringify({
    actions: cleanNodes,
    flows: cleanEdges,
    execution_config: workflowForm.value.execution_config,
  })
  try {
    const copied = await copyToClipboard(codeString)
    if (copied) {
      $toast.success(t('dialog.workflowActions.codeCopied'))
    } else {
      $toast.error(t('common.error'))
    }
  } catch (error) {
    console.error(error)
    $toast.error(t('common.error'))
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  loadActionDefinitions()
  if (props.workflow) {
    workflowForm.value = cloneDeep(props.workflow)
    applyCanvasElements(cloneDeep(props.workflow.actions ?? []), cloneDeep(props.workflow.flows ?? []))
  }
  nextTick(() => {
    savedSnapshot.value = computeCanvasSignature()
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  stopSimWalkthrough()
  if (layoutAnimTimer) {
    clearTimeout(layoutAnimTimer)
    layoutAnimTimer = null
  }
})

watch(
  () => (edges.value || []).map(e => e.id).join(','),
  () => {
    if (selectedEdgeId.value && !selectedEdge.value) {
      closeEdgeSettings()
    }
  },
)

watch(
  () => (nodes.value || []).map(n => `${n.id}:${n.type || ''}`).join(','),
  () => {
    if (selectedEdge.value && !canConfigureEdge(selectedEdge.value)) {
      closeEdgeSettings()
    }
    if (selectedNodeId.value && !selectedNode.value) {
      closeNodePolicy()
    }
  },
)

// 判断是不是 MACOS
const isMacOS = computed(() => {
  return /Macintosh|MacIntel|MacPPC|Mac68K/.test(navigator.userAgent)
})
</script>

<template>
  <VDialog
    scrollable
    fullscreen
    persistent
    :scrim="false"
    transition="dialog-bottom-transition"
    @keydown.esc.prevent="handleClose"
  >
    <VCard class="workflow-dialog">
      <!-- Toolbar: Antigravity IDE solid header -->
      <VToolbar density="comfortable" class="workflow-toolbar px-2">
        <VBtn
          icon
          variant="text"
          size="small"
          class="workflow-toolbar__close"
          @click="handleClose"
          :aria-label="t('common.close')"
        >
          <VIcon size="20" icon="mdi-close" />
        </VBtn>

        <VToolbarTitle class="workflow-toolbar__title ms-1">
          <span class="workflow-toolbar__name">{{ t('dialog.workflowActions.title') }} - {{ workflow?.name }}</span>
          <VChip v-if="isDirty" size="x-small" color="warning" variant="tonal" class="ms-2 workflow-unsaved-chip">
            {{ t('dialog.workflowActions.unsavedBadge') }}
          </VChip>
        </VToolbarTitle>

        <div class="workflow-toolbar__actions">
          <!-- 一体化模拟试跑胶囊按钮组 -->
          <div class="workflow-sim-pill" :class="{ 'workflow-sim-pill--loading': simulationLoading }">
            <button
              type="button"
              class="workflow-sim-pill__main"
              :disabled="simulationLoading"
              @click="runSimulation()"
            >
              <VProgressCircular v-if="simulationLoading" indeterminate size="15" width="2" color="primary" />
              <VIcon v-else icon="mdi-play-speed" size="17" class="workflow-sim-pill__icon" />
              <span class="d-none d-sm-inline">{{ t('dialog.workflowActions.simulation.runBtn') }}</span>
            </button>

            <VMenu location="bottom end" :offset="6">
              <template #activator="{ props: menuProps }">
                <button
                  v-bind="menuProps"
                  type="button"
                  class="workflow-sim-pill__menu"
                  :disabled="simulationLoading"
                  :aria-label="t('dialog.workflowActions.simulation.runBtn')"
                >
                  <VIcon icon="mdi-chevron-down" size="16" />
                </button>
              </template>
              <VList density="compact" class="workflow-sim-menu-list py-1">
                <VListItem
                  v-for="item in simulationScenarios"
                  :key="item.value"
                  :active="simulationScenario === item.value"
                  color="primary"
                  rounded="lg"
                  class="mx-1 my-0"
                  @click="runSimulation(item.value)"
                >
                  <template #prepend>
                    <VIcon :icon="item.icon" size="17" class="me-2" />
                  </template>
                  <VListItemTitle class="text-body-2">{{ item.label }}</VListItemTitle>
                  <template v-if="simulationScenario === item.value" #append>
                    <VIcon icon="mdi-check" size="16" color="primary" />
                  </template>
                </VListItem>
              </VList>
            </VMenu>
          </div>

          <!-- 画布辅助图标工具舱 -->
          <div class="workflow-canvas-tools">
            <button
              type="button"
              class="workflow-canvas-tools__btn"
              :aria-label="t('dialog.workflowActions.autoLayout')"
              @click="autoLayoutWorkflow"
            >
              <VIcon size="18" icon="mdi-sitemap-outline" />
              <VTooltip activator="parent" location="bottom">{{ t('dialog.workflowActions.autoLayout') }}</VTooltip>
            </button>

            <button
              type="button"
              class="workflow-canvas-tools__btn"
              :aria-label="t('dialog.workflowActions.importTooltip')"
              @click="importCodeDialog = true"
            >
              <VIcon size="18" icon="mdi-import" />
              <VTooltip activator="parent" location="bottom">{{ t('dialog.workflowActions.importTooltip') }}</VTooltip>
            </button>

            <button
              type="button"
              class="workflow-canvas-tools__btn"
              :aria-label="t('dialog.workflowActions.exportTooltip')"
              @click="shareWorkflow"
            >
              <VIcon size="18" icon="mdi-code-json" />
              <VTooltip activator="parent" location="bottom">{{ t('dialog.workflowActions.exportTooltip') }}</VTooltip>
            </button>
          </div>

          <!-- 主操作：保存流程按钮 -->
          <VBtn
            color="primary"
            variant="flat"
            size="small"
            class="workflow-save-pill"
            :loading="saving"
            :disabled="saving"
            :aria-label="t('dialog.workflowActions.saveTooltip')"
            @click="updateWorkflow"
          >
            <template #prepend>
              <VIcon size="17" icon="mdi-content-save-outline" />
            </template>
            <span class="d-none d-md-inline">{{ t('dialog.workflowActions.simulation.saveBtn') }}</span>
            <span v-if="isDirty" class="workflow-save-pill__dot ms-1" />
            <VTooltip activator="parent" location="bottom">{{ t('dialog.workflowActions.saveTooltip') }}</VTooltip>
          </VBtn>
        </div>
      </VToolbar>

      <VCardText class="workflow-content pa-0">
        <div
          class="workflow-canvas"
          :class="{ 'workflow-canvas--layout-animating': isLayoutAnimating }"
          :style="{ '--workflow-controls-offset': isSidebarCollapsed ? '86px' : '296px' }"
          @drop="onDrop"
        >
          <VueFlow
            :nodes="nodes"
            :edges="edges"
            :node-types="nodeTypes"
            :is-valid-connection="isValidConnection"
            :default-edge-options="{ type: 'animation', animated: true }"
            :edge-updater-radius="10"
            @dragover="onDragOver"
            @dragleave="onDragLeave"
            @node-click="handleNodeClick"
            @edge-click="handleEdgeClick"
            @pane-click="handlePaneClick"
            :delete-key-code="isMacOS ? 'Backspace' : 'Delete'"
            auto-connect
          >
            <Controls position="bottom-left" :show-interactive="false" />
            <MiniMap />
            <DropzoneBackground
              :style="{
                backgroundColor: isDragOver ? 'rgba(var(--v-theme-primary), 0.08)' : 'transparent',
                transition: 'background-color 0.2s ease',
              }"
            />
          </VueFlow>

          <!-- 紧凑不遮挡的节点运行策略胶囊与展开面板 -->
          <div v-if="selectedNode && !selectedEdge && !simulationPanelOpen" class="workflow-node-policy-dock">
            <div class="workflow-node-policy-bar">
              <div class="workflow-node-policy-bar__info">
                <VIcon icon="mdi-tune-variant" size="16" color="primary" />
                <span class="workflow-node-policy-bar__name">{{ getNodeName(selectedNode.id) }}</span>
                <VChip
                  v-for="badge in selectedNodePolicyBadges"
                  :key="badge"
                  size="x-small"
                  color="primary"
                  variant="tonal"
                >
                  {{ badge }}
                </VChip>
              </div>
              <div class="workflow-node-policy-bar__btns">
                <VBtn
                  size="x-small"
                  color="primary"
                  :variant="nodePolicyExpanded ? 'flat' : 'tonal'"
                  :append-icon="nodePolicyExpanded ? 'mdi-chevron-up' : 'mdi-chevron-down'"
                  @click="nodePolicyExpanded = !nodePolicyExpanded"
                >
                  {{ t('dialog.workflowActions.nodePolicy.chipButton') }}
                </VBtn>
                <IconBtn size="x-small" @click="closeNodePolicy">
                  <VIcon icon="mdi-close" size="16" />
                </IconBtn>
              </div>
            </div>

            <VExpandTransition>
              <div v-if="nodePolicyExpanded" class="workflow-node-policy-panel mt-2">
                <div class="edge-panel-header">
                  <div class="edge-panel-title">
                    <VIcon icon="mdi-cog-play-outline" size="19" />
                    <span>{{ t('dialog.workflowActions.nodePolicy.title') }}</span>
                  </div>
                </div>

                <VSelect
                  v-model="nodePolicyForm.fail_policy"
                  :items="failPolicyOptions"
                  :label="t('dialog.workflowActions.nodePolicy.failPolicy')"
                  item-title="title"
                  item-value="value"
                  variant="outlined"
                  density="compact"
                  hide-details
                />

                <VSelect
                  v-model="nodePolicyForm.join_policy"
                  :items="joinPolicyOptions"
                  :label="t('dialog.workflowActions.nodePolicy.joinPolicy')"
                  item-title="title"
                  item-value="value"
                  variant="outlined"
                  density="compact"
                  hide-details
                />

                <div class="workflow-node-policy-grid">
                  <VTextField
                    v-model.number="nodePolicyForm.max_attempts"
                    type="number"
                    min="1"
                    :label="t('dialog.workflowActions.nodePolicy.maxAttempts')"
                    variant="outlined"
                    density="compact"
                    hide-details
                  />
                  <VTextField
                    v-model.number="nodePolicyForm.retry_interval"
                    type="number"
                    min="0"
                    :label="t('dialog.workflowActions.nodePolicy.retryInterval')"
                    variant="outlined"
                    density="compact"
                    hide-details
                  />
                </div>

                <VTextField
                  v-model.number="nodePolicyForm.timeout"
                  type="number"
                  min="1"
                  clearable
                  :label="t('dialog.workflowActions.nodePolicy.timeout')"
                  variant="outlined"
                  density="compact"
                  hide-details
                />

                <div class="edge-panel-actions pt-1">
                  <VBtn
                    variant="tonal"
                    color="error"
                    size="small"
                    prepend-icon="mdi-delete-outline"
                    @click="deleteSelectedNode"
                  >
                    {{ t('dialog.workflowActions.nodePolicy.deleteNode') }}
                  </VBtn>
                  <VSpacer />
                  <VBtn color="primary" size="small" @click="saveNodePolicy">
                    {{ t('dialog.workflowActions.nodePolicy.apply') }}
                  </VBtn>
                </div>
              </div>
            </VExpandTransition>
          </div>

          <!-- 流程边条件面板 -->
          <div v-if="selectedEdge" class="workflow-edge-panel">
            <div class="edge-panel-header">
              <div class="edge-panel-title">
                <VIcon icon="mdi-source-branch" size="19" />
                <span>{{ t('dialog.workflowActions.edgeSettingsTitle') }}</span>
              </div>
              <VBtn icon variant="text" size="small" @click="closeEdgeSettings">
                <VIcon icon="mdi-close" size="18" />
              </VBtn>
            </div>

            <div class="edge-route">
              <span>{{ getNodeName(selectedEdge.source) }}</span>
              <VIcon icon="mdi-arrow-right" size="16" />
              <span>{{ getNodeName(selectedEdge.target) }}</span>
            </div>

            <VSelect
              v-model="edgeForm.condition"
              :items="edgeConditionOptions"
              :label="t('dialog.workflowActions.edgeConditionLabel')"
              clearable
              item-title="title"
              item-value="value"
              variant="outlined"
              density="compact"
              hide-details="auto"
            />

            <div class="edge-panel-actions">
              <VBtn icon variant="text" color="error" size="small" @click="deleteSelectedEdge">
                <VIcon icon="mdi-delete" size="18" />
              </VBtn>
              <VSpacer />
              <VBtn variant="text" size="small" @click="closeEdgeSettings">
                {{ t('dialog.workflowActions.edgeCancel') }}
              </VBtn>
              <VBtn color="primary" size="small" @click="saveEdgeSettings">
                {{ t('dialog.workflowActions.edgeSave') }}
              </VBtn>
            </div>
          </div>

          <!-- 模拟试跑报告面板（三段式精炼布局） -->
          <div v-if="simulationPanelOpen && simulationResult" class="workflow-simulation-panel">
            <!-- 1. 面板顶栏 -->
            <div class="sim-panel-header">
              <div class="sim-panel-header__title">
                <span
                  class="sim-status-dot"
                  :class="simulationResult.success ? 'sim-status-dot--ok' : 'sim-status-dot--err'"
                />
                <span>{{ t('dialog.workflowActions.simulation.panelTitle') }}</span>
                <span class="sim-safe-pill">
                  <VIcon icon="mdi-shield-check-outline" size="13" />
                  {{ t('dialog.workflowActions.simulation.zeroSideEffectBadge') }}
                  <VTooltip activator="parent" location="bottom" max-width="260">
                    {{ t('dialog.workflowActions.simulation.disclaimer') }}
                  </VTooltip>
                </span>
              </div>

              <div class="sim-panel-header__actions">
                <button
                  v-if="isSimAnimating"
                  type="button"
                  class="sim-icon-action"
                  :aria-label="t('dialog.workflowActions.simulation.skipAnimBtn')"
                  @click="skipSimulationAnimation"
                >
                  <VIcon icon="mdi-fast-forward-outline" size="16" />
                  <VTooltip activator="parent" location="bottom">
                    {{ t('dialog.workflowActions.simulation.skipAnimBtn') }}
                  </VTooltip>
                </button>
                <button
                  v-else
                  type="button"
                  class="sim-icon-action"
                  :aria-label="t('dialog.workflowActions.simulation.replayBtn')"
                  @click="replaySimulationWalkthrough"
                >
                  <VIcon icon="mdi-replay" size="16" />
                  <VTooltip activator="parent" location="bottom">
                    {{ t('dialog.workflowActions.simulation.replayBtn') }}
                  </VTooltip>
                </button>

                <button
                  type="button"
                  class="sim-icon-action"
                  :aria-label="t('dialog.workflowActions.simulation.clearHighlight')"
                  @click="clearSimulation"
                >
                  <VIcon icon="mdi-layers-off-outline" size="16" />
                  <VTooltip activator="parent" location="bottom">
                    {{ t('dialog.workflowActions.simulation.clearHighlight') }}
                  </VTooltip>
                </button>

                <button
                  type="button"
                  class="sim-icon-action"
                  :aria-label="t('common.close')"
                  @click="simulationPanelOpen = false"
                >
                  <VIcon icon="mdi-close" size="17" />
                </button>
              </div>
            </div>

            <!-- 2. 紧凑场景切换 + 核心指标条 -->
            <div class="sim-panel-controls">
              <div class="sim-scenario-bar">
                <VSelect
                  :model-value="simulationScenario"
                  :items="simulationScenarios"
                  item-title="label"
                  item-value="value"
                  variant="outlined"
                  density="compact"
                  hide-details
                  :disabled="simulationLoading"
                  class="sim-scenario-select"
                  @update:model-value="val => runSimulation(val as WorkflowSimulationScenario)"
                >
                  <template #prepend-inner>
                    <VIcon :icon="currentScenarioIcon" size="16" color="primary" />
                  </template>
                </VSelect>

                <VBtn
                  icon
                  variant="tonal"
                  color="primary"
                  size="small"
                  class="sim-rerun-btn"
                  :loading="simulationLoading"
                  :aria-label="t('dialog.workflowActions.simulation.rerunBtn')"
                  @click="runSimulation()"
                >
                  <VIcon icon="mdi-refresh" size="17" />
                  <VTooltip activator="parent" location="bottom">
                    {{ t('dialog.workflowActions.simulation.rerunBtn') }}
                  </VTooltip>
                </VBtn>
              </div>

              <div class="sim-kpi-grid">
                <div class="sim-kpi-item">
                  <span class="sim-kpi-item__val">{{ simulationKpi.total }}</span>
                  <span class="sim-kpi-item__lbl">{{ t('dialog.workflowActions.simulation.kpiTotal') }}</span>
                </div>
                <div class="sim-kpi-item sim-kpi-item--success">
                  <span class="sim-kpi-item__val">{{ simulationKpi.success }}</span>
                  <span class="sim-kpi-item__lbl">{{ t('dialog.workflowActions.simulation.kpiSuccess') }}</span>
                </div>
                <div v-if="simulationKpi.intercepted > 0" class="sim-kpi-item sim-kpi-item--info">
                  <span class="sim-kpi-item__val">{{ simulationKpi.intercepted }}</span>
                  <span class="sim-kpi-item__lbl">{{ t('dialog.workflowActions.simulation.kpiIntercepted') }}</span>
                </div>
                <div v-else class="sim-kpi-item">
                  <span class="sim-kpi-item__val">{{ simulationKpi.skippedOrUnreached }}</span>
                  <span class="sim-kpi-item__lbl">{{ t('dialog.workflowActions.simulation.kpiSkipped') }}</span>
                </div>
              </div>

              <div v-if="!simulationResult.success" class="sim-failure-banner">
                <VIcon icon="mdi-alert-circle-outline" size="15" />
                <span>{{ simulationResult.summary }}</span>
              </div>
            </div>

            <!-- 3. 滚动内容区：诊断告警 + 时间轴步骤明细 -->
            <div class="sim-panel-scroll">
              <div v-if="simulationResult.diagnostics?.length" class="workflow-sim-section">
                <div class="workflow-sim-section__title">
                  {{
                    t('dialog.workflowActions.simulation.diagnosticsTitle', {
                      count: simulationResult.diagnostics.length,
                    })
                  }}
                </div>
                <div class="workflow-sim-diagnostics">
                  <div
                    v-for="(diag, idx) in simulationResult.diagnostics"
                    :key="idx"
                    class="workflow-sim-diag"
                    :class="`workflow-sim-diag--${diag.level}`"
                  >
                    <VIcon
                      :icon="
                        diag.level === 'error'
                          ? 'mdi-close-circle-outline'
                          : diag.level === 'warning'
                            ? 'mdi-alert-outline'
                            : 'mdi-information-outline'
                      "
                      size="15"
                      class="mt-0.5 flex-shrink-0"
                    />
                    <div>
                      <strong v-if="diag.node_id" class="me-1">[{{ getNodeName(diag.node_id) }}]</strong>
                      <span>{{ diag.message }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="workflow-sim-section">
                <div class="workflow-sim-section__title">
                  {{ t('dialog.workflowActions.simulation.stepsTitle') }}
                </div>
                <div v-if="orderedSimulationSteps.length > 0" class="workflow-sim-timeline">
                  <div
                    v-for="(step, idx) in orderedSimulationSteps"
                    :key="step.id"
                    class="workflow-sim-step"
                    :class="[
                      `workflow-sim-step--state-${step.dry_run_intercepted && step.state === 'success' ? 'intercepted' : step.state}`,
                      { 'workflow-sim-step--active': activeSimNodeId === step.id },
                    ]"
                    @click="focusSimulatedNode(step.id)"
                  >
                    <div class="workflow-sim-step__rail">
                      <span class="workflow-sim-step__index">{{ idx + 1 }}</span>
                      <span v-if="idx < orderedSimulationSteps.length - 1" class="workflow-sim-step__line" />
                    </div>

                    <div class="workflow-sim-step__body">
                      <div class="workflow-sim-step__head">
                        <span class="workflow-sim-step__name">
                          {{ actionStepDict[step.name] || step.name || step.id }}
                        </span>
                        <span
                          class="workflow-sim-step__badge"
                          :class="`workflow-sim-step__badge--${resolveSimNodeBadge(step).color}`"
                        >
                          <VIcon :icon="resolveSimNodeBadge(step).icon" size="12" />
                          {{ resolveSimNodeBadge(step).text }}
                        </span>
                      </div>

                      <div
                        v-if="getSimulationOutputChips(step.outputs_summary).length > 0"
                        class="workflow-sim-step__outputs"
                      >
                        <span
                          v-for="chip in getSimulationOutputChips(step.outputs_summary)"
                          :key="chip"
                          class="workflow-sim-output-pill"
                        >
                          {{ chip }}
                        </span>
                      </div>

                      <div v-if="step.message" class="workflow-sim-step__msg">
                        {{ cleanSimulationMessage(step.message) }}
                      </div>

                      <div v-if="step.preview_items?.length" class="workflow-sim-step__previews">
                        <div class="workflow-sim-step__previews-head">
                          {{
                            t('dialog.workflowActions.simulation.previewItemsTitle', {
                              count: step.preview_items.length,
                            })
                          }}
                        </div>
                        <div v-for="(item, pIdx) in step.preview_items" :key="pIdx" class="workflow-sim-preview-item">
                          <div class="workflow-sim-preview-item__title" :title="item.title">
                            {{ item.title }}
                          </div>
                          <div v-if="item.subtitle" class="workflow-sim-preview-item__sub">
                            {{ item.subtitle }}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div v-else class="text-caption text-medium-emphasis py-2">
                  {{ t('dialog.workflowActions.simulation.noSteps') }}
                </div>
              </div>
            </div>
          </div>

          <WorkflowSidebar
            @component-click="handleComponentClick"
            @collapse-change="val => (isSidebarCollapsed = val)"
          />
        </div>
      </VCardText>
    </VCard>

    <ImportCodeDialog
      v-if="importCodeDialog"
      v-model="importCodeDialog"
      :title="t('dialog.workflowActions.importTitle')"
      data-type="workflow"
      @close="importCodeDialog = false"
      @save="saveCodeString"
    />
  </VDialog>
</template>

<style lang="scss">
@import '@vue-flow/core/dist/style.css';
@import '@vue-flow/core/dist/theme-default.css';
@import '@vue-flow/controls/dist/style.css';
@import '@vue-flow/minimap/dist/style.css';
@import '@vue-flow/node-resizer/dist/style.css';

.workflow-dialog {
  display: flex;
  overflow: hidden;
  flex-direction: column;
  background-color: var(--mp-canvas-bg);
  block-size: 100%;
}

.workflow-toolbar.v-toolbar {
  border-block-end: 1px solid var(--mp-border-card, rgba(var(--v-theme-on-surface), 0.1));
  background: rgb(var(--v-theme-surface)) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
}

.workflow-toolbar__close {
  color: rgba(var(--v-theme-on-surface), 0.78) !important;
}

.workflow-toolbar__title {
  display: flex;
  min-inline-size: 0;
  align-items: center;
}

.workflow-toolbar__name {
  overflow: hidden;
  color: rgb(var(--v-theme-on-surface));
  font-size: 15px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-toolbar__actions {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
  padding-inline-end: 6px;
}

.workflow-sim-pill {
  display: inline-flex;
  overflow: hidden;
  align-items: stretch;
  border: 1px solid var(--mp-border-card, rgba(var(--v-theme-on-surface), 0.12));
  border-radius: 8px;
  background-color: rgba(var(--v-theme-on-surface), 0.025);
  block-size: 34px;
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease;

  &:hover {
    border-color: var(--mp-border-hover, rgba(var(--v-theme-on-surface), 0.22));
  }

  &--loading {
    opacity: 0.82;
  }

  &__icon {
    color: rgb(var(--v-theme-primary));
  }

  &__main {
    display: inline-flex;
    align-items: center;
    border: none;
    background: transparent;
    color: rgb(var(--v-theme-on-surface));
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    gap: 6px;
    letter-spacing: 0.01em;
    padding-inline: 12px 10px;
    transition: background-color 0.16s ease;
    white-space: nowrap;

    &:hover:not(:disabled) {
      background-color: rgba(var(--v-theme-on-surface), 0.05);
    }

    &:disabled {
      cursor: default;
    }
  }

  &__menu {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-inline-start: 1px solid var(--mp-border-card, rgba(var(--v-theme-on-surface), 0.12));
    background: transparent;
    color: rgba(var(--v-theme-on-surface), 0.78);
    cursor: pointer;
    inline-size: 28px;
    transition: background-color 0.16s ease;

    &:hover:not(:disabled) {
      background-color: rgba(var(--v-theme-on-surface), 0.06);
      color: rgb(var(--v-theme-on-surface));
    }

    &:disabled {
      cursor: default;
    }
  }
}

.workflow-sim-menu-list {
  min-inline-size: 236px;
}

.workflow-canvas-tools {
  display: inline-flex;
  align-items: center;
  padding: 2px;
  border: 1px solid var(--mp-border-card, rgba(var(--v-theme-on-surface), 0.12));
  border-radius: 8px;
  background-color: rgba(var(--v-theme-on-surface), 0.025);
  block-size: 34px;
  gap: 2px;

  &__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 6px;
    background: transparent;
    block-size: 28px;
    color: rgba(var(--v-theme-on-surface), 0.78);
    cursor: pointer;
    inline-size: 28px;
    transition:
      background-color 0.16s ease,
      color 0.16s ease;

    &:hover {
      background-color: rgba(var(--v-theme-on-surface), 0.07);
      color: rgb(var(--v-theme-on-surface));
    }
  }
}

.workflow-save-pill {
  border-radius: 8px !important;
  block-size: 34px !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  padding-inline: 14px !important;

  &__dot {
    display: inline-block;
    border-radius: 50%;
    background-color: rgb(var(--v-theme-warning));
    block-size: 7px;
    inline-size: 7px;
  }
}

.workflow-content {
  position: relative;
  overflow: hidden;
  flex: 1;
  background-color: var(--mp-canvas-bg);
}

.workflow-canvas {
  position: relative;
  background-color: var(--mp-canvas-bg);
  block-size: 100%;
  inline-size: 100%;
}

.vue-flow__controls {
  border-radius: var(--app-control-radius);
  overflow: hidden;
  background-color: rgb(var(--v-theme-surface));
  box-shadow: 0 2px 12px rgba(0, 0, 0, 12%);
  inset-block-end: 20px !important;
  inset-inline-start: var(--workflow-controls-offset, 296px) !important;
  transition: inset-inline-start 0.25s ease;

  .vue-flow__controls-button {
    border-block-end-color: rgba(var(--v-theme-on-surface), 0.08);
    background-color: rgb(var(--v-theme-surface));
    color: rgb(var(--v-theme-on-surface));
    fill: currentcolor;

    &:hover {
      background-color: rgba(var(--v-theme-primary), 0.1);
    }
  }
}

.workflow-node-policy-dock {
  position: absolute;
  z-index: 120;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  inset-block-start: 16px;
  inset-inline-end: 20px;
  max-inline-size: min(370px, calc(100vw - 32px));
}

.workflow-node-policy-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border: 1px solid rgba(var(--v-theme-primary), 0.25);
  border-radius: 999px;
  background-color: rgb(var(--v-theme-surface));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 10%);
  gap: 10px;
}

.workflow-node-policy-bar__info {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  gap: 6px;
}

.workflow-node-policy-bar__name {
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  max-inline-size: 140px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-node-policy-bar__btns {
  display: flex;
  align-items: center;
  gap: 4px;
}

.workflow-node-policy-panel,
.workflow-edge-panel {
  display: flex;
  flex-direction: column;
  padding: 16px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: var(--app-control-radius);
  background-color: rgb(var(--v-theme-surface));
  box-shadow: 0 8px 28px rgba(0, 0, 0, 14%);
  gap: 12px;
  inline-size: min(370px, calc(100vw - 32px));
  overflow-y: auto;
}

.workflow-simulation-panel {
  display: flex;
  overflow: hidden;
  flex-direction: column;
  border: 1px solid var(--mp-border-card, rgba(var(--v-theme-on-surface), 0.12));
  border-radius: 12px;
  background-color: rgb(var(--v-theme-surface));
  box-shadow: var(--app-overlay-shadow);
  inline-size: min(384px, calc(100vw - 32px));
}

.workflow-edge-panel,
.workflow-simulation-panel {
  position: absolute;
  z-index: 120;
  inset-block-start: 16px;
  inset-inline-end: 20px;
  max-block-size: calc(100% - 36px);
}

.workflow-node-policy-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.edge-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.edge-panel-title {
  display: flex;
  align-items: center;
  color: rgb(var(--v-theme-on-surface));
  font-size: 15px;
  font-weight: 600;
  gap: 8px;
}

.edge-route {
  display: flex;
  align-items: center;
  border-radius: 6px;
  background-color: rgba(var(--v-theme-primary), 0.08);
  color: rgb(var(--v-theme-on-surface));
  font-size: 13px;
  gap: 8px;
  padding-block: 8px;
  padding-inline: 10px;

  span {
    overflow: hidden;
    flex: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.edge-panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

// 模拟演练面板：三段式紧凑现代布局
.sim-panel-header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 10px;
  border-block-end: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  gap: 8px;

  &__title {
    display: flex;
    min-inline-size: 0;
    align-items: center;
    color: rgb(var(--v-theme-on-surface));
    font-size: 14.5px;
    font-weight: 700;
    gap: 7px;
  }

  &__actions {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 2px;
  }
}

.sim-status-dot {
  flex-shrink: 0;
  border-radius: 50%;
  block-size: 9px;
  inline-size: 9px;

  &--ok {
    background-color: rgb(var(--v-theme-success));
    box-shadow: 0 0 0 3px rgba(var(--v-theme-success), 0.2);
  }

  &--err {
    background-color: rgb(var(--v-theme-error));
    box-shadow: 0 0 0 3px rgba(var(--v-theme-error), 0.2);
  }
}

.sim-safe-pill {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border: 1px solid rgba(var(--v-theme-info), 0.28);
  border-radius: 999px;
  background-color: rgba(var(--v-theme-info), 0.1);
  color: rgb(var(--v-theme-info));
  cursor: help;
  font-size: 11px;
  font-weight: 600;
  gap: 3px;
  white-space: nowrap;
}

.sim-icon-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 7px;
  background: transparent;
  block-size: 28px;
  color: rgba(var(--v-theme-on-surface), 0.72);
  cursor: pointer;
  inline-size: 28px;
  transition:
    background-color 0.16s ease,
    color 0.16s ease;

  &:hover {
    background-color: rgba(var(--v-theme-primary), 0.1);
    color: rgb(var(--v-theme-primary));
  }
}

.sim-panel-controls {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  padding: 10px 14px;
  border-block-end: 1px solid rgba(var(--v-theme-on-surface), 0.07);
  background-color: rgba(var(--v-theme-on-surface), 0.018);
  gap: 9px;
}

.sim-scenario-bar {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sim-scenario-select {
  flex: 1;
  min-inline-size: 0;

  :deep(.v-field) {
    border-radius: 9px;
    font-size: 12.5px;
  }

  :deep(.v-field__input) {
    min-block-size: 34px;
    padding-block: 4px;
  }
}

.sim-rerun-btn {
  flex-shrink: 0;
  border-radius: 9px !important;
  block-size: 34px !important;
  inline-size: 34px !important;
}

.sim-kpi-grid {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.sim-kpi-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 6px 8px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  border-radius: 8px;
  background-color: rgba(var(--v-theme-surface), 0.7);
  line-height: 1.2;

  &__val {
    color: rgb(var(--v-theme-on-surface));
    font-size: 15px;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }

  &__lbl {
    color: rgba(var(--v-theme-on-surface), 0.6);
    font-size: 11px;
    margin-block-start: 2px;
  }

  &--success {
    border-color: rgba(var(--v-theme-success), 0.22);
    background-color: rgba(var(--v-theme-success), 0.07);

    .sim-kpi-item__val {
      color: rgb(var(--v-theme-success));
    }
  }

  &--info {
    border-color: rgba(var(--v-theme-info), 0.25);
    background-color: rgba(var(--v-theme-info), 0.08);

    .sim-kpi-item__val {
      color: rgb(var(--v-theme-info));
    }
  }
}

.sim-failure-banner {
  display: flex;
  align-items: flex-start;
  padding: 6px 9px;
  border: 1px solid rgba(var(--v-theme-error), 0.25);
  border-radius: 8px;
  background-color: rgba(var(--v-theme-error), 0.1);
  color: rgb(var(--v-theme-error));
  font-size: 12px;
  gap: 6px;
  line-height: 1.4;
}

.sim-panel-scroll {
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 12px 14px 14px;
  gap: 12px;
  overflow-y: auto;
}

.workflow-sim-section {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.workflow-sim-section__title {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.workflow-sim-diagnostics,
.workflow-sim-timeline {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.workflow-sim-diag {
  display: flex;
  align-items: flex-start;
  padding: 6px 9px;
  border-radius: 8px;
  font-size: 12px;
  gap: 6px;
  line-height: 1.4;

  &--error {
    background-color: rgba(var(--v-theme-error), 0.1);
    color: rgb(var(--v-theme-error));
  }

  &--warning {
    background-color: rgba(var(--v-theme-warning), 0.12);
    color: rgb(var(--v-theme-warning));
  }

  &--info {
    background-color: rgba(var(--v-theme-info), 0.1);
    color: rgb(var(--v-theme-info));
  }
}

.workflow-sim-step {
  display: flex;
  align-items: stretch;
  padding: 9px 10px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 10px;
  background-color: rgba(var(--v-theme-on-surface), 0.025);
  cursor: pointer;
  gap: 9px;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    box-shadow 0.18s ease;

  &:hover {
    border-color: rgba(var(--v-theme-primary), 0.35);
    background-color: rgba(var(--v-theme-primary), 0.04);
  }

  &--active {
    border-color: rgb(var(--v-theme-primary));
    background-color: rgba(var(--v-theme-primary), 0.07);
    box-shadow: 0 0 0 1px rgba(var(--v-theme-primary), 0.22);
  }

  &__rail {
    display: flex;
    flex-shrink: 0;
    flex-direction: column;
    align-items: center;
    padding-block-start: 1px;
  }

  &__line {
    flex: 1;
    border-radius: 1px;
    background-color: rgba(var(--v-theme-on-surface), 0.12);
    inline-size: 1.5px;
    margin-block-start: 4px;
    min-block-size: 10px;
  }

  &__body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 5px;
    min-inline-size: 0;
  }

  &--state-success .workflow-sim-step__index {
    background-color: rgba(var(--v-theme-success), 0.15);
    color: rgb(var(--v-theme-success));
  }

  &--state-intercepted .workflow-sim-step__index {
    background-color: rgba(var(--v-theme-info), 0.16);
    color: rgb(var(--v-theme-info));
  }

  &--state-failed .workflow-sim-step__index {
    background-color: rgba(var(--v-theme-error), 0.16);
    color: rgb(var(--v-theme-error));
  }
}

.workflow-sim-step__head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.workflow-sim-step__index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background-color: rgba(var(--v-theme-on-surface), 0.1);
  block-size: 20px;
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  inline-size: 20px;
}

.workflow-sim-step__name {
  overflow: hidden;
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-sim-step__badge {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  gap: 3px;
  white-space: nowrap;

  &--success {
    background-color: rgba(var(--v-theme-success), 0.14);
    color: rgb(var(--v-theme-success));
  }

  &--info {
    background-color: rgba(var(--v-theme-info), 0.16);
    color: rgb(var(--v-theme-info));
  }

  &--error {
    background-color: rgba(var(--v-theme-error), 0.15);
    color: rgb(var(--v-theme-error));
  }

  &--secondary,
  &--default {
    background-color: rgba(var(--v-theme-on-surface), 0.09);
    color: rgba(var(--v-theme-on-surface), 0.65);
  }
}

.workflow-sim-step__outputs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.workflow-sim-output-pill {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border: 1px solid rgba(var(--v-theme-primary), 0.35);
  border-radius: 6px;
  background-color: rgba(var(--v-theme-primary), 0.08);
  color: rgb(var(--v-theme-primary));
  font-size: 11px;
  font-weight: 600;
}

.workflow-sim-step__msg {
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 12px;
  line-height: 1.45;
}

.workflow-sim-step__previews {
  display: flex;
  flex-direction: column;
  padding: 7px 8px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  border-radius: 8px;
  background-color: rgba(var(--v-theme-on-surface), 0.035);
  gap: 5px;
  margin-block-start: 2px;
  max-block-size: 164px;
  overflow-y: auto;

  &-head {
    color: rgba(var(--v-theme-on-surface), 0.55);
    font-size: 10.5px;
    font-weight: 600;
    margin-block-end: 1px;
  }
}

.workflow-sim-preview-item {
  display: flex;
  flex-direction: column;
  padding: 6px 9px;
  border: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.08));
  border-radius: 8px;
  background-color: rgb(var(--v-theme-surface));
  gap: 2px;
}

.workflow-sim-preview-item__title {
  overflow: hidden;
  color: rgb(var(--v-theme-on-surface));
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-sim-preview-item__sub {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11px;
  line-height: 1.3;
}

.vue-flow__minimap {
  overflow: hidden;
  background-color: rgba(var(--v-theme-surface), 0.8);
  inset-block-end: 20px;
  inset-inline-end: 20px;
  transform: scale(75%);
  transform-origin: bottom right;
}

.vue-flow__handle {
  border-radius: 4px;
  block-size: 24px;
  inline-size: 8px;
}

.vue-flow__edge-path,
.vue-flow__connection-path {
  stroke-width: 3;
}

.vue-flow__handle-left {
  background-color: rgb(var(--v-theme-info));
}

.vue-flow__handle-right {
  background-color: rgb(var(--v-theme-error));
}

// 自动排版过渡动画（仅在点击自动排版期间开启 transform 过渡，不干扰手动拖拽跟手度）
.workflow-canvas--layout-animating .vue-flow__node {
  transition:
    transform 0.28s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.2s ease,
    opacity 0.2s ease !important;
}

@keyframes workflow-sim-pulse {
  0%,
  100% {
    box-shadow:
      0 0 0 2.5px rgb(var(--v-theme-primary)),
      0 0 18px rgba(var(--v-theme-primary), 0.42);
  }

  50% {
    box-shadow:
      0 0 0 4px rgb(var(--v-theme-primary)),
      0 0 28px rgba(var(--v-theme-primary), 0.68);
  }
}

@keyframes workflow-sim-edge-flow {
  from {
    stroke-dashoffset: 24;
  }

  to {
    stroke-dashoffset: 0;
  }
}

// 自定义节点样式与模拟逐步推演高亮（禁止在 :hover 上覆盖 transform，以免破坏 VueFlow translate3d 定位）
.vue-flow__node {
  border-radius: var(--app-control-radius);
  transition:
    box-shadow 0.22s ease,
    opacity 0.22s ease;

  &.has-sim-badge::before {
    position: absolute;
    z-index: 30;
    padding: 2px 9px;
    border-radius: 999px;
    background-color: rgb(var(--v-theme-surface));
    box-shadow: 0 3px 10px rgba(0, 0, 0, 18%);
    color: rgb(var(--v-theme-on-surface));
    content: var(--sim-badge-text, '');
    font-size: 11px;
    font-weight: 700;
    inset-block-start: -30px;
    inset-inline-start: 0;
    letter-spacing: 0.01em;
    pointer-events: none;
    white-space: nowrap;
  }

  &.selected {
    box-shadow: 0 0 0 2px rgb(var(--v-theme-primary));
  }

  &.workflow-sim-node--pending {
    opacity: 0.48;
  }

  &.workflow-sim-node--running {
    z-index: 25 !important;
    animation: workflow-sim-pulse 0.9s ease-in-out infinite;
    opacity: 1;

    &.has-sim-badge::before {
      background-color: rgb(var(--v-theme-primary));
      color: rgb(var(--v-theme-on-primary));
    }
  }

  &.workflow-sim-node--success {
    box-shadow:
      0 0 0 2.5px rgb(var(--v-theme-success)),
      0 6px 20px rgba(var(--v-theme-success), 0.2);

    &.has-sim-badge::before {
      border: 1px solid rgba(var(--v-theme-success), 0.45);
      color: rgb(var(--v-theme-success));
    }
  }

  &.workflow-sim-node--intercepted {
    box-shadow:
      0 0 0 2.5px rgb(var(--v-theme-info)),
      0 6px 22px rgba(var(--v-theme-info), 0.25);

    &.has-sim-badge::before {
      border: 1px solid rgba(var(--v-theme-info), 0.5);
      background-color: rgb(var(--v-theme-info));
      color: rgb(var(--v-theme-on-info));
    }
  }

  &.workflow-sim-node--failed {
    box-shadow:
      0 0 0 2.5px rgb(var(--v-theme-error)),
      0 6px 20px rgba(var(--v-theme-error), 0.24);

    &.has-sim-badge::before {
      border: 1px solid rgba(var(--v-theme-error), 0.45);
      color: rgb(var(--v-theme-error));
    }
  }

  &.workflow-sim-node--skipped,
  &.workflow-sim-node--unreached {
    box-shadow: 0 0 0 1.5px rgba(var(--v-theme-on-surface), 0.25);
    opacity: 0.52;

    &.has-sim-badge::before {
      color: rgba(var(--v-theme-on-surface), 0.65);
    }
  }
}

// 自定义动作连线样式与模拟流光高亮
.vue-flow__edge.animation {
  .vue-flow__edge-path {
    stroke: rgb(var(--v-theme-primary));
  }

  &.selected {
    .vue-flow__edge-path {
      stroke: rgb(var(--v-theme-primary));
      stroke-width: 4;
    }
  }
}

.vue-flow__edge.workflow-conditional-edge {
  .vue-flow__edge-path {
    stroke: rgb(var(--v-theme-warning));
  }
}

.vue-flow__edge.workflow-sim-edge--pending {
  .vue-flow__edge-path {
    opacity: 0.35;
    stroke: rgba(var(--v-theme-on-surface), 0.35) !important;
  }
}

.vue-flow__edge.workflow-sim-edge--matched {
  .vue-flow__edge-path {
    animation: workflow-sim-edge-flow 0.65s linear infinite;
    filter: drop-shadow(0 0 4px rgba(var(--v-theme-success), 0.45));
    stroke: rgb(var(--v-theme-success)) !important;
    stroke-dasharray: 8 4;
    stroke-width: 3.8;
  }
}

.vue-flow__edge.workflow-sim-edge--unmatched,
.vue-flow__edge.workflow-sim-edge--skipped {
  .vue-flow__edge-path {
    stroke: rgba(var(--v-theme-on-surface), 0.28) !important;
    stroke-dasharray: 6 5;
  }
}

.vue-flow__edge.workflow-sim-edge--failed {
  .vue-flow__edge-path {
    stroke: rgb(var(--v-theme-error)) !important;
    stroke-width: 3.5;
  }
}

@media screen and (width <= 600px) {
  .vue-flow__minimap,
  .vue-flow__controls {
    display: none;
  }

  .workflow-edge-panel,
  .workflow-simulation-panel,
  .workflow-node-policy-dock {
    inline-size: auto;
    inset-block: auto 88px;
    inset-inline: 16px;
    max-block-size: min(72vh, calc(100% - 112px));
    max-inline-size: none;
  }
}
</style>
