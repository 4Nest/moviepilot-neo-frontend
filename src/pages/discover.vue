<script setup lang="ts">
import { getDiscoverTabs } from '@/router/i18n-menu'
import TheMovieDbView from '@/views/discover/TheMovieDbView.vue'
import DoubanView from '@/views/discover/DoubanView.vue'
import BangumiView from '@/views/discover/BangumiView.vue'
import AniListView from '@/views/discover/AniListView.vue'
import ExtraSourceView from '@/views/discover/ExtraSourceView.vue'
import { DiscoverSource } from '@/api/types'
import api from '@/api'
import { useI18n } from '@/composables/useChineseText'
import { useDynamicHeaderTab } from '@/composables/useDynamicHeaderTab'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useToast } from 'vue-toastification'

const DiscoverTabOrderDialog = defineAsyncComponent(() => import('@/components/dialog/DiscoverTabOrderDialog.vue'))

// 国际化
const { t } = useI18n()
const $toast = useToast()

// 路由
const route = useRoute()

const activeTab = ref('')

// 按需懒挂载：仅首次切入对应标签后挂载其视图，切走后保留状态。
const visitedTabs = reactive(new Set<string>())

watch(
  activeTab,
  tab => {
    if (tab) visitedTabs.add(tab)
  },
  { immediate: true },
)

// 本地存储键值
const localOrderKey = 'MP_DISCOVER_TAB_ORDER'

interface DiscoverTabOrderItem {
  name: string
  mediaid_prefix?: string
  enabled?: boolean
}

interface DiscoverTabOrderSavePayload {
  tabs: DiscoverSource[]
  enabled?: Record<string, boolean>
}

// 顺序与显隐配置
const orderConfig = ref<DiscoverTabOrderItem[]>([])

// 全部发现标签页（含已隐藏）
const discoverTabs = ref<DiscoverSource[]>([])

// 查找标签对应的配置项；优先按 mediaid_prefix 匹配，兼容旧版仅存 name 的配置。
function findOrderConfigItem(tab: DiscoverSource) {
  return orderConfig.value.find(item =>
    item.mediaid_prefix ? item.mediaid_prefix === tab.mediaid_prefix : item.name === tab.name,
  )
}

// 判断标签是否启用；缺省 enabled 视为启用。
function isTabEnabled(tab: DiscoverSource) {
  const matched = findOrderConfigItem(tab)
  return matched ? matched.enabled !== false : true
}

// 各标签启用状态映射，供设置弹窗回显。
const tabEnabledMap = computed<Record<string, boolean>>(() => {
  const map: Record<string, boolean> = {}
  discoverTabs.value.forEach(tab => {
    map[tab.mediaid_prefix] = isTabEnabled(tab)
  })
  return map
})

// 当前启用的标签列表
const visibleDiscoverTabs = computed(() => {
  return discoverTabs.value.filter(isTabEnabled)
})

// 顶栏仅展示已启用的标签页项
const discoverTabItems = computed(() => {
  return visibleDiscoverTabs.value.map(item => ({
    title: item.name,
    tab: item.mediaid_prefix,
  }))
})

// 额外的数据源
const extraDiscoverSources = ref<DiscoverSource[]>([])

let orderDialogController: ReturnType<typeof openSharedDialog> | null = null
let orderConfigRequest: Promise<void> | null = null
let extraSourcesRequest: Promise<void> | null = null
let hasDeactivated = false

// 打开发现页标签排序与显隐共享弹窗。
function openOrderConfigDialog() {
  orderDialogController?.close()
  const releaseController = () => {
    if (orderDialogController === controller) orderDialogController = null
  }

  const controller = openSharedDialog(
    DiscoverTabOrderDialog,
    {
      tabs: discoverTabs.value,
      defaultTabs: [...createBuiltInDiscoverTabs(), ...extraDiscoverSources.value],
      enabled: tabEnabledMap.value,
    },
    {
      close: releaseController,
      save: (payload: DiscoverTabOrderSavePayload | DiscoverSource[]) => saveTabOrder(payload, controller),
      'update:modelValue': (value: boolean) => {
        if (!value) releaseController()
      },
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
  orderDialogController = controller
}

// 关闭发现页标签排序共享弹窗。
function closeOrderConfigDialog(controller = orderDialogController) {
  if (!controller || orderDialogController !== controller) return
  controller.close()
  orderDialogController = null
}

// 构造内置发现标签，扩展来源刷新时以此为稳定基线。
function createBuiltInDiscoverTabs() {
  const tabs = getDiscoverTabs(t)
  return tabs.map(tab => {
    return {
      name: tab.title,
      mediaid_prefix: tab.tab,
      api_path: '',
      filter_params: {},
      filter_ui: [],
    }
  })
}

// 用最近一次成功快照替换扩展来源，并保持 mediaid_prefix 唯一。
function replaceExtraDiscoverSources(sources: DiscoverSource[]) {
  const builtInTabs = createBuiltInDiscoverTabs()
  const seenPrefixes = new Set(builtInTabs.map(tab => tab.mediaid_prefix))
  const nextExtraSources = sources.filter(source => {
    if (seenPrefixes.has(source.mediaid_prefix)) return false
    seenPrefixes.add(source.mediaid_prefix)
    return true
  })

  extraDiscoverSources.value = nextExtraSources
  discoverTabs.value = [...builtInTabs, ...nextExtraSources]
}

// 加载额外的发现数据源；并发生命周期钩子共享同一次请求。
function loadExtraDiscoverSources() {
  if (extraSourcesRequest) return extraSourcesRequest

  extraSourcesRequest = refreshExtraDiscoverSources().finally(() => {
    extraSourcesRequest = null
  })
  return extraSourcesRequest
}

async function refreshExtraDiscoverSources() {
  try {
    const sources: DiscoverSource[] = await api.get('discover/source')
    replaceExtraDiscoverSources(sources)
  } catch (error) {
    console.log(error)
  }
}

/** 只接受包含有效名称（及可选 mediaid_prefix、enabled）的顺序数组。 */
function normalizeOrderConfig(value: unknown): DiscoverTabOrderItem[] | null {
  if (!Array.isArray(value)) return null

  const normalized: DiscoverTabOrderItem[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    const candidate = item as { name?: unknown; mediaid_prefix?: unknown; enabled?: unknown }
    if (typeof candidate.name !== 'string' || !candidate.name.trim()) return null
    if (candidate.mediaid_prefix !== undefined && typeof candidate.mediaid_prefix !== 'string') return null
    if (candidate.enabled !== undefined && typeof candidate.enabled !== 'boolean') return null

    const prefix = candidate.mediaid_prefix?.trim()
    const normalizedItem: DiscoverTabOrderItem = { name: candidate.name }
    if (prefix) normalizedItem.mediaid_prefix = prefix
    if (candidate.enabled !== undefined) normalizedItem.enabled = candidate.enabled
    normalized.push(normalizedItem)
  }
  return normalized
}

// 同步读取本地缓存；若数据损坏则自动清理。
function readLocalOrderConfig(): DiscoverTabOrderItem[] | null {
  const localOrder = localStorage.getItem(localOrderKey)
  if (!localOrder) return null

  try {
    const parsedOrder = normalizeOrderConfig(JSON.parse(localOrder))
    if (parsedOrder) return parsedOrder
  } catch {
    // 损坏的本地缓存不能阻止发现页使用默认标签。
  }
  localStorage.removeItem(localOrderKey)
  return null
}

// 按 order 顺序排序；优先按 mediaid_prefix 稳定匹配，兼容旧版仅存 name 的配置。
function sortSubscribeOrder() {
  if (!orderConfig.value || orderConfig.value.length === 0) {
    return
  }
  if (discoverTabs.value.length === 0) {
    return
  }
  const findOrderIndex = (tab: DiscoverSource) =>
    orderConfig.value.findIndex(item =>
      item.mediaid_prefix ? item.mediaid_prefix === tab.mediaid_prefix : item.name === tab.name,
    )
  discoverTabs.value.sort((a, b) => {
    const aIndex = findOrderIndex(a)
    const bIndex = findOrderIndex(b)
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex)
  })
}

// 确保当前激活标签有效；若被隐藏或撤销则回退至首个可见标签。
function ensureValidActiveTab() {
  if (visibleDiscoverTabs.value.length === 0) {
    activeTab.value = ''
    return
  }
  if (!activeTab.value || !visibleDiscoverTabs.value.some(tab => tab.mediaid_prefix === activeTab.value)) {
    activeTab.value = visibleDiscoverTabs.value[0].mediaid_prefix
  }
}

// 加载顺序与显隐；服务端为跨设备权威源，本地 localStorage 仅在远端无配置或请求失败时兜底，且去重在途请求。
function loadOrderConfig() {
  if (orderConfigRequest) return orderConfigRequest

  orderConfigRequest = (async () => {
    try {
      const response = await api.get(`/user/config/${localOrderKey}`)
      const remoteOrder = normalizeOrderConfig(response?.data?.value)
      if (remoteOrder) {
        orderConfig.value = remoteOrder
        localStorage.setItem(localOrderKey, JSON.stringify(remoteOrder))
        return
      }
    } catch (error) {
      console.error(error)
    }

    const localOrder = readLocalOrderConfig()
    if (localOrder) {
      orderConfig.value = localOrder
    }
  })().finally(() => {
    orderConfigRequest = null
  })

  return orderConfigRequest
}

// 保存顺序与显隐设置；服务端确认成功后再更新页面状态与本地回退缓存。
async function saveTabOrder(
  payload: DiscoverTabOrderSavePayload | DiscoverSource[] = {
    tabs: discoverTabs.value,
    enabled: tabEnabledMap.value,
  },
  controller = orderDialogController,
) {
  const tabs = Array.isArray(payload) ? payload : payload.tabs
  const enabledMap = Array.isArray(payload) ? tabEnabledMap.value : (payload.enabled ?? tabEnabledMap.value)
  const orderObj: DiscoverTabOrderItem[] = tabs.map(item => ({
    name: item.name,
    mediaid_prefix: item.mediaid_prefix,
    enabled: enabledMap[item.mediaid_prefix] !== false,
  }))

  try {
    await api.post(`/user/config/${localOrderKey}`, orderObj)
  } catch (error) {
    console.error(error)
    $toast.error(t('common.saveFailed'))
    return
  }

  discoverTabs.value = [...tabs]
  orderConfig.value = orderObj
  localStorage.setItem(localOrderKey, JSON.stringify(orderObj))
  ensureValidActiveTab()
  closeOrderConfigDialog(controller)
}

// 使用动态标签页
const { registerHeaderTab } = useDynamicHeaderTab()

// 注册动态标签页（在setup阶段，但使用computed保证响应性）
registerHeaderTab({
  items: discoverTabItems,
  modelValue: activeTab,
  appendButtons: [
    {
      title: t('discover.configureTabs'),
      label: t('discover.configureTabs'),
      icon: 'mdi-tune',
      variant: 'outlined',
      testId: 'discover-tab-config-btn',
      action: openOrderConfigDialog,
    },
  ],
})

async function initializeDiscover() {
  discoverTabs.value = createBuiltInDiscoverTabs()
  // 同步预热本地缓存，避免首屏标签顺序闪跳
  const localOrder = readLocalOrderConfig()
  if (localOrder) {
    orderConfig.value = localOrder
    sortSubscribeOrder()
  }

  await Promise.all([loadOrderConfig(), loadExtraDiscoverSources()])
  sortSubscribeOrder()
  // 首次初始化完成后选中权威排序下的第一个可见标签
  if (visibleDiscoverTabs.value.length > 0) {
    activeTab.value = visibleDiscoverTabs.value[0].mediaid_prefix
  } else {
    activeTab.value = ''
  }
}

onBeforeMount(() => {
  void initializeDiscover()
})

onDeactivated(() => {
  hasDeactivated = true
})

onActivated(async () => {
  if (!hasDeactivated) return

  await Promise.all([loadOrderConfig(), loadExtraDiscoverSources()])
  sortSubscribeOrder()
  ensureValidActiveTab()
})
</script>

<template>
  <div>
    <div v-if="visibleDiscoverTabs.length === 0" class="discover-empty" data-testid="discover-empty-state">
      <VIcon icon="mdi-compass-off-outline" size="48" class="discover-empty-icon" />
      <p class="discover-empty-title">{{ t('discover.noVisibleTabs') }}</p>
      <p class="discover-empty-hint">{{ t('discover.noVisibleTabsHint') }}</p>
      <VBtn
        color="primary"
        variant="tonal"
        size="small"
        rounded="lg"
        prepend-icon="mdi-tune"
        @click="openOrderConfigDialog"
      >
        {{ t('discover.configureTabs') }}
      </VBtn>
    </div>
    <VWindow v-else-if="activeTab" v-model="activeTab" class="disable-tab-transition" :touch="false">
      <VWindowItem value="themoviedb">
        <div v-if="visitedTabs.has('themoviedb')">
          <TheMovieDbView />
        </div>
      </VWindowItem>
      <VWindowItem value="douban">
        <div v-if="visitedTabs.has('douban')">
          <DoubanView />
        </div>
      </VWindowItem>
      <VWindowItem value="bangumi">
        <div v-if="visitedTabs.has('bangumi')">
          <BangumiView />
        </div>
      </VWindowItem>
      <VWindowItem value="anilist">
        <div v-if="visitedTabs.has('anilist')">
          <AniListView />
        </div>
      </VWindowItem>
      <VWindowItem v-for="item in extraDiscoverSources" :key="item.mediaid_prefix" :value="item.mediaid_prefix">
        <div v-if="visitedTabs.has(item.mediaid_prefix)">
          <ExtraSourceView :source="item" />
        </div>
      </VWindowItem>
    </VWindow>
    <!-- 快速滚动到顶部按钮 -->
    <Teleport to="body" v-if="route.path === '/discover'">
      <VScrollToTopBtn />
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.discover-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
  color: rgba(var(--v-theme-on-surface), 0.68);
  text-align: center;
}

.discover-empty-icon {
  margin-block-end: 14px;
  opacity: 0.45;
}

.discover-empty-title {
  color: rgba(var(--v-theme-on-surface), 0.88);
  font-size: 1rem;
  font-weight: 500;
  margin-block-end: 6px;
}

.discover-empty-hint {
  font-size: 0.875rem;
  margin-block-end: 18px;
}
</style>
