<script setup lang="ts">
import MediaCardListView from '@/views/discover/MediaCardListView.vue'
import { useI18n } from '@/composables/useChineseText'

const { t } = useI18n()

// 过滤参数
const filterParams = reactive({
  'type': 2,
  'cat': null,
  'sort': 'rank', // date/rank
  'year': null,
})

// Bangumi cat字典
/**
 * 0 为 其他
1 为 TV
2 为 OVA
3 为 Movie
5 为 WEB
 */
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

// 年份筛选项（最近10年按降序排列，避免对象整数键自动升序）
const currentYear = new Date().getFullYear()
const yearOptions: Array<{ label: string; value: string }> = Array.from({ length: 10 }, (_, i) => {
  const year = String(currentYear - i)
  return { label: year, value: year }
})

// 当前Key
const currentKey = ref(0)

// 类型和过滤参数变化后重新刷新列表
watch([filterParams], () => {
  currentKey.value++
})
</script>

<template>
  <div class="discover-filter-panel">
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
    <div class="discover-filter-row">
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
  </div>
  <div>
    <MediaCardListView :key="currentKey" apipath="discover/bangumi" :params="filterParams" />
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
