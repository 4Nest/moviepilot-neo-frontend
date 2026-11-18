<script setup lang="ts">
import api from '@/api'
import type { RejectedSearchItem } from '@/api/types'
import { useI18n } from '@/composables/useChineseText'
import { formatSearchDiagnosticRejectionDetail } from '@/utils/searchDiagnostics'
import { getCachedSiteIcon } from '@/utils/siteIconCache'
import { ref, watch } from 'vue'

const props = withDefaults(defineProps<{ item: RejectedSearchItem; mode?: 'card' | 'row' }>(), {
  mode: 'card',
})
const { t } = useI18n()
const siteIcon = ref('')

async function loadSiteIcon(site: number | undefined) {
  if (!site) {
    siteIcon.value = ''
    return
  }
  try {
    const icon = await getCachedSiteIcon(site, async () => {
      try {
        const response = await api.get(`site/icon/${site}`, { cancelOnNavigation: false })
        return response?.data?.icon || ''
      } catch {
        return ''
      }
    })
    if (props.item.context.torrent_info?.site === site) {
      siteIcon.value = icon
    }
  } catch {
    if (props.item.context.torrent_info?.site === site) {
      siteIcon.value = ''
    }
  }
}

watch(
  () => props.item.context.torrent_info?.site,
  site => {
    void loadSiteIcon(site)
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="props.mode === 'row'" class="rejected-torrent-row d-flex align-start" data-testid="rejected-torrent-card">
    <div class="rejected-torrent-row__site-badge flex-shrink-0">
      <img
        v-if="siteIcon"
        :src="siteIcon"
        :alt="item.context.torrent_info?.site_name"
        class="rejected-torrent-site-img rejected-torrent-site-img--row"
        @error="siteIcon = ''"
      />
      <span v-else class="rejected-torrent-site-fallback rejected-torrent-site-fallback--row">
        {{ item.context.torrent_info?.site_name?.substring(0, 1) || '?' }}
      </span>
      <span v-if="item.context.torrent_info?.site_name" class="rejected-torrent-row__site">
        {{ item.context.torrent_info.site_name }}
      </span>
    </div>
    <div class="rejected-torrent-row__body flex-grow-1 min-w-0">
      <div class="rejected-torrent-row__top d-flex align-center flex-wrap gap-2 mb-1">
        <span class="rejected-torrent-card__torrent-title rejected-torrent-card__torrent-title--row">
          {{ item.context.torrent_info?.title }}
        </span>
        <span
          v-if="item.context.media_info?.title || item.context.meta_info?.name"
          class="rejected-torrent-card__media-pill"
        >
          <VIcon icon="mdi-filter-remove-outline" size="12" class="flex-shrink-0" />
          <span>{{ item.context.media_info?.title ?? item.context.meta_info?.name }}</span>
          <span v-if="item.context.meta_info?.season_episode" class="rejected-torrent-card__se">
            {{ item.context.meta_info.season_episode }}
          </span>
        </span>
      </div>
      <div
        v-if="item.context.meta_info?.subtitle || item.context.torrent_info?.description"
        class="rejected-torrent-row__description mb-1"
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
    <div class="rejected-torrent-card__head">
      <div class="rejected-torrent-card__site">
        <img
          v-if="siteIcon"
          :src="siteIcon"
          :alt="item.context.torrent_info?.site_name"
          class="rejected-torrent-site-img"
          @error="siteIcon = ''"
        />
        <span v-else class="rejected-torrent-site-fallback">
          {{ item.context.torrent_info?.site_name?.substring(0, 1) || '?' }}
        </span>
        <span class="rejected-torrent-card__site-name">{{ item.context.torrent_info?.site_name }}</span>
      </div>
      <div
        v-if="item.context.media_info?.title || item.context.meta_info?.name"
        class="rejected-torrent-card__media-pill"
      >
        <VIcon icon="mdi-filter-remove-outline" size="12" class="flex-shrink-0" />
        <span class="rejected-torrent-card__media-text">
          {{ item.context.media_info?.title ?? item.context.meta_info?.name }}
        </span>
        <span v-if="item.context.meta_info?.season_episode" class="rejected-torrent-card__se">
          {{ item.context.meta_info.season_episode }}
        </span>
      </div>
    </div>

    <div class="rejected-torrent-card__body">
      <div class="rejected-torrent-card__torrent-title" :title="item.context.torrent_info?.title">
        {{ item.context.torrent_info?.title }}
      </div>
      <div
        v-if="item.context.meta_info?.subtitle || item.context.torrent_info?.description"
        class="rejected-torrent-card__subtitle"
        :title="item.context.meta_info?.subtitle || item.context.torrent_info?.description"
      >
        {{ item.context.meta_info?.subtitle || item.context.torrent_info?.description }}
      </div>
    </div>

    <ul v-if="item.reasons?.length" class="rejected-torrent-card__reasons">
      <li v-for="(reason, index) in item.reasons" :key="`${reason.code}-${index}`">
        {{ formatSearchDiagnosticRejectionDetail(reason, t) }}
      </li>
    </ul>
  </VCard>
</template>

<style scoped>
.rejected-torrent-card,
.rejected-torrent-row {
  border: 1px solid var(--mp-border-subtle);
  border-radius: 10px !important;
  background: var(--mp-item-bg) !important;
  color: rgba(var(--v-theme-on-surface), 0.72);
  transition: border-color 0.16s ease;
}

.rejected-torrent-card:hover,
.rejected-torrent-row:hover {
  border-color: var(--mp-border-hover);
}

.rejected-torrent-row {
  gap: 12px;
  padding: 10px 14px;
}

.rejected-torrent-row__site-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 5px 4px;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.03);
  gap: 3px;
  inline-size: 52px;
}

.rejected-torrent-row__site {
  display: block;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.64);
  font-size: 11px;
  font-weight: 500;
  line-height: 1.15;
  max-inline-size: 46px;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rejected-torrent-site-img {
  flex-shrink: 0;
  padding: 2px;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.14);
  block-size: 18px;
  inline-size: 18px;
  object-fit: contain;
}

.rejected-torrent-site-img--row {
  border-radius: 6px;
  block-size: 26px;
  inline-size: 26px;
}

.rejected-torrent-site-fallback {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background: rgba(var(--v-theme-on-surface), 0.1);
  block-size: 18px;
  color: rgba(var(--v-theme-on-surface), 0.78);
  font-size: 10.5px;
  font-weight: 700;
  inline-size: 18px;
  line-height: 1;
}

.rejected-torrent-site-fallback--row {
  border-radius: 6px;
  block-size: 26px;
  font-size: 12px;
  inline-size: 26px;
}

.rejected-torrent-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 11px 6px;
}

.rejected-torrent-card__site {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-inline-size: 0;
}

.rejected-torrent-card__site-name {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.74);
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rejected-torrent-card__media-pill {
  display: inline-flex;
  overflow: hidden;
  align-items: center;
  border-radius: 5px;
  background: rgba(var(--v-theme-on-surface), 0.05);
  color: rgba(var(--v-theme-on-surface), 0.56);
  font-size: 11px;
  font-weight: 500;
  gap: 3px;
  line-height: 1.3;
  max-inline-size: 58%;
  padding-block: 1.5px;
  padding-inline: 6px;
}

.rejected-torrent-card__media-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rejected-torrent-card__se {
  flex-shrink: 0;
  border-radius: 3px;
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
  font-size: 10px;
  font-weight: 600;
  line-height: 1.2;
  padding-inline: 4px;
}

.rejected-torrent-card__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 3px;
  padding: 0 11px 8px;
}

.rejected-torrent-card__torrent-title {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  color: rgba(var(--v-theme-on-surface), 0.86);
  font-size: 12.5px;
  font-weight: 500;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.rejected-torrent-card__torrent-title--row {
  display: inline;
  -webkit-line-clamp: unset;
  line-clamp: unset;
}

.rejected-torrent-card__subtitle,
.rejected-torrent-row__description {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.48);
  font-size: 11.5px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rejected-torrent-row__description {
  white-space: normal;
  overflow-wrap: anywhere;
}

.rejected-torrent-card__reasons {
  margin: 0;
  padding: 6px 11px 8px;
  border-block-start: 1px dashed var(--mp-border-subtle);
  background: rgba(var(--v-theme-on-surface), 0.018);
  color: rgba(var(--v-theme-warning), 0.86);
  font-size: 11.5px;
  line-height: 1.45;
  list-style: none;
}

.rejected-torrent-card__reasons--row {
  padding: 5px 0 0;
  background: transparent;
}

.rejected-torrent-card__reasons li {
  position: relative;
  padding-inline-start: 10px;
  overflow-wrap: anywhere;
}

.rejected-torrent-card__reasons li::before {
  position: absolute;
  border-radius: 50%;
  background: currentcolor;
  block-size: 4px;
  content: '';
  inline-size: 4px;
  inset-block-start: 6px;
  inset-inline-start: 1px;
  opacity: 0.75;
}

.rejected-torrent-card__reasons li + li {
  margin-block-start: 2px;
}
</style>
