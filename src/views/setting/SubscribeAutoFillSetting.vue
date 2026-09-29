<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import { useDisplay } from 'vuetify'
import api from '@/api'
import { effectOptions, qualityOptions, resolutionOptions } from '@/api/constants'
import type { CategoryConfig, DownloaderConf, FilterRuleGroup, Site } from '@/api/types'
import { useI18n } from '@/composables/useChineseText'
import { useConfirm } from '@/composables/useConfirm'

/** 二级分类订阅规则，字段与后端 SUBSCRIBE_CATEGORY_RULE_FIELDS 对应 */
interface CategoryRule {
  id: string
  enabled: boolean
  type: '电影' | '电视剧'
  categories: string[]
  resolution?: string
  quality?: string
  effect?: string
  include?: string
  exclude?: string
  sites?: number[]
  filter_groups?: string[]
  downloader?: string
  save_path?: string
}

/** 系统设置接口响应 */
interface SettingResponse<T> {
  success?: boolean
  data?: { value?: T }
}

const props = defineProps({
  // 所在设置页是否处于激活状态，切回时重新加载
  active: { type: Boolean, default: true },
})

const { t } = useI18n()
const $toast = useToast()
const display = useDisplay()
const createConfirm = useConfirm()

const rules = ref<CategoryRule[]>([])
const backfillFields = ref<string[]>([])

const categoryConfig = ref<CategoryConfig>({})
const sites = ref<Site[]>([])
const filterRuleGroups = ref<FilterRuleGroup[]>([])
const downloaders = ref<DownloaderConf[]>([])

const typeOptions = computed(() => [
  { title: t('mediaType.movie'), value: '电影' },
  { title: t('mediaType.tv'), value: '电视剧' },
])

const backfillOptions = computed(() => [
  { title: t('setting.subscribe.autoFill.fieldResolution'), value: 'resolution' },
  { title: t('setting.subscribe.autoFill.fieldQuality'), value: 'quality' },
  { title: t('setting.subscribe.autoFill.fieldEffect'), value: 'effect' },
  { title: t('setting.subscribe.autoFill.fieldReleaseGroup'), value: 'include' },
  { title: t('setting.subscribe.autoFill.fieldSite'), value: 'sites' },
])

const siteOptions = computed(() => sites.value.map(site => ({ title: site.name, value: site.id })))
const filterRuleGroupOptions = computed(() => filterRuleGroups.value.map(g => ({ title: g.name, value: g.name })))
const downloaderOptions = computed(() => [
  { title: t('common.default'), value: '' },
  ...downloaders.value.map(d => ({ title: d.name, value: d.name })),
])

/** 当前媒体类型可选的二级分类 */
function categoryOptions(type: CategoryRule['type']): string[] {
  return Object.keys((type === '电影' ? categoryConfig.value.movie : categoryConfig.value.tv) ?? {})
}

/** 同一类型下被多条规则使用的分类：只有排在前面的规则生效 */
const shadowedCategories = computed(() => {
  const seen = new Set<string>()
  const shadowed = new Map<string, string[]>()
  for (const rule of rules.value) {
    if (!rule.enabled) continue
    for (const category of rule.categories) {
      const key = `${rule.type}:${category}`
      if (seen.has(key)) shadowed.set(rule.id, [...(shadowed.get(rule.id) ?? []), category])
      seen.add(key)
    }
  }
  return shadowed
})

/** 规则卡片上展示的覆盖项 */
function ruleTags(rule: CategoryRule): string[] {
  const labelOf = (options: { title: string; value: string }[], value?: string) =>
    options.find(option => option.value === value)?.title ?? value ?? ''
  const tags: string[] = []
  if (rule.resolution) tags.push(labelOf(resolutionOptions.value, rule.resolution))
  if (rule.quality) tags.push(labelOf(qualityOptions.value, rule.quality))
  if (rule.effect) tags.push(labelOf(effectOptions.value, rule.effect))
  if (rule.include) tags.push(`${t('setting.subscribe.autoFill.include')} ${rule.include}`)
  if (rule.exclude) tags.push(`${t('setting.subscribe.autoFill.exclude')} ${rule.exclude}`)
  rule.sites?.forEach(id => tags.push(String(sites.value.find(site => site.id === id)?.name ?? id)))
  rule.filter_groups?.forEach(group => tags.push(group))
  if (rule.downloader) tags.push(rule.downloader)
  if (rule.save_path) tags.push(rule.save_path)
  return tags
}

function newRuleId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** 去掉空值，只保存实际设置的覆盖项 */
function serializeRule(rule: CategoryRule): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(rule).filter(([, value]) => (Array.isArray(value) ? value.length : value !== '' && value != null)),
  )
}

// ===== 加载与保存 =====
async function loadSettings() {
  try {
    const [ruleResult, backfillResult] = (await Promise.all([
      api.get('system/setting/SubscribeCategoryRules'),
      api.get('system/setting/SubscribeDownloadBackfill'),
    ])) as [SettingResponse<Partial<CategoryRule>[]>, SettingResponse<string[]>]
    rules.value = (ruleResult.data?.value ?? []).map(rule => ({
      enabled: true,
      type: '电视剧',
      categories: [],
      ...rule,
      id: rule.id || newRuleId(),
    })) as CategoryRule[]
    backfillFields.value = backfillResult.data?.value ?? []
  } catch (error) {
    console.error(error)
  }
}

async function loadOptions() {
  const tasks: Promise<void>[] = [
    api.get('media/category/config').then(res => {
      categoryConfig.value = (res as { data?: CategoryConfig })?.data ?? {}
    }),
    (async () => {
      const data: Site[] = await api.get('site/rss')
      sites.value = (data ?? []).filter(site => site.is_active)
    })(),
    api.get('system/setting/UserFilterRuleGroups').then(res => {
      filterRuleGroups.value = (res as SettingResponse<FilterRuleGroup[]>)?.data?.value ?? []
    }),
    (async () => {
      const data: DownloaderConf[] = await api.get('download/clients')
      downloaders.value = data ?? []
    })(),
  ]
  await Promise.all(tasks.map(task => task.catch(error => console.error(error))))
}

/** 即时保存一项设置，失败时提示 */
async function persist(key: string, value: unknown): Promise<boolean> {
  try {
    const result = (await api.post(`system/setting/${key}`, value)) as SettingResponse<unknown>
    if (result?.success) return true
  } catch (error) {
    console.error(error)
  }
  $toast.error(t('setting.subscribe.settingsSaveFailed'))
  return false
}

function saveRules() {
  return persist('SubscribeCategoryRules', rules.value.map(serializeRule))
}

function saveBackfill(fields: string[]) {
  backfillFields.value = fields
  return persist('SubscribeDownloadBackfill', fields)
}

function toggleRule(rule: CategoryRule, enabled: boolean | null) {
  rule.enabled = Boolean(enabled)
  saveRules()
}

// ===== 编辑对话框 =====
const dialogVisible = ref(false)
// 编辑中的规则副本；确定后才写回列表，取消不影响原规则
const draft = ref<CategoryRule | null>(null)
const draftIndex = ref(-1)

function openRule(index: number) {
  draftIndex.value = index
  draft.value = JSON.parse(JSON.stringify(rules.value[index])) as CategoryRule
  dialogVisible.value = true
}

function openNewRule() {
  draftIndex.value = -1
  draft.value = { id: newRuleId(), enabled: true, type: '电视剧', categories: [] }
  dialogVisible.value = true
}

/** 切换媒体类型时清掉不属于新类型的分类 */
function onDraftTypeChange() {
  if (!draft.value) return
  const available = categoryOptions(draft.value.type)
  draft.value.categories = draft.value.categories.filter(category => available.includes(category))
}

async function confirmDraft() {
  if (!draft.value) return
  if (!draft.value.categories.length) {
    $toast.error(t('setting.subscribe.autoFill.categoryRequired'))
    return
  }
  if (draftIndex.value >= 0) rules.value.splice(draftIndex.value, 1, draft.value)
  else rules.value.push(draft.value)
  if (await saveRules()) dialogVisible.value = false
}

async function deleteDraft() {
  if (draftIndex.value < 0) {
    dialogVisible.value = false
    return
  }
  const confirmed = await createConfirm({
    title: t('common.confirm'),
    content: t('setting.subscribe.autoFill.deleteConfirm'),
    confirmText: t('common.delete'),
  })
  if (!confirmed) return
  rules.value.splice(draftIndex.value, 1)
  if (await saveRules()) dialogVisible.value = false
}

/** 调整规则顺序（同一分类以靠前的规则为准），立即生效 */
function moveDraft(offset: number) {
  const from = draftIndex.value
  const target = from + offset
  if (from < 0 || target < 0 || target >= rules.value.length) return
  const [rule] = rules.value.splice(from, 1)
  rules.value.splice(target, 0, rule)
  draftIndex.value = target
  saveRules()
}

onMounted(() => {
  loadSettings()
  loadOptions()
})

watch(
  () => props.active,
  active => {
    if (active) loadSettings()
  },
)
</script>

<template>
  <VCard>
    <VCardItem>
      <VCardTitle>{{ t('setting.subscribe.autoFill.title') }}</VCardTitle>
      <VCardSubtitle>{{ t('setting.subscribe.autoFill.desc') }}</VCardSubtitle>
    </VCardItem>

    <!-- 分类规则 -->
    <VCardText>
      <div class="auto-fill__section-head">
        <span class="auto-fill__section-title">{{ t('setting.subscribe.autoFill.categoryTitle') }}</span>
        <VTooltip :text="t('setting.subscribe.autoFill.categoryHint')" location="top" max-width="320">
          <template #activator="{ props: tip }">
            <VIcon v-bind="tip" icon="mdi-information-outline" size="16" class="auto-fill__info" />
          </template>
        </VTooltip>
      </div>

      <div class="auto-fill__grid">
        <VCard
          v-for="(rule, index) in rules"
          :key="rule.id"
          class="auto-fill__rule"
          :class="{ 'auto-fill__rule--disabled': !rule.enabled }"
          variant="flat"
          data-testid="category-rule"
          @click="openRule(index)"
        >
          <div class="auto-fill__rule-top">
            <VChip size="x-small" variant="tonal" :color="rule.type === '电影' ? 'info' : 'primary'" label>
              {{ rule.type === '电影' ? t('mediaType.movie') : t('mediaType.tv') }}
            </VChip>
            <VTooltip
              v-if="shadowedCategories.has(rule.id)"
              :text="
                t('setting.subscribe.autoFill.shadowed', { categories: shadowedCategories.get(rule.id)!.join('、') })
              "
              location="top"
              max-width="280"
            >
              <template #activator="{ props: tip }">
                <VIcon v-bind="tip" icon="mdi-alert-outline" size="16" color="warning" />
              </template>
            </VTooltip>
            <VSpacer />
            <VSwitch
              :model-value="rule.enabled"
              class="auto-fill__switch"
              density="compact"
              hide-details
              color="primary"
              @click.stop
              @update:model-value="enabled => toggleRule(rule, enabled)"
            />
          </div>
          <div class="auto-fill__rule-title">{{ rule.categories.join('、') }}</div>
          <div class="auto-fill__rule-tags">
            <span v-for="tag in ruleTags(rule)" :key="tag" class="auto-fill__tag">{{ tag }}</span>
            <span v-if="!ruleTags(rule).length" class="auto-fill__tag auto-fill__tag--empty">
              {{ t('setting.subscribe.autoFill.noOverride') }}
            </span>
          </div>
        </VCard>

        <button type="button" class="auto-fill__add" @click="openNewRule">
          <VIcon icon="mdi-plus" size="20" />
          <span>{{ t('setting.subscribe.autoFill.addRule') }}</span>
        </button>
      </div>
    </VCardText>

    <VDivider />

    <!-- 下载后回填：即时保存 -->
    <VCardText>
      <div class="auto-fill__section-head">
        <span class="auto-fill__section-title">{{ t('setting.subscribe.autoFill.backfillTitle') }}</span>
        <VTooltip :text="t('setting.subscribe.autoFill.backfillHint')" location="top" max-width="320">
          <template #activator="{ props: tip }">
            <VIcon v-bind="tip" icon="mdi-information-outline" size="16" class="auto-fill__info" />
          </template>
        </VTooltip>
      </div>
      <VChipGroup
        :model-value="backfillFields"
        column
        multiple
        class="auto-fill__backfill"
        @update:model-value="saveBackfill"
      >
        <VChip
          v-for="option in backfillOptions"
          :key="option.value"
          :value="option.value"
          :color="backfillFields.includes(option.value) ? 'primary' : ''"
          filter
          variant="outlined"
        >
          {{ option.title }}
        </VChip>
      </VChipGroup>
    </VCardText>
  </VCard>

  <!-- 规则编辑对话框 -->
  <VDialog v-model="dialogVisible" scrollable max-width="45rem" :fullscreen="!display.smAndUp.value">
    <VCard v-if="draft">
      <VCardItem>
        <VCardTitle>
          {{ draftIndex >= 0 ? t('setting.subscribe.autoFill.editRule') : t('setting.subscribe.autoFill.addRule') }}
        </VCardTitle>
      </VCardItem>
      <VDialogCloseBtn v-model="dialogVisible" />
      <VDivider />
      <VCardText>
        <VRow>
          <VCol cols="12" sm="4">
            <VSelect
              v-model="draft.type"
              :items="typeOptions"
              :label="t('setting.subscribe.autoFill.mediaType')"
              @update:model-value="onDraftTypeChange"
            />
          </VCol>
          <VCol cols="12" sm="8">
            <VAutocomplete
              v-model="draft.categories"
              :items="categoryOptions(draft.type)"
              :label="t('setting.subscribe.autoFill.categories')"
              chips
              closable-chips
              multiple
            />
          </VCol>
          <VCol cols="12" sm="4">
            <VSelect
              v-model="draft.resolution"
              :items="resolutionOptions"
              :label="t('setting.subscribe.autoFill.fieldResolution')"
              clearable
            />
          </VCol>
          <VCol cols="12" sm="4">
            <VSelect
              v-model="draft.quality"
              :items="qualityOptions"
              :label="t('setting.subscribe.autoFill.fieldQuality')"
              clearable
            />
          </VCol>
          <VCol cols="12" sm="4">
            <VSelect
              v-model="draft.effect"
              :items="effectOptions"
              :label="t('setting.subscribe.autoFill.fieldEffect')"
              clearable
            />
          </VCol>
          <VCol cols="12" sm="6">
            <VTextField
              v-model="draft.include"
              :label="t('setting.subscribe.autoFill.include')"
              :placeholder="t('setting.subscribe.autoFill.regexPlaceholder')"
              clearable
            />
          </VCol>
          <VCol cols="12" sm="6">
            <VTextField
              v-model="draft.exclude"
              :label="t('setting.subscribe.autoFill.exclude')"
              :placeholder="t('setting.subscribe.autoFill.regexPlaceholder')"
              clearable
            />
          </VCol>
          <VCol cols="12" sm="6">
            <VAutocomplete
              v-model="draft.sites"
              :items="siteOptions"
              :label="t('setting.subscribe.autoFill.fieldSite')"
              chips
              closable-chips
              multiple
              clearable
            />
          </VCol>
          <VCol cols="12" sm="6">
            <VAutocomplete
              v-model="draft.filter_groups"
              :items="filterRuleGroupOptions"
              :label="t('setting.subscribe.autoFill.filterGroups')"
              chips
              closable-chips
              multiple
              clearable
            />
          </VCol>
          <VCol cols="12" sm="4">
            <VSelect
              v-model="draft.downloader"
              :items="downloaderOptions"
              :label="t('setting.subscribe.autoFill.downloader')"
            />
          </VCol>
          <VCol cols="12" sm="8">
            <VTextField
              v-model="draft.save_path"
              :label="t('setting.subscribe.autoFill.savePath')"
              :placeholder="t('setting.subscribe.autoFill.savePathHint')"
              clearable
            />
          </VCol>
        </VRow>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <template v-if="draftIndex >= 0">
          <VBtn
            color="error"
            variant="tonal"
            class="app-dialog-actions__icon-btn"
            :aria-label="t('common.delete')"
            @click="deleteDraft"
          >
            <VIcon icon="mdi-delete" />
          </VBtn>
          <VTooltip :text="t('setting.subscribe.autoFill.moveUp')" location="top">
            <template #activator="{ props: tip }">
              <VBtn
                v-bind="tip"
                variant="tonal"
                class="app-dialog-actions__icon-btn"
                :disabled="draftIndex === 0"
                :aria-label="t('setting.subscribe.autoFill.moveUp')"
                @click="moveDraft(-1)"
              >
                <VIcon icon="mdi-arrow-up" />
              </VBtn>
            </template>
          </VTooltip>
          <VTooltip :text="t('setting.subscribe.autoFill.moveDown')" location="top">
            <template #activator="{ props: tip }">
              <VBtn
                v-bind="tip"
                variant="tonal"
                class="app-dialog-actions__icon-btn"
                :disabled="draftIndex === rules.length - 1"
                :aria-label="t('setting.subscribe.autoFill.moveDown')"
                @click="moveDraft(1)"
              >
                <VIcon icon="mdi-arrow-down" />
              </VBtn>
            </template>
          </VTooltip>
        </template>
        <VSpacer />
        <VBtn color="primary" variant="flat" prepend-icon="mdi-check" class="px-5" @click="confirmDraft">
          {{ t('common.confirm') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.auto-fill__section-head {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-block-end: 0.75rem;
}

.auto-fill__section-title {
  font-size: 1rem;
  font-weight: 500;
}

.auto-fill__info {
  cursor: help;
  opacity: 0.5;
}

/* ===== 规则卡片网格 ===== */
.auto-fill__grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
}

.auto-fill__rule {
  display: flex;
  flex-direction: column;
  padding: 0.75rem 0.875rem 0.875rem;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.03);
  cursor: pointer;
  min-block-size: 5.5rem;
  gap: 0.375rem;
  transition:
    border-color 0.15s,
    opacity 0.15s;
}

.auto-fill__rule:hover {
  border-color: rgba(var(--v-theme-primary), 0.6);
}

.auto-fill__rule--disabled {
  opacity: 0.55;
}

.auto-fill__rule-top {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.auto-fill__switch {
  flex: 0 0 auto;
}

.auto-fill__switch :deep(.v-selection-control) {
  min-block-size: auto;
}

.auto-fill__rule-title {
  overflow: hidden;
  font-size: 1rem;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.auto-fill__rule-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.auto-fill__tag {
  overflow: hidden;
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  line-height: 1.25rem;
  max-inline-size: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.auto-fill__tag--empty {
  background: none;
  padding-inline: 0;
}

/* 添加卡片：虚线框，与规则卡片同尺寸 */
.auto-fill__add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0.75rem;
  border: 1px dashed rgba(var(--v-theme-on-surface), 0.2);
  border-radius: 8px;
  background: none;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  cursor: pointer;
  font-size: 0.8125rem;
  gap: 0.25rem;
  min-block-size: 5.5rem;
  transition:
    border-color 0.15s,
    color 0.15s;
}

.auto-fill__add:hover {
  border-color: rgba(var(--v-theme-primary), 0.6);
  color: rgb(var(--v-theme-primary));
}

.auto-fill__backfill {
  padding-block: 0;
}
</style>
