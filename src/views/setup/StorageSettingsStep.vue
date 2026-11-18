<script lang="ts" setup>
import { useI18n } from '@/composables/useChineseText'
import { useSetupWizard } from '@/composables/useSetupWizard'

const { t } = useI18n()
const { wizardData, validateCurrentStep } = useSetupWizard()

// 验证状态
const validation = computed(() => validateCurrentStep())
const hasErrors = computed(() => !validation.value.isValid)

// 整理方式选项
const transferTypeItems = [
  { title: '硬链接', value: 'link' },
  { title: '软链接', value: 'softlink' },
  { title: '复制', value: 'copy' },
  { title: '移动', value: 'move' },
]

// 覆盖模式选项
const overwriteModeItems = [
  { title: '从不覆盖', value: 'never' },
  { title: '总是覆盖', value: 'always' },
  { title: '按文件大小', value: 'size' },
  { title: '仅保留最新', value: 'latest' },
]
</script>

<template>
  <div class="setup-step">
    <div class="setup-step-head">
      <h3 class="setup-step-title">{{ t('setupWizard.storage.title') }}</h3>
      <p class="setup-step-desc">{{ t('setupWizard.storage.description') }}</p>
    </div>

    <VAlert type="info" variant="tonal" density="compact" class="setup-step-alert mb-3">
      <div class="setup-step-alert__title">{{ t('setupWizard.storage.info') }}</div>
      <div class="setup-step-alert__desc">{{ t('setupWizard.storage.infoDesc') }}</div>
    </VAlert>

    <div class="setup-step-panel">
      <VForm @submit.prevent="() => {}">
        <VRow>
          <VCol cols="12" md="6">
            <VPathField
              v-model="wizardData.storage.downloadPath"
              :label="t('setupWizard.storage.downloadPath')"
              :hint="t('setupWizard.storage.downloadPathHint')"
              persistent-hint
              prepend-inner-icon="mdi-download"
              placeholder="/downloads"
              :error="!wizardData.storage.downloadPath && hasErrors"
              :error-messages="
                !wizardData.storage.downloadPath && hasErrors ? [t('setupWizard.storage.downloadPathRequired')] : []
              "
            />
          </VCol>
          <VCol cols="12" md="6">
            <VPathField
              v-model="wizardData.storage.libraryPath"
              :label="t('setupWizard.storage.libraryPath')"
              :hint="t('setupWizard.storage.libraryPathHint')"
              persistent-hint
              prepend-inner-icon="mdi-folder-multiple"
              placeholder="/media"
              :error="!wizardData.storage.libraryPath && hasErrors"
              :error-messages="
                !wizardData.storage.libraryPath && hasErrors ? [t('setupWizard.storage.libraryPathRequired')] : []
              "
            />
          </VCol>
          <VCol cols="12" md="6">
            <VSelect
              v-model="wizardData.storage.transferType"
              :label="t('directory.transferType')"
              :hint="t('directory.transferTypeHint')"
              persistent-hint
              :items="transferTypeItems"
              prepend-inner-icon="mdi-swap-horizontal"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VSelect
              v-model="wizardData.storage.overwriteMode"
              :label="t('directory.overwriteMode')"
              :hint="t('directory.overwriteModeHint')"
              persistent-hint
              :items="overwriteModeItems"
              prepend-inner-icon="mdi-file-replace"
            />
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

.setup-step-alert__title {
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.35;
}

.setup-step-alert__desc {
  font-size: 12.5px;
  line-height: 1.45;
}

.setup-step-panel {
  padding: 16px;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.015);
}
</style>
