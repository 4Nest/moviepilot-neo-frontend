<script lang="ts" setup>
import { useTheme } from 'vuetify'
import { useI18n } from '@/composables/useChineseText'
import { useSetupWizard } from '@/composables/useSetupWizard'
import { getLogoUrl } from '@/utils/imageUtils'

const { t } = useI18n()
const { global: globalTheme } = useTheme()
const isDark = computed(() => Boolean(globalTheme?.current?.value?.dark))
const { wizardData, selectNotification, validationErrors } = useSetupWizard()

// 消息类型下拉字典
const notificationTypes = [
  { value: '资源下载', title: t('notificationSwitch.resourceDownload') },
  { value: '整理入库', title: t('notificationSwitch.organize') },
  { value: '订阅', title: t('notificationSwitch.subscribe') },
  { value: '站点', title: t('notificationSwitch.site') },
  { value: '媒体服务器', title: t('notificationSwitch.mediaServer') },
  { value: '手动处理', title: t('notificationSwitch.manual') },
  { value: '插件', title: t('notificationSwitch.plugin') },
  { value: '其它', title: t('notificationSwitch.other') },
]
</script>

<template>
  <div class="setup-step">
    <div class="setup-step-head">
      <h3 class="setup-step-title">{{ t('setupWizard.notification.title') }}</h3>
      <p class="setup-step-desc">{{ t('setupWizard.notification.description') }}</p>
    </div>

    <VAlert type="info" variant="tonal" density="compact" class="setup-step-alert mb-3">
      <div class="setup-step-alert__title">{{ t('setupWizard.notification.info') }}</div>
      <div class="setup-step-alert__desc">{{ t('setupWizard.notification.infoDesc') }}</div>
    </VAlert>

    <!-- 通知选择 -->
    <div class="setup-section">
      <div class="setup-section__label">{{ t('setupWizard.notification.type') }}</div>
      <div class="setup-choice-grid setup-choice-grid--2">
        <button
          v-for="ch in [
            { type: 'wechat', label: '企业微信' },
            { type: 'telegram', label: 'Telegram' },
          ] as const"
          :key="ch.type"
          type="button"
          class="setup-choice-card"
          :class="{ 'is-selected': wizardData.notification.type === ch.type }"
          @click="selectNotification(ch.type)"
        >
          <span class="setup-choice-card__logo" :class="{ 'setup-choice-card__logo--dark': isDark }" aria-hidden="true">
            <VImg
              :src="getLogoUrl(ch.type)"
              height="36"
              width="36"
              :max-width="36"
              :max-height="36"
              contain
              class="mx-auto flex-grow-0 flex-shrink-0"
            />
          </span>
          <span class="setup-choice-card__title">{{ ch.label }}</span>
        </button>
      </div>
    </div>

    <!-- 通知配置 -->
    <div v-if="wizardData.notification.type" class="setup-step-panel mt-3">
      <VForm @submit.prevent="() => {}">
        <VRow>
          <VCol cols="12">
            <VAutocomplete
              v-model="wizardData.notification.switchs"
              :items="notificationTypes"
              :label="t('notification.type')"
              :hint="t('notification.typeHint')"
              multiple
              clearable
              chips
              persistent-hint
              prepend-inner-icon="mdi-bell-outline"
            />
          </VCol>
        </VRow>
        <VRow v-if="wizardData.notification.type === 'wechat'">
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.notification.name"
              :label="t('notification.name')"
              :placeholder="t('notification.name')"
              :hint="t('notification.nameHint')"
              :error="validationErrors.notification.name"
              :error-messages="validationErrors.notification.name ? [t('notification.nameRequired')] : []"
              persistent-hint
              prepend-inner-icon="mdi-label"
              required
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.notification.config.WECHAT_CORPID"
              :label="t('notification.wechat.corpId')"
              :hint="t('notification.wechat.corpIdHint')"
              :error="validationErrors.notification.WECHAT_CORPID"
              :error-messages="
                validationErrors.notification.WECHAT_CORPID ? [t('notification.wechat.corpIdRequired')] : []
              "
              persistent-hint
              prepend-inner-icon="mdi-domain"
              required
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.notification.config.WECHAT_APP_ID"
              :label="t('notification.wechat.appId')"
              :hint="t('notification.wechat.appIdHint')"
              :error="validationErrors.notification.WECHAT_APP_ID"
              :error-messages="
                validationErrors.notification.WECHAT_APP_ID ? [t('notification.wechat.appIdRequired')] : []
              "
              persistent-hint
              prepend-inner-icon="mdi-application"
              required
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.notification.config.WECHAT_APP_SECRET"
              :label="t('notification.wechat.appSecret')"
              :hint="t('notification.wechat.appSecretHint')"
              :error="validationErrors.notification.WECHAT_APP_SECRET"
              :error-messages="
                validationErrors.notification.WECHAT_APP_SECRET ? [t('notification.wechat.appSecretRequired')] : []
              "
              persistent-hint
              prepend-inner-icon="mdi-key"
              required
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.notification.config.WECHAT_PROXY"
              :label="t('notification.wechat.proxy')"
              :hint="t('notification.wechat.proxyHint')"
              persistent-hint
              prepend-inner-icon="mdi-server-network"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.notification.config.WECHAT_TOKEN"
              :label="t('notification.wechat.token')"
              :hint="t('notification.wechat.tokenHint')"
              persistent-hint
              prepend-inner-icon="mdi-key-variant"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.notification.config.WECHAT_ENCODING_AESKEY"
              :label="t('notification.wechat.encodingAesKey')"
              :hint="t('notification.wechat.encodingAesKeyHint')"
              persistent-hint
              prepend-inner-icon="mdi-lock"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.notification.config.WECHAT_ADMINS"
              :label="t('notification.wechat.admins')"
              :placeholder="t('notification.wechat.adminsPlaceholder')"
              :hint="t('notification.wechat.adminsHint')"
              persistent-hint
              prepend-inner-icon="mdi-account-supervisor"
            />
          </VCol>
        </VRow>
        <VRow v-else-if="wizardData.notification.type === 'telegram'">
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.notification.name"
              :label="t('notification.name')"
              :placeholder="t('notification.name')"
              :hint="t('notification.nameHint')"
              :error="validationErrors.notification.name"
              :error-messages="validationErrors.notification.name ? [t('notification.nameRequired')] : []"
              persistent-hint
              prepend-inner-icon="mdi-label"
              required
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.notification.config.TELEGRAM_TOKEN"
              :label="t('notification.telegram.token')"
              :hint="t('notification.telegram.tokenHint')"
              :error="validationErrors.notification.TELEGRAM_TOKEN"
              :error-messages="
                validationErrors.notification.TELEGRAM_TOKEN ? [t('notification.telegram.tokenRequired')] : []
              "
              persistent-hint
              prepend-inner-icon="mdi-key"
              required
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.notification.config.TELEGRAM_CHAT_ID"
              :label="t('notification.telegram.chatId')"
              :hint="t('notification.telegram.chatIdHint')"
              :error="validationErrors.notification.TELEGRAM_CHAT_ID"
              :error-messages="
                validationErrors.notification.TELEGRAM_CHAT_ID ? [t('notification.telegram.chatIdRequired')] : []
              "
              persistent-hint
              prepend-inner-icon="mdi-chat"
              required
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.notification.config.TELEGRAM_USERS"
              :label="t('notification.telegram.users')"
              :placeholder="t('notification.telegram.usersPlaceholder')"
              :hint="t('notification.telegram.usersHint')"
              persistent-hint
              prepend-inner-icon="mdi-account-group"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.notification.config.TELEGRAM_ADMINS"
              :label="t('notification.telegram.admins')"
              :placeholder="t('notification.telegram.adminsPlaceholder')"
              :hint="t('notification.telegram.adminsHint')"
              persistent-hint
              prepend-inner-icon="mdi-account-supervisor"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.notification.config.API_URL"
              :label="t('notification.telegram.apiUrl')"
              :placeholder="t('notification.telegram.apiUrlPlaceholder')"
              :hint="t('notification.telegram.apiUrlHint')"
              persistent-hint
              prepend-inner-icon="mdi-web"
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

.setup-choice-grid--2 {
  grid-template-columns: repeat(auto-fill, minmax(160px, 220px));
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
