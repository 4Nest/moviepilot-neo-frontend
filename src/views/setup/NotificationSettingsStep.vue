<script lang="ts" setup>
import { useI18n } from '@/composables/useChineseText'
import { useSetupWizard } from '@/composables/useSetupWizard'
import { getLogoUrl } from '@/utils/imageUtils'

const { t } = useI18n()
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
  <VCard variant="outlined">
    <VCardText>
      <div class="text-center mb-6">
        <h3 class="text-h4 mb-2">{{ t('setupWizard.notification.title') }}</h3>
        <p class="text-body-1 text-medium-emphasis">{{ t('setupWizard.notification.description') }}</p>
      </div>
      <VRow>
        <VCol cols="12">
          <VAlert type="info" variant="tonal" class="mb-4">
            <VAlertTitle>{{ t('setupWizard.notification.info') }}</VAlertTitle>
            {{ t('setupWizard.notification.infoDesc') }}
          </VAlert>
        </VCol>

        <!-- 通知选择 -->
        <VCol cols="12">
          <div class="mb-4">
            <h4 class="text-h6 mb-4">{{ t('setupWizard.notification.type') }}</h4>
            <VRow>
              <VCol cols="12" md="3">
                <VCard
                  :color="wizardData.notification.type === 'wechat' ? 'primary' : 'default'"
                  :variant="wizardData.notification.type === 'wechat' ? 'tonal' : 'outlined'"
                  class="cursor-pointer"
                  @click="selectNotification('wechat')"
                >
                  <VCardText class="text-center">
                    <VImg :src="getLogoUrl('wechat')" height="48" width="48" class="mx-auto mb-2" />
                    <div class="text-h6">企业微信</div>
                  </VCardText>
                </VCard>
              </VCol>
              <VCol cols="12" md="3">
                <VCard
                  :color="wizardData.notification.type === 'telegram' ? 'primary' : 'default'"
                  :variant="wizardData.notification.type === 'telegram' ? 'tonal' : 'outlined'"
                  class="cursor-pointer"
                  @click="selectNotification('telegram')"
                >
                  <VCardText class="text-center">
                    <VImg :src="getLogoUrl('telegram')" height="48" width="48" class="mx-auto mb-2" />
                    <div class="text-h6">Telegram</div>
                  </VCardText>
                </VCard>
              </VCol>
            </VRow>
          </div>
        </VCol>

        <!-- 通知配置 -->
        <VCol v-if="wizardData.notification.type" cols="12">
          <VCard>
            <VCardText>
              <VForm>
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
                        validationErrors.notification.WECHAT_APP_SECRET
                          ? [t('notification.wechat.appSecretRequired')]
                          : []
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
                        validationErrors.notification.TELEGRAM_CHAT_ID
                          ? [t('notification.telegram.chatIdRequired')]
                          : []
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
            </VCardText>
          </VCard>
        </VCol>
      </VRow>
    </VCardText>
  </VCard>
</template>

<style scoped>
.cursor-pointer {
  cursor: pointer;
  transition: all 0.2s ease;
}

.cursor-pointer:hover {
  transform: translateY(-2px);
}

.cursor-pointer:active {
  transform: translateY(0);
}

/* 选中状态的样式 */
.v-card--variant-tonal.v-theme--light {
  border: 2px solid rgb(var(--v-theme-primary));
  background-color: rgb(var(--v-theme-primary), 0.12);
}

.v-card--variant-tonal.v-theme--dark {
  border: 2px solid rgb(var(--v-theme-primary));
  background-color: rgb(var(--v-theme-primary), 0.2);
}
</style>
