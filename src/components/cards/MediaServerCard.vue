<script setup lang="ts">
import api from '@/api'
import type { MediaServerConf, MediaStatistic } from '@/api/types'
import { getLogoUrl } from '@/utils/imageUtils'
import { useI18n } from '@/composables/useChineseText'
import { mediaServerDict } from '@/api/constants'
import { openSharedDialog } from '@/composables/useSharedDialog'

const MediaServerInfoDialog = defineAsyncComponent(() => import('@/components/dialog/MediaServerInfoDialog.vue'))

// 获取i18n实例
const { t } = useI18n()

// 定义输入
const props = defineProps({
  // 单个媒体服务器
  mediaserver: {
    type: Object as PropType<MediaServerConf>,
    required: true,
  },
  // 所有媒体服务器
  mediaservers: {
    type: Array as PropType<MediaServerConf[]>,
    required: true,
  },
  // 旧版全局同步间隔，用作服务器未单独设置时的默认值
  defaultSyncInterval: {
    type: Number,
    default: null,
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['close', 'done', 'change'])

const serverTypeLabel = computed(() => mediaServerDict[props.mediaserver.type] || t('setting.system.custom'))

function createDefaultInfoItems() {
  return [
    {
      avatar: 'mdi-movie-roll',
      title: t('mediaType.movie'),
      amount: '0',
    },
    {
      avatar: 'mdi-television-box',
      title: t('mediaType.tv'),
      amount: '0',
    },
    {
      avatar: 'mdi-account',
      title: t('common.user'),
      amount: '0',
    },
  ]
}

// 媒体统计数据
const infoItems = ref(createDefaultInfoItems())

/** 打开共享媒体服务器配置弹窗。 */
function openMediaServerInfoDialog() {
  openSharedDialog(
    MediaServerInfoDialog,
    {
      mediaserver: props.mediaserver,
      mediaservers: props.mediaservers,
      defaultSyncInterval: props.defaultSyncInterval,
    },
    {
      change: (...args: unknown[]) => emit('change', ...args),
      done: () => {
        emit('done')
        void loadMediaStatistic()
      },
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

// 根据存储类型选择图标
const getIcon = computed(() => {
  switch (props.mediaserver.type) {
    case 'emby':
      return getLogoUrl('emby')
    case 'zspace':
      return getLogoUrl('zspace')
    case 'jellyfin':
      return getLogoUrl('jellyfin')
    case 'trimemedia':
      return getLogoUrl('trimemedia')
    case 'ugreen':
      return getLogoUrl('ugreen')
    case 'plex':
      return getLogoUrl('plex')
    case 'mediavault':
      return getLogoUrl('mediavault')
    default:
      return getLogoUrl('mediaserver')
  }
})

/** 关闭媒体服务器卡片。 */
function onClose() {
  emit('close')
}

/** 调用 API 加载媒体服务器统计数据。 */
async function loadMediaStatistic() {
  if (!props.mediaserver.enabled) {
    infoItems.value = createDefaultInfoItems()
    return
  }
  try {
    const res: MediaStatistic = await api.get('dashboard/statistic', {
      params: {
        name: props.mediaserver.name,
      },
    })

    if (res) {
      infoItems.value = [
        {
          avatar: 'mdi-movie-roll',
          title: t('mediaType.movie'),
          amount: res.movie_count.toLocaleString(),
        },
        {
          avatar: 'mdi-television-box',
          title: t('mediaType.tv'),
          amount: res.tv_count.toLocaleString(),
        },
        {
          avatar: 'mdi-account',
          title: t('common.user'),
          amount: res.user_count.toLocaleString(),
        },
      ]
    }
  } catch (e) {
    infoItems.value = createDefaultInfoItems()
    console.log(e)
  }
}

watch(
  () => [props.mediaserver.enabled, props.mediaserver.name, props.mediaserver.type, props.mediaserver.config],
  () => {
    void loadMediaStatistic()
  },
  { deep: true },
)

onMounted(() => {
  void loadMediaStatistic()
})
</script>

<template>
  <VCard v-bind="$attrs" variant="flat" class="app-card-shell setting-item-card" @click="openMediaServerInfoDialog">
    <div class="setting-item-card__body">
      <div class="setting-item-card__icon-box" aria-hidden="true">
        <VImg :src="getIcon" contain width="22" height="22" max-width="22" max-height="22" />
      </div>

      <div class="setting-item-card__main">
        <div class="setting-item-card__head">
          <div class="setting-item-card__title-wrap">
            <span class="setting-item-card__dot" :class="{ 'setting-item-card__dot--active': mediaserver.enabled }" />
            <span class="setting-item-card__title app-card-summary__title" :title="mediaserver.name">
              {{ mediaserver.name }}
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
          <template v-if="mediaServerDict[mediaserver.type] && mediaserver.enabled">
            <span v-for="item in infoItems" :key="item.title" class="setting-item-card__stat">
              <VIcon :icon="item.avatar" size="13" class="me-1 shrink-0" />
              <span>{{ item.amount }}</span>
            </span>
          </template>
          <template v-else>
            <span>{{ serverTypeLabel }}</span>
            <span class="setting-item-card__sep">·</span>
            <span>{{ mediaserver.enabled ? '已启用' : '未启用' }}</span>
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
  border: 1px solid var(--mp-border-hover);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.12);
  block-size: 38px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
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
  gap: 4px 10px;
  line-height: 1.35;
  min-inline-size: 0;
}

.setting-item-card__stat {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}

.setting-item-card__sep {
  opacity: 0.55;
}
</style>
