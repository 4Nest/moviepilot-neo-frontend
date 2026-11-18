<script setup lang="ts">
import type { Site } from '@/api/types'
import { useI18n } from '@/composables/useChineseText'
import { useDisplay } from 'vuetify'

// 多语言支持
const { t } = useI18n()

// 显示器宽度
const display = useDisplay()

const props = defineProps({
  sites: {
    type: Array as PropType<Site[]>,
    required: true,
  },
  selected: Array as PropType<number[]>,
})

// 定义事件
const emit = defineEmits(['close', 'search', 'reload'])

// 过滤词
const siteFilter = ref('')

// 已选择站点
const selectedSites = ref<number[]>([])

// 根据当前可用站点清理选中项，避免停用或已删除站点参与计数。
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

watch(
  [() => props.selected, () => props.sites],
  ([value]) => {
    selectedSites.value = normalizeSelectedSites(value || [])
  },
  { immediate: true },
)

// 全选/全不选按钮文字
const checkAllText = computed(() => {
  return selectedSites.value.length < props.sites.length
    ? t('dialog.searchSite.selectAll')
    : t('dialog.searchSite.deselectAll')
})

// 全选/全不选
const checkAllSitesorNot = () => {
  if (selectedSites.value.length < props.sites.length) {
    selectedSites.value = props.sites.map((item: Site) => item.id)
  } else {
    selectedSites.value = []
  }
}

// 切换单个站点的选择状态。
function toggleSiteSelection(siteId: number) {
  const index = selectedSites.value.indexOf(siteId)
  if (index === -1) {
    selectedSites.value.push(siteId)
  } else {
    selectedSites.value.splice(index, 1)
  }
}

// 确认搜索时只提交当前可用站点。
function confirmSearch() {
  emit('search', normalizeSelectedSites(selectedSites.value))
}

// 根据筛选条件过滤站点
const filteredSites = computed(() => {
  if (!siteFilter.value) return props.sites
  const filter = siteFilter.value.toLowerCase()
  return props.sites.filter((site: Site) => site.name.toLowerCase().includes(filter))
})
</script>
<template>
  <!-- Site Selection Dialog -->
  <VDialog scrollable max-width="42rem" :fullscreen="!display.smAndUp.value">
    <VCard class="site-dialog">
      <VCardItem class="mp-dialog-header">
        <template #prepend>
          <VIcon icon="mdi-web-check" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>
          {{ t('dialog.searchSite.selectSites') }}
        </VCardTitle>
      </VCardItem>
      <VDialogCloseBtn @click="emit('close')" />
      <VDivider />
      <VCardText class="site-dialog__content overflow-y-auto mp-dialog-body">
        <!-- 站点筛选框 -->
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
          class="mb-3"
        />

        <!-- 站点列表 -->
        <div v-if="filteredSites.length > 0">
          <!-- 选择操作 -->
          <div class="d-flex align-center mb-3">
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

          <!-- 站点选择器 -->
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
                  class="me-2"
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
      </VCardText>
      <VDivider />
      <VCardActions class="app-dialog-actions mp-dialog-footer">
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
  gap: 10px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.site-checkbox-wrapper {
  border: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.1));
  border-radius: 8px;
  background-color: var(--mp-item-bg, rgba(var(--v-theme-on-surface), 0.02));
  cursor: pointer;
  min-block-size: 40px;
  padding: 8px 12px;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}

@media (min-width: 600px) {
  .site-dialog__content {
    max-block-size: 420px;
  }
}

@media (max-width: 759.98px) {
  .site-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 599.98px) {
  .mp-dialog-body {
    padding: 16px !important;
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
