<script setup lang="ts">
import DiscoverFilterToolbar from '@/components/discover/DiscoverFilterToolbar.vue'
import MediaCardListView from '@/views/discover/MediaCardListView.vue'
import { useI18n } from '@/composables/useChineseText'
import { useDiscoverPreferences } from '@/composables/useDiscoverPreferences'

const { t } = useI18n()
const { filtersExpanded, toggleFiltersExpanded } = useDiscoverPreferences()

type BangumiDiscoverMode = 'index' | 'calendar'
const mode = ref<BangumiDiscoverMode>('index')

const todayWeekday = new Date().getDay() || 7
const selectedWeekday = ref<number>(todayWeekday)

// 过滤参数
const filterParams = reactive({
  'type': 2,
  'cat': null as string | null | undefined,
  'sort': 'rank', // date/rank
  'year': null as string | null | undefined,
})

// Bangumi cat字典
const bangumiCatDict = {
  '0': t('bangumi.cat.other'),
  '1': t('bangumi.cat.tv'),
  '2': t('bangumi.cat.ova'),
  '3': t('bangumi.cat.movie'),
  '5': t('bangumi.cat.web'),
}

// Bangumi排序字典
const bangumiSortDict = {
  'rank': t('bangumi.sortType.rank'),
  'date': t('bangumi.sortType.date'),
}

// 每日放送星期选项（0=全部，1=周一 ~ 7=周日）
const weekdayOptions = [
  { value: 0, label: t('bangumi.weekdayType.all') },
  { value: 1, label: t('bangumi.weekdayType.mon') },
  { value: 2, label: t('bangumi.weekdayType.tue') },
  { value: 3, label: t('bangumi.weekdayType.wed') },
  { value: 4, label: t('bangumi.weekdayType.thu') },
  { value: 5, label: t('bangumi.weekdayType.fri') },
  { value: 6, label: t('bangumi.weekdayType.sat') },
  { value: 7, label: t('bangumi.weekdayType.sun') },
]

// 年份筛选项（最近10年按降序排列，避免对象整数键自动升序）
const currentYear = new Date().getFullYear()
const yearOptions: Array<{ label: string; value: string }> = Array.from({ length: 10 }, (_, i) => {
  const year = String(currentYear - i)
  return { label: year, value: year }
})

const activeApiPath = computed(() => (mode.value === 'calendar' ? 'discover/bangumi_calendar' : 'discover/bangumi'))

const activeParams = computed<Record<string, unknown>>(() => {
  if (mode.value === 'calendar') {
    return { weekday: selectedWeekday.value }
  }
  return filterParams
})

const activeFilterCount = computed(() => {
  if (mode.value === 'calendar') {
    return selectedWeekday.value !== todayWeekday ? 1 : 0
  }
  let count = 0
  if (filterParams.cat) count += 1
  if (filterParams.sort && filterParams.sort !== 'rank') count += 1
  if (filterParams.year) count += 1
  return count
})

function resetFilters() {
  if (mode.value === 'calendar') {
    selectedWeekday.value = todayWeekday
    return
  }
  filterParams.cat = null
  filterParams.sort = 'rank'
  filterParams.year = null
}

// 当前Key
const currentKey = ref(0)
let lastQuerySignature = JSON.stringify([activeApiPath.value, activeParams.value])

// 模式和过滤参数变化后重新刷新列表
watch([mode, selectedWeekday, filterParams], () => {
  const nextSignature = JSON.stringify([activeApiPath.value, activeParams.value])
  if (nextSignature !== lastQuerySignature) {
    lastQuerySignature = nextSignature
    currentKey.value++
  }
})
</script>

<template>
  <div class="discover-filter-panel">
    <div class="discover-mode-bar">
      <div class="discover-filter-label">
        <VLabel>{{ t('bangumi.mode') }}</VLabel>
      </div>
      <div class="discover-mode-switch" role="tablist" :aria-label="t('bangumi.mode')">
        <button
          type="button"
          class="discover-mode-btn"
          :class="{ 'discover-mode-btn--active': mode === 'index' }"
          :aria-pressed="mode === 'index'"
          @click="mode = 'index'"
        >
          {{ t('bangumi.modeIndex') }}
        </button>
        <button
          type="button"
          class="discover-mode-btn"
          :class="{ 'discover-mode-btn--active': mode === 'calendar' }"
          :aria-pressed="mode === 'calendar'"
          @click="mode = 'calendar'"
        >
          <VIcon icon="mdi-calendar-today" size="13" />
          <span>{{ t('bangumi.modeCalendar') }}</span>
        </button>
      </div>
      <DiscoverFilterToolbar
        :active-filter-count="activeFilterCount"
        :can-collapse="mode === 'index'"
        :expanded="filtersExpanded"
        @reset="resetFilters"
        @toggle-expand="toggleFiltersExpanded"
      />
    </div>

    <template v-if="mode === 'calendar'">
      <div class="discover-filter-row">
        <div class="discover-filter-label">
          <VLabel>{{ t('bangumi.weekday') }}</VLabel>
        </div>
        <VChipGroup v-model="selectedWeekday" mandatory class="discover-chip-group">
          <VChip
            v-for="item in weekdayOptions"
            :key="item.value"
            :variant="selectedWeekday === item.value ? 'tonal' : 'text'"
            :color="selectedWeekday === item.value ? 'primary' : undefined"
            rounded="lg"
            filter
            :value="item.value"
            class="discover-filter-chip"
          >
            <span>{{ item.label }}</span>
            <span v-if="item.value === todayWeekday" class="discover-today-badge">{{ t('bangumi.today') }}</span>
          </VChip>
        </VChipGroup>
      </div>
    </template>

    <template v-else>
      <div class="discover-filter-row">
        <div class="discover-filter-label">
          <VLabel>{{ t('bangumi.category') }}</VLabel>
        </div>
        <VChipGroup v-model="filterParams.cat" class="discover-chip-group">
          <VChip
            v-for="(value, key) in bangumiCatDict"
            :key="key"
            :variant="filterParams.cat == key ? 'tonal' : 'text'"
            :color="filterParams.cat == key ? 'primary' : undefined"
            rounded="lg"
            filter
            :value="key"
            class="discover-filter-chip"
          >
            {{ value }}
          </VChip>
        </VChipGroup>
      </div>
      <div class="discover-filter-row">
        <div class="discover-filter-label">
          <VLabel>{{ t('bangumi.sort') }}</VLabel>
        </div>
        <VChipGroup v-model="filterParams.sort" mandatory class="discover-chip-group">
          <VChip
            v-for="(value, key) in bangumiSortDict"
            :key="key"
            :variant="filterParams.sort == key ? 'tonal' : 'text'"
            :color="filterParams.sort == key ? 'primary' : undefined"
            rounded="lg"
            filter
            :value="key"
            class="discover-filter-chip"
          >
            {{ value }}
          </VChip>
        </VChipGroup>
      </div>
      <div v-show="filtersExpanded" class="discover-filter-row">
        <div class="discover-filter-label">
          <VLabel>{{ t('bangumi.year') }}</VLabel>
        </div>
        <VChipGroup v-model="filterParams.year" class="discover-chip-group">
          <VChip
            v-for="item in yearOptions"
            :key="item.value"
            :variant="filterParams.year == item.value ? 'tonal' : 'text'"
            :color="filterParams.year == item.value ? 'primary' : undefined"
            rounded="lg"
            filter
            :value="item.value"
            class="discover-filter-chip"
          >
            {{ item.label }}
          </VChip>
        </VChipGroup>
      </div>
    </template>
  </div>
  <div>
    <MediaCardListView :key="`${activeApiPath}:${currentKey}`" :apipath="activeApiPath" :params="activeParams" />
  </div>
</template>

<style scoped>
.discover-filter-panel {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding-block: 4px 6px;
  padding-inline: 0;
}

.discover-mode-bar,
.discover-filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-block-size: 28px;
}

.discover-mode-bar {
  flex-wrap: wrap;
  row-gap: 6px;
}

.discover-mode-switch {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.discover-mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid transparent;
  border-radius: 6px;
  background-color: transparent;
  block-size: 26px;
  color: rgba(var(--v-theme-on-surface), 0.72);
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1;
  padding-inline: 10px;
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    color 0.16s ease;
  white-space: nowrap;
}

.discover-mode-btn:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.05);
  color: rgba(var(--v-theme-on-surface), 0.92);
}

.discover-mode-btn--active {
  border-color: rgba(var(--v-theme-primary), 0.24);
  background-color: rgba(var(--v-theme-primary), 0.14);
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}

.discover-mode-btn--active:hover {
  background-color: rgba(var(--v-theme-primary), 0.18);
  color: rgb(var(--v-theme-primary));
}

.discover-filter-label {
  display: inline-flex;
  flex: 0 0 44px;
  align-items: center;
  block-size: 26px;
  min-inline-size: 44px;
}

.discover-filter-label :deep(.v-label) {
  color: var(--mp-text-secondary, rgba(var(--v-theme-on-surface), 0.62));
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.01em;
  line-height: 1.2;
  opacity: 1;
}

.discover-chip-group {
  flex: 1 1 auto;
  min-inline-size: 0;
  padding-block: 0 !important;
}

.discover-chip-group :deep(.v-slide-group__content) {
  gap: 5px;
  padding-block: 1px !important;
}

.discover-filter-chip {
  border-radius: 6px !important;
  block-size: 26px !important;
  font-size: 12.5px !important;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  margin: 0 !important;
  padding-inline: 9px !important;
}

.discover-filter-chip.v-chip--selected {
  font-weight: 600;
}

.discover-today-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 4px;
  background-color: rgba(var(--v-theme-primary), 0.18);
  color: rgb(var(--v-theme-primary));
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1;
  margin-inline-start: 4px;
  padding-block: 2px;
  padding-inline: 4px;
}
</style>
