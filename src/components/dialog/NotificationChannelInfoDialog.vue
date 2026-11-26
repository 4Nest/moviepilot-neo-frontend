<script setup lang="ts">
import api, { getApiErrorMessage } from '@/api'
import type { ApiResponse, NotificationConf } from '@/api/types'
import { useToast } from 'vue-toastification'
import { cloneDeep } from 'lodash-es'
import { useI18n } from '@/composables/useChineseText'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

const { t } = useI18n()

// 定义输入
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: true,
  },
  // 单个通知
  notification: {
    type: Object as PropType<NotificationConf>,
    required: true,
  },
  // 所有通知
  notifications: {
    type: Array as PropType<NotificationConf[]>,
    required: true,
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['update:modelValue', 'close', 'change', 'done'])

// 提示框
const $toast = useToast()
const testing = ref(false)

/** 提取后端校验或发送失败原因。 */
function getErrorMessage(error: unknown): string {
  return getApiErrorMessage(error) || t('setting.notification.testFailed')
}

/** 使用弹窗内尚未保存的配置发送真实测试消息。 */
async function testNotification() {
  ensureWechatConfigDefaults(notificationInfo.value)
  testing.value = true
  try {
    const result = (await api.post('system/notification/test', notificationInfo.value)) as ApiResponse
    if (result.success) $toast.success(result.message || t('setting.notification.testSuccess'))
    else $toast.error(result.message || t('setting.notification.testFailed'))
  } catch (error) {
    $toast.error(getErrorMessage(error))
  } finally {
    testing.value = false
  }
}

// 通知详情弹窗
const notificationInfoDialog = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

// 通知详情
const notificationInfo = ref<NotificationConf>({
  name: '',
  type: 'telegram',
  enabled: false,
  config: {},
})

const appPushManualPanel = ref<string>()
const appPushRotating = ref(false)
const appPushCanRotate = computed(() => {
  const saved = props.notifications.find(item => item.id === notificationInfo.value.id)
  return Boolean(
    saved?.enabled &&
    saved.type === 'apppush' &&
    saved.name === notificationInfo.value.name &&
    !saved.config?.PUSH_RELAY_KEY &&
    !notificationInfo.value.config?.PUSH_RELAY_KEY &&
    String(saved.config?.PUSH_SERVER_URL || '').trim() ===
      String(notificationInfo.value.config?.PUSH_SERVER_URL || '').trim(),
  )
})

/** 仅为已保存的渠道发起轮换，草稿地址和手工密钥不会进入此请求。 */
async function rotateAppPush() {
  if (!appPushCanRotate.value) return
  appPushRotating.value = true
  try {
    const result = (await api.post('notification/app/instance', {
      action: 'rotate',
      source: notificationInfo.value.name,
    })) as ApiResponse
    if (result.success) $toast.success(t('notification.apppush.rotated'))
    else $toast.error(result.message || t('notification.apppush.rotateFailed'))
  } catch (error) {
    $toast.error(getApiErrorMessage(error) || t('notification.apppush.rotateFailed'))
  } finally {
    appPushRotating.value = false
  }
}

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

/** 补齐企业微信通知的默认配置。 */
function ensureWechatConfigDefaults(notification: NotificationConf) {
  if (notification.type !== 'wechat') {
    return
  }
  if (!notification.config) {
    notification.config = {}
  }
  if (!notification.config.WECHAT_MODE) {
    notification.config.WECHAT_MODE = 'app'
  }
  if (!notification.config.WECHAT_BOT_WS_URL) {
    notification.config.WECHAT_BOT_WS_URL = 'wss://openws.work.weixin.qq.com'
  }
}

const isWechatBotMode = computed({
  get: () => notificationInfo.value.config?.WECHAT_MODE === 'bot',
  set: value => {
    if (!notificationInfo.value.config) {
      notificationInfo.value.config = {}
    }
    notificationInfo.value.config.WECHAT_MODE = value ? 'bot' : 'app'
    if (value && !notificationInfo.value.config.WECHAT_BOT_WS_URL) {
      notificationInfo.value.config.WECHAT_BOT_WS_URL = 'wss://openws.work.weixin.qq.com'
    }
  },
})

/** 初始化通知渠道编辑数据。 */
function openNotificationInfoDialog() {
  notificationInfo.value = cloneDeep(props.notification)
  appPushManualPanel.value = notificationInfo.value.config?.PUSH_RELAY_KEY ? 'manual' : undefined
  ensureWechatConfigDefaults(notificationInfo.value)
  notificationInfoDialog.value = true
}

/** 保存通知渠道编辑结果并通知父级刷新。 */
function saveNotificationInfo() {
  // 为空不保存，跳出警告框
  if (!notificationInfo.value.name) {
    $toast.error(t('notification.name') + t('common.required'))
    return
  }
  // 重名判断
  if (props.notifications.some(item => item.name === notificationInfo.value.name && item !== props.notification)) {
    $toast.error(t('notification.channel') + `【${notificationInfo.value.name}】` + t('common.exists'))
    return
  }
  ensureWechatConfigDefaults(notificationInfo.value)
  notificationInfoDialog.value = false
  emit('change', notificationInfo.value, props.notification.name)
  emit('done')
}

onMounted(() => {
  openNotificationInfoDialog()
})
</script>

<template>
  <VDialog
    v-if="notificationInfoDialog"
    v-model="notificationInfoDialog"
    scrollable
    max-width="44rem"
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard class="mp-dialog-card">
      <VCardItem class="mp-dialog-header">
        <template #prepend>
          <VIcon icon="mdi-bell-cog-outline" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>{{ t('common.config') }}</VCardTitle>
        <VCardSubtitle>{{ props.notification.name }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn v-model="notificationInfoDialog" />
      <VDivider />
      <VCardText class="mp-dialog-body">
        <VForm class="mp-form-sections">
          <!-- 状态与通知类型分组卡片 -->
          <section class="mp-form-section">
            <div class="mp-settings-card">
              <div class="mp-setting-row">
                <VSwitch
                  v-model="notificationInfo.enabled"
                  :label="t('notification.enabled')"
                  color="primary"
                  inset
                  density="compact"
                  hide-details
                />
              </div>
              <div class="mp-setting-subpanel">
                <VAutocomplete
                  v-model="notificationInfo.switchs"
                  :items="notificationTypes"
                  :label="t('notification.type')"
                  :hint="t('notification.typeHint')"
                  multiple
                  clearable
                  chips
                  prepend-inner-icon="mdi-bell-outline"
                />
              </div>
            </div>
          </section>

          <template v-if="notificationInfo.type == 'wechat'">
            <section class="mp-form-section">
              <div class="mp-settings-card">
                <div class="mp-setting-row" :title="t('notification.wechat.useBotModeHint')">
                  <VSwitch
                    v-model="isWechatBotMode"
                    :label="t('notification.wechat.useBotMode')"
                    hide-details
                    color="primary"
                    inset
                    density="compact"
                  />
                </div>
              </div>
            </section>

            <section class="mp-form-section">
              <VRow class="mp-form-grid">
                <VCol cols="12" sm="6">
                  <VTextField
                    v-model="notificationInfo.name"
                    :label="t('notification.name')"
                    :placeholder="t('notification.name')"
                    :hint="t('notification.nameHint')"
                    prepend-inner-icon="mdi-label"
                  />
                </VCol>
                <template v-if="isWechatBotMode">
                  <VCol cols="12" sm="6">
                    <VTextField
                      v-model="notificationInfo.config.WECHAT_BOT_ID"
                      :label="t('notification.wechat.botId')"
                      :hint="t('notification.wechat.botIdHint')"
                      prepend-inner-icon="mdi-robot"
                    />
                  </VCol>
                  <VCol cols="12" sm="6">
                    <VTextField
                      v-model="notificationInfo.config.WECHAT_BOT_SECRET"
                      type="password"
                      :label="t('notification.wechat.botSecret')"
                      :hint="t('notification.wechat.botSecretHint')"
                      prepend-inner-icon="mdi-key"
                    />
                  </VCol>
                  <VCol cols="12" sm="6">
                    <VTextField
                      v-model="notificationInfo.config.WECHAT_BOT_CHAT_ID"
                      :label="t('notification.wechat.botChatId')"
                      :placeholder="t('notification.wechat.botChatIdPlaceholder')"
                      :hint="t('notification.wechat.botChatIdHint')"
                      prepend-inner-icon="mdi-chat-processing"
                    />
                  </VCol>
                  <VCol cols="12" sm="6">
                    <VTextField
                      v-model="notificationInfo.config.WECHAT_BOT_WS_URL"
                      :label="t('notification.wechat.botWsUrl')"
                      :hint="t('notification.wechat.botWsUrlHint')"
                      prepend-inner-icon="mdi-lan-connect"
                    />
                  </VCol>
                  <VCol cols="12" sm="6">
                    <VTextField
                      v-model="notificationInfo.config.WECHAT_ADMINS"
                      :label="t('notification.wechat.admins')"
                      :placeholder="t('notification.wechat.adminsPlaceholder')"
                      :hint="t('notification.wechat.adminsHint')"
                      prepend-inner-icon="mdi-account-supervisor"
                    />
                  </VCol>
                </template>
                <template v-else>
                  <VCol cols="12" sm="6">
                    <VTextField
                      v-model="notificationInfo.config.WECHAT_CORPID"
                      :label="t('notification.wechat.corpId')"
                      :hint="t('notification.wechat.corpIdHint')"
                      prepend-inner-icon="mdi-domain"
                    />
                  </VCol>
                  <VCol cols="12" sm="6">
                    <VTextField
                      v-model="notificationInfo.config.WECHAT_APP_ID"
                      :label="t('notification.wechat.appId')"
                      :hint="t('notification.wechat.appIdHint')"
                      prepend-inner-icon="mdi-application"
                    />
                  </VCol>
                  <VCol cols="12" sm="6">
                    <VTextField
                      v-model="notificationInfo.config.WECHAT_APP_SECRET"
                      type="password"
                      :label="t('notification.wechat.appSecret')"
                      :hint="t('notification.wechat.appSecretHint')"
                      prepend-inner-icon="mdi-key"
                    />
                  </VCol>
                  <VCol cols="12" sm="6">
                    <VTextField
                      v-model="notificationInfo.config.WECHAT_PROXY"
                      :label="t('notification.wechat.proxy')"
                      :hint="t('notification.wechat.proxyHint')"
                      prepend-inner-icon="mdi-server-network"
                    />
                  </VCol>
                  <VCol cols="12" sm="6">
                    <VTextField
                      v-model="notificationInfo.config.WECHAT_TOKEN"
                      type="password"
                      :label="t('notification.wechat.token')"
                      :hint="t('notification.wechat.tokenHint')"
                      prepend-inner-icon="mdi-key-variant"
                    />
                  </VCol>
                  <VCol cols="12" sm="6">
                    <VTextField
                      v-model="notificationInfo.config.WECHAT_ENCODING_AESKEY"
                      type="password"
                      :label="t('notification.wechat.encodingAesKey')"
                      :hint="t('notification.wechat.encodingAesKeyHint')"
                      prepend-inner-icon="mdi-lock"
                    />
                  </VCol>
                  <VCol cols="12" sm="6">
                    <VTextField
                      v-model="notificationInfo.config.WECHAT_ADMINS"
                      :label="t('notification.wechat.admins')"
                      :placeholder="t('notification.wechat.adminsPlaceholder')"
                      :hint="t('notification.wechat.adminsHint')"
                      prepend-inner-icon="mdi-account-supervisor"
                    />
                  </VCol>
                </template>
              </VRow>
            </section>
          </template>

          <section v-else-if="notificationInfo.type == 'telegram'" class="mp-form-section">
            <VRow class="mp-form-grid">
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="notificationInfo.name"
                  :label="t('notification.name')"
                  :placeholder="t('notification.name')"
                  :hint="t('notification.nameHint')"
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="notificationInfo.config.TELEGRAM_TOKEN"
                  type="password"
                  :label="t('notification.telegram.token')"
                  :hint="t('notification.telegram.tokenHint')"
                  prepend-inner-icon="mdi-key"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="notificationInfo.config.TELEGRAM_CHAT_ID"
                  :label="t('notification.telegram.chatId')"
                  :hint="t('notification.telegram.chatIdHint')"
                  prepend-inner-icon="mdi-chat"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="notificationInfo.config.TELEGRAM_USERS"
                  :label="t('notification.telegram.users')"
                  :placeholder="t('notification.telegram.usersPlaceholder')"
                  :hint="t('notification.telegram.usersHint')"
                  prepend-inner-icon="mdi-account-group"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="notificationInfo.config.TELEGRAM_ADMINS"
                  :label="t('notification.telegram.admins')"
                  :placeholder="t('notification.telegram.adminsPlaceholder')"
                  :hint="t('notification.telegram.adminsHint')"
                  prepend-inner-icon="mdi-account-supervisor"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="notificationInfo.config.API_URL"
                  :label="t('notification.telegram.apiUrl')"
                  :placeholder="t('notification.telegram.apiUrlPlaceholder')"
                  :hint="t('notification.telegram.apiUrlHint')"
                  prepend-inner-icon="mdi-web"
                />
              </VCol>
            </VRow>
          </section>

          <section v-else-if="notificationInfo.type == 'apppush'" class="mp-form-section">
            <VRow class="mp-form-grid">
              <VCol cols="12">
                <VTextField
                  v-model="notificationInfo.name"
                  :label="t('notification.name')"
                  :placeholder="t('notification.name')"
                  :hint="t('notification.nameHint')"
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
              <VCol cols="12">
                <VTextField
                  v-model="notificationInfo.config.PUSH_SERVER_URL"
                  :label="t('notification.apppush.server')"
                  placeholder="https://push.example.com"
                  :hint="t('notification.apppush.serverHint')"
                  prepend-inner-icon="mdi-server-network"
                />
              </VCol>
              <VCol cols="12">
                <VExpansionPanels v-model="appPushManualPanel" variant="accordion" class="mp-expansion-panel">
                  <VExpansionPanel value="manual" :title="t('notification.apppush.manual')">
                    <VExpansionPanelText>
                      <VTextField
                        v-model="notificationInfo.config.PUSH_RELAY_KEY"
                        type="password"
                        autocomplete="new-password"
                        :label="t('notification.apppush.key')"
                        :hint="t('notification.apppush.keyHint')"
                        prepend-inner-icon="mdi-key"
                      />
                    </VExpansionPanelText>
                  </VExpansionPanel>
                </VExpansionPanels>
              </VCol>
              <VCol cols="12">
                <VAlert type="info" variant="tonal" density="compact">{{ t('notification.apppush.hint') }}</VAlert>
              </VCol>
              <VCol v-if="appPushCanRotate" cols="12">
                <VBtn
                  color="default"
                  variant="outlined"
                  size="small"
                  :loading="appPushRotating"
                  prepend-icon="mdi-key-change"
                  @click="rotateAppPush"
                >
                  {{ t('notification.apppush.rotate') }}
                </VBtn>
              </VCol>
            </VRow>
          </section>
        </VForm>
      </VCardText>
      <VDivider />
      <VCardActions class="app-dialog-actions mp-dialog-footer">
        <VBtn
          color="default"
          variant="outlined"
          size="small"
          :loading="testing"
          prepend-icon="mdi-send-check-outline"
          @click="testNotification"
        >
          {{ t('setting.notification.sendTest') }}
        </VBtn>
        <VSpacer />
        <VBtn color="default" variant="text" size="small" @click="notificationInfoDialog = false">
          {{ t('common.cancel') }}
        </VBtn>
        <VBtn color="primary" variant="flat" size="small" class="px-4" @click="saveNotificationInfo">
          {{ t('common.confirm') }}
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

.mp-form-sections {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.mp-form-grid {
  row-gap: 6px;
}

.mp-expansion-panel {
  overflow: hidden;
  border: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.1));
  border-radius: 10px !important;

  :deep(.v-expansion-panel) {
    background: var(--mp-item-bg, rgba(var(--v-theme-on-surface), 0.02));
  }
}

@media (max-width: 599.98px) {
  .mp-dialog-body {
    padding: 16px !important;
  }
}
</style>
