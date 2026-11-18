<script lang="ts" setup>
import { useTheme } from 'vuetify'
import { useI18n } from '@/composables/useChineseText'
import { useSetupWizard } from '@/composables/useSetupWizard'
import { getLogoUrl } from '@/utils/imageUtils'

const { t } = useI18n()
const { global: globalTheme } = useTheme()
const isDark = computed(() => Boolean(globalTheme?.current?.value?.dark))
const { wizardData, selectDownloader, validationErrors } = useSetupWizard()
</script>

<template>
  <div class="setup-step">
    <div class="setup-step-head">
      <h3 class="setup-step-title">{{ t('setupWizard.downloader.title') }}</h3>
      <p class="setup-step-desc">{{ t('setupWizard.downloader.description') }}</p>
    </div>

    <VAlert type="info" variant="tonal" density="compact" class="setup-step-alert mb-3">
      <div class="setup-step-alert__title">{{ t('setupWizard.downloader.info') }}</div>
      <div class="setup-step-alert__desc">{{ t('setupWizard.downloader.infoDesc') }}</div>
    </VAlert>

    <!-- 下载器选择 -->
    <div class="setup-section">
      <div class="setup-section__label">{{ t('setupWizard.downloader.type') }}</div>
      <div class="setup-choice-grid setup-choice-grid--3">
        <button
          v-for="item in [
            { type: 'qbittorrent', label: 'qBittorrent' },
            { type: 'transmission', label: 'Transmission' },
            { type: 'rtorrent', label: 'rTorrent' },
          ]"
          :key="item.type"
          type="button"
          class="setup-choice-card"
          :class="{ 'is-selected': wizardData.downloader.type === item.type }"
          @click="selectDownloader(item.type)"
        >
          <span class="setup-choice-card__logo" :class="{ 'setup-choice-card__logo--dark': isDark }" aria-hidden="true">
            <VImg
              :src="getLogoUrl(item.type)"
              height="36"
              width="36"
              :max-width="36"
              :max-height="36"
              contain
              class="mx-auto flex-grow-0 flex-shrink-0"
            />
          </span>
          <span class="setup-choice-card__title">{{ item.label }}</span>
        </button>
      </div>
    </div>

    <!-- 下载器配置 -->
    <div v-if="wizardData.downloader.type" class="setup-step-panel mt-3">
      <VForm @submit.prevent="() => {}">
        <VRow v-if="wizardData.downloader.type === 'qbittorrent'">
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.downloader.name"
              :label="t('downloader.name')"
              :placeholder="t('downloader.nameRequired')"
              :hint="t('downloader.name')"
              :error="validationErrors.downloader.name"
              :error-messages="validationErrors.downloader.name ? [t('downloader.nameRequired')] : []"
              persistent-hint
              active
              prepend-inner-icon="mdi-label"
              required
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.downloader.config.host"
              :label="t('downloader.host')"
              placeholder="http(s)://ip:port"
              :hint="t('downloader.host')"
              :error="validationErrors.downloader.host"
              :error-messages="validationErrors.downloader.host ? [t('downloader.hostRequired')] : []"
              persistent-hint
              active
              prepend-inner-icon="mdi-server"
              required
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.downloader.config.apikey"
              type="password"
              :label="t('downloader.apiKey')"
              :hint="t('downloader.qbittorrentApiKeyHint')"
              persistent-hint
              active
              prepend-inner-icon="mdi-key-variant"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.downloader.config.username"
              :label="t('downloader.username')"
              :hint="t('downloader.username')"
              :error="validationErrors.downloader.username"
              :error-messages="validationErrors.downloader.username ? [t('downloader.usernameRequired')] : []"
              :disabled="!!wizardData.downloader.config.apikey"
              persistent-hint
              active
              prepend-inner-icon="mdi-account"
              :required="!wizardData.downloader.config.apikey"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.downloader.config.password"
              type="password"
              :label="t('downloader.password')"
              :hint="t('downloader.password')"
              :error="validationErrors.downloader.password"
              :error-messages="validationErrors.downloader.password ? [t('downloader.passwordRequired')] : []"
              :disabled="!!wizardData.downloader.config.apikey"
              persistent-hint
              active
              prepend-inner-icon="mdi-lock"
              :required="!wizardData.downloader.config.apikey"
            />
          </VCol>
          <VCol cols="12" sm="4">
            <div class="mp-switch-card" :title="t('downloader.sequentail')">
              <VSwitch
                v-model="wizardData.downloader.config.sequentail"
                :label="t('downloader.sequentail')"
                :hint="t('downloader.sequentail')"
                color="primary"
                density="compact"
                inset
                persistent-hint
              />
            </div>
          </VCol>
          <VCol cols="12" sm="4">
            <div class="mp-switch-card" :title="t('downloader.force_resume')">
              <VSwitch
                v-model="wizardData.downloader.config.force_resume"
                :label="t('downloader.force_resume')"
                :hint="t('downloader.force_resume')"
                color="primary"
                density="compact"
                inset
                persistent-hint
              />
            </div>
          </VCol>
          <VCol cols="12" sm="4">
            <div class="mp-switch-card" :title="t('downloader.first_last_piece')">
              <VSwitch
                v-model="wizardData.downloader.config.first_last_piece"
                :label="t('downloader.first_last_piece')"
                :hint="t('downloader.first_last_piece')"
                color="primary"
                density="compact"
                inset
                persistent-hint
              />
            </div>
          </VCol>
        </VRow>
        <VRow v-else-if="wizardData.downloader.type === 'transmission'">
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.downloader.name"
              :label="t('downloader.name')"
              :placeholder="t('downloader.nameRequired')"
              :hint="t('downloader.name')"
              :error="validationErrors.downloader.name"
              :error-messages="validationErrors.downloader.name ? [t('downloader.nameRequired')] : []"
              persistent-hint
              active
              prepend-inner-icon="mdi-label"
              required
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.downloader.config.host"
              :label="t('downloader.host')"
              placeholder="http(s)://ip:port"
              :hint="t('downloader.host')"
              :error="validationErrors.downloader.host"
              :error-messages="validationErrors.downloader.host ? [t('downloader.hostRequired')] : []"
              persistent-hint
              active
              prepend-inner-icon="mdi-server"
              required
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.downloader.config.username"
              :label="t('downloader.username')"
              :hint="t('downloader.username')"
              :error="validationErrors.downloader.username"
              :error-messages="validationErrors.downloader.username ? [t('downloader.usernameRequired')] : []"
              persistent-hint
              active
              prepend-inner-icon="mdi-account"
              required
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.downloader.config.password"
              type="password"
              :label="t('downloader.password')"
              :hint="t('downloader.password')"
              :error="validationErrors.downloader.password"
              :error-messages="validationErrors.downloader.password ? [t('downloader.passwordRequired')] : []"
              persistent-hint
              active
              prepend-inner-icon="mdi-lock"
              required
            />
          </VCol>
        </VRow>
        <VRow v-else-if="wizardData.downloader.type === 'rtorrent'">
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.downloader.name"
              :label="t('downloader.name')"
              :placeholder="t('downloader.nameRequired')"
              :hint="t('downloader.name')"
              :error="validationErrors.downloader.name"
              :error-messages="validationErrors.downloader.name ? [t('downloader.nameRequired')] : []"
              persistent-hint
              active
              prepend-inner-icon="mdi-label"
              required
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.downloader.config.host"
              :label="t('downloader.host')"
              placeholder="http(s)://ip:port/RPC2"
              :hint="t('downloader.rtorrentHostHint')"
              :error="validationErrors.downloader.host"
              :error-messages="validationErrors.downloader.host ? [t('downloader.hostRequired')] : []"
              persistent-hint
              active
              prepend-inner-icon="mdi-server"
              required
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.downloader.config.username"
              :label="t('downloader.username')"
              :hint="t('downloader.username')"
              :error="validationErrors.downloader.username"
              :error-messages="validationErrors.downloader.username ? [t('downloader.usernameRequired')] : []"
              persistent-hint
              active
              prepend-inner-icon="mdi-account"
              required
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.downloader.config.password"
              type="password"
              :label="t('downloader.password')"
              :hint="t('downloader.password')"
              :error="validationErrors.downloader.password"
              :error-messages="validationErrors.downloader.password ? [t('downloader.passwordRequired')] : []"
              persistent-hint
              active
              prepend-inner-icon="mdi-lock"
              required
            />
          </VCol>
        </VRow>
        <VRow v-else>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.downloader.type"
              :label="t('downloader.type')"
              :hint="t('downloader.customTypeHint')"
              persistent-hint
              active
              prepend-inner-icon="mdi-cog"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.downloader.name"
              :label="t('downloader.name')"
              :hint="t('downloader.nameRequired')"
              persistent-hint
              active
              prepend-inner-icon="mdi-label"
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

.setup-section__label {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 13.5px;
  font-weight: 600;
  margin-block-end: 10px;
}

.setup-choice-grid {
  display: grid;
  gap: 13px;
}

.setup-choice-grid--3 {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.setup-choice-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 13px;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.02);
  cursor: pointer;
  gap: 8px;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}

.setup-choice-card:hover {
  border-color: var(--mp-border-hover);
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.setup-choice-card.is-selected {
  border-color: rgba(var(--v-theme-primary), 0.65);
  background: rgba(var(--v-theme-primary), 0.08);
}

.setup-choice-card__logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.03);
  block-size: 46px;
  inline-size: 46px;
}

.setup-choice-card__logo--dark {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.085);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.setup-choice-card__title {
  color: rgb(var(--v-theme-on-surface));
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.35;
}

.setup-step-panel {
  padding: 16px;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.015);
}
</style>
