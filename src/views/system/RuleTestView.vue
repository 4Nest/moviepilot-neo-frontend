<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { requiredValidator } from '@/@validators'
import api from '@/api'
import type { ApiResponse, FilterRuleGroup, RuleTestData } from '@/api/types'
import { useI18n } from '@/composables/useChineseText'

interface PipelineStep {
  icon: string
  title: string
  value: string
  tone?: 'success' | 'warning' | 'primary'
}

interface FormValidationResult {
  valid: boolean
}

interface RuleTestFormRef {
  validate: () => Promise<FormValidationResult>
}

// 国际化
const { t } = useI18n()

// 规则测试表单引用
const ruleTestFormRef = ref<RuleTestFormRef>()

// 识别结果
const ruleTestResponse = ref<ApiResponse<RuleTestData>>()

// 名称识别表单
const ruleTestForm = reactive({
  title: '',
  subtitle: '',
  rulegroup: '',
})

// 识别按钮状态
const ruleTestLoading = ref(false)

// 识别按钮文本
const ruleTestText = ref(t('ruleTest.test'))

// 是否显示结果
const showResult = ref(false)

// 请求错误提示
const ruleTestError = ref('')

// 所有规则组列表
const filterRuleGroups = ref<FilterRuleGroup[]>([])

// 规则组加载状态
const filterRuleGroupLoading = ref(false)

// 规则组选项
const filterRuleGroupItems = computed(() => {
  return [
    { title: t('ruleTest.ruleGroupPlaceholder'), value: '' },
    ...filterRuleGroups.value.map(item => ({ title: item.name, value: item.name })),
  ]
})
const selectedRuleGroup = computed(() => filterRuleGroups.value.find(item => item.name === ruleTestForm.rulegroup))
const ruleTestData = computed(() => ruleTestResponse.value?.data)
const metaInfo = computed(() => ruleTestData.value?.meta_info)
const mediaInfo = computed(() => ruleTestData.value?.media_info)
const torrentInfo = computed(() => ruleTestData.value?.torrent_info)
const isMatched = computed(() => Boolean(ruleTestResponse.value?.success && ruleTestData.value?.matched))
const resultIcon = computed(() => (isMatched.value ? 'mdi-filter-check-outline' : 'mdi-filter-remove-outline'))
const resultColor = computed(() => (isMatched.value ? 'success' : 'warning'))
const priorityText = computed(() => {
  const priority = ruleTestData.value?.priority
  return typeof priority === 'number' ? priority.toString() : '-'
})
const hasPriority = computed(() => typeof ruleTestData.value?.priority === 'number')
const resultTitle = computed(() => {
  if (isMatched.value) return t('ruleTest.matched')
  return ruleTestResponse.value?.message || t('ruleTest.noPriorityRule')
})
const resultSubtitle = computed(() => {
  const parts = [
    mediaInfo.value?.title || metaInfo.value?.name || ruleTestForm.title,
    mediaInfo.value?.year || metaInfo.value?.year,
    metaInfo.value?.season_episode,
  ]
  return parts.filter(Boolean).join(' · ') || t('ruleTest.waitingResult')
})
const ruleCount = computed(() =>
  countRules(ruleTestData.value?.rulegroup?.rule_string || selectedRuleGroup.value?.rule_string),
)
const ruleCountLabel = computed(() => {
  const count = ruleCount.value
  if (!count) return t('ruleTest.steps.group.empty')
  return t('ruleTest.ruleCount', { count })
})
const resourceChips = computed(() => {
  return [
    mediaInfo.value?.type || metaInfo.value?.type,
    mediaInfo.value?.category,
    metaInfo.value?.resource_pix,
    metaInfo.value?.edition,
    metaInfo.value?.resource_team,
  ].filter(Boolean) as string[]
})
const pipelineSteps = computed<PipelineStep[]>(() => [
  {
    icon: 'mdi-filter-settings-outline',
    title: t('ruleTest.steps.group.title'),
    value:
      ruleTestData.value?.rulegroup_name || ruleTestForm.rulegroup
        ? `${ruleTestData.value?.rulegroup_name || ruleTestForm.rulegroup} · ${ruleCountLabel.value}`
        : '-',
    tone: 'primary',
  },
  {
    icon: 'mdi-movie-search-outline',
    title: t('ruleTest.steps.media.title'),
    value: mediaInfo.value?.title || metaInfo.value?.name || t('ruleTest.steps.media.none'),
    tone: mediaInfo.value?.title ? 'primary' : 'warning',
  },
  {
    icon: resultIcon.value,
    title: t('ruleTest.steps.filter.title'),
    value:
      ruleTestResponse.value?.message ||
      (isMatched.value ? torrentInfo.value?.title || ruleTestForm.title : t('ruleTest.steps.filter.pending')),
    tone: isMatched.value ? 'success' : 'warning',
  },
])

/** 统计规则组串中的优先级规则数量。 */
function countRules(ruleString = '') {
  return ruleString.split('>').filter(item => item.trim()).length
}

/** 加载用户过滤规则组并填充规则组选择框。 */
async function queryFilterRuleGroups() {
  try {
    filterRuleGroupLoading.value = true
    const result: { [key: string]: any } = await api.get('system/setting/UserFilterRuleGroups')
    filterRuleGroups.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  } finally {
    filterRuleGroupLoading.value = false
  }
}

/** 调用规则测试接口并刷新解析工作台。 */
async function ruleTest() {
  const validation = await ruleTestFormRef.value?.validate()
  if (!validation?.valid) return

  try {
    ruleTestLoading.value = true
    ruleTestText.value = t('ruleTest.testing')
    ruleTestError.value = ''
    showResult.value = false
    ruleTestResponse.value = await api.get<ApiResponse<RuleTestData>, ApiResponse<RuleTestData>>('system/ruletest', {
      params: {
        title: ruleTestForm.title,
        subtitle: ruleTestForm.subtitle,
        rulegroup_name: ruleTestForm.rulegroup,
      },
    })
    ruleTestText.value = t('ruleTest.testAgain')
    showResult.value = true
  } catch (error) {
    console.error(error)
    ruleTestError.value = error instanceof Error ? error.message : t('ruleTest.requestFailed')
  } finally {
    ruleTestLoading.value = false
  }
}

onMounted(() => {
  queryFilterRuleGroups()
})
</script>

<template>
  <div class="shortcut-workbench">
    <section class="shortcut-panel shortcut-input-panel">
      <VForm ref="ruleTestFormRef" validate-on="submit lazy" @submit.prevent="ruleTest">
        <div class="shortcut-form-stack">
          <VTextField
            v-model="ruleTestForm.title"
            :label="t('ruleTest.title')"
            :hint="t('ruleTest.titleHint')"
            persistent-hint
            density="compact"
            variant="outlined"
            :rules="[requiredValidator]"
            prepend-inner-icon="mdi-movie-open"
          />
          <VSelect
            v-model="ruleTestForm.rulegroup"
            :items="filterRuleGroupItems"
            :label="t('ruleTest.ruleGroup')"
            :hint="t('ruleTest.ruleGroupHint')"
            persistent-hint
            density="compact"
            variant="outlined"
            :loading="filterRuleGroupLoading"
            :rules="[requiredValidator]"
            prepend-inner-icon="mdi-filter"
          />
          <VTextarea
            v-model="ruleTestForm.subtitle"
            :label="t('ruleTest.subtitle')"
            :hint="t('ruleTest.subtitleHint')"
            persistent-hint
            density="compact"
            variant="outlined"
            rows="2"
            auto-grow
            prepend-inner-icon="mdi-subtitles"
          />

          <div class="shortcut-action-bar">
            <VBtn
              type="submit"
              color="primary"
              variant="flat"
              class="shortcut-submit-btn"
              :disabled="ruleTestLoading"
              :loading="ruleTestLoading"
            >
              <template #prepend>
                <VIcon icon="mdi-filter-check-outline" size="16" />
              </template>
              {{ ruleTestText }}
            </VBtn>
          </div>
        </div>
      </VForm>

      <VAlert
        v-if="ruleTestError"
        class="mt-3"
        density="compact"
        icon="mdi-alert-circle-outline"
        type="error"
        variant="tonal"
      >
        {{ ruleTestError }}
      </VAlert>
    </section>

    <section class="shortcut-panel shortcut-result-panel">
      <div v-if="showResult" class="result-stack">
        <div class="result-hero" :class="{ 'result-hero--matched': isMatched }">
          <div
            class="priority-badge"
            :class="{ 'priority-badge--matched': isMatched, 'priority-badge--empty': !hasPriority }"
          >
            <span class="priority-label">{{ t('ruleTest.priorityLabel') }}</span>
            <span class="priority-value">{{ priorityText }}</span>
          </div>
          <div class="min-w-0 hero-body">
            <div class="hero-heading">
              <VIcon :icon="resultIcon" :color="resultColor" size="18" />
              <span class="hero-title-text text-truncate">{{ resultTitle }}</span>
            </div>
            <div class="hero-subtitle">
              {{ resultSubtitle }}
            </div>
            <div v-if="resourceChips.length" class="hero-chips">
              <VChip
                v-for="chip in resourceChips"
                :key="chip"
                size="small"
                variant="tonal"
                class="hero-chip"
                :color="resultColor"
              >
                {{ chip }}
              </VChip>
            </div>
          </div>
        </div>

        <div class="pipeline">
          <div v-for="(step, idx) in pipelineSteps" :key="step.title" class="pipeline-step">
            <div class="pipeline-marker">
              <VIcon :icon="step.icon" :color="step.tone || 'primary'" size="16" />
              <span v-if="idx < pipelineSteps.length - 1" class="pipeline-connector" />
            </div>
            <div class="pipeline-body">
              <div class="pipeline-label">
                {{ step.title }}
              </div>
              <div class="pipeline-value">
                {{ step.value }}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="empty-state">
        <span class="empty-state__icon">
          <VIcon icon="mdi-filter-cog-outline" size="22" />
        </span>
        <div class="empty-state__text">
          {{ t('ruleTest.waitingResult') }}
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.shortcut-workbench {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
  gap: 13px;
  padding-block-start: 6px;
}

.shortcut-panel {
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: rgb(var(--v-theme-surface));
  min-inline-size: 0;
  padding: 14px 16px;
}

.shortcut-form-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.shortcut-form-stack :deep(.v-field) {
  border-radius: 8px;
  background: var(--mp-field-bg);
}

.shortcut-action-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  border-block-start: 1px solid var(--mp-border-subtle);
  margin-block-start: 2px;
  padding-block-start: 10px;
}

.shortcut-submit-btn {
  min-inline-size: 96px;
}

.result-stack {
  display: grid;
  gap: 10px;
}

.result-hero {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  gap: 13px;
  align-items: center;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: var(--mp-field-bg);
  padding: 12px;
}

.result-hero--matched {
  border-color: rgba(var(--v-theme-success), 0.3);
  background: rgba(var(--v-theme-success), 0.06);
}

.priority-badge {
  display: grid;
  min-block-size: 58px;
  place-items: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 9px;
  background: var(--mp-item-bg);
  padding: 4px;
  text-align: center;
}

.priority-badge--matched {
  border-color: rgba(var(--v-theme-success), 0.36);
  background: rgba(var(--v-theme-success), 0.12);
}

.priority-badge--empty {
  opacity: 0.72;
}

.priority-label {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11px;
  line-height: 1.2;
}

.priority-value {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 21px;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  line-height: 1.1;
}

.hero-body {
  min-inline-size: 0;
}

.hero-heading {
  display: flex;
  gap: 6px;
  align-items: center;
}

.hero-title-text {
  min-inline-size: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 14.5px;
  font-weight: 600;
  line-height: 1.3;
}

.hero-subtitle {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  margin-block-start: 4px;
}

.hero-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-block-start: 8px;
}

.hero-chip {
  block-size: 21px;
  font-size: 11.5px;
}

.pipeline {
  display: flex;
  flex-direction: column;
  padding: 12px 14px;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: var(--mp-field-bg);
}

.pipeline-step {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 10px;
}

.pipeline-marker {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-block-size: 100%;
  padding-block-start: 2px;
}

.pipeline-connector {
  flex: 1;
  inline-size: 1px;
  margin-block-start: 4px;
  background: var(--mp-border-subtle);
}

.pipeline-body {
  padding-block-end: 10px;
  min-inline-size: 0;
}

.pipeline-step:last-child .pipeline-body {
  padding-block-end: 0;
}

.pipeline-label {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11.5px;
  line-height: 1.3;
}

.pipeline-value {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 13px;
  font-weight: 500;
  line-height: 1.45;
  margin-block-start: 3px;
  overflow-wrap: anywhere;
  word-break: normal;
}

.empty-state {
  display: grid;
  min-block-size: 14rem;
  padding: 24px;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: var(--mp-field-bg);
  place-items: center;
  align-content: center;
  gap: 10px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  text-align: center;
}

.empty-state__icon {
  display: grid;
  place-items: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 9px;
  background: rgba(var(--v-theme-primary), 0.1);
  block-size: 36px;
  color: rgb(var(--v-theme-primary));
  inline-size: 36px;
}

.empty-state__text {
  font-size: 12.5px;
}

@media (max-width: 760px) {
  .shortcut-workbench {
    grid-template-columns: minmax(0, 1fr);
  }

  .hero-heading {
    flex-wrap: wrap;
  }

  .hero-title-text {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
  }
}

@media (width <= 600px) {
  .shortcut-workbench {
    gap: 10px;
    padding-block-end: env(safe-area-inset-bottom, 0px);
  }

  .shortcut-panel {
    padding: 12px;
  }

  .hero-title-text {
    font-size: 14px;
    overflow-wrap: anywhere;
    word-break: normal;
  }

  .hero-subtitle {
    overflow-wrap: anywhere;
    word-break: normal;
  }

  .pipeline {
    padding: 10px 12px;
  }
}

@media (width <= 420px) {
  .result-hero {
    grid-template-columns: minmax(0, 1fr);
  }

  .priority-badge {
    grid-auto-flow: column;
    justify-content: start;
    min-block-size: 0;
    padding: 6px 10px;
    gap: 8px;
  }

  .priority-value {
    font-size: 18px;
  }
}
</style>
