<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api, { getApiErrorMessage } from '@/api'
import type { FilterRuleGroup, Site } from '@/api/types'
import { useI18n } from '@/composables/useChineseText'
import { useSilentSettingRefresh } from '@/composables/useSilentSettingRefresh'

// 国际化
const { t } = useI18n()

const props = defineProps({
  active: {
    type: Boolean,
    default: true,
  },
})

// 提示框
const $toast = useToast()

// 所有站点
const allSites = ref<Site[]>([])

// 选中订阅站点
const selectedSites = ref<number[]>([])

// 系统设置
const SystemSettings = ref<any>({
  Basic: {
    SEARCH_MULTIPLE_NAME: false,
    SEARCH_RESOURCE_PAGES: 3,
    DOWNLOAD_SUBTITLE: false,
    TORRENT_TAG: 'MOVIEPILOT',
  },
})

// 媒体信息数据源字典
const mediaSourcesDict = [
  {
    title: 'TheMovieDb',
    value: 'themoviedb',
  },
  {
    title: '豆瓣',
    value: 'douban',
  },
  {
    title: 'Bangumi',
    value: 'bangumi',
  },
  {
    title: 'AniList',
    value: 'anilist',
  },
]

// 当前选中的媒体信息数据源
const selectedMediaSource = ref<string[]>([])

// 当前选中的过滤规则组
const selectedFilterGroup = ref<string[]>([])

// 独立的保存加载锁
const savingSearchSetting = ref(false)
const savingSites = ref(false)

// 过滤规则组选择项
const filterRuleGroupOptions = computed(() => {
  return filterRuleGroups.value.map(item => ({
    title: item.name,
    value: item.name,
  }))
})

// 所有规则组列表
const filterRuleGroups = ref<FilterRuleGroup[]>([])

// 查询所有站点
async function querySites() {
  try {
    const data: Site[] = await api.get('site/')

    // 过滤站点，只有启用的站点才显示
    allSites.value = (Array.isArray(data) ? data : []).filter(item => item.is_active)
  } catch (error) {
    console.log(error)
  }
}

// 加载规则组
async function queryFilterRuleGroups() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/UserFilterRuleGroups')
    filterRuleGroups.value = Array.isArray(result.data?.value) ? result.data.value : []
  } catch (error) {
    console.log(error)
  }
}

// 查询用户选中的站点
async function querySelectedSites() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/public/IndexerSites')

    selectedSites.value = Array.isArray(result.data?.value) ? result.data.value : []
  } catch (error) {
    console.log(error)
  }
}

// 保存用户选中的站点
async function saveSelectedSites() {
  if (savingSites.value) return
  savingSites.value = true
  try {
    const sitesPayload = Array.isArray(selectedSites.value) ? selectedSites.value : []
    const result: { [key: string]: any } = await api.post('system/setting/IndexerSites', sitesPayload)

    if (result.success) $toast.success('搜索站点保存成功')
    else $toast.error(result.message || '搜索站点保存失败！')
  } catch (error) {
    console.log(error)
    $toast.error(getApiErrorMessage(error) || '搜索站点保存失败！')
  } finally {
    savingSites.value = false
  }
}

// 调用API查询设置
async function loadSearchSetting() {
  try {
    const result1: { [key: string]: any } = await api.get('system/setting/SEARCH_SOURCE')
    if (result1.success) {
      const rawSource = result1.data?.value
      selectedMediaSource.value =
        typeof rawSource === 'string'
          ? rawSource
              .split(',')
              .map(s => s.trim())
              .filter(Boolean)
          : Array.isArray(rawSource)
            ? rawSource.filter(Boolean)
            : []
    }
    const result2: { [key: string]: any } = await api.get('system/setting/SearchFilterRuleGroups')
    if (result2.success) {
      selectedFilterGroup.value = Array.isArray(result2.data?.value) ? result2.data.value : []
    }
  } catch (error) {
    console.log(error)
  }
}

// 调用API保存设置
async function saveSystemSetting(value: { [key: string]: any }) {
  try {
    const result: { [key: string]: any } = await api.post('system/env', value)

    if (result.success) {
      return true
    }
  } catch (error) {
    console.log(error)
  }
  return false
}

// 调用API保存设置
async function saveSearchSetting() {
  if (savingSearchSetting.value) return
  savingSearchSetting.value = true
  try {
    const mediaSourceStr = (Array.isArray(selectedMediaSource.value) ? selectedMediaSource.value : [])
      .filter(Boolean)
      .join(',')
    const result1: { [key: string]: any } = await api.post('system/setting/SEARCH_SOURCE', mediaSourceStr)

    if (!result1 || !result1.success) {
      $toast.error(`媒体搜索数据源保存失败：${result1?.message ?? ''}！`)
      return
    }

    const filterGroupPayload = Array.isArray(selectedFilterGroup.value) ? selectedFilterGroup.value : []
    const result2: { [key: string]: any } = await api.post('system/setting/SearchFilterRuleGroups', filterGroupPayload)

    const parsedPages = Number(SystemSettings.value.Basic.SEARCH_RESOURCE_PAGES)
    SystemSettings.value.Basic.SEARCH_RESOURCE_PAGES =
      Number.isFinite(parsedPages) && parsedPages >= 1 ? Math.floor(parsedPages) : 3

    const result3 = await saveSystemSetting(SystemSettings.value.Basic)

    if (result2.success && result3) {
      $toast.success('搜索基础设置保存成功')
    } else {
      $toast.error('搜索基础设置保存失败！')
    }
  } catch (error) {
    console.log(error)
    $toast.error(getApiErrorMessage(error) || t('setting.search.saveFailed'))
  } finally {
    savingSearchSetting.value = false
  }
}

// 加载系统设置
async function loadSystemSettings() {
  try {
    const result: { [key: string]: any } = await api.get('system/env')
    if (result.success) {
      // 将API返回的值赋值给SystemSettings
      for (const sectionKey of Object.keys(SystemSettings.value) as Array<keyof typeof SystemSettings.value>) {
        Object.keys(SystemSettings.value[sectionKey]).forEach((key: string) => {
          if (result.data.hasOwnProperty(key)) (SystemSettings.value[sectionKey] as any)[key] = result.data[key]
        })
      }
    }
  } catch (error) {
    console.log(error)
  }
}

async function loadPageData() {
  await Promise.all([
    querySites(),
    queryFilterRuleGroups(),
    querySelectedSites(),
    loadSearchSetting(),
    loadSystemSettings(),
  ])
}

onMounted(() => {
  loadPageData()
})

useSilentSettingRefresh(
  async () => {
    if (savingSearchSetting.value || savingSites.value) return
    await loadPageData()
  },
  {
    active: computed(() => props.active),
  },
)
</script>

<template>
  <div class="mp-setting-stack">
    <VCard id="sec-search-basic" class="mp-setting-card">
      <VCardItem>
        <template #prepend>
          <div class="mp-setting-card__icon mp-setting-card__icon--primary">
            <VIcon icon="mdi-magnify-expand" size="18" />
          </div>
        </template>
        <VCardTitle>{{ t('setting.search.basicSettings') }}</VCardTitle>
        <VCardSubtitle>{{ t('setting.search.basicSettingsDesc') }}</VCardSubtitle>
      </VCardItem>
      <VCardText>
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol cols="12" md="6">
              <VSelect
                v-model="selectedMediaSource"
                multiple
                clearable
                chips
                :items="mediaSourcesDict"
                :label="t('setting.search.mediaSource')"
                :hint="t('setting.search.mediaSourceHint')"
                persistent-hint
                prepend-inner-icon="mdi-database-search"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VAutocomplete
                v-model="selectedFilterGroup"
                multiple
                clearable
                chips
                :items="filterRuleGroupOptions"
                :label="t('setting.search.filterRuleGroup')"
                :hint="t('setting.search.filterRuleGroupHint')"
                persistent-hint
                prepend-inner-icon="mdi-filter"
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="12" md="6">
              <VTextField
                v-model="SystemSettings.Basic.TORRENT_TAG"
                :label="t('setting.search.downloadLabel')"
                placeholder="MOVIEPILOT"
                :hint="t('setting.search.downloadLabelHint')"
                persistent-hint
                prepend-inner-icon="mdi-tag"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model.number="SystemSettings.Basic.SEARCH_RESOURCE_PAGES"
                type="number"
                min="1"
                step="1"
                :label="t('setting.search.searchResourcePages')"
                :hint="t('setting.search.searchResourcePagesHint')"
                persistent-hint
                prepend-inner-icon="mdi-file-search"
              />
            </VCol>
            <VCol cols="12" md="6">
              <div class="mp-switch-card" :title="t('setting.search.multipleNameSearchHint')">
                <VSwitch
                  v-model="SystemSettings.Basic.SEARCH_MULTIPLE_NAME"
                  :label="t('setting.search.multipleNameSearch')"
                  :hint="t('setting.search.multipleNameSearchHint')"
                  color="primary"
                  density="compact"
                  inset
                  persistent-hint
                />
              </div>
            </VCol>
            <VCol cols="12" md="6">
              <div class="mp-switch-card" :title="t('setting.search.downloadSubtitleHint')">
                <VSwitch
                  v-model="SystemSettings.Basic.DOWNLOAD_SUBTITLE"
                  :label="t('setting.search.downloadSubtitle')"
                  :hint="t('setting.search.downloadSubtitleHint')"
                  color="primary"
                  density="compact"
                  inset
                  persistent-hint
                />
              </div>
            </VCol>
          </VRow>
        </VForm>

        <VForm class="mp-card-footer" @submit.prevent="() => {}">
          <span class="mp-card-footer__hint">保存搜索数据源、过滤规则组与默认分页参数</span>
          <VBtn
            type="submit"
            size="small"
            color="primary"
            variant="flat"
            rounded="lg"
            prepend-icon="mdi-content-save-outline"
            :loading="savingSearchSetting"
            :disabled="savingSearchSetting"
            class="px-4"
            @click="saveSearchSetting"
          >
            {{ t('common.save') }}
          </VBtn>
        </VForm>
      </VCardText>
    </VCard>

    <VCard id="sec-search-sites" class="mp-setting-card">
      <VCardItem>
        <template #prepend>
          <div class="mp-setting-card__icon mp-setting-card__icon--info">
            <VIcon icon="mdi-radar" size="18" />
          </div>
        </template>
        <VCardTitle>{{ t('setting.search.downloadSite') }}</VCardTitle>
        <VCardSubtitle>{{ t('setting.search.downloadSiteDesc') }}</VCardSubtitle>
        <template v-if="allSites.length > 0" #append>
          <div class="d-flex flex-wrap align-center justify-end gap-2">
            <span class="mp-count-pill">已选 {{ selectedSites.length }} / {{ allSites.length }}</span>
            <button type="button" class="mp-inline-action" @click="selectedSites = allSites.map(s => s.id)">
              全选
            </button>
            <button type="button" class="mp-inline-action" @click="selectedSites = []">清空</button>
          </div>
        </template>
      </VCardItem>
      <VCardText>
        <VChipGroup v-if="allSites.length > 0" v-model="selectedSites" column multiple>
          <VChip
            v-for="site in allSites"
            :key="site.id"
            :color="selectedSites.includes(site.id) ? 'primary' : undefined"
            :variant="selectedSites.includes(site.id) ? 'tonal' : 'outlined'"
            rounded="lg"
            filter
            :value="site.id"
          >
            {{ site.name }}
          </VChip>
        </VChipGroup>
        <div v-else class="mp-empty-hint">
          <VIcon icon="mdi-radar" size="16" class="mp-empty-hint__icon" />
          <span>暂无可用站点，请先在「站点管理」中添加并启用站点</span>
        </div>

        <VForm class="mp-card-footer" @submit.prevent="() => {}">
          <span class="mp-card-footer__hint">保存手动与快速搜索时默认勾选的索引站点</span>
          <VBtn
            type="submit"
            size="small"
            color="primary"
            variant="flat"
            rounded="lg"
            prepend-icon="mdi-content-save-outline"
            :loading="savingSites"
            :disabled="savingSites"
            class="px-4"
            @click="saveSelectedSites"
          >
            {{ t('common.save') }}
          </VBtn>
        </VForm>
      </VCardText>
    </VCard>
  </div>
</template>

<style scoped>
.mp-empty-hint {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  padding: 16px 14px;
  border: 1px dashed var(--mp-border-card);
  border-radius: 8px;
  background: var(--mp-item-bg);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12.5px;
  gap: 5px;
  line-height: 1.5;
}

.mp-empty-hint__icon {
  color: rgba(var(--v-theme-on-surface), 0.45);
}
</style>
