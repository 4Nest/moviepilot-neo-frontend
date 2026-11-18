<script lang="ts" setup>
import draggable from 'vuedraggable'
import api from '@/api'
import type { Subscribe } from '@/api/types'
import NoDataFound from '@/components/states/NoDataFound.vue'
import SubscribeCard from '@/components/cards/SubscribeCard.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { useI18n } from '@/composables/useChineseText'
import { useToast } from 'vue-toastification'
import { useConfirm } from '@/composables/useConfirm'
import { useKeepAliveRefresh, type KeepAliveRefreshContext } from '@/composables/useKeepAliveRefresh'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useDisplay } from 'vuetify'
import { isCancel } from 'axios'
import { useSubscribeRefresh } from '@/composables/useSubscribeRefresh'

const SubscribeHistoryDialog = defineAsyncComponent(() => import('@/components/dialog/SubscribeHistoryDialog.vue'))

// 国际化
const { t } = useI18n()

// 响应式断点用于切换订阅卡片网格密度。
const display = useDisplay()

// 提示框
const $toast = useToast()

// 确认框
const createConfirm = useConfirm()

// 路由
const route = useRoute()

// 输入参数
const props = defineProps({
  type: String,
  subid: String,
  keyword: String,
  statusFilter: String,
  sortMode: {
    type: Boolean,
    default: false,
  },
  sortBy: {
    type: String,
    default: '',
  },
  active: {
    type: Boolean,
    default: true,
  },
})

const emit = defineEmits<{
  'update:sortMode': [value: boolean]
  'update:sortBy': [value: SubscribeSortBy]
  'batch-state-change': [state: SubscribeBatchState]
}>()

type SubscribeSortBy = 'custom' | 'last_update' | 'date' | 'lack_episode'

// 订阅批量模式状态快照，供父页面渲染外部批量操作按钮。
interface SubscribeBatchState {
  enabled: boolean
  selectedCount: number
  totalCount: number
  allSelected: boolean
  operating?: boolean
}

// 是否刷新过
let isRefreshed = ref(false)

// 刷新状态
const loading = ref(false)
const pageActive = ref(true)
const subscribeRevision = useSubscribeRefresh()

// 最近一次列表请求是否失败，用于保留旧数据时持续展示错误状态。
const loadError = ref(false)

// 数据列表
const dataList = ref<Subscribe[]>([])

// 订阅顺序配置
const orderConfig = ref<{ id: number }[]>([])

// 显示的订阅列表
const displayList = ref<Subscribe[]>([])

// 批量管理相关状态
const isBatchMode = ref(false)
const batchOperating = ref(false)
const selectedSubscribes = ref<number[]>([])

const activeTargetSubId = computed(() => {
  const fromProp = props.subid?.toString().trim()
  if (fromProp) return fromProp
  const queryId = route.query?.id
  return typeof queryId === 'string' ? queryId.trim() : ''
})

const normalizedKeyword = computed(() => props.keyword?.trim().toLowerCase() || '')
const selectedSubscribesSet = computed(() => new Set(selectedSubscribes.value))
const hasCustomOrder = computed(() => orderConfig.value.length > 0)
const isAllSubscribesSelected = computed(
  () => displayList.value.length > 0 && displayList.value.every(item => selectedSubscribesSet.value.has(item.id)),
)

// 归一化订阅排序方式，电影订阅不使用缺失集数排序。
const normalizedSortBy = computed<SubscribeSortBy | ''>(() => {
  const sortBy = props.sortBy as SubscribeSortBy | ''
  if (props.type === '电影' && sortBy === 'lack_episode') {
    return 'date'
  }

  return sortBy
})
const effectiveSortBy = computed<SubscribeSortBy>(() => {
  return normalizedSortBy.value || (hasCustomOrder.value ? 'custom' : 'date')
})
const canSortContext = computed(
  () =>
    effectiveSortBy.value === 'custom' &&
    !normalizedKeyword.value &&
    (!props.statusFilter || props.statusFilter === 'all') &&
    !isBatchMode.value,
)
const sortMode = computed({
  get: () => props.sortMode,
  set: value => emit('update:sortMode', value),
})
const canDragSort = computed(() => sortMode.value && canSortContext.value)
const shouldVirtualizeList = computed(() => !sortMode.value)
const subscribeGridMinItemWidth = computed(() => (display.xs.value ? 144 : 240))
const subscribeGridEstimatedItemHeight = computed(() => (display.xs.value ? 190 : 300))
const subscribeGridGap = computed(() => (display.xs.value ? 12 : 16))
const scrollToIndex = computed(() => {
  if (!activeTargetSubId.value || sortMode.value) {
    return undefined
  }

  const targetIndex = displayList.value.findIndex(item => item.id.toString() === activeTargetSubId.value)

  return targetIndex >= 0 ? targetIndex : undefined
})

async function openTargetSubscribe(targetId?: string) {
  if (!targetId || !dataList.value.length) return
  const sub = dataList.value.find(item => item.id.toString() === targetId)
  if (!sub) return
  if (sub.page_open) {
    sub.page_open = false
    await nextTick()
  }
  sub.page_open = true
}

// 根据订阅数据判断订阅状态
function getSubscribeStatus(subscribe: Subscribe) {
  // 洗版中
  if (subscribe.best_version) {
    return 'best_version'
  }

  // 根据订阅状态判断
  if (subscribe.state === 'P') {
    return 'pending' // 待定
  } else if (subscribe.state === 'S') {
    return 'paused' // 暂停
  }

  // 如果是电影，只有洗版和状态
  if (subscribe.type === '电影') {
    return 'all'
  }

  // 电视剧根据集数情况判断：completed_episode 由后端按订阅类型派生
  // （普通=已入库集数，洗版=起始集前 + [start, total] 范围内 priority==100 命中）
  if (subscribe.total_episode && subscribe.total_episode > 0) {
    const lackEpisode = subscribe.lack_episode || 0
    const completedEpisode = subscribe.completed_episode ?? 0

    if (lackEpisode === 0) {
      return 'completed' // 订阅完成
    } else if (completedEpisode > 0) {
      return 'subscribing' // 订阅中
    } else {
      return 'not_started' // 未开始
    }
  }

  return 'not_started' // 默认未开始
}

// API请求键值（计算属性）
const orderRequestKey = computed(() => (props.type === '电影' ? 'SubscribeMovieOrder' : 'SubscribeTvOrder'))

// 转换订阅时间字段为可排序时间戳。
function getSubscribeTimeValue(value?: string) {
  if (!value) return 0

  const directTime = Date.parse(value)
  if (!Number.isNaN(directTime)) return directTime

  const compatibleTime = Date.parse(value.replace(/-/g, '/'))
  return Number.isNaN(compatibleTime) ? 0 : compatibleTime
}

// 按自定义顺序排序订阅，未配置顺序的订阅按添加时间倒序补齐。
function sortByCustomOrder(a: Subscribe, b: Subscribe, orderIndexMap: Map<number, number>) {
  const aIndex = orderIndexMap.get(a.id) ?? Number.MAX_SAFE_INTEGER
  const bIndex = orderIndexMap.get(b.id) ?? Number.MAX_SAFE_INTEGER

  if (aIndex !== bIndex) {
    return aIndex - bIndex
  }

  return getSubscribeTimeValue(b.date) - getSubscribeTimeValue(a.date)
}

// 按当前排序选项调整订阅列表顺序。
function sortSubscribeList(list: Subscribe[]) {
  const orderIndexMap = new Map(orderConfig.value.map((item, index) => [item.id, index]))

  list.sort((a, b) => {
    if (effectiveSortBy.value === 'custom') {
      return sortByCustomOrder(a, b, orderIndexMap)
    }

    if (effectiveSortBy.value === 'last_update') {
      return getSubscribeTimeValue(b.last_update) - getSubscribeTimeValue(a.last_update)
    }

    if (effectiveSortBy.value === 'lack_episode') {
      const lackEpisodeDiff = (b.lack_episode || 0) - (a.lack_episode || 0)
      return lackEpisodeDiff || getSubscribeTimeValue(b.date) - getSubscribeTimeValue(a.date)
    }

    return getSubscribeTimeValue(b.date) - getSubscribeTimeValue(a.date)
  })
}

// 同步订阅排序默认值给父组件。
function syncDefaultSortBy() {
  if (!props.sortBy) {
    emit('update:sortBy', hasCustomOrder.value ? 'custom' : 'date')
  }
}

// 监听数据、筛选和排序变化，同步更新显示列表
watch(
  [dataList, normalizedKeyword, () => props.statusFilter, orderConfig, effectiveSortBy],
  () => {
    const nextDisplayList = dataList.value.filter(data => {
      if (data.type !== props.type) {
        return false
      }

      if (
        normalizedKeyword.value &&
        !data.name?.toLowerCase().includes(normalizedKeyword.value) &&
        !data.username?.toLowerCase().includes(normalizedKeyword.value)
      ) {
        return false
      }

      if (props.statusFilter && props.statusFilter !== 'all' && getSubscribeStatus(data) !== props.statusFilter) {
        return false
      }

      return true
    })

    sortSubscribeList(nextDisplayList)

    displayList.value = nextDisplayList
    const visibleIds = new Set(nextDisplayList.map(item => item.id))
    selectedSubscribes.value = selectedSubscribes.value.filter(id => visibleIds.has(id))
  },
  { immediate: true },
)

watch(
  canSortContext,
  canSort => {
    if (!canSort && sortMode.value) {
      sortMode.value = false
    }
  },
  { immediate: true },
)

watch(
  [
    isBatchMode,
    batchOperating,
    () => selectedSubscribes.value.length,
    () => displayList.value.length,
    isAllSubscribesSelected,
  ],
  emitBatchStateChange,
  { immediate: true },
)

watch(activeTargetSubId, nextId => {
  if (nextId && isRefreshed.value) {
    void openTargetSubscribe(nextId)
  }
})

// 加载顺序
async function loadSubscribeOrderConfig() {
  try {
    const response = await api.get(`/user/config/${orderRequestKey.value}`)
    if (response && response.data && response.data.value) {
      orderConfig.value = response.data.value
    }
    syncDefaultSortBy()
  } catch (error) {
    if (isCancel(error)) return
    console.error('Failed to load subscribe order config:', error)
    orderConfig.value = []
    syncDefaultSortBy()
  }
}

// 保存顺序设置
async function saveSubscribeOrder() {
  const confirmedOrder = orderConfig.value.map(item => ({ ...item }))
  const orderObj = displayList.value.map(item => ({ id: item.id }))
  orderConfig.value = orderObj
  emit('update:sortBy', 'custom')

  try {
    await api.post(`/user/config/${orderRequestKey.value}`, orderObj)
  } catch (error) {
    console.error(error)
    orderConfig.value = confirmedOrder
    const restoredDisplayList = [...displayList.value]
    sortSubscribeList(restoredDisplayList)
    displayList.value = restoredDisplayList
    $toast.error(t('subscribe.requestFailed'))
  }
}

// 获取订阅列表数据
let fetchGeneration = 0

async function fetchData(context: KeepAliveRefreshContext = {}) {
  const generation = ++fetchGeneration
  const showLoading = !context.silent || !isRefreshed.value
  const isInitialLoad = !isRefreshed.value

  try {
    if (showLoading) {
      loading.value = true
    }
    const latestList: Subscribe[] = await api.get('subscribe/')
    if (generation !== fetchGeneration) return
    dataList.value = latestList
    if (isInitialLoad && activeTargetSubId.value) {
      void openTargetSubscribe(activeTargetSubId.value)
    }
    loadError.value = false
    isRefreshed.value = true
  } catch (error) {
    if (isCancel(error) || generation !== fetchGeneration) return
    console.error(error)
    loadError.value = true
    if (isInitialLoad) {
      isRefreshed.value = true
    }
    if (!context.silent || isInitialLoad) {
      $toast.error(t('subscribe.requestFailed'))
    }
  } finally {
    if (showLoading) {
      loading.value = false
    }
  }
}

// 单个订阅删除后立即本地剔除以触发 FLIP 弹性补位，后台静默同步最新列表
function handleRemoveSubscribe(removedId?: number) {
  if (typeof removedId === 'number' && Number.isFinite(removedId)) {
    ++fetchGeneration
    dataList.value = dataList.value.filter(item => item.id !== removedId)
    selectedSubscribes.value = selectedSubscribes.value.filter(id => id !== removedId)
  }
  void fetchData({ silent: true })
}

// 历史记录窗口完成
function historyDone() {
  fetchData()
}

function openHistoryDialog() {
  openSharedDialog(
    SubscribeHistoryDialog,
    { type: props.type },
    {
      save: historyDone,
    },
    { closeOn: ['close', 'save'] },
  )
}

// 向父组件同步批量操作状态，供 Footer/FAB 动态按钮渲染。
function emitBatchStateChange() {
  emit('batch-state-change', {
    enabled: isBatchMode.value,
    selectedCount: selectedSubscribes.value.length,
    totalCount: displayList.value.length,
    allSelected: isAllSubscribesSelected.value,
    operating: batchOperating.value,
  })
}

// 进入批量模式。
function enterBatchMode() {
  isBatchMode.value = true
}

// 退出批量模式并清空已选择的订阅。
function exitBatchMode() {
  isBatchMode.value = false
  selectedSubscribes.value = []
}

// 切换批量模式。
function toggleBatchMode() {
  if (isBatchMode.value) {
    exitBatchMode()
    return
  }

  enterBatchMode()
}

// 全选或取消全选当前显示的订阅。
function toggleSelectAll() {
  if (isAllSubscribesSelected.value) {
    selectedSubscribes.value = []
  } else {
    selectedSubscribes.value = displayList.value.map(item => item.id)
  }
}

// 切换单个订阅的选中状态。
function toggleSelectSubscribe(id: number) {
  const index = selectedSubscribes.value.indexOf(id)
  if (index > -1) {
    selectedSubscribes.value.splice(index, 1)
  } else {
    selectedSubscribes.value.push(id)
  }
}

// 批量删除已选中的订阅。
async function batchDeleteSubscribes() {
  if (batchOperating.value) return
  if (selectedSubscribes.value.length === 0) {
    $toast.warning(t('subscribe.noSelectedItems'))
    return
  }

  const isConfirmed = await createConfirm({
    title: t('common.confirm'),
    content: t('subscribe.batchDeleteConfirm', { count: selectedSubscribes.value.length }),
  })

  if (!isConfirmed) return

  batchOperating.value = true
  try {
    loading.value = true
    const targetIds = [...selectedSubscribes.value]
    const promises = targetIds.map(id => api.delete(`subscribe/${id}`))
    const results = await Promise.allSettled(promises)

    const succeededIds = new Set<number>()
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && (result.value as { success?: boolean } | undefined)?.success !== false) {
        succeededIds.add(targetIds[index])
      }
    })
    const successCount = succeededIds.size
    const failedCount = results.length - successCount

    if (successCount > 0) {
      ++fetchGeneration
      dataList.value = dataList.value.filter(item => !succeededIds.has(item.id))
      $toast.success(t('subscribe.batchDeleteSuccess', { count: successCount }))
    }
    if (failedCount > 0) {
      $toast.error(t('subscribe.batchDeleteFailed', { count: failedCount }))
    }

    exitBatchMode()
    void fetchData({ silent: true })
  } catch (error) {
    console.error(error)
    $toast.error(t('subscribe.batchDeleteError'))
  } finally {
    batchOperating.value = false
    loading.value = false
  }
}

// 批量启用已选中的订阅。
async function batchEnableSubscribes() {
  if (batchOperating.value) return
  if (selectedSubscribes.value.length === 0) {
    $toast.warning(t('subscribe.noSelectedItems'))
    return
  }

  const isConfirmed = await createConfirm({
    title: t('common.confirm'),
    content: t('subscribe.batchEnableConfirm', { count: selectedSubscribes.value.length }),
  })

  if (!isConfirmed) return

  batchOperating.value = true
  try {
    loading.value = true
    const promises = selectedSubscribes.value.map(
      id => api.put(`subscribe/status/${id}?state=R`) as unknown as Promise<{ success: boolean }>,
    )
    const results = await Promise.allSettled(promises)

    const successCount = results.filter(
      result => result.status === 'fulfilled' && result.value?.success === true,
    ).length
    const failedCount = results.length - successCount

    if (successCount > 0) {
      $toast.success(t('subscribe.batchEnableSuccess', { count: successCount }))
    }
    if (failedCount > 0) {
      $toast.error(t('subscribe.batchEnableFailed', { count: failedCount }))
    }

    await fetchData()
    exitBatchMode()
  } catch (error) {
    console.error(error)
    $toast.error(t('subscribe.batchEnableError'))
  } finally {
    batchOperating.value = false
    loading.value = false
  }
}

// 批量暂停已选中的订阅。
async function batchPauseSubscribes() {
  if (batchOperating.value) return
  if (selectedSubscribes.value.length === 0) {
    $toast.warning(t('subscribe.noSelectedItems'))
    return
  }

  const isConfirmed = await createConfirm({
    title: t('common.confirm'),
    content: t('subscribe.batchPauseConfirm', { count: selectedSubscribes.value.length }),
  })

  if (!isConfirmed) return

  batchOperating.value = true
  try {
    loading.value = true
    const promises = selectedSubscribes.value.map(
      id => api.put(`subscribe/status/${id}?state=S`) as unknown as Promise<{ success: boolean }>,
    )
    const results = await Promise.allSettled(promises)

    const successCount = results.filter(
      result => result.status === 'fulfilled' && result.value?.success === true,
    ).length
    const failedCount = results.length - successCount

    if (successCount > 0) {
      $toast.success(t('subscribe.batchPauseSuccess', { count: successCount }))
    }
    if (failedCount > 0) {
      $toast.error(t('subscribe.batchPauseFailed', { count: failedCount }))
    }

    await fetchData()
    exitBatchMode()
  } catch (error) {
    console.error(error)
    $toast.error(t('subscribe.batchPauseError'))
  } finally {
    batchOperating.value = false
    loading.value = false
  }
}

// 错误描述
const errorDescription = computed(() => {
  if ((props.statusFilter && props.statusFilter !== 'all') || props.keyword) {
    return t('common.tryChangingFilters')
  }
  return t('subscribe.noSubscribeData')
})

// 错误标题
const errorTitle = computed(() => {
  if ((props.statusFilter && props.statusFilter !== 'all') || props.keyword) {
    return t('common.noMatchingData')
  }
  return t('common.noData')
})

const { refresh: refreshSubscribes } = useKeepAliveRefresh(fetchData, {
  active: computed(() => props.active && pageActive.value),
})

onActivated(() => {
  pageActive.value = true
})
onDeactivated(() => {
  pageActive.value = false
})

watch(subscribeRevision, () => {
  if (pageActive.value && props.active) void refreshSubscribes()
})

onMounted(async () => {
  // 列表无需等待排序配置；二者并行，并让订阅完成后的刷新排在当前查询之后。
  await Promise.all([loadSubscribeOrderConfig(), refreshSubscribes()])
})

defineExpose({
  openHistoryDialog,
  enterBatchMode,
  exitBatchMode,
  toggleBatchMode,
  toggleSelectAll,
  batchEnableSubscribes,
  batchPauseSubscribes,
  batchDeleteSubscribes,
})
</script>

<template>
  <LoadingBanner v-if="!isRefreshed" class="mt-12" />

  <VAlert v-if="loadError" type="error" variant="tonal" class="mb-4 mx-2">
    {{ t('subscribe.requestFailed') }}
  </VAlert>

  <VAlert v-if="sortMode" color="warning" variant="tonal" class="mb-3 mx-2 py-0 app-surface-static">
    <div class="d-flex flex-wrap align-center justify-space-between gap-2 py-2">
      <span class="text-body-2">{{ t('common.sortModeHint') }}</span>
      <VBtn size="small" rounded="lg" variant="tonal" color="error" @click="sortMode = false">
        {{ t('common.exit') }}
      </VBtn>
    </div>
  </VAlert>

  <draggable
    v-if="displayList.length > 0 && canDragSort"
    v-model="displayList"
    @end="saveSubscribeOrder"
    item-key="id"
    tag="div"
    :component-data="{ class: 'grid gap-4 grid-subscribe-card' }"
  >
    <template #item="{ element }">
      <SubscribeCard
        :key="element.id"
        :media="element"
        :batch-mode="isBatchMode"
        :selected="selectedSubscribesSet.has(element.id)"
        :sortable="true"
        @remove="handleRemoveSubscribe"
        @save="fetchData"
        @select="toggleSelectSubscribe(element.id)"
      />
    </template>
  </draggable>
  <ProgressiveCardGrid
    v-else-if="displayList.length > 0 && shouldVirtualizeList"
    :items="displayList"
    :get-item-key="item => item.id"
    :min-item-width="subscribeGridMinItemWidth"
    :estimated-item-height="subscribeGridEstimatedItemHeight"
    :gap="subscribeGridGap"
    :scroll-to-index="scrollToIndex"
  >
    <template #default="{ item }">
      <SubscribeCard
        :key="item.id"
        :media="item"
        :batch-mode="isBatchMode"
        :selected="selectedSubscribesSet.has(item.id)"
        :sortable="false"
        @remove="handleRemoveSubscribe"
        @save="fetchData"
        @select="toggleSelectSubscribe(item.id)"
      />
    </template>
  </ProgressiveCardGrid>
  <NoDataFound
    v-if="displayList.length === 0 && isRefreshed && !loadError"
    error-code="404"
    :error-title="errorTitle"
    :error-description="errorDescription"
  />
</template>
