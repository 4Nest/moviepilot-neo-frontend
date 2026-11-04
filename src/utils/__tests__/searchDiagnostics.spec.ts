import backendProduced from '@tests/support/fixtures/backendSearchDiagnostics.json'
import { normalizeRejectedSearchItems, normalizeSearchDiagnostics } from '@/utils/searchDiagnostics'
import { createSearchDiagnostics } from '@tests/support/fixtures/searchDiagnostics'
import { describe, expect, it } from 'vitest'

describe('search diagnostics contract', () => {
  it('accepts an actual backend terminal-event projection without altering counts or rule warnings', () => {
    expect(normalizeSearchDiagnostics(backendProduced)).toEqual(backendProduced)
  })

  it.each([undefined, null, {}, { version: 2 }])('hides absent or unsupported diagnostics (%s)', value => {
    expect(normalizeSearchDiagnostics(value)).toBeNull()
  })

  it.each([
    { search_id: 42 },
    { scope: ['page'] },
    { scope: { toString: null } },
    { stage_counts: { candidates: -1, retained: 0 } },
    { stage_counts: { candidates: 0, retained: 1.5 } },
    { searched_sites: {} },
    { searched_sites: [{ site_id: 1, site_name: 'A', outcome: 'empty', raw_count: 0 }] },
    {
      searched_sites: [{ site_id: -1, site_name: 'A', attempted: true, outcome: 'empty', raw_count: 0 }],
    },
    { rejection_reasons: [{ code: 'duplicate', count: 1.5 }] },
    { rejection_reasons: [{ code: 'filter_rules', count: 1, details: [{ code: 'include_missed', count: -1 }] }] },
    { rule_groups: [{ name: 'rule', status: 'skipped', categories: null }] },
    { warnings: [{ code: 'new_warning', rule_group: 1 }] },
  ])('rejects malformed diagnostics without affecting results', change => {
    const malformed = { ...createSearchDiagnostics(), ...change }
    expect(() => normalizeSearchDiagnostics(malformed)).not.toThrow()
    expect(normalizeSearchDiagnostics(malformed)).toBeNull()
  })

  it('accepts new reason and warning codes in version 1 for generic display', () => {
    const diagnostics = createSearchDiagnostics()
    diagnostics.rejection_reasons = [
      {
        code: 'future_reason',
        count: 2,
        details: [{ code: 'future_detail', count: 2, rule_group: '默认', rule: '新规则' }],
      },
    ]
    diagnostics.warnings = [{ code: 'future_warning', rule_group: null }]
    expect(normalizeSearchDiagnostics(diagnostics)).toEqual(diagnostics)
  })

  it('normalizes rejected search items and filters out malformed entries', () => {
    const validItem = {
      context: { media_info: {}, meta_info: {}, torrent_info: { title: 'Test' } },
      reasons: [
        { code: 'include_missed', count: 1, rule_group: '默认', rule: '1080P', expected: '1080p', actual: null },
      ],
    }
    expect(normalizeRejectedSearchItems(null)).toEqual([])
    expect(
      normalizeRejectedSearchItems([
        validItem,
        null,
        { context: null, reasons: [] },
        { context: {}, reasons: [{ code: 'include_missed', count: -1 }] },
      ]),
    ).toEqual([validItem])
  })
})
