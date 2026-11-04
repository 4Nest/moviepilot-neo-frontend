<script setup lang="ts">
import type { RejectedSearchItem } from '@/api/types'
import { useI18n } from '@/composables/useChineseText'
import { formatSearchDiagnosticRejectionDetail } from '@/utils/searchDiagnostics'

const props = withDefaults(defineProps<{ item: RejectedSearchItem; mode?: 'card' | 'row' }>(), {
  mode: 'card',
})
const { t } = useI18n()
</script>

<template>
  <div v-if="props.mode === 'row'" class="rejected-torrent-row d-flex align-start" data-testid="rejected-torrent-card">
    <div class="rejected-torrent-row__site-badge flex-shrink-0">
      <VAvatar size="32" color="surface-variant" class="text-caption font-weight-bold">
        {{ item.context.torrent_info?.site_name?.substring(0, 1) }}
      </VAvatar>
      <span v-if="item.context.torrent_info?.site_name" class="rejected-torrent-row__site">
        {{ item.context.torrent_info.site_name }}
      </span>
    </div>
    <div class="rejected-torrent-row__body flex-grow-1 min-w-0">
      <div class="rejected-torrent-card__media-title d-flex align-center flex-wrap gap-2 mb-1">
        <VIcon icon="mdi-filter-remove-outline" size="17" class="flex-shrink-0" />
        <span>{{ item.context.media_info?.title ?? item.context.meta_info?.name }}</span>
        <VChip v-if="item.context.meta_info?.season_episode" size="x-small" variant="tonal" color="secondary">
          {{ item.context.meta_info.season_episode }}
        </VChip>
      </div>
      <div class="rejected-torrent-card__torrent-title mb-1">{{ item.context.torrent_info?.title }}</div>
      <div
        v-if="item.context.meta_info?.subtitle || item.context.torrent_info?.description"
        class="rejected-torrent-row__description mb-2"
      >
        {{ item.context.meta_info?.subtitle || item.context.torrent_info?.description }}
      </div>
      <ul class="rejected-torrent-card__reasons rejected-torrent-card__reasons--row">
        <li v-for="(reason, index) in item.reasons" :key="`${reason.code}-${index}`">
          {{ formatSearchDiagnosticRejectionDetail(reason, t) }}
        </li>
      </ul>
    </div>
  </div>

  <VCard
    v-else
    class="rejected-torrent-card h-full d-flex flex-column overflow-hidden"
    variant="flat"
    data-testid="rejected-torrent-card"
  >
    <VCardItem class="pt-3 pb-0">
      <div class="rejected-torrent-card__media-title d-flex align-center flex-wrap gap-2">
        <VIcon icon="mdi-filter-remove-outline" size="17" class="flex-shrink-0" />
        <span>{{ item.context.media_info?.title ?? item.context.meta_info?.name }}</span>
        <VChip v-if="item.context.meta_info?.season_episode" size="x-small" variant="tonal" color="secondary">
          {{ item.context.meta_info.season_episode }}
        </VChip>
      </div>
    </VCardItem>

    <VCardText class="d-flex flex-column flex-grow-1 pa-3">
      <div class="rejected-torrent-card__torrent-title">{{ item.context.torrent_info?.title }}</div>
      <div class="rejected-torrent-card__site d-flex align-center gap-2 mt-2">
        <VAvatar size="20" color="surface-variant" class="text-caption flex-shrink-0">
          {{ item.context.torrent_info?.site_name?.substring(0, 1) }}
        </VAvatar>
        <span>{{ item.context.torrent_info?.site_name }}</span>
      </div>
      <ul class="rejected-torrent-card__reasons mt-3">
        <li v-for="(reason, index) in item.reasons" :key="`${reason.code}-${index}`">
          {{ formatSearchDiagnosticRejectionDetail(reason, t) }}
        </li>
      </ul>
    </VCardText>
  </VCard>
</template>

<style scoped>
.rejected-torrent-card,
.rejected-torrent-row {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), 0.035);
  color: rgba(var(--v-theme-on-surface), 0.68);
}

.rejected-torrent-row {
  gap: 14px;
  padding: 14px 16px;
}

.rejected-torrent-row__site-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 6px 4px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.025);
  gap: 4px;
  inline-size: 56px;
}

.rejected-torrent-row__site {
  display: block;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.68rem;
  font-weight: 600;
  line-height: 1.15;
  max-inline-size: 48px;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rejected-torrent-row__description {
  color: rgba(var(--v-theme-on-surface), 0.52);
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.rejected-torrent-card__media-title {
  color: rgba(var(--v-theme-on-surface), 0.76);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.rejected-torrent-card__torrent-title {
  color: rgba(var(--v-theme-on-surface), 0.68);
  font-size: 13px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.rejected-torrent-card__site {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 12px;
}

.rejected-torrent-card__reasons {
  margin: 0;
  padding: 8px 0 0 12px;
  border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.07);
  color: rgba(var(--v-theme-on-surface), 0.65);
  font-size: 12px;
  line-height: 1.6;
}

.rejected-torrent-card__reasons--row {
  padding-block-start: 6px;
}

.rejected-torrent-card__reasons li {
  padding-inline-start: 2px;
  overflow-wrap: anywhere;
}

.rejected-torrent-card__reasons li + li {
  margin-block-start: 4px;
}
</style>
