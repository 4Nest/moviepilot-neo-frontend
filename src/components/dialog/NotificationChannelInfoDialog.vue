<script setup lang="ts">
import { NotificationConf } from '@/api/types'
import { useToast } from 'vue-toastification'
import { cloneDeep } from 'lodash-es'
import { useI18n } from 'vue-i18n'
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
  type: '',
  enabled: false,
  config: {},
})

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
    max-width="40rem"
    :fullscreen="!display.mdAndUp.value"
  >
      <VCard>
        <VCardItem class="py-2">
          <template #prepend>
            <VIcon icon="mdi-cog" class="me-2" />
          </template>
          <VCardTitle>{{ t('common.config') }}</VCardTitle>
          <VCardSubtitle>{{ props.notification.name }}</VCardSubtitle>
        </VCardItem>
        <VDialogCloseBtn v-model="notificationInfoDialog" />
        <VDivider />
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="6">
                <VSwitch v-model="notificationInfo.enabled" :label="t('notification.enabled')" />
              </VCol>
              <VCol cols="12">
                <VAutocomplete
                  v-model="notificationInfo.switchs"
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
            <VRow v-if="notificationInfo.type == 'wechat'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.name"
                  :label="t('notification.name')"
                  :placeholder="t('notification.name')"
                  :hint="t('notification.nameHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VSwitch
                  v-model="isWechatBotMode"
                  :label="t('notification.wechat.useBotMode')"
                  :hint="t('notification.wechat.useBotModeHint')"
                  persistent-hint
                  color="primary"
                />
              </VCol>
              <template v-if="isWechatBotMode">
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="notificationInfo.config.WECHAT_BOT_ID"
                    :label="t('notification.wechat.botId')"
                    :hint="t('notification.wechat.botIdHint')"
                    persistent-hint
                    prepend-inner-icon="mdi-robot"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="notificationInfo.config.WECHAT_BOT_SECRET"
                    :label="t('notification.wechat.botSecret')"
                    :hint="t('notification.wechat.botSecretHint')"
                    persistent-hint
                    prepend-inner-icon="mdi-key"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="notificationInfo.config.WECHAT_BOT_CHAT_ID"
                    :label="t('notification.wechat.botChatId')"
                    :placeholder="t('notification.wechat.botChatIdPlaceholder')"
                    :hint="t('notification.wechat.botChatIdHint')"
                    persistent-hint
                    prepend-inner-icon="mdi-chat-processing"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="notificationInfo.config.WECHAT_BOT_WS_URL"
                    :label="t('notification.wechat.botWsUrl')"
                    :hint="t('notification.wechat.botWsUrlHint')"
                    persistent-hint
                    prepend-inner-icon="mdi-lan-connect"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="notificationInfo.config.WECHAT_ADMINS"
                    :label="t('notification.wechat.admins')"
                    :placeholder="t('notification.wechat.adminsPlaceholder')"
                    :hint="t('notification.wechat.adminsHint')"
                    persistent-hint
                    prepend-inner-icon="mdi-account-supervisor"
                  />
                </VCol>
              </template>
              <template v-else>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="notificationInfo.config.WECHAT_CORPID"
                    :label="t('notification.wechat.corpId')"
                    :hint="t('notification.wechat.corpIdHint')"
                    persistent-hint
                    prepend-inner-icon="mdi-domain"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="notificationInfo.config.WECHAT_APP_ID"
                    :label="t('notification.wechat.appId')"
                    :hint="t('notification.wechat.appIdHint')"
                    persistent-hint
                    prepend-inner-icon="mdi-application"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="notificationInfo.config.WECHAT_APP_SECRET"
                    :label="t('notification.wechat.appSecret')"
                    :hint="t('notification.wechat.appSecretHint')"
                    persistent-hint
                    prepend-inner-icon="mdi-key"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="notificationInfo.config.WECHAT_PROXY"
                    :label="t('notification.wechat.proxy')"
                    :hint="t('notification.wechat.proxyHint')"
                    persistent-hint
                    prepend-inner-icon="mdi-server-network"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="notificationInfo.config.WECHAT_TOKEN"
                    :label="t('notification.wechat.token')"
                    :hint="t('notification.wechat.tokenHint')"
                    persistent-hint
                    prepend-inner-icon="mdi-key-variant"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="notificationInfo.config.WECHAT_ENCODING_AESKEY"
                    :label="t('notification.wechat.encodingAesKey')"
                    :hint="t('notification.wechat.encodingAesKeyHint')"
                    persistent-hint
                    prepend-inner-icon="mdi-lock"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="notificationInfo.config.WECHAT_ADMINS"
                    :label="t('notification.wechat.admins')"
                    :placeholder="t('notification.wechat.adminsPlaceholder')"
                    :hint="t('notification.wechat.adminsHint')"
                    persistent-hint
                    prepend-inner-icon="mdi-account-supervisor"
                  />
                </VCol>
              </template>
            </VRow>
            <VRow v-else-if="notificationInfo.type == 'telegram'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.name"
                  :label="t('notification.name')"
                  :placeholder="t('notification.name')"
                  :hint="t('notification.nameHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.TELEGRAM_TOKEN"
                  :label="t('notification.telegram.token')"
                  :hint="t('notification.telegram.tokenHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-key"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.TELEGRAM_CHAT_ID"
                  :label="t('notification.telegram.chatId')"
                  :hint="t('notification.telegram.chatIdHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-chat"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.TELEGRAM_USERS"
                  :label="t('notification.telegram.users')"
                  :placeholder="t('notification.telegram.usersPlaceholder')"
                  :hint="t('notification.telegram.usersHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-account-group"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.TELEGRAM_ADMINS"
                  :label="t('notification.telegram.admins')"
                  :placeholder="t('notification.telegram.adminsPlaceholder')"
                  :hint="t('notification.telegram.adminsHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-account-supervisor"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="notificationInfo.config.API_URL"
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
        <VCardActions class="app-dialog-actions">
          <VSpacer />
          <VBtn
            color="primary"
            variant="flat"
            @click="saveNotificationInfo"
            prepend-icon="mdi-content-save"
            class="px-5"
          >
            {{ t('common.confirm') }}
          </VBtn>
        </VCardActions>
      </VCard>
  </VDialog>
</template>
