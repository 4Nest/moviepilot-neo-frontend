<script lang="ts" setup>
import { useI18n } from '@/composables/useChineseText'
import { useEventListener } from '@vueuse/core'
import { openSharedDialog } from '@/composables/useSharedDialog'

const TorrentAllFiltersDialog = defineAsyncComponent(() => import('@/components/dialog/TorrentAllFiltersDialog.vue'))
const TorrentSingleFilterDialog = defineAsyncComponent(
  () => import('@/components/dialog/TorrentSingleFilterDialog.vue'),
)

// 国际化
const { t } = useI18n()

// 定义输入参数
const props = defineProps<{
  // 筛选表单
  filterForm: Record<string, string[]>
  // 筛选选项
  filterOptions: Record<string, string[]>
  // 排序字段
  sortField: string
  // 排序方向
  sortType: 'asc' | 'desc'
  // 筛选后的总数量
  totalFilteredCount: number
  // 过滤项标题映射
  filterTitles: Record<string, string>
  // 排序标题映射
  sortTitles: Record<string, string>
  // 是否启用滚动动画
  enableAnimation?: boolean
}>()

// 定义事件
const emit = defineEmits<{
  'update:sortField': [value: string]
  'update:sortType': [value: 'asc' | 'desc']
  'update:filterForm': [key: string, values: string[]]
  'selectAll': [key: string]
  'clearFilter': [key: string]
  'clearAllFilters': []
  'removeFilter': [key: string, value: string]
}>()

// 过滤菜单相关
const currentFilter = ref('site')
const currentFilterTitle = computed(() => props.filterTitles[currentFilter.value])

let allFilterDialogController: ReturnType<typeof openSharedDialog> | null = null
let filterDialogController: ReturnType<typeof openSharedDialog> | null = null

// 计算已选择的过滤条件数量
const getFilterCount = computed(() => {
  let count = 0
  for (const key in props.filterForm) {
    count += props.filterForm[key].length
  }
  return count
})

// 计算已选择的过滤条件
const getSelectedFilters = computed(() => {
  const filters: Record<string, string[]> = {}
  for (const key in props.filterForm) {
    if (props.filterForm[key].length > 0) {
      filters[key] = [...props.filterForm[key]]
    }
  }
  return filters
})

// 给定过滤类型返回不同图标
function getFilterIcon(key: string) {
  const icons: Record<string, string> = {
    site: 'mdi-server-network',
    season: 'mdi-television-classic',
    freeState: 'mdi-gift-outline',
    resolution: 'mdi-monitor-screenshot',
    videoCode: 'mdi-video-vintage',
    edition: 'mdi-quality-high',
    releaseGroup: 'mdi-account-group-outline',
    subtitle: 'mdi-subtitles-outline',
  }
  return icons[key] || 'mdi-filter-variant'
}

// 生成全部筛选共享弹窗的最新参数。
function getAllFiltersDialogProps() {
  return {
    filterForm: props.filterForm,
    filterOptions: props.filterOptions,
    filterTitles: props.filterTitles,
  }
}

// 生成单项筛选共享弹窗的最新参数。
function getSingleFilterDialogProps() {
  return {
    filterForm: props.filterForm,
    filterKey: currentFilter.value,
    filterOptions: props.filterOptions,
    filterTitle: currentFilterTitle.value,
  }
}

// 关闭全部筛选共享弹窗。
function closeAllFilterDialog() {
  allFilterDialogController?.close()
  allFilterDialogController = null
}

// 关闭单项筛选共享弹窗。
function closeFilterDialog() {
  filterDialogController?.close()
  filterDialogController = null
}

// 打开全部筛选共享弹窗。
function openAllFilterDialog() {
  allFilterDialogController?.close()
  allFilterDialogController = openSharedDialog(
    TorrentAllFiltersDialog,
    getAllFiltersDialogProps(),
    {
      clearAllFilters,
      clearFilter,
      close: () => {
        allFilterDialogController = null
      },
      selectAll,
      'update:filterForm': handleFilterChange,
      'update:modelValue': (value: boolean) => {
        if (!value) allFilterDialogController = null
      },
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

// 打开单项筛选共享弹窗。
function openFilterDialog() {
  if (filterDialogController) {
    filterDialogController.updateProps(getSingleFilterDialogProps())
    return
  }

  filterDialogController = openSharedDialog(
    TorrentSingleFilterDialog,
    getSingleFilterDialogProps(),
    {
      clearFilter,
      close: () => {
        filterDialogController = null
      },
      selectAll,
      'update:filterForm': handleFilterChange,
      'update:modelValue': (value: boolean) => {
        if (!value) filterDialogController = null
      },
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

// 开关全部筛选菜单。
function toggleAllFilterMenu() {
  if (allFilterDialogController) closeAllFilterDialog()
  else openAllFilterDialog()
}

// 切换单项筛选共享弹窗。
function toggleFilterMenu(key: string) {
  if (currentFilter.value === key && filterDialogController) {
    closeFilterDialog()
  } else {
    currentFilter.value = key
    openFilterDialog()
  }
}

// 处理筛选值变化
function handleFilterChange(key: string, values: string[]) {
  emit('update:filterForm', key, values)
}

// 全选某个过滤项
function selectAll(key: string) {
  emit('selectAll', key)
}

// 清除某个过滤项
function clearFilter(key: string) {
  emit('clearFilter', key)
}

// 清除所有过滤条件
function clearAllFilters() {
  emit('clearAllFilters')
}

// 移除单个过滤条件
function removeFilter(key: string, value: string) {
  emit('removeFilter', key, value)
}

// 滚动条引用
const filterBarRef = ref<HTMLElement>()
let initialScrollTimer: ReturnType<typeof setTimeout> | null = null
let reverseScrollTimer: ReturnType<typeof setTimeout> | null = null
let activeAnimationFrame: number | null = null

function clearScrollAnimationTimers() {
  if (initialScrollTimer !== null) {
    clearTimeout(initialScrollTimer)
    initialScrollTimer = null
  }
  if (reverseScrollTimer !== null) {
    clearTimeout(reverseScrollTimer)
    reverseScrollTimer = null
  }
  if (activeAnimationFrame !== null) {
    cancelAnimationFrame(activeAnimationFrame)
    activeAnimationFrame = null
  }
}

/**
 * 自定义平滑滚动
 * @param element 元素
 * @param target 目标位置
 * @param duration 持续时间(ms)
 */
function smoothScroll(element: HTMLElement, target: number, duration: number) {
  const start = element.scrollLeft
  const change = target - start
  let startTime: number | null = null

  function animate(currentTime: number) {
    if (startTime === null) startTime = currentTime
    const timeElapsed = currentTime - startTime
    const progress = Math.min(timeElapsed / duration, 1)

    // 使用 ease-in-out 缓动函数
    const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress
    element.scrollLeft = start + change * ease

    if (timeElapsed < duration) {
      activeAnimationFrame = requestAnimationFrame(animate)
    } else {
      activeAnimationFrame = null
    }
  }

  activeAnimationFrame = requestAnimationFrame(animate)
}

// 初始滚动动画
onMounted(() => {
  if (filterBarRef.value) {
    useEventListener(filterBarRef, 'wheel', (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault()
        filterBarRef.value!.scrollLeft += e.deltaY
      }
    })
  }

  if (props.enableAnimation === false) return

  nextTick(() => {
    initialScrollTimer = setTimeout(() => {
      initialScrollTimer = null
      const el = filterBarRef.value
      if (el && el.clientWidth > 0 && el.scrollWidth > el.clientWidth) {
        // 检查当前视口范围内的最后一个元素（即右侧边缘处的元素）
        const containerRect = el.getBoundingClientRect()
        const children = Array.from(el.children) as HTMLElement[]
        const lastInViewport = children
          .filter(c => {
            const rect = c.getBoundingClientRect()
            return rect.left < containerRect.right
          })
          .pop()

        if (lastInViewport) {
          const rect = lastInViewport.getBoundingClientRect()
          const visibleWidth = Math.min(rect.right, containerRect.right) - rect.left
          const visibleRatio = visibleWidth / rect.width

          // 判断是否是列表最后一个元素
          const isLastItem = lastInViewport === children[children.length - 1]

          // 1. 如果是最后一个元素，且显示比例超过80%，说明基本已经展示完了，不需要动画
          if (isLastItem && visibleRatio > 0.8) {
            return
          }

          // 2. 如果视口内最后一个元素显示比例在30%到80%之间（明显的截断状态），用户能感知到后面还有内容，不需要滚动提示
          // 比例过小(<0.3)可能看不清，非最后一个元素且比例过大(>0.8)可能误以为是结尾，这两种情况都需要提示
          if (visibleRatio > 0.3 && visibleRatio < 0.8) {
            return
          }
        }

        // 滚动到底部 (1100ms)
        smoothScroll(el, el.scrollWidth - el.clientWidth, 1100)
        // 短暂停止后滚动回顶部 (1100ms)
        reverseScrollTimer = setTimeout(() => {
          reverseScrollTimer = null
          smoothScroll(el, 0, 1100)
        }, 1600)
      }
    }, 500)
  })
})

onUnmounted(() => {
  clearScrollAnimationTimers()
  closeAllFilterDialog()
  closeFilterDialog()
})
</script>

<template>
  <!-- PC端头部和筛选栏 -->
  <div class="search-header d-none d-sm-block">
    <VCard class="view-header filter-toolbar-card mb-3" elevation="0">
      <div class="filter-toolbar-row d-flex align-center">
        <!-- 固定位置：资源数量和排序 -->
        <div class="d-flex align-center flex-shrink-0">
          <VChip
            color="primary"
            variant="tonal"
            size="small"
            class="search-count me-2 flex-shrink-0"
            prepend-icon="mdi-magnify"
          >
            {{ totalFilteredCount }} {{ t('torrent.resources') }}
          </VChip>

          <VBtn variant="text" size="small" rounded="lg" class="sort-btn" :color="undefined">
            <template #prepend>
              <VIcon :icon="sortType === 'asc' ? 'mdi-sort-ascending' : 'mdi-sort-descending'" size="16" class="me-1" />
            </template>
            <span class="sort-btn__label">{{ sortTitles[sortField] }}</span>
            <VIcon icon="mdi-chevron-down" size="15" class="ms-1" />

            <VMenu activator="parent" transition="slide-y-transition">
              <VList density="compact" min-width="128" class="sort-menu-list">
                <!-- 升序/降序 选项 -->
                <VListItem
                  value="asc"
                  :active="sortType === 'asc'"
                  color="primary"
                  @click="emit('update:sortType', 'asc')"
                  class="px-3"
                >
                  <template #prepend>
                    <VIcon icon="mdi-sort-ascending" size="small" class="me-2" />
                  </template>
                  <VListItemTitle>{{ t('common.ascending') }}</VListItemTitle>
                </VListItem>
                <VListItem
                  value="desc"
                  :active="sortType === 'desc'"
                  color="primary"
                  @click="emit('update:sortType', 'desc')"
                  class="px-3"
                >
                  <template #prepend>
                    <VIcon icon="mdi-sort-descending" size="small" class="me-2" />
                  </template>
                  <VListItemTitle>{{ t('common.descending') }}</VListItemTitle>
                </VListItem>

                <VDivider class="my-1" />

                <!-- 排序字段选项 -->
                <VListItem
                  v-for="(title, key) in sortTitles"
                  :key="key"
                  :value="key"
                  :active="sortField === key"
                  color="primary"
                  @click="emit('update:sortField', key as string)"
                  class="px-3"
                >
                  <VListItemTitle>{{ title }}</VListItemTitle>
                </VListItem>
              </VList>
            </VMenu>
          </VBtn>

          <div class="filter-divider"></div>
        </div>

        <!-- 滚动区域：筛选条件 -->
        <div class="filter-bar" ref="filterBarRef">
          <!-- 筛选按钮 -->
          <VBtn
            v-for="(title, key) in filterTitles"
            v-show="filterOptions[key].length > 0"
            :key="key"
            variant="outlined"
            size="small"
            :color="filterForm[key].length > 0 ? 'primary' : undefined"
            :prepend-icon="getFilterIcon(key)"
            class="filter-btn"
            rounded="lg"
          >
            {{ title }}
            <VChip
              v-if="filterForm[key].length > 0"
              size="x-small"
              color="primary"
              class="filter-count-badge ms-1"
              variant="tonal"
            >
              {{ filterForm[key].length }}
            </VChip>
            <VMenu activator="parent" :close-on-content-click="false" scrim>
              <VCard max-width="20rem">
                <VCardText class="filter-menu-content">
                  <div class="flex justify-between mb-1">
                    <VBtn variant="text" size="small" color="primary" @click="selectAll(key)">
                      {{ t('torrent.selectAll') }}
                    </VBtn>
                    <VBtn
                      v-if="filterForm[key].length > 0"
                      variant="text"
                      size="small"
                      color="error"
                      @click="clearFilter(key)"
                    >
                      {{ t('torrent.clear') }}
                    </VBtn>
                  </div>
                  <VChipGroup
                    :model-value="filterForm[key]"
                    @update:model-value="(val: string[]) => handleFilterChange(key, val)"
                    column
                    multiple
                    class="filter-options"
                  >
                    <VChip
                      v-for="option in filterOptions[key]"
                      :key="option"
                      :value="option"
                      filter
                      variant="tonal"
                      rounded="lg"
                      class="filter-chip"
                      size="small"
                    >
                      {{ option }}
                    </VChip>
                  </VChipGroup>
                </VCardText>
              </VCard>
            </VMenu>
          </VBtn>

          <!-- 全部筛选按钮 -->
          <VBtn
            variant="outlined"
            size="small"
            :color="getFilterCount > 0 ? 'primary' : undefined"
            class="filter-btn me-1"
            prepend-icon="mdi-filter-variant"
            rounded="lg"
            @click="toggleAllFilterMenu"
          >
            {{ t('torrent.allFilters') }}
            <VChip
              v-if="getFilterCount > 0"
              size="x-small"
              color="primary"
              class="filter-count-badge ms-1"
              variant="tonal"
            >
              {{ getFilterCount }}
            </VChip>
          </VBtn>
        </div>
      </div>

      <div v-if="getFilterCount > 0" class="selected-filters">
        <div class="d-flex align-center">
          <div class="selected-filters__list d-flex flex-wrap align-center flex-grow-1">
            <template v-for="(values, key) in getSelectedFilters" :key="key">
              <VChip
                v-for="(value, index) in values"
                :key="`${key}-${index}`"
                color="primary"
                size="small"
                closable
                variant="tonal"
                rounded="lg"
                class="filter-tag"
                @click:close="removeFilter(key as string, value)"
              >
                <VIcon size="13" :icon="getFilterIcon(key as string)" class="me-1"></VIcon>
                <strong>{{ filterTitles[key as string] }}:</strong> {{ value }}
              </VChip>
            </template>
          </div>

          <VSpacer />

          <!-- 清除全部筛选按钮 -->
          <VBtn
            v-if="getFilterCount > 0"
            variant="text"
            size="small"
            color="error"
            @click="clearAllFilters"
            class="ms-2 flex-shrink-0"
            prepend-icon="mdi-close-circle-outline"
          >
            {{ t('torrent.clearFilters') }}
          </VBtn>
        </div>
      </div>
    </VCard>
  </div>

  <!-- 移动端头部和筛选区域 -->
  <VCard class="d-block d-sm-none search-header-mobile filter-toolbar-card mb-3" elevation="0">
    <div class="view-header">
      <div class="filter-toolbar-mobile-body d-flex align-center flex-wrap">
        <div class="d-flex align-center w-100">
          <VChip color="primary" variant="tonal" size="small" class="search-count me-auto" prepend-icon="mdi-magnify">
            {{ totalFilteredCount }} {{ t('torrent.resources') }}
          </VChip>

          <!-- 排序选择 -->
          <VBtn variant="text" size="small" rounded="lg" class="sort-btn mobile-sort-btn" :color="undefined">
            <template #prepend>
              <VIcon :icon="sortType === 'asc' ? 'mdi-sort-ascending' : 'mdi-sort-descending'" size="16" class="me-1" />
            </template>
            <span class="sort-btn__label">{{ sortTitles[sortField] }}</span>
            <VIcon icon="mdi-chevron-down" size="15" class="ms-1" />

            <VMenu activator="parent" transition="slide-y-transition">
              <VList density="compact" min-width="128" class="sort-menu-list">
                <!-- 升序/降序 选项 -->
                <VListItem
                  value="asc"
                  :active="sortType === 'asc'"
                  color="primary"
                  @click="emit('update:sortType', 'asc')"
                  class="px-3"
                >
                  <template #prepend>
                    <VIcon icon="mdi-sort-ascending" size="small" class="me-2" />
                  </template>
                  <VListItemTitle>{{ t('common.ascending') }}</VListItemTitle>
                </VListItem>
                <VListItem
                  value="desc"
                  :active="sortType === 'desc'"
                  color="primary"
                  @click="emit('update:sortType', 'desc')"
                  class="px-3"
                >
                  <template #prepend>
                    <VIcon icon="mdi-sort-descending" size="small" class="me-2" />
                  </template>
                  <VListItemTitle>{{ t('common.descending') }}</VListItemTitle>
                </VListItem>

                <VDivider class="my-1" />

                <!-- 排序字段选项 -->
                <VListItem
                  v-for="(title, key) in sortTitles"
                  :key="key"
                  :value="key"
                  :active="sortField === key"
                  color="primary"
                  @click="emit('update:sortField', key as string)"
                  class="px-3"
                >
                  <VListItemTitle>{{ title }}</VListItemTitle>
                </VListItem>
              </VList>
            </VMenu>
          </VBtn>
        </div>

        <!-- 筛选胶囊按钮区域 -->
        <div class="filter-buttons-grid w-100 mt-2">
          <VBtn
            v-for="(title, key) in filterTitles"
            v-show="filterOptions[key].length > 0"
            :key="key"
            size="small"
            :variant="filterForm[key].length > 0 ? 'tonal' : 'outlined'"
            :color="filterForm[key].length > 0 ? 'primary' : undefined"
            class="filter-btn-mobile"
            :class="{ 'filter-btn-mobile--active': filterForm[key].length > 0 }"
            @click="toggleFilterMenu(key)"
          >
            <VIcon :icon="getFilterIcon(key)" size="14" class="filter-icon"></VIcon>
            <span class="filter-label">
              {{ title }}
            </span>
            <span v-if="filterForm[key].length > 0" class="filter-btn-mobile__count">
              {{ filterForm[key].length }}
            </span>
          </VBtn>

          <!-- 全部筛选按钮 -->
          <VBtn
            size="small"
            :variant="getFilterCount > 0 ? 'tonal' : 'outlined'"
            :color="getFilterCount > 0 ? 'primary' : undefined"
            class="filter-btn-mobile"
            :class="{ 'filter-btn-mobile--active': getFilterCount > 0 }"
            @click="toggleAllFilterMenu"
          >
            <VIcon icon="mdi-filter-variant" size="14" class="filter-icon"></VIcon>
            <span class="filter-label">
              {{ t('torrent.allFilters') }}
            </span>
            <span v-if="getFilterCount > 0" class="filter-btn-mobile__count">
              {{ getFilterCount }}
            </span>
          </VBtn>
        </div>
      </div>

      <div v-if="getFilterCount > 0" class="selected-filters">
        <div class="d-flex align-center">
          <div class="selected-filters__list d-flex flex-wrap align-center flex-grow-1">
            <template v-for="(values, key) in getSelectedFilters" :key="key">
              <VChip
                v-for="(value, index) in values"
                :key="`${key}-${index}`"
                color="primary"
                size="small"
                closable
                variant="tonal"
                rounded="lg"
                class="filter-tag"
                @click:close="removeFilter(key as string, value)"
              >
                <VIcon size="13" :icon="getFilterIcon(key as string)" class="me-1"></VIcon>
                <strong>{{ filterTitles[key as string] }}:</strong> {{ value }}
              </VChip>
            </template>
          </div>

          <VSpacer />

          <VBtn
            variant="text"
            size="small"
            color="error"
            class="ms-2 flex-shrink-0"
            prepend-icon="mdi-close-circle-outline"
            @click="clearAllFilters"
          >
            {{ t('torrent.clearFilters') }}
          </VBtn>
        </div>
      </div>
    </div>
  </VCard>
</template>

<style scoped>
.search-header,
.search-header-mobile {
  width: 100%;
  max-width: 100%;
}

.view-header {
  overflow: hidden;
}

.filter-toolbar-card {
  overflow: hidden;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: rgb(var(--v-theme-surface));
}

.filter-toolbar-row {
  padding-block: 8px;
  padding-inline: 13px;
}

.search-count {
  border-radius: 6px !important;
  block-size: 26px !important;
  font-size: 12px !important;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  padding-inline: 8px !important;
}

.sort-btn {
  border-radius: 7px !important;
  block-size: 28px !important;
  font-weight: 500;
  padding-inline: 9px 6px !important;
}

.sort-btn__label {
  font-size: 12.5px;
  font-weight: 500;
}

.sort-btn .v-icon {
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.sort-btn :deep(.v-btn__prepend) {
  margin-inline-end: 2px !important;
}

.sort-menu-list :deep(.v-list-item__prepend > .v-icon) {
  margin-inline-end: 0px !important;
}

.filter-bar {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  flex: 1;
  width: 0;
  min-width: 0;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.filter-bar::-webkit-scrollbar {
  display: none;
}

.filter-bar > * {
  flex-shrink: 0;
}

.filter-divider {
  background-color: var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.12));
  block-size: 18px;
  inline-size: 1px;
  margin-block: 0;
  margin-inline: 8px;
}

.filter-btn {
  border-radius: 7px !important;
  block-size: 28px !important;
  font-size: 12.5px !important;
  min-inline-size: 0;
  padding-inline: 10px !important;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}

.filter-count-badge {
  border-radius: 5px !important;
  block-size: 18px !important;
  font-size: 11px !important;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  padding-inline: 5px !important;
}

.filter-menu-content {
  max-block-size: 50vh;
  overflow-y: auto;
  padding: 10px 12px !important;
}

.filter-options {
  display: flex;
  flex-wrap: wrap;
}

.filter-options :deep(.v-slide-group__content) {
  gap: 5px;
}

.filter-chip {
  border: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.1));
  border-radius: 6px !important;
  block-size: 26px !important;
  margin: 0 !important;
  background-color: rgba(var(--v-theme-on-surface), 0.04) !important;
  color: rgba(var(--v-theme-on-surface), 0.88) !important;
  font-size: 12px !important;
  font-weight: 500;
  padding-inline: 9px !important;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}

.filter-chip:hover {
  border-color: var(--mp-border-hover);
  background-color: rgba(var(--v-theme-on-surface), 0.08) !important;
}

.filter-chip.v-chip--selected {
  border-color: rgba(var(--v-theme-primary), 0.35);
  background-color: rgba(var(--v-theme-primary), 0.14) !important;
  color: rgb(var(--v-theme-primary)) !important;
  font-weight: 600;
}

.selected-filters__list {
  gap: 5px;
}

.filter-tag {
  border-radius: 6px !important;
  block-size: 24px !important;
  font-size: 12px !important;
  font-weight: 500;
  margin: 0 !important;
  padding-inline: 8px !important;
  transition: opacity 0.16s ease;
}

.filter-tag:hover {
  opacity: 0.85;
}

.selected-filters {
  overflow: hidden;
  border-block-start: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.08));
  background-color: rgba(var(--v-theme-on-surface), 0.02);
  padding-block: 6px;
  padding-inline: 13px;
}

.filter-toolbar-mobile-body {
  padding-block: 10px;
  padding-inline: 12px;
}

.filter-buttons-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.filter-btn-mobile {
  border-color: var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.12)) !important;
  border-radius: 7px !important;
  background-color: rgba(var(--v-theme-on-surface), 0.03);
  block-size: 30px !important;
  color: rgba(var(--v-theme-on-surface), 0.82);
  font-weight: 500;
  min-block-size: 30px !important;
  min-inline-size: 0 !important;
  padding-block: 0 !important;
  padding-inline: 9px !important;
}

.filter-btn-mobile--active {
  border-color: rgba(var(--v-theme-primary), 0.35) !important;
}

.filter-btn-mobile :deep(.v-btn__content) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  line-height: 1;
  white-space: nowrap;
}

.filter-icon {
  flex-shrink: 0;
  font-size: 14px;
  opacity: 0.78;
}

.filter-label {
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}

.filter-btn-mobile__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background-color: rgb(var(--v-theme-primary));
  block-size: 16px;
  color: rgb(var(--v-theme-on-primary));
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  line-height: 1;
  min-inline-size: 16px;
  padding-inline: 4px;
}
</style>
