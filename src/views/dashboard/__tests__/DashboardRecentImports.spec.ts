import DashboardRecentImports from '@/views/dashboard/DashboardRecentImports.vue'
import { renderWithProviders } from '@tests/support/render'
import { screen } from '@testing-library/vue'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
  },
}))

describe('dashboard recent imports', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
  })

  it('exposes the rendered list as a layout size source, avoids duplicate KeepAlive initial load, and distinguishes failed status icon', async () => {
    mocks.apiGet.mockResolvedValue({
      data: {
        list: [
          { id: 1, title: '异步入库记录', status: true },
          { id: 2, title: '失败入库记录', status: false },
        ],
      },
    })

    const KeepAliveHarness = defineComponent({
      components: { DashboardRecentImports },
      template: '<KeepAlive><DashboardRecentImports /></KeepAlive>',
    })

    const { container } = await renderWithProviders(KeepAliveHarness)

    const renderedItem = await screen.findByText('异步入库记录')
    expect(screen.getByText('失败入库记录')).toBeInTheDocument()
    expect(container.querySelector('[data-layout-size-source]')).toContainElement(renderedItem)
    expect(mocks.apiGet).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.text-error')).toBeInTheDocument()
    expect(container.querySelector('.text-success')).toBeInTheDocument()
  })
})
