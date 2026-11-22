<script setup lang="ts">
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
  'sort': 'U',
  'tags': '',
})

// 豆瓣风格类型
const doubanCategory = ref('')

// 地区
const doubanZone = ref('')

// 年代
const doubanYear = ref('')

// 豆瓣风格字典
const categoryDict = {
  '喜剧': t('douban.genreType.comedy'),
  '爱情': t('douban.genreType.romance'),
  '动作': t('douban.genreType.action'),
  '科幻': t('douban.genreType.scienceFiction'),
  '动画': t('douban.genreType.animation'),
  '悬疑': t('douban.genreType.mystery'),
  '犯罪': t('douban.genreType.crime'),
  '惊悚': t('douban.genreType.thriller'),
  '冒险': t('douban.genreType.adventure'),
  '音乐': t('douban.genreType.music'),
  '历史': t('douban.genreType.history'),
  '奇幻': t('douban.genreType.fantasy'),
  '恐怖': t('douban.genreType.horror'),
  '战争': t('douban.genreType.war'),
  '传记': t('douban.genreType.biography'),
  '歌舞': t('douban.genreType.musical'),
  '武侠': t('douban.genreType.martialArts'),
  '情色': t('douban.genreType.erotic'),
  '灾难': t('douban.genreType.disaster'),
  '西部': t('douban.genreType.western'),
  '纪录片': t('douban.genreType.documentary'),
  '短片': t('douban.genreType.shortFilm'),
}

// 地区字典
const zoneDict = {
  '华语': t('douban.zoneType.chinese'),
  '欧美': t('douban.zoneType.europeanAmerican'),
  '韩国': t('douban.zoneType.korean'),
  '日本': t('douban.zoneType.japanese'),
  '中国大陆': t('douban.zoneType.mainlandChina'),
  '美国': t('douban.zoneType.usa'),
  '中国香港': t('douban.zoneType.hongKong'),
  '中国台湾': t('douban.zoneType.taiwan'),
  '英国': t('douban.zoneType.uk'),
  '法国': t('douban.zoneType.france'),
  '德国': t('douban.zoneType.germany'),
  '意大利': t('douban.zoneType.italy'),
  '西班牙': t('douban.zoneType.spain'),
  '印度': t('douban.zoneType.india'),
  '泰国': t('douban.zoneType.thailand'),
  '俄罗斯': t('douban.zoneType.russia'),
  '加拿大': t('douban.zoneType.canada'),
  '澳大利亚': t('douban.zoneType.australia'),
  '爱尔兰': t('douban.zoneType.ireland'),
  '瑞典': t('douban.zoneType.sweden'),
  '巴西': t('douban.zoneType.brazil'),
  '丹麦': t('douban.zoneType.denmark'),
}

// 年份与年代筛选项（最近6年按降序排在年代前，避免对象整数键自动升序）
const currentYear = new Date().getFullYear()
const yearOptions: Array<{ label: string; value: string }> = [
  ...Array.from({ length: 6 }, (_, i) => {
    const year = `${currentYear - i}`
    return { label: year, value: year }
  }),
  { value: '2020年代', label: t('douban.yearType.2020s') },
  { value: '2010年代', label: t('douban.yearType.2010s') },
  { value: '2000年代', label: t('douban.yearType.2000s') },
  { value: '90年代', label: t('douban.yearType.1990s') },
  { value: '80年代', label: t('douban.yearType.1980s') },
  { value: '70年代', label: t('douban.yearType.1970s') },
  { value: '60年代', label: t('douban.yearType.1960s') },
]

// 豆瓣过滤参数
const doubanSortDict = {
  'U': t('douban.sortType.comprehensive'),
  'R': t('douban.sortType.releaseDate'),
  'T': t('douban.sortType.recentHot'),
  'S': t('douban.sortType.highScore'),
}

// 风格、年代、地区变化时，以,分隔拼接到tags参数
watch([doubanCategory, doubanZone, doubanYear], () => {
  filterParams.tags = [doubanCategory.value, doubanZone.value, doubanYear.value].filter(Boolean).join(',')
})

const requestParams = computed<Record<string, unknown>>(() => ({
  ...filterParams,
  exclude_short_drama: excludeShortDrama.value,
}))

const activeFilterCount = computed(() => {
  let count = 0
  if (filterParams.sort && filterParams.sort !== 'U') count += 1
  if (doubanCategory.value) count += 1
  if (doubanZone.value) count += 1
  if (doubanYear.value) count += 1
  return count
})

function resetFilters() {
  filterParams.sort = 'U'
  doubanCategory.value = ''
  doubanZone.value = ''
  doubanYear.value = ''
}

// 当前Key
const currentKey = ref(0)
let lastQuerySignature = JSON.stringify([type.value, requestParams.value])

// 类型和过滤参数变化后重新刷新列表
watch([type, filterParams, excludeShortDrama], () => {
  if (!type.value) {
    type.value = 'movies'
  }
  if (!filterParams.sort) {
    filterParams.sort = 'U'
  }
  const nextSignature = JSON.stringify([type.value, requestParams.value])
  if (nextSignature !== lastQuerySignature) {
    lastQuerySignature = nextSignature
    currentKey.value++
  }
})
</script>

<template>
  <div class="discover-filter-panel">
    <div class="discover-filter-row discover-filter-row--header">
      <div class="discover-filter-label">
        <VLabel>{{ t('douban.type') }}</VLabel>
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
        :show-short-drama-toggle="true"
        :active-filter-count="activeFilterCount"
        :expanded="filtersExpanded"
        @reset="resetFilters"
        @toggle-expand="toggleFiltersExpanded"
      />
    </div>
    <div class="discover-filter-row">
      <div class="discover-filter-label">
        <VLabel>{{ t('douban.sort') }}</VLabel>
      </div>
      <VChipGroup v-model="filterParams.sort" mandatory class="discover-chip-group">
        <VChip
          v-for="(value, key) in doubanSortDict"
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
        <VLabel>{{ t('douban.genre') }}</VLabel>
      </div>
      <VChipGroup v-model="doubanCategory" class="discover-chip-group">
        <VChip
          v-for="(value, key) in categoryDict"
          :key="key"
          :variant="doubanCategory == key ? 'tonal' : 'text'"
          :color="doubanCategory == key ? 'primary' : undefined"
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
        <VLabel>{{ t('douban.zone') }}</VLabel>
      </div>
      <VChipGroup v-model="doubanZone" class="discover-chip-group">
        <VChip
          v-for="(value, key) in zoneDict"
          :key="key"
          :variant="doubanZone == key ? 'tonal' : 'text'"
          :color="doubanZone == key ? 'primary' : undefined"
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
        <VLabel>{{ t('douban.year') }}</VLabel>
      </div>
      <VChipGroup v-model="doubanYear" class="discover-chip-group">
        <VChip
          v-for="item in yearOptions"
          :key="item.value"
          :variant="doubanYear == item.value ? 'tonal' : 'text'"
          :color="doubanYear == item.value ? 'primary' : undefined"
          rounded="lg"
          filter
          :value="item.value"
          class="discover-filter-chip"
        >
          {{ item.label }}
        </VChip>
      </VChipGroup>
    </div>
  </div>
  <div>
    <MediaCardListView :key="currentKey" :apipath="`discover/douban_${type}`" :params="requestParams" />
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
