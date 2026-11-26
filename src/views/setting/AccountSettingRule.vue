<!-- eslint-disable sonarjs/no-duplicate-string -->
<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import { copyToClipboard } from '@/@core/utils/navigator'
import api, { getApiErrorMessage } from '@/api'
import { CustomRule, FilterRuleGroup } from '@/api/types'
import CustomerRuleCard from '@/components/cards/CustomRuleCard.vue'
import FilterRuleGroupCard from '@/components/cards/FilterRuleGroupCard.vue'
import { useI18n } from '@/composables/useChineseText'
import { useConfirm } from '@/composables/useConfirm'
import { useSilentSettingRefresh } from '@/composables/useSilentSettingRefresh'
import { openSharedDialog } from '@/composables/useSharedDialog'

// 国际化
const { t } = useI18n()

const props = defineProps({
  active: {
    type: Boolean,
    default: true,
  },
})

// 拖拽库和导入弹窗只在规则编辑交互中需要，拆出设置页入口 chunk。
const Draggable = defineAsyncComponent(() => import('vuedraggable').then(module => module.default))
const ImportCodeDialog = defineAsyncComponent(() => import('@/components/dialog/ImportCodeDialog.vue'))

// 自定义规则列表
const customRules = ref<CustomRule[]>([])

// 所有规则组列表
const filterRuleGroups = ref<FilterRuleGroup[]>([])

// 为规则组提供不随改名漂移的稳定渲染键，弹窗保存替换对象时继承原键
const filterRuleGroupKeys = new WeakMap<FilterRuleGroup, string>()
let filterRuleGroupKeySeed = 0
function getFilterRuleGroupKey(group: FilterRuleGroup): string {
  const existing = filterRuleGroupKeys.get(group)
  if (existing) return existing
  filterRuleGroupKeySeed += 1
  const nextKey = `rule-group-${filterRuleGroupKeySeed}`
  filterRuleGroupKeys.set(group, nextKey)
  return nextKey
}

// 种子优先规则
const selectedTorrentPriority = ref<string[]>(['seeder'])

// 二级分类策略
const mediaCategories = ref<{ [key: string]: any }>({})

// 提示框与确认框
const $toast = useToast()
const createConfirm = useConfirm()

// 各卡片独立的保存加载锁
const savingCustomRules = ref(false)
const savingRuleGroups = ref(false)
const savingTorrentPriority = ref(false)

// 种子优先规则下拉框
const TorrentPriorityItems = [
  { title: t('setting.rule.resourcePriority'), value: 'torrent' },
  { title: t('setting.rule.sitePriority'), value: 'site' },
  { title: t('setting.rule.siteUpload'), value: 'upload' },
  { title: t('setting.rule.resourceSeeder'), value: 'seeder' },
]

// 调用API查询自动分类配置
async function loadMediaCategories() {
  try {
    mediaCategories.value = await api.get('media/category')
  } catch (error) {
    console.log(error)
  }
}

// 保存自定义规则
async function saveCustomRules() {
  if (savingCustomRules.value) return
  // 检查是否存在空id规则
  if (customRules.value.some(item => !item.id)) {
    $toast.error(t('setting.rule.emptyIdError'))
    return
  }
  // 检查是否存在空的规则名称
  if (customRules.value.some(item => !item.name)) {
    $toast.error(t('setting.rule.emptyNameError'))
    return
  }
  // 获取所有规则ID和名称
  const ids = customRules.value.map(item => item.id)
  const names = customRules.value.map(item => item.name)
  // 检查是否存在重名的规则ID
  if (new Set(ids).size !== ids.length) {
    $toast.error(t('setting.rule.duplicateIdError'))
    return
  }
  // 检查是否存在重名规则名称
  if (new Set(names).size !== names.length) {
    $toast.error(t('setting.rule.duplicateNameError'))
    return
  }
  savingCustomRules.value = true
  try {
    const result: { [key: string]: any } = await api.post('system/setting/CustomFilterRules', customRules.value)
    if (result.success) $toast.success(t('setting.rule.customRuleSaveSuccess'))
    else $toast.error(result.message || t('setting.rule.customRuleSaveFailed'))
  } catch (error) {
    console.log(error)
    $toast.error(getApiErrorMessage(error) || t('setting.rule.customRuleSaveFailed'))
  } finally {
    savingCustomRules.value = false
  }
}

// 添加自定义规则
async function addCustomRule() {
  let id = `RULE${customRules.value.length + 1}`
  while (customRules.value.some(item => item.id === id)) {
    id = `RULE${parseInt(id.split('RULE')[1]) + 1}`
  }
  let name = `规则${customRules.value.length + 1}`
  while (customRules.value.some(item => item.name === name)) {
    name = `规则${parseInt(name.split('规则')[1]) + 1}`
  }
  customRules.value.push({
    id: id,
    name: name,
  })
}

// 移除自定义规则
function removeCustomRule(rule: CustomRule) {
  const index = customRules.value.findIndex(item => item.id === rule.id)
  if (index !== -1) customRules.value.splice(index, 1)
}

// 加载规则组
async function queryFilterRuleGroups() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/UserFilterRuleGroups')
    filterRuleGroups.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 保存规则组
async function saveFilterRuleGroups() {
  if (savingRuleGroups.value) return
  // 检查是否存在空的规则组名称
  if (filterRuleGroups.value.some(item => !item.name)) {
    $toast.error(t('setting.rule.emptyGroupNameError'))
    return
  }
  // 检查是否存在重名规则组
  const names = filterRuleGroups.value.map(item => item.name)
  if (new Set(names).size !== names.length) {
    $toast.error(t('setting.rule.duplicateGroupNameError'))
    return
  }
  savingRuleGroups.value = true
  try {
    const result: { [key: string]: any } = await api.post('system/setting/UserFilterRuleGroups', filterRuleGroups.value)
    if (result.success) $toast.success(t('setting.rule.ruleGroupSaveSuccess'))
    else $toast.error(result.message || t('setting.rule.ruleGroupSaveFailed'))
  } catch (error) {
    console.log(error)
    $toast.error(getApiErrorMessage(error) || t('setting.rule.ruleGroupSaveFailed'))
  } finally {
    savingRuleGroups.value = false
  }
}

// 添加规则组
function addFilterRuleGroup() {
  let name = `规则组${filterRuleGroups.value.length + 1}`
  while (filterRuleGroups.value.some(item => item.name === name)) {
    name = `规则组${parseInt(name.split('规则组')[1]) + 1}`
  }
  filterRuleGroups.value.push({
    name: name,
    media_type: '',
    category: '',
  })
}

// 分享规则
async function shareRules(rules: CustomRule[] | FilterRuleGroup[], type: string) {
  if (!rules || rules.length === 0) return

  // 将卡片规则接装为字符串
  const value = JSON.stringify(rules)

  // 复制到剪贴板
  try {
    let success
    success = copyToClipboard(value)
    if (await success)
      $toast.success(
        type === 'custom' ? t('setting.rule.customRuleCopySuccess') : t('setting.rule.ruleGroupCopySuccess'),
      )
    else
      $toast.error(type === 'custom' ? t('setting.rule.customRuleCopyFailed') : t('setting.rule.ruleGroupCopyFailed'))
  } catch (e) {
    $toast.error(type === 'custom' ? t('setting.rule.customRuleCopyError') : t('setting.rule.ruleGroupCopyError'))
    console.error(e)
  }
}

// 打开弹窗
async function importRules(ruleType: string) {
  openSharedDialog(
    ImportCodeDialog,
    {
      title: ruleType === 'custom' ? t('setting.rule.importCustomRules') : t('setting.rule.importRuleGroups'),
      dataType: ruleType,
    },
    {
      save: saveCodeString,
    },
    { closeOn: ['close', 'save'] },
  )
}

// 保存导入的代码
function saveCodeString(type: string, codeString: any) {
  // codeString从子组件传递过来，从对象转换为JSON
  let parsedCode
  try {
    parsedCode = JSON.parse(codeString.value)
  } catch (e) {
    $toast.error(t('setting.rule.importFailed'))
    console.error(e)
    return
  }

  // 更新数据（过滤与存量项重名/重复ID的冲突项并提示）
  try {
    if (type === 'custom') {
      if (!checkValueValidity(parsedCode, type)) return false
      const newCustomRules = extractCustomRules(parsedCode) || []
      const existingIds = new Set(customRules.value.map(item => item.id))
      const existingNames = new Set(customRules.value.map(item => item.name))
      const filteredRules: CustomRule[] = []
      let skippedCount = 0

      for (const rule of newCustomRules) {
        if (!rule.id || !rule.name || existingIds.has(rule.id) || existingNames.has(rule.name)) {
          skippedCount += 1
          continue
        }
        existingIds.add(rule.id)
        existingNames.add(rule.name)
        filteredRules.push(rule)
      }

      customRules.value = [...customRules.value, ...filteredRules]
      if (skippedCount > 0) {
        const msg = `已过滤 ${skippedCount} 条与现有规则 ID 或名称冲突的规则`
        if (typeof $toast.warning === 'function') $toast.warning(msg)
        else $toast.error(msg)
      }
    } else if (type === 'group') {
      if (!checkValueValidity(parsedCode, type)) return false
      const newFilterRuleGroups = extractFilterRuleGroups(parsedCode) || []
      const existingNames = new Set(filterRuleGroups.value.map(item => item.name))
      const filteredGroups: FilterRuleGroup[] = []
      let skippedCount = 0

      for (const group of newFilterRuleGroups) {
        if (!group.name || existingNames.has(group.name)) {
          skippedCount += 1
          continue
        }
        existingNames.add(group.name)
        filteredGroups.push(group)
      }

      filterRuleGroups.value = [...filterRuleGroups.value, ...filteredGroups]
      if (skippedCount > 0) {
        const msg = `已过滤 ${skippedCount} 条与现有规则组重名的冲突项`
        if (typeof $toast.warning === 'function') $toast.warning(msg)
        else $toast.error(msg)
      }
    } else {
      $toast.error(t('setting.rule.importUnknownType'))
    }
  } catch (e) {
    $toast.error(t('setting.rule.importFailed'))
    console.error(e)
  }
}

// 赋值自定义规则，避免存在多余的属性
function extractCustomRules(value: any) {
  try {
    return value.map((item: any) => {
      return {
        id: item.id,
        name: item.name,
        include: item.include,
        exclude: item.exclude,
        size_range: item.size_range,
        seeders: item.seeders,
        publish_time: item.publish_time,
      }
    })
  } catch (e) {
    console.error(e)
  }
}

// 赋值规则组，避免存在多余的属性
function extractFilterRuleGroups(value: any) {
  try {
    return value.map((item: any) => {
      return {
        name: item.name,
        rule_string: item.rule_string,
        media_type: item.media_type,
        category: item.category,
      }
    })
  } catch (e) {
    console.error(e)
  }
}

// 根据ID简单区分规则与规则组
function checkValueValidity(values: any, type: string): boolean {
  try {
    if (!values) return true
    if (!type) return false

    for (const value of values) {
      if (!isValidValue(value, type)) return false
    }
    return true
  } catch (e) {
    console.error(e)
    return false
  }
}

function isValidValue(value: any, type: string): boolean {
  const keys = Object.keys(value)
  const uniqueKeys = new Set(keys)
  const hasName = keys.includes('name')
  const hasId = keys.includes('id')
  const noDuplicates = keys.length === uniqueKeys.size

  if (type === 'custom') {
    return validateCustomRule(hasName, hasId, noDuplicates)
  } else if (type === 'group') {
    return validateGroupRule(hasName, hasId, noDuplicates)
  } else {
    console.error(`传入了不合法的类型！`)
    return false
  }
}

function validateCustomRule(hasName: boolean, hasId: boolean, noDuplicates: boolean): boolean {
  if (!hasName || !hasId || !noDuplicates) {
    if (!noDuplicates) $toast.warning(t('setting.rule.duplicateValue'))
    if (!hasId) $toast.error(t('setting.rule.importNoId'))
    return false
  }
  return true
}

function validateGroupRule(hasName: boolean, hasId: boolean, noDuplicates: boolean): boolean {
  if (!hasName || hasId || !noDuplicates) {
    if (!noDuplicates) $toast.warning(t('setting.rule.duplicateValue'))
    if (hasId) $toast.error(t('setting.rule.importHasId'))
    return false
  }
  return true
}

// 清空规则（组）
async function deleteAllRules(dataType: string) {
  if (!dataType) return
  if (dataType !== 'custom' && dataType !== 'group') {
    console.error(`传入了不支持的类型！`)
    return
  }
  const confirmed = await createConfirm({
    type: 'warn',
    title: t('common.confirm'),
    content: dataType === 'custom' ? '确定要清空全部自定义过滤规则吗？' : '确定要清空全部优先级规则组吗？',
  })
  if (!confirmed) return

  if (dataType === 'custom') {
    customRules.value = []
  } else {
    filterRuleGroups.value = []
  }
}

// 规则变化时赋值
function onRuleChange(rule: CustomRule, id: string) {
  const index = customRules.value.findIndex(item => item.id === id)
  if (index !== -1) customRules.value[index] = rule
}

// 移除规则组
function removeFilterRuleGroup(rule: FilterRuleGroup) {
  const index = filterRuleGroups.value.findIndex(item => item.name === rule.name)
  if (index !== -1) filterRuleGroups.value.splice(index, 1)
}

// 规则组变化时赋值（继承原对象的 WeakMap 键，防止改名后组件卸载重挂载）
function changeRuleGroup(group: FilterRuleGroup, name: string) {
  const index = filterRuleGroups.value.findIndex(item => item.name === name)
  if (index !== -1) {
    const prevKey = getFilterRuleGroupKey(filterRuleGroups.value[index])
    filterRuleGroupKeys.set(group, prevKey)
    filterRuleGroups.value[index] = group
  }
}

// 查询种子优先规则
async function queryTorrentPriority() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/TorrentsPriority')

    selectedTorrentPriority.value = Array.isArray(result.data?.value) ? result.data.value : []
  } catch (error) {
    console.log(error)
  }
}

// 查询自定义规则项
async function queryCustomRules() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/CustomFilterRules')
    customRules.value = Array.isArray(result.data?.value) ? result.data.value : []
  } catch (error) {
    console.log(error)
  }
}

// 保存种子优先规则
async function saveTorrentPriority() {
  if (savingTorrentPriority.value) return
  savingTorrentPriority.value = true
  try {
    const priorityPayload = Array.isArray(selectedTorrentPriority.value) ? selectedTorrentPriority.value : []
    const result: { [key: string]: any } = await api.post('system/setting/TorrentsPriority', priorityPayload)
    if (result.success) $toast.success('优先规则保存成功')
    else $toast.error(result.message || '优先规则保存失败！')
  } catch (error) {
    console.log(error)
    $toast.error(getApiErrorMessage(error) || '优先规则保存失败！')
  } finally {
    savingTorrentPriority.value = false
  }
}

async function loadPageData() {
  await Promise.all([loadMediaCategories(), queryCustomRules(), queryFilterRuleGroups(), queryTorrentPriority()])
}

// 加载数据
onMounted(() => {
  loadPageData()
})

useSilentSettingRefresh(
  async () => {
    if (savingCustomRules.value || savingRuleGroups.value || savingTorrentPriority.value) return
    await loadPageData()
  },
  {
    active: computed(() => props.active),
  },
)
</script>

<template>
  <div class="mp-setting-stack">
    <VCard id="sec-rule-custom" class="mp-setting-card">
      <VCardItem>
        <template #prepend>
          <div class="mp-setting-card__icon mp-setting-card__icon--primary">
            <VIcon icon="mdi-tune-variant" size="18" />
          </div>
        </template>
        <VCardTitle class="d-flex align-center gap-2">
          <span>{{ t('setting.rule.customRules') }}</span>
          <span v-if="customRules.length > 0" class="mp-count-pill">{{ customRules.length }}</span>
        </VCardTitle>
        <VCardSubtitle>{{ t('setting.rule.customRulesDesc') }}</VCardSubtitle>
        <template #append>
          <div class="rule-card-actions">
            <VBtn
              size="small"
              color="secondary"
              variant="outlined"
              rounded="lg"
              prepend-icon="mdi-plus"
              @click="addCustomRule"
            >
              添加规则
            </VBtn>
            <VBtn icon size="small" variant="text" class="rule-more-btn" :aria-label="t('common.moreActions')">
              <VIcon icon="mdi-dots-horizontal" size="18" />
              <VMenu activator="parent" location="bottom end" close-on-content-click>
                <VList density="compact" class="rule-action-menu">
                  <VListItem prepend-icon="mdi-import" @click="importRules('custom')">
                    <VListItemTitle>{{ t('common.import') }}</VListItemTitle>
                  </VListItem>
                  <VListItem
                    prepend-icon="mdi-share-variant-outline"
                    :disabled="!customRules.length"
                    @click="shareRules(customRules, 'custom')"
                  >
                    <VListItemTitle>{{ t('common.share') }}</VListItemTitle>
                  </VListItem>
                  <VDivider class="my-1" />
                  <VListItem
                    prepend-icon="mdi-delete-sweep-outline"
                    base-color="error"
                    :disabled="!customRules.length"
                    @click="deleteAllRules('custom')"
                  >
                    <VListItemTitle>{{ t('common.clear') }}</VListItemTitle>
                  </VListItem>
                </VList>
              </VMenu>
            </VBtn>
          </div>
        </template>
      </VCardItem>
      <VCardText>
        <Draggable
          v-if="customRules.length"
          v-model="customRules"
          handle=".cursor-move"
          item-key="id"
          tag="div"
          :component-data="{ 'class': 'grid gap-3 grid-customrule-card' }"
        >
          <template #item="{ element }">
            <CustomerRuleCard
              :rule="element"
              :rules="customRules"
              @close="removeCustomRule(element)"
              @change="onRuleChange"
            />
          </template>
        </Draggable>
        <div v-else class="rule-empty-state mp-empty-hint">
          <VIcon icon="mdi-tune-variant" size="16" class="rule-empty-state__icon" />
          <span>暂未添加自定义过滤规则，可点击右上角新增或</span>
          <button type="button" class="rule-empty-state__link" @click="importRules('custom')">从剪贴板导入</button>
        </div>

        <VForm class="mp-card-footer" @submit.prevent="() => {}">
          <VBtn
            type="submit"
            size="small"
            color="primary"
            variant="flat"
            rounded="lg"
            prepend-icon="mdi-content-save-outline"
            :loading="savingCustomRules"
            :disabled="savingCustomRules"
            class="px-4"
            @click="saveCustomRules"
          >
            {{ t('common.save') }}
          </VBtn>
        </VForm>
      </VCardText>
    </VCard>

    <VCard id="sec-rule-groups" class="mp-setting-card">
      <VCardItem>
        <template #prepend>
          <div class="mp-setting-card__icon mp-setting-card__icon--info">
            <VIcon icon="mdi-layers-triple-outline" size="18" />
          </div>
        </template>
        <VCardTitle class="d-flex align-center gap-2">
          <span>{{ t('setting.rule.priorityRuleGroups') }}</span>
          <span v-if="filterRuleGroups.length > 0" class="mp-count-pill">{{ filterRuleGroups.length }}</span>
        </VCardTitle>
        <VCardSubtitle>{{ t('setting.rule.priorityRuleGroupsDesc') }}</VCardSubtitle>
        <template #append>
          <div class="rule-card-actions">
            <VBtn
              size="small"
              color="secondary"
              variant="outlined"
              rounded="lg"
              prepend-icon="mdi-plus"
              @click="addFilterRuleGroup"
            >
              添加规则组
            </VBtn>
            <VBtn icon size="small" variant="text" class="rule-more-btn" :aria-label="t('common.moreActions')">
              <VIcon icon="mdi-dots-horizontal" size="18" />
              <VMenu activator="parent" location="bottom end" close-on-content-click>
                <VList density="compact" class="rule-action-menu">
                  <VListItem prepend-icon="mdi-import" @click="importRules('group')">
                    <VListItemTitle>{{ t('common.import') }}</VListItemTitle>
                  </VListItem>
                  <VListItem
                    prepend-icon="mdi-share-variant-outline"
                    :disabled="!filterRuleGroups.length"
                    @click="shareRules(filterRuleGroups, 'group')"
                  >
                    <VListItemTitle>{{ t('common.share') }}</VListItemTitle>
                  </VListItem>
                  <VDivider class="my-1" />
                  <VListItem
                    prepend-icon="mdi-delete-sweep-outline"
                    base-color="error"
                    :disabled="!filterRuleGroups.length"
                    @click="deleteAllRules('group')"
                  >
                    <VListItemTitle>{{ t('common.clear') }}</VListItemTitle>
                  </VListItem>
                </VList>
              </VMenu>
            </VBtn>
          </div>
        </template>
      </VCardItem>
      <VCardText>
        <Draggable
          v-if="filterRuleGroups.length"
          v-model="filterRuleGroups"
          handle=".cursor-move"
          :item-key="getFilterRuleGroupKey"
          tag="div"
          :component-data="{ 'class': 'grid gap-3 grid-app-card' }"
        >
          <template #item="{ element }">
            <FilterRuleGroupCard
              :group="element"
              :groups="filterRuleGroups"
              :custom_rules="customRules"
              :categories="mediaCategories"
              @close="removeFilterRuleGroup(element)"
              @change="changeRuleGroup"
            />
          </template>
        </Draggable>
        <div v-else class="rule-empty-state mp-empty-hint">
          <VIcon icon="mdi-filter-cog-outline" size="16" class="rule-empty-state__icon" />
          <span>暂未配置优先级规则组，可点击右上角新增或</span>
          <button type="button" class="rule-empty-state__link" @click="importRules('group')">从剪贴板导入</button>
        </div>

        <VForm class="mp-card-footer" @submit.prevent="() => {}">
          <VBtn
            type="submit"
            size="small"
            color="primary"
            variant="flat"
            rounded="lg"
            prepend-icon="mdi-content-save-outline"
            :loading="savingRuleGroups"
            :disabled="savingRuleGroups"
            class="px-4"
            @click="saveFilterRuleGroups"
          >
            {{ t('common.save') }}
          </VBtn>
        </VForm>
      </VCardText>
    </VCard>

    <VCard id="sec-rule-priority" class="mp-setting-card">
      <VCardItem>
        <template #prepend>
          <div class="mp-setting-card__icon mp-setting-card__icon--warning">
            <VIcon icon="mdi-sort-ascending" size="18" />
          </div>
        </template>
        <VCardTitle>{{ t('setting.rule.downloadRules') }}</VCardTitle>
        <VCardSubtitle>{{ t('setting.rule.downloadRulesDesc') }}</VCardSubtitle>
      </VCardItem>
      <VCardText>
        <VForm>
          <VRow>
            <VCol cols="12" md="6">
              <VSelect
                v-model="selectedTorrentPriority"
                :items="TorrentPriorityItems"
                multiple
                clearable
                chips
                :label="t('setting.rule.currentPriorityRules')"
                :hint="t('setting.rule.currentPriorityRulesHint')"
                prepend-inner-icon="mdi-priority-high"
              />
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
            :loading="savingTorrentPriority"
            :disabled="savingTorrentPriority"
            class="px-4"
            @click="saveTorrentPriority"
          >
            {{ t('common.save') }}
          </VBtn>
        </VForm>
      </VCardText>
    </VCard>
  </div>
</template>

<style scoped>
.rule-card-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.rule-more-btn {
  border: 1px solid var(--mp-border-subtle);
  border-radius: 7px !important;
  block-size: 28px !important;
  color: rgba(var(--v-theme-on-surface), 0.72) !important;
  inline-size: 28px !important;
}

.rule-more-btn:hover {
  border-color: var(--mp-border-hover);
  background: var(--mp-item-bg);
  color: rgb(var(--v-theme-on-surface)) !important;
}

.rule-action-menu {
  min-inline-size: 9.5rem;
}

.rule-empty-state {
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

.rule-empty-state__icon {
  color: rgba(var(--v-theme-on-surface), 0.45);
}

.rule-empty-state__link {
  padding: 0;
  border: 0;
  background: transparent;
  color: rgb(var(--v-theme-primary));
  cursor: pointer;
  font-size: inherit;
  font-weight: 500;
  text-decoration: none;
}

.rule-empty-state__link:hover {
  text-decoration: underline;
}
</style>
