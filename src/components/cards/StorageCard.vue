<script setup lang="ts">
import type { StorageConf } from '@/api/types'
import { formatBytes } from '@core/utils/formatters'
import storage_png from '@images/misc/storage.png'
import alipan_png from '@images/misc/alipan.webp'
import u115_png from '@images/misc/u115.png'
import rclone_png from '@images/misc/rclone.png'
import alist_png from '@images/misc/openlist.svg'
import alistgo_png from '@images/misc/alist.svg'
import custom_png from '@images/misc/database.png'
import smb_png from '@images/misc/smb.png'
import api from '@/api'
import { useToast } from 'vue-toastification'
import { isNullOrEmptyObject } from '@/@core/utils'
import { useI18n } from '@/composables/useChineseText'
import { openSharedDialog } from '@/composables/useSharedDialog'

const AliyunAuthDialog = defineAsyncComponent(() => import('../dialog/AliyunAuthDialog.vue'))
const U115AuthDialog = defineAsyncComponent(() => import('../dialog/U115AuthDialog.vue'))
const RcloneConfigDialog = defineAsyncComponent(() => import('../dialog/RcloneConfigDialog.vue'))
const AlistConfigDialog = defineAsyncComponent(() => import('../dialog/AlistConfigDialog.vue'))
const SmbConfigDialog = defineAsyncComponent(() => import('../dialog/SmbConfigDialog.vue'))
const StorageCustomConfigDialog = defineAsyncComponent(() => import('../dialog/StorageCustomConfigDialog.vue'))

// 国际化
const { t } = useI18n()

// 定义输入
const props = defineProps({
  storage: {
    type: Object as PropType<StorageConf>,
    required: true,
  },
})

// 定义事件
const emit = defineEmits(['done', 'close'])

// 提示信息
const $toast = useToast()

// 存储总空间
const total = ref(0)

// 存储可用空间
const available = ref(0)

// 储存已用空间
const used = computed(() => {
  return total.value - available.value
})

const storageTypeLabel = computed(() => {
  const rawType = props.storage.type
  if (!rawType || rawType.startsWith('custom')) return t('storage.custom')
  return t(`storage.${rawType}`)
})

const isConfigured = computed(() => props.storage.type === 'local' || !isNullOrEmptyObject(props.storage.config))

/** 打开指定类型的共享存储配置弹窗。 */
function openStorageDialog() {
  const dialogMap: Record<string, Component> = {
    alipan: AliyunAuthDialog,
    u115: U115AuthDialog,
    rclone: RcloneConfigDialog,
    alist: AlistConfigDialog,
    alistgo: AlistConfigDialog,
    smb: SmbConfigDialog,
  }

  if (props.storage.type === 'local') {
    $toast.info(t('storage.noConfigNeeded'))
    return
  }

  const dialog = dialogMap[props.storage.type] || StorageCustomConfigDialog
  const dialogProps =
    dialog === StorageCustomConfigDialog
      ? { storage: props.storage }
      : dialog === AlistConfigDialog
        ? { conf: props.storage.config || {}, type: props.storage.type }
        : { conf: props.storage.config || {} }

  openSharedDialog(
    dialog,
    dialogProps,
    {
      done: handleDone,
    },
    { closeOn: ['close', 'done', 'update:modelValue'] },
  )
}

// 根据存储类型选择图标
const getIcon = computed(() => {
  switch (props.storage.type) {
    case 'local':
      return storage_png
    case 'alipan':
      return alipan_png
    case 'u115':
      return u115_png
    case 'rclone':
      return rclone_png
    case 'alist':
      return alist_png
    case 'alistgo':
      return alistgo_png
    case 'smb':
      return smb_png
    default:
      return custom_png
  }
})

// 计算进度条颜色
const progressColor = computed(() => {
  if (usage.value > 90) {
    return 'error'
  } else if (usage.value > 70) {
    return 'warning'
  } else {
    return 'primary'
  }
})

// 计算存储使用率
const usage = computed(() => {
  return Math.round((used.value / (total.value || 1)) * 1000) / 10
})

/** 查询存储空间使用信息。 */
async function queryStorage() {
  if (!isConfigured.value) {
    total.value = 0
    available.value = 0
    return
  }
  try {
    const data: { total: number; available: number } = await api.get(`storage/usage/${props.storage.type}`)
    total.value = data?.total ?? 0
    available.value = data?.available ?? 0
  } catch (error) {
    total.value = 0
    available.value = 0
    console.error(error)
  }
}

/** 完成配置后的处理并通知父级刷新。 */
function handleDone(storage?: StorageConf) {
  emit('done', storage || props.storage)
  void queryStorage()
}

watch(
  () => [props.storage.type, props.storage.config],
  () => {
    void queryStorage()
  },
  { deep: true },
)

onMounted(() => {
  void queryStorage()
})

/** 关闭存储卡片。 */
function onClose() {
  emit('close')
}
</script>

<template>
  <VCard v-bind="$attrs" variant="flat" class="app-card-shell setting-item-card" @click="openStorageDialog">
    <div class="setting-item-card__body">
      <div class="setting-item-card__icon-box" aria-hidden="true">
        <VImg :src="getIcon" contain width="22" height="22" max-width="22" max-height="22" />
      </div>

      <div class="setting-item-card__main">
        <div class="setting-item-card__head">
          <div class="setting-item-card__title-wrap">
            <span class="setting-item-card__dot" :class="{ 'setting-item-card__dot--active': isConfigured }" />
            <span class="setting-item-card__title app-card-summary__title" :title="storage.name">
              {{ storage.name }}
            </span>
          </div>

          <div class="setting-item-card__actions" @click.stop>
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
          <template v-if="total > 0">
            <span>{{ formatBytes(used, 1) }} / {{ formatBytes(total, 1) }}</span>
            <span class="setting-item-card__sep">·</span>
            <span>{{ usage }}%</span>
          </template>
          <template v-else>
            <span>{{ storageTypeLabel }}</span>
            <span class="setting-item-card__sep">·</span>
            <span>{{ isConfigured ? '已就绪' : t('storage.notConfigured') }}</span>
          </template>
        </div>
      </div>
    </div>

    <div v-if="usage > 0" class="setting-item-card__progress">
      <VProgressLinear :model-value="usage" :color="progressColor" bg-color="surface-variant" height="3" />
    </div>
  </VCard>
</template>

<style scoped>
.setting-item-card {
  position: relative;
  overflow: hidden;
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

.setting-item-card__progress {
  position: absolute;
  inset-block-end: 0;
  inset-inline: 0;
}
</style>
