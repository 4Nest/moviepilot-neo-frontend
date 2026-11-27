<script setup lang="ts">
import { DiscoverSource } from '@/api/types'
import DiscoverFilterToolbar from '@/components/discover/DiscoverFilterToolbar.vue'
import MediaCardListView from '@/views/discover/MediaCardListView.vue'
import FormRender from '@/components/render/FormRender.vue'
import { useDiscoverPreferences } from '@/composables/useDiscoverPreferences'
import { cloneDeep, isEqual } from 'lodash-es'

// 输入参数
const props = defineProps<{
  source: DiscoverSource
}>()

const { excludeShortDrama, filtersExpanded, toggleFiltersExpanded } = useDiscoverPreferences()

const SHORT_DRAMA_STREAMING_PATTERN = /(bilibili|tencentvideo|tencent|mangguo|mgtv|iqiyi|youku)/i

const supportsShortDramaFilter = computed(() => {
  const prefix = props.source.mediaid_prefix ?? ''
  const apiPath = props.source.api_path ?? ''
  return (
    SHORT_DRAMA_STREAMING_PATTERN.test(prefix) ||
    SHORT_DRAMA_STREAMING_PATTERN.test(apiPath) ||
    Object.prototype.hasOwnProperty.call(props.source.filter_params ?? {}, 'exclude_short_drama')
  )
})

/** 安全解析简单布尔条件表达式（支持 ==、===、!=、!==、&&、||），避免动态代码执行。 */
function evaluateSimpleShowExpr(expr: string, model: Record<string, unknown>): boolean {
  const orBranches = expr
    .split('||')
    .map(part => part.trim())
    .filter(Boolean)
  if (!orBranches.length) return true

  const resolveToken = (token: string): unknown => {
    const t = token.trim()
    if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
      return t.slice(1, -1)
    }
    if (t === 'true') return true
    if (t === 'false') return false
    if (t === 'null') return null
    if (t === 'undefined') return undefined
    if (/^-?\d+(?:\.\d+)?$/.test(t)) return Number(t)
    return model[t]
  }

  return orBranches.some(branch => {
    const andParts = branch
      .split('&&')
      .map(part => part.trim())
      .filter(Boolean)
    return andParts.every(clause => {
      for (const op of ['===', '!==', '==', '!='] as const) {
        const opIndex = clause.indexOf(op)
        if (opIndex > 0) {
          const left = resolveToken(clause.slice(0, opIndex))
          const right = resolveToken(clause.slice(opIndex + op.length))
          return op === '===' || op === '==' ? left === right : left !== right
        }
      }
      if (clause.startsWith('!')) {
        return !resolveToken(clause.slice(1))
      }
      return Boolean(resolveToken(clause))
    })
  })
}

const visibleRowOrderMap = computed<Map<number, number>>(() => {
  const map = new Map<number, number>()
  let visibleIdx = 0
  for (const [index, element] of (props.source.filter_ui ?? []).entries()) {
    const rawShow =
      (element as { props?: Record<string, unknown> })?.props?.show ??
      (element as { props?: Record<string, unknown> })?.props?.['v-show']
    let visible = true
    if (typeof rawShow === 'boolean') {
      visible = rawShow
    } else if (typeof rawShow === 'string' && rawShow.trim()) {
      const trimmed = rawShow.trim()
      const expr = trimmed.startsWith('{{') && trimmed.endsWith('}}') ? trimmed.slice(2, -2).trim() : trimmed
      visible = evaluateSimpleShowExpr(expr, filterParams)
    }
    if (visible) {
      map.set(index, visibleIdx)
      visibleIdx += 1
    }
  }
  return map
})

const canCollapse = computed(() => visibleRowOrderMap.value.size > 2)

function isFilterRowVisible(index: number): boolean {
  const order = visibleRowOrderMap.value.get(index)
  if (order === undefined) return false
  return filtersExpanded.value || order < 2
}

// 默认输入参数（响应式快照供重置计数追踪）
const defaultParamsSnapshot = ref(cloneDeep(props.source.filter_params))
let defaultParams = cloneDeep(props.source.filter_params)

// 过滤参数
const filterParams = reactive(cloneDeep(props.source.filter_params))

// 前一次的过滤参数
let previousParams = cloneDeep(props.source.filter_params)

// 当前Key
const currentKey = ref(0)

const activeFilterCount = computed(() => {
  const base = defaultParamsSnapshot.value ?? {}
  const keys = new Set([...Object.keys(base), ...Object.keys(filterParams)])
  let count = 0
  for (const key of keys) {
    if (!isEqual(filterParams[key], base[key])) {
      count += 1
    }
  }
  return count
})

const showToolbar = computed(() => supportsShortDramaFilter.value || activeFilterCount.value > 0 || canCollapse.value)

const requestParams = computed<Record<string, unknown>>(() => {
  if (supportsShortDramaFilter.value) {
    return {
      ...filterParams,
      exclude_short_drama: excludeShortDrama.value,
    }
  }
  return filterParams
})

function resetFilters() {
  for (const key of Object.keys(filterParams)) delete filterParams[key]
  Object.assign(filterParams, cloneDeep(defaultParams))
}

// 来源筛选契约变化时重建模型；语义相同的来源快照保留用户当前选择。
watch(
  () => props.source.filter_params,
  newDefaultParams => {
    if (isEqual(newDefaultParams, defaultParams)) return

    defaultParams = cloneDeep(newDefaultParams)
    defaultParamsSnapshot.value = cloneDeep(newDefaultParams)
    for (const key of Object.keys(filterParams)) delete filterParams[key]
    Object.assign(filterParams, cloneDeep(newDefaultParams))
    previousParams = cloneDeep(newDefaultParams)
  },
  { deep: true },
)

// 类型和过滤参数变化后重新刷新列表
watch(filterParams, newParams => {
  // 检查每个值
  for (const key in newParams) {
    // 如果没有值但有默认值时，设置为默认值
    if (!newParams[key] && defaultParams[key]) {
      filterParams[key] = defaultParams[key]
    }
    // 检查依赖关系
    const depends = props.source?.depends
    if (depends) {
      if (newParams[key] !== previousParams[key]) {
        for (const dependKey in depends) {
          if (key != dependKey && depends[dependKey] && depends[dependKey].includes(key)) {
            filterParams[dependKey] = null
          }
        }
      }
    }
  }
  // 更新 previousParams
  previousParams = cloneDeep(newParams)
  // 刷新界面
  currentKey.value++
})

watch(excludeShortDrama, () => {
  if (supportsShortDramaFilter.value) {
    currentKey.value++
  }
})
</script>

<template>
  <div class="extra-source-filters">
    <div v-if="showToolbar" class="extra-source-toolbar-row">
      <DiscoverFilterToolbar
        v-model:exclude-short-drama="excludeShortDrama"
        :show-short-drama-toggle="supportsShortDramaFilter"
        :active-filter-count="activeFilterCount"
        :can-collapse="canCollapse"
        :expanded="filtersExpanded"
        @reset="resetFilters"
        @toggle-expand="toggleFiltersExpanded"
      />
    </div>
    <div
      v-for="(element, index) in source.filter_ui"
      :key="index"
      v-show="isFilterRowVisible(index)"
      class="extra-source-filter-item"
    >
      <FormRender :config="element" :model="filterParams" />
    </div>
  </div>
  <div>
    <MediaCardListView :key="`${source.api_path}:${currentKey}`" :apipath="source.api_path" :params="requestParams" />
  </div>
</template>

<style scoped>
.extra-source-filters {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding-block: 4px 6px;
  padding-inline: 0;
}

.extra-source-toolbar-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-block-size: 26px;
}

.extra-source-filter-item:has(> .d-none) {
  display: none;
}

.extra-source-filters :deep(.v-label) {
  color: var(--mp-text-secondary, rgba(var(--v-theme-on-surface), 0.62));
  font-size: 12px;
  font-weight: 500;
  line-height: 1.2;
  min-inline-size: 44px;
  opacity: 1;
}

.extra-source-filters :deep(.v-chip-group) {
  padding-block: 0 !important;
}

.extra-source-filters :deep(.v-slide-group__content) {
  gap: 5px;
  padding-block: 1px !important;
}

.extra-source-filters :deep(.v-chip) {
  border-radius: 6px !important;
  block-size: 26px !important;
  font-size: 12.5px !important;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  margin: 0 !important;
  padding-inline: 9px !important;
}

.extra-source-filters :deep(.v-chip--selected) {
  background-color: rgba(var(--v-theme-primary), 0.14) !important;
  color: rgb(var(--v-theme-primary)) !important;
  font-weight: 600;
}
</style>
