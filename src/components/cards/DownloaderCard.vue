<script setup lang="ts">
import api from '@/api'
import { formatFileSize } from '@/@core/utils/formatters'
import type { DownloaderConf, DownloaderInfo } from '@/api/types'
import { getLogoUrl } from '@/utils/imageUtils'
import { useI18n } from '@/composables/useChineseText'
import { downloaderDict } from '@/api/constants'
import { useBackground } from '@/composables/useBackground'
import { openSharedDialog } from '@/composables/useSharedDialog'

const DownloaderInfoDialog = defineAsyncComponent(() => import('@/components/dialog/DownloaderInfoDialog.vue'))

// 获取i18n实例
const { t } = useI18n()
const { useConditionalDataRefresh } = useBackground()

// 定义输入
const props = defineProps({
  // 单个下载器
  downloader: {
    type: Object as PropType<DownloaderConf>,
    required: true,
  },
  // 是否允许刷新数据
  allowRefresh: {
    type: Boolean,
    default: true,
  },
  // 所有下载器
  downloaders: {
    type: Array as PropType<DownloaderConf[]>,
    required: true,
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['close', 'done', 'change'])

// 上传速率
const upload_rate = ref(0)

// 下载速度
const download_rate = ref(0)

// 下载器是否应该刷新数据的计算属性
const shouldRefresh = computed(() => props.allowRefresh && props.downloader.enabled)

// 下载器类型展示名
const downloaderTypeLabel = computed(() => downloaderDict[props.downloader.type] || t('setting.system.custom'))

/** 调用 API 查询下载器实时速率数据。 */
async function loadDownloaderInfo() {
  if (!shouldRefresh.value) {
    upload_rate.value = 0
    download_rate.value = 0
    return
  }
  try {
    const res: DownloaderInfo = await api.get('dashboard/downloader', {
      params: {
        name: props.downloader.name,
      },
    })

    if (res) {
      upload_rate.value = res.upload_speed
      download_rate.value = res.download_speed
    }
  } catch (e) {
    console.log(e)
  }
}

/** 打开共享下载器配置弹窗。 */
function openDownloaderInfoDialog() {
  openSharedDialog(
    DownloaderInfoDialog,
    {
      downloader: props.downloader,
      downloaders: props.downloaders,
    },
    {
      change: (...args: unknown[]) => emit('change', ...args),
      done: () => emit('done'),
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

// 根据存储类型选择图标
const getIcon = computed(() => {
  switch (props.downloader.type) {
    case 'qbittorrent':
      return getLogoUrl('qbittorrent')
    case 'transmission':
      return getLogoUrl('transmission')
    case 'rtorrent':
      return getLogoUrl('rtorrent')
    default:
      return getLogoUrl('downloader')
  }
})

/** 关闭下载器卡片。 */
function onClose() {
  emit('close')
}

// 使用条件性数据刷新定时器（只在下载器启用时运行）
const { stop: stopRefresh } = useConditionalDataRefresh(
  `downloader-${props.downloader.name}`,
  loadDownloaderInfo,
  shouldRefresh,
  3000,
  true,
)

onUnmounted(() => {
  stopRefresh()
})
</script>

<template>
  <VCard v-bind="$attrs" variant="flat" class="app-card-shell setting-item-card" @click="openDownloaderInfoDialog">
    <div class="setting-item-card__body">
      <div class="setting-item-card__icon-box" aria-hidden="true">
        <VImg :src="getIcon" contain width="22" height="22" max-width="22" max-height="22" />
      </div>

      <div class="setting-item-card__main">
        <div class="setting-item-card__head">
          <div class="setting-item-card__title-wrap">
            <span
              class="setting-item-card__dot"
              :class="{ 'setting-item-card__dot--active': props.downloader.enabled }"
            />
            <span class="setting-item-card__title app-card-summary__title" :title="downloader.name">
              {{ downloader.name }}
            </span>
            <span
              v-if="props.downloader.default && props.downloader.enabled"
              class="setting-item-card__badge setting-item-card__badge--primary"
            >
              {{ t('common.default') }}
            </span>
            <span
              v-if="props.downloader.bt_default && props.downloader.enabled"
              class="setting-item-card__badge setting-item-card__badge--neutral"
            >
              BT
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
          <template v-if="downloaderDict[downloader.type] && props.downloader.enabled">
            <span>{{ `↑ ${formatFileSize(upload_rate, 1)}/s` }}</span>
            <span class="setting-item-card__sep">·</span>
            <span>{{ `↓ ${formatFileSize(download_rate, 1)}/s` }}</span>
          </template>
          <template v-else>
            <span>{{ downloaderTypeLabel }}</span>
            <span class="setting-item-card__sep">·</span>
            <span>{{ props.downloader.enabled ? '已启用' : '未启用' }}</span>
          </template>
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

.setting-item-card__badge {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  border-radius: 5px;
  block-size: 20px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  padding-inline: 6px;
}

.setting-item-card__badge--primary {
  background: rgba(var(--v-theme-primary), 0.14);
  color: rgb(var(--v-theme-primary));
}

.setting-item-card__badge--neutral {
  background: rgba(var(--v-theme-on-surface), 0.08);
  color: rgba(var(--v-theme-on-surface), 0.78);
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
