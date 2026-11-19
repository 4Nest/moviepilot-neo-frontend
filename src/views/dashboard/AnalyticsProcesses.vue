<script lang="ts" setup>
import { formatSeconds } from '@/@core/utils/formatters'
import api from '@/api'
import type { Process } from '@/api/types'
import { useI18n } from '@/composables/useChineseText'
import { useBackground } from '@/composables/useBackground'

// 国际化
const { t } = useI18n()
const { useDataRefresh } = useBackground()

// 表头
const headers = [
  t('dashboard.processes.pid'),
  t('dashboard.processes.name'),
  t('dashboard.processes.runtime'),
  t('dashboard.processes.memory'),
]

// 数据列表
const processList = ref<Process[]>([])

// 调用API加载数据
async function loadProcessList() {
  try {
    const res: Process[] = await api.get('dashboard/processes')

    processList.value = res
  } catch (e) {
    console.log(e)
  }
}

// 使用数据刷新定时器
useDataRefresh(
  'dashboard-processes',
  loadProcessList,
  5000, // 5秒间隔
  true, // 立即执行
)
</script>

<template>
  <VCard class="dashboard-processes-card">
    <VCardItem class="dashboard-processes-header">
      <template #prepend>
        <span class="processes-icon-box" aria-hidden="true">
          <VIcon icon="mdi-application-cog-outline" size="18" />
        </span>
      </template>
      <VCardTitle>{{ t('dashboard.processes.title') }}</VCardTitle>
      <template v-if="processList.length" #append>
        <span class="processes-count-badge">{{ processList.length }}</span>
      </template>
    </VCardItem>
    <VTable item-key="fullName" class="dashboard-processes-table table-rounded" hide-default-footer disable-sort>
      <thead>
        <tr>
          <th v-for="header in headers" :id="header" :key="header">
            {{ header }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in processList" :key="row.pid">
          <td class="process-tabular">{{ row.pid }}</td>
          <td>
            <span class="process-name">
              <i class="process-status-dot" aria-hidden="true" />
              {{ row.name }}
            </span>
          </td>
          <td class="process-tabular process-muted">{{ formatSeconds(row.run_time) }}</td>
          <td class="process-tabular">
            <span class="process-memory-badge">{{ row.memory }} MB</span>
          </td>
        </tr>
      </tbody>
    </VTable>
  </VCard>
</template>

<style scoped>
.dashboard-processes-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dashboard-processes-header {
  padding: 14px 16px 8px;
}

.processes-icon-box {
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

.processes-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 6px;
  background-color: var(--mp-item-bg);
  block-size: 21px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  min-inline-size: 24px;
  padding-inline: 7px;
}

.dashboard-processes-table :deep(thead th) {
  block-size: 36px !important;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px !important;
  font-weight: 600 !important;
  padding-inline: 16px !important;
}

.dashboard-processes-table :deep(tbody td) {
  block-size: 40px !important;
  font-size: 13px !important;
  padding-inline: 16px !important;
}

.process-tabular {
  font-variant-numeric: tabular-nums;
}

.process-muted {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12.5px;
}

.process-name {
  display: inline-flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 13px;
  font-weight: 600;
  gap: 8px;
}

.process-status-dot {
  flex-shrink: 0;
  border-radius: 50%;
  background-color: rgb(var(--v-theme-success));
  block-size: 6px;
  inline-size: 6px;
}

.process-memory-badge {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 6px;
  background-color: var(--mp-item-bg);
  block-size: 21px;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 11.5px;
  font-weight: 600;
  padding-inline: 8px;
  white-space: nowrap;
}

@media (width <= 600px) {
  .dashboard-processes-header {
    padding: 12px 14px 6px;
  }

  .dashboard-processes-table {
    overflow-x: auto;
  }

  .dashboard-processes-table :deep(thead th),
  .dashboard-processes-table :deep(tbody td) {
    font-size: 12px !important;
    padding-inline: 10px !important;
    white-space: nowrap;
  }
}
</style>
