<script setup lang="ts">
import api from '@/api'
import type { DashboardSystemInfo } from '@/api/types'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useBackground } from '@/composables/useBackground'
import { useI18n } from '@/composables/useChineseText'

const AboutDialog = defineAsyncComponent(() => import('@/components/dialog/AboutDialog.vue'))

const props = defineProps({
  // 是否允许刷新数据
  allowRefresh: {
    type: Boolean,
    default: true,
  },
})

const { t } = useI18n()
const { useDataRefresh } = useBackground()

// 系统摘要与本地运行时间校准点。
const systemInfo = ref<DashboardSystemInfo | null>(null)
const runtimeSyncedAt = ref(Date.now())
const runtimeNow = ref(Date.now())
let runtimeTimer: ReturnType<typeof setInterval> | null = null

const displayedRuntime = computed(() => {
  if (!systemInfo.value) return 0

  return systemInfo.value.runtime + Math.floor((runtimeNow.value - runtimeSyncedAt.value) / 1000)
})

/** 查询系统摘要并重新校准本地运行时间。 */
async function loadSystemInfo() {
  if (!props.allowRefresh) return

  try {
    systemInfo.value = await api.get('dashboard/system')
    runtimeSyncedAt.value = Date.now()
    runtimeNow.value = runtimeSyncedAt.value
  } catch (error) {
    console.error(error)
  }
}

/** 将运行秒数压缩为天、小时、分钟三级文本。 */
function formatRuntime(totalSeconds: number) {
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  return t('dashboard.systemInfo.runtimeValue', { days, hours, minutes })
}

/** 打开关于页复用现有版本检查能力。 */
function openVersionDetails() {
  openSharedDialog(AboutDialog, {}, {}, { closeOn: ['close', 'update:modelValue'] })
}

useDataRefresh('dashboard-system-info', loadSystemInfo, 60000, true)

function startRuntimeTimer() {
  if (runtimeTimer !== null) return
  runtimeNow.value = Date.now()
  runtimeTimer = setInterval(() => {
    runtimeNow.value = Date.now()
  }, 60000)
}

function stopRuntimeTimer() {
  if (runtimeTimer !== null) {
    clearInterval(runtimeTimer)
    runtimeTimer = null
  }
}

onMounted(() => {
  startRuntimeTimer()
})

onActivated(() => {
  startRuntimeTimer()
})

onDeactivated(() => {
  stopRuntimeTimer()
})

onBeforeUnmount(() => {
  stopRuntimeTimer()
})
</script>

<template>
  <VCard class="dashboard-system-card dashboard-grid-fill">
    <VCardItem class="dashboard-system-heading">
      <template #prepend>
        <span class="dashboard-system-icon" aria-hidden="true">
          <VIcon icon="mdi-server-outline" size="18" />
        </span>
      </template>
      <VCardTitle>{{ t('dashboard.systemInfo.title') }}</VCardTitle>
    </VCardItem>
    <VCardText class="dashboard-system-content">
      <dl class="dashboard-system-grid">
        <div>
          <dt>{{ t('dashboard.systemInfo.hostname') }}</dt>
          <dd>{{ systemInfo?.hostname || '—' }}</dd>
        </div>
        <div>
          <dt>{{ t('dashboard.systemInfo.operatingSystem') }}</dt>
          <dd>{{ systemInfo?.operating_system || '—' }}</dd>
        </div>
        <div>
          <dt>{{ t('dashboard.systemInfo.runtime') }}</dt>
          <dd>{{ systemInfo ? formatRuntime(displayedRuntime) : '—' }}</dd>
        </div>
      </dl>
      <div class="dashboard-system-footer">
        <span>{{ t('dashboard.systemInfo.version') }}</span>
        <strong>{{ systemInfo?.version || '—' }}</strong>
        <VBtn size="small" variant="text" color="primary" class="dashboard-grid-no-drag" @click="openVersionDetails">
          {{ t('dashboard.systemInfo.checkUpdate') }}
        </VBtn>
      </div>
    </VCardText>
  </VCard>
</template>

<style scoped>
.dashboard-system-card {
  display: flex;
  flex-direction: column;
  block-size: 100%;
}

.dashboard-system-heading {
  padding: 14px 16px 8px;
}

.dashboard-system-icon {
  display: grid;
  place-items: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 8px;
  background-color: rgba(var(--v-theme-primary), 0.1);
  block-size: 34px;
  color: rgb(var(--v-theme-primary));
  inline-size: 34px;
  margin-inline-end: 10px;
}

.dashboard-system-content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  padding: 4px 16px 12px;
}

.dashboard-system-grid {
  display: grid;
  grid-template-columns: 0.85fr 1.2fr 1fr;
  margin: 0;
}

.dashboard-system-grid > div {
  min-inline-size: 0;
  padding-inline: 13px;
}

.dashboard-system-grid > div:first-child {
  padding-inline-start: 0;
}

.dashboard-system-grid > div:last-child {
  padding-inline-end: 0;
}

.dashboard-system-grid > div + div {
  border-inline-start: 1px solid var(--mp-border-subtle);
}

.dashboard-system-grid dt,
.dashboard-system-footer > span {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11.5px;
  line-height: 1.3;
}

.dashboard-system-grid dd {
  overflow: hidden;
  margin: 4px 0 0;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 13.5px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-system-footer {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  border-block-start: 1px solid var(--mp-border-subtle);
  gap: 8px;
  margin-block-start: auto;
  padding-block-start: 8px;
}

.dashboard-system-footer strong {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

@media (max-width: 740px) {
  .dashboard-system-grid {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .dashboard-system-grid > div {
    padding-inline: 0;
  }

  .dashboard-system-grid > div + div {
    border-inline-start: 0;
  }
}
</style>
