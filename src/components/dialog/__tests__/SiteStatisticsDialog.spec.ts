import SiteStatisticsDialog from '@/components/dialog/SiteStatisticsDialog.vue'
import { screen } from '@testing-library/vue'
import { createSite, createSiteStatistic } from '@tests/support/factories/site'
import { siteStatisticsHandler } from '@tests/support/msw/handlers/site'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { describe, expect, it } from 'vitest'

describe('SiteStatisticsDialog', () => {
  it('shows circuit recovery details while preserving numeric time records', async () => {
    const site = createSite({ name: '熔断站点', domain: 'circuit.example.com' })
    server.use(
      siteStatisticsHandler([
        createSiteStatistic({
          domain: site.domain,
          circuit_open: true,
          circuit_until: '2026-11-11 18:30:00',
          consecutive_fails: 3,
          last_error: 'Cookie 失效',
          lst_state: 0,
          note: { '2026-11-11 17:00:00': 2 },
          seconds: 2,
        }),
      ]),
    )

    await renderWithProviders(SiteStatisticsDialog, {
      global: { stubs: { VDialogCloseBtn: true } },
      props: { modelValue: true, sites: [site] },
    })

    expect(await screen.findByText('熔断保护中')).toBeInTheDocument()
    expect(screen.getByText('恢复时间：2026-11-11 18:30:00')).toBeInTheDocument()
    expect(screen.getByText('最近异常：Cookie 失效')).toBeInTheDocument()
    expect(screen.getByText('连续失败').parentElement).toHaveTextContent('连续失败: 3')
  })
})
