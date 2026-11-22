<script setup lang="ts">
import { debounce } from 'lodash-es'
import DiscoverFilterToolbar from '@/components/discover/DiscoverFilterToolbar.vue'
import MediaCardListView from '@/views/discover/MediaCardListView.vue'
import { useI18n } from '@/composables/useChineseText'
import { useDiscoverPreferences } from '@/composables/useDiscoverPreferences'

const { t } = useI18n()
const { excludeShortDrama, filtersExpanded, toggleFiltersExpanded } = useDiscoverPreferences()

// 电影或者电视剧 movies/tvs
const type = ref('movies')

// 过滤参数
const filterParams = reactive({
  sort_by: 'popularity.desc',
  with_genres: '',
  with_original_language: '',
  with_keywords: '',
  with_watch_providers: '',
  vote_average: 0,
  vote_count: 10 as number | string,
  release_date: '',
})

const voteCountInput = ref<number | string>(filterParams.vote_count)
const selectedYear = ref<string | undefined>('')
const withNetworks = ref<string | undefined>('')
const includeUpcoming = ref(false)

// TMDB 电影排序字典
const tmdbSortDict: Record<string, string> = {
  'popularity.desc': t('tmdb.sortType.popularityDesc'),
  'popularity.asc': t('tmdb.sortType.popularityAsc'),
  'release_date.desc': t('tmdb.sortType.releaseDateDesc'),
  'release_date.asc': t('tmdb.sortType.releaseDateAsc'),
  'vote_average.desc': t('tmdb.sortType.voteAverageDesc'),
  'vote_average.asc': t('tmdb.sortType.voteAverageAsc'),
}

// TMDB 电视剧排序字典
const tmdbTvSortDict: Record<string, string> = {
  'popularity.desc': t('tmdb.sortType.popularityDesc'),
  'popularity.asc': t('tmdb.sortType.popularityAsc'),
  'first_air_date.desc': t('tmdb.sortType.firstAirDateDesc'),
  'first_air_date.asc': t('tmdb.sortType.firstAirDateAsc'),
  'vote_average.desc': t('tmdb.sortType.voteAverageDesc'),
  'vote_average.asc': t('tmdb.sortType.voteAverageAsc'),
}

// TMDB电影风格字典
const tmdbMovieGenreDict: Record<string, string> = {
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
}

// TMDB电视剧风格字典
const tmdbTvGenreDict: Record<string, string> = {
  '10759': t('tmdb.genreType.actionAdventure'),
  '16': t('tmdb.genreType.animation'),
  '35': t('tmdb.genreType.comedy'),
  '80': t('tmdb.genreType.crime'),
  '99': t('tmdb.genreType.documentary'),
  '18': t('tmdb.genreType.drama'),
  '10751': t('tmdb.genreType.family'),
  '10762': t('tmdb.genreType.kids'),
  '9648': t('tmdb.genreType.mystery'),
  '10763': t('tmdb.genreType.news'),
  '10764': t('tmdb.genreType.reality'),
  '10765': t('tmdb.genreType.sciFiFantasy'),
  '10766': t('tmdb.genreType.soap'),
  '10767': t('tmdb.genreType.talk'),
  '10768': t('tmdb.genreType.warPolitics'),
  '37': t('tmdb.genreType.western'),
}

// TMDB 电视剧精选流媒体与播出平台（数组保序，避免数字键自动升序）
const tmdbTvNetworkItems: Array<{ label: string; value: string }> = [
  { value: '213', label: 'Netflix' },
  { value: '2739', label: 'Disney+' },
  { value: '2552', label: 'Apple TV+' },
  { value: '49|3186', label: 'HBO / Max' },
  { value: '1024', label: 'Prime Video' },
  { value: '453', label: 'Hulu' },
  { value: '2007', label: t('tmdb.networkType.tencent') },
  { value: '1330', label: t('tmdb.networkType.iqiyi') },
  { value: '1419', label: t('tmdb.networkType.youku') },
  { value: '1631', label: t('tmdb.networkType.mangotv') },
  { value: '1605', label: t('tmdb.networkType.bilibili') },
  { value: '1366', label: 'CCTV' },
]

// 近 10 年单年 + 年代范围
const currentYear = new Date().getFullYear()
const yearOptions: Array<{ label: string; value: string; start: string; end: string }> = [
  ...Array.from({ length: 10 }, (_, index) => {
    const year = String(currentYear - index)
    return {
      value: year,
      label: year,
      start: `${year}-01-01`,
      end: `${year}-12-31`,
    }
  }),
  { value: '2020s', label: t('tmdb.yearType.2020s'), start: '2020-01-01', end: '2029-12-31' },
  { value: '2010s', label: t('tmdb.yearType.2010s'), start: '2010-01-01', end: '2019-12-31' },
  { value: '2000s', label: t('tmdb.yearType.2000s'), start: '2000-01-01', end: '2009-12-31' },
  { value: '1990s', label: t('tmdb.yearType.1990s'), start: '1990-01-01', end: '1999-12-31' },
]

// TMDB原始语言字典（主要语言）
const tmdbLanguageDict = {
  'zh': t('tmdb.languageType.zh'),
  'en': t('tmdb.languageType.en'),
  'ja': t('tmdb.languageType.ja'),
  'ko': t('tmdb.languageType.ko'),
  'fr': t('tmdb.languageType.fr'),
  'de': t('tmdb.languageType.de'),
  'es': t('tmdb.languageType.es'),
  'it': t('tmdb.languageType.it'),
  'ru': t('tmdb.languageType.ru'),
  'pt': t('tmdb.languageType.pt'),
  'ar': t('tmdb.languageType.ar'),
  'hi': t('tmdb.languageType.hi'),
  'th': t('tmdb.languageType.th'),
}

function formatLocalDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const isDateDescSort = computed(
  () => filterParams.sort_by === 'release_date.desc' || filterParams.sort_by === 'first_air_date.desc',
)

const resolvedDateBounds = computed(() => {
  const matchedYear = selectedYear.value ? yearOptions.find(item => item.value === selectedYear.value) : undefined
  const today = formatLocalDate(new Date())

  if (matchedYear) {
    let end = matchedYear.end
    if (isDateDescSort.value && !includeUpcoming.value && matchedYear.start <= today && end > today) {
      end = today
    }
    return {
      release_date: matchedYear.start,
      release_date_lte: end,
    }
  }

  if (isDateDescSort.value && !includeUpcoming.value) {
    return {
      release_date: '',
      release_date_lte: today,
    }
  }

  return {
    release_date: '',
    release_date_lte: '',
  }
})

const requestParams = computed<Record<string, unknown>>(() => {
  const { release_date, release_date_lte } = resolvedDateBounds.value
  const params: Record<string, unknown> = {
    sort_by: filterParams.sort_by,
    with_genres: filterParams.with_genres,
    with_original_language: filterParams.with_original_language,
    with_keywords: filterParams.with_keywords,
    with_watch_providers: filterParams.with_watch_providers,
    vote_average: filterParams.vote_average,
    vote_count: filterParams.vote_count,
    release_date,
  }
  if (release_date_lte) {
    params.release_date_lte = release_date_lte
  }
  if (type.value === 'tvs') {
    if (withNetworks.value) {
      params.with_networks = withNetworks.value
    }
    params.exclude_short_drama = excludeShortDrama.value
  }
  return params
})

const activeFilterCount = computed(() => {
  let count = 0
  if (filterParams.sort_by && filterParams.sort_by !== 'popularity.desc') count += 1
  if (filterParams.with_genres) count += 1
  if (type.value === 'tvs' && withNetworks.value) count += 1
  if (selectedYear.value) count += 1
  if (filterParams.with_original_language) count += 1
  if (Number(filterParams.vote_average) > 0) count += 1
  if (String(filterParams.vote_count) !== '10') count += 1
  if (isDateDescSort.value && includeUpcoming.value) count += 1
  return count
})

// 当前Key
const currentKey = ref(0)
let lastCommittedType = type.value

function buildQuerySignature() {
  return JSON.stringify([type.value, requestParams.value])
}

let lastQuerySignature = buildQuerySignature()

const debouncedVoteCountUpdate = debounce((nextValue: number | string) => {
  filterParams.vote_count = nextValue
}, 400)

const debouncedSliderKeyupUpdate = debounce((nextValue: number) => {
  filterParams.vote_average = nextValue
}, 150)

function handleVoteCountUpdate(nextValue: number | string) {
  voteCountInput.value = nextValue
  debouncedVoteCountUpdate(nextValue)
}

function handleVoteAverageEnd(nextValue: number | [number, number]) {
  debouncedSliderKeyupUpdate.cancel()
  const resolved = Array.isArray(nextValue) ? nextValue[0] : nextValue
  filterParams.vote_average = Number(resolved) || 0
}

function handleSliderKeyup(event: KeyboardEvent) {
  const rawNow = (event.target as HTMLElement | null)?.getAttribute('aria-valuenow')
  if (rawNow == null) return
  const parsed = Number(rawNow)
  if (!Number.isFinite(parsed)) return
  debouncedSliderKeyupUpdate(parsed)
}

function resetFilters() {
  debouncedSliderKeyupUpdate.cancel()
  debouncedVoteCountUpdate.cancel()
  filterParams.sort_by = 'popularity.desc'
  filterParams.with_genres = ''
  filterParams.with_original_language = ''
  filterParams.vote_average = 0
  filterParams.vote_count = 10
  voteCountInput.value = 10
  selectedYear.value = ''
  withNetworks.value = ''
  includeUpcoming.value = false
}

// 合并类型与过滤参数联动归一化，避免同 tick 双次递增 currentKey 频闪
watch([type, filterParams, selectedYear, withNetworks, includeUpcoming, excludeShortDrama], () => {
  if (type.value !== lastCommittedType) {
    debouncedSliderKeyupUpdate.flush()
    debouncedVoteCountUpdate.flush()
  }
  if (!type.value) {
    type.value = 'movies'
  }
  if (!filterParams.sort_by) {
    filterParams.sort_by = 'popularity.desc'
  }
  if (type.value === 'movies') {
    if (!tmdbSortDict[filterParams.sort_by]) {
      filterParams.sort_by = 'popularity.desc'
    }
    if (filterParams.with_genres && !tmdbMovieGenreDict[filterParams.with_genres]) {
      filterParams.with_genres = ''
    }
    if (withNetworks.value) {
      withNetworks.value = ''
    }
  } else if (type.value === 'tvs') {
    if (!tmdbTvSortDict[filterParams.sort_by]) {
      filterParams.sort_by = 'popularity.desc'
    }
    if (filterParams.with_genres && !tmdbTvGenreDict[filterParams.with_genres]) {
      filterParams.with_genres = ''
    }
  }
  lastCommittedType = type.value
  const nextSignature = buildQuerySignature()
  if (nextSignature !== lastQuerySignature) {
    lastQuerySignature = nextSignature
    currentKey.value++
  }
})

onUnmounted(() => {
  debouncedSliderKeyupUpdate.cancel()
  debouncedVoteCountUpdate.cancel()
})
</script>

<template>
  <div class="discover-filter-panel">
    <div class="discover-filter-row discover-filter-row--header">
      <div class="discover-filter-label">
        <VLabel>{{ t('tmdb.type') }}</VLabel>
      </div>
      <VChipGroup v-model="type" mandatory class="discover-chip-group">
        <VChip
          :variant="type == 'movies' ? 'tonal' : 'text'"
          :color="type == 'movies' ? 'primary' : undefined"
          rounded="lg"
          filter
          value="movies"
          class="discover-filter-chip"
        >
          {{ t('mediaType.movie') }}
        </VChip>
        <VChip
          :variant="type == 'tvs' ? 'tonal' : 'text'"
          :color="type == 'tvs' ? 'primary' : undefined"
          rounded="lg"
          filter
          value="tvs"
          class="discover-filter-chip"
        >
          {{ t('mediaType.tv') }}
        </VChip>
      </VChipGroup>
      <DiscoverFilterToolbar
        v-model:exclude-short-drama="excludeShortDrama"
        :show-short-drama-toggle="type === 'tvs'"
        :active-filter-count="activeFilterCount"
        :expanded="filtersExpanded"
        @reset="resetFilters"
        @toggle-expand="toggleFiltersExpanded"
      />
    </div>
    <div class="discover-filter-row">
      <div class="discover-filter-label">
        <VLabel>{{ t('tmdb.sort') }}</VLabel>
      </div>
      <VChipGroup v-model="filterParams.sort_by" mandatory class="discover-chip-group">
        <VChip
          v-for="(value, key) in type == 'movies' ? tmdbSortDict : tmdbTvSortDict"
          :key="key"
          :variant="filterParams.sort_by == key ? 'tonal' : 'text'"
          :color="filterParams.sort_by == key ? 'primary' : undefined"
          rounded="lg"
          filter
          :value="key"
          class="discover-filter-chip"
        >
          {{ value }}
        </VChip>
      </VChipGroup>
      <button
        v-if="isDateDescSort"
        type="button"
        class="discover-upcoming-chip"
        :class="{ 'discover-upcoming-chip--active': includeUpcoming }"
        :aria-pressed="includeUpcoming"
        data-testid="tmdb-include-upcoming"
        @click="includeUpcoming = !includeUpcoming"
      >
        <VIcon :icon="includeUpcoming ? 'mdi-calendar-check-outline' : 'mdi-calendar-clock-outline'" size="13" />
        <span>{{ t('tmdb.includeUpcoming') }}</span>
      </button>
    </div>
    <div v-show="filtersExpanded" class="discover-filter-row">
      <div class="discover-filter-label">
        <VLabel>{{ t('tmdb.genre') }}</VLabel>
      </div>
      <VChipGroup v-model="filterParams.with_genres" class="discover-chip-group">
        <VChip
          v-for="(value, key) in type == 'movies' ? tmdbMovieGenreDict : tmdbTvGenreDict"
          :key="key"
          :variant="filterParams.with_genres == key ? 'tonal' : 'text'"
          :color="filterParams.with_genres == key ? 'primary' : undefined"
          rounded="lg"
          filter
          :value="key"
          class="discover-filter-chip"
        >
          {{ value }}
        </VChip>
      </VChipGroup>
    </div>
    <div v-if="type === 'tvs'" v-show="filtersExpanded" class="discover-filter-row">
      <div class="discover-filter-label">
        <VLabel>{{ t('tmdb.network') }}</VLabel>
      </div>
      <VChipGroup v-model="withNetworks" class="discover-chip-group">
        <VChip
          v-for="item in tmdbTvNetworkItems"
          :key="item.value"
          :variant="withNetworks == item.value ? 'tonal' : 'text'"
          :color="withNetworks == item.value ? 'primary' : undefined"
          rounded="lg"
          filter
          :value="item.value"
          class="discover-filter-chip"
        >
          {{ item.label }}
        </VChip>
      </VChipGroup>
    </div>
    <div v-show="filtersExpanded" class="discover-filter-row">
      <div class="discover-filter-label">
        <VLabel>{{ t('tmdb.year') }}</VLabel>
      </div>
      <VChipGroup v-model="selectedYear" class="discover-chip-group">
        <VChip
          v-for="item in yearOptions"
          :key="item.value"
          :variant="selectedYear == item.value ? 'tonal' : 'text'"
          :color="selectedYear == item.value ? 'primary' : undefined"
          rounded="lg"
          filter
          :value="item.value"
          class="discover-filter-chip"
        >
          {{ item.label }}
        </VChip>
      </VChipGroup>
    </div>
    <div v-show="filtersExpanded" class="discover-filter-row">
      <div class="discover-filter-label">
        <VLabel>{{ t('tmdb.language') }}</VLabel>
      </div>
      <VChipGroup v-model="filterParams.with_original_language" class="discover-chip-group">
        <VChip
          v-for="(value, key) in tmdbLanguageDict"
          :key="key"
          :variant="filterParams.with_original_language == key ? 'tonal' : 'text'"
          :color="filterParams.with_original_language == key ? 'primary' : undefined"
          rounded="lg"
          filter
          :value="key"
          class="discover-filter-chip"
        >
          {{ value }}
        </VChip>
      </VChipGroup>
    </div>
    <div v-show="filtersExpanded" class="discover-filter-row discover-filter-row--slider">
      <div class="discover-filter-label">
        <VLabel>{{ t('tmdb.rating') }}</VLabel>
      </div>
      <VSlider
        :model-value="filterParams.vote_average"
        thumb-label
        max="10"
        min="0"
        :step="1"
        color="primary"
        class="discover-rating-slider align-center"
        hide-details
        @end="handleVoteAverageEnd"
        @keyup="handleSliderKeyup"
      />
      <div class="discover-vote-count" title="最低评价人数">
        <span class="discover-vote-count__label" aria-hidden="true">
          <VIcon icon="mdi-account-check-outline" size="13" />
          <span>人数≥</span>
        </span>
        <VTextField
          :model-value="voteCountInput"
          aria-label="最低评价人数"
          variant="outlined"
          width="4.5rem"
          density="compact"
          type="number"
          min="0"
          class="discover-vote-input"
          hide-details
          single-line
          @update:model-value="handleVoteCountUpdate"
        />
        <VTooltip activator="parent" location="top">最低评价人数</VTooltip>
      </div>
    </div>
  </div>

  <div>
    <MediaCardListView :key="currentKey" :apipath="`discover/tmdb_${type}`" :params="requestParams" />
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

.discover-filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-block-size: 28px;
}

.discover-filter-row--header {
  flex-wrap: wrap;
  row-gap: 6px;
}

.discover-filter-row--slider {
  padding-block-start: 2px;
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

.discover-filter-chip:deep(.v-chip--selected),
.discover-filter-chip.v-chip--selected {
  font-weight: 600;
}

.discover-upcoming-chip {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.14));
  border-radius: 6px;
  background-color: transparent;
  block-size: 26px;
  color: rgba(var(--v-theme-on-surface), 0.68);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  padding-inline: 8px;
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    color 0.16s ease;
  white-space: nowrap;
}

.discover-upcoming-chip:hover {
  border-color: rgba(var(--v-theme-on-surface), 0.24);
  background-color: rgba(var(--v-theme-on-surface), 0.05);
}

.discover-upcoming-chip--active {
  border-color: rgba(var(--v-theme-primary), 0.28);
  background-color: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}

.discover-rating-slider {
  flex: 1 1 auto;
  margin-inline: 0 !important;
  max-inline-size: 320px;
}

.discover-vote-count {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 5px;
}

.discover-vote-count__label {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--mp-text-secondary, rgba(var(--v-theme-on-surface), 0.58));
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
}

.discover-vote-input :deep(.v-field) {
  border-radius: 6px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  min-block-size: 28px;
}

.discover-vote-input :deep(.v-field__input) {
  min-block-size: 28px;
  padding-block: 2px;
  padding-inline: 8px;
}

@media (width <= 600px) {
  .discover-filter-row--slider {
    flex-wrap: wrap;
    row-gap: 6px;
  }

  .discover-rating-slider {
    flex: 1 1 calc(100% - 54px);
    max-inline-size: none;
  }

  .discover-vote-count {
    gap: 10px;
    inline-size: 100%;
    padding-inline-start: 0;
  }

  .discover-vote-count__label {
    flex: 0 0 44px;
    color: var(--mp-text-secondary, rgba(var(--v-theme-on-surface), 0.62));
    font-size: 12px;
    min-inline-size: 44px;
  }

  .discover-vote-count__label :deep(.v-icon) {
    display: none;
  }
}
</style>
