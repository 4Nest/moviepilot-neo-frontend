import ScrollToTopBtn from '@core/components/ScrollToTopBtn.vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  appMode: false,
}))

vi.mock('@/composables/usePWA', async () => {
  const { computed } = await import('vue')
  return {
    usePWA: () => ({ appMode: computed(() => mocks.appMode) }),
  }
})

describe('ScrollToTopBtn', () => {
  beforeEach(() => {
    mocks.appMode = false
  })

  it('moves left of floating action buttons when offsetFab is enabled', async () => {
    const { container } = await renderWithProviders(ScrollToTopBtn, { props: { offsetFab: true } })

    expect(container.querySelector('.global-action-buttons')).toHaveClass('global-action-buttons--offset-fab')
  })

  it('hides scroll-to-top button in appMode to avoid overlapping bottom navigation', async () => {
    mocks.appMode = true
    const { container } = await renderWithProviders(ScrollToTopBtn, { props: { offsetFab: true } })

    expect(container.querySelector('.global-action-buttons')).toBeNull()
  })
})
