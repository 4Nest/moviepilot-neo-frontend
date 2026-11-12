<script setup lang="ts">
import type { SearchDiagnostics } from '@/api/types'
import { computed, ref, useId } from 'vue'
import { useI18n } from '@/composables/useChineseText'
import { formatSearchDiagnosticRejectionDetail, ruleConfigurationWarningCodes } from '@/utils/searchDiagnostics'

const props = withDefaults(
  defineProps<{ diagnostics: SearchDiagnostics; rejectedCount?: number; showRejected?: boolean }>(),
  { rejectedCount: 0, showRejected: false },
)
const emit = defineEmits<{ (event: 'toggle-rejected'): void }>()
const { t } = useI18n()
// 搜索诊断属于辅助信息，首次展示仅保留摘要，详细来源由用户主动展开。
const expanded = ref(false)
const detailsId = useId()
const hasDetails = computed(() => props.diagnostics.searched_sites.length || props.diagnostics.rejection_reasons.length)
const reasonCodes = new Set([
  'filter_params',
  'filter_rules',
  'title_missing',
  'scope_mismatch',
  'identity_mismatch',
  'type_mismatch',
  'caller_filter',
  'duplicate',
])
const warningCodes: Record<string, true> = {
  ...ruleConfigurationWarningCodes,
  rule_group_not_applicable: true,
  rule_group_missing: true,
  provider_error: true,
  provider_cooldown: true,
  provider_circuit_open: true,
  provider_outcome_unknown: true,
}
</script>

<template>
  <section class="search-diagnostics my-3" role="status" :aria-label="t(`resource.diagnostics.${diagnostics.scope}`)">
    <div class="search-diagnostics__header">
      <VIcon icon="mdi-filter-check-outline" size="16" class="search-diagnostics__icon" />
      <div class="search-diagnostics__summary">
        <span>{{ t(`resource.diagnostics.${diagnostics.scope}`) }}</span>
        <span class="search-diagnostics__counts">{{ t('resource.diagnostics.counts', diagnostics.stage_counts) }}</span>
      </div>
      <VBtn
        v-if="rejectedCount > 0"
        variant="text"
        color="secondary"
        size="x-small"
        class="search-diagnostics__toggle"
        :aria-pressed="showRejected"
        @click="emit('toggle-rejected')"
      >
        {{ t(`resource.diagnostics.${showRejected ? 'hideRejected' : 'showRejected'}`) }}
      </VBtn>
      <VBtn
        v-if="hasDetails"
        variant="text"
        color="secondary"
        size="x-small"
        class="search-diagnostics__toggle"
        :append-icon="expanded ? 'mdi-chevron-up' : 'mdi-chevron-down'"
        :aria-expanded="expanded"
        :aria-controls="expanded ? detailsId : undefined"
        @click="expanded = !expanded"
      >
        {{ t(`resource.diagnostics.${expanded ? 'hideDetails' : 'details'}`) }}
      </VBtn>
    </div>
    <VExpandTransition>
      <div v-if="expanded" :id="detailsId" class="search-diagnostics__details">
        <div v-if="diagnostics.searched_sites.length">
          <p class="search-diagnostics__label">{{ t('resource.diagnostics.sources') }}</p>
          <ul class="search-diagnostics__list">
            <li v-for="(site, index) in diagnostics.searched_sites" :key="index">
              <span class="search-diagnostics__name">{{ site.site_name }}</span>
              <span class="search-diagnostics__separator" aria-hidden="true"> — </span>
              <span class="search-diagnostics__outcome">
                {{
                  t(
                    `resource.diagnostics.${
                      site.outcome === 'circuit_open' ? 'circuit_open' : site.attempted ? site.outcome : 'notAttempted'
                    }`,
                  )
                }}
                <span v-if="site.attempted">{{ t('resource.diagnostics.rawCount', { count: site.raw_count }) }}</span>
              </span>
            </li>
          </ul>
        </div>
        <div v-if="diagnostics.rejection_reasons.length">
          <p class="search-diagnostics__label">{{ t('resource.diagnostics.excluded') }}</p>
          <ul class="search-diagnostics__list">
            <li
              v-for="(reason, index) in diagnostics.rejection_reasons"
              :key="index"
              class="search-diagnostics__reason"
            >
              <div class="search-diagnostics__reason-header">
                <span class="search-diagnostics__name">
                  {{ t(`resource.diagnostics.reasons.${reasonCodes.has(reason.code) ? reason.code : 'other'}`) }}
                </span>
                <span class="search-diagnostics__count">{{ reason.count }}</span>
              </div>
              <template v-if="reason.details?.length">
                <ul class="search-diagnostics__detail-list">
                  <li v-for="(detail, detailIndex) in reason.details" :key="detailIndex">
                    <span>{{ formatSearchDiagnosticRejectionDetail(detail, t) }}</span>
                    <span class="search-diagnostics__detail-count">{{ detail.count }}</span>
                  </li>
                </ul>
                <p class="search-diagnostics__detail-note">{{ t('resource.diagnostics.detailNote') }}</p>
              </template>
            </li>
          </ul>
        </div>
      </div>
    </VExpandTransition>
    <div v-if="diagnostics.warnings.length" class="search-diagnostics__notes">
      <p v-for="(warning, index) in diagnostics.warnings" :key="index" class="search-diagnostics__note">
        <VIcon icon="mdi-information-outline" size="15" class="search-diagnostics__icon" />
        <span>
          {{
            t(`resource.diagnostics.warnings.${warningCodes[warning.code] ? warning.code : 'other'}`, {
              name: warning.rule_group || t('resource.diagnostics.unnamedRule'),
              ids: (warning.rule_ids ?? []).join('、'),
            })
          }}
        </span>
      </p>
    </div>
  </section>
</template>

<style scoped>
.search-diagnostics {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), 0.025);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  line-height: 1.6;
}

.search-diagnostics__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  min-block-size: 42px;
}

.search-diagnostics__icon {
  flex-shrink: 0;
  opacity: 0.8;
}

.search-diagnostics__summary {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 0 10px;
  min-inline-size: 0;
}

.search-diagnostics__counts {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(var(--v-theme-primary), 0.08);
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.search-diagnostics__toggle {
  flex-shrink: 0;
  min-block-size: 32px;
  letter-spacing: normal;
}

.search-diagnostics__details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: 16px 24px;
  padding: 12px;
  border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}

.search-diagnostics__label {
  margin-block-end: 6px;
  font-size: 11px;
}

.search-diagnostics__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.search-diagnostics__list > li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  padding-block: 6px;
}

.search-diagnostics__list > li + li {
  border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.04);
}

.search-diagnostics__name {
  min-inline-size: 0;
  color: rgba(var(--v-theme-on-surface), 0.78);
  font-weight: 500;
  overflow-wrap: anywhere;
}

.search-diagnostics__outcome {
  overflow-wrap: anywhere;
}

.search-diagnostics__list > li.search-diagnostics__reason {
  display: block;
}

.search-diagnostics__reason-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-diagnostics__detail-list {
  margin: 6px 0 0;
  padding: 0 0 0 12px;
  border-inline-start: 2px solid rgba(var(--v-theme-on-surface), 0.08);
  list-style: none;
}

.search-diagnostics__detail-list li {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding-block: 3px;
}

.search-diagnostics__detail-list li > :first-child {
  flex: 1;
  min-inline-size: 0;
  overflow-wrap: anywhere;
}

.search-diagnostics__detail-count {
  flex-shrink: 0;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.search-diagnostics__detail-note {
  margin: 5px 0 0;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 11px;
}

.search-diagnostics__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 7px;
  border-radius: 999px;
  background: rgba(var(--v-theme-error), 0.09);
  color: rgb(var(--v-theme-error));
  font-weight: 600;
  min-block-size: 22px;
  min-inline-size: 24px;
  font-variant-numeric: tabular-nums;
}

.search-diagnostics__notes {
  padding: 8px 12px;
  border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}

.search-diagnostics__note {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0;
  overflow-wrap: anywhere;
}

.search-diagnostics__note + .search-diagnostics__note {
  margin-block-start: 4px;
}
</style>
