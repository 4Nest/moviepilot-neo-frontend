import DashboardSystemInfo from '@/views/dashboard/DashboardSystemInfo.vue'
import { fireEvent, screen } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
  },
}))

vi.mock('@/composables/useBackground', () => ({
  useBackground: () => ({
    useDataRefresh: (_key: string, fn: () => void) => {
      void fn()
    },
  }),
}))

describe('DashboardSystemInfo', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('pauses runtimeTimer on KeepAlive deactivate and resumes on reactivate', async () => {
    vi.useFakeTimers()
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    mocks.apiGet.mockResolvedValue({
      hostname: 'mp-host',
      operating_system: 'macOS',
      runtime: 3600,
      version: 'v2.0.0',
    })

    const Harness = defineComponent({
      components: { DashboardSystemInfo },
      setup() {
        const active = ref(true)
        return { active }
      },
      template: `
        <button type="button" @click="active = false">停用系统卡片</button>
        <button type="button" @click="active = true">启用系统卡片</button>
        <KeepAlive><DashboardSystemInfo v-if="active" /></KeepAlive>
      `,
    })

    await renderWithProviders(Harness)
    const runtimeCallIndex = setIntervalSpy.mock.calls.findIndex(([, ms]) => ms === 60000)
    expect(runtimeCallIndex).toBeGreaterThanOrEqual(0)
    const runtimeHandle = setIntervalSpy.mock.results[runtimeCallIndex]?.value

    await fireEvent.click(screen.getByRole('button', { name: '停用系统卡片' }))
    expect(clearIntervalSpy).toHaveBeenCalledWith(runtimeHandle)

    await fireEvent.click(screen.getByRole('button', { name: '启用系统卡片' }))
    const runtimeIntervalsAfterReactivate = setIntervalSpy.mock.calls.filter(([, ms]) => ms === 60000).length
    expect(runtimeIntervalsAfterReactivate).toBe(2)
  })
})
