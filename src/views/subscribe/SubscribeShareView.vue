<script lang="ts" setup>
import { debounce } from 'lodash-es'
import api from '@/api'
import type { ApiResponse, SubscribeShare, SubscribeShareStatistics } from '@/api/types'
import NoDataFound from '@/components/states/NoDataFound.vue'
import SubscribeShareCard from '@/components/cards/SubscribeShareCard.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { useI18n } from '@/composables/useChineseText'
import { useConfirm } from '@/composables/useConfirm'
import { useGlobalSettingsStore, useUserStore } from '@/stores'
import { canDeleteSubscribeShare, isOwnShare, runConcurrentBatches } from '@/utils/sharePermissions'
import { useToast } from 'vue-toastification'
import { useDisplay } from 'vuetify'

type SortType = 'time' | 'count' | 'rating'
type ShareScope = 'all' | 'mine'

const MAX_MINE_AUTO_PAGES = 5
const BATCH_DELETE_CONCURRENCY = 4

// 国际化与全局状态
const { t } = useI18n()
const $toast = useToast()
const createConfirm = useConfirm()
const display = useDisplay()
const globalSettingsStore = useGlobalSettingsStore()
const userStore = useUserStore()

const shareGridMinItemWidth = computed(() => (display.xs.value ? 260 : 300))
const shareGridGap = computed(() => (display.xs.value ? 10 : 16))

// 输入参数
const props = defineProps({
  // 父级传入的过滤关键字（如路由查询词或顶部搜索框）
  keyword: String,
})

// 判断当前文档是否已产生垂直滚动条
function hasScroll() {
  return document.body.scrollHeight - (window.innerHeight || document.documentElement.clientHeight) > 2
}

// API 地址
const apipath = 'subscribe/shares'

// 分页与请求代次状态
const page = ref(1)
const currentKey = ref(0)
const isRefreshed = ref(false)
const loadError = ref(false)
const hasReachedEnd = ref(false)
const mineScanPaused = ref(false)

// 搜索与多维筛选状态
const keyword = ref(props.keyword?.trim() || '')
const searchInput = ref(props.keyword || '')
const sortType = ref<SortType>('time')
const shareScope = ref<ShareScope>('all')
const filterMenuOpen = ref(false)
const filterParams = reactive({
  genre_id: '',
  min_rating: 0,
})

// 数据列表
const dataList = ref<SubscribeShare[]>([])

// 批量管理状态
const isBatchMode = ref(false)
const batchDeleting = ref(false)
const selectedShareIds = ref<Set<number>>(new Set())

// 分享达人榜弹窗状态
const rankDialogOpen = ref(false)
const rankLoading = ref(false)
const rankList = ref<SubscribeShareStatistics[]>([])

// 搜索或筛选重置允许新旧请求短暂并行，只接纳当前代次的响应。
let requestGeneration = 0
const loadingGenerations = new Set<number>()

// TMDB 流派合并字典（电影 + 电视剧）
const genreOptions = computed(() => {
  const dict: Record<string, string> = {
    '28': t('tmdb.genreType.action'),
    '12': t('tmdb.genreType.adventure'),
    '16': t('tmdb.genreType.animation'),
    '35': t('tmdb.genreType.comedy'),
    '80': t('tmdb.genreType.crime'),
    '99': t('tmdb.genreType.documentary'),
    '18': t('tmdb.genreType.drama'),
    '10751': t('tmdb.genreType.family'),
    '14': t('tmdb.genreType.fantasy'),
    '36': t('tmdb.genreType.history'),
    '27': t('tmdb.genreType.horror'),
    '10402': t('tmdb.genreType.music'),
    '9648': t('tmdb.genreType.mystery'),
    '10749': t('tmdb.genreType.romance'),
    '878': t('tmdb.genreType.scienceFiction'),
    '10770': t('tmdb.genreType.tvMovie'),
    '53': t('tmdb.genreType.thriller'),
    '10752': t('tmdb.genreType.war'),
    '37': t('tmdb.genreType.western'),
    '10759': t('tmdb.genreType.actionAdventure'),
    '10762': t('tmdb.genreType.kids'),
    '10763': t('tmdb.genreType.news'),
    '10764': t('tmdb.genreType.reality'),
    '10765': t('tmdb.genreType.sciFiFantasy'),
    '10766': t('tmdb.genreType.soap'),
    '10767': t('tmdb.genreType.talk'),
    '10768': t('tmdb.genreType.warPolitics'),
  }
  return Object.entries(dict).map(([id, label]) => ({ id, label }))
})

const sortOptions = computed<Array<{ value: SortType; label: string; icon: string }>>(() => [
  { value: 'time', label: t('tmdb.sortType.time'), icon: 'mdi-clock-outline' },
  { value: 'count', label: t('subscribe.sortCountHot'), icon: 'mdi-fire' },
  { value: 'rating', label: t('subscribe.sortRatingHigh'), icon: 'mdi-star-outline' },
])

const activeFilterCount = computed(() => (filterParams.genre_id ? 1 : 0) + (filterParams.min_rating > 0 ? 1 : 0))

const userUniqueId = computed(() => globalSettingsStore.globalSettings.USER_UNIQUE_ID)
const canManageAllShares = computed(() => Boolean(globalSettingsStore.globalSettings.SUBSCRIBE_SHARE_MANAGE))

// 判断单条记录当前用户是否可删
function isShareDeletable(item?: SubscribeShare): boolean {
  return canDeleteSubscribeShare(item, {
    superUser: userStore.superUser,
    userUniqueId: userUniqueId.value,
    canManageAll: canManageAllShares.value,
  })
}

// 归属范围过滤后的展示列表
const displayedShareList = computed(() => {
  if (shareScope.value === 'mine') {
    return dataList.value.filter(item => isOwnShare(item.share_uid, userUniqueId.value))
  }
  return dataList.value
})

// 当前展示列表中可删的分享集合
const deletableDisplayedShares = computed(() =>
  displayedShareList.value.filter(item => Boolean(item.id) && isShareDeletable(item)),
)

const hasOwnSharesInList = computed(() => dataList.value.some(item => isOwnShare(item.share_uid, userUniqueId.value)))

// 管理分享按钮仅对具备管理权限或列表中存在本人分享的超管展示
const showManageButton = computed(
  () =>
    isBatchMode.value ||
    (userStore.superUser && (canManageAllShares.value || (dataList.value.length > 0 && hasOwnSharesInList.value))),
)

const isAllDeletableSelected = computed(
  () =>
    deletableDisplayedShares.value.length > 0 &&
    deletableDisplayedShares.value.every(item => item.id !== undefined && selectedShareIds.value.has(item.id)),
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

// 页内即时搜索 300ms 防抖
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

// 同步父级 props.keyword 变化
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

function selectSortType(nextSort: SortType) {
  if (sortType.value === nextSort) return
  sortType.value = nextSort
  resetData()
}

function selectGenre(genreId: string) {
  if (filterParams.genre_id === genreId) return
  filterParams.genre_id = genreId
  resetData()
}

function handleMinRatingChange(value: number) {
  if (filterParams.min_rating === value) return
  filterParams.min_rating = value
  resetData()
}

function resetAdvancedFilters() {
  if (!filterParams.genre_id && filterParams.min_rating === 0) return
  filterParams.genre_id = ''
  filterParams.min_rating = 0
  resetData()
}

function selectShareScope(nextScope: ShareScope) {
  if (shareScope.value === nextScope) return
  shareScope.value = nextScope
  mineScanPaused.value = false
  // 切换归属范围时清理已不在可见可删集合中的勾选项
  if (isBatchMode.value) {
    const allowedIds = new Set(deletableDisplayedShares.value.map(item => item.id).filter(Boolean) as number[])
    selectedShareIds.value = new Set([...selectedShareIds.value].filter(id => allowedIds.has(id)))
  }
  if (nextScope === 'mine' && !hasReachedEnd.value && !hasScroll()) {
    void scanMorePagesForMine()
  }
}

// 拼装查询参数
function getParams() {
  const params: Record<string, string | number> = {
    page: page.value,
    count: 30,
    name: keyword.value,
  }
  if (sortType.value !== 'time') {
    params.sort_type = sortType.value
  }
  if (filterParams.genre_id) {
    params.genre_id = Number.parseInt(filterParams.genre_id, 10)
  }
  if (filterParams.min_rating > 0) {
    params.min_rating = filterParams.min_rating
  }
  return params
}

// 分页合并去重，彻底消除本地删除后翻页偏移带来的重复卡片
function appendUniqueShares(incoming: SubscribeShare[]) {
  if (incoming.length === 0) return
  const existingIds = new Set(dataList.value.map(item => item.id).filter((id): id is number => id !== undefined))
  const uniqueItems = incoming.filter(item => item.id === undefined || !existingIds.has(item.id))
  if (uniqueItems.length > 0) {
    dataList.value = [...dataList.value, ...uniqueItems]
  }
}

// 获取列表数据（支持 VInfiniteScroll）
async function fetchData({ done }: { done: (status: 'empty' | 'error' | 'ok') => void }) {
  const generation = requestGeneration

  // 同一搜索条件只允许一个分页请求在途。
  if (loadingGenerations.has(generation)) {
    return
  }

  loadingGenerations.add(generation)
  loadError.value = false
  mineScanPaused.value = false

  try {
    let scannedPagesInPass = 0
    while (generation === requestGeneration) {
      const currentData: SubscribeShare[] = await api.get(apipath, {
        params: getParams(),
      })

      if (generation !== requestGeneration) return

      isRefreshed.value = true
      if (currentData.length === 0) {
        hasReachedEnd.value = true
        done('empty')
        return
      }

      appendUniqueShares(currentData)
      page.value++
      scannedPagesInPass++
      done('ok')
      await nextTick()

      if (hasScroll()) return

      // 「我的分享」客户端过滤模式下限制单轮自动连拉页数，避免无匹配时遍历全站所有页
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

// 手动或自动补拉后续页面（用于批量删除后不足一屏或继续扫描「我的分享」）
async function scanMorePagesForMine() {
  const generation = requestGeneration
  if (hasReachedEnd.value || loadingGenerations.has(generation)) return

  loadingGenerations.add(generation)
  mineScanPaused.value = false
  try {
    let scanned = 0
    while (generation === requestGeneration && !hasReachedEnd.value) {
      const currentData: SubscribeShare[] = await api.get(apipath, {
        params: getParams(),
      })
      if (generation !== requestGeneration) return
      if (currentData.length === 0) {
        hasReachedEnd.value = true
        return
      }
      appendUniqueShares(currentData)
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

// 单卡删除回调
function removeData(id: number) {
  dataList.value = dataList.value.filter(item => item.id !== id)
  if (selectedShareIds.value.has(id)) {
    const nextSet = new Set(selectedShareIds.value)
    nextSet.delete(id)
    selectedShareIds.value = nextSet
  }
  void nextTick(() => {
    if (!hasScroll() && !hasReachedEnd.value) {
      void scanMorePagesForMine()
    }
  })
}

// 切换批量管理模式
function toggleBatchMode() {
  isBatchMode.value = !isBatchMode.value
  if (!isBatchMode.value) {
    selectedShareIds.value = new Set()
  }
}

// 切换单个分享选中状态（仅允许勾选可删项）
function toggleSelectShare(item: SubscribeShare) {
  const id = item.id
  if (!id || !isShareDeletable(item)) return

  const nextSet = new Set(selectedShareIds.value)
  if (nextSet.has(id)) nextSet.delete(id)
  else nextSet.add(id)
  selectedShareIds.value = nextSet
}

// 全选可删项 / 取消全选
function toggleSelectAllDeletable() {
  if (isAllDeletableSelected.value) {
    selectedShareIds.value = new Set()
    return
  }
  selectedShareIds.value = new Set(
    deletableDisplayedShares.value.map(item => item.id).filter((id): id is number => id !== undefined),
  )
}

// 批量删除选中分享（二次确认 + 最多 4 并发 + 携带 share_uid + 一次性更新触发 FLIP 补位）
async function batchDelete() {
  if (batchDeleting.value || selectedShareIds.value.size === 0) return

  const targetItems = dataList.value.filter(
    item => item.id !== undefined && selectedShareIds.value.has(item.id) && isShareDeletable(item),
  )
  if (targetItems.length === 0) return

  const isConfirmed = await createConfirm({
    title: t('common.confirm'),
    content: t('subscribe.batchCancelShareConfirm', { count: targetItems.length }),
  })
  if (!isConfirmed) return

  batchDeleting.value = true
  try {
    const results = await runConcurrentBatches(targetItems, BATCH_DELETE_CONCURRENCY, item =>
      api.delete<ApiResponse<unknown>, ApiResponse<unknown>>(`subscribe/share/${item.id}`, {
        params: {
          share_uid: item.share_uid || userUniqueId.value,
        },
      }),
    )

    const succeededIds = new Set<number>()
    const failedIds: number[] = []
    let firstErrorReason = ''

    results.forEach((settled, index) => {
      const targetId = targetItems[index].id!
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

    // 一次性过滤更新 dataList，触发一次丝滑的 ProgressiveCardGrid FLIP 弹性前移补位
    if (succeededIds.size > 0) {
      dataList.value = dataList.value.filter(item => item.id === undefined || !succeededIds.has(item.id))
    }

    if (failedIds.length > 0) {
      selectedShareIds.value = new Set(failedIds)
      $toast.error(
        firstErrorReason
          ? t('subscribe.batchCancelShareFailedDetail', { count: failedIds.length, message: firstErrorReason })
          : t('subscribe.batchCancelShareFailed', { count: failedIds.length }),
      )
    } else {
      selectedShareIds.value = new Set()
      isBatchMode.value = false
      $toast.success(t('subscribe.batchCancelShareSuccess', { count: succeededIds.size }))
    }

    await nextTick()
    if (!hasScroll() && !hasReachedEnd.value) {
      void scanMorePagesForMine()
    }
  } finally {
    batchDeleting.value = false
  }
}

// 打开分享达人榜并加载统计数据
async function openShareRankDialog() {
  rankDialogOpen.value = true
  rankLoading.value = true
  try {
    const stats = await api.get<SubscribeShareStatistics[], SubscribeShareStatistics[]>('subscribe/share/statistics')
    rankList.value = Array.isArray(stats) ? stats : []
  } catch (error) {
    console.error(error)
    rankList.value = []
    $toast.error(t('subscribe.requestFailed'))
  } finally {
    rankLoading.value = false
  }
}

// 点击达人榜中的分享人直接填入搜索框筛选其分享
function filterByShareUser(shareUser?: string) {
  const normalized = shareUser?.trim()
  if (!normalized) return
  rankDialogOpen.value = false
  debouncedKeywordUpdate.cancel()
  if (shareScope.value === 'mine') {
    shareScope.value = 'all'
  }
  searchInput.value = normalized
  if (keyword.value !== normalized) {
    keyword.value = normalized
    resetData()
  }
}

onUnmounted(() => {
  debouncedKeywordUpdate.cancel()
})
</script>

<template>
  <!-- 紧凑一体化顶部控制栏 -->
  <div class="share-toolbar mb-3">
    <div class="share-toolbar__main">
      <!-- 页内即时搜索框 -->
      <VTextField
        :model-value="searchInput"
        :placeholder="t('subscribe.searchSharePlaceholder')"
        prepend-inner-icon="mdi-magnify"
        density="compact"
        variant="outlined"
        hide-details
        clearable
        class="share-toolbar__search"
        @update:model-value="handleSearchInputUpdate"
        @click:clear="handleSearchInputUpdate('')"
      />

      <!-- 排序胶囊组 -->
      <div class="share-toolbar__pills" role="group" :aria-label="t('tmdb.sort')">
        <VChip
          v-for="option in sortOptions"
          :key="option.value"
          :color="sortType === option.value ? 'primary' : undefined"
          :variant="sortType === option.value ? 'flat' : 'tonal'"
          :prepend-icon="option.icon"
          size="small"
          class="share-toolbar__pill"
          @click="selectSortType(option.value)"
        >
          {{ option.label }}
        </VChip>
      </div>

      <!-- 归属范围胶囊组：全部 / 我的分享 -->
      <div v-if="userUniqueId" class="share-toolbar__pills" role="group">
        <VChip
          :color="shareScope === 'all' ? 'primary' : undefined"
          :variant="shareScope === 'all' ? 'flat' : 'tonal'"
          size="small"
          class="share-toolbar__pill"
          @click="selectShareScope('all')"
        >
          {{ t('subscribe.shareScopeAll') }}
        </VChip>
        <VChip
          :color="shareScope === 'mine' ? 'success' : undefined"
          :variant="shareScope === 'mine' ? 'flat' : 'tonal'"
          prepend-icon="mdi-account-check-outline"
          size="small"
          class="share-toolbar__pill"
          @click="selectShareScope('mine')"
        >
          {{ t('subscribe.shareScopeMine') }}
        </VChip>
      </div>

      <!-- 右侧功能按钮组：流派/评分筛选 + 分享达人榜 + 管理分享 -->
      <div class="share-toolbar__actions">
        <VMenu v-model="filterMenuOpen" :close-on-content-click="false" location="bottom end">
          <template #activator="{ props: menuProps }">
            <VBtn
              v-bind="menuProps"
              :color="activeFilterCount > 0 ? 'primary' : undefined"
              :variant="activeFilterCount > 0 ? 'flat' : 'tonal'"
              size="small"
              rounded="lg"
              prepend-icon="mdi-tune-variant"
            >
              {{ t('common.filter') }}
              <span v-if="activeFilterCount > 0" class="ms-1">({{ activeFilterCount }})</span>
            </VBtn>
          </template>
          <VCard max-width="380" class="share-filter-menu-card pa-3">
            <div class="d-flex align-center justify-space-between mb-2">
              <span class="text-subtitle-2 font-weight-bold">{{ t('common.filter') }}</span>
              <VBtn
                v-if="activeFilterCount > 0"
                size="x-small"
                variant="text"
                color="primary"
                prepend-icon="mdi-restore"
                @click="resetAdvancedFilters"
              >
                {{ t('subscribe.resetFilters') }}
              </VBtn>
            </div>

            <div class="text-caption text-medium-emphasis mb-1">{{ t('tmdb.genre') }}</div>
            <div class="share-filter-genres mb-3">
              <VChip
                :color="filterParams.genre_id === '' ? 'primary' : undefined"
                :variant="filterParams.genre_id === '' ? 'flat' : 'tonal'"
                size="x-small"
                rounded="lg"
                class="cursor-pointer"
                @click="selectGenre('')"
              >
                {{ t('common.all') }}
              </VChip>
              <VChip
                v-for="genre in genreOptions"
                :key="genre.id"
                :color="filterParams.genre_id === genre.id ? 'primary' : undefined"
                :variant="filterParams.genre_id === genre.id ? 'flat' : 'tonal'"
                size="x-small"
                rounded="lg"
                class="cursor-pointer"
                @click="selectGenre(genre.id)"
              >
                {{ genre.label }}
              </VChip>
            </div>

            <div class="d-flex align-center justify-space-between text-caption text-medium-emphasis mb-1">
              <span>{{ t('subscribe.minRatingLabel') }}</span>
              <strong class="text-high-emphasis">
                {{ filterParams.min_rating > 0 ? `≥ ${filterParams.min_rating}` : t('common.all') }}
              </strong>
            </div>
            <VSlider
              :model-value="filterParams.min_rating"
              :min="0"
              :max="10"
              :step="1"
              color="primary"
              density="compact"
              hide-details
              thumb-label
              @end="handleMinRatingChange"
            />
          </VCard>
        </VMenu>

        <VBtn
          variant="tonal"
          color="warning"
          size="small"
          rounded="lg"
          prepend-icon="mdi-trophy-outline"
          @click="openShareRankDialog"
        >
          {{ t('subscribe.shareRankButton') }}
        </VBtn>

        <VBtn
          v-if="showManageButton"
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

    <!-- 批量管理操作条 -->
    <div v-if="isBatchMode" class="share-batch-bar mt-2">
      <span class="share-batch-bar__count">
        {{ t('subscribe.selectedSharesCount', { count: selectedShareIds.size }) }}
      </span>
      <div class="share-batch-bar__actions">
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

  <VPageContentTitle v-if="keyword" :title="`${t('common.search')}：${keyword}`" class="share-search-heading" />
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
      :get-item-key="
        item =>
          item.id ||
          `${item.media_id || item.tmdbid || item.doubanid || item.bangumiid || item.anilistid || item.name}-${item.share_user}`
      "
      :min-item-width="shareGridMinItemWidth"
      :gap="shareGridGap"
      :estimated-item-height="168"
      tabindex="0"
    >
      <template #default="{ item }">
        <SubscribeShareCard
          :media="item"
          :batch-mode="isBatchMode"
          :deletable="isShareDeletable(item)"
          :selected="selectedShareIds.has(item.id || 0)"
          @delete="removeData(item.id || 0)"
          @toggle-select="toggleSelectShare(item)"
        />
      </template>
    </ProgressiveCardGrid>

    <!-- 「我的分享」分段扫描提示条 -->
    <div
      v-if="shareScope === 'mine' && mineScanPaused && !hasReachedEnd"
      class="d-flex flex-wrap align-center justify-center ga-3 py-5"
    >
      <span class="text-body-2 text-medium-emphasis">{{ t('subscribe.mineSharesPausedHint') }}</span>
      <VBtn size="small" variant="tonal" color="primary" rounded="lg" @click="scanMorePagesForMine">
        {{ t('subscribe.loadMoreMineShares') }}
      </VBtn>
    </div>

    <NoDataFound
      v-if="displayedShareList.length === 0 && isRefreshed && !loadError && !mineScanPaused"
      error-code="404"
      :error-title="t('common.noData')"
      :error-description="
        keyword || activeFilterCount > 0 || shareScope === 'mine' ? t('common.noContent') : t('subscribe.noShareData')
      "
    />
  </VInfiniteScroll>

  <!-- 订阅分享达人榜轻量弹窗 -->
  <VDialog v-model="rankDialogOpen" max-width="28rem" scrollable>
    <VCard>
      <VCardItem class="pb-2">
        <template #prepend>
          <VIcon icon="mdi-trophy" color="warning" />
        </template>
        <VCardTitle class="text-subtitle-1 font-weight-bold">{{ t('subscribe.shareRankTitle') }}</VCardTitle>
        <VCardSubtitle class="text-caption">{{ t('subscribe.shareRankSubtitle') }}</VCardSubtitle>
      </VCardItem>
      <VDivider />
      <VCardText class="pa-2" style="max-block-size: 24rem">
        <div v-if="rankLoading" class="py-8 text-center text-medium-emphasis text-body-2">
          {{ t('common.loadingText') }}
        </div>
        <div v-else-if="rankList.length === 0" class="py-8 text-center text-medium-emphasis text-body-2">
          {{ t('subscribe.noStatisticsData') }}
        </div>
        <VList v-else density="compact" class="py-0">
          <VListItem
            v-for="(entry, index) in rankList"
            :key="entry.share_user || index"
            rounded="lg"
            class="mb-1"
            @click="filterByShareUser(entry.share_user)"
          >
            <template #prepend>
              <span
                class="share-rank-index me-3"
                :class="{
                  'share-rank-index--top': index < 3,
                }"
              >
                {{ index + 1 }}
              </span>
            </template>
            <VListItemTitle class="font-weight-medium">
              {{ entry.share_user || t('common.unknown') }}
            </VListItemTitle>
            <template #append>
              <div class="d-flex align-center ga-3 text-caption text-medium-emphasis">
                <span>{{ entry.share_count ?? 0 }} {{ t('subscribe.shareCount') }}</span>
                <span class="text-error font-weight-medium">
                  <VIcon icon="mdi-fire" size="13" />
                  {{ (entry.total_reuse_count ?? 0).toLocaleString() }}
                </span>
              </div>
            </template>
          </VListItem>
        </VList>
      </VCardText>
      <VDialogCloseBtn @click="rankDialogOpen = false" />
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped>
.share-toolbar__main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
}

.share-toolbar__search {
  flex: 1 1 200px;
  max-inline-size: 260px;
  min-inline-size: 160px;
}

.share-toolbar__search :deep(.v-field) {
  border-radius: 7px;
  font-size: 13px;
  min-block-size: 32px;
}

.share-toolbar__search :deep(.v-field__input) {
  min-block-size: 32px;
  padding-block: 4px;
}

.share-toolbar__pills {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}

.share-toolbar__pill {
  border-radius: 6px !important;
  block-size: 26px !important;
  cursor: pointer;
  font-size: 12.5px !important;
  font-weight: 500;
  padding-inline: 9px !important;
}

.share-toolbar__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-inline-start: auto;
}

.share-filter-genres {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.share-batch-bar {
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

.share-batch-bar__count {
  color: rgb(var(--v-theme-primary));
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.share-batch-bar__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.share-search-heading,
.share-search-heading :deep(*) {
  font-size: 20px !important;
  font-weight: 600 !important;
  line-height: 1.35 !important;
  margin-block: 0 10px !important;
  padding-inline: 8px;
}

.share-rank-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.08);
  block-size: 22px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  inline-size: 22px;
}

.share-rank-index--top {
  background: rgba(var(--v-theme-warning), 0.18);
  color: rgb(var(--v-theme-warning));
}

.share-filter-menu-card {
  border: 1px solid var(--mp-border-card);
  border-radius: 10px !important;
  background-color: rgb(var(--v-theme-surface));
  max-inline-size: min(360px, calc(100vw - 24px)) !important;
}

@media (width <= 680px) {
  .share-toolbar__main {
    gap: 8px;
  }

  .share-toolbar__search {
    flex: 1 1 100%;
    max-inline-size: none;
  }

  .share-toolbar__pills {
    gap: 5px;
  }

  .share-toolbar__pill {
    border-radius: 7px !important;
    font-size: 12px !important;
    padding-inline: 8px !important;
  }

  .share-toolbar__actions {
    inline-size: 100%;
    gap: 6px;
    margin-inline-start: 0;
  }

  .share-toolbar__actions :deep(.v-btn) {
    border-radius: 7px !important;
    font-size: 12px;
  }

  .share-batch-bar {
    gap: 6px;
    padding-block: 8px;
    padding-inline: 10px;
  }

  .share-batch-bar__count {
    font-size: 12.5px;
  }

  .share-batch-bar__actions {
    inline-size: 100%;
    gap: 6px;
  }

  .share-search-heading,
  .share-search-heading :deep(*) {
    font-size: 17px !important;
    padding-inline: 2px;
  }
}
</style>
