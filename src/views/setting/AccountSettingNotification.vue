<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api, { getApiErrorMessage } from '@/api'
import type {
  NotificationChannelType,
  NotificationConf,
  NotificationConfigDiagnostic,
  NotificationSwitchConf,
} from '@/api/types'
import NotificationChannelCard from '@/components/cards/NotificationChannelCard.vue'
import { useI18n } from '@/composables/useChineseText'
import { notificationSwitchDict } from '@/api/constants'
import { useTheme } from 'vuetify'
import { useSilentSettingRefresh } from '@/composables/useSilentSettingRefresh'
import { openSharedDialog } from '@/composables/useSharedDialog'

// 国际化
const { t } = useI18n()

const props = defineProps({
  active: {
    type: Boolean,
    default: true,
  },
})

// 通知渠道排序按需加载，避免通知设置 chunk 直接包含拖拽库。
const Draggable = defineAsyncComponent(() => import('vuedraggable').then(module => module.default))
const NotificationTemplateEditorDialog = defineAsyncComponent(
  () => import('@/components/dialog/NotificationTemplateEditorDialog.vue'),
)

// 通知模板入口的图标和强调色统一维护，避免模板中散落长判断。
const templateTypeDefaults = [
  {
    type: 'organizeSuccess',
    icon: 'mdi-folder-check',
    accentRgb: 'var(--v-theme-primary)',
  },
  {
    type: 'downloadAdded',
    icon: 'mdi-download-box',
    accentRgb: 'var(--v-theme-info)',
  },
  {
    type: 'subscribeAdded',
    icon: 'mdi-rss-box',
    accentRgb: 'var(--v-theme-warning)',
  },
  {
    type: 'subscribeComplete',
    icon: 'mdi-check-circle',
    accentRgb: 'var(--v-theme-success)',
  },
] as const

type NotificationTemplateType = (typeof templateTypeDefaults)[number]['type']

// 初始化模板配置字典
const templateConfigs = ref<Record<string, string>>(
  templateTypeDefaults.reduce<Record<string, string>>((configs, item) => {
    configs[item.type] = '{}'
    return configs
  }, {}),
)

// 模板类型配置
const templateTypes = computed(() =>
  templateTypeDefaults.map(item => ({
    ...item,
    label: t(`setting.notification.${item.type}`),
  })),
)

// Ace 直接跟随 Vuetify 当前生效主题，auto 模式下也能按实际明暗色切换。
const { global: globalTheme } = useTheme()
const editorTheme = computed(() => (globalTheme.current.value.dark ? 'github_dark' : 'github_light_default'))

// 所有消息渠道
const notifications = ref<NotificationConf[]>([])
const invalidNotifications = ref<NotificationConfigDiagnostic[]>([])

// 提示框
const $toast = useToast()

const editorDialogOpen = ref(false)
const currentTemplate = ref<NotificationTemplateType | ''>('')
const editorContent = ref('')

// 各卡片独立的保存加载锁
const savingChannels = ref(false)
const savingSwitchs = ref(false)
const savingTime = ref(false)
const savingTemplate = ref(false)

// 消息类型开关
const notificationSwitchs = ref<NotificationSwitchConf[]>([
  {
    type: '资源下载',
    action: 'all',
  },
  {
    type: '整理入库',
    action: 'all',
  },
  {
    type: '订阅',
    action: 'all',
  },
  {
    type: '站点',
    action: 'admin',
  },
  {
    type: '媒体服务器',
    action: 'admin',
  },
  {
    type: '手动处理',
    action: 'admin',
  },
  {
    type: '插件',
    action: 'admin',
  },
  {
    type: '其它',
    action: 'admin',
  },
])

// 通知发送时间
const notificationTime = ref({
  start: '00:00',
  end: '23:59',
})

let editorDialogController: ReturnType<typeof openSharedDialog> | null = null

// 关闭通知模板共享弹窗，并同步本页的弹窗占用状态。
function closeTemplateEditorDialog() {
  editorDialogOpen.value = false
  editorDialogController?.close()
  editorDialogController = null
}

// 打开通知模板共享弹窗，保持内容通过事件回写到设置页。
function openTemplateEditorDialog(type: NotificationTemplateType) {
  closeTemplateEditorDialog()
  editorDialogOpen.value = true
  editorDialogController = openSharedDialog(
    NotificationTemplateEditorDialog,
    {
      content: editorContent.value,
      editorTheme: editorTheme.value,
      subtitle: templateTypes.value.find(item => item.type === type)?.label ?? '',
      templateType: type,
    },
    {
      close: () => {
        editorDialogOpen.value = false
        editorDialogController = null
      },
      save: saveTemplate,
      'update:content': (value: string) => {
        editorContent.value = value
      },
      'update:modelValue': (value: boolean) => {
        if (!value) {
          editorDialogOpen.value = false
          editorDialogController = null
        }
      },
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

// 共享弹窗的 props 是打开时写入的，主题切换时主动推送给已打开的编辑器。
watch(editorTheme, theme => {
  if (!editorDialogOpen.value) return

  editorDialogController?.updateProps({ editorTheme: theme })
})

function createNotificationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// 添加通知渠道
function addNotification(notification: NotificationChannelType) {
  let name = `${t('setting.notification.channel')}${notifications.value.length + 1}`
  while (notifications.value.some(item => item.name === name)) {
    name = `${t('setting.notification.channel')}${parseInt(name.split(t('setting.notification.channel'))[1]) + 1}`
  }
  notifications.value.push({
    // 局域网 HTTP 不提供 randomUUID；渠道 ID 仅用于配置关联。
    id: createNotificationId(),
    name: name,
    type: notification,
    enabled: false,
    config: {},
  })
}

const notificationConfigFields: Record<NotificationChannelType, Set<string>> = {
  telegram: new Set(['TELEGRAM_TOKEN', 'TELEGRAM_CHAT_ID', 'TELEGRAM_USERS', 'TELEGRAM_ADMINS', 'API_URL']),
  wechat: new Set([
    'WECHAT_MODE',
    'WECHAT_CORPID',
    'WECHAT_APP_ID',
    'WECHAT_APP_SECRET',
    'WECHAT_PROXY',
    'WECHAT_TOKEN',
    'WECHAT_ENCODING_AESKEY',
    'WECHAT_BOT_ID',
    'WECHAT_BOT_SECRET',
    'WECHAT_BOT_CHAT_ID',
    'WECHAT_BOT_WS_URL',
    'WECHAT_ADMINS',
  ]),
  apppush: new Set(['PUSH_SERVER_URL', 'PUSH_RELAY_KEY']),
}

/** 丢弃历史未知字段，保留缺失字段供用户在编辑器中补齐，并确保具备稳定唯一 id。 */
function normalizeNotification(item: NotificationConf): NotificationConf {
  const allowedFields = notificationConfigFields[item.type]
  const config = Object.fromEntries(Object.entries(item.config ?? {}).filter(([field]) => allowedFields.has(field)))

  return {
    id: item.id || createNotificationId(),
    name: item.name,
    type: item.type,
    config,
    switchs: item.switchs ?? [],
    enabled: item.enabled,
  }
}
// 移除通知渠道
function removeNotification(notification: NotificationConf) {
  const index = notifications.value.indexOf(notification)
  if (index > -1) notifications.value.splice(index, 1)
}

// 调用API查询通知渠道设置
async function loadNotificationSetting() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/Notifications')
    notifications.value = (result.data?.value ?? [])
      .filter((item: NotificationConf) => ['wechat', 'telegram', 'apppush'].includes(item.type))
      .map(normalizeNotification)
    invalidNotifications.value = result.data?.invalid ?? []
  } catch (error) {
    console.error(error)
  }
}

async function openEditor(type: NotificationTemplateType) {
  try {
    currentTemplate.value = type
    const result: { [key: string]: any } = await api.get('system/setting/NotificationTemplates')
    templateConfigs.value = result.data?.value || {}
    editorContent.value = templateConfigs.value[type] || '{}'
    openTemplateEditorDialog(type)
  } catch (error) {
    console.error(error)
    $toast.error(t('setting.notification.templateLoadFailed'))
  }
}

async function saveTemplate(value = editorContent.value) {
  if (savingTemplate.value) return
  savingTemplate.value = true
  try {
    await api.post('system/setting/NotificationTemplates', {
      ...templateConfigs.value,
      [currentTemplate.value]: value,
    })
    $toast.success(t('setting.notification.templateSaveSuccess'))
    closeTemplateEditorDialog()
  } catch (error) {
    console.error(error)
    $toast.error(getApiErrorMessage(error) || t('setting.notification.templateSaveFailed'))
  } finally {
    savingTemplate.value = false
  }
}

async function loadTemplateConfigs() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/NotificationTemplates')
    templateConfigs.value = result.data?.value || {}
  } catch (error) {
    console.error(error)
    $toast.error(t('setting.notification.templateLoadFailed'))
  }
}

// 调用API查询通知发送时间设置
async function loadNotificationTime() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/NotificationSendTime')
    notificationTime.value = result.data?.value ?? { start: '00:00', end: '23:59' }
  } catch (error) {
    console.log(error)
  }
}

// 调用API保存通知设置
async function saveNotificationSetting() {
  if (savingChannels.value) return
  savingChannels.value = true
  try {
    const result: { [key: string]: any } = await api.post('system/setting/Notifications', notifications.value)
    if (result.success) {
      $toast.success(t('setting.notification.saveSuccess'))
      invalidNotifications.value = []
    } else $toast.error(result.message || t('setting.notification.saveFailed'))
  } catch (error) {
    console.error(error)
    $toast.error(getApiErrorMessage(error) || t('setting.notification.saveFailed'))
  } finally {
    savingChannels.value = false
  }
}

// 调用API保存通知发送时间设置
async function saveNotificationTime() {
  if (savingTime.value) return
  savingTime.value = true
  try {
    const result: { [key: string]: any } = await api.post('system/setting/NotificationSendTime', notificationTime.value)
    if (result.success) {
      $toast.success(t('setting.notification.timeSaveSuccess'))
    } else $toast.error(result.message || t('setting.notification.timeSaveFailed'))
  } catch (error) {
    console.error(error)
    $toast.error(getApiErrorMessage(error) || t('setting.notification.timeSaveFailed'))
  } finally {
    savingTime.value = false
  }
}

// 通知渠道设置变化时赋值（继承原有稳定 id，防止改名后组件卸载重挂载）
function changNotificationSetting(notification: NotificationConf, name: string) {
  const index = notifications.value.findIndex(item => item.name === name)
  if (index !== -1) {
    notifications.value[index] = {
      ...notification,
      id: notification.id || notifications.value[index].id || createNotificationId(),
    }
  }
}

// 加载消息类型开关
async function loadNotificationSwitchs() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/NotificationSwitchs')
    if (result.data?.value && result.data?.value.length > 0) {
      const savedSwitchs: NotificationSwitchConf[] = result.data.value
      // 合并默认值中存在但后端数据中缺失的类型（如新增的类型）
      const defaults = notificationSwitchs.value
      for (const def of defaults) {
        if (!savedSwitchs.find(item => item.type === def.type)) {
          savedSwitchs.push(def)
        }
      }
      notificationSwitchs.value = savedSwitchs
    }
  } catch (error) {
    console.log(error)
  }
}

// 保存消息类型开关
async function saveNotificationSwitchs() {
  if (savingSwitchs.value) return
  savingSwitchs.value = true
  try {
    const result: { [key: string]: any } = await api.post(
      'system/setting/NotificationSwitchs',
      notificationSwitchs.value,
    )
    if (result.success) $toast.success(t('setting.notification.switchSaveSuccess'))
    else $toast.error(result.message || t('setting.notification.switchSaveFailed'))
  } catch (error) {
    console.error(error)
    $toast.error(getApiErrorMessage(error) || t('setting.notification.switchSaveFailed'))
  } finally {
    savingSwitchs.value = false
  }
}

// 获取通知开关文本
function getNotificationSwitchText(type: string | undefined) {
  if (!type) return ''
  return notificationSwitchDict[type]
}

const notificationSwitchIcons: Record<string, string> = {
  资源下载: 'mdi-download-outline',
  resourceDownload: 'mdi-download-outline',
  整理入库: 'mdi-folder-move-outline',
  organize: 'mdi-folder-move-outline',
  订阅: 'mdi-rss',
  subscribe: 'mdi-rss',
  站点: 'mdi-web',
  site: 'mdi-web',
  媒体服务器: 'mdi-server-outline',
  mediaServer: 'mdi-server-outline',
  手动处理: 'mdi-hand-pointing-right',
  manual: 'mdi-hand-pointing-right',
  插件: 'mdi-puzzle-outline',
  plugin: 'mdi-puzzle-outline',
  其它: 'mdi-bell-outline',
  other: 'mdi-bell-outline',
}

function getNotificationSwitchIcon(type: string | undefined) {
  if (!type) return 'mdi-bell-outline'
  return notificationSwitchIcons[type] ?? 'mdi-bell-outline'
}

const scopeOptions = computed(
  () =>
    [
      { value: 'user', label: t('setting.notification.operationUserOnly') },
      { value: 'admin', label: t('setting.notification.adminOnly') },
      { value: 'user,admin', label: t('setting.notification.userAndAdmin') },
      { value: 'all', label: t('setting.notification.allUsers') },
    ] as const,
)

async function loadPageData() {
  await Promise.all([
    loadNotificationSetting(),
    loadNotificationSwitchs(),
    loadNotificationTime(),
    loadTemplateConfigs(),
  ])
}

// 加载数据
onMounted(() => {
  loadPageData()
})

useSilentSettingRefresh(
  async () => {
    if (savingChannels.value || savingSwitchs.value || savingTime.value || savingTemplate.value) return
    await loadPageData()
  },
  {
    active: computed(() => props.active && !editorDialogOpen.value),
  },
)
</script>

<template>
  <div class="mp-setting-stack">
    <VCard id="sec-notify-channels" class="mp-setting-card">
      <VCardItem>
        <template #prepend>
          <div class="mp-setting-card__icon mp-setting-card__icon--primary">
            <VIcon icon="mdi-send-circle-outline" size="18" />
          </div>
        </template>
        <VCardTitle class="d-flex align-center gap-2">
          <span>{{ t('setting.notification.channels') }}</span>
          <span v-if="notifications.length > 0" class="mp-count-pill">{{ notifications.length }}</span>
        </VCardTitle>
        <VCardSubtitle>{{ t('setting.notification.channelsDesc') }}</VCardSubtitle>
        <template #append>
          <VBtn size="small" color="secondary" variant="outlined" rounded="lg" prepend-icon="mdi-plus">
            添加通知渠道
            <VMenu :activator="'parent'" :close-on-content-click="true">
              <VList>
                <VListItem @click="addNotification('wechat')">
                  <VListItemTitle>{{ t('setting.notification.wechat') }}</VListItemTitle>
                </VListItem>
                <VListItem @click="addNotification('telegram')">
                  <VListItemTitle>{{ t('setting.notification.telegram') }}</VListItemTitle>
                </VListItem>
                <VListItem @click="addNotification('apppush')">
                  <VListItemTitle>{{ t('setting.notification.apppush') }}</VListItemTitle>
                </VListItem>
              </VList>
            </VMenu>
          </VBtn>
        </template>
      </VCardItem>
      <VCardText v-if="invalidNotifications.length" class="pb-0">
        <VAlert type="warning" variant="tonal" density="compact" icon="mdi-alert-circle-outline">
          <div class="font-weight-medium">{{ t('setting.notification.invalidConfigTitle') }}</div>
          <ul class="mt-2 ps-5">
            <li v-for="item in invalidNotifications" :key="item.id">
              <strong>{{ item.name }}</strong>
              <span>：{{ item.errors.join('；') }}</span>
            </li>
          </ul>
          <div class="mt-2 text-body-2">{{ t('setting.notification.invalidConfigHint') }}</div>
        </VAlert>
      </VCardText>
      <VCardText>
        <Draggable
          v-if="notifications.length"
          v-model="notifications"
          handle=".cursor-move"
          item-key="id"
          tag="div"
          :component-data="{ 'class': 'grid gap-3 grid-app-card' }"
        >
          <template #item="{ element }">
            <NotificationChannelCard
              :notification="element"
              :notifications="notifications"
              @change="changNotificationSetting"
              @close="removeNotification(element)"
            />
          </template>
        </Draggable>
        <div v-else class="mp-empty-hint">
          <VIcon icon="mdi-bell-outline" size="16" class="mp-empty-hint__icon" />
          <span>暂未添加通知渠道，可点击右上角「添加通知渠道」新增配置</span>
        </div>

        <VForm class="mp-card-footer" @submit.prevent="() => {}">
          <span class="mp-card-footer__hint">保存通知推送渠道配置</span>
          <VBtn
            type="submit"
            size="small"
            color="primary"
            variant="flat"
            rounded="lg"
            prepend-icon="mdi-content-save-outline"
            :loading="savingChannels"
            :disabled="savingChannels"
            class="px-4"
            @click="saveNotificationSetting"
          >
            {{ t('common.save') }}
          </VBtn>
        </VForm>
      </VCardText>
    </VCard>

    <VCard id="sec-notify-templates" class="mp-setting-card">
      <VCardItem>
        <template #prepend>
          <div class="mp-setting-card__icon mp-setting-card__icon--info">
            <VIcon icon="mdi-code-braces-box" size="18" />
          </div>
        </template>
        <VCardTitle>{{ t('setting.notification.templateConfigTitle') }}</VCardTitle>
        <VCardSubtitle>{{ t('setting.notification.templateConfigDesc') }}</VCardSubtitle>
      </VCardItem>
      <VCardText>
        <div class="notification-template-grid">
          <button
            v-for="item in templateTypes"
            :key="item.type"
            type="button"
            class="notification-template-card app-card-shell"
            @click="openEditor(item.type)"
          >
            <span class="template-card-icon">
              <VIcon :icon="item.icon" size="18" />
            </span>
            <span class="template-card-copy">
              <span class="template-card-title">{{ item.label }}</span>
              <span class="template-card-subtitle">Jinja2 JSON</span>
            </span>
            <VIcon class="template-card-arrow" icon="mdi-chevron-right" size="18" />
          </button>
        </div>
      </VCardText>
    </VCard>

    <VCard id="sec-notify-scope" class="mp-setting-card">
      <VCardItem>
        <template #prepend>
          <div class="mp-setting-card__icon mp-setting-card__icon--success">
            <VIcon icon="mdi-account-group-outline" size="18" />
          </div>
        </template>
        <VCardTitle>{{ t('setting.notification.scope') }}</VCardTitle>
        <VCardSubtitle>{{ t('setting.notification.scopeDesc') }}</VCardSubtitle>
      </VCardItem>
      <VCardText>
        <div class="mp-settings-group">
          <div
            v-for="(item, index) in notificationSwitchs"
            :key="item.type || index"
            class="mp-settings-row notification-scope-row"
          >
            <div class="mp-settings-row__meta notification-scope-meta">
              <span class="notification-scope-icon" aria-hidden="true">
                <VIcon :icon="getNotificationSwitchIcon(item.type)" size="15" />
              </span>
              <span class="mp-settings-row__title">{{ getNotificationSwitchText(item.type) || item.type }}</span>
            </div>
            <div class="mp-settings-row__control notification-scope-control">
              <div
                class="mp-segmented notification-scope-segmented"
                role="radiogroup"
                :aria-label="getNotificationSwitchText(item.type) || item.type"
              >
                <button
                  v-for="opt in scopeOptions"
                  :key="opt.value"
                  type="button"
                  role="radio"
                  :aria-checked="item.action === opt.value"
                  class="mp-segmented__btn"
                  :class="{ 'is-active': item.action === opt.value }"
                  @click="item.action = opt.value"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <VForm class="mp-card-footer" @submit.prevent="() => {}">
          <span class="mp-card-footer__hint">保存各业务场景的通知接收人范围</span>
          <VBtn
            type="submit"
            size="small"
            color="primary"
            variant="flat"
            rounded="lg"
            prepend-icon="mdi-content-save-outline"
            :loading="savingSwitchs"
            :disabled="savingSwitchs"
            class="px-4"
            @click="saveNotificationSwitchs"
          >
            {{ t('common.save') }}
          </VBtn>
        </VForm>
      </VCardText>
    </VCard>

    <VCard id="sec-notify-time" class="mp-setting-card">
      <VCardItem>
        <template #prepend>
          <div class="mp-setting-card__icon mp-setting-card__icon--warning">
            <VIcon icon="mdi-clock-check-outline" size="18" />
          </div>
        </template>
        <VCardTitle>{{ t('setting.notification.sendTime') }}</VCardTitle>
        <VCardSubtitle>{{ t('setting.notification.sendTimeDesc') }}</VCardSubtitle>
      </VCardItem>
      <VCardText>
        <VRow>
          <VCol cols="12" sm="6">
            <VTextField
              v-model="notificationTime.start"
              :label="t('setting.notification.startTime')"
              type="time"
              prepend-inner-icon="mdi-clock-start"
            />
          </VCol>
          <VCol cols="12" sm="6">
            <VTextField
              v-model="notificationTime.end"
              :label="t('setting.notification.endTime')"
              type="time"
              prepend-inner-icon="mdi-clock-end"
            />
          </VCol>
        </VRow>

        <VForm class="mp-card-footer" @submit.prevent="() => {}">
          <span class="mp-card-footer__hint">保存每日允许推送消息的活跃时间窗口</span>
          <VBtn
            type="submit"
            size="small"
            color="primary"
            variant="flat"
            rounded="lg"
            prepend-icon="mdi-content-save-outline"
            :loading="savingTime"
            :disabled="savingTime"
            class="px-4"
            @click="saveNotificationTime"
          >
            {{ t('common.save') }}
          </VBtn>
        </VForm>
      </VCardText>
    </VCard>
  </div>
</template>
<style scoped>
/* 模板入口保持黄金比例紧凑密度（64px），卡片壳层统一干净哑光样式。 */
.notification-template-grid {
  display: grid;
  gap: 13px;
  grid-template-columns: repeat(auto-fit, minmax(13.5rem, 1fr));
}

.notification-template-card {
  position: relative;
  display: flex;
  align-items: center;
  padding: 11px 14px;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background-color: rgba(var(--v-theme-on-surface), 0.025);
  cursor: pointer;
  gap: 11px;
  inline-size: 100%;
  min-block-size: 64px;
  text-align: start;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}

.notification-template-card:hover {
  border-color: var(--mp-border-hover);
  background-color: rgba(var(--v-theme-on-surface), 0.045);
}

.template-card-icon {
  display: inline-flex;
  flex: 0 0 36px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.045);
  block-size: 36px;
  color: rgba(var(--v-theme-on-surface), 0.78);
  inline-size: 36px;
}

.template-card-copy {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-inline-size: 0;
}

.template-card-title {
  overflow: hidden;
  color: rgb(var(--v-theme-on-surface));
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-card-subtitle {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11.5px;
  line-height: 1.35;
}

.template-card-arrow {
  flex: 0 0 auto;
  color: rgba(var(--v-theme-on-surface), 0.42);
  transition:
    color 0.18s ease,
    transform 0.18s ease;
}

.notification-template-card:hover .template-card-arrow {
  color: rgb(var(--v-theme-on-surface));
  transform: translateX(2px);
}

/* 通知发送范围：桌面端左 38.2% 类型元信息 + 右 61.8% 分段胶囊，移动端流式排布 */
.notification-scope-row {
  gap: 13px;
}

.notification-scope-meta {
  display: flex;
  flex: 1 1 38.2%;
  flex-direction: row !important;
  align-items: center;
  gap: 10px;
  min-inline-size: 0;
}

.notification-scope-icon {
  display: inline-flex;
  flex: 0 0 28px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.045);
  block-size: 28px;
  color: rgba(var(--v-theme-on-surface), 0.72);
  inline-size: 28px;
}

.notification-scope-control {
  display: flex;
  flex: 0 1 61.8%;
  justify-content: flex-end;
}

@media (width <= 760px) {
  .notification-scope-row {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .notification-scope-control {
    flex: 1 1 auto;
    justify-content: flex-start;
  }

  .notification-scope-segmented {
    display: grid;
    block-size: auto;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    inline-size: 100%;
  }
}

@media (width <= 600px) {
  .notification-template-grid {
    gap: 10px;
  }
}

.mp-empty-hint {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  padding: 16px 14px;
  border: 1px dashed var(--mp-border-card);
  border-radius: 8px;
  background: var(--mp-item-bg);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12.5px;
  gap: 5px;
  line-height: 1.5;
}

.mp-empty-hint__icon {
  color: rgba(var(--v-theme-on-surface), 0.45);
}
</style>
