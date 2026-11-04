import SearchDiagnosticsPanel from '@/components/states/SearchDiagnosticsPanel.vue'
import { fireEvent, screen } from '@testing-library/vue'
import { createSearchDiagnostics } from '@tests/support/fixtures/searchDiagnostics'
import { renderWithProviders } from '@tests/support/render'
import { describe, expect, it } from 'vitest'

describe('SearchDiagnosticsPanel', () => {
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
})
