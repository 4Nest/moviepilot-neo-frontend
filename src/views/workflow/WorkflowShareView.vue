<script lang="ts" setup>
import { debounce } from 'lodash-es'
import api from '@/api'
import type { ApiResponse, WorkflowShare } from '@/api/types'
import NoDataFound from '@/components/states/NoDataFound.vue'
import WorkflowShareCard from '@/components/cards/WorkflowShareCard.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { useI18n } from '@/composables/useChineseText'
import { useConfirm } from '@/composables/useConfirm'
import { useGlobalSettingsStore, useUserStore } from '@/stores'
import { canDeleteWorkflowShare, isOwnShare, runConcurrentBatches } from '@/utils/sharePermissions'
import { useToast } from 'vue-toastification'

type WorkflowSortType = 'time' | 'count'
type ShareScope = 'all' | 'mine'

const MAX_MINE_AUTO_PAGES = 5
const BATCH_DELETE_CONCURRENCY = 4

// 国际化与全局状态
const { t } = useI18n()
const $toast = useToast()
const createConfirm = useConfirm()
const globalSettingsStore = useGlobalSettingsStore()
const userStore = useUserStore()

// 输入参数
const props = defineProps({
  // 父级传入的过滤关键字
  keyword: String,
})

// 定义事件
const emit = defineEmits(['update'])

// 判断是否有滚动条
function hasScroll() {
  return document.body.scrollHeight - (window.innerHeight || document.documentElement.clientHeight) > 2
}

// API
const apipath = 'workflow/shares'

// 分页与请求代次状态
const page = ref(1)
const currentKey = ref(0)
const isRefreshed = ref(false)
const loadError = ref(false)
const hasReachedEnd = ref(false)
const mineScanPaused = ref(false)

// 搜索、排序与范围状态
const keyword = ref(props.keyword?.trim() || '')
const searchInput = ref(props.keyword || '')
const sortType = ref<WorkflowSortType>('time')
const shareScope = ref<ShareScope>('all')

// 数据与事件类型列表
const dataList = ref<WorkflowShare[]>([])
const eventTypes = ref<Array<{ title: string; value: string }>>([])

// 批量管理状态
const isBatchMode = ref(false)
const batchDeleting = ref(false)
const selectedShareIds = ref<Set<string>>(new Set())

// 代次锁消除新旧分页/搜索请求竞态与 loading 死锁
let requestGeneration = 0
const loadingGenerations = new Set<number>()

const userUniqueId = computed(() => globalSettingsStore.globalSettings.USER_UNIQUE_ID)
const canManageAllShares = computed(() => Boolean(globalSettingsStore.globalSettings.WORKFLOW_SHARE_MANAGE))

function isShareDeletable(item?: WorkflowShare): boolean {
  return canDeleteWorkflowShare(item, {
    superUser: userStore.superUser,
    userUniqueId: userUniqueId.value,
    canManageAll: canManageAllShares.value,
  })
}

// 归属过滤与排序后的展示列表
const displayedShareList = computed(() => {
  const scoped =
    shareScope.value === 'mine'
      ? dataList.value.filter(item => isOwnShare(item.share_uid, userUniqueId.value))
      : dataList.value

  if (sortType.value === 'count') {
    return [...scoped].sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
  }
  return scoped
})

const deletableDisplayedShares = computed(() =>
  displayedShareList.value.filter(item => Boolean(item.id) && isShareDeletable(item)),
)

const hasOwnSharesInList = computed(() => dataList.value.some(item => isOwnShare(item.share_uid, userUniqueId.value)))

const showManageButton = computed(
  () =>
    isBatchMode.value ||
    (userStore.superUser && (canManageAllShares.value || (dataList.value.length > 0 && hasOwnSharesInList.value))),
)

const isAllDeletableSelected = computed(
  () =>
    deletableDisplayedShares.value.length > 0 &&
    deletableDisplayedShares.value.every(item => item.id !== undefined && selectedShareIds.value.has(String(item.id))),
)

function resetData() {
  requestGeneration++
  dataList.value = []
  page.value = 1
  isRefreshed.value = false
  loadError.value = false
  hasReachedEnd.value = false
  mineScanPaused.value = false
  selectedShareIds.value = new Set()
  currentKey.value++
}

const debouncedKeywordUpdate = debounce((nextValue: string) => {
  const normalized = nextValue.trim()
  if (keyword.value === normalized) return
  keyword.value = normalized
  resetData()
}, 300)

function handleSearchInputUpdate(value: string | null) {
  const raw = value ?? ''
  searchInput.value = raw
  if (!raw.trim()) {
    debouncedKeywordUpdate.cancel()
    if (keyword.value !== '') {
      keyword.value = ''
      resetData()
    }
    return
  }
  debouncedKeywordUpdate(raw)
}

watch(
  () => props.keyword,
  newKeyword => {
    debouncedKeywordUpdate.cancel()
    const nextVal = newKeyword || ''
    searchInput.value = nextVal
    const normalized = nextVal.trim()
    keyword.value = normalized
    resetData()
  },
)

function selectSortType(nextSort: WorkflowSortType) {
  if (sortType.value === nextSort) return
  sortType.value = nextSort
  resetData()
}

function selectShareScope(nextScope: ShareScope) {
  if (shareScope.value === nextScope) return
  shareScope.value = nextScope
  mineScanPaused.value = false
  if (isBatchMode.value) {
    const allowedIds = new Set(deletableDisplayedShares.value.map(item => String(item.id)).filter(Boolean))
    selectedShareIds.value = new Set([...selectedShareIds.value].filter(id => allowedIds.has(id)))
  }
  if (nextScope === 'mine' && !hasReachedEnd.value && !hasScroll()) {
    void scanMorePages()
  }
}

// 加载事件类型列表
async function loadEventTypes() {
  try {
    eventTypes.value = await api.get('workflow/event_types')
  } catch (error) {
    console.error('Failed to load event types:', error)
  }
}

// 拼装参数
function getParams() {
  const params: Record<string, string | number> = {
    page: page.value,
    count: 30,
    name: keyword.value,
  }
  if (sortType.value !== 'time') {
    params.sort_type = sortType.value
  }
  return params
}

// 分页合并去重
function appendUniqueWorkflows(incoming: WorkflowShare[]) {
  if (incoming.length === 0) return
  const existingIds = new Set(
    dataList.value.map(item => (item.id !== undefined ? String(item.id) : '')).filter(Boolean),
  )
  const uniqueItems = incoming.filter(item => item.id === undefined || !existingIds.has(String(item.id)))
  if (uniqueItems.length > 0) {
    dataList.value = [...dataList.value, ...uniqueItems]
  }
}

// 获取列表数据（代数锁 + 完整异常恢复）
async function fetchData({ done }: { done: (status: 'empty' | 'error' | 'ok') => void }) {
  const generation = requestGeneration

  if (loadingGenerations.has(generation)) {
    return
  }

  loadingGenerations.add(generation)
  loadError.value = false
  mineScanPaused.value = false

  try {
    let scannedPagesInPass = 0
    while (generation === requestGeneration) {
      const currentData: WorkflowShare[] = await api.get(apipath, {
        params: getParams(),
      })

      if (generation !== requestGeneration) return

      isRefreshed.value = true
      if (currentData.length === 0) {
        hasReachedEnd.value = true
        done('empty')
        return
      }

      appendUniqueWorkflows(currentData)
      page.value++
      scannedPagesInPass++
      done('ok')
      await nextTick()

      if (hasScroll()) return

      if (shareScope.value === 'mine' && scannedPagesInPass >= MAX_MINE_AUTO_PAGES) {
        mineScanPaused.value = true
        return
      }
    }
  } catch (error) {
    if (generation !== requestGeneration) return

    console.error(error)
    isRefreshed.value = true
    loadError.value = true
    done('error')
  } finally {
    loadingGenerations.delete(generation)
  }
}

async function scanMorePages() {
  const generation = requestGeneration
  if (hasReachedEnd.value || loadingGenerations.has(generation)) return

  loadingGenerations.add(generation)
  mineScanPaused.value = false
  try {
    let scanned = 0
    while (generation === requestGeneration && !hasReachedEnd.value) {
      const currentData: WorkflowShare[] = await api.get(apipath, {
        params: getParams(),
      })
      if (generation !== requestGeneration) return
      if (currentData.length === 0) {
        hasReachedEnd.value = true
        return
      }
      appendUniqueWorkflows(currentData)
      page.value++
      scanned++
      await nextTick()
      if (hasScroll()) return
      if (shareScope.value === 'mine' && scanned >= MAX_MINE_AUTO_PAGES) {
        mineScanPaused.value = true
        return
      }
      if (shareScope.value !== 'mine') return
    }
  } catch (error) {
    console.error(error)
  } finally {
    loadingGenerations.delete(generation)
  }
}

// 将数据从列表中移除
function removeData(id: string) {
  const normalizedId = String(id)
  dataList.value = dataList.value.filter(item => String(item.id) !== normalizedId)
  if (selectedShareIds.value.has(normalizedId)) {
    const nextSet = new Set(selectedShareIds.value)
    nextSet.delete(normalizedId)
    selectedShareIds.value = nextSet
  }
  void nextTick(() => {
    if (!hasScroll() && !hasReachedEnd.value) {
      void scanMorePages()
    }
  })
}

function toggleBatchMode() {
  isBatchMode.value = !isBatchMode.value
  if (!isBatchMode.value) {
    selectedShareIds.value = new Set()
  }
}

function toggleSelectShare(item: WorkflowShare) {
  const id = item.id !== undefined ? String(item.id) : ''
  if (!id || !isShareDeletable(item)) return

  const nextSet = new Set(selectedShareIds.value)
  if (nextSet.has(id)) nextSet.delete(id)
  else nextSet.add(id)
  selectedShareIds.value = nextSet
}

function toggleSelectAllDeletable() {
  if (isAllDeletableSelected.value) {
    selectedShareIds.value = new Set()
    return
  }
  selectedShareIds.value = new Set(
    deletableDisplayedShares.value.map(item => (item.id !== undefined ? String(item.id) : '')).filter(Boolean),
  )
}

async function batchDelete() {
  if (batchDeleting.value || selectedShareIds.value.size === 0) return

  const targetItems = dataList.value.filter(
    item => item.id !== undefined && selectedShareIds.value.has(String(item.id)) && isShareDeletable(item),
  )
  if (targetItems.length === 0) return

  const isConfirmed = await createConfirm({
    title: t('common.confirm'),
    content: t('workflow.batchCancelShareConfirm', { count: targetItems.length }),
  })
  if (!isConfirmed) return

  batchDeleting.value = true
  try {
    const results = await runConcurrentBatches(targetItems, BATCH_DELETE_CONCURRENCY, item =>
      api.delete<ApiResponse<unknown>, ApiResponse<unknown>>(`workflow/share/${item.id}`, {
        params: {
          share_uid: item.share_uid || userUniqueId.value,
        },
      }),
    )

    const succeededIds = new Set<string>()
    const failedIds: string[] = []
    let firstErrorReason = ''

    results.forEach((settled, index) => {
      const targetId = String(targetItems[index].id)
      if (settled.status === 'fulfilled' && settled.value?.success) {
        succeededIds.add(targetId)
        return
      }
      failedIds.push(targetId)
      if (!firstErrorReason) {
        if (settled.status === 'fulfilled') {
          firstErrorReason = settled.value?.message?.trim() || ''
        } else {
          const responseMsg = (settled.reason as { response?: { data?: { message?: string } } })?.response?.data
            ?.message
          firstErrorReason = responseMsg?.trim() || ''
        }
      }
    })

    if (succeededIds.size > 0) {
      dataList.value = dataList.value.filter(item => item.id === undefined || !succeededIds.has(String(item.id)))
    }

    if (failedIds.length > 0) {
      selectedShareIds.value = new Set(failedIds)
      $toast.error(
        firstErrorReason
          ? t('workflow.batchCancelShareFailedDetail', { count: failedIds.length, message: firstErrorReason })
          : t('workflow.batchCancelShareFailed', { count: failedIds.length }),
      )
    } else {
      selectedShareIds.value = new Set()
      isBatchMode.value = false
      $toast.success(t('workflow.batchCancelShareSuccess', { count: succeededIds.size }))
    }

    await nextTick()
    if (!hasScroll() && !hasReachedEnd.value) {
      void scanMorePages()
    }
  } finally {
    batchDeleting.value = false
  }
}

onMounted(() => {
  loadEventTypes()
})

onUnmounted(() => {
  debouncedKeywordUpdate.cancel()
})
</script>

<template>
  <!-- 紧凑一体化顶部控制栏 -->
  <div class="workflow-share-toolbar mb-3">
    <div class="workflow-share-toolbar__main">
      <VTextField
        :model-value="searchInput"
        :placeholder="t('workflow.searchShares')"
        prepend-inner-icon="mdi-magnify"
        density="compact"
        variant="outlined"
        hide-details
        clearable
        class="workflow-share-toolbar__search"
        @update:model-value="handleSearchInputUpdate"
        @click:clear="handleSearchInputUpdate('')"
      />

      <div class="workflow-share-toolbar__pills" role="group" :aria-label="t('tmdb.sort')">
        <VChip
          :color="sortType === 'time' ? 'primary' : undefined"
          :variant="sortType === 'time' ? 'flat' : 'tonal'"
          prepend-icon="mdi-clock-outline"
          size="small"
          class="workflow-share-toolbar__pill"
          @click="selectSortType('time')"
        >
          {{ t('tmdb.sortType.time') }}
        </VChip>
        <VChip
          :color="sortType === 'count' ? 'primary' : undefined"
          :variant="sortType === 'count' ? 'flat' : 'tonal'"
          prepend-icon="mdi-fire"
          size="small"
          class="workflow-share-toolbar__pill"
          @click="selectSortType('count')"
        >
          {{ t('subscribe.sortCountHot') }}
        </VChip>
      </div>

      <div v-if="userUniqueId" class="workflow-share-toolbar__pills" role="group">
        <VChip
          :color="shareScope === 'all' ? 'primary' : undefined"
          :variant="shareScope === 'all' ? 'flat' : 'tonal'"
          size="small"
          class="workflow-share-toolbar__pill"
          @click="selectShareScope('all')"
        >
          {{ t('subscribe.shareScopeAll') }}
        </VChip>
        <VChip
          :color="shareScope === 'mine' ? 'success' : undefined"
          :variant="shareScope === 'mine' ? 'flat' : 'tonal'"
          prepend-icon="mdi-account-check-outline"
          size="small"
          class="workflow-share-toolbar__pill"
          @click="selectShareScope('mine')"
        >
          {{ t('subscribe.shareScopeMine') }}
        </VChip>
      </div>

      <div v-if="showManageButton" class="workflow-share-toolbar__actions">
        <VBtn
          :color="isBatchMode ? 'primary' : undefined"
          :variant="isBatchMode ? 'flat' : 'tonal'"
          size="small"
          rounded="lg"
          @click="toggleBatchMode"
        >
          <template #prepend>
            <VIcon :icon="isBatchMode ? 'mdi-close' : 'mdi-checkbox-multiple-marked-outline'" />
          </template>
          {{ isBatchMode ? t('subscribe.exitBatchMode') : t('subscribe.batchManage') }}
        </VBtn>
      </div>
    </div>

    <div v-if="isBatchMode" class="workflow-share-batch-bar mt-2">
      <span class="workflow-share-batch-bar__count">
        {{ t('subscribe.selectedSharesCount', { count: selectedShareIds.size }) }}
      </span>
      <div class="workflow-share-batch-bar__actions">
        <VBtn
          size="small"
          variant="tonal"
          color="primary"
          rounded="lg"
          :disabled="deletableDisplayedShares.length === 0 || batchDeleting"
          :prepend-icon="isAllDeletableSelected ? 'mdi-checkbox-blank-outline' : 'mdi-checkbox-multiple-marked'"
          @click="toggleSelectAllDeletable"
        >
          {{ isAllDeletableSelected ? t('subscribe.deselectAllShares') : t('subscribe.selectAllDeletable') }}
        </VBtn>
        <VBtn
          color="error"
          variant="flat"
          size="small"
          rounded="lg"
          prepend-icon="mdi-delete-outline"
          :loading="batchDeleting"
          :disabled="selectedShareIds.size === 0 || batchDeleting"
          @click="batchDelete"
        >
          {{ t('subscribe.deleteSelectedShares') }}
        </VBtn>
        <VBtn
          size="small"
          variant="tonal"
          color="secondary"
          rounded="lg"
          prepend-icon="mdi-close"
          :disabled="batchDeleting"
          @click="toggleBatchMode"
        >
          {{ t('subscribe.exitManageMode') }}
        </VBtn>
      </div>
    </div>
  </div>

  <VPageContentTitle
    v-if="keyword"
    :title="`${t('common.search')}：${keyword}`"
    class="workflow-share-search-heading"
  />
  <LoadingBanner v-if="!isRefreshed" class="mt-12" />
  <VInfiniteScroll
    mode="intersect"
    side="end"
    :items="displayedShareList"
    :margin="displayedShareList.length > 0 ? 480 : 0"
    class="overflow-visible"
    @load="fetchData"
    :key="currentKey"
  >
    <template #loading />
    <template #error="{ props: retryProps }">
      <div class="d-flex flex-column align-center ga-2 py-4" role="alert">
        <span class="text-medium-emphasis">{{ t('subscribe.requestFailed') }}</span>
        <VBtn v-bind="retryProps" prepend-icon="mdi-refresh" size="small" variant="tonal">
          {{ t('common.retry') }}
        </VBtn>
      </div>
    </template>
    <template #empty />
    <ProgressiveCardGrid
      v-if="displayedShareList.length > 0"
      :items="displayedShareList"
      :get-item-key="item => item.id || `${item.name}-${item.share_user}`"
      :min-item-width="288"
      :estimated-item-height="176"
      tabindex="0"
    >
      <template #default="{ item }">
        <WorkflowShareCard
          :workflow="item"
          :event-types="eventTypes"
          :batch-mode="isBatchMode"
          :deletable="isShareDeletable(item)"
          :selected="item.id !== undefined && selectedShareIds.has(String(item.id))"
          @delete="removeData(String(item.id || ''))"
          @toggle-select="toggleSelectShare(item)"
          @update="emit('update')"
        />
      </template>
    </ProgressiveCardGrid>

    <div
      v-if="shareScope === 'mine' && mineScanPaused && !hasReachedEnd"
      class="d-flex flex-wrap align-center justify-center ga-3 py-5"
    >
      <span class="text-body-2 text-medium-emphasis">{{ t('subscribe.mineSharesPausedHint') }}</span>
      <VBtn size="small" variant="tonal" color="primary" rounded="lg" @click="scanMorePages">
        {{ t('subscribe.loadMoreMineShares') }}
      </VBtn>
    </div>

    <NoDataFound
      v-if="displayedShareList.length === 0 && isRefreshed && !loadError && !mineScanPaused"
      error-code="404"
      :error-title="t('common.noData')"
      :error-description="keyword || shareScope === 'mine' ? t('common.noContent') : t('workflow.noShareData')"
    />
  </VInfiniteScroll>
</template>

<style lang="scss" scoped>
.workflow-share-toolbar__main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
}

.workflow-share-toolbar__search {
  flex: 1 1 200px;
  max-inline-size: 260px;
  min-inline-size: 160px;
}

.workflow-share-toolbar__search :deep(.v-field) {
  border-radius: 7px;
  font-size: 13px;
  min-block-size: 32px;
}

.workflow-share-toolbar__search :deep(.v-field__input) {
  min-block-size: 32px;
  padding-block: 4px;
}

.workflow-share-toolbar__pills {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}

.workflow-share-toolbar__pill {
  border-radius: 6px !important;
  block-size: 26px !important;
  cursor: pointer;
  font-size: 12.5px !important;
  font-weight: 500;
  padding-inline: 9px !important;
}

.workflow-share-toolbar__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-inline-start: auto;
}

.workflow-share-batch-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  border: 1px solid rgba(var(--v-theme-primary), 0.22);
  border-radius: 10px;
  background: rgba(var(--v-theme-primary), 0.06);
  gap: 8px;
  padding-block: 6px;
  padding-inline: 12px;
}

.workflow-share-batch-bar__count {
  color: rgb(var(--v-theme-primary));
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.workflow-share-batch-bar__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.workflow-share-search-heading,
.workflow-share-search-heading :deep(*) {
  font-size: 20px !important;
  font-weight: 600 !important;
  line-height: 1.35 !important;
  margin-block: 0 10px !important;
  padding-inline: 8px;
}

@media (width <= 680px) {
  .workflow-share-toolbar__search {
    flex: 1 1 100%;
    max-inline-size: none;
  }

  .workflow-share-toolbar__actions {
    margin-inline-start: 0;
  }
}
</style>
