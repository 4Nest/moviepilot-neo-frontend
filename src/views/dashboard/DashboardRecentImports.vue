<script setup lang="ts">
import api from '@/api'
import type { TransferHistory } from '@/api/types'
import noImage from '@images/no-image.jpeg'
import { formatDateDifference, formatFileSize } from '@/@core/utils/formatters'
import { useI18n } from '@/composables/useChineseText'
import { useKeepAliveRefresh } from '@/composables/useKeepAliveRefresh'

const { t } = useI18n()

// 最近成功整理入库的记录。
const recentImports = ref<TransferHistory[]>([])

/** 查询最近成功整理的媒体记录。 */
async function loadRecentImports() {
  try {
    const response: { data?: { list?: TransferHistory[] } } = await api.get('history/transfer', {
      params: { page: 1, count: 5, status: true },
    })
    recentImports.value = response.data?.list ?? []
  } catch (error) {
    console.error(error)
  }
}

/** 返回经过后端图片代理的海报地址。 */
function getPosterUrl(item: TransferHistory) {
  if (!item.image) return noImage

  return `${import.meta.env.VITE_API_BASE_URL}system/img/0?imgurl=${encodeURIComponent(item.image)}`
}

/** 组合媒体类型、季集和文件大小作为记录副标题。 */
function getImportMeta(item: TransferHistory) {
  const values = [item.type, item.seasons, item.episodes]
  const fileSize = Number(item.src_fileitem?.size ?? 0)
  if (fileSize > 0) values.push(formatFileSize(fileSize))

  return values.filter(Boolean).join(' · ')
}

onMounted(loadRecentImports)
useKeepAliveRefresh(loadRecentImports)
</script>

<template>
  <VCard class="dashboard-list-card dashboard-grid-fill">
    <VCardItem class="dashboard-card-heading">
      <VCardTitle>{{ t('dashboard.recentImports') }}</VCardTitle>
      <template #append>
        <VBtn size="small" variant="outlined" to="/history">{{ t('dashboard.viewAll') }}</VBtn>
      </template>
    </VCardItem>

    <VCardText class="recent-import-list">
      <!-- 非空列表使用自然内容高度，避免外层填充布局隐藏异步增长。 -->
      <div v-if="recentImports.length > 0" data-layout-size-source>
        <div v-for="item in recentImports" :key="item.id" class="recent-import-item">
          <VImg :src="getPosterUrl(item)" :alt="item.title" class="recent-import-poster" cover />
          <div class="recent-import-copy">
            <div class="recent-import-title">
              {{ item.title }}<span v-if="item.year"> ({{ item.year }})</span>
            </div>
            <div class="recent-import-meta">{{ getImportMeta(item) }}</div>
          </div>
          <div class="recent-import-time">
            {{ item.date ? formatDateDifference(item.date) : '' }}
            <VIcon
              :icon="item.status === false ? 'mdi-alert-circle' : 'mdi-check-circle'"
              :color="item.status === false ? 'error' : 'success'"
              size="16"
            />
          </div>
        </div>
      </div>

      <div v-if="recentImports.length === 0" class="recent-import-empty text-medium-emphasis">
        <VIcon icon="mdi-movie-open-plus-outline" size="32" />
        <span>{{ t('dashboard.noRecentImports') }}</span>
      </div>
    </VCardText>
  </VCard>
</template>

<style scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.dashboard-list-card {
  display: flex;
  flex-direction: column;
  block-size: 100%;
  min-block-size: 350px;
}

.dashboard-card-heading {
  padding: 16px 18px 10px !important;
}

.dashboard-card-heading :deep(.v-card-title) {
  font-size: 15.5px;
  font-weight: 600;
  line-height: 1.35;
}

.recent-import-list {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
  padding: 2px 18px 16px !important;
}

.recent-import-item {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 13px;
  min-block-size: 64px;
  padding-block: 7px;
}

.recent-import-item + .recent-import-item {
  border-block-start: 1px solid var(--mp-border-subtle);
}

.recent-import-poster {
  border: 1px solid var(--mp-border-subtle);
  border-radius: 8px;
  block-size: 58px;
  inline-size: 42px;
}

.recent-import-copy {
  min-inline-size: 0;
}

.recent-import-title {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-import-meta,
.recent-import-time {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.recent-import-meta {
  overflow: hidden;
  margin-block-start: 4px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-import-time {
  display: flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}

.recent-import-empty {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
}

@media (width <= 600px) {
  .dashboard-list-card {
    min-block-size: 0;
  }

  .dashboard-card-heading {
    padding: 12px 14px 8px !important;
  }

  .dashboard-card-heading :deep(.v-card-title) {
    font-size: 14px;
  }

  .recent-import-list {
    padding: 2px 14px 12px !important;
  }

  .recent-import-item {
    grid-template-columns: 38px minmax(0, 1fr) auto;
    gap: 10px;
    min-block-size: 56px;
    padding-block: 6px;
  }

  .recent-import-poster {
    border-radius: 7px;
    block-size: 52px;
    inline-size: 38px;
  }

  .recent-import-title {
    font-size: 13px;
  }

  .recent-import-meta,
  .recent-import-time {
    font-size: 11.5px;
  }

  .recent-import-empty {
    padding-block: 24px;
  }
}
</style>
