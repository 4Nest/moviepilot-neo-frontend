<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from '@/composables/useChineseText'
import { useSetupWizard } from '@/composables/useSetupWizard'
import api from '@/api'

const { t } = useI18n()
const { updatePreferences } = useSetupWizard()

// 个性化选项
const personalizationOptions = ref({
  excludeDolbyVision: true, // 排除杜比视界
  excludeBluray: true, // 排除蓝光原盘
})

// 预设配置 - 使用多语言
const presetConfigs = computed(() => ({
  '4k-enthusiast': {
    name: t('setupWizard.preferences.presets.4k-enthusiast.name'),
    description: t('setupWizard.preferences.presets.4k-enthusiast.description'),
    icon: 'mdi-4k',
    color: 'primary',
    ruleString:
      ' SPECSUB & 4K & 60FPS & UHD & !BLU & !DOLBY > CNSUB & 4K & 60FPS & UHD & !BLU & !DOLBY > 4K & 60FPS & UHD & !BLU & !DOLBY > SPECSUB & 4K & UHD & !BLU & !DOLBY > CNSUB & 4K & UHD & !BLU & !DOLBY > 4K & UHD & !BLU & !DOLBY > SPECSUB & 4K & !BLU & !DOLBY > CNSUB & 4K & !BLU & !DOLBY > 4K & !BLU & !DOLBY ',
  },
  'balanced': {
    name: t('setupWizard.preferences.presets.balanced.name'),
    description: t('setupWizard.preferences.presets.balanced.description'),
    icon: 'mdi-scale-unbalanced',
    color: 'success',
    ruleString:
      ' SPECSUB & 4K & !BLU & !DOLBY & !UHD & !60FPS > CNSUB & 4K & !BLU & !DOLBY & !REMUX & !60FPS > SPECSUB & 1080P & !BLU & !DOLBY & !60FPS & !UHD > CNSUB & 1080P & !BLU & !DOLBY & !UHD & !60FPS > 4K & BLU & !DOLBY & !UHD & !60FPS > 1080P & !BLU & !DOLBY & !UHD & !60FPS ',
  },
  'space-saver': {
    name: t('setupWizard.preferences.presets.space-saver.name'),
    description: t('setupWizard.preferences.presets.space-saver.description'),
    icon: 'mdi-harddisk',
    color: 'warning',
    ruleString:
      ' SPECSUB & 1080P & !BLU & !UHD & !60FPS & !DOLBY > CNSUB & 1080P & !BLU & !UHD & !60FPS & !DOLBY > 1080P & !BLU & !UHD & !60FPS & !DOLBY > !BLU & !UHD & !60FPS & !DOLBY ',
  },
  'free-priority': {
    name: t('setupWizard.preferences.presets.free-priority.name'),
    description: t('setupWizard.preferences.presets.free-priority.description'),
    icon: 'mdi-gift',
    color: 'info',
    ruleString:
      ' SPECSUB & FREE & !BLU & !DOLBY > CNSUB & FREE & !BLU & !DOLBY > FREE & !BLU & !DOLBY > !BLU & !DOLBY ',
  },
}))

// 当前选中的预设
const selectedPreset = ref('')

// 加载用户当前的规则组设置
async function loadUserFilterRuleGroups() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/UserFilterRuleGroups')
    if (result.success && result.data?.value && result.data.value.length > 0) {
      const userRuleGroups = result.data.value

      // 查找匹配的预设
      for (const [presetKey, preset] of Object.entries(presetConfigs.value)) {
        const matchingRule = userRuleGroups.find((rule: any) => rule.name === preset.name)
        if (matchingRule) {
          selectedPreset.value = presetKey

          // 分析规则字符串，判断个性化选项
          const ruleString = matchingRule.rule_string || ''
          personalizationOptions.value.excludeDolbyVision = ruleString.includes('!DOLBY')
          personalizationOptions.value.excludeBluray = ruleString.includes('!BLU')

          // 更新向导数据
          updateWizardData()
          break
        }
      }
    }
  } catch (error) {
    console.log('Load user filter rule groups failed:', error)
  }
}

// 选择预设
function selectPreset(presetKey: string) {
  if (selectedPreset.value === presetKey) {
    // 如果再次点击同一个预设，则取消选择
    selectedPreset.value = ''
    updateWizardData()
    return
  }

  selectedPreset.value = presetKey
  updateWizardData()
}

// 生成规则序列的逻辑
const generateRuleSequences = computed(() => {
  if (!selectedPreset.value) {
    return []
  }

  const preset = presetConfigs.value[selectedPreset.value as keyof typeof presetConfigs.value]
  if (!preset) {
    return []
  }

  let ruleString = preset.ruleString

  // 根据个性化选项调整规则
  if (!personalizationOptions.value.excludeDolbyVision) {
    // 移除所有 !DOLBY 条件
    ruleString = ruleString.replace(/ & !DOLBY/g, '').replace(/!DOLBY & /g, '')
  }

  if (!personalizationOptions.value.excludeBluray) {
    // 移除所有 !BLU 条件
    ruleString = ruleString.replace(/ & !BLU/g, '').replace(/!BLU & /g, '')
  }

  return [
    {
      name: preset.name,
      rule_string: ruleString,
      media_type: '',
      category: '',
    },
  ]
})

// 监听偏好变化，更新到wizardData
function updateWizardData() {
  if (updatePreferences) {
    updatePreferences(personalizationOptions.value, generateRuleSequences.value)
  }
}

// 组件挂载时加载用户设置
onMounted(() => {
  loadUserFilterRuleGroups()
})
</script>

<template>
  <div class="setup-step">
    <div class="setup-step-head">
      <h3 class="setup-step-title">{{ t('setupWizard.preferences.title') }}</h3>
      <p class="setup-step-desc">{{ t('setupWizard.preferences.description') }}</p>
    </div>

    <!-- 快速预设 -->
    <div class="setup-step-panel mb-3">
      <div class="setup-panel-head">
        <div class="setup-panel-title">
          <VIcon icon="mdi-flash-outline" size="16" class="me-1" />
          <span>{{ t('setupWizard.preferences.quickPresets') }}</span>
        </div>
        <p class="setup-panel-desc">{{ t('setupWizard.preferences.quickPresetsDesc') }}</p>
      </div>

      <div class="setup-preset-grid">
        <button
          v-for="(preset, key) in presetConfigs"
          :key="key"
          type="button"
          class="setup-preset-card"
          :class="{ 'is-selected': selectedPreset === key }"
          @click="selectPreset(key)"
        >
          <span class="setup-preset-card__icon">
            <VIcon :icon="preset.icon" size="22" :color="selectedPreset === key ? preset.color : undefined" />
          </span>
          <span class="setup-preset-card__title">{{ preset.name }}</span>
          <span class="setup-preset-card__desc">{{ preset.description }}</span>
        </button>
      </div>
    </div>

    <!-- 个性化选项 -->
    <div class="setup-step-panel">
      <div class="setup-panel-head">
        <div class="setup-panel-title">
          <VIcon icon="mdi-tune-variant" size="16" class="me-1" />
          <span>{{ t('setupWizard.preferences.personalizationOptions') }}</span>
        </div>
        <p class="setup-panel-desc">{{ t('setupWizard.preferences.personalizationOptionsDesc') }}</p>
      </div>

      <VForm @submit.prevent="() => {}">
        <VRow>
          <VCol cols="12" md="6">
            <div class="mp-switch-card" :title="t('setupWizard.preferences.excludeDolbyVisionHint')">
              <VSwitch
                v-model="personalizationOptions.excludeDolbyVision"
                :label="t('setupWizard.preferences.excludeDolbyVision')"
                :hint="t('setupWizard.preferences.excludeDolbyVisionHint')"
                color="primary"
                density="compact"
                inset
                persistent-hint
                @update:model-value="updateWizardData"
              />
            </div>
          </VCol>
          <VCol cols="12" md="6">
            <div class="mp-switch-card" :title="t('setupWizard.preferences.excludeBlurayHint')">
              <VSwitch
                v-model="personalizationOptions.excludeBluray"
                :label="t('setupWizard.preferences.excludeBluray')"
                :hint="t('setupWizard.preferences.excludeBlurayHint')"
                color="primary"
                density="compact"
                inset
                persistent-hint
                @update:model-value="updateWizardData"
              />
            </div>
          </VCol>
        </VRow>
      </VForm>
    </div>
  </div>
</template>

<style scoped>
.setup-step-head {
  margin-block-end: 16px;
}

.setup-step-title {
  margin: 0;
  color: rgb(var(--v-theme-on-surface));
  font-size: 16px;
  font-weight: 600;
  line-height: 1.35;
}

.setup-step-desc {
  margin: 4px 0 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12.5px;
  line-height: 1.45;
}

.setup-step-panel {
  padding: 16px;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.015);
}

.setup-panel-head {
  margin-block-end: 13px;
}

.setup-panel-title {
  display: flex;
  align-items: center;
  color: rgb(var(--v-theme-on-surface));
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.35;
}

.setup-panel-desc {
  margin: 3px 0 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  line-height: 1.45;
}

.setup-preset-grid {
  display: grid;
  gap: 13px;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.setup-preset-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 13px 12px;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.02);
  cursor: pointer;
  gap: 6px;
  text-align: center;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}

.setup-preset-card:hover {
  border-color: var(--mp-border-hover);
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.setup-preset-card.is-selected {
  border-color: rgba(var(--v-theme-primary), 0.65);
  background: rgba(var(--v-theme-primary), 0.08);
}

.setup-preset-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.045);
  block-size: 36px;
  color: rgba(var(--v-theme-on-surface), 0.78);
  inline-size: 36px;
}

.setup-preset-card__title {
  color: rgb(var(--v-theme-on-surface));
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.35;
}

.setup-preset-card__desc {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  line-height: 1.4;
}
</style>
