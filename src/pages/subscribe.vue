<script setup lang="ts">
import SubscribeListView from '@/views/subscribe/SubscribeListView.vue'
import { useI18n } from '@/composables/useChineseText'
import { useDynamicHeaderTab } from '@/composables/useDynamicHeaderTab'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useUserStore } from '@/stores'
import { getSubscribeMovieTabs, getSubscribeTvTabs } from '@/router/i18n-menu'

// 国际化
const { t } = useI18n()

const route = useRoute()
const userStore = useUserStore()

// 非默认标签页和弹窗按需加载，避免进入订阅列表时同步下载分享/统计相关代码。
const SubscribeShareView = defineAsyncComponent(() => import('@/views/subscribe/SubscribeShareView.vue'))
const SubscribeEditDialog = defineAsyncComponent(() => import('@/components/dialog/SubscribeEditDialog.vue'))

const subType = route.meta.subType?.toString()
const subId = ref((route.query.id as string) || '')
const subscribeListViewRef = ref<InstanceType<typeof SubscribeListView> | null>(null)

// 订阅批量模式状态快照，来源于订阅列表组件。
interface SubscribeBatchState {
  enabled: boolean
  selectedCount: number
  totalCount: number
  allSelected: boolean
  operating?: boolean
}

const subscribeBatchState = ref<SubscribeBatchState>({
  enabled: false,
  selectedCount: 0,
  totalCount: 0,
  allSelected: false,
  operating: false,
})

// 获取当前用户可见的标签页白名单
const subscribeTabs = computed(() => {
  if (subType === '电影') {
    return getSubscribeMovieTabs(t)
  } else {
    return getSubscribeTvTabs(t)
  }
})

// 校验目标标签页是否属于当前用户可见列表，非超管或未知值自动回退到默认可见标签页。
function resolveValidSubscribeTab(candidate: unknown): string {
  const defaultTab = subscribeTabs.value[0]?.tab || 'mysub'
  if (typeof candidate === 'string' && subscribeTabs.value.some(item => item.tab === candidate)) {
    return candidate
  }
  return defaultTab
}

const hasShareTab = computed(() => subscribeTabs.value.some(item => item.tab === 'share'))
const activeTab = ref(resolveValidSubscribeTab(route.query.tab))

// 订阅过滤弹窗
const filterSubscribeDialog = ref(false)

// 排序模式
const subscribeSortMode = ref(false)

// 订阅过滤词
const subscribeFilter = ref('')

// 订阅状态筛选
const subscribeStatusFilter = ref<string | null>(null)

type SubscribeSortBy = 'custom' | 'last_update' | 'date' | 'lack_episode'

const subscribeSortStorageKeyPrefix = 'MPSubscribeSortBy'

// 获取当前订阅类型对应的排序本地存储键。
function getSubscribeSortStorageKey() {
  return `${subscribeSortStorageKeyPrefix}:${subType || 'default'}`
}

// 判断排序值是否适用于当前订阅类型。
function isValidSubscribeSortBy(value: string | null): value is SubscribeSortBy {
  if (!value) return false

  const sortValues: SubscribeSortBy[] = ['custom', 'last_update', 'date']
  if (subType !== '电影') {
    sortValues.push('lack_episode')
  }

  return sortValues.includes(value as SubscribeSortBy)
}

// 从本地读取上次选择的订阅排序方式。
function loadSubscribeSortBy() {
  try {
    const storedSortBy = localStorage.getItem(getSubscribeSortStorageKey())
    return isValidSubscribeSortBy(storedSortBy) ? storedSortBy : ''
  } catch (error) {
    console.warn('读取订阅排序方式失败:', error)
    return ''
  }
}

// 保存当前选择的订阅排序方式到本地。
function saveSubscribeSortBy(value: SubscribeSortBy | '') {
  try {
    const storageKey = getSubscribeSortStorageKey()
    if (value) {
      localStorage.setItem(storageKey, value)
    } else {
      localStorage.removeItem(storageKey)
    }
  } catch (error) {
    console.warn('保存订阅排序方式失败:', error)
  }
}

// 订阅排序方式
const subscribeSortBy = ref<SubscribeSortBy | ''>(loadSubscribeSortBy())

// 筛选选项
const filterOptions = computed(() => {
  const baseOptions = [
    { value: 'all', label: t('common.all'), icon: 'mdi-filter-multiple-outline' },
    { value: 'best_version', label: t('subscribe.bestVersion'), icon: 'mdi-refresh', color: 'warning' },
  ]

  // 电影只显示基本选项和状态选项
  if (subType === '电影') {
    return [
      ...baseOptions,
      { value: 'pending', label: t('subscribe.pending'), icon: 'mdi-help-circle', color: 'secondary' },
      { value: 'paused', label: t('subscribe.paused'), icon: 'mdi-pause-circle', color: 'error' },
    ]
  }

  // 电视剧显示所有选项
  return [
    ...baseOptions,
    { value: 'not_started', label: t('subscribe.notStarted'), icon: 'mdi-clock-outline', color: 'secondary' },
    { value: 'subscribing', label: t('subscribe.subscribing'), icon: 'mdi-download', color: 'info' },
    { value: 'pending', label: t('subscribe.pending'), icon: 'mdi-help-circle', color: 'secondary' },
    { value: 'paused', label: t('subscribe.paused'), icon: 'mdi-pause-circle', color: 'error' },
    { value: 'completed', label: t('subscribe.completed'), icon: 'mdi-check-circle', color: 'success' },
  ]
})

// 排序选项
const sortOptions = computed<Array<{ value: SubscribeSortBy; label: string }>>(() => {
  const options: Array<{ value: SubscribeSortBy; label: string }> = [
    { value: 'custom', label: t('subscribe.sort.custom') },
    { value: 'last_update', label: t('subscribe.sort.lastUpdate') },
    { value: 'date', label: t('subscribe.sort.addTime') },
  ]

  if (subType !== '电影') {
    options.push({ value: 'lack_episode', label: t('subscribe.sort.lackEpisode') })
  }

  return options
})

// 当前选中的排序选项
const currentSortBy = computed<SubscribeSortBy>(() => {
  if (subscribeSortBy.value && sortOptions.value.some(option => option.value === subscribeSortBy.value)) {
    return subscribeSortBy.value
  }

  return 'date'
})

// 当前选中的筛选选项
const currentFilter = computed(() => {
  return filterOptions.value.find(option => option.value === (subscribeStatusFilter.value || 'all'))
})

// 计算筛选按钮颜色 - 有名称筛选或状态筛选时高亮
const filterButtonColor = computed(() => {
  if (subscribeFilter.value || (subscribeStatusFilter.value && subscribeStatusFilter.value !== 'all')) {
    return currentFilter.value?.color || 'primary'
  }
  return ''
})

// 选择筛选选项
function selectFilter(value: string) {
  subscribeStatusFilter.value = value
  filterSubscribeDialog.value = false
}

// 选择订阅排序选项，非自定义排序会退出拖拽排序模式。
function selectSubscribeSort(value: SubscribeSortBy) {
  if (!sortOptions.value.some(option => option.value === value)) {
    return
  }

  subscribeSortBy.value = value
  if (value !== 'custom') {
    subscribeSortMode.value = false
  }
}

// VMenu activator选择器
const filterActivator = computed(() => '[data-menu-activator="filter-btn"]')

const showDefaultRuleAction = computed(() => userStore.superUser && activeTab.value === 'mysub')
const showSubscribeHistoryAction = computed(() => activeTab.value === 'mysub')

function openDefaultRuleDialog() {
  openSharedDialog(
    SubscribeEditDialog,
    {
      default: true,
      type: subType,
    },
    {},
    { closeOn: ['close', 'save'] },
  )
}

function openSubscribeHistoryDialog() {
  subscribeListViewRef.value?.openHistoryDialog()
}

// 订阅列表批量状态变化响应，用于驱动移动端 Footer 和桌面 FAB 操作按钮。
function handleSubscribeBatchStateChange(state: SubscribeBatchState) {
  subscribeBatchState.value = state
}

// 重置父页面保存的订阅批量操作状态。
function resetSubscribeBatchState() {
  subscribeBatchState.value = {
    enabled: false,
    selectedCount: 0,
    totalCount: 0,
    allSelected: false,
    operating: false,
  }
}

// 进入订阅批量操作模式。
function enterSubscribeBatchMode() {
  subscribeListViewRef.value?.enterBatchMode()
}

// 退出订阅批量操作模式。
function exitSubscribeBatchMode() {
  resetSubscribeBatchState()
  subscribeListViewRef.value?.exitBatchMode()
}

// 切换当前订阅列表全选状态。
function toggleSubscribeBatchSelectAll() {
  subscribeListViewRef.value?.toggleSelectAll()
}

// 批量启用已选订阅。
function batchEnableSelectedSubscribes() {
  subscribeListViewRef.value?.batchEnableSubscribes()
}

// 批量暂停已选订阅。
function batchPauseSelectedSubscribes() {
  subscribeListViewRef.value?.batchPauseSubscribes()
}

// 批量删除已选订阅。
function batchDeleteSelectedSubscribes() {
  subscribeListViewRef.value?.batchDeleteSubscribes()
}

// 批量选择与拖拽排序互斥，进入排序模式时清空批量选择。
function toggleSubscribeSortMode() {
  const nextSortMode = !subscribeSortMode.value

  if (nextSortMode) {
    if (subscribeBatchState.value.enabled) {
      exitSubscribeBatchMode()
    }
    subscribeSortBy.value = 'custom'
  }

  subscribeSortMode.value = nextSortMode
}

watch(
  () => route.query.tab,
  nextQueryTab => {
    activeTab.value = resolveValidSubscribeTab(nextQueryTab)
  },
)

watch(
  () => route.query.id,
  nextQueryId => {
    const normalizedId = typeof nextQueryId === 'string' ? nextQueryId : ''
    subId.value = normalizedId
    if (normalizedId && activeTab.value !== 'mysub') {
      activeTab.value = 'mysub'
    }
  },
)

watch(subscribeTabs, () => {
  const validTab = resolveValidSubscribeTab(activeTab.value)
  if (activeTab.value !== validTab) {
    activeTab.value = validTab
  }
})

watch(activeTab, newTab => {
  const validTab = resolveValidSubscribeTab(newTab)
  if (newTab !== validTab) {
    activeTab.value = validTab
    return
  }

  if (newTab !== 'mysub' && subscribeBatchState.value.enabled) {
    exitSubscribeBatchMode()
  }
})

watch(subscribeSortBy, newSortBy => {
  saveSubscribeSortBy(newSortBy)
})

// 使用动态标签页
const { registerHeaderTab } = useDynamicHeaderTab()

// 注册动态标签页
registerHeaderTab({
  items: subscribeTabs,
  modelValue: activeTab,
  appendButtons: [
    {
      title: t('dialog.subscribeHistory.title', { type: subType }),
      label: t('dialog.subscribeHistory.title', { type: subType }),
      icon: 'mdi-history',
      variant: 'outlined',
      testId: 'subscribe-history-btn',
      action: openSubscribeHistoryDialog,
      show: computed(() => showSubscribeHistoryAction.value),
    },
    {
      title: t('dialog.subscribeEdit.titleDefault'),
      label: t('dialog.subscribeEdit.titleDefault'),
      icon: 'mdi-clipboard-edit-outline',
      variant: 'outlined',
      testId: 'subscribe-default-rule-btn',
      action: openDefaultRuleDialog,
      show: computed(() => showDefaultRuleAction.value),
    },
    {
      title: t('common.filter'),
      icon: 'mdi-filter-multiple-outline',
      variant: 'text',
      color: filterButtonColor,
      class: 'settings-icon-button',
      dataAttr: 'filter-btn',
      action: () => {
        filterSubscribeDialog.value = true
      },
      show: computed(() => activeTab.value === 'mysub'),
    },
    {
      title: t('common.sortMode'),
      icon: 'mdi-sort-variant',
      variant: 'text',
      color: computed(() => (subscribeSortMode.value ? 'primary' : '')),
      class: 'settings-icon-button',
      action: toggleSubscribeSortMode,
      show: computed(() => activeTab.value === 'mysub'),
    },
    {
      title: t('subscribe.batchManage'),
      icon: 'mdi-checkbox-multiple-marked-outline',
      variant: 'text',
      color: computed(() => (subscribeBatchState.value.enabled ? 'primary' : '')),
      class: 'settings-icon-button',
      action: () => {
        if (subscribeBatchState.value.enabled) {
          exitSubscribeBatchMode()
          return
        }

        enterSubscribeBatchMode()
      },
      show: computed(() => activeTab.value === 'mysub'),
    },
  ],
})

// 注册动态标签页
onMounted(() => {
  activeTab.value = resolveValidSubscribeTab(activeTab.value)
})
</script>

<template>
  <div>
    <VWindow v-model="activeTab" class="disable-tab-transition content-window" :touch="false">
      <VWindowItem value="mysub">
        <div>
          <div
            v-if="
              route.path.startsWith(`/subscribe/${subType === '电影' ? 'movie' : 'tv'}`) && subscribeBatchState.enabled
            "
            class="mp-page-action-bar"
          >
            <VChip size="small" color="primary" variant="tonal" rounded="lg" class="me-auto">
              {{
                t('subscribe.selectedCount', {
                  count: subscribeBatchState.selectedCount,
                  total: subscribeBatchState.totalCount,
                })
              }}
            </VChip>
            <VBtn
              size="small"
              variant="outlined"
              rounded="lg"
              :prepend-icon="
                subscribeBatchState.allSelected ? 'mdi-checkbox-blank-outline' : 'mdi-checkbox-multiple-marked'
              "
              :disabled="subscribeBatchState.totalCount === 0 || Boolean(subscribeBatchState.operating)"
              @click="toggleSubscribeBatchSelectAll"
            >
              {{ subscribeBatchState.allSelected ? t('subscribe.batchDeselectAll') : t('subscribe.batchSelectAll') }}
            </VBtn>
            <VBtn
              size="small"
              variant="outlined"
              rounded="lg"
              prepend-icon="mdi-play"
              :disabled="subscribeBatchState.selectedCount === 0 || Boolean(subscribeBatchState.operating)"
              @click="batchEnableSelectedSubscribes"
            >
              {{ t('subscribe.batchEnable') }}
            </VBtn>
            <VBtn
              size="small"
              variant="outlined"
              rounded="lg"
              prepend-icon="mdi-pause"
              :disabled="subscribeBatchState.selectedCount === 0 || Boolean(subscribeBatchState.operating)"
              @click="batchPauseSelectedSubscribes"
            >
              {{ t('subscribe.batchPause') }}
            </VBtn>
            <VBtn
              size="small"
              variant="outlined"
              color="error"
              rounded="lg"
              prepend-icon="mdi-delete"
              :disabled="subscribeBatchState.selectedCount === 0 || Boolean(subscribeBatchState.operating)"
              @click="batchDeleteSelectedSubscribes"
            >
              {{ t('subscribe.batchDelete') }}
            </VBtn>
            <VBtn
              size="small"
              variant="outlined"
              rounded="lg"
              prepend-icon="mdi-close"
              :disabled="Boolean(subscribeBatchState.operating)"
              @click="exitSubscribeBatchMode"
            >
              {{ t('subscribe.exitBatchMode') }}
            </VBtn>
          </div>

          <SubscribeListView
            ref="subscribeListViewRef"
            :type="subType"
            :subid="subId"
            :keyword="subscribeFilter"
            :status-filter="subscribeStatusFilter ?? ''"
            :sort-mode="subscribeSortMode"
            :sort-by="subscribeSortBy"
            :active="activeTab === 'mysub'"
            @update:sort-mode="subscribeSortMode = $event"
            @update:sort-by="subscribeSortBy = $event"
            @batch-state-change="handleSubscribeBatchStateChange"
          />
        </div>
      </VWindowItem>

      <VWindowItem v-if="hasShareTab" value="share">
        <div>
          <SubscribeShareView />
        </div>
      </VWindowItem>
    </VWindow>

    <!-- 订阅过滤下拉菜单 -->
    <Teleport to="body" v-if="filterSubscribeDialog">
      <VMenu
        v-model="filterSubscribeDialog"
        :close-on-content-click="false"
        :activator="filterActivator"
        location="bottom end"
      >
        <VCard min-width="220" class="subscribe-filter-menu-card">
          <!-- 名称搜索 -->
          <div class="pa-3">
            <VTextField
              v-model="subscribeFilter"
              :placeholder="t('subscribe.name')"
              prepend-inner-icon="mdi-magnify"
              density="compact"
              variant="outlined"
              hide-details
              clearable
            />
          </div>
          <VDivider class="mt-2" />
          <!-- 状态筛选列表 -->
          <VList density="compact" class="px-2 py-1">
            <VListSubheader>{{ t('common.status') }}</VListSubheader>
            <VListItem
              v-for="option in filterOptions"
              :key="option.value"
              :active="(subscribeStatusFilter || 'all') === option.value"
              @click="selectFilter(option.value)"
              density="compact"
            >
              <template #prepend>
                <VIcon :icon="option.icon" :color="option.color" size="small" />
              </template>
              <VListItemTitle>{{ option.label }}</VListItemTitle>
              <template #append>
                <VIcon
                  v-if="(subscribeStatusFilter || 'all') === option.value"
                  icon="mdi-check"
                  color="primary"
                  size="small"
                />
              </template>
            </VListItem>
          </VList>
          <VDivider />
          <!-- 排序 -->
          <VList density="compact" class="px-2 py-1">
            <VListSubheader>{{ t('subscribe.sortTitle') }}</VListSubheader>
            <VListItem
              v-for="option in sortOptions"
              :key="option.value"
              :active="currentSortBy === option.value"
              @click="selectSubscribeSort(option.value)"
              density="compact"
            >
              <VListItemTitle>{{ option.label }}</VListItemTitle>
              <template #append>
                <VIcon v-if="currentSortBy === option.value" icon="mdi-check" color="primary" size="small" />
              </template>
            </VListItem>
          </VList>
        </VCard>
      </VMenu>
    </Teleport>
  </div>
</template>

<style scoped>
.content-window {
  margin-block-start: 0;
}

.subscribe-filter-menu-card {
  border: 1px solid var(--mp-border-card);
  border-radius: 10px !important;
  background-color: rgb(var(--v-theme-surface));
  max-inline-size: min(300px, calc(100vw - 24px));
}

@media (width <= 600px) {
  .mp-page-action-bar {
    gap: 6px;
    padding-block: 6px;
    padding-inline: 8px;
  }
}
</style>
