import ScrollToTopBtn from '@core/components/ScrollToTopBtn.vue'
import { renderWithProviders } from '@tests/support/render'
import { describe, expect, it } from 'vitest'

describe('ScrollToTopBtn', () => {
  it('moves left of floating action buttons when offsetFab is enabled', async () => {
    const { container } = await renderWithProviders(ScrollToTopBtn, { props: { offsetFab: true } })

    expect(container.querySelector('.global-action-buttons')).toHaveClass('global-action-buttons--offset-fab')
  })
})
