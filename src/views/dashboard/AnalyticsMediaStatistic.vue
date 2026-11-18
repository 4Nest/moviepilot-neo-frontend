<script setup lang="ts">
import api from '@/api'
import type { MediaStatistic } from '@/api/types'
import { formatDashboardCount, useAnimatedDashboardNumber } from '@/composables/useDashboardMotion'
import { useDashboardSnapshot } from '@/composables/useDashboardSnapshot'
import { useI18n } from '@/composables/useChineseText'
import { useKeepAliveRefresh } from '@/composables/useKeepAliveRefresh'

// 国际化
const { t } = useI18n()

const { readSnapshot, writeSnapshot } = useDashboardSnapshot<MediaStatistic>('media-statistic-v1')
const currentSnapshot = readSnapshot()

const movieCount = ref(Number(currentSnapshot?.value.movie_count) || 0)
const tvCount = ref(Number(currentSnapshot?.value.tv_count) || 0)
const episodeCount = ref<number | null>(
  currentSnapshot?.value.episode_count == null ? null : Number(currentSnapshot.value.episode_count) || 0,
)
const userCount = ref(Number(currentSnapshot?.value.user_count) || 0)
const movieCountMonth = ref(Number(currentSnapshot?.value.movie_count_month) || 0)
const tvCountMonth = ref(Number(currentSnapshot?.value.tv_count_month) || 0)
const episodeCountMonth = ref(Number(currentSnapshot?.value.episode_count_month) || 0)
let statisticLoadId = 0

const animatedMovieCount = useAnimatedDashboardNumber(movieCount, {
  duration: 720,
})

const animatedTvCount = useAnimatedDashboardNumber(tvCount, {
  delay: 60,
  duration: 720,
})

const animatedEpisodeCount = useAnimatedDashboardNumber(
  computed(() => episodeCount.value ?? 0),
  {
    delay: 120,
    duration: 720,
  },
)

const animatedUserCount = useAnimatedDashboardNumber(userCount, {
  delay: 180,
  duration: 720,
})

const statistics = computed(() => [
  {
    title: t('mediaType.movie'),
    stats: formatDashboardCount(animatedMovieCount.value),
    icon: 'mdi-movie-roll',
    color: 'primary',
    addition: movieCountMonth.value,
  },
  {
    title: t('mediaType.tv'),
    stats: formatDashboardCount(animatedTvCount.value),
    icon: 'mdi-television-box',
    color: 'success',
    addition: tvCountMonth.value,
  },
  {
    title: t('dashboard.episodes'),
    stats: episodeCount.value == null ? t('common.notFetched') : formatDashboardCount(animatedEpisodeCount.value),
    icon: 'mdi-television-classic',
    color: 'warning',
    addition: episodeCountMonth.value,
  },
  {
    title: t('dashboard.users'),
    stats: formatDashboardCount(animatedUserCount.value),
    icon: 'mdi-account',
    color: 'info',
    addition: null,
  },
])

// 调用API加载媒体统计数据
async function loadMediaStatistic() {
  const loadId = ++statisticLoadId
  try {
    const res: MediaStatistic = await api.get('dashboard/statistic')
    if (loadId !== statisticLoadId) return

    const statistic: MediaStatistic = {
      movie_count: Number(res.movie_count) || 0,
      tv_count: Number(res.tv_count) || 0,
      episode_count: res.episode_count == null ? null : Number(res.episode_count) || 0,
      user_count: Number(res.user_count) || 0,
      movie_count_month: Number(res.movie_count_month) || 0,
      tv_count_month: Number(res.tv_count_month) || 0,
      episode_count_month: Number(res.episode_count_month) || 0,
    }

    movieCount.value = statistic.movie_count
    tvCount.value = statistic.tv_count
    episodeCount.value = statistic.episode_count
    userCount.value = statistic.user_count
    movieCountMonth.value = statistic.movie_count_month
    tvCountMonth.value = statistic.tv_count_month
    episodeCountMonth.value = statistic.episode_count_month
    writeSnapshot(statistic)
  } catch (e) {
    console.log(e)
  }
}

onMounted(() => {
  loadMediaStatistic()
})

useKeepAliveRefresh(loadMediaStatistic)
</script>

<template>
  <VCard class="dashboard-summary-card dashboard-grid-fill">
    <VCardItem class="dashboard-summary-header">
      <VCardTitle>{{ t('dashboard.mediaStatistic') }}</VCardTitle>
    </VCardItem>

    <VCardText class="dashboard-summary-content">
      <div class="dashboard-stat-grid">
        <div v-for="item in statistics" :key="item.title" class="dashboard-stat-item">
          <VAvatar :color="item.color" variant="tonal" size="36" class="dashboard-stat-icon">
            <VIcon size="18" :icon="item.icon" />
          </VAvatar>
          <div class="dashboard-stat-copy">
            <span class="dashboard-stat-label">{{ item.title }}</span>
            <span class="dashboard-number">{{ item.stats }}</span>
            <span v-if="item.addition !== null" class="dashboard-stat-addition">
              {{ t('dashboard.monthlyAddition', { count: item.addition }) }}
            </span>
            <span v-else class="dashboard-stat-addition text-medium-emphasis">{{ t('dashboard.activeUsers') }}</span>
          </div>
        </div>
      </div>
    </VCardText>
  </VCard>
</template>

<style lang="scss" scoped>
.dashboard-summary-card {
  display: flex;
  flex-direction: column;
  block-size: 100%;
  min-block-size: 148px;
}

.dashboard-summary-header {
  padding: 14px 16px 6px;
}

.dashboard-summary-content {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  min-block-size: 0;
  padding: 4px 16px 14px;
}

.dashboard-stat-grid {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.dashboard-stat-item {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  gap: 13px;
  padding-inline: 16px;
}

.dashboard-stat-item:first-child {
  padding-inline-start: 0;
}

.dashboard-stat-item:last-child {
  padding-inline-end: 0;
}

.dashboard-stat-item + .dashboard-stat-item {
  border-inline-start: 1px solid var(--mp-border-subtle);
}

.dashboard-stat-icon {
  flex-shrink: 0;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 9px !important;
}

.dashboard-stat-copy {
  display: flex;
  min-inline-size: 0;
  flex-direction: column;
  gap: 2px;
}

.dashboard-stat-label {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  font-weight: 500;
  line-height: 1.25;
}

.dashboard-number {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 22px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.015em;
  line-height: 1.2;
}

.dashboard-stat-addition {
  overflow: hidden;
  color: rgb(var(--v-theme-success));
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 740px) {
  .dashboard-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    row-gap: 13px;
  }

  .dashboard-stat-item {
    padding-inline: 10px;
  }

  .dashboard-stat-item:nth-child(odd) {
    border-inline-start: 0;
    padding-inline-start: 0;
  }
}
</style>
