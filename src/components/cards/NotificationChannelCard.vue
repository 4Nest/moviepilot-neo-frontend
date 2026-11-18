<script setup lang="ts">
import api, { getApiErrorMessage } from '@/api'
import type { ApiResponse, NotificationConf } from '@/api/types'
import { getLogoUrl } from '@/utils/imageUtils'
import { useI18n } from '@/composables/useChineseText'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useToast } from 'vue-toastification'

const NotificationChannelInfoDialog = defineAsyncComponent(
  () => import('@/components/dialog/NotificationChannelInfoDialog.vue'),
)

const { t } = useI18n()
const $toast = useToast()
const testing = ref(false)

/** 提取后端校验或发送失败原因。 */
function getErrorMessage(error: unknown): string {
  return getApiErrorMessage(error) || t('setting.notification.testFailed')
}

/** 使用当前内存中的渠道配置发送一条真实测试消息。 */
async function testNotification() {
  testing.value = true
  try {
    const result = (await api.post('system/notification/test', props.notification)) as ApiResponse
    if (result.success) $toast.success(result.message || t('setting.notification.testSuccess'))
    else $toast.error(result.message || t('setting.notification.testFailed'))
  } catch (error) {
    $toast.error(getErrorMessage(error))
  } finally {
    testing.value = false
  }
}

// 定义输入
const props = defineProps({
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
const emit = defineEmits(['close', 'change', 'done'])

// 各通知类型的名称字典
const notificationTypeNames: { [key: string]: string } = {
  wechat: t('notification.wechat.name'),
  telegram: t('notification.telegram.name'),
  apppush: t('notification.apppush.name'),
}

const channelTypeLabel = computed(
  () => notificationTypeNames[props.notification.type] || props.notification.type || t('common.unknown'),
)

/** 打开共享通知渠道配置弹窗。 */
function openNotificationInfoDialog() {
  openSharedDialog(
    NotificationChannelInfoDialog,
    {
      notification: props.notification,
      notifications: props.notifications,
    },
    {
      change: (...args: unknown[]) => emit('change', ...args),
      done: () => emit('done'),
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

// 根据通知类型选择图标
const getIcon = computed(() => {
  if (props.notification.type === 'telegram') return getLogoUrl('telegram')
  if (props.notification.type === 'apppush') return getLogoUrl('notification')
  return getLogoUrl('wechat')
})

/** 关闭通知渠道卡片。 */
function onClose() {
  emit('close')
}
</script>

<template>
  <VCard v-bind="$attrs" variant="flat" class="app-card-shell setting-item-card" @click="openNotificationInfoDialog">
    <div class="setting-item-card__body">
      <div class="setting-item-card__icon-box" aria-hidden="true">
        <VImg :src="getIcon" contain width="22" height="22" max-width="22" max-height="22" />
      </div>

      <div class="setting-item-card__main">
        <div class="setting-item-card__head">
          <div class="setting-item-card__title-wrap">
            <span
              class="setting-item-card__dot"
              :class="{ 'setting-item-card__dot--active': props.notification.enabled }"
            />
            <span class="setting-item-card__title app-card-summary__title" :title="props.notification.name">
              {{ props.notification.name }}
            </span>
          </div>

          <div class="setting-item-card__actions" @click.stop>
            <VBtn
              variant="text"
              icon
              class="setting-item-card__action-btn"
              :loading="testing"
              :aria-label="t('setting.notification.sendTest')"
              @click.stop="testNotification"
            >
              <VIcon icon="mdi-send-check-outline" size="16" />
            </VBtn>
            <VBtn variant="text" icon class="setting-item-card__action-btn" @click.stop>
              <VIcon class="cursor-move" icon="mdi-drag" size="16" />
            </VBtn>
            <VBtn
              variant="text"
              icon
              class="setting-item-card__action-btn"
              :aria-label="t('common.delete')"
              @click.stop="onClose"
            >
              <VIcon icon="mdi-close" size="16" />
            </VBtn>
          </div>
        </div>

        <div class="setting-item-card__subtitle">
          <span>{{ channelTypeLabel }}</span>
          <span class="setting-item-card__sep">·</span>
          <span>{{ props.notification.enabled ? '已启用' : '未启用' }}</span>
        </div>
      </div>
    </div>
  </VCard>
</template>

<style scoped>
.setting-item-card {
  position: relative;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px !important;
  background-color: rgba(var(--v-theme-on-surface), 0.025) !important;
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}

.setting-item-card:hover {
  border-color: var(--mp-border-hover);
  background-color: rgba(var(--v-theme-on-surface), 0.045) !important;
}

.setting-item-card__body {
  display: flex;
  align-items: center;
  gap: 12px;
  min-block-size: 66px;
  padding: 12px 14px;
}

.setting-item-card__icon-box {
  display: inline-flex;
  flex: 0 0 38px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 9px;
  background: rgba(var(--v-theme-on-surface), 0.045);
  block-size: 38px;
  inline-size: 38px;
}

.setting-item-card__main {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 4px;
  min-inline-size: 0;
}

.setting-item-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-inline-size: 0;
}

.setting-item-card__title-wrap {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 6px;
  min-inline-size: 0;
}

.setting-item-card__dot {
  flex-shrink: 0;
  border-radius: 50%;
  background: rgba(var(--v-theme-on-surface), 0.28);
  block-size: 7px;
  inline-size: 7px;
}

.setting-item-card__dot--active {
  background: rgb(var(--v-theme-success));
}

.setting-item-card__title {
  overflow: hidden;
  color: rgb(var(--v-theme-on-surface));
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.setting-item-card__actions {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 2px;
}

.setting-item-card__action-btn {
  border-radius: 6px !important;
  block-size: 26px !important;
  color: rgba(var(--v-theme-on-surface), 0.56);
  inline-size: 26px !important;
  min-inline-size: 26px !important;
  padding: 0 !important;
}

.setting-item-card__action-btn:hover {
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgb(var(--v-theme-on-surface));
}

.setting-item-card__subtitle {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  gap: 4px 6px;
  line-height: 1.35;
  min-inline-size: 0;
}

.setting-item-card__sep {
  opacity: 0.55;
}
</style>
