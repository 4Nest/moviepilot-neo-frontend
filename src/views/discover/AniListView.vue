<script setup lang="ts">
import DiscoverFilterToolbar from '@/components/discover/DiscoverFilterToolbar.vue'
import MediaCardListView from '@/views/discover/MediaCardListView.vue'
import { useI18n } from '@/composables/useChineseText'
import { useDiscoverPreferences } from '@/composables/useDiscoverPreferences'

const { t } = useI18n()
const { filtersExpanded, toggleFiltersExpanded } = useDiscoverPreferences()

const currentKey = ref(0)
const currentYear = new Date().getFullYear()

const filterParams = reactive({
  sort: 'POPULARITY_DESC' as string | null,
  genre: null as string | null,
  format: null as string | null,
  season: null as string | null,
  season_year: null as number | null,
  status: null as string | null,
  country: null as string | null,
})

const sortItems = [
  { title: t('anilist.sortType.popularity'), value: 'POPULARITY_DESC' },
  { title: t('anilist.sortType.trending'), value: 'TRENDING_DESC' },
  { title: t('anilist.sortType.score'), value: 'SCORE_DESC' },
  { title: t('anilist.sortType.newest'), value: 'START_DATE_DESC' },
]

const genreItems = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Fantasy',
  'Horror',
  'Mahou Shoujo',
  'Mecha',
  'Music',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller',
].map(value => ({ title: t(`anilist.genreType.${value.replaceAll(' ', '').replace('-', '').toLowerCase()}`), value }))

const formatItems = ['TV', 'TV_SHORT', 'MOVIE', 'OVA', 'ONA', 'SPECIAL', 'MUSIC'].map(value => ({
  title: t(`anilist.formatType.${value.toLowerCase()}`),
  value,
}))

const seasonItems = ['WINTER', 'SPRING', 'SUMMER', 'FALL'].map(value => ({
  title: t(`anilist.seasonType.${value.toLowerCase()}`),
  value,
}))

const statusItems = ['RELEASING', 'FINISHED', 'NOT_YET_RELEASED'].map(value => ({
  title: t(`anilist.statusType.${value.toLowerCase()}`),
  value,
}))

const countryItems = ['JP', 'CN', 'KR', 'TW'].map(value => ({
  title: t(`anilist.countryType.${value.toLowerCase()}`),
  value,
}))

const yearItems = Array.from({ length: 15 }, (_, index) => currentYear - index)

type AniListFilterKey = Exclude<keyof typeof filterParams, 'season_year'>

const filterGroups = [
  { key: 'sort', label: t('anilist.sort'), items: sortItems },
  { key: 'format', label: t('anilist.format'), items: formatItems },
  { key: 'genre', label: t('anilist.genre'), items: genreItems },
  { key: 'season', label: t('anilist.season'), items: seasonItems },
  { key: 'season_year', label: t('anilist.year'), items: yearItems.map(value => ({ title: value, value })) },
  { key: 'status', label: t('anilist.status'), items: statusItems },
  { key: 'country', label: t('anilist.country'), items: countryItems },
] as const

const activeFilterCount = computed(() => {
  let count = 0
  if (filterParams.sort && filterParams.sort !== 'POPULARITY_DESC') count += 1
  if (filterParams.format) count += 1
  if (filterParams.genre) count += 1
  if (filterParams.season) count += 1
  if (filterParams.season_year !== null) count += 1
  if (filterParams.status) count += 1
  if (filterParams.country) count += 1
  return count
})

/** 将筛选 Chip 的选择值写入对应 AniList 查询参数。 */
function updateFilter(key: (typeof filterGroups)[number]['key'], value: unknown) {
  if (key === 'season_year') {
    filterParams.season_year = typeof value === 'number' ? value : null
    return
  }
  filterParams[key as AniListFilterKey] = typeof value === 'string' ? value : null
}

function resetFilters() {
  filterParams.sort = 'POPULARITY_DESC'
  filterParams.genre = null
  filterParams.format = null
  filterParams.season = null
  filterParams.season_year = null
  filterParams.status = null
  filterParams.country = null
}

let lastQuerySignature = JSON.stringify(filterParams)

watch(filterParams, () => {
  if (!filterParams.sort) {
    filterParams.sort = 'POPULARITY_DESC'
  }
  const nextSignature = JSON.stringify(filterParams)
  if (nextSignature !== lastQuerySignature) {
    lastQuerySignature = nextSignature
    currentKey.value++
  }
})
</script>

<template>
  <div class="discover-filter-panel">
    <div
      v-for="(group, index) in filterGroups"
      :key="group.key"
      v-show="index < 2 || filtersExpanded"
      class="discover-filter-row"
      :class="{ 'discover-filter-row--header': index === 0 }"
    >
      <div class="discover-filter-label">
        <VLabel>{{ group.label }}</VLabel>
      </div>
      <VChipGroup
        :model-value="filterParams[group.key]"
        :mandatory="group.key === 'sort'"
        class="discover-chip-group"
        @update:model-value="updateFilter(group.key, $event)"
      >
        <VChip
          v-for="item in group.items"
          :key="item.value"
          :variant="filterParams[group.key as keyof typeof filterParams] == item.value ? 'tonal' : 'text'"
          :color="filterParams[group.key as keyof typeof filterParams] == item.value ? 'primary' : undefined"
          rounded="lg"
          filter
          :value="item.value"
          class="discover-filter-chip"
        >
          {{ item.title }}
        </VChip>
      </VChipGroup>
      <DiscoverFilterToolbar
        v-if="index === 0"
        :active-filter-count="activeFilterCount"
        :expanded="filtersExpanded"
        @reset="resetFilters"
        @toggle-expand="toggleFiltersExpanded"
      />
    </div>
  </div>

  <MediaCardListView :key="currentKey" apipath="anilist/discover" :params="filterParams" />
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
</style>
