<script setup lang="ts">
import api from '@/api'
import type { DownloaderInfo } from '@/api/types'
import { formatDashboardFileSize, useAnimatedDashboardNumber } from '@/composables/useDashboardMotion'
import { useI18n } from '@/composables/useChineseText'
import { useBackground } from '@/composables/useBackground'

// 国际化
const { t } = useI18n()
const { useDataRefresh } = useBackground()

// 输入参数
const props = defineProps({
  // 是否允许刷新数据
  allowRefresh: {
    type: Boolean,
    default: true,
  },
})

// 下载器信息
const downloadInfo = ref<DownloaderInfo>({
  // 下载速度
  download_speed: 0,

  // 上传速度
  upload_speed: 0,

  // 下载量
  download_size: 0,

  // 上传量
  upload_size: 0,

  // 剩余空间
  free_space: 0,
})

const animatedUploadSpeed = useAnimatedDashboardNumber(
  computed(() => downloadInfo.value.upload_speed),
  {
    duration: 520,
  },
)

const animatedDownloadSpeed = useAnimatedDashboardNumber(
  computed(() => downloadInfo.value.download_speed),
  {
    duration: 520,
  },
)

const animatedUploadSize = useAnimatedDashboardNumber(
  computed(() => downloadInfo.value.upload_size),
  {
    delay: 80,
    duration: 760,
  },
)

const animatedDownloadSize = useAnimatedDashboardNumber(
  computed(() => downloadInfo.value.download_size),
  {
    delay: 130,
    duration: 760,
  },
)

const animatedFreeSpace = useAnimatedDashboardNumber(
  computed(() => downloadInfo.value.free_space),
  {
    delay: 180,
    duration: 760,
  },
)

const uploadSpeedText = computed(
  () => `${formatDashboardFileSize(animatedUploadSpeed.value, 2, downloadInfo.value.upload_speed)}/s`,
)
const downloadSpeedText = computed(
  () => `${formatDashboardFileSize(animatedDownloadSpeed.value, 2, downloadInfo.value.download_speed)}/s`,
)

// 显示项
const infoItems = computed(() => [
  {
    avatar: 'mdi-cloud-upload',
    title: t('dashboard.speed.totalUpload'),
    amount: formatDashboardFileSize(animatedUploadSize.value, 2, downloadInfo.value.upload_size),
  },
  {
    avatar: 'mdi-download-box',
    title: t('dashboard.speed.totalDownload'),
    amount: formatDashboardFileSize(animatedDownloadSize.value, 2, downloadInfo.value.download_size),
  },
  {
    avatar: 'mdi-content-save',
    title: t('dashboard.speed.freeSpace'),
    amount: formatDashboardFileSize(animatedFreeSpace.value, 2, downloadInfo.value.free_space),
  },
])

// 调用API查询下载器数据
async function loadDownloaderInfo() {
  if (!props.allowRefresh) {
    return
  }

  try {
    const res: DownloaderInfo = await api.get('dashboard/downloader')

    downloadInfo.value = {
      download_speed: Number(res.download_speed) || 0,
      upload_speed: Number(res.upload_speed) || 0,
      download_size: Number(res.download_size) || 0,
      upload_size: Number(res.upload_size) || 0,
      free_space: Number(res.free_space) || 0,
    }
  } catch (e) {
    console.log(e)
  }
}

// 使用数据刷新定时器
const { loading } = useDataRefresh(
  'analytics-speed',
  loadDownloaderInfo,
  5000, // 下载概况每五秒更新，首次加载仍立即执行。
  true, // 立即执行
)
</script>

<template>
  <VCard class="dashboard-work-card dashboard-grid-fill">
    <VCardItem class="dashboard-work-header">
      <VCardTitle>{{ t('dashboard.realTimeSpeed') }}</VCardTitle>
    </VCardItem>

    <VCardText class="dashboard-work-content">
      <div class="dashboard-speed-overview">
        <div class="dashboard-speed-rate">
          <span class="dashboard-speed-icon dashboard-speed-icon--upload" aria-hidden="true">
            <VIcon icon="mdi-arrow-up" size="18" />
          </span>
          <strong class="dashboard-speed-number">{{ uploadSpeedText }}</strong>
          <span class="dashboard-speed-label">{{ t('dashboard.uploadSpeed') }}</span>
        </div>
        <div class="dashboard-speed-rate">
          <span class="dashboard-speed-icon dashboard-speed-icon--download" aria-hidden="true">
            <VIcon icon="mdi-arrow-down" size="18" />
          </span>
          <strong class="dashboard-speed-number">{{ downloadSpeedText }}</strong>
          <span class="dashboard-speed-label">{{ t('dashboard.downloadSpeed') }}</span>
        </div>
      </div>

      <div class="dashboard-speed-divider" />

      <div class="dashboard-speed-stats">
        <div v-for="item in infoItems" :key="item.title" class="dashboard-speed-stat-row">
          <span class="dashboard-speed-stat-icon" aria-hidden="true">
            <VIcon :icon="item.avatar" size="16" />
          </span>
          <span class="dashboard-speed-stat-title">{{ item.title }}</span>
          <strong class="dashboard-speed-number dashboard-speed-stat-amount">{{ item.amount }}</strong>
        </div>
      </div>
    </VCardText>
  </VCard>
</template>

<style lang="scss" scoped>
.dashboard-work-card {
  display: flex;
  flex-direction: column;
  block-size: auto;
  min-block-size: 0;
}

.dashboard-work-header {
  padding: 14px 16px 8px;
}

.dashboard-work-content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
  overflow: hidden;
  padding: 4px 16px 14px;
}

.dashboard-speed-number {
  font-variant-numeric: tabular-nums;
}

.dashboard-speed-overview {
  display: grid;
  gap: 8px;
}

.dashboard-speed-rate {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.dashboard-speed-icon {
  display: grid;
  place-items: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 8px;
  block-size: 34px;
  inline-size: 34px;
}

.dashboard-speed-icon--upload {
  background-color: rgba(var(--v-theme-info), 0.1);
  color: rgb(var(--v-theme-info));
}

.dashboard-speed-icon--download {
  background-color: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
}

.dashboard-speed-rate strong {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 21px;
  font-weight: 650;
  letter-spacing: -0.015em;
  line-height: 1.25;
}

.dashboard-speed-label {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11.5px;
  white-space: nowrap;
}

.dashboard-speed-divider {
  border-block-start: 1px solid var(--mp-border-subtle);
  margin-block: 13px 10px;
}

.dashboard-speed-stats {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 6px;
  min-block-size: 0;
  overflow: auto;
}

.dashboard-speed-stat-row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-block-size: 32px;
}

.dashboard-speed-stat-icon {
  display: grid;
  place-items: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 7px;
  background-color: var(--mp-item-bg);
  block-size: 28px;
  color: rgba(var(--v-theme-on-surface), 0.72);
  inline-size: 28px;
}

.dashboard-speed-stat-title {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-speed-stat-amount {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 13.5px;
  font-weight: 600;
  white-space: nowrap;
}

@media (width <= 600px) {
  .dashboard-work-header {
    padding: 12px 14px 6px;
  }

  .dashboard-work-content {
    padding: 4px 14px 12px;
  }

  .dashboard-speed-rate {
    gap: 8px;
  }

  .dashboard-speed-rate strong {
    overflow: hidden;
    font-size: 18px;
    min-inline-size: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dashboard-speed-divider {
    margin-block: 10px 8px;
  }

  .dashboard-speed-stat-row {
    gap: 8px;
    min-block-size: 30px;
  }

  .dashboard-speed-stat-title {
    font-size: 12.5px;
  }

  .dashboard-speed-stat-amount {
    font-size: 12.5px;
  }
}
</style>
