<script setup lang="ts">
import api from '@/api'
import type { CustomRule, FilterRuleGroup, Site } from '@/api/types'
import { useI18n } from '@/composables/useChineseText'
import {
  clearStoredSearchSelection,
  encodeSearchRuleGroupsParam,
  loadStoredSearchSelection,
  saveStoredSearchSelection,
  type SearchRuleMode,
} from '@/composables/useSearchSelection'
import { useDisplay } from 'vuetify'

const { t } = useI18n()
const display = useDisplay()

const props = defineProps({
  sites: {
    type: Array as PropType<Site[]>,
    required: true,
  },
  selected: Array as PropType<number[]>,
})

const emit = defineEmits(['close', 'search', 'reload'])

// 当前分页：站点 / 过滤规则
const activeTab = ref<'sites' | 'rules'>('sites')

// 站点筛选与选中状态
const siteFilter = ref('')
const selectedSites = ref<number[]>([])

// 规则数据与加载态
const ruleGroups = ref<FilterRuleGroup[]>([])
const customRules = ref<CustomRule[]>([])
const defaultSearchRuleGroups = ref<string[]>([])
const rulesLoading = ref(false)
const rulesLoaded = ref(false)

// 规则选择状态（默认遵循系统原本规则）
const ruleMode = ref<SearchRuleMode>('default')
const selectedRuleGroups = ref<string[]>([])
const selectedCustomRules = ref<string[]>([])
const ruleFilter = ref('')

// 记录是否存在本地记忆，用于决定站点初始值与恢复默认按钮状态
const storedSelection = ref(loadStoredSearchSelection())

function normalizeSelectedSites(selectedSiteIds: number[] = []) {
  const availableSiteIds = new Set(props.sites.map((site: Site) => site.id))
  const normalizedSiteIds: number[] = []

  selectedSiteIds.forEach(siteId => {
    if (availableSiteIds.has(siteId) && !normalizedSiteIds.includes(siteId)) {
      normalizedSiteIds.push(siteId)
    }
  })

  return normalizedSiteIds
}

function normalizeSelectedRuleGroups(names: string[] = []) {
  if (!rulesLoaded.value) return [...new Set(names.filter(Boolean))]
  const availableNames = new Set(ruleGroups.value.map(group => group.name).filter(Boolean))
  return [...new Set(names.filter(name => availableNames.has(name)))]
}

function normalizeSelectedCustomRules(ids: string[] = []) {
  if (!rulesLoaded.value) return [...new Set(ids.filter(Boolean))]
  const availableIds = new Set(customRules.value.map(rule => rule.id).filter(Boolean))
  return [...new Set(ids.filter(id => availableIds.has(id)))]
}

function initRuleSelectionFromStorage() {
  const stored = storedSelection.value
  if (!stored) {
    ruleMode.value = 'default'
    selectedRuleGroups.value = []
    selectedCustomRules.value = []
    return
  }
  ruleMode.value = stored.ruleMode
  selectedRuleGroups.value = normalizeSelectedRuleGroups(stored.ruleGroups)
  selectedCustomRules.value = normalizeSelectedCustomRules(stored.customRules)
}

initRuleSelectionFromStorage()

watch(
  [() => props.selected, () => props.sites],
  ([defaultSelected]) => {
    const storedSites = storedSelection.value?.sites
    const sourceSites = storedSites && storedSites.length > 0 ? storedSites : defaultSelected || []
    const normalized = normalizeSelectedSites(sourceSites)
    // 若记住的站点均已失效，回退到系统默认站点
    selectedSites.value =
      normalized.length > 0 || !storedSites?.length ? normalized : normalizeSelectedSites(defaultSelected || [])
  },
  { immediate: true },
)

async function loadRuleSettings() {
  rulesLoading.value = true
  try {
    const [groupsRes, customRes, defaultRes] = await Promise.allSettled([
      api.get('system/setting/public/UserFilterRuleGroups'),
      api.get('system/setting/public/CustomFilterRules'),
      api.get('system/setting/public/SearchFilterRuleGroups'),
    ])

    if (groupsRes.status === 'fulfilled') {
      const val = (groupsRes.value as { data?: { value?: FilterRuleGroup[] } })?.data?.value
      ruleGroups.value = Array.isArray(val) ? val.filter(item => Boolean(item?.name)) : []
    }
    if (customRes.status === 'fulfilled') {
      const val = (customRes.value as { data?: { value?: CustomRule[] } })?.data?.value
      customRules.value = Array.isArray(val) ? val.filter(item => Boolean(item?.id)) : []
    }
    if (defaultRes.status === 'fulfilled') {
      const val = (defaultRes.value as { data?: { value?: string[] } })?.data?.value
      defaultSearchRuleGroups.value = Array.isArray(val) ? val.filter(Boolean) : []
    }
  } finally {
    rulesLoaded.value = true
    rulesLoading.value = false
    selectedRuleGroups.value = normalizeSelectedRuleGroups(selectedRuleGroups.value)
    selectedCustomRules.value = normalizeSelectedCustomRules(selectedCustomRules.value)
  }
}

onMounted(() => {
  void loadRuleSettings()
})

// 站点选择操作
const checkAllText = computed(() => {
  return selectedSites.value.length < props.sites.length
    ? t('dialog.searchSite.selectAll')
    : t('dialog.searchSite.deselectAll')
})

const checkAllSitesorNot = () => {
  if (selectedSites.value.length < props.sites.length) {
    selectedSites.value = props.sites.map((item: Site) => item.id)
  } else {
    selectedSites.value = []
  }
}

function toggleSiteSelection(siteId: number) {
  const index = selectedSites.value.indexOf(siteId)
  if (index === -1) {
    selectedSites.value.push(siteId)
  } else {
    selectedSites.value.splice(index, 1)
  }
}

const filteredSites = computed(() => {
  if (!siteFilter.value) return props.sites
  const filter = siteFilter.value.toLowerCase()
  return props.sites.filter((site: Site) => site.name.toLowerCase().includes(filter))
})

// 规则筛选与选择操作
const filteredRuleGroups = computed(() => {
  const keyword = ruleFilter.value.trim().toLowerCase()
  if (!keyword) return ruleGroups.value
  return ruleGroups.value.filter(
    group =>
      group.name?.toLowerCase().includes(keyword) ||
      group.media_type?.toLowerCase().includes(keyword) ||
      group.category?.toLowerCase().includes(keyword),
  )
})

const filteredCustomRules = computed(() => {
  const keyword = ruleFilter.value.trim().toLowerCase()
  if (!keyword) return customRules.value
  return customRules.value.filter(
    rule => rule.name?.toLowerCase().includes(keyword) || rule.id?.toLowerCase().includes(keyword),
  )
})

const customSelectedCount = computed(() => selectedRuleGroups.value.length + selectedCustomRules.value.length)

function toggleRuleGroup(groupName: string) {
  const index = selectedRuleGroups.value.indexOf(groupName)
  if (index === -1) {
    selectedRuleGroups.value.push(groupName)
  } else {
    selectedRuleGroups.value.splice(index, 1)
  }
}

function toggleCustomRule(ruleId: string) {
  const index = selectedCustomRules.value.indexOf(ruleId)
  if (index === -1) {
    selectedCustomRules.value.push(ruleId)
  } else {
    selectedCustomRules.value.splice(index, 1)
  }
}

function clearCustomRuleSelection() {
  selectedRuleGroups.value = []
  selectedCustomRules.value = []
}

// 规则页标签徽标
const rulesTabBadge = computed(() => {
  if (ruleMode.value === 'none') return t('dialog.searchSite.summaryNoFilter')
  if (ruleMode.value === 'custom' && customSelectedCount.value > 0) {
    return `${customSelectedCount.value}`
  }
  return t('dialog.searchSite.summaryDefaultRule')
})

// 底栏极简摘要
const ruleSummaryText = computed(() => {
  if (ruleMode.value === 'none') return t('dialog.searchSite.summaryNoFilter')
  if (ruleMode.value === 'custom' && customSelectedCount.value > 0) {
    return t('dialog.searchSite.summaryCustomRules', { count: customSelectedCount.value })
  }
  return t('dialog.searchSite.summaryDefaultRule')
})

// 是否与系统默认状态有差异，决定是否展示「恢复默认」
const isCustomized = computed(() => {
  if (ruleMode.value !== 'default') return true
  const defaultSites = normalizeSelectedSites(props.selected || [])
  const currentSites = normalizeSelectedSites(selectedSites.value)
  if (defaultSites.length !== currentSites.length) return true
  return defaultSites.some(id => !currentSites.includes(id))
})

function restoreDefaults() {
  clearStoredSearchSelection()
  storedSelection.value = null
  selectedSites.value = normalizeSelectedSites(props.selected || [])
  ruleMode.value = 'default'
  selectedRuleGroups.value = []
  selectedCustomRules.value = []
  ruleFilter.value = ''
}

function confirmSearch() {
  const normalizedSites = normalizeSelectedSites(selectedSites.value)
  const normalizedGroups = normalizeSelectedRuleGroups(selectedRuleGroups.value)
  const normalizedCustom = normalizeSelectedCustomRules(selectedCustomRules.value)
  const effectiveMode: SearchRuleMode =
    ruleMode.value === 'custom' && normalizedGroups.length + normalizedCustom.length === 0 ? 'default' : ruleMode.value

  saveStoredSearchSelection({
    sites: normalizedSites,
    ruleMode: effectiveMode,
    ruleGroups: normalizedGroups,
    customRules: normalizedCustom,
  })

  const ruleGroupsParam = encodeSearchRuleGroupsParam({
    ruleMode: effectiveMode,
    ruleGroups: normalizedGroups,
    customRules: normalizedCustom,
  })

  emit('search', normalizedSites, ruleGroupsParam)
}
</script>

<template>
  <VDialog scrollable max-width="46rem" :fullscreen="!display.smAndUp.value">
    <VCard class="site-dialog mp-tabbed-dialog">
      <VCardItem class="mp-dialog-header">
        <template #prepend>
          <VIcon icon="mdi-tune-variant" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>
          {{ t('dialog.searchSite.title') }}
        </VCardTitle>
      </VCardItem>
      <VDialogCloseBtn @click="emit('close')" />

      <!-- 固定顶部两页分段切换：站点 / 过滤规则 -->
      <div class="mp-tabbed-dialog__tabs">
        <VTabs v-model="activeTab" density="compact" class="mp-segmented-tabs mp-segmented-tabs--block">
          <VTab value="sites" :ripple="false">
            <VIcon icon="mdi-web-check" size="16" class="me-1.5" />
            <span>{{ t('dialog.searchSite.sitesTab') }}</span>
            <span v-if="sites.length > 0" class="mp-tab-badge ms-2">
              {{ selectedSites.length }}/{{ sites.length }}
            </span>
          </VTab>
          <VTab value="rules" :ripple="false">
            <VIcon icon="mdi-filter-variant" size="16" class="me-1.5" />
            <span>{{ t('dialog.searchSite.rulesTab') }}</span>
            <span
              class="mp-tab-badge ms-2"
              :class="{ 'mp-tab-badge--warning': ruleMode === 'none' }"
            >
              {{ rulesTabBadge }}
            </span>
          </VTab>
        </VTabs>
      </div>
      <VDivider />

      <VCardText class="site-dialog__content mp-dialog-body mp-tabbed-dialog__body">
        <!-- Tab 1: 站点选择 -->
        <div v-show="activeTab === 'sites'">
          <VTextField
            v-if="sites.length > 0"
            v-model="siteFilter"
            :placeholder="t('common.filter')"
            :aria-label="t('common.filter')"
            prepend-inner-icon="mdi-magnify"
            density="compact"
            variant="outlined"
            clearable
            hide-details
            class="mb-4"
          />

          <div v-if="filteredSites.length > 0">
            <div class="d-flex align-center mb-4">
              <VBtn
                color="default"
                size="small"
                variant="outlined"
                class="me-3 site-bulk-btn"
                @click="checkAllSitesorNot"
              >
                <VIcon start size="small">
                  {{ selectedSites.length < sites.length ? 'mdi-check-all' : 'mdi-close-circle-outline' }}
                </VIcon>
                {{ checkAllText }}
              </VBtn>
              <div
                class="text-body-2 font-weight-medium"
                :class="selectedSites.length > 0 ? 'text-high-emphasis' : 'text-medium-emphasis'"
              >
                {{ t('dialog.searchSite.searchAllSites', { selected: selectedSites.length, total: sites.length }) }}
              </div>
            </div>

            <div class="site-grid">
              <VHover v-for="site in filteredSites" :key="site.id" v-slot="{ isHovering, props: hoverProps }">
                <div
                  v-bind="hoverProps"
                  :class="[
                    'site-checkbox-wrapper d-flex align-center',
                    {
                      'site-selected': selectedSites.includes(site.id),
                      'site-hover': isHovering && !selectedSites.includes(site.id),
                    },
                  ]"
                  @click="toggleSiteSelection(site.id)"
                >
                  <VIcon
                    :icon="selectedSites.includes(site.id) ? 'mdi-check-circle' : 'mdi-checkbox-blank-circle-outline'"
                    :color="selectedSites.includes(site.id) ? 'primary' : 'medium-emphasis'"
                    class="me-2 flex-shrink-0"
                    size="18"
                  />
                  <span :class="['text-body-2 site-name', { 'font-weight-medium': selectedSites.includes(site.id) }]">
                    {{ site.name }}
                  </span>
                </div>
              </VHover>
            </div>
          </div>
          <div v-else class="text-center py-8 empty-site-state">
            <div class="search-icon-wrapper mb-4 mx-auto warning">
              <VIcon icon="mdi-alert-circle-outline" size="large" color="warning" />
            </div>
            <div class="text-h6 font-weight-medium mb-2">{{ t('torrent.noMatchingResults') }}</div>
            <div class="text-subtitle-1 text-medium-emphasis mb-4">
              {{ siteFilter ? t('site.noFilterData') : t('site.sitesWillBeShownHere') }}
            </div>
            <VBtn
              v-if="siteFilter"
              color="primary"
              variant="flat"
              size="small"
              class="mt-3"
              prepend-icon="mdi-refresh"
              @click="siteFilter = ''"
            >
              {{ t('torrent.clearFilters') }}
            </VBtn>
            <VBtn
              v-else
              color="primary"
              variant="flat"
              size="small"
              class="mt-3"
              prepend-icon="mdi-refresh"
              @click="emit('reload')"
            >
              {{ t('common.retry') }}
            </VBtn>
          </div>
        </div>

        <!-- Tab 2: 过滤规则 -->
        <div v-show="activeTab === 'rules'">
          <!-- 三态模式切换 -->
          <div class="d-flex align-center justify-space-between flex-wrap gap-2 mb-4">
            <div class="mp-segmented-control" role="radiogroup" :aria-label="t('dialog.searchSite.rulesTab')">
              <button
                type="button"
                class="mp-segmented-control__item"
                :class="{ 'is-active': ruleMode === 'default' }"
                :aria-pressed="ruleMode === 'default'"
                @click="ruleMode = 'default'"
              >
                {{ t('dialog.searchSite.ruleModeDefault') }}
              </button>
              <button
                type="button"
                class="mp-segmented-control__item"
                :class="{ 'is-active': ruleMode === 'custom' }"
                :aria-pressed="ruleMode === 'custom'"
                @click="ruleMode = 'custom'"
              >
                {{ t('dialog.searchSite.ruleModeCustom') }}
              </button>
              <button
                type="button"
                class="mp-segmented-control__item"
                :class="{ 'is-active': ruleMode === 'none' }"
                :aria-pressed="ruleMode === 'none'"
                @click="ruleMode = 'none'"
              >
                {{ t('dialog.searchSite.ruleModeNone') }}
              </button>
            </div>

            <VBtn
              v-if="ruleMode === 'custom' && customSelectedCount > 0"
              size="small"
              variant="text"
              color="medium-emphasis"
              prepend-icon="mdi-close"
              @click="clearCustomRuleSelection"
            >
              {{ t('dialog.searchSite.clearRules') }}
            </VBtn>
          </div>

          <!-- 加载态 -->
          <div v-if="rulesLoading" class="d-flex justify-center py-8">
            <VProgressCircular indeterminate size="26" width="2" color="primary" />
          </div>

          <!-- 模式一：默认规则 -->
          <div v-else-if="ruleMode === 'default'" class="rule-mode-panel">
            <div class="d-flex align-center mb-2">
              <VIcon icon="mdi-shield-check-outline" size="18" color="primary" class="me-2" />
              <span class="text-body-2 font-weight-medium">{{ t('dialog.searchSite.defaultRuleTitle') }}</span>
            </div>
            <div v-if="defaultSearchRuleGroups.length > 0" class="d-flex flex-wrap gap-2 mt-3">
              <VChip
                v-for="groupName in defaultSearchRuleGroups"
                :key="groupName"
                size="small"
                variant="tonal"
                color="primary"
              >
                {{ groupName }}
              </VChip>
            </div>
            <div v-else class="text-body-2 text-medium-emphasis mt-1">
              {{ t('dialog.searchSite.defaultRuleEmpty') }}
            </div>
          </div>

          <!-- 模式二：不过滤 -->
          <div v-else-if="ruleMode === 'none'" class="rule-mode-panel">
            <div class="d-flex align-center mb-2">
              <VIcon icon="mdi-filter-off-outline" size="18" color="warning" class="me-2" />
              <span class="text-body-2 font-weight-medium">{{ t('dialog.searchSite.noFilterTitle') }}</span>
            </div>
            <div class="text-body-2 text-medium-emphasis">
              {{ t('dialog.searchSite.noFilterDesc') }}
            </div>
          </div>

          <!-- 模式三：自定义（支持多选规则组 + 单条自定义规则） -->
          <div v-else>
            <VTextField
              v-if="ruleGroups.length > 0 || customRules.length > 0"
              v-model="ruleFilter"
              :placeholder="t('dialog.searchSite.ruleFilterPlaceholder')"
              :aria-label="t('dialog.searchSite.ruleFilterPlaceholder')"
              prepend-inner-icon="mdi-magnify"
              density="compact"
              variant="outlined"
              clearable
              hide-details
              class="mb-3"
            />

            <template v-if="ruleGroups.length === 0 && customRules.length === 0">
              <div class="text-center py-8 text-body-2 text-medium-emphasis">
                {{ t('dialog.searchSite.noRulesConfigured') }}
              </div>
            </template>
            <template v-else-if="filteredRuleGroups.length === 0 && filteredCustomRules.length === 0">
              <div class="text-center py-8 text-body-2 text-medium-emphasis">
                {{ t('dialog.searchSite.noMatchingRules') }}
              </div>
            </template>
            <template v-else>
              <!-- 优先级规则组 -->
              <div v-if="filteredRuleGroups.length > 0" class="mb-4">
                <div class="rule-section-title text-caption font-weight-medium text-medium-emphasis mb-2">
                  {{ t('dialog.searchSite.ruleGroupsSection') }}
                </div>
                <div class="site-grid">
                  <VHover
                    v-for="group in filteredRuleGroups"
                    :key="`group:${group.name}`"
                    v-slot="{ isHovering, props: hoverProps }"
                  >
                    <div
                      v-bind="hoverProps"
                      :title="group.name"
                      :class="[
                        'site-checkbox-wrapper d-flex align-center',
                        {
                          'site-selected': selectedRuleGroups.includes(group.name),
                          'site-hover': isHovering && !selectedRuleGroups.includes(group.name),
                        },
                      ]"
                      @click="toggleRuleGroup(group.name)"
                    >
                      <VIcon
                        :icon="
                          selectedRuleGroups.includes(group.name)
                            ? 'mdi-check-circle'
                            : 'mdi-checkbox-blank-circle-outline'
                        "
                        :color="selectedRuleGroups.includes(group.name) ? 'primary' : 'medium-emphasis'"
                        class="me-2 flex-shrink-0"
                        size="18"
                      />
                      <span
                        :class="[
                          'text-body-2 site-name flex-grow-1',
                          { 'font-weight-medium': selectedRuleGroups.includes(group.name) },
                        ]"
                      >
                        {{ group.name }}
                      </span>
                      <span v-if="group.media_type" class="rule-meta-tag text-caption text-medium-emphasis ms-1">
                        {{ group.media_type }}
                      </span>
                    </div>
                  </VHover>
                </div>
              </div>

              <!-- 单条自定义规则 -->
              <div v-if="filteredCustomRules.length > 0">
                <div class="rule-section-title text-caption font-weight-medium text-medium-emphasis mb-2">
                  {{ t('dialog.searchSite.customRulesSection') }}
                </div>
                <div class="site-grid">
                  <VHover
                    v-for="rule in filteredCustomRules"
                    :key="`rule:${rule.id}`"
                    v-slot="{ isHovering, props: hoverProps }"
                  >
                    <div
                      v-bind="hoverProps"
                      :title="rule.name ? `${rule.name} (${rule.id})` : rule.id"
                      :class="[
                        'site-checkbox-wrapper d-flex align-center',
                        {
                          'site-selected': selectedCustomRules.includes(rule.id),
                          'site-hover': isHovering && !selectedCustomRules.includes(rule.id),
                        },
                      ]"
                      @click="toggleCustomRule(rule.id)"
                    >
                      <VIcon
                        :icon="
                          selectedCustomRules.includes(rule.id)
                            ? 'mdi-check-circle'
                            : 'mdi-checkbox-blank-circle-outline'
                        "
                        :color="selectedCustomRules.includes(rule.id) ? 'primary' : 'medium-emphasis'"
                        class="me-2 flex-shrink-0"
                        size="18"
                      />
                      <span
                        :class="[
                          'text-body-2 site-name flex-grow-1',
                          { 'font-weight-medium': selectedCustomRules.includes(rule.id) },
                        ]"
                      >
                        {{ rule.name || rule.id }}
                      </span>
                    </div>
                  </VHover>
                </div>
              </div>

              <div v-if="customSelectedCount === 0" class="text-caption text-medium-emphasis mt-3">
                {{ t('dialog.searchSite.customRuleEmptyTip') }}
              </div>
            </template>
          </div>
        </div>
      </VCardText>

      <VDivider />
      <VCardActions class="app-dialog-actions mp-dialog-footer">
        <div class="d-flex align-center gap-2 text-caption text-medium-emphasis search-summary-bar">
          <span>
            {{ t('dialog.searchSite.summarySites', { count: selectedSites.length }) }}
            ·
            {{ ruleSummaryText }}
          </span>
          <VBtn
            v-if="isCustomized"
            size="x-small"
            variant="text"
            color="primary"
            class="px-1"
            @click="restoreDefaults"
          >
            {{ t('dialog.searchSite.restoreDefault') }}
          </VBtn>
        </div>
        <VSpacer />
        <VBtn color="default" variant="text" size="small" @click="emit('close')">
          {{ t('common.cancel') }}
        </VBtn>
        <VBtn
          color="primary"
          variant="flat"
          size="small"
          :disabled="selectedSites.length === 0"
          prepend-icon="mdi-magnify"
          class="d-flex align-center justify-center px-4"
          @click="confirmSearch"
        >
          {{ t('common.search') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.mp-dialog-header {
  padding-block: 14px;
  padding-inline: 22px 48px;
}

.mp-dialog-body {
  padding: 18px 22px !important;
}

.mp-dialog-footer {
  gap: 8px;
  padding: 10px 20px !important;
}

.site-bulk-btn {
  border-radius: 8px;
}

.site-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.site-checkbox-wrapper {
  border: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.1));
  border-radius: 10px;
  background-color: var(--mp-item-bg, rgba(var(--v-theme-on-surface), 0.02));
  cursor: pointer;
  min-block-size: 44px;
  padding: 10px 14px;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}

.rule-mode-panel {
  border: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.1));
  border-radius: 12px;
  background-color: var(--mp-item-bg, rgba(var(--v-theme-on-surface), 0.02));
  padding: 20px;
}

.rule-meta-tag {
  flex-shrink: 0;
  font-size: 0.72rem;
}

.search-summary-bar {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 759.98px) {
  .site-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.site-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-selected {
  border-color: rgba(var(--v-theme-primary), 0.45);
  background-color: rgba(var(--v-theme-on-surface), 0.045);
  color: rgb(var(--v-theme-on-surface));
}

.site-hover {
  border-color: var(--mp-border-hover, rgba(var(--v-theme-on-surface), 0.22));
  background-color: rgba(var(--v-theme-on-surface), 0.04);
}
</style>
