<script setup lang="ts">
import api from '@/api'
import type { Storage } from '@/api/types'
import { formatDashboardFileSize, useAnimatedDashboardNumber } from '@/composables/useDashboardMotion'
import { useI18n } from '@/composables/useChineseText'
import { useKeepAliveRefresh } from '@/composables/useKeepAliveRefresh'

// 国际化
const { t } = useI18n()

// 总存储空间
const storage = ref(0)

// 已使用存储空间
const used = ref(0)

// 计算已使用存储空间百分比，精确到小数点后1位
const usedPercent = computed(() => {
  const percent = Math.round((used.value / (storage.value || 1)) * 1000) / 10

  return Math.min(Math.max(percent, 0), 100)
})

const animatedStorage = useAnimatedDashboardNumber(storage, {
  duration: 900,
})
const animatedUsed = useAnimatedDashboardNumber(used, {
  delay: 60,
  duration: 820,
})

const animatedUsedPercent = useAnimatedDashboardNumber(usedPercent, {
  delay: 80,
  duration: 780,
})

const animatedStorageText = computed(() => formatDashboardFileSize(animatedStorage.value, 2, storage.value))
const animatedUsedText = computed(() => formatDashboardFileSize(animatedUsed.value, 2, used.value))
const available = computed(() => Math.max(0, storage.value - used.value))
const availableText = computed(() => formatDashboardFileSize(available.value, 2, available.value))
const animatedUsedPercentValue = computed(() => Math.round(animatedUsedPercent.value * 10) / 10)
const animatedUsedPercentText = computed(() => animatedUsedPercentValue.value.toFixed(1))

// 调用API，查询存储空间
async function getStorage() {
  try {
    const res: Storage = await api.get('dashboard/storage')

    storage.value = Number(res.total_storage) || 0
    used.value = Number(res.used_storage) || 0
  } catch (e) {
    console.log(e)
  }
}

onMounted(() => {
  getStorage()
})

useKeepAliveRefresh(getStorage)
</script>

<template>
  <VCard class="dashboard-summary-card dashboard-grid-fill">
    <VCardItem class="dashboard-summary-header">
      <VCardTitle>{{ t('dashboard.storage') }}</VCardTitle>
      <template #append>
        <div class="storage-badge" aria-hidden="true">
          <VIcon icon="mdi-harddisk" size="18" />
        </div>
      </template>
    </VCardItem>
    <VCardText class="dashboard-summary-content">
      <div class="animated-storage-value">
        {{ animatedStorageText }}
      </div>
      <div class="animated-storage-meta">{{ t('storage.usedPercent', { percent: animatedUsedPercentText }) }}</div>
      <div class="animated-storage-progress-wrap">
        <VProgressLinear
          :model-value="animatedUsedPercentValue"
          class="animated-storage-progress"
          color="primary"
          height="6"
          rounded
        />
      </div>
      <div class="animated-storage-caption">
        {{
          t('dashboard.storageSummary', {
            available: availableText,
            total: animatedStorageText,
            used: animatedUsedText,
          })
        }}
      </div>
    </VCardText>
  </VCard>
</template>

<style lang="scss" scoped>
.storage-badge {
  display: grid;
  place-items: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 8px;
  background-color: rgba(var(--v-theme-primary), 0.1);
  block-size: 34px;
  color: rgb(var(--v-theme-primary));
  inline-size: 34px;
}

.dashboard-summary-card {
  position: relative;
  display: flex;
  overflow: hidden;
  flex-direction: column;
  block-size: 100%;
  min-block-size: 148px;
}

.dashboard-summary-header {
  padding: 14px 16px 6px;
}

.dashboard-summary-content {
  flex: 1 1 auto;
  min-block-size: 0;
  padding: 2px 16px 14px;
}

.animated-storage-value {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 22px;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  letter-spacing: -0.015em;
  line-height: 1.2;
}

.animated-storage-meta {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 13.5px;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  line-height: 1.3;
  margin-block-start: 6px;
}

.animated-storage-progress-wrap {
  margin-block-start: 10px;
}

.animated-storage-progress {
  overflow: hidden;
}

.animated-storage-caption {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  line-height: 1.35;
  margin-block-start: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (width <= 600px) {
  .dashboard-summary-card {
    min-block-size: 0;
  }

  .dashboard-summary-header {
    padding: 12px 14px 6px;
  }

  .dashboard-summary-content {
    padding: 2px 14px 12px;
  }

  .animated-storage-value {
    font-size: 19px;
  }

  .animated-storage-meta {
    font-size: 12.5px;
    margin-block-start: 4px;
  }

  .animated-storage-caption {
    overflow-wrap: anywhere;
    white-space: normal;
    word-break: normal;
  }
}
</style>
