<script lang="ts" setup>
import api from '@/api'
import type { ApiResponse, Site, SiteStatistic, SiteUserData } from '@/api/types'
import SiteCard from '@/components/cards/SiteCard.vue'
import NoDataFound from '@/components/states/NoDataFound.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { useDynamicButton, type DynamicButtonMenuItem } from '@/composables/useDynamicButton'
import { useConfirm } from '@/composables/useConfirm'
import { useI18n } from '@/composables/useChineseText'
import { usePWA } from '@/composables/usePWA'
import { useToast } from 'vue-toastification'
import { useKeepAliveRefresh, type KeepAliveRefreshContext } from '@/composables/useKeepAliveRefresh'
import { openSharedDialog } from '@/composables/useSharedDialog'

// 国际化
const { t } = useI18n()

// 提示框
const $toast = useToast()

// 确认框
const createConfirm = useConfirm()

// 路由
const route = useRoute()

// APP 模式检测
const { appMode } = usePWA()

// 拖拽排序和站点弹窗都不是站点列表首屏必需，打开对应功能时再加载。
const Draggable = defineAsyncComponent(() => import('vuedraggable').then(module => module.default))
const SiteAddEditDialog = defineAsyncComponent(() => import('@/components/dialog/SiteAddEditDialog.vue'))
const SiteStatisticsDialog = defineAsyncComponent(() => import('@/components/dialog/SiteStatisticsDialog.vue'))
const SiteImportDialog = defineAsyncComponent(() => import('@/components/dialog/SiteImportDialog.vue'))

// 站点列表
const siteList = ref<Site[]>([])

// 排序失败时只能回退到最近一次由服务端确认的列表，不能保留未保存的拖拽结果。
const confirmedSiteList = ref<Site[]>([])

// 站点数据列表
const userDataList = ref<SiteUserData[]>([])

// 站点统计数据列表
const siteStatsList = ref<Record<string, SiteStatistic>>({})

// 是否刷新过
const isRefreshed = ref(false)

// 是否加载中
const loading = ref(false)

// 首次加载失败时保留独立错误态，避免把网络异常显示成空站点。
const loadError = ref(false)

const sortMode = ref(false)

// 排序保存期间锁定拖拽，确保一次请求只确认它实际提交的顺序快照。
const savingPriority = ref(false)
const exporting = ref(false)

// 筛选相关
const filterMenu = ref(false)
const filterOption = ref('all') // all, active, inactive, connected, slow, failed, unknown

// 筛选选项
const filterOptions = computed(() => [
  { value: 'all', label: t('common.all'), icon: 'mdi-filter-multiple-outline' },
  { value: 'active', label: t('common.active'), icon: 'mdi-check-circle', color: 'success' },
  { value: 'inactive', label: t('common.inactive'), icon: 'mdi-stop-circle', color: 'error' },
  { value: 'connected', label: t('site.connectionNormal'), icon: 'mdi-wifi', color: 'success' },
  { value: 'slow', label: t('site.connectionSlow'), icon: 'mdi-wifi-strength-2', color: 'warning' },
  { value: 'failed', label: t('site.connectionFailed'), icon: 'mdi-wifi-off', color: 'error' },
  { value: 'unknown', label: t('site.connectionUnknown'), icon: 'mdi-help-circle', color: 'secondary' },
])

// 筛选后的站点列表
const filteredSiteList = computed(() => {
  if (filterOption.value === 'all') {
    return siteList.value
  }
  return siteList.value.filter(site => {
    if (filterOption.value === 'active') {
      return site.is_active
    } else if (filterOption.value === 'inactive') {
      return !site.is_active
    } else if (['connected', 'slow', 'failed', 'unknown'].includes(filterOption.value)) {
      const connectionStatus = getConnectionStatus(site.domain)
      return connectionStatus === filterOption.value
    }
    return true
  })
})

// 用于拖拽排序的列表
const draggableSiteList = computed({
  get() {
    return filterOption.value === 'all' ? siteList.value : filteredSiteList.value
  },
  set(value) {
    if (filterOption.value === 'all') {
      siteList.value = value
    }
  },
})

const siteUserDataMap = computed<Record<string, SiteUserData | undefined>>(() => {
  const map: Record<string, SiteUserData | undefined> = {}

  userDataList.value.forEach(userData => {
    if (userData.domain) {
      map[userData.domain] = userData
    }
  })

  return map
})

const canDragSort = computed(() => sortMode.value && filterOption.value === 'all')
const shouldVirtualizeList = computed(() => !sortMode.value)

// 当前筛选选项的显示信息
const currentFilter = computed(() => {
  return filterOptions.value.find(option => option.value === filterOption.value)
})

// 获取站点列表数据
let fetchGeneration = 0

async function fetchData(context: KeepAliveRefreshContext = {}) {
  const generation = ++fetchGeneration
  const showLoading = !context.silent || !isRefreshed.value

  try {
    if (showLoading) {
      loading.value = true
      loadError.value = false
    }

    const [sites] = await Promise.all([
      api.get<Site[], Site[]>('site/'),
      // 站点统计在列表请求期间并行预取，减少刷新时卡片分两轮明显重绘。
      fetchSiteStats(),
    ])
    if (generation !== fetchGeneration) return
    siteList.value = sites
    confirmedSiteList.value = [...sites]
    isRefreshed.value = true
    loadError.value = false
  } catch (error) {
    if (generation !== fetchGeneration) return
    console.error(error)
    if (!isRefreshed.value) {
      loadError.value = true
    }
  } finally {
    if (showLoading) {
      loading.value = false
    }
  }
}

// 删除站点后立即从本地列表移除并触发后方卡片弹性补位，后台静默同步最新列表与统计
function handleRemoveSite(removedId?: number) {
  if (typeof removedId === 'number' && Number.isFinite(removedId)) {
    ++fetchGeneration
    siteList.value = siteList.value.filter(site => site.id !== removedId)
    confirmedSiteList.value = confirmedSiteList.value.filter(site => site.id !== removedId)
  }
  void fetchData({ silent: true })
}

// 获取站点最新数据
async function fetchUserData() {
  try {
    userDataList.value = await api.get('site/userdata/latest')
  } catch (error) {
    console.error(error)
  }
}

// 获取站点统计数据
async function fetchSiteStats() {
  try {
    // 使用批量接口一次性获取所有站点统计数据
    const stats: SiteStatistic[] = await api.get('site/statistic')

    // 将数组转换为以domain为键的对象
    const statsMap: Record<string, SiteStatistic> = {}
    stats.forEach(stat => {
      if (stat.domain) {
        statsMap[stat.domain] = stat
      }
    })
    siteStatsList.value = statsMap
  } catch (error) {
    console.error('Failed to fetch site statistics:', error)
    siteStatsList.value = {}
  }
}

// 根据站点统计数据判断连接状态
function getConnectionStatus(domain: string) {
  const stats = siteStatsList.value[domain]
  if (!stats || Object.keys(stats).length === 0) {
    return 'unknown'
  }
  if (stats.circuit_open) {
    return 'failed'
  }
  if (stats.lst_state === 1) {
    return 'failed'
  } else if (stats.lst_state === 0) {
    if (!stats.seconds) return 'unknown'
    if (stats.seconds >= 5) return 'slow'
    return 'connected'
  }
  return 'unknown'
}

// 保存站点排序
async function savaSitesPriority() {
  // 只在显示全部站点时允许排序
  if (filterOption.value !== 'all' || savingPriority.value) {
    return
  }

  const submittedSiteList = [...draggableSiteList.value]
  const priorities = submittedSiteList.map((site, index) => ({ id: site.id, pri: index + 1 }))
  savingPriority.value = true
  try {
    const result: ApiResponse<unknown> = await api.post('site/priorities', priorities)
    if (!result.success) {
      siteList.value = [...confirmedSiteList.value]
      await fetchData()
    } else {
      siteList.value = [...submittedSiteList]
      confirmedSiteList.value = [...submittedSiteList]
    }
  } catch (error) {
    console.error(error)
    siteList.value = [...confirmedSiteList.value]
    await fetchData()
  } finally {
    savingPriority.value = false
  }
}

// 处理站点统计数据刷新请求
async function handleRefreshStats(domain?: string) {
  if (domain) {
    // 刷新特定站点的统计数据
    try {
      const stats = await api.get<SiteStatistic, SiteStatistic>(`site/statistic/${domain}`)
      siteStatsList.value[domain] = stats
    } catch (error) {
      console.error(`Failed to refresh stats for ${domain}:`, error)
    }
  } else {
    // 刷新所有站点统计数据
    await fetchSiteStats()
  }
}

// 更新站点事件时
function onSiteSave() {
  fetchData()
}

// 选择筛选选项
function selectFilter(value: string) {
  filterOption.value = value
  filterMenu.value = false
}

function toggleSortMode() {
  sortMode.value = !sortMode.value
}

function openSiteAddDialog() {
  openSharedDialog(
    SiteAddEditDialog,
    { oper: 'add' },
    {
      save: onSiteSave,
    },
    { closeOn: ['close', 'save'] },
  )
}

function openSiteImportDialog() {
  openSharedDialog(
    SiteImportDialog,
    {},
    {
      'import-success': fetchData,
    },
    { closeOn: ['update:modelValue'] },
  )
}

function openSiteStatisticsDialog() {
  openSharedDialog(SiteStatisticsDialog, { sites: siteList.value }, {}, { closeOn: ['update:modelValue'] })
}

// 导出站点数据
async function exportSites() {
  if (exporting.value) return

  const isConfirmed = await createConfirm({
    title: t('common.confirm'),
    content: '导出的 JSON 文件包含站点 Cookie、API Key、Token 等敏感凭据，请妥善保管切勿泄露。是否确认导出？',
  })
  if (!isConfirmed) return

  exporting.value = true
  try {
    // 获取所有站点数据
    const sites: Site[] = await api.get('site/')

    // 创建导出数据，只包含必要的字段
    const exportData = sites.map((site: Site) => ({
      name: site.name,
      domain: site.domain,
      url: site.url,
      rss: site.rss,
      downloader: site.downloader,
      cookie: site.cookie,
      apikey: site.apikey,
      token: site.token,
      ua: site.ua,
      proxy: site.proxy,
      filter: site.filter,
      render: site.render,
      public: site.public,
      note: site.note,
      timeout: site.timeout,
      limit_interval: site.limit_interval,
      limit_count: site.limit_count,
      limit_seconds: site.limit_seconds,
      is_active: site.is_active,
      pri: site.pri,
    }))

    // 创建Blob对象
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })

    // 创建下载链接
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `sites_export_${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    // 显示成功提示
    $toast.success(t('site.messages.exportSuccess'))
  } catch (error) {
    console.error('Export sites failed:', error)
    $toast.error(t('site.messages.exportFailed'))
  } finally {
    exporting.value = false
  }
}

// 加载时获取数据
onBeforeMount(() => {
  fetchData()
  fetchUserData()
})

useKeepAliveRefresh(async context => {
  if (loading.value) return

  await Promise.all([fetchData(context), fetchUserData()])
})

watch(
  () => filterOption.value,
  value => {
    if (value !== 'all' && sortMode.value) {
      sortMode.value = false
    }
  },
  { immediate: true },
)

const shouldShowFloatingActions = computed(() => route.path === '/site' && isRefreshed.value)

// App 模式下将站点操作收纳到 Footer 动态菜单中，和插件页保持一致。
const siteDynamicMenuItems = computed<DynamicButtonMenuItem[]>(() => [
  {
    titleKey: 'site.actions.add',
    icon: 'mdi-web-plus',
    action: openSiteAddDialog,
  },
  {
    titleKey: 'site.actions.import',
    icon: 'mdi-import',
    action: openSiteImportDialog,
  },
  {
    titleKey: 'site.actions.export',
    icon: 'mdi-export',
    disabled: exporting.value,
    action: exportSites,
  },
  {
    titleKey: 'site.statistics',
    icon: 'mdi-chart-line',
    action: openSiteStatisticsDialog,
  },
])

// 使用动态按钮钩子
useDynamicButton({
  icon: 'mdi-web-plus',
  onClick: openSiteAddDialog,
  menuItems: siteDynamicMenuItems,
  show: computed(() => appMode.value && shouldShowFloatingActions.value),
})
</script>

<template>
  <div class="card-list-container">
    <!-- 页面标题、筛选排序与站点管理操作 -->
    <div class="site-page-header d-flex flex-wrap justify-space-between align-center gap-2 mb-3">
      <VPageContentTitle
        :title="t('navItems.siteManager')"
        class="site-page-header__title my-0"
        style="margin-block: 0"
      />
      <div class="site-page-header__actions d-flex flex-wrap align-center gap-1.5">
        <!-- 筛选按钮 -->
        <VMenu v-model="filterMenu" offset-y :close-on-content-click="false" location="bottom end">
          <template #activator="{ props }">
            <IconBtn
              v-bind="props"
              size="small"
              class="site-toolbar-icon-btn"
              :aria-label="t('common.filter')"
              :variant="filterOption === 'all' ? 'text' : 'tonal'"
              :color="currentFilter?.color"
            >
              <VIcon :icon="currentFilter?.icon || 'mdi-filter'" size="18" />
              <VTooltip activator="parent" location="bottom">{{ t('common.filter') }}</VTooltip>
            </IconBtn>
          </template>
          <!-- 筛选菜单 -->
          <VCard min-width="200">
            <VList density="compact" class="px-2 py-1">
              <VListSubheader>{{ t('common.filter') }}</VListSubheader>
              <VListItem
                v-for="option in filterOptions"
                :key="option.value"
                :active="filterOption === option.value"
                density="compact"
                @click="selectFilter(option.value)"
              >
                <template #prepend>
                  <VIcon :icon="option.icon" :color="option.color" size="18" />
                </template>
                <VListItemTitle>{{ option.label }}</VListItemTitle>
                <template #append>
                  <VIcon v-if="filterOption === option.value" icon="mdi-check" color="primary" size="16" />
                </template>
              </VListItem>
            </VList>
          </VCard>
        </VMenu>
        <!-- 排序按钮 -->
        <IconBtn
          size="small"
          variant="text"
          class="site-toolbar-icon-btn"
          :aria-label="t('common.sortMode')"
          :color="sortMode ? 'primary' : undefined"
          @click="toggleSortMode"
        >
          <VIcon icon="mdi-sort-variant" size="18" />
          <VTooltip activator="parent" location="bottom">{{ t('common.sortMode') }}</VTooltip>
        </IconBtn>

        <template v-if="shouldShowFloatingActions && !appMode">
          <span class="mp-page-action-divider" />
          <VBtn
            size="small"
            variant="outlined"
            rounded="lg"
            prepend-icon="mdi-chart-line"
            @click="openSiteStatisticsDialog"
          >
            {{ t('site.statistics') }}
          </VBtn>
          <VBtn size="small" variant="outlined" rounded="lg" prepend-icon="mdi-import" @click="openSiteImportDialog">
            {{ t('site.actions.import') }}
          </VBtn>
          <VBtn
            size="small"
            variant="outlined"
            rounded="lg"
            prepend-icon="mdi-export"
            :loading="exporting"
            :disabled="exporting"
            @click="exportSites"
          >
            {{ t('site.actions.export') }}
          </VBtn>
          <VBtn
            size="small"
            variant="flat"
            color="primary"
            rounded="lg"
            prepend-icon="mdi-web-plus"
            @click="openSiteAddDialog"
          >
            {{ t('site.actions.add') }}
          </VBtn>
        </template>
      </div>
    </div>

    <VAlert v-if="sortMode" color="warning" variant="tonal" class="mb-3 py-0 app-surface-static">
      <div class="d-flex flex-wrap align-center justify-space-between gap-2 py-2">
        <span class="text-body-2">{{ t('common.sortModeHint') }}</span>
        <VBtn size="small" rounded="lg" variant="tonal" color="error" @click="sortMode = false">
          {{ t('common.exit') }}
        </VBtn>
      </div>
    </VAlert>

    <LoadingBanner v-if="!isRefreshed && !loadError" class="mt-12" />
    <Draggable
      v-if="draggableSiteList.length > 0 && canDragSort"
      v-model="draggableSiteList"
      :disabled="savingPriority"
      @end="savaSitesPriority"
      item-key="id"
      tag="div"
      :component-data="{ 'class': 'grid gap-3.5 grid-site-card' }"
    >
      <template #item="{ element }">
        <SiteCard
          :site="element"
          :data="siteUserDataMap[element.domain]"
          :stats="siteStatsList[element.domain] || {}"
          :sortable="true"
          @remove="handleRemoveSite"
          @update="fetchData"
          @refresh-stats="handleRefreshStats"
        />
      </template>
    </Draggable>
    <ProgressiveCardGrid
      v-else-if="draggableSiteList.length > 0 && shouldVirtualizeList"
      :items="draggableSiteList"
      :get-item-key="item => item.id"
      :min-item-width="256"
      :estimated-item-height="156"
    >
      <template #default="{ item }">
        <SiteCard
          :site="item"
          :data="siteUserDataMap[item.domain]"
          :stats="siteStatsList[item.domain] || {}"
          :sortable="false"
          @remove="handleRemoveSite"
          @update="fetchData"
          @refresh-stats="handleRefreshStats"
        />
      </template>
    </ProgressiveCardGrid>
  </div>
  <NoDataFound
    v-if="loadError && !isRefreshed"
    error-code="500"
    :error-title="t('common.serverConnectionFailed')"
    :error-description="t('common.troubleshooting')"
  >
    <template #button>
      <VBtn color="primary" variant="tonal" rounded="lg" size="small" @click="fetchData()">
        {{ t('common.retry') }}
      </VBtn>
    </template>
  </NoDataFound>
  <NoDataFound
    v-if="draggableSiteList.length === 0 && isRefreshed"
    error-code="404"
    :error-title="filterOption === 'all' ? t('site.noSites') : t('common.noMatchingData')"
    :error-description="filterOption === 'all' ? t('site.sitesWillBeShownHere') : t('common.tryChangingFilters')"
  />
</template>

<style scoped>
.site-page-header {
  min-block-size: 32px;
  padding-inline: 8px;
}

.site-page-header__title,
.site-page-header__title :deep(*) {
  font-size: 20px !important;
  font-weight: 600 !important;
  letter-spacing: -0.01em;
  line-height: 1.35 !important;
}

.site-page-header__actions {
  align-items: center;
}

.site-toolbar-icon-btn {
  border-radius: 7px !important;
  block-size: 28px !important;
  inline-size: 28px !important;
  min-inline-size: 28px !important;
}
</style>
