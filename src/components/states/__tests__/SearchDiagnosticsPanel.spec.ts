import SearchDiagnosticsPanel from '@/components/states/SearchDiagnosticsPanel.vue'
import { fireEvent, screen } from '@testing-library/vue'
import { createSearchDiagnostics } from '@tests/support/fixtures/searchDiagnostics'
import { renderWithProviders } from '@tests/support/render'
import { describe, expect, it } from 'vitest'

describe('SearchDiagnosticsPanel', () => {
  it('shows the full invalid ID and rule group without rendering ID content as markup', async () => {
    const diagnostics = createSearchDiagnostics()
    diagnostics.warnings = [
      {
        code: 'rule_id_invalid',
        rule_group: '国产剧',
        rule_ids: [' Pre Candidate', '<img src=x onerror=alert(1)>'],
      },
    ]
    await renderWithProviders(SearchDiagnosticsPanel, { props: { diagnostics } })
    const panel = screen.getByRole('status')
    expect(panel).toHaveTextContent('规则组“国产剧”引用了无效的规则 ID： Pre Candidate、<img src=x onerror=alert(1)>')
    expect(panel).toHaveTextContent('至少包含一个字母')
    expect(panel.querySelector('img')).toBeNull()
  })

  it.each([
    ['rule_id_missing', '引用的规则 ID 不存在'],
    ['rule_syntax_invalid', '表达式语法无效'],
  ])('explains rule configuration warnings (%s)', async (code, message) => {
    const diagnostics = createSearchDiagnostics()
    diagnostics.warnings = [{ code, rule_group: '国产剧', rule_ids: ['Missing'] }]
    await renderWithProviders(SearchDiagnosticsPanel, { props: { diagnostics } })
    expect(screen.getByRole('status')).toHaveTextContent(message)
    expect(screen.getByRole('status')).toHaveTextContent('国产剧')
  })

  it('omits the details control when only warnings are available', async () => {
    const diagnostics = createSearchDiagnostics()
    diagnostics.searched_sites = []
    await renderWithProviders(SearchDiagnosticsPanel, { props: { diagnostics } })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('规则“中文字幕”未应用')
  })

  it('shows the rejected-results toggle only when rejected items exist and emits without changing visibility itself', async () => {
    const diagnostics = createSearchDiagnostics()
    const rendered = await renderWithProviders(SearchDiagnosticsPanel, {
      props: { diagnostics, rejectedCount: 0, showRejected: false },
    })
    expect(screen.queryByRole('button', { name: '显示过滤' })).not.toBeInTheDocument()

    await rendered.rerender({ diagnostics, rejectedCount: 2, showRejected: false })
    const toggle = screen.getByRole('button', { name: '显示过滤' })
    await fireEvent.click(toggle)
    expect(rendered.emitted('toggle-rejected')).toHaveLength(1)
    expect(screen.getByRole('button', { name: '显示过滤' })).toBeInTheDocument()

    await rendered.rerender({ diagnostics, rejectedCount: 2, showRejected: true })
    expect(screen.getByRole('button', { name: '隐藏过滤' })).toBeInTheDocument()
  })

  it('separates page counts, unsearched sources and skipped rules', async () => {
    await renderWithProviders(SearchDiagnosticsPanel, { props: { diagnostics: createSearchDiagnostics() } })
    const panel = screen.getByRole('status', { name: '本页搜索情况' })
    expect(panel).toHaveTextContent('候选 0 · 保留 0')
    const toggle = screen.getByRole('button', { name: '查看详情' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(panel).not.toHaveTextContent('站点 B')
    await fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(panel).toHaveTextContent('站点 A')
    expect(panel).toHaveTextContent('已完成，无资源')
    expect(panel).toHaveTextContent('（返回 0 个）')
    expect(panel).toHaveTextContent('站点 B')
    expect(panel).toHaveTextContent('未执行检索')
    expect(panel).toHaveTextContent('规则“中文字幕”未应用')
    expect(panel).not.toHaveTextContent('均不符合过滤规则')
    await fireEvent.click(screen.getByRole('button', { name: '收起' }))
    expect(panel).not.toHaveTextContent('站点 B')
    expect(panel).toHaveTextContent('规则“中文字幕”未应用')
  })

  it('explains circuit-open sources instead of reporting a generic unsearched state', async () => {
    const diagnostics = createSearchDiagnostics()
    diagnostics.searched_sites = [
      {
        site_id: 9,
        site_name: '熔断站点',
        attempted: false,
        outcome: 'circuit_open',
        raw_count: 0,
      },
    ]
    diagnostics.warnings = [{ code: 'provider_circuit_open' }]

    await renderWithProviders(SearchDiagnosticsPanel, { props: { diagnostics } })
    const panel = screen.getByRole('status')
    expect(panel).toHaveTextContent('部分站点因连续异常处于熔断保护期，本轮已自动跳过')
    await fireEvent.click(screen.getByRole('button', { name: '查看详情' }))
    expect(panel).toHaveTextContent('熔断站点')
    expect(panel).toHaveTextContent('异常熔断，暂时跳过')
    expect(panel).not.toHaveTextContent('未执行检索')
  })

  it('shows rejection counts and uses generic text for future codes without rendering raw codes as markup', async () => {
    const diagnostics = createSearchDiagnostics()
    diagnostics.scope = 'search'
    diagnostics.rejection_reasons = [
      {
        code: 'filter_rules',
        count: 17,
        details: [
          {
            code: 'include_missed',
            count: 17,
            rule_group: '默认',
            rule: '1080P',
            expected: '1080p',
            actual: null,
          },
        ],
      },
      { code: 'duplicate', count: 2 },
      { code: '<img src=x onerror=alert(1)>', count: 3 },
    ]
    diagnostics.warnings = [{ code: 'new_warning' }]
    await renderWithProviders(SearchDiagnosticsPanel, { props: { diagnostics } })
    const panel = screen.getByRole('status', { name: '本次搜索情况' })
    await fireEvent.click(screen.getByRole('button', { name: '查看详情' }))
    expect(panel).toHaveTextContent('未通过优先级规则17')
    expect(panel).toHaveTextContent('规则组“默认”/ 1080P：未满足包含条件 1080p')
    expect(panel).toHaveTextContent('明细计数不能相加为资源数')
    expect(panel).toHaveTextContent('重复资源2')
    expect(panel).toHaveTextContent('其他已排除资源3')
    expect(panel).toHaveTextContent('还有其他搜索提示')
    expect(panel.querySelector('img')).toBeNull()
  })

  it('shows effective rules in header and tucks category-routed skipped rules into details without spamming warnings', async () => {
    const diagnostics = createSearchDiagnostics()
    diagnostics.scope = 'search'
    diagnostics.stage_counts = { candidates: 76, retained: 54 }
    diagnostics.searched_sites = []
    diagnostics.rule_groups = [
      {
        name: '动画电影',
        status: 'skipped',
        reason: 'rule_group_not_applicable',
        media_type: '电影',
        categories: ['动画电影'],
      },
      {
        name: '国产剧',
        status: 'skipped',
        reason: 'rule_group_not_applicable',
        media_type: '电视剧',
        categories: ['国产剧'],
      },
      { name: '日韩剧', status: 'effective', reason: null, media_type: '电视剧', categories: ['日韩剧'] },
      { name: '旧规则', status: 'skipped', reason: 'rule_group_missing', media_type: null, categories: [] },
    ]
    diagnostics.warnings = [
      { code: 'rule_group_not_applicable', rule_group: '动画电影' },
      { code: 'rule_group_not_applicable', rule_group: '国产剧' },
      { code: 'rule_group_missing', rule_group: '旧规则' },
    ]

    await renderWithProviders(SearchDiagnosticsPanel, { props: { diagnostics } })
    const panel = screen.getByRole('status', { name: '本次搜索情况' })
    expect(panel).toHaveTextContent('候选 76 · 保留 54')
    expect(panel).toHaveTextContent('已应用：日韩剧')
    expect(panel).not.toHaveTextContent('类型或分类不符')
    expect(panel).toHaveTextContent('规则“旧规则”不存在')

    await fireEvent.click(screen.getByRole('button', { name: '查看详情' }))
    expect(panel).toHaveTextContent('未适用规则（类型或分类不符）')
    expect(panel).toHaveTextContent('动画电影、国产剧')
  })

  it('collapses multiple non-applicable rule warnings into a single summary line when no rule is effective', async () => {
    const diagnostics = createSearchDiagnostics()
    diagnostics.rule_groups = []
    diagnostics.warnings = ['动画电影', '华语电影', '外语电影', '日番', '欧美剧'].map(name => ({
      code: 'rule_group_not_applicable',
      rule_group: name,
    }))

    await renderWithProviders(SearchDiagnosticsPanel, { props: { diagnostics } })
    const panel = screen.getByRole('status')
    expect(panel).toHaveTextContent('规则“动画电影、华语电影、外语电影”等 5 项未应用：类型或分类不符')
    expect(panel).not.toHaveTextContent('日番')
  })
})
