<script setup lang="ts">
import { useToast } from 'vue-toastification'
import { useDisplay } from 'vuetify'
import { useI18n } from '@/composables/useChineseText'
import api from '@/api'
import type { ApiResponse, RecognitionCacheData, RecognitionCacheItem } from '@/api/types'
import { useConfirm } from '@/composables/useConfirm'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { useGlobalSettingsStore } from '@/stores'
import { getDisplayImageUrl } from '@/utils/imageUtils'
import { getRecognitionQueryText } from '@/utils/cacheDisplay'

type RecognitionStatusFilter = 'all' | 'recognized' | 'unrecognized'
type InfiniteScrollStatus = 'ok' | 'empty' | 'loading' | 'error'

const MOBILE_CACHE_PAGE_SIZE = 20
const RECOGNITION_CACHE_ENDPOINT = 'tmdb/cache'

const { t } = useI18n()
const display = useDisplay()
const createConfirm = useConfirm()
const $toast = useToast()
const globalSettingsStore = useGlobalSettingsStore()

const isMobile = computed(() => display.smAndDown.value)
const recognitionSourceName = computed(() => t('setting.cache.recognitionSource.themoviedb'))
const recognitionIdLabel = computed(() => t('setting.cache.tmdbId'))
const recognitionFilterPlaceholder = computed(() =>
  t('setting.cache.filterRecognitionCache', { source: recognitionSourceName.value }),
)
const loading = ref(false)
const searchFilter = ref('')
const statusFilter = ref<RecognitionStatusFilter>('all')
const selectedItems = ref<string[]>([])
const cacheData = ref<RecognitionCacheData>({
  count: 0,
  recognized: 0,
  unrecognized: 0,
  shared_recognized: 0,
  shared_recognize_enabled: false,
  data: [],
})
const mobileVisibleCount = ref(MOBILE_CACHE_PAGE_SIZE)
const mobileInfiniteKey = ref(0)
let cacheLoadRequestId = 0

const statusOptions = computed(() => [
  { title: t('setting.cache.allStatuses'), value: 'all' },
  { title: t('setting.cache.recognizedOnly'), value: 'recognized' },
  { title: t('setting.cache.unrecognizedOnly'), value: 'unrecognized' },
])

const tableHeaders = computed(() => [
  { title: '', key: 'data-table-select', sortable: false, width: '48px' },
  { title: t('setting.cache.poster'), key: 'poster', sortable: false, width: '76px' },
  { title: t('setting.cache.cacheKey'), key: 'key', sortable: true },
  { title: t('setting.cache.recognitionResult'), key: 'result', sortable: false, width: '220px' },
  { title: recognitionIdLabel.value, key: 'recognition_id', sortable: true, width: '120px' },
  { title: t('setting.cache.recognitionStatus'), key: 'status', sortable: true, width: '120px' },
  { title: t('setting.cache.actions'), key: 'actions', sortable: false, width: '72px' },
])

const filteredData = computed(() => {
  const keyword = searchFilter.value.trim().toLowerCase()
  return cacheData.value.data.filter(item => {
    const matchesKeyword =
      !keyword ||
      [item.key, getRecognitionQueryText(item.key), item.title, item.year, getRecognitionId(item)].some(value =>
        value.toLowerCase().includes(keyword),
      )
    const matchesStatus =
      statusFilter.value === 'all' || (statusFilter.value === 'recognized' ? isRecognized(item) : !isRecognized(item))
    return matchesKeyword && matchesStatus
  })
})

const mobileVisibleData = computed(() => filteredData.value.slice(0, mobileVisibleCount.value))
const mobileHasMore = computed(() => mobileVisibleData.value.length < filteredData.value.length)

/** 同步清理不在当前过滤结果中的已选识别缓存项，防止残留不可见选择。 */
function syncSelectedItems() {
  if (selectedItems.value.length === 0) return
  const visibleKeys = new Set(filteredData.value.map(item => item.key))
  selectedItems.value = selectedItems.value.filter(key => visibleKeys.has(key))
}

/** 重置移动端分页，让筛选或刷新后的识别缓存从第一页开始展示。 */
function resetMobilePagination() {
  mobileVisibleCount.value = MOBILE_CACHE_PAGE_SIZE
  mobileInfiniteKey.value++
}

/** 追加移动端下一页识别缓存，并由虚拟滚动限制实际渲染节点。 */
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

/** 加载 TMDB 主识别缓存列表。 */
async function loadCacheData(showSuccess = false) {
  const requestId = ++cacheLoadRequestId
  try {
    loading.value = true
    const response = (await api.get(RECOGNITION_CACHE_ENDPOINT)) as unknown as ApiResponse<RecognitionCacheData>
    if (requestId !== cacheLoadRequestId) return
    const responseData = response.data ?? {
      count: 0,
      recognized: 0,
      unrecognized: 0,
      shared_recognized: 0,
      shared_recognize_enabled: false,
      data: [],
    }
    cacheData.value = {
      ...responseData,
      shared_recognized: responseData.shared_recognized ?? 0,
      shared_recognize_enabled: responseData.shared_recognize_enabled ?? false,
      data: responseData.data.map(item => ({ ...item, recognition_id: getRecognitionId(item) })),
    }
    syncSelectedItems()
    resetMobilePagination()
    if (showSuccess) $toast.success(t('setting.cache.listRefreshSuccess'))
  } catch (error) {
    if (requestId !== cacheLoadRequestId) return
    console.error(error)
    $toast.error(t('setting.cache.loadFailed'))
  } finally {
    if (requestId === cacheLoadRequestId) loading.value = false
  }
}

/** 清空全部 TMDB 主识别缓存。 */
async function clearAllCache() {
  const confirmed = await createConfirm({
    type: 'warn',
    title: t('common.confirm'),
    content: t('setting.cache.recognitionClearConfirm', { source: recognitionSourceName.value }),
  })
  if (!confirmed) return

  try {
    loading.value = true
    const response = (await api.delete(RECOGNITION_CACHE_ENDPOINT)) as unknown as ApiResponse
    if (!response.success) throw new Error(response.message)
    $toast.success(response.message || t('setting.cache.clearSuccess'))
    await loadCacheData()
    selectedItems.value = []
  } catch (error) {
    console.error(error)
    $toast.error(t('setting.cache.clearFailed'))
  } finally {
    loading.value = false
  }
}

/** 请求 TMDB 接口删除指定识别缓存。 */
async function deleteCacheItem(key: string) {
  const response = (await api.delete(
    `${RECOGNITION_CACHE_ENDPOINT}/${encodeURIComponent(key)}`,
  )) as unknown as ApiResponse
  if (!response?.success) throw new Error(response?.message)
}

/** 删除桌面端表格中选中的识别缓存。 */
async function deleteSelectedItems() {
  if (selectedItems.value.length === 0) {
    $toast.warning(t('setting.cache.selectDeleteWarning'))
    return
  }

  const deleteCount = selectedItems.value.length
  const isConfirmed = await createConfirm({
    type: 'warn',
    title: t('common.confirm'),
    content: `确认删除选中的 ${deleteCount} 个缓存项？`,
  })
  if (!isConfirmed) return

  try {
    loading.value = true
    const targets = [...selectedItems.value]
    const results = await Promise.all(
      targets.map(async key => {
        const res = (await api.delete(
          `${RECOGNITION_CACHE_ENDPOINT}/${encodeURIComponent(key)}`,
        )) as unknown as ApiResponse
        return { key, success: Boolean(res?.success) }
      }),
    )
    const failedKeys = results.filter(r => !r.success).map(r => r.key)
    const successCount = results.length - failedKeys.length
    if (failedKeys.length > 0) {
      $toast.error(t('setting.cache.deleteSelectedFailed'))
    } else {
      $toast.success(t('setting.cache.deleteSelectedSuccess', { count: successCount }))
    }
    await loadCacheData()
    selectedItems.value = failedKeys.filter(key => filteredData.value.some(item => item.key === key))
  } catch (error) {
    console.error(error)
    $toast.error(t('setting.cache.deleteSelectedFailed'))
  } finally {
    loading.value = false
  }
}

/** 删除单条识别缓存。 */
async function deleteSingleItem(item: RecognitionCacheItem) {
  try {
    loading.value = true
    await deleteCacheItem(item.key)
    $toast.success(t('setting.cache.deleteSuccess'))
    await loadCacheData()
  } catch (error) {
    console.error(error)
    $toast.error(t('setting.cache.deleteFailed'))
  } finally {
    loading.value = false
  }
}

/** 获取识别缓存海报的可展示地址。 */
function getPosterUrl(item: RecognitionCacheItem): string {
  if (!item.poster_path) return ''
  const sourceUrl = item.poster_path.startsWith('/')
    ? `https://${globalSettingsStore.globalSettings.TMDB_IMAGE_DOMAIN}/t/p/w300${item.poster_path}`
    : item.poster_path
  return getDisplayImageUrl(sourceUrl, globalSettingsStore.globalSettings.GLOBAL_IMAGE_CACHE)
}

/** 获取识别缓存对应的 TMDB ID。 */
function getRecognitionId(item: RecognitionCacheItem): string {
  return item.tmdb_id ? String(item.tmdb_id) : ''
}

/** 判断识别缓存条目是否包含有效媒体 ID。 */
function isRecognized(item: RecognitionCacheItem): boolean {
  const recognitionId = getRecognitionId(item)
  return Boolean(recognitionId && recognitionId !== '0')
}

/** 获取移动端识别缓存卡片的稳定渲染 key。 */
function getRecognitionCacheItemKey(item: RecognitionCacheItem): string {
  return item.key
}

/** 获取本地化的媒体类型名称。 */
function getMediaTypeLabel(mediaType: string): string {
  if (mediaType === 'movie') return t('setting.cache.mediaType.movie')
  if (mediaType === 'tv') return t('setting.cache.mediaType.tv')
  return t('setting.cache.mediaType.unknown')
}

/** 获取媒体类型对应的主题颜色。 */
function getMediaTypeColor(mediaType: string): string {
  if (mediaType === 'movie') return 'primary'
  if (mediaType === 'tv') return 'success'
  return 'secondary'
}

/** 获取识别状态的本地化名称。 */
function getRecognitionStatusLabel(item: RecognitionCacheItem): string {
  return isRecognized(item) ? t('setting.cache.recognized') : t('setting.cache.unrecognized')
}

onMounted(() => {
  void loadCacheData()
})

watch([searchFilter, statusFilter], () => {
  syncSelectedItems()
  resetMobilePagination()
})
</script>

<template>
  <section class="recognition-cache-panel">
    <div class="cache-panel-stats">
      <div class="cache-panel-stat">
        <span class="cache-panel-stat__icon cache-panel-stat__icon--primary" aria-hidden="true">
          <VIcon icon="mdi-database-outline" size="18" />
        </span>
        <div class="cache-panel-stat__copy">
          <strong>{{ cacheData.count }}</strong>
          <span>{{ t('setting.cache.totalCount') }}</span>
        </div>
      </div>
      <div class="cache-panel-stat">
        <span class="cache-panel-stat__icon cache-panel-stat__icon--success" aria-hidden="true">
          <VIcon icon="mdi-check-decagram-outline" size="18" />
        </span>
        <div class="cache-panel-stat__copy">
          <strong>{{ cacheData.recognized }}</strong>
          <span>{{ t('setting.cache.recognized') }}</span>
        </div>
      </div>
      <div v-if="!isMobile || cacheData.shared_recognize_enabled" class="cache-panel-stat">
        <span class="cache-panel-stat__icon cache-panel-stat__icon--warning" aria-hidden="true">
          <VIcon icon="mdi-help-circle-outline" size="18" />
        </span>
        <div class="cache-panel-stat__copy">
          <strong>{{ cacheData.unrecognized }}</strong>
          <span>{{ t('setting.cache.unrecognized') }}</span>
        </div>
      </div>
      <div v-if="cacheData.shared_recognize_enabled" class="cache-panel-stat">
        <span class="cache-panel-stat__icon cache-panel-stat__icon--info" aria-hidden="true">
          <VIcon icon="mdi-cloud-check-outline" size="18" />
        </span>
        <div class="cache-panel-stat__copy">
          <strong>{{ cacheData.shared_recognized }}</strong>
          <span>{{ t('setting.cache.sharedRecognized') }}</span>
        </div>
      </div>
    </div>

    <div class="cache-panel-filter-bar">
      <VTextField
        v-model="searchFilter"
        class="cache-panel-filter"
        :placeholder="recognitionFilterPlaceholder"
        :aria-label="recognitionFilterPlaceholder"
        prepend-inner-icon="mdi-magnify"
        variant="outlined"
        density="compact"
        single-line
        clearable
        hide-details
      />
      <VSelect
        v-model="statusFilter"
        class="cache-panel-filter cache-panel-filter--status"
        :placeholder="t('setting.cache.recognitionStatus')"
        :aria-label="t('setting.cache.recognitionStatus')"
        :items="statusOptions"
        prepend-inner-icon="mdi-list-status"
        variant="outlined"
        density="compact"
        single-line
        hide-details
      />

      <div v-if="!isMobile" class="cache-panel-actions">
        <VBtn
          variant="tonal"
          color="primary"
          :loading="loading"
          prepend-icon="mdi-refresh"
          @click="loadCacheData(true)"
        >
          {{ t('setting.cache.refreshList') }}
        </VBtn>
        <VBtn
          variant="outlined"
          color="warning"
          :disabled="selectedItems.length === 0"
          :loading="loading"
          prepend-icon="mdi-delete-sweep-outline"
          @click="deleteSelectedItems"
        >
          {{ t('setting.cache.deleteSelected') }}
          <span v-if="selectedItems.length > 0" class="ms-1">({{ selectedItems.length }})</span>
        </VBtn>
        <VBtn variant="tonal" color="error" :loading="loading" prepend-icon="mdi-delete-variant" @click="clearAllCache">
          {{ t('setting.cache.clearAll') }}
        </VBtn>
      </div>
    </div>

    <div v-if="isMobile" class="cache-panel-mobile-actions">
      <VBtn variant="tonal" color="primary" :loading="loading" prepend-icon="mdi-refresh" @click="loadCacheData(true)">
        {{ t('setting.cache.refresh') }}
      </VBtn>
      <VBtn variant="tonal" color="error" :loading="loading" prepend-icon="mdi-delete-variant" @click="clearAllCache">
        {{ t('setting.cache.clearAll') }}
      </VBtn>
    </div>

    <template v-if="isMobile">
      <VInfiniteScroll
        v-if="mobileVisibleData.length > 0 || loading"
        :key="mobileInfiniteKey"
        mode="intersect"
        side="end"
        :items="mobileVisibleData"
        class="recognition-cache-mobile-scroll"
        @load="loadMoreMobileCache"
      >
        <template #loading>
          <div class="cache-panel-load-state">
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
          :estimated-item-height="136"
          :overscan-rows="5"
          :get-item-key="getRecognitionCacheItemKey"
        >
          <template #default="{ item }">
            <article class="recognition-cache-mobile-item">
              <div class="recognition-cache-poster">
                <VImg v-if="getPosterUrl(item)" :src="getPosterUrl(item)" :alt="item.title || item.key" cover />
                <VIcon v-else icon="mdi-image-off-outline" size="24" />
              </div>

              <div class="recognition-cache-mobile-item__content">
                <div class="recognition-cache-mobile-item__title">
                  {{ item.title || t('setting.cache.unrecognized') }}
                </div>
                <div class="recognition-cache-mobile-item__meta">
                  <VChip
                    size="x-small"
                    variant="tonal"
                    class="recognition-type-chip"
                    :color="getMediaTypeColor(item.media_type)"
                  >
                    {{ getMediaTypeLabel(item.media_type) }}
                  </VChip>
                  <span v-if="item.year">{{ item.year }}</span>
                  <span v-if="isRecognized(item)" class="recognition-tabular">
                    {{ recognitionIdLabel }} #{{ getRecognitionId(item) }}
                  </span>
                </div>
                <div class="recognition-cache-mobile-item__key">{{ getRecognitionQueryText(item.key) }}</div>
              </div>

              <VBtn
                icon
                size="small"
                variant="text"
                color="error"
                class="recognition-icon-trigger"
                :aria-label="t('common.delete')"
                @click="deleteSingleItem(item)"
              >
                <VIcon icon="mdi-delete-outline" size="16" />
              </VBtn>
            </article>
          </template>
        </ProgressiveCardGrid>
      </VInfiniteScroll>

      <div v-else class="cache-panel-empty">
        <VIcon icon="mdi-database-search-outline" size="34" />
        <strong>{{ t('setting.cache.noRecognitionCache', { source: recognitionSourceName }) }}</strong>
        <span>{{ t('setting.cache.noRecognitionCacheHint') }}</span>
      </div>
    </template>

    <VDataTable
      v-else
      v-model="selectedItems"
      class="recognition-cache-table"
      :headers="tableHeaders"
      :items="filteredData"
      :loading="loading"
      item-value="key"
      show-select
      hover
      :items-per-page-text="t('common.itemsPerPage')"
      :no-data-text="t('common.noDataText')"
      :loading-text="t('common.loadingText')"
    >
      <template #item.poster="{ item }">
        <div class="recognition-cache-table__poster">
          <VImg v-if="getPosterUrl(item)" :src="getPosterUrl(item)" :alt="item.title || item.key" cover />
          <VIcon v-else icon="mdi-image-off-outline" size="20" />
        </div>
      </template>

      <template #item.key="{ item }">
        <div class="recognition-cache-table__key">{{ getRecognitionQueryText(item.key) }}</div>
      </template>

      <template #item.result="{ item }">
        <div class="recognition-cache-result">
          <strong>{{ item.title || t('setting.cache.unrecognized') }}</strong>
          <span v-if="item.year">{{ item.year }}</span>
          <VChip
            size="x-small"
            variant="tonal"
            class="recognition-type-chip"
            :color="getMediaTypeColor(item.media_type)"
          >
            {{ getMediaTypeLabel(item.media_type) }}
          </VChip>
        </div>
      </template>

      <template #item.recognition_id="{ item }">
        <span v-if="isRecognized(item)" class="recognition-tabular font-weight-medium">
          #{{ getRecognitionId(item) }}
        </span>
        <span v-else class="text-medium-emphasis">-</span>
      </template>

      <template #item.status="{ item }">
        <VChip
          size="small"
          variant="tonal"
          class="recognition-status-chip"
          :color="isRecognized(item) ? 'success' : 'warning'"
        >
          {{ getRecognitionStatusLabel(item) }}
        </VChip>
      </template>

      <template #item.actions="{ item }">
        <VBtn
          icon
          size="small"
          variant="text"
          color="error"
          class="recognition-icon-trigger"
          :aria-label="t('common.delete')"
          @click="deleteSingleItem(item)"
        >
          <VIcon icon="mdi-delete-outline" size="16" />
          <VTooltip activator="parent" location="start">{{ t('common.delete') }}</VTooltip>
        </VBtn>
      </template>

      <template #no-data>
        <div class="cache-panel-empty">
          <VIcon icon="mdi-database-search-outline" size="34" />
          <strong>{{ t('setting.cache.noRecognitionCache', { source: recognitionSourceName }) }}</strong>
          <span>{{ t('setting.cache.noRecognitionCacheHint') }}</span>
        </div>
      </template>
    </VDataTable>
  </section>
</template>

<style scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.recognition-cache-panel {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  padding: 16px 18px;
  gap: 13px;
  min-block-size: 0;
  overflow-y: auto;
}

.cache-panel-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.cache-panel-stat {
  display: flex;
  align-items: center;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: var(--mp-field-bg);
  gap: 10px;
  min-inline-size: 132px;
  padding: 8px 13px;
}

.cache-panel-stat__icon {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 8px;
  block-size: 34px;
  inline-size: 34px;
}

.cache-panel-stat__icon--primary {
  background-color: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
}

.cache-panel-stat__icon--success {
  background-color: rgba(var(--v-theme-success), 0.1);
  color: rgb(var(--v-theme-success));
}

.cache-panel-stat__icon--warning {
  background-color: rgba(var(--v-theme-warning), 0.1);
  color: rgb(var(--v-theme-warning));
}

.cache-panel-stat__icon--info {
  background-color: rgba(var(--v-theme-info), 0.1);
  color: rgb(var(--v-theme-info));
}

.cache-panel-stat__copy strong,
.cache-panel-stat__copy span {
  display: block;
}

.cache-panel-stat__copy strong {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 21px;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  letter-spacing: -0.015em;
  line-height: 1.15;
}

.cache-panel-stat__copy span {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11.5px;
  margin-block-start: 2px;
}

.cache-panel-filter-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.cache-panel-filter {
  flex: 1 1 240px;
}

.cache-panel-filter--status {
  flex: 0 1 190px;
}

.cache-panel-filter-bar :deep(.v-field) {
  border-radius: 8px;
  background: var(--mp-field-bg);
  min-block-size: 32px;
}

.cache-panel-filter-bar :deep(.v-field__input) {
  min-block-size: 32px;
  padding-block: 0;
  font-size: 13px;
}

.cache-panel-filter-bar :deep(.v-field__prepend-inner),
.cache-panel-filter-bar :deep(.v-field__append-inner),
.cache-panel-filter-bar :deep(.v-field__clearable) {
  padding-block: 0;
  align-items: center;
}

.cache-panel-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  margin-inline-start: auto;
}

.cache-panel-mobile-actions {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.recognition-cache-table {
  overflow: hidden;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
}

.recognition-cache-table__poster,
.recognition-cache-poster {
  display: flex;
  overflow: hidden;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--mp-border-subtle);
  background: var(--mp-item-bg);
  color: rgba(var(--v-theme-on-surface), 0.36);
}

.recognition-cache-table__poster {
  border-radius: 6px;
  block-size: 54px;
  inline-size: 38px;
  margin-block: 4px;
}

.recognition-cache-table__poster :deep(.v-img),
.recognition-cache-poster :deep(.v-img) {
  block-size: 100%;
  inline-size: 100%;
}

.recognition-cache-table__key {
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 12px;
  line-height: 1.45;
  max-inline-size: 36rem;
  overflow-wrap: anywhere;
}

.recognition-cache-result {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}

.recognition-cache-result strong {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 13px;
  font-weight: 600;
  inline-size: 100%;
  line-height: 1.3;
}

.recognition-cache-result span {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.recognition-type-chip {
  block-size: 20px;
  font-size: 11px;
}

.recognition-status-chip {
  block-size: 21px;
  font-size: 11.5px;
}

.recognition-tabular {
  font-variant-numeric: tabular-nums;
}

.recognition-icon-trigger {
  border-radius: 7px !important;
  block-size: 28px !important;
  inline-size: 28px !important;
  min-inline-size: 28px !important;
}

.cache-panel-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: rgba(var(--v-theme-on-surface), 0.48);
  gap: 6px;
  min-block-size: 14rem;
  text-align: center;
}

.cache-panel-empty strong {
  color: rgba(var(--v-theme-on-surface), 0.78);
  font-size: 14px;
  font-weight: 600;
}

.cache-panel-empty span {
  font-size: 12px;
  max-inline-size: 30rem;
}

@media (width <= 959.98px) {
  .recognition-cache-panel {
    block-size: 100%;
    padding-block: 13px calc(16px + env(safe-area-inset-bottom));
    padding-inline: 14px;
  }

  .cache-panel-stats {
    display: grid;
    gap: 10px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .cache-panel-stat {
    min-inline-size: 0;
    padding: 10px 12px;
  }

  .cache-panel-stat__copy strong {
    font-size: 20px;
  }

  .cache-panel-filter-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .cache-panel-filter,
  .cache-panel-filter--status {
    flex: 1 1 auto;
  }

  .recognition-cache-mobile-scroll {
    overflow: visible !important;
    min-block-size: 18rem;
  }

  .recognition-cache-mobile-scroll :deep(.v-infinite-scroll__container),
  .recognition-cache-mobile-scroll :deep(.progressive-card-grid),
  .recognition-cache-mobile-scroll :deep(.progressive-card-grid__track) {
    overflow: visible !important;
  }

  .recognition-cache-mobile-scroll :deep(.v-infinite-scroll__side) {
    padding-block: 12px 2px;
  }

  .cache-panel-load-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: rgba(var(--v-theme-on-surface), 0.58);
    font-size: 12.5px;
    font-weight: 600;
    gap: 8px;
    min-block-size: 60px;
  }

  .recognition-cache-mobile-item {
    display: grid;
    align-items: start;
    padding: 12px;
    border: 1px solid var(--mp-border-card);
    border-radius: 10px;
    background: rgb(var(--v-theme-surface));
    gap: 12px;
    grid-template-columns: 50px minmax(0, 1fr) 28px;
  }

  .recognition-cache-poster {
    border-radius: 8px;
    block-size: 72px;
    inline-size: 50px;
  }

  .recognition-cache-mobile-item__content {
    min-inline-size: 0;
  }

  .recognition-cache-mobile-item__title {
    color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
    font-size: 13.5px;
    font-weight: 600;
    line-height: 1.32;
    overflow-wrap: anywhere;
  }

  .recognition-cache-mobile-item__meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    font-size: 12px;
    gap: 6px;
    margin-block-start: 5px;
  }

  .recognition-cache-mobile-item__key {
    color: rgba(var(--v-theme-on-surface), 0.52);
    font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
    font-size: 11.5px;
    line-height: 1.4;
    margin-block-start: 6px;
    overflow-wrap: anywhere;
  }
}
</style>
