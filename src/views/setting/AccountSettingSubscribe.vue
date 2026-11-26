<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api, { getApiErrorMessage } from '@/api'
import type { FilterRuleGroup, Site } from '@/api/types'
import { useI18n } from '@/composables/useChineseText'
import { useSilentSettingRefresh } from '@/composables/useSilentSettingRefresh'
import SubscribeAutoFillSetting from './SubscribeAutoFillSetting.vue'

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
const selectedRssSites = ref<number[]>([])

// 选中的订阅规则组
const selectedFilterRuleGroup = ref<string[]>([])

// 选中的洗版规则组
const selectedBestVersionRuleGroup = ref<string[]>([])

// 各卡片独立的保存加载锁
const savingSubscribeSetting = ref(false)
const savingRssSites = ref(false)

// 订阅模式选择项
const subscribeModeItems = [
  { title: t('setting.subscribe.modes.auto'), value: 'spider' },
  { title: t('setting.subscribe.modes.rss'), value: 'rss' },
]

// 所有规则组列表
const filterRuleGroups = ref<FilterRuleGroup[]>([])

// 过滤规则组选择项
const filterRuleGroupOptions = computed(() => {
  return filterRuleGroups.value.map(item => ({
    title: item.name,
    value: item.name,
  }))
})

// RSS运行周期选择项
const rssIntervalItems = [
  { title: t('setting.subscribe.intervals.min5'), value: 5 },
  { title: t('setting.subscribe.intervals.min10'), value: 10 },
  { title: t('setting.subscribe.intervals.min20'), value: 20 },
  { title: t('setting.subscribe.intervals.min30'), value: 30 },
  { title: t('setting.subscribe.intervals.hour1'), value: 60 },
  { title: t('setting.subscribe.intervals.hour12'), value: 720 },
  { title: t('setting.subscribe.intervals.day1'), value: 1440 },
]

// 订阅搜索时间间隔选择项（小时）
const subscribeSearchIntervalItems = [
  { title: t('setting.subscribe.intervals.day1'), value: 24 },
  { title: t('setting.subscribe.intervals.day3'), value: 72 },
  { title: t('setting.subscribe.intervals.week1'), value: 168 },
]

// 系统设置项
const SystemSettings = ref<any>({
  // 基础设置
  Basic: {
    SUBSCRIBE_MODE: 'spider',
    SUBSCRIBE_SEARCH: false,
    SUBSCRIBE_SEARCH_INTERVAL: 24,
    SUBSCRIBE_RSS_INTERVAL: 30,
    LOCAL_EXISTS_SEARCH: false,
  },
})

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

// 查询用户选中的订阅站点
async function querySelectedRssSites() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/RssSites')

    selectedRssSites.value = Array.isArray(result.data?.value) ? result.data.value : []
  } catch (error) {
    console.log(error)
  }
}

// 保存用户选中的订阅站点
async function saveSelectedRssSites() {
  if (savingRssSites.value) return
  savingRssSites.value = true
  try {
    const rssSitesPayload = Array.isArray(selectedRssSites.value) ? selectedRssSites.value : []
    const result1: { [key: string]: any } = await api.post('system/setting/RssSites', rssSitesPayload)

    if (result1.success) $toast.success(t('setting.subscribe.saveSuccess'))
    else $toast.error(result1.message || t('setting.subscribe.saveFailed'))
  } catch (error) {
    console.log(error)
    $toast.error(getApiErrorMessage(error) || t('setting.subscribe.saveFailed'))
  } finally {
    savingRssSites.value = false
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
      if (!SystemSettings.value.Basic.SUBSCRIBE_MODE || SystemSettings.value.Basic.SUBSCRIBE_MODE === 'auto') {
        SystemSettings.value.Basic.SUBSCRIBE_MODE = 'spider'
      }
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

// 查询订阅设置
async function querySubscribeRules() {
  try {
    // 查询订阅规则组
    const result1: { [key: string]: any } = await api.get('system/setting/SubscribeFilterRuleGroups')
    if (result1.success) {
      selectedFilterRuleGroup.value = Array.isArray(result1.data?.value) ? result1.data.value : []
    }
    // 查询洗版规则组
    const result2: { [key: string]: any } = await api.get('system/setting/BestVersionFilterRuleGroups')
    if (result2.success) {
      selectedBestVersionRuleGroup.value = Array.isArray(result2.data?.value) ? result2.data.value : []
    }
  } catch (error) {
    console.log(error)
  }
}

// 保存订阅设置
async function saveSubscribeSetting() {
  if (savingSubscribeSetting.value) return
  savingSubscribeSetting.value = true
  try {
    const filterGroupPayload = Array.isArray(selectedFilterRuleGroup.value) ? selectedFilterRuleGroup.value : []
    const bestVersionPayload = Array.isArray(selectedBestVersionRuleGroup.value)
      ? selectedBestVersionRuleGroup.value
      : []

    const result1: { [key: string]: any } = await api.post(
      'system/setting/SubscribeFilterRuleGroups',
      filterGroupPayload,
    )

    const result2: { [key: string]: any } = await api.post(
      'system/setting/BestVersionFilterRuleGroups',
      bestVersionPayload,
    )

    const result3 = await saveSystemSetting(SystemSettings.value.Basic)

    if (result1.success && result2.success && result3) {
      $toast.success(t('setting.subscribe.settingsSaveSuccess'))
    } else $toast.error(t('setting.subscribe.settingsSaveFailed'))
  } catch (error) {
    console.log(error)
    $toast.error(getApiErrorMessage(error) || t('setting.subscribe.settingsSaveFailed'))
  } finally {
    savingSubscribeSetting.value = false
  }
}

async function loadPageData() {
  await Promise.all([
    querySites(),
    queryFilterRuleGroups(),
    querySelectedRssSites(),
    querySubscribeRules(),
    loadSystemSettings(),
  ])
}

onMounted(() => {
  loadPageData()
})

useSilentSettingRefresh(
  async () => {
    if (savingSubscribeSetting.value || savingRssSites.value) return
    await loadPageData()
  },
  {
    active: computed(() => props.active),
  },
)
</script>

<template>
  <div class="mp-setting-stack">
    <VCard id="sec-sub-basic" class="mp-setting-card">
      <VCardItem>
        <template #prepend>
          <div class="mp-setting-card__icon mp-setting-card__icon--primary">
            <VIcon icon="mdi-rss-box" size="18" />
          </div>
        </template>
        <VCardTitle>{{ t('setting.subscribe.basicSettings') }}</VCardTitle>
        <VCardSubtitle>{{ t('setting.subscribe.basicSettingsDesc') }}</VCardSubtitle>
      </VCardItem>
      <VCardText>
        <VForm>
          <VRow>
            <VCol cols="12" md="6">
              <VSelect
                v-model="SystemSettings.Basic.SUBSCRIBE_MODE"
                :items="subscribeModeItems"
                :label="t('setting.subscribe.mode')"
                :hint="t('setting.subscribe.modeHint')"
                prepend-inner-icon="mdi-cog"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VSelect
                v-model="SystemSettings.Basic.SUBSCRIBE_RSS_INTERVAL"
                :items="rssIntervalItems"
                :label="t('setting.subscribe.rssInterval')"
                :hint="t('setting.subscribe.rssIntervalHint')"
                prepend-inner-icon="mdi-timer"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VAutocomplete
                v-model="selectedFilterRuleGroup"
                :items="filterRuleGroupOptions"
                chips
                multiple
                clearable
                :label="t('setting.subscribe.filterRuleGroup')"
                :hint="t('setting.subscribe.filterRuleGroupHint')"
                prepend-inner-icon="mdi-filter"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VAutocomplete
                v-model="selectedBestVersionRuleGroup"
                :items="filterRuleGroupOptions"
                chips
                multiple
                clearable
                :label="t('setting.subscribe.bestVersionRuleGroup')"
                :hint="t('setting.subscribe.bestVersionRuleGroupHint')"
                prepend-inner-icon="mdi-star"
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="12" md="6">
              <div class="mp-switch-card" :title="t('setting.subscribe.timedSearchHint')">
                <VSwitch
                  v-model="SystemSettings.Basic.SUBSCRIBE_SEARCH"
                  :label="t('setting.subscribe.timedSearch')"
                  :hint="t('setting.subscribe.timedSearchHint')"
                  color="primary"
                  density="compact"
                  inset
                  persistent-hint
                />
              </div>
            </VCol>
            <VCol v-if="SystemSettings.Basic.SUBSCRIBE_SEARCH" cols="12" md="6">
              <VSelect
                v-model="SystemSettings.Basic.SUBSCRIBE_SEARCH_INTERVAL"
                :items="subscribeSearchIntervalItems"
                :label="t('setting.subscribe.searchInterval')"
                :hint="t('setting.subscribe.searchIntervalHint')"
                prepend-inner-icon="mdi-timer"
              />
            </VCol>
            <VCol cols="12" md="6">
              <div class="mp-switch-card" :title="t('setting.subscribe.checkLocalMediaHint')">
                <VSwitch
                  v-model="SystemSettings.Basic.LOCAL_EXISTS_SEARCH"
                  :label="t('setting.subscribe.checkLocalMedia')"
                  :hint="t('setting.subscribe.checkLocalMediaHint')"
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
          <VBtn
            type="submit"
            size="small"
            color="primary"
            variant="flat"
            rounded="lg"
            prepend-icon="mdi-content-save-outline"
            :loading="savingSubscribeSetting"
            :disabled="savingSubscribeSetting"
            class="px-4"
            @click="saveSubscribeSetting"
          >
            {{ t('common.save') }}
          </VBtn>
        </VForm>
      </VCardText>
    </VCard>

    <VCard id="sec-sub-sites" class="mp-setting-card">
      <VCardItem>
        <template #prepend>
          <div class="mp-setting-card__icon mp-setting-card__icon--info">
            <VIcon icon="mdi-access-point-network" size="18" />
          </div>
        </template>
        <VCardTitle>{{ t('setting.subscribe.subscribeSites') }}</VCardTitle>
        <VCardSubtitle>{{ t('setting.subscribe.subscribeSitesDesc') }}</VCardSubtitle>
        <template v-if="allSites.length > 0" #append>
          <div class="d-flex flex-wrap align-center justify-end gap-2">
            <span class="mp-count-pill">已选 {{ selectedRssSites.length }} / {{ allSites.length }}</span>
            <button type="button" class="mp-inline-action" @click="selectedRssSites = allSites.map(s => s.id)">
              全选
            </button>
            <button type="button" class="mp-inline-action" @click="selectedRssSites = []">清空</button>
          </div>
        </template>
      </VCardItem>
      <VCardText>
        <VChipGroup v-if="allSites.length > 0" v-model="selectedRssSites" column multiple>
          <VChip
            v-for="site in allSites"
            :key="site.id"
            :color="selectedRssSites.includes(site.id) ? 'primary' : undefined"
            :variant="selectedRssSites.includes(site.id) ? 'tonal' : 'outlined'"
            rounded="lg"
            filter
            :value="site.id"
          >
            {{ site.name }}
          </VChip>
        </VChipGroup>
        <div v-else class="mp-empty-hint">
          <VIcon icon="mdi-access-point-network-off" size="16" class="mp-empty-hint__icon" />
          <span>暂无可用站点，请先在「站点管理」中添加并启用站点</span>
        </div>

        <VForm class="mp-card-footer" @submit.prevent="() => {}">
          <VBtn
            type="submit"
            size="small"
            color="primary"
            variant="flat"
            rounded="lg"
            prepend-icon="mdi-content-save-outline"
            :loading="savingRssSites"
            :disabled="savingRssSites"
            class="px-4"
            @click="saveSelectedRssSites"
          >
            {{ t('common.save') }}
          </VBtn>
        </VForm>
      </VCardText>
    </VCard>

    <div id="sec-sub-autofill" class="mp-setting-anchor">
      <SubscribeAutoFillSetting :active="props.active" />
    </div>
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
