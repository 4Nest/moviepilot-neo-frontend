<script lang="ts" setup>
import { copyToClipboard } from '@/@core/utils/navigator'
import { innerFilterRules } from '@/api/constants'
import { CustomRule, FilterRuleGroup } from '@/api/types'
import FilterRuleCard from '@/components/cards/FilterRuleCard.vue'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useToast } from 'vue-toastification'
import { cloneDeep } from 'lodash-es'
import { useI18n } from '@/composables/useChineseText'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

// 获取i18n实例
const { t } = useI18n()

// 规则组详情弹窗内才需要拖拽和导入代码，避免规则组卡片列表首屏带入重交互依赖。
const Draggable = defineAsyncComponent(() => import('vuedraggable').then(module => module.default))
const ImportCodeDialog = defineAsyncComponent(() => import('@/components/dialog/ImportCodeDialog.vue'))

// 输入参数
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: true,
  },
  // 单个规则组
  group: {
    type: Object as PropType<FilterRuleGroup>,
    required: true,
  },
  // 所有规则组
  groups: {
    type: Array as PropType<FilterRuleGroup[]>,
    required: true,
  },
  // 媒体类型字典
  categories: {
    type: Object as PropType<{ [key: string]: any }>,
    required: true,
  },
  // 自定义规则列表
  custom_rules: Array as PropType<CustomRule[]>,
})

// 规则卡片类型
interface FilterCard {
  // 优先级
  pri: string
  // 已选规则
  rules: string[]
}

// 提示框
const $toast = useToast()

// 定义触发的自定义事件
const emit = defineEmits(['update:modelValue', 'close', 'change', 'done'])

// 规则详情弹窗
const groupInfoDialog = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

// 规则详情
const groupInfo = ref<FilterRuleGroup>({
  name: props.group?.name ?? '',
  rule_string: props.group?.rule_string ?? '',
  media_type: props.group?.media_type ?? '',
  category: props.group?.category ?? '',
})

// 媒体类型字典
const mediaTypeItems = [
  { title: t('common.all'), value: '' },
  { title: t('mediaType.movie'), value: '电影' },
  { title: t('mediaType.tv'), value: '电视剧' },
]

// 根据选中的媒体类型，获取对应的媒体类别
const getCategories = computed(() => {
  const default_value = [{ title: t('common.all'), value: '' }]
  if (!props.categories || !groupInfo.value.media_type || !props.categories[groupInfo.value.media_type]) {
    return default_value
  }
  return default_value.concat(props.categories[groupInfo.value.media_type] || [])
})

// 切换媒体类型时，若当前选中的二级分类不属于新类型则自动清空
watch(
  () => groupInfo.value.media_type,
  () => {
    if (groupInfo.value.category && !getCategories.value.some(item => item.value === groupInfo.value.category)) {
      groupInfo.value.category = ''
    }
  },
)

// 规则组规则卡片列表
const filterRuleCards = ref<FilterCard[]>([])

/** 更新指定优先级规则卡片的选中规则。 */
function updateFilterCardValue(pri: string, rules: string[]) {
  const card = filterRuleCards.value.find(card => card.pri === pri)
  if (card && Array.isArray(rules)) card.rules = rules
}

/** 移除指定优先级规则卡片并重排优先级。 */
function filterCardClose(pri: string) {
  filterRuleCards.value = filterRuleCards.value
    .filter(card => card.pri !== pri)
    .map((card, index) => {
      card.pri = (index + 1).toString()
      return card
    })
}

/** 将当前规则组规则串复制到剪贴板。 */
async function shareRules() {
  if (filterRuleCards.value.length === 0) return

  const value = filterRuleCards.value
    .filter(card => Array.isArray(card.rules) && card.rules.length > 0)
    .map(card => card.rules.join('&'))
    .join('>')

  try {
    let success
    success = copyToClipboard(value)
    if (await success) $toast.success(t('filterRule.shareSuccess'))
    else $toast.error(t('filterRule.shareFailed'))
  } catch (error) {
    $toast.error(t('filterRule.shareFailed'))
    console.error(error)
  }
}

/** 打开共享导入弹窗并导入规则串。 */
async function importRules(ruleType: string) {
  openSharedDialog(
    ImportCodeDialog,
    {
      title: t('filterRule.import'),
      dataType: ruleType,
    },
    {
      save: saveCodeString,
    },
    { closeOn: ['close', 'save'] },
  )
}

/** 将单个导入规则 token 归一化：匹配内置规则时保留内置带空格值，否则保留原自定义规则 ID。 */
function normalizeRuleToken(rawToken: string): string {
  const trimmed = rawToken.trim()
  if (!trimmed) return ''
  const innerMatch = innerFilterRules.find(opt => opt.value.trim() === trimmed)
  return innerMatch ? innerMatch.value : trimmed
}

/** 保存导入的规则代码并覆盖当前规则卡片。 */
function saveCodeString(type: string, code: any) {
  try {
    const rawCode = typeof code === 'string' ? code : code?.value
    if (type === 'priority') {
      if (!rawCode || !String(rawCode).trim()) return
      const groups = String(rawCode).split('>')
      filterRuleCards.value = groups.map((group: string, index: number) => ({
        pri: (index + 1).toString(),
        rules: group
          .split('&')
          .map(normalizeRuleToken)
          .filter(rule => rule),
      }))
    }
  } catch (error) {
    $toast.error(t('filterRule.importFailed'))
    console.error(error)
  }
}

/** 新增一个空的规则优先级卡片。 */
function addFilterCard() {
  const pri = (filterRuleCards.value.length + 1).toString()
  const newCard: FilterCard = { pri, rules: [] }
  filterRuleCards.value.push(newCard)
}

/** 根据列表的拖动顺序更新优先级。 */
function dragOrderEnd() {
  filterRuleCards.value.forEach((card, index) => {
    card.pri = (index + 1).toString()
  })
}

/** 初始化规则组编辑数据。 */
function opengroupInfoDialog() {
  groupInfo.value = cloneDeep(props.group)
  if (props.group.rule_string) {
    filterRuleCards.value = props.group.rule_string.split('>').map((group: string, index: number) => ({
      pri: (index + 1).toString(),
      rules: group.split('&').filter(rule => rule),
    }))
  }
  groupInfoDialog.value = true
}

/** 保存规则组编辑结果并通知父级刷新。 */
function saveGroupInfo() {
  if (!groupInfo.value.name.trim()) {
    $toast.error(t('filterRule.nameRequired'))
    return
  }
  if (props.groups.some(item => item.name === groupInfo.value.name && item !== props.group)) {
    $toast.error(t('filterRule.nameDuplicate'))
    return
  }

  groupInfoDialog.value = false
  groupInfo.value.rule_string = filterRuleCards.value
    .filter(card => Array.isArray(card.rules) && card.rules.length > 0)
    .map(card => card.rules.join('&'))
    .join('>')
  emit('change', groupInfo.value, props.group.name)
  emit('done')
}

/** 关闭规则组编辑弹窗。 */
function onClose() {
  emit('close')
}

onMounted(() => {
  opengroupInfoDialog()
})
</script>

<template>
  <VDialog
    v-if="groupInfoDialog"
    v-model="groupInfoDialog"
    scrollable
    max-width="76rem"
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard class="mp-dialog-card">
      <VCardItem class="mp-dialog-header">
        <template #prepend>
          <VIcon icon="mdi-filter-cog-outline" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>{{ t('filterRule.title') }}</VCardTitle>
        <VCardSubtitle>{{ props.group.name }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn v-model="groupInfoDialog" />
      <VDivider />
      <VCardText class="mp-dialog-body">
        <div class="mp-subpanel mb-4">
          <VRow class="mp-form-grid">
            <VCol cols="12" lg="4">
              <VTextField
                v-model="groupInfo.name"
                :label="t('filterRule.groupName')"
                :placeholder="t('filterRule.nameRequired')"
                hide-details
                active
                prepend-inner-icon="mdi-label"
              />
            </VCol>
            <VCol cols="12" sm="6" lg="4">
              <VAutocomplete
                v-model="groupInfo.media_type"
                :label="t('filterRule.mediaType')"
                :items="mediaTypeItems"
                hide-details
                active
                prepend-inner-icon="mdi-movie-open"
              />
            </VCol>
            <VCol cols="12" sm="6" lg="4">
              <VAutocomplete
                v-model="groupInfo.category"
                :items="getCategories"
                :label="t('filterRule.category')"
                hide-details
                active
                prepend-inner-icon="mdi-folder-open"
              />
            </VCol>
          </VRow>
        </div>

        <Draggable
          v-model="filterRuleCards"
          handle=".cursor-move"
          item-key="pri"
          tag="div"
          @end="dragOrderEnd"
          :component-data="{ 'class': 'grid gap-3 grid-filterrule-card' }"
        >
          <template #item="{ element }">
            <FilterRuleCard
              :pri="element.pri"
              :maxpri="filterRuleCards.length.toString()"
              :rules="element.rules"
              :custom_rules="props.custom_rules"
              @changed="updateFilterCardValue"
              @close="filterCardClose(element.pri)"
            />
          </template>
        </Draggable>
        <div v-if="filterRuleCards.length == 0" class="mp-empty-hint text-center text-medium-emphasis">
          {{ t('filterRule.add') }}
        </div>
      </VCardText>
      <VDivider />
      <VCardActions class="app-dialog-actions mp-dialog-footer">
        <VBtn
          color="default"
          variant="outlined"
          size="small"
          class="app-dialog-actions__icon-btn"
          @click="addFilterCard"
        >
          <VIcon icon="mdi-plus" size="18" />
        </VBtn>
        <VBtn
          color="default"
          variant="outlined"
          size="small"
          class="app-dialog-actions__icon-btn"
          @click="importRules('priority')"
        >
          <VIcon icon="mdi-import" size="18" />
        </VBtn>
        <VBtn color="default" variant="outlined" size="small" class="app-dialog-actions__icon-btn" @click="shareRules">
          <VIcon icon="mdi-share" size="18" />
        </VBtn>
        <VSpacer />
        <VBtn color="default" variant="text" size="small" @click="groupInfoDialog = false">
          {{ t('common.cancel') }}
        </VBtn>
        <VBtn color="primary" variant="flat" size="small" class="px-4" @click="saveGroupInfo">
          {{ t('common.save') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped>
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

.mp-form-grid {
  row-gap: 6px;
}

.mp-subpanel {
  border: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.1));
  border-radius: 10px;
  background: var(--mp-item-bg, rgba(var(--v-theme-on-surface), 0.025));
  padding: 14px 16px 12px;
}

.mp-empty-hint {
  border: 1px dashed var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.14));
  border-radius: 10px;
  padding: 28px 16px;
}

@media (max-width: 599.98px) {
  .mp-dialog-body {
    padding: 16px !important;
  }
}
</style>
