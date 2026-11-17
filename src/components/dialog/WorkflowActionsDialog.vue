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

const { onConnect, addEdges, nodes, edges, addNodes, screenToFlowCoordinate, fitView } = useVueFlow()

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

// 模拟试跑状态
const simulationLoading = ref(false)
const simulationScenario = ref<WorkflowSimulationScenario>('normal')
const simulationResult = ref<WorkflowSimulationResult | null>(null)
const simulationPanelOpen = ref(false)

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

// 获取指定节点端口的类型（输入/输出）
const getPortType = (node: GraphNode, handleId: string) => {
  const isInput = node.handleBounds?.target?.some(h => h.id === handleId)
  if (isInput) return 'input'

  const isOutput = node.handleBounds?.source?.some(h => h.id === handleId)
  return isOutput ? 'output' : null
}

// 校验连接是否合法
const isValidConnection = (connection: Connection) => {
  const sourceNode = nodes.value.find(n => n.id === connection.source)
  const targetNode = nodes.value.find(n => n.id === connection.target)

  if (!sourceNode || !targetNode) return false

  const sourcePortType = getPortType(sourceNode, connection.sourceHandle!)
  const targetPortType = getPortType(targetNode, connection.targetHandle!)

  return sourcePortType === 'output' && targetPortType === 'input' && connection.source !== connection.target
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
    const simEdge = findSimulatedEdge(edge)
    if (simEdge?.state) {
      simClass = `workflow-sim-edge--${simEdge.state}`
      animated = simEdge.state === 'matched'
    }
  } else if (!includeSimulationClass && simulationResult.value) {
    animated = true
  }

  const data = omitConfigKeys(edge?.data as Record<string, unknown>, ['join_policy', 'branch_policy'])
  data.condition = condition || undefined
  const edgePayload = omitConfigKeys(edge as unknown as Record<string, unknown>, ['join_policy', 'branch_policy'])

  return {
    ...edgePayload,
    animated,
    type: edge?.type || 'animation',
    label: condition ? t('dialog.workflowActions.edgeConditionalLabel') : undefined,
    class: [baseClass, condition ? 'workflow-conditional-edge' : '', simClass].filter(Boolean).join(' ') || undefined,
    condition: condition || undefined,
    data,
  } as unknown as GraphEdge
}

// 标准化动作节点：保留后端支持的运行策略字段，仅移除纯展示契约元数据
const normalizeWorkflowNode = (node: WorkflowNodeLike | GraphNode, includeSimulationClass = false): GraphNode => {
  const metadataOnlyKeys = ['contract', '_contract']
  const data = omitConfigKeys(node?.data as Record<string, unknown>, metadataOnlyKeys)
  const nodePayload = omitConfigKeys(node as unknown as Record<string, unknown>, metadataOnlyKeys)

  // 兼容从 data 中迁移或读取节点高级策略到节点顶层
  const failPolicy = nodePayload.fail_policy ?? data.fail_policy
  const joinPolicy = nodePayload.join_policy ?? data.join_policy
  const branchPolicy = nodePayload.branch_policy ?? data.branch_policy
  const concurrencyKey = nodePayload.concurrency_key ?? data.concurrency_key
  const rawTimeout = nodePayload.timeout ?? data.timeout
  const rawRetry = (nodePayload.retry ?? data.retry) as NodeRetryConfig | undefined

  // 避免在节点非业务表单例如 FetchRssAction(有自己的 data.timeout) 误删 data.timeout：
  // 只有纯策略字段 fail_policy / join_policy / branch_policy / retry 才从 data 清理
  delete data.fail_policy
  delete data.join_policy
  delete data.branch_policy
  delete data.retry

  const baseClass = stripSimulationClasses(node?.class)
  let simClass = ''
  if (includeSimulationClass && simulationResult.value) {
    const simNode = simulationResult.value.nodes?.[node.id]
    if (simNode?.state) {
      simClass = `workflow-sim-node--${simNode.state}`
    }
  }

  const normalized: Record<string, unknown> = {
    ...nodePayload,
    class: [baseClass, simClass].filter(Boolean).join(' ') || undefined,
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

// 刷新画布上的标准化数据（保留模拟高亮状态）
function syncCanvasNormalization(keepSimulation = false) {
  nodes.value = (nodes.value || []).map(node => normalizeWorkflowNode(node, keepSimulation))
  edges.value = (edges.value || []).map(edge => normalizeWorkflowEdge(edge, keepSimulation))
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
  edges.value = edges.value.map(edge => {
    if (edge.id !== selectedEdgeId.value) return edge
    return normalizeWorkflowEdge(
      {
        ...edge,
        condition: edgeForm.value.condition,
        data: {
          ...(edge.data || {}),
          condition: edgeForm.value.condition,
        },
      },
      Boolean(simulationResult.value),
    )
  })
  $toast.success(t('dialog.workflowActions.edgeSaveSuccess'))
}

// 删除当前选中的流程边
function deleteSelectedEdge() {
  if (!selectedEdgeId.value) return
  edges.value = edges.value.filter(edge => edge.id !== selectedEdgeId.value)
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

  nodes.value = nodes.value.map(node => {
    if (node.id !== selectedNodeId.value) return node
    const currentLike = node as unknown as WorkflowNodeLike
    const updated: WorkflowNodeLike = {
      ...currentLike,
      fail_policy: nodePolicyForm.value.fail_policy || 'stop',
      join_policy: nodePolicyForm.value.join_policy || 'all_success',
      timeout: timeoutVal,
      retry:
        maxAttempts > 1 || retryInterval > 0
          ? {
              ...(typeof currentLike.retry === 'object' ? currentLike.retry : {}),
              max_attempts: maxAttempts,
              interval: retryInterval,
            }
          : undefined,
    }
    return normalizeWorkflowNode(updated, Boolean(simulationResult.value))
  })
  nodePolicyExpanded.value = false
  $toast.success(t('dialog.workflowActions.nodePolicy.saveSuccess'))
}

function deleteSelectedNode() {
  if (!selectedNodeId.value) return
  const targetId = selectedNodeId.value
  nodes.value = nodes.value.filter(node => node.id !== targetId)
  edges.value = edges.value.filter(edge => edge.source !== targetId && edge.target !== targetId)
  closeNodePolicy()
}

// 一键 DAG Kahn 拓扑分层自动排版
function autoLayoutWorkflow() {
  if (!nodes.value.length) return
  const allNodes = [...nodes.value]
  const noteNodes = allNodes.filter(n => n.type === 'NoteAction')
  const actionNodes = allNodes.filter(n => n.type !== 'NoteAction')

  const newPositions = new Map<string, { x: number; y: number }>()

  noteNodes.forEach((note, index) => {
    newPositions.set(note.id, {
      x: 320 + index * 360,
      y: 24,
    })
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

    const baseY = noteNodes.length > 0 ? 250 : 80
    layers.forEach((group, layerIdx) => {
      group.sort((a, b) => {
        const dy = (a.position?.y ?? 0) - (b.position?.y ?? 0)
        if (Math.abs(dy) > 1) return dy
        return (originalOrder.get(a.id) ?? 0) - (originalOrder.get(b.id) ?? 0)
      })
      group.forEach((n, indexInLayer) => {
        newPositions.set(n.id, {
          x: 320 + layerIdx * 360,
          y: baseY + indexInLayer * 340,
        })
      })
    })
  }

  nodes.value = nodes.value.map(node => {
    const pos = newPositions.get(node.id)
    return pos ? { ...node, position: pos } : node
  })

  nextTick(() => {
    fitView({ padding: 0.2, duration: 250 })
  })
  $toast.success(t('dialog.workflowActions.autoLayoutSuccess'))
}

// 模拟试跑逻辑
const simulationScenarios = computed(() => [
  { value: 'normal' as const, label: t('dialog.workflowActions.simulation.scenarios.normal') },
  { value: 'empty_source' as const, label: t('dialog.workflowActions.simulation.scenarios.empty_source') },
  { value: 'empty_filter' as const, label: t('dialog.workflowActions.simulation.scenarios.empty_filter') },
])

function findSimulatedEdge(edge: WorkflowEdgeLike | GraphEdge) {
  if (!simulationResult.value?.edges) return undefined
  if (edge.id && simulationResult.value.edges[edge.id]) {
    return simulationResult.value.edges[edge.id]
  }
  return Object.values(simulationResult.value.edges).find(
    item => item.source === edge.source && item.target === edge.target,
  )
}

function applySimulationHighlights() {
  syncCanvasNormalization(Boolean(simulationResult.value))
}

function clearSimulation() {
  simulationResult.value = null
  simulationPanelOpen.value = false
  syncCanvasNormalization(false)
}

async function runSimulation(scenario?: WorkflowSimulationScenario) {
  if (simulationLoading.value) return
  if (scenario) {
    simulationScenario.value = scenario
  }
  closeEdgeSettings()
  nodePolicyExpanded.value = false

  const { cleanNodes, cleanEdges } = getCleanNodesAndEdges()
  simulationLoading.value = true
  try {
    const res: { success: boolean; message?: string; data?: WorkflowSimulationResult } = await api.post(
      'workflow/simulate',
      {
        actions: cleanNodes,
        flows: cleanEdges,
        execution_config: workflowForm.value?.execution_config,
        scenario: simulationScenario.value,
      },
    )
    if (res.success && res.data) {
      simulationResult.value = res.data
      simulationPanelOpen.value = true
      applySimulationHighlights()
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

// 整理模拟步骤列表（优先按 execution_order，再附上被跳过或未触达节点）
const orderedSimulationSteps = computed<WorkflowSimulationNodeResult[]>(() => {
  if (!simulationResult.value?.nodes) return []
  const nodeMap = simulationResult.value.nodes
  const seen = new Set<string>()
  const steps: WorkflowSimulationNodeResult[] = []

  ;(simulationResult.value.execution_order || []).forEach(id => {
    if (nodeMap[id] && !seen.has(id)) {
      seen.add(id)
      steps.push(nodeMap[id])
    }
  })

  Object.values(nodeMap).forEach(item => {
    if (!seen.has(item.id)) {
      seen.add(item.id)
      steps.push(item)
    }
  })
  return steps
})

function resolveSimNodeBadge(state: WorkflowSimulationNodeResult['state']) {
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
  return map[state] || map.unreached
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

// 调用 API 保存工作流流程
async function updateWorkflow() {
  const { cleanNodes, cleanEdges } = getCleanNodesAndEdges()
  nodes.value = cleanNodes
  edges.value = cleanEdges
  if (simulationResult.value) {
    applySimulationHighlights()
  }

  workflowForm.value.actions = cleanNodes
  workflowForm.value.flows = cleanEdges

  try {
    const result: { [key: string]: string } = await api.put(`workflow/${workflowForm.value.id}`, workflowForm.value)
    if (result.success) {
      savedSnapshot.value = computeCanvasSignature()
      $toast.success(t('dialog.workflowActions.saveSuccess'))
      emit('save')
    } else {
      $toast.error(t('dialog.workflowActions.saveFailed', { message: result.message }))
    }
  } catch (error) {
    console.error(error)
  }
}

// 未保存变更拦截关闭
async function handleClose() {
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
    updateWorkflow()
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
        nodes.value = codeObject.actions || []
        edges.value = codeObject.flows || []
        if (codeObject.execution_config) {
          workflowForm.value.execution_config = codeObject.execution_config
        }
        syncCanvasNormalization(false)
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
function shareWorkflow() {
  const { cleanNodes, cleanEdges } = getCleanNodesAndEdges()
  const codeString = JSON.stringify({
    actions: cleanNodes,
    flows: cleanEdges,
    execution_config: workflowForm.value.execution_config,
  })
  navigator.clipboard.writeText(codeString)
  $toast.success(t('dialog.workflowActions.codeCopied'))
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  loadActionDefinitions()
  if (props.workflow) {
    workflowForm.value = cloneDeep(props.workflow)
    nodes.value = cloneDeep(props.workflow.actions ?? [])
    edges.value = cloneDeep(props.workflow.flows ?? [])
    syncCanvasNormalization(false)
  }
  nextTick(() => {
    savedSnapshot.value = computeCanvasSignature()
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

watch(
  edges,
  () => {
    if (selectedEdgeId.value && !selectedEdge.value) {
      closeEdgeSettings()
    }
  },
  { deep: true },
)

watch(
  nodes,
  () => {
    if (selectedEdge.value && !canConfigureEdge(selectedEdge.value)) {
      closeEdgeSettings()
    }
    if (selectedNodeId.value && !selectedNode.value) {
      closeNodePolicy()
    }
  },
  { deep: true },
)

// 判断是不是 MACOS
const isMacOS = computed(() => {
  return /Macintosh|MacIntel|MacPPC|Mac68K/.test(navigator.userAgent)
})
</script>

<template>
  <VDialog scrollable fullscreen :scrim="false" transition="dialog-bottom-transition">
    <VCard class="workflow-dialog">
      <!-- Toolbar -->
      <VToolbar color="primary" density="comfortable" class="workflow-toolbar">
        <VToolbarItems>
          <VBtn icon @click="handleClose" class="ms-2" :aria-label="t('common.close')">
            <VIcon size="large" color="white" icon="mdi-close" />
          </VBtn>
        </VToolbarItems>

        <VToolbarTitle class="workflow-toolbar__title">
          <span>{{ t('dialog.workflowActions.title') }} - {{ workflow?.name }}</span>
          <VChip v-if="isDirty" size="x-small" color="warning" variant="flat" class="ms-2 workflow-unsaved-chip">
            {{ t('dialog.workflowActions.unsavedBadge') }}
          </VChip>
        </VToolbarTitle>

        <VToolbarItems class="workflow-toolbar__actions align-center">
          <!-- 模拟试跑组合按钮 -->
          <div class="workflow-sim-trigger me-1">
            <VBtn
              variant="tonal"
              color="white"
              size="small"
              :loading="simulationLoading"
              prepend-icon="mdi-play-speed"
              class="workflow-sim-trigger__main"
              @click="runSimulation()"
            >
              <span class="d-none d-sm-inline">{{ t('dialog.workflowActions.simulation.runBtn') }}</span>
            </VBtn>
            <VMenu location="bottom end">
              <template #activator="{ props: menuProps }">
                <VBtn
                  v-bind="menuProps"
                  icon
                  variant="tonal"
                  color="white"
                  size="small"
                  class="workflow-sim-trigger__menu"
                  :disabled="simulationLoading"
                >
                  <VIcon icon="mdi-chevron-down" size="18" />
                </VBtn>
              </template>
              <VList density="compact">
                <VListItem
                  v-for="item in simulationScenarios"
                  :key="item.value"
                  :active="simulationScenario === item.value"
                  @click="runSimulation(item.value)"
                >
                  <template #prepend>
                    <VIcon
                      :icon="simulationScenario === item.value ? 'mdi-radiobox-marked' : 'mdi-radiobox-blank'"
                      size="18"
                    />
                  </template>
                  <VListItemTitle>{{ item.label }}</VListItemTitle>
                </VListItem>
              </VList>
            </VMenu>
          </div>

          <!-- 一键自动排版 -->
          <VBtn icon variant="text" @click="autoLayoutWorkflow" :aria-label="t('dialog.workflowActions.autoLayout')">
            <VIcon size="22" color="white" icon="mdi-sitemap-outline" />
            <VTooltip activator="parent" location="bottom">{{ t('dialog.workflowActions.autoLayout') }}</VTooltip>
          </VBtn>

          <!-- 导入 JSON -->
          <VBtn
            icon
            variant="text"
            @click="importCodeDialog = true"
            :aria-label="t('dialog.workflowActions.importTooltip')"
          >
            <VIcon size="22" color="white" icon="mdi-import" />
            <VTooltip activator="parent" location="bottom">{{ t('dialog.workflowActions.importTooltip') }}</VTooltip>
          </VBtn>

          <!-- 导出复制 JSON -->
          <VBtn icon variant="text" @click="shareWorkflow" :aria-label="t('dialog.workflowActions.exportTooltip')">
            <VIcon size="22" color="white" icon="mdi-share" />
            <VTooltip activator="parent" location="bottom">{{ t('dialog.workflowActions.exportTooltip') }}</VTooltip>
          </VBtn>

          <!-- 保存流程 -->
          <VBtn
            icon
            variant="text"
            class="me-2"
            :aria-label="t('dialog.workflowActions.saveTooltip')"
            @click="updateWorkflow"
          >
            <VIcon size="22" color="white" icon="mdi-content-save" />
            <VTooltip activator="parent" location="bottom">{{ t('dialog.workflowActions.saveTooltip') }}</VTooltip>
          </VBtn>
        </VToolbarItems>
      </VToolbar>

      <VCardText class="workflow-content pa-0">
        <div
          class="workflow-canvas"
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
                <VIcon icon="mdi-source-branch" size="20" />
                <span>{{ t('dialog.workflowActions.edgeSettingsTitle') }}</span>
              </div>
              <VBtn icon variant="text" size="small" @click="closeEdgeSettings">
                <VIcon icon="mdi-close" />
              </VBtn>
            </div>

            <div class="edge-route">
              <span>{{ getNodeName(selectedEdge.source) }}</span>
              <VIcon icon="mdi-arrow-right" size="18" />
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
              density="comfortable"
              hide-details="auto"
            />

            <div class="edge-panel-actions">
              <VBtn icon variant="text" color="error" @click="deleteSelectedEdge">
                <VIcon icon="mdi-delete" />
              </VBtn>
              <VSpacer />
              <VBtn variant="text" @click="closeEdgeSettings">
                {{ t('dialog.workflowActions.edgeCancel') }}
              </VBtn>
              <VBtn color="primary" @click="saveEdgeSettings">
                {{ t('dialog.workflowActions.edgeSave') }}
              </VBtn>
            </div>
          </div>

          <!-- 模拟试跑报告面板 -->
          <div v-if="simulationPanelOpen && simulationResult" class="workflow-simulation-panel">
            <div class="edge-panel-header">
              <div class="edge-panel-title">
                <VIcon
                  :icon="simulationResult.success ? 'mdi-check-decagram-outline' : 'mdi-alert-decagram-outline'"
                  :color="simulationResult.success ? 'success' : 'error'"
                  size="20"
                />
                <span>{{ t('dialog.workflowActions.simulation.panelTitle') }}</span>
              </div>
              <div class="d-flex align-center ga-1">
                <VBtn variant="text" size="x-small" color="secondary" @click="clearSimulation">
                  {{ t('dialog.workflowActions.simulation.clearHighlight') }}
                </VBtn>
                <IconBtn size="x-small" @click="simulationPanelOpen = false">
                  <VIcon icon="mdi-close" size="18" />
                </IconBtn>
              </div>
            </div>

            <div class="workflow-sim-disclaimer">
              <VIcon icon="mdi-shield-check-outline" size="15" />
              <span>{{ t('dialog.workflowActions.simulation.disclaimer') }}</span>
            </div>

            <!-- 场景快捷切换重跑 -->
            <div class="workflow-sim-scenarios">
              <VChip
                v-for="sc in simulationScenarios"
                :key="sc.value"
                :color="simulationScenario === sc.value ? 'primary' : undefined"
                :variant="simulationScenario === sc.value ? 'flat' : 'tonal'"
                size="small"
                :disabled="simulationLoading"
                class="cursor-pointer"
                @click="runSimulation(sc.value)"
              >
                {{ sc.label }}
              </VChip>
            </div>

            <!-- 模拟摘要 -->
            <VAlert
              :type="simulationResult.success ? 'success' : 'error'"
              variant="tonal"
              density="compact"
              class="text-body-2"
            >
              {{ simulationResult.summary }}
            </VAlert>

            <!-- 静态诊断 -->
            <div v-if="simulationResult.diagnostics?.length" class="workflow-sim-section">
              <div class="workflow-sim-section__title">
                {{ t('dialog.workflowActions.simulation.diagnosticsTitle') }}
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
                  />
                  <div>
                    <strong v-if="diag.node_id" class="me-1">[{{ getNodeName(diag.node_id) }}]</strong>
                    <span>{{ diag.message }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 按执行顺序排列的步骤明细 -->
            <div class="workflow-sim-section">
              <div class="workflow-sim-section__title">
                {{ t('dialog.workflowActions.simulation.stepsTitle') }}
              </div>
              <div v-if="orderedSimulationSteps.length > 0" class="workflow-sim-steps">
                <div v-for="(step, idx) in orderedSimulationSteps" :key="step.id" class="workflow-sim-step">
                  <div class="workflow-sim-step__head">
                    <span class="workflow-sim-step__index">{{ step.step ?? idx + 1 }}</span>
                    <span class="workflow-sim-step__name">{{ actionStepDict[step.name] || step.name || step.id }}</span>
                    <VChip
                      :color="resolveSimNodeBadge(step.state).color"
                      size="x-small"
                      variant="tonal"
                      class="ms-auto"
                    >
                      {{ resolveSimNodeBadge(step.state).text }}
                    </VChip>
                  </div>
                  <div
                    v-if="getSimulationOutputChips(step.outputs_summary).length > 0"
                    class="workflow-sim-step__outputs"
                  >
                    <VChip
                      v-for="chip in getSimulationOutputChips(step.outputs_summary)"
                      :key="chip"
                      size="x-small"
                      color="primary"
                      variant="outlined"
                    >
                      {{ chip }}
                    </VChip>
                  </div>
                  <div v-if="step.message" class="workflow-sim-step__msg text-medium-emphasis">
                    {{ step.message }}
                  </div>
                </div>
              </div>
              <div v-else class="text-caption text-medium-emphasis">
                {{ t('dialog.workflowActions.simulation.noSteps') }}
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
  block-size: 100%;
}

.workflow-toolbar__title {
  display: flex;
  align-items: center;
}

.workflow-sim-trigger {
  display: inline-flex;
  align-items: center;

  .workflow-sim-trigger__main {
    border-end-end-radius: 0;
    border-start-end-radius: 0;
  }

  .workflow-sim-trigger__menu {
    border-inline-start: 1px solid rgba(255, 255, 255, 22%);
    border-end-start-radius: 0;
    border-start-start-radius: 0;
    inline-size: 28px;
    min-inline-size: 28px;
  }
}

.workflow-content {
  position: relative;
  overflow: hidden;
  flex: 1;
}

.workflow-canvas {
  position: relative;
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
.workflow-edge-panel,
.workflow-simulation-panel {
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

.workflow-sim-disclaimer {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 6px;
  background-color: rgba(var(--v-theme-info), 0.1);
  color: rgb(var(--v-theme-info));
  font-size: 12px;
  gap: 6px;
}

.workflow-sim-scenarios {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.workflow-sim-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.workflow-sim-section__title {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  font-weight: 600;
}

.workflow-sim-diagnostics,
.workflow-sim-steps {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.workflow-sim-diag {
  display: flex;
  align-items: flex-start;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 12px;
  gap: 6px;

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
  flex-direction: column;
  padding: 8px 10px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 8px;
  background-color: rgba(var(--v-theme-on-surface), 0.025);
  gap: 5px;
}

.workflow-sim-step__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.workflow-sim-step__index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background-color: rgba(var(--v-theme-primary), 0.14);
  block-size: 20px;
  color: rgb(var(--v-theme-primary));
  font-size: 11px;
  font-weight: 700;
  inline-size: 20px;
}

.workflow-sim-step__name {
  font-size: 13px;
  font-weight: 600;
}

.workflow-sim-step__outputs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.workflow-sim-step__msg {
  font-size: 12px;
  line-height: 1.4;
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

// 自定义节点样式与模拟高亮
.vue-flow__node {
  border-radius: var(--app-control-radius);
  transition:
    box-shadow 0.2s ease,
    opacity 0.2s ease;

  &:hover {
    transform: translateY(-2px);
  }

  &.selected {
    box-shadow: 0 0 0 2px rgb(var(--v-theme-primary));
  }

  &.workflow-sim-node--success {
    box-shadow: 0 0 0 2.5px rgb(var(--v-theme-success));
  }

  &.workflow-sim-node--failed {
    box-shadow: 0 0 0 2.5px rgb(var(--v-theme-error));
  }

  &.workflow-sim-node--skipped,
  &.workflow-sim-node--unreached {
    box-shadow: 0 0 0 1.5px rgba(var(--v-theme-on-surface), 0.28);
    opacity: 0.58;
  }
}

// 自定义动作连线样式与模拟高亮
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

.vue-flow__edge.workflow-sim-edge--matched {
  .vue-flow__edge-path {
    stroke: rgb(var(--v-theme-success)) !important;
    stroke-width: 3.5;
  }
}

.vue-flow__edge.workflow-sim-edge--unmatched,
.vue-flow__edge.workflow-sim-edge--skipped {
  .vue-flow__edge-path {
    stroke: rgba(var(--v-theme-on-surface), 0.32) !important;
    stroke-dasharray: 6 5;
  }
}

.vue-flow__edge.workflow-sim-edge--failed {
  .vue-flow__edge-path {
    stroke: rgb(var(--v-theme-error)) !important;
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
