<script lang="ts" setup>
import { onMounted } from 'vue'
import { useI18n } from '@/composables/useChineseText'
import { useRouter } from 'vue-router'
import { useSetupWizard } from '@/composables/useSetupWizard'
import BasicSettingsStep from '@/views/setup/BasicSettingsStep.vue'
import SiteAuthSettingsStep from '@/views/setup/SiteAuthSettingsStep.vue'
import StorageSettingsStep from '@/views/setup/StorageSettingsStep.vue'
import DownloaderSettingsStep from '@/views/setup/DownloaderSettingsStep.vue'
import MediaServerSettingsStep from '@/views/setup/MediaServerSettingsStep.vue'
import NotificationSettingsStep from '@/views/setup/NotificationSettingsStep.vue'

import PreferencesSettingsStep from '@/views/setup/PreferencesSettingsStep.vue'
import ConnectivityTest from '@/views/setup/ConnectivityTest.vue'
import { useDisplay } from 'vuetify'

const { t } = useI18n()
const router = useRouter()

// 显示器宽度
const display = useDisplay()

const {
  currentStep,
  totalSteps,
  stepTitles,
  connectivityTest,
  nextStep,
  prevStep,
  completeWizard,
  initialize,
  isLoading,
  isSavingStep,
} = useSetupWizard()

// 初始化
onMounted(async () => {
  await initialize()
})
</script>

<template>
  <div class="setup-wizard-fullscreen">
    <!-- 全屏头部 -->
    <header class="setup-wizard-header">
      <div class="setup-wizard-header__inner">
        <div
          class="setup-wizard-header__spacer"
          :class="{ 'setup-wizard-header__spacer--compact': !display.mdAndUp.value }"
        ></div>

        <!-- 中间标题 -->
        <div class="setup-wizard-header__copy">
          <h1 class="setup-wizard-header__title text-moviepilot">{{ t('setupWizard.title') }}</h1>
          <p class="setup-wizard-header__subtitle">{{ t('setupWizard.subtitle') }}</p>
        </div>

        <!-- 右侧按钮组（移动端保留关闭按钮，避免被困在全屏向导） -->
        <div class="setup-wizard-header__actions">
          <VBtn
            v-if="display.mdAndUp.value"
            variant="text"
            icon="mdi-cog-outline"
            size="small"
            rounded="lg"
            :aria-label="t('app.settings')"
            class="setup-wizard-icon-btn text-medium-emphasis"
            @click="router.push('/setting')"
          />
          <VBtn
            variant="text"
            icon="mdi-close"
            size="small"
            rounded="lg"
            :aria-label="t('common.close')"
            class="setup-wizard-icon-btn"
            @click="router.push('/')"
          />
        </div>
      </div>
    </header>

    <!-- 向导内容 -->
    <div class="setup-wizard-container">
      <VCard max-width="820px" class="setup-wizard-card mx-auto">
        <VCardText class="pa-0">
          <!-- 加载状态 -->
          <div v-if="isLoading" class="setup-wizard-loading">
            <VProgressCircular indeterminate color="primary" size="36" width="3" />
            <p class="setup-wizard-loading__text">{{ t('setupWizard.loading') }}</p>
          </div>

          <!-- 使用 VStepper 组件 -->
          <VStepper
            v-else
            v-model="currentStep"
            class="setup-stepper elevation-0"
            flat
            alt-labels
            :mobile="display.smAndDown.value"
          >
            <!-- 步骤标题 -->
            <VStepperHeader class="setup-stepper__header elevation-0">
              <template v-for="(step, index) in stepTitles" :key="index">
                <VStepperItem
                  :value="index + 1"
                  :complete="currentStep > index + 1"
                  :color="currentStep >= index + 1 ? 'primary' : 'default'"
                  complete-icon="mdi-check-circle"
                >
                  <template #title>
                    <span class="setup-stepper__label">{{ step }}</span>
                  </template>
                </VStepperItem>
                <VDivider v-if="index < stepTitles.length - 1" />
              </template>
            </VStepperHeader>

            <!-- 步骤内容 -->
            <VStepperWindow class="setup-stepper__window">
              <!-- 步骤1：基础参数 -->
              <VStepperWindowItem :value="1">
                <BasicSettingsStep />
              </VStepperWindowItem>

              <!-- 步骤2：用户认证 -->
              <VStepperWindowItem :value="2">
                <SiteAuthSettingsStep />
              </VStepperWindowItem>

              <!-- 步骤3：存储目录 -->
              <VStepperWindowItem :value="3">
                <StorageSettingsStep />
              </VStepperWindowItem>

              <!-- 步骤4：下载器 -->
              <VStepperWindowItem :value="4">
                <DownloaderSettingsStep />
              </VStepperWindowItem>

              <!-- 步骤5：媒体服务器 -->
              <VStepperWindowItem :value="5">
                <MediaServerSettingsStep />
              </VStepperWindowItem>

              <!-- 步骤6：通知 -->
              <VStepperWindowItem :value="6">
                <NotificationSettingsStep />
              </VStepperWindowItem>

              <!-- 步骤7：资源偏好 -->
              <VStepperWindowItem :value="7">
                <PreferencesSettingsStep />
              </VStepperWindowItem>
            </VStepperWindow>

            <!-- 连通性测试进度条 -->
            <ConnectivityTest />

            <!-- 操作按钮（32px 黄金比例） -->
            <footer class="setup-wizard-footer">
              <div class="d-flex align-center gap-2">
                <VBtn
                  v-if="currentStep !== 1"
                  size="small"
                  color="secondary"
                  variant="outlined"
                  rounded="lg"
                  prepend-icon="mdi-chevron-left"
                  class="setup-wizard-btn"
                  :loading="isSavingStep"
                  :disabled="connectivityTest.isTesting || isSavingStep"
                  @click="prevStep"
                >
                  {{ t('common.previous') }}
                </VBtn>
              </div>

              <div class="d-flex align-center gap-2">
                <VBtn
                  v-if="currentStep < totalSteps"
                  size="small"
                  color="primary"
                  variant="flat"
                  rounded="lg"
                  append-icon="mdi-chevron-right"
                  class="setup-wizard-btn px-4"
                  :loading="isSavingStep"
                  :disabled="connectivityTest.isTesting || isSavingStep"
                  @click="nextStep"
                >
                  {{ connectivityTest.isTesting ? t('setupWizard.testing') : t('common.next') }}
                </VBtn>
                <VBtn
                  v-else
                  size="small"
                  color="success"
                  variant="flat"
                  rounded="lg"
                  prepend-icon="mdi-check"
                  class="setup-wizard-btn px-4"
                  :loading="isSavingStep"
                  :disabled="connectivityTest.isTesting || isSavingStep"
                  @click="completeWizard"
                >
                  {{ t('setupWizard.complete') }}
                </VBtn>
              </div>
            </footer>
          </VStepper>
        </VCardText>
      </VCard>
    </div>
  </div>
</template>

<style scoped>
.setup-wizard-fullscreen {
  position: fixed;
  background-color: rgb(var(--v-theme-background));
  inset: 0;
  overflow-y: auto;
}

.setup-wizard-header {
  position: sticky;
  z-index: 2000;
  background-color: rgb(var(--v-theme-surface));
  border-block-end: 1px solid var(--mp-border-subtle);
  inset-block-start: 0;
  padding-block: calc(13px + env(safe-area-inset-top, 0px)) 13px;
  padding-inline: 21px;
}

.setup-wizard-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-inline: auto;
  max-inline-size: 1120px;
}

.setup-wizard-header__spacer {
  flex: 0 0 72px;
  inline-size: 72px;
}

.setup-wizard-header__spacer--compact {
  flex-basis: 32px;
  inline-size: 32px;
}

.setup-wizard-header__copy {
  text-align: center;
}

.setup-wizard-header__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.35;
}

.setup-wizard-header__subtitle {
  margin: 2px 0 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12.5px;
  line-height: 1.45;
}

.setup-wizard-header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.setup-wizard-icon-btn {
  block-size: 32px !important;
  inline-size: 32px !important;
}

.setup-wizard-container {
  padding: 21px 13px 34px;
}

.setup-wizard-card {
  border: 1px solid var(--mp-border-card);
  border-radius: 12px;
}

.setup-wizard-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 13px;
  padding-block: 48px;
}

.setup-wizard-loading__text {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 13px;
}

.setup-stepper__header {
  border-block-end: 1px solid var(--mp-border-subtle);
}

.setup-stepper__label {
  font-size: 12px;
  font-weight: 500;
}

.setup-stepper__window {
  margin: 21px !important;
}

.setup-wizard-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 21px;
  border-block-start: 1px solid var(--mp-border-subtle);
  gap: 13px;
}

.setup-wizard-btn {
  block-size: 32px !important;
}

@media (width <= 600px) {
  .setup-wizard-header {
    padding-block: calc(10px + env(safe-area-inset-top, 0px)) 10px;
    padding-inline: 12px;
  }

  .setup-wizard-header__inner {
    gap: 10px;
  }

  .setup-wizard-header__spacer {
    display: none;
  }

  .setup-wizard-header__copy {
    flex: 1 1 auto;
    min-inline-size: 0;
    text-align: start;
  }

  .setup-wizard-header__title {
    font-size: 15px;
    overflow-wrap: anywhere;
    word-break: normal;
  }

  .setup-wizard-header__subtitle {
    font-size: 11.5px;
    overflow-wrap: anywhere;
    word-break: normal;
  }

  .setup-wizard-container {
    padding: 12px 12px calc(24px + env(safe-area-inset-bottom, 0px));
  }

  .setup-wizard-card {
    border-radius: 10px;
  }

  .setup-stepper__header {
    overflow-x: auto;
    scrollbar-width: none;
  }

  .setup-stepper__header::-webkit-scrollbar {
    display: none;
  }

  .setup-stepper__window {
    margin: 12px !important;
  }

  .setup-wizard-footer {
    flex-wrap: wrap;
    gap: 8px;
    padding: 10px 12px;
  }
}
</style>
