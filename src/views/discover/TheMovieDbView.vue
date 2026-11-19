<script setup lang="ts">
import { debounce } from 'lodash-es'
import MediaCardListView from '@/views/discover/MediaCardListView.vue'
import { useI18n } from '@/composables/useChineseText'

const { t } = useI18n()

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

// 当前Key
const currentKey = ref(0)
let lastCommittedType = type.value

function buildQuerySignature() {
  return JSON.stringify([type.value, filterParams])
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

// 合并类型与过滤参数联动归一化，避免同 tick 双次递增 currentKey 频闪
watch([type, filterParams], () => {
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
    <div class="discover-filter-row">
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
    </div>
    <div class="discover-filter-row">
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
    <div class="discover-filter-row">
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
    <div class="discover-filter-row discover-filter-row--slider">
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
    <MediaCardListView :key="currentKey" :apipath="`discover/tmdb_${type}`" :params="filterParams" />
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
