<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api from '@/api'
import type { TorrentCacheData, TorrentCacheItem } from '@/api/types'
import { useI18n } from '@/composables/useChineseText'
import { formatFileSize, formatDateDifference } from '@core/utils/formatters'
import { useConfirm } from '@/composables/useConfirm'
import { useGlobalSettingsStore } from '@/stores'
import { usePWA } from '@/composables/usePWA'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useDisplay } from 'vuetify'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import RecognitionCachePanel from '@/components/cache/RecognitionCachePanel.vue'
import { getCacheDescriptionText } from '@/utils/cacheDisplay'

const CacheReidentifyDialog = defineAsyncComponent(() => import('@/components/dialog/CacheReidentifyDialog.vue'))

type InfiniteScrollStatus = 'ok' | 'empty' | 'loading' | 'error'
type CacheManagerType = 'torrent' | 'recognition'

const MOBILE_CACHE_PAGE_SIZE = 20

const activeCacheType = ref<CacheManagerType>('torrent')

// 国际化
const { t } = useI18n()

// PWA模式检测
const { appMode } = usePWA()

// 显示器宽度
const display = useDisplay()
const isMobile = computed(() => display.smAndDown.value)

// 全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// 确认框
const createConfirm = useConfirm()

// 提示框
const $toast = useToast()

// 缓存数据
const cacheData = ref<TorrentCacheData>({
  count: 0,
  sites: 0,
  data: [],
})

// 筛选条件
const titleFilter = ref<string | null>(null)
const siteFilter = ref<string | null>(null)

// 获取所有站点选项
const siteOptions = computed(() => {
  const sites = new Set<string>()
  cacheData.value.data.forEach(item => {
    if (item.site_name) {
      sites.add(item.site_name)
    }
  })
  return Array.from(sites).sort()
})

// 筛选后的数据
const filteredData = computed(() => {
  return cacheData.value.data.filter(item => {
    const titleMatch = !titleFilter.value || item.title?.toLowerCase().includes(titleFilter.value?.toLowerCase())
    const siteMatch = !siteFilter.value || item.site_name === siteFilter.value
    return titleMatch && siteMatch
  })
})

// 选中的缓存项
const selectedItems = ref<string[]>([])

// 加载状态
const loading = ref(false)

const currentReidentifyItem = ref<TorrentCacheItem | null>(null)

// 移动端已经追加到虚拟列表的数据条数
const mobileVisibleCount = ref(MOBILE_CACHE_PAGE_SIZE)

let reidentifyDialogController: ReturnType<typeof openSharedDialog> | null = null

const tableStyle = computed(() => {
  return appMode.value ? '' : 'height: calc(100vh - 21rem - env(safe-area-inset-bottom))'
})

// 移动端虚拟列表数据
const mobileVisibleData = computed(() => filteredData.value.slice(0, mobileVisibleCount.value))

// 移动端是否还有未追加的数据页
const mobileHasMore = computed(() => mobileVisibleData.value.length < filteredData.value.length)

// 移动端无限滚动组件刷新键
const mobileInfiniteKey = ref(0)

/** 同步清理不在当前过滤结果中的已选缓存项，防止残留不可见选择。 */
function syncSelectedItems() {
  if (selectedItems.value.length === 0) return
  const visibleHashes = new Set(filteredData.value.map(item => item.hash))
  selectedItems.value = selectedItems.value.filter(hash => visibleHashes.has(hash))
}

/** 重置移动端分页，让筛选或刷新后的列表从第一页开始展示。 */
function resetMobilePagination() {
  mobileVisibleCount.value = MOBILE_CACHE_PAGE_SIZE
  mobileInfiniteKey.value++
}

/** 调用 API 加载缓存数据。 */
async function loadCacheData() {
  try {
    loading.value = true
    const res = (await api.get('torrent/cache')) as { data: TorrentCacheData }
    cacheData.value = {
      ...res.data,
      data: res.data.data.map((item: TorrentCacheItem) => ({
        ...item,
        description: getCacheDescriptionText(item.description),
      })),
    }
    syncSelectedItems()
    resetMobilePagination()
  } catch (e) {
    console.log(e)
    $toast.error(t('setting.cache.loadFailed'))
  } finally {
    loading.value = false
  }
}

/** 追加移动端下一页数据，并通过虚拟滚动限制实际渲染节点数量。 */
function loadMoreMobileCache({ done }: { done: (status: InfiniteScrollStatus) => void }) {
  if (loading.value) {
    done('ok')
    return
  }

  if (!mobileHasMore.value) {
    done('empty')
    return
  }

  mobileVisibleCount.value = Math.min(mobileVisibleCount.value + MOBILE_CACHE_PAGE_SIZE, filteredData.value.length)
  done(mobileHasMore.value ? 'ok' : 'empty')
}

/** 清空所有缓存。 */
async function clearAllCache() {
  const isConfirmed = await createConfirm({
    type: 'warn',
    title: t('common.confirm'),
    content: t('setting.cache.clearConfirm'),
  })

  if (!isConfirmed) return
  try {
    loading.value = true
    await api.delete('torrent/cache')
    $toast.success(t('setting.cache.clearSuccess'))
    await loadCacheData()
    selectedItems.value = []
  } catch (e) {
    console.log(e)
    $toast.error(t('setting.cache.clearFailed'))
  } finally {
    loading.value = false
  }
}

/** 刷新缓存数据。 */
async function refreshCache() {
  try {
    loading.value = true
    const res = (await api.post('torrent/cache/refresh')) as { message?: string }
    $toast.success(res.message || t('setting.cache.refreshSuccess'))
    await loadCacheData()
  } catch (e) {
    console.log(e)
    $toast.error(t('setting.cache.refreshFailed'))
  } finally {
    loading.value = false
  }
}

/** 删除桌面端表格中选中的缓存项。 */
async function deleteSelectedItems() {
  if (selectedItems.value.length === 0) {
    $toast.warning(t('setting.cache.selectDeleteWarning'))
    return
  }

  const isConfirmed = await createConfirm({
    type: 'warn',
    title: t('common.confirm'),
    content: `确认删除选中的 ${selectedItems.value.length} 个缓存项？`,
  })
  if (!isConfirmed) return

  try {
    loading.value = true
    const targets = [...selectedItems.value]
    const results = await Promise.all(
      targets.map(async hash => {
        const item = cacheData.value.data.find(d => d.hash === hash)
        if (!item) return { hash, success: false }
        const res = (await api.delete(`torrent/cache/${item.domain}/${hash}`)) as { success?: boolean }
        return { hash, success: Boolean(res?.success) }
      }),
    )

    const failedHashes = results.filter(r => !r.success).map(r => r.hash)
    const successCount = results.length - failedHashes.length

    if (failedHashes.length > 0) {
      $toast.error(t('setting.cache.deleteSelectedFailed'))
    } else {
      $toast.success(t('setting.cache.deleteSelectedSuccess', { count: successCount }))
    }
    await loadCacheData()
    selectedItems.value = failedHashes.filter(hash => filteredData.value.some(item => item.hash === hash))
  } catch (e) {
    console.log(e)
    $toast.error(t('setting.cache.deleteSelectedFailed'))
  } finally {
    loading.value = false
  }
}

/** 删除单个缓存项。 */
async function deleteSingleItem(item: TorrentCacheItem) {
  try {
    loading.value = true
    const res = (await api.delete(`torrent/cache/${item.domain}/${item.hash}`)) as {
      success?: boolean
      message?: string
    }
    if (res?.success === false) {
      $toast.error(res?.message || t('setting.cache.deleteFailed'))
      return
    }
    $toast.success(t('setting.cache.deleteSuccess'))
    await loadCacheData()
    // 从选中列表中移除
    const index = selectedItems.value.indexOf(item.hash)
    if (index > -1) {
      selectedItems.value.splice(index, 1)
    }
  } catch (e) {
    console.log(e)
    $toast.error(t('setting.cache.deleteFailed'))
  } finally {
    loading.value = false
  }
}

/** 打开重新识别对话框。 */
function openReidentifyDialog(item: TorrentCacheItem) {
  currentReidentifyItem.value = item
  reidentifyDialogController?.close()
  reidentifyDialogController = openSharedDialog(
    CacheReidentifyDialog,
    {
      itemTitle: item.title,
      loading: loading.value,
      recognizeSource: globalSettings.RECOGNIZE_SOURCE,
    },
    {
      close: () => {
        reidentifyDialogController = null
      },
      confirm: performReidentify,
      'update:modelValue': (value: boolean) => {
        if (!value) reidentifyDialogController = null
      },
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

/** 执行缓存项重新识别。 */
async function performReidentify(payload: { mediaSource?: string; mediaId?: string } = {}) {
  if (!currentReidentifyItem.value) return

  try {
    loading.value = true
    reidentifyDialogController?.updateProps({ loading: true })
    const params: Record<string, string> = {}
    if (payload.mediaSource) params.media_source = payload.mediaSource
    if (payload.mediaId) params.media_id = payload.mediaId

    const res = (await api.post(
      `torrent/cache/reidentify/${currentReidentifyItem.value.domain}/${currentReidentifyItem.value.hash}`,
      null,
      {
        params,
      },
    )) as { message?: string }

    $toast.success(res.message || t('setting.cache.reidentifySuccess'))
    await loadCacheData()
    reidentifyDialogController?.close()
    reidentifyDialogController = null
  } catch (e) {
    console.log(e)
    $toast.error(t('setting.cache.reidentifyFailed'))
  } finally {
    loading.value = false
    reidentifyDialogController?.updateProps({ loading: false })
  }
}

/** 获取媒体类型对应的主题颜色。 */
function getMediaTypeColor(type: string): string {
  switch (type) {
    case 'movie':
    case t('setting.cache.mediaType.movie'):
      return 'primary'
    case 'tv':
    case t('setting.cache.mediaType.tv'):
      return 'success'
    default:
      return 'default'
  }
}

/** 获取移动端类型角标使用的 MediaCard 同款颜色类。 */
function getMobileMediaTypeChipClass(type: string): string {
  switch (type) {
    case 'movie':
    case t('setting.cache.mediaType.movie'):
      return 'border-blue-500 bg-blue-600'
    case 'tv':
    case t('setting.cache.mediaType.tv'):
      return 'bg-indigo-500 border-indigo-600'
    default:
      return 'border-purple-600 bg-purple-600'
  }
}

/** 生成移动端缓存卡片的稳定渲染键。 */
function getMobileCacheItemKey(item: TorrentCacheItem, index: number): string {
  return item.hash || [item.domain, item.title, index].join('-')
}

/** 获取移动端缓存卡片使用的媒体标题。 */
function getMobileMediaTitle(item: TorrentCacheItem): string {
  return item.media_name || item.description || t('setting.cache.unrecognized')
}

/** 获取移动端缓存卡片展示的识别补充信息。 */
function getMobileMediaMeta(item: TorrentCacheItem): string {
  return [item.media_year, item.season_episode].filter(Boolean).join(' · ')
}

/** 获取移动端缓存卡片展示的资源补充信息。 */
function getMobileResourceMeta(item: TorrentCacheItem): string {
  return [formatDateDifference(item.pubdate || ''), item.resource_term, item.site_name].filter(Boolean).join(' · ')
}

/** 打开缓存项的站点详情页面。 */
function openPageUrl(url: string) {
  window.open(url, '_blank')
}

onMounted(() => {
  loadCacheData()
})

watch([titleFilter, siteFilter], () => {
  syncSelectedItems()
  resetMobilePagination()
})
</script>

<template>
  <section class="cache-manager">
    <header class="cache-manager__header">
      <div class="mp-segmented cache-manager__switcher" role="group" :aria-label="t('setting.cache.cacheType')">
        <button
          type="button"
          class="mp-segmented__btn"
          :class="{ 'is-active': activeCacheType === 'torrent' }"
          @click="activeCacheType = 'torrent'"
        >
          <VIcon icon="mdi-download-box-outline" size="15" />
          <span>{{ t('setting.cache.torrentCache') }}</span>
        </button>
        <button
          type="button"
          class="mp-segmented__btn"
          :class="{ 'is-active': activeCacheType === 'recognition' }"
          @click="activeCacheType = 'recognition'"
        >
          <VIcon icon="mdi-movie-search-outline" size="15" />
          <span>{{ t('setting.cache.recognitionCache') }}</span>
        </button>
      </div>
    </header>

    <div class="cache-manager__content">
      <RecognitionCachePanel v-if="activeCacheType === 'recognition'" />

      <template v-else>
        <section v-if="isMobile" class="cache-mobile-page">
          <div class="cache-mobile-stats">
            <div class="cache-stat-card">
              <span class="cache-stat-card__icon cache-stat-card__icon--primary" aria-hidden="true">
                <VIcon icon="mdi-database-outline" size="18" />
              </span>
              <div class="cache-stat-card__copy">
                <strong>{{ cacheData.count }}</strong>
                <span>{{ t('setting.cache.totalCount') }}</span>
              </div>
            </div>

            <div class="cache-stat-card">
              <span class="cache-stat-card__icon cache-stat-card__icon--success" aria-hidden="true">
                <VIcon icon="mdi-web" size="18" />
              </span>
              <div class="cache-stat-card__copy">
                <strong>{{ cacheData.sites }}</strong>
                <span>{{ t('setting.cache.siteCount') }}</span>
              </div>
            </div>
          </div>

          <div class="cache-mobile-filters">
            <VTextField
              v-model="titleFilter"
              class="cache-mobile-filter"
              :placeholder="t('setting.cache.filterByTitle')"
              :aria-label="t('setting.cache.filterByTitle')"
              prepend-inner-icon="mdi-magnify"
              clearable
              density="compact"
              variant="outlined"
              single-line
              hide-details
            />

            <VAutocomplete
              v-model="siteFilter"
              class="cache-mobile-filter"
              :placeholder="t('setting.cache.filterBySite')"
              :aria-label="t('setting.cache.filterBySite')"
              :items="siteOptions"
              prepend-inner-icon="mdi-web"
              clearable
              density="compact"
              variant="outlined"
              single-line
              hide-details
            />
          </div>

          <div class="cache-mobile-actions">
            <VBtn variant="tonal" color="primary" :loading="loading" prepend-icon="mdi-refresh" @click="refreshCache">
              {{ t('setting.cache.refresh') }}
            </VBtn>
            <VBtn
              variant="tonal"
              color="error"
              :loading="loading"
              prepend-icon="mdi-delete-variant"
              @click="clearAllCache"
            >
              {{ t('setting.cache.clearAll') }}
            </VBtn>
          </div>

          <VInfiniteScroll
            v-if="mobileVisibleData.length > 0 || loading"
            :key="mobileInfiniteKey"
            mode="intersect"
            side="end"
            :items="mobileVisibleData"
            class="cache-mobile-scroll"
            @load="loadMoreMobileCache"
          >
            <template #loading>
              <div class="cache-mobile-load-state">
                <VProgressCircular indeterminate color="primary" size="20" width="2" />
                <span>{{ t('setting.cache.loadingMore') }}</span>
              </div>
            </template>

            <template #empty />

            <ProgressiveCardGrid
              v-if="mobileVisibleData.length > 0"
              :items="mobileVisibleData"
              :columns="1"
              :gap="10"
              :estimated-item-height="148"
              :overscan-rows="5"
              :get-item-key="getMobileCacheItemKey"
            >
              <template #default="{ item }">
                <article class="cache-mobile-card">
                  <div class="cache-mobile-card__poster">
                    <VChip
                      v-if="item.media_type"
                      variant="elevated"
                      size="x-small"
                      :class="getMobileMediaTypeChipClass(item.media_type)"
                      class="cache-mobile-card__type bg-opacity-80 text-white font-bold"
                    >
                      {{
                        item.media_type === 'movie'
                          ? t('setting.cache.mediaType.movie')
                          : item.media_type === 'tv'
                            ? t('setting.cache.mediaType.tv')
                            : item.media_type
                      }}
                    </VChip>
                    <VImg
                      v-if="item.poster_path"
                      :src="item.poster_path"
                      :alt="item.media_name || item.title"
                      cover
                      class="h-100 w-100"
                    >
                      <template #placeholder>
                        <VSkeletonLoader class="h-100 w-100" />
                      </template>
                    </VImg>
                    <VIcon
                      v-else
                      :icon="item.media_type === 'movie' ? 'mdi-movie-open' : 'mdi-television-play'"
                      size="26"
                    />
                  </div>

                  <div class="cache-mobile-card__content">
                    <div class="cache-mobile-card__torrent">
                      {{ item.title }}
                    </div>

                    <div class="cache-mobile-card__main">
                      {{ getMobileMediaTitle(item) }}
                      <span v-if="getMobileMediaMeta(item)">{{ getMobileMediaMeta(item) }}</span>
                    </div>

                    <div class="cache-mobile-card__meta">
                      <span>{{ getMobileResourceMeta(item) }}</span>
                      <strong>{{ formatFileSize(item.size) }}</strong>
                    </div>
                  </div>

                  <VMenu location="bottom end">
                    <template #activator="{ props: menuProps }">
                      <VBtn
                        v-bind="menuProps"
                        icon
                        size="small"
                        variant="text"
                        class="cache-mobile-card__menu cache-icon-trigger"
                        :aria-label="t('setting.cache.actions')"
                      >
                        <VIcon icon="mdi-dots-vertical" size="16" />
                      </VBtn>
                    </template>

                    <VList density="compact">
                      <VListItem @click="openReidentifyDialog(item)">
                        <template #prepend>
                          <VIcon icon="mdi-text-recognition" color="primary" size="18" />
                        </template>
                        <VListItemTitle>{{ t('setting.cache.reidentify') }}</VListItemTitle>
                      </VListItem>
                      <VListItem v-if="item.page_url" @click="openPageUrl(item.page_url || '')">
                        <template #prepend>
                          <VIcon icon="mdi-open-in-new" color="info" size="18" />
                        </template>
                        <VListItemTitle>{{ t('common.openInNewWindow') }}</VListItemTitle>
                      </VListItem>
                      <VListItem @click="deleteSingleItem(item)">
                        <template #prepend>
                          <VIcon icon="mdi-delete" color="error" size="18" />
                        </template>
                        <VListItemTitle>{{ t('common.delete') }}</VListItemTitle>
                      </VListItem>
                    </VList>
                  </VMenu>
                </article>
              </template>
            </ProgressiveCardGrid>
          </VInfiniteScroll>

          <div v-else class="cache-mobile-empty">
            <VIcon icon="mdi-database-off" size="34" />
            <span>{{ t('setting.cache.noData') }}</span>
            <small>{{ t('setting.cache.noDataHint') }}</small>
          </div>
        </section>

        <div v-else class="cache-desktop-page">
          <div class="cache-desktop-stats">
            <div class="cache-stat-card">
              <span class="cache-stat-card__icon cache-stat-card__icon--primary" aria-hidden="true">
                <VIcon icon="mdi-database-outline" size="18" />
              </span>
              <div class="cache-stat-card__copy">
                <strong>{{ cacheData.count }}</strong>
                <span>{{ t('setting.cache.totalCount') }}</span>
              </div>
            </div>

            <div class="cache-stat-card">
              <span class="cache-stat-card__icon cache-stat-card__icon--success" aria-hidden="true">
                <VIcon icon="mdi-web" size="18" />
              </span>
              <div class="cache-stat-card__copy">
                <strong>{{ cacheData.sites }}</strong>
                <span>{{ t('setting.cache.siteCount') }}</span>
              </div>
            </div>
          </div>

          <!-- 搜索筛选栏与动作按钮等高对齐 -->
          <div class="cache-desktop-filter-bar">
            <VTextField
              v-model="titleFilter"
              class="cache-desktop-filter"
              :placeholder="t('setting.cache.filterByTitle')"
              :aria-label="t('setting.cache.filterByTitle')"
              prepend-inner-icon="mdi-magnify"
              clearable
              density="compact"
              variant="outlined"
              single-line
              hide-details
            />
            <VAutocomplete
              v-model="siteFilter"
              class="cache-desktop-filter cache-desktop-filter--site"
              :placeholder="t('setting.cache.filterBySite')"
              :aria-label="t('setting.cache.filterBySite')"
              :items="siteOptions"
              prepend-inner-icon="mdi-web"
              clearable
              density="compact"
              variant="outlined"
              single-line
              hide-details
            />

            <div class="cache-desktop-actions">
              <VBtn variant="tonal" color="primary" :loading="loading" prepend-icon="mdi-refresh" @click="refreshCache">
                {{ t('setting.cache.refresh') }}
              </VBtn>
              <VBtn
                variant="outlined"
                color="warning"
                :loading="loading"
                :disabled="selectedItems.length === 0"
                prepend-icon="mdi-delete-sweep-outline"
                @click="deleteSelectedItems"
              >
                {{ t('setting.cache.deleteSelected') }}
                <span v-if="selectedItems.length > 0" class="ms-1">({{ selectedItems.length }})</span>
              </VBtn>
              <VBtn
                variant="tonal"
                color="error"
                :loading="loading"
                prepend-icon="mdi-delete-variant"
                @click="clearAllCache"
              >
                {{ t('setting.cache.clearAll') }}
              </VBtn>
            </div>
          </div>

          <!-- 缓存列表 -->
          <VDataTable
            v-model="selectedItems"
            class="cache-desktop-table"
            :headers="[
              { title: '', key: 'data-table-select', sortable: false, width: '44px' },
              { title: t('setting.cache.poster'), key: 'poster', sortable: false, width: '68px' },
              { title: t('setting.cache.torrentTitle'), key: 'title', sortable: true },
              { title: t('setting.cache.site'), key: 'site_name', sortable: true, width: '116px' },
              { title: t('setting.cache.size'), key: 'size', sortable: true, width: '98px' },
              { title: t('setting.cache.publishTime'), key: 'pubdate', sortable: true, width: '132px' },
              { title: t('setting.cache.recognitionResult'), key: 'media_info', sortable: false, width: '196px' },
              { title: t('setting.cache.actions'), key: 'actions', sortable: false, width: '124px' },
            ]"
            :items="filteredData"
            :loading="loading"
            item-value="hash"
            show-select
            hover
            fixed-header
            :items-per-page-text="t('common.itemsPerPage')"
            :no-data-text="t('common.noDataText')"
            :loading-text="t('common.loadingText')"
            :style="tableStyle"
          >
            <!-- 全选复选框 -->
            <template #header.data-table-select="{ allSelected, selectAll, someSelected }">
              <VCheckbox
                :indeterminate="someSelected && !allSelected"
                :model-value="allSelected"
                @update:model-value="(value: boolean | null) => selectAll(value as boolean)"
              />
            </template>

            <!-- 海报列 -->
            <template #item.poster="{ item }">
              <div class="cache-desktop-poster">
                <VImg
                  v-if="item.poster_path"
                  :src="item.poster_path"
                  :alt="item.media_name || item.title"
                  cover
                  class="h-100 w-100"
                />
                <VIcon v-else size="20">
                  {{ item.media_type === 'movie' ? 'mdi-movie-open' : 'mdi-television-play' }}
                </VIcon>
              </div>
            </template>

            <!-- 标题列 -->
            <template #item.title="{ item }">
              <div class="cache-torrent-title d-flex flex-column">
                <div class="cache-torrent-summary cache-torrent-heading" :title="item.title">
                  {{ item.title }}
                </div>
                <div
                  v-if="item.description"
                  class="cache-torrent-summary text-caption cache-torrent-desc"
                  :title="item.description"
                >
                  {{ item.description }}
                </div>
                <div v-if="item.season_episode || item.resource_term" class="cache-torrent-tags">
                  {{ item.season_episode }} {{ item.resource_term }}
                </div>
              </div>
            </template>

            <!-- 大小列 -->
            <template #item.size="{ item }">
              <span class="cache-tabular">{{ formatFileSize(item.size) }}</span>
            </template>

            <!-- 发布时间列 -->
            <template #item.pubdate="{ item }">
              <span class="cache-tabular cache-muted">{{ formatDateDifference(item.pubdate || '') }}</span>
            </template>

            <!-- 识别结果列 -->
            <template #item.media_info="{ item }">
              <div v-if="item.media_name" class="cache-media-info">
                <div class="cache-media-info__title">
                  {{ item.media_name }}
                  <span v-if="item.media_year" class="cache-muted"> ({{ item.media_year }}) </span>
                </div>
                <VChip
                  v-if="item.media_type"
                  :color="getMediaTypeColor(item.media_type)"
                  variant="tonal"
                  size="x-small"
                  class="cache-type-chip"
                >
                  {{ item.media_type }}
                </VChip>
              </div>
              <div v-else class="cache-muted">
                {{ t('setting.cache.unrecognized') }}
              </div>
            </template>

            <!-- 操作列 -->
            <template #item.actions="{ item }">
              <div class="cache-row-actions">
                <VBtn
                  icon
                  size="small"
                  color="primary"
                  variant="text"
                  class="cache-icon-trigger"
                  :aria-label="t('setting.cache.reidentify')"
                  @click="openReidentifyDialog(item)"
                >
                  <VIcon size="15">mdi-text-recognition</VIcon>
                </VBtn>

                <VBtn
                  icon
                  size="small"
                  color="error"
                  variant="text"
                  class="cache-icon-trigger"
                  :aria-label="t('common.delete')"
                  @click="deleteSingleItem(item)"
                >
                  <VIcon size="15">mdi-delete-outline</VIcon>
                </VBtn>

                <VBtn
                  v-if="item.page_url"
                  icon
                  size="small"
                  color="info"
                  variant="text"
                  class="cache-icon-trigger"
                  :aria-label="t('common.openInNewWindow')"
                  @click="openPageUrl(item.page_url || '')"
                  target="_blank"
                >
                  <VIcon size="15">mdi-open-in-new</VIcon>
                </VBtn>
              </div>
            </template>

            <!-- 空状态 -->
            <template #no-data>
              <div class="cache-empty-table">
                <VIcon size="36">mdi-database-off</VIcon>
                <div class="cache-muted">
                  {{ t('setting.cache.noData') }}
                </div>
              </div>
            </template>
          </VDataTable>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.cache-manager {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  block-size: 100%;
  inline-size: 100%;
  min-block-size: 0;
}

.cache-manager__header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-block-end: 1px solid var(--mp-border-subtle);
  padding: 10px 16px;
}

.cache-manager__switcher .mp-segmented__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-inline-size: 120px;
  justify-content: center;
}

.cache-manager__content {
  display: flex;
  overflow: hidden;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
}

.cache-stat-card {
  display: flex;
  align-items: center;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: var(--mp-field-bg);
  gap: 10px;
  min-inline-size: 132px;
  padding: 8px 13px;
}

.cache-stat-card__icon {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 8px;
  block-size: 34px;
  inline-size: 34px;
}

.cache-stat-card__icon--primary {
  background-color: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
}

.cache-stat-card__icon--success {
  background-color: rgba(var(--v-theme-success), 0.1);
  color: rgb(var(--v-theme-success));
}

.cache-stat-card__copy strong,
.cache-stat-card__copy span {
  display: block;
}

.cache-stat-card__copy strong {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 21px;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  letter-spacing: -0.015em;
  line-height: 1.15;
}

.cache-stat-card__copy span {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11.5px;
  margin-block-start: 2px;
}

.cache-desktop-page {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 13px;
  min-block-size: 0;
  padding: 16px 18px;
}

.cache-desktop-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.cache-desktop-filter-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.cache-desktop-filter {
  flex: 1 1 220px;
}

.cache-desktop-filter--site {
  flex: 0 1 220px;
}

.cache-desktop-filter-bar :deep(.v-field) {
  border-radius: 8px;
  background: var(--mp-field-bg);
  min-block-size: 32px;
}

.cache-desktop-filter-bar :deep(.v-field__input) {
  min-block-size: 32px;
  padding-block: 0;
  font-size: 13px;
}

.cache-desktop-filter-bar :deep(.v-field__prepend-inner),
.cache-desktop-filter-bar :deep(.v-field__append-inner),
.cache-desktop-filter-bar :deep(.v-field__clearable) {
  padding-block: 0;
  align-items: center;
}

.cache-desktop-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
  margin-inline-start: auto;
}

.cache-desktop-table {
  flex: 1 1 auto;
  min-block-size: 0;
}

.cache-desktop-table :deep(table) {
  table-layout: fixed;
  min-inline-size: 1060px;
}

.cache-desktop-page :deep(.v-data-table) {
  overflow: hidden;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
}

.cache-desktop-poster {
  display: flex;
  overflow: hidden;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 6px;
  background: var(--mp-item-bg);
  block-size: 54px;
  color: rgba(var(--v-theme-on-surface), 0.36);
  inline-size: 38px;
  margin-block: 4px;
}

.cache-torrent-title {
  min-inline-size: 0;
  padding-block: 6px;
}

.cache-torrent-heading {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
}

.cache-torrent-desc {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11.5px !important;
  line-height: 1.35 !important;
  margin-block-start: 2px;
}

.cache-torrent-tags {
  color: rgb(var(--v-theme-primary));
  font-size: 11.5px;
  font-weight: 500;
  margin-block-start: 3px;
}

.cache-torrent-summary {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow-wrap: anywhere;
}

.cache-tabular {
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
}

.cache-muted {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
}

.cache-media-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
}

.cache-media-info__title {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
}

.cache-type-chip {
  block-size: 20px;
  font-size: 11px;
}

.cache-row-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.cache-icon-trigger {
  border-radius: 7px !important;
  block-size: 28px !important;
  inline-size: 28px !important;
  min-inline-size: 28px !important;
}

.cache-empty-table {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: rgba(var(--v-theme-on-surface), 0.48);
}

@media (width <= 959.98px) {
  .cache-manager__header {
    padding-inline: 14px;
  }

  .cache-manager__switcher {
    inline-size: 100%;
  }

  .cache-manager__switcher .mp-segmented__btn {
    flex: 1 1 0;
    min-inline-size: 0;
  }
}

.cache-mobile-page {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  background: transparent;
  block-size: 100%;
  gap: 13px;
  inline-size: 100%;
  min-block-size: 0;
  overflow-y: auto;
  padding-block: 13px calc(16px + env(safe-area-inset-bottom, 0px));
  padding-inline: 14px;
}

.cache-mobile-stats {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.cache-mobile-stats .cache-stat-card {
  min-inline-size: 0;
  padding: 10px 12px;
}

.cache-mobile-stats .cache-stat-card__copy strong {
  font-size: 20px;
}

.cache-mobile-filters {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cache-mobile-filter :deep(.v-field) {
  border-radius: 8px;
  background: var(--mp-field-bg);
}

.cache-mobile-actions {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.cache-mobile-scroll {
  overflow: visible !important;
  min-block-size: 18rem;
}

.cache-mobile-scroll :deep(.v-infinite-scroll__container),
.cache-mobile-scroll :deep(.progressive-card-grid),
.cache-mobile-scroll :deep(.progressive-card-grid__track) {
  overflow: visible !important;
}

.cache-mobile-scroll :deep(.v-infinite-scroll__side) {
  padding-block: 12px 2px;
}

.cache-mobile-card {
  position: relative;
  display: grid;
  overflow: visible;
  align-items: start;
  padding: 12px;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: rgb(var(--v-theme-surface));
  gap: 12px;
  grid-template-columns: 56px minmax(0, 1fr);
}

.cache-mobile-card__poster {
  position: relative;
  display: flex;
  overflow: hidden;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 8px;
  background: var(--mp-item-bg);
  block-size: 80px;
  color: rgba(var(--v-theme-on-surface), 0.34);
  inline-size: 56px;
}

.cache-mobile-card__type {
  position: absolute;
  z-index: 1;
  inset-block-end: 4px;
  inset-inline-start: 50%;
  transform: translateX(-50%);
}

.cache-mobile-card__content {
  min-inline-size: 0;
}

.cache-mobile-card__torrent {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
  overflow-wrap: anywhere;
  padding-inline-end: 30px;
  white-space: normal;
  word-break: normal;
}

.cache-mobile-card__main {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.32;
  margin-block-start: 4px;
  overflow-wrap: anywhere;
  white-space: normal;
  word-break: normal;
}

.cache-mobile-card__main span {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  font-weight: 500;
  margin-inline-start: 5px;
}

.cache-mobile-card__meta {
  display: grid;
  align-items: end;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  gap: 8px;
  grid-template-columns: minmax(0, 1fr) auto;
  line-height: 1.35;
  margin-block-start: 6px;
}

.cache-mobile-card__meta span {
  min-inline-size: 0;
  overflow-wrap: anywhere;
  white-space: normal;
}

.cache-mobile-card__meta strong {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  text-align: end;
  white-space: nowrap;
}

.cache-mobile-card__menu {
  position: absolute;
  color: rgba(var(--v-theme-on-surface), 0.56);
  inset-block-start: 8px;
  inset-inline-end: 8px;
}

.cache-mobile-load-state,
.cache-mobile-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(var(--v-theme-on-surface), 0.58);
  text-align: center;
}

.cache-mobile-load-state {
  flex-direction: column;
  font-size: 12.5px;
  font-weight: 600;
  gap: 8px;
  min-block-size: 60px;
}

.cache-mobile-empty {
  flex: 1 1 auto;
  flex-direction: column;
  gap: 6px;
  min-block-size: 14rem;
}

.cache-mobile-empty span {
  color: rgba(var(--v-theme-on-surface), 0.78);
  font-size: 14px;
  font-weight: 600;
}

.cache-mobile-empty small {
  color: rgba(var(--v-theme-on-surface), 0.52);
  font-size: 12px;
}

@media (width <= 600px) {
  .cache-manager__header {
    padding: 8px 12px;
  }

  .cache-mobile-page {
    gap: 10px;
    padding-block: 10px calc(16px + env(safe-area-inset-bottom, 0px));
    padding-inline: 12px;
  }

  .cache-mobile-stats {
    gap: 8px;
  }

  .cache-mobile-stats .cache-stat-card {
    padding: 8px 10px;
    gap: 8px;
  }

  .cache-stat-card__icon {
    border-radius: 7px;
    block-size: 30px;
    inline-size: 30px;
  }

  .cache-mobile-stats .cache-stat-card__copy strong {
    font-size: 18px;
  }

  .cache-mobile-card {
    padding: 10px;
    gap: 10px;
  }
}
</style>
