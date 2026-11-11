import type { RejectedSearchItem, SearchDiagnosticRejectionDetail, SearchDiagnostics } from '@/api/types'
import type { TextTranslator } from '@/composables/useChineseText'

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(v => typeof v === 'string')
const nullableString = (value: unknown) => value == null || typeof value === 'string'

const detailCodes: Record<string, true> = {
  rule_missing: true,
  include_missed: true,
  exclude_matched: true,
  negated_rule_matched: true,
  size_mismatch: true,
  seeders_mismatch: true,
  free_mismatch: true,
  publish_time_mismatch: true,
  no_priority_match: true,
  param_include_missed: true,
  param_exclude_matched: true,
  param_quality_missed: true,
  param_resolution_missed: true,
  param_effect_missed: true,
  param_size_mismatch: true,
}
const reasonCodes: Record<string, true> = {
  filter_params: true,
  filter_rules: true,
  title_missing: true,
  scope_mismatch: true,
  identity_mismatch: true,
  type_mismatch: true,
  caller_filter: true,
  duplicate: true,
}

function isRejectionDetail(value: unknown): value is SearchDiagnosticRejectionDetail {
  return (
    record(value) &&
    typeof value.code === 'string' &&
    count(value.count) &&
    nullableString(value.rule_group) &&
    nullableString(value.rule) &&
    nullableString(value.expected) &&
    nullableString(value.actual)
  )
}

/** 使用诊断明细的统一中文语义，未知原因码回退为通用过滤说明。 */
export function formatSearchDiagnosticRejectionDetail(detail: SearchDiagnosticRejectionDetail, t: TextTranslator) {
  if (Object.prototype.hasOwnProperty.call(detailCodes, detail.code)) {
    return t(`resource.diagnostics.detailReasons.${detail.code}`, {
      group: detail.rule_group || t('resource.diagnostics.unnamedRule'),
      rule: detail.rule || t('resource.diagnostics.unnamedRule'),
      expected: detail.expected || '-',
      actual: detail.actual || '-',
    })
  }
  if (Object.prototype.hasOwnProperty.call(reasonCodes, detail.code)) {
    return t(`resource.diagnostics.reasons.${detail.code}`)
  }
  if (detail.rule_group || detail.rule) {
    return t('resource.diagnostics.detailReasons.other', {
      group: detail.rule_group || t('resource.diagnostics.unnamedRule'),
      rule: detail.rule || t('resource.diagnostics.unnamedRule'),
    })
  }
  return t('resource.diagnostics.reasons.other')
}

/** 仅保留具备可用上下文和完整原因明细的被过滤资源。 */
export function normalizeRejectedSearchItems(value: unknown): RejectedSearchItem[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is RejectedSearchItem =>
      record(item) && record(item.context) && Array.isArray(item.reasons) && item.reasons.every(isRejectionDetail),
  )
}

/** 校验可选诊断合同；旧后端、未知版本和损坏数据均不展示，扩展原因码交给界面通用文案。 */
export function normalizeSearchDiagnostics(value: unknown): SearchDiagnostics | null {
  if (
    !record(value) ||
    value.version !== 1 ||
    typeof value.search_id !== 'string' ||
    !value.search_id ||
    typeof value.scope !== 'string' ||
    !['page', 'search'].includes(value.scope) ||
    !record(value.stage_counts) ||
    !count(value.stage_counts.candidates) ||
    !count(value.stage_counts.retained) ||
    !Array.isArray(value.searched_sites) ||
    !Array.isArray(value.rejection_reasons) ||
    !Array.isArray(value.rule_groups) ||
    !Array.isArray(value.warnings)
  )
    return null

  if (
    !value.searched_sites.every(
      site =>
        record(site) &&
        (site.site_id === null || count(site.site_id)) &&
        typeof site.site_name === 'string' &&
        typeof site.attempted === 'boolean' &&
        typeof site.outcome === 'string' &&
        ['success', 'empty', 'error', 'cooldown', 'circuit_open', 'unknown'].includes(site.outcome) &&
        count(site.raw_count),
    )
  )
    return null
  if (
    !value.rejection_reasons.every(
      reason =>
        record(reason) &&
        typeof reason.code === 'string' &&
        count(reason.count) &&
        (reason.details === undefined || (Array.isArray(reason.details) && reason.details.every(isRejectionDetail))),
    )
  )
    return null
  if (
    !value.rule_groups.every(
      group =>
        record(group) &&
        typeof group.name === 'string' &&
        typeof group.status === 'string' &&
        ['effective', 'skipped'].includes(group.status) &&
        (group.reason === null ||
          (typeof group.reason === 'string' &&
            ['rule_group_not_applicable', 'rule_group_missing'].includes(group.reason))) &&
        (group.media_type === null || typeof group.media_type === 'string') &&
        strings(group.categories),
    )
  )
    return null
  if (
    !value.warnings.every(
      warning =>
        record(warning) &&
        typeof warning.code === 'string' &&
        (warning.rule_group == null || typeof warning.rule_group === 'string'),
    )
  )
    return null

  return value as unknown as SearchDiagnostics
}
