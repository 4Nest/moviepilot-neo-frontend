import {
  DISCOVER_DESKTOP_FILTERS_COLLAPSED_KEY,
  DISCOVER_EXCLUDE_SHORT_DRAMA_KEY,
  useDiscoverPreferences,
} from '@/composables/useDiscoverPreferences'
import { defineComponent, h } from 'vue'
import { fireEvent, render, screen } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('useDiscoverPreferences', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1280,
      writable: true,
    })
  })

  it('defaults excludeShortDrama to true and desktop filters to expanded', () => {
    const prefs = useDiscoverPreferences()

    expect(prefs.excludeShortDrama.value).toBe(true)
    expect(prefs.desktopFiltersCollapsed.value).toBe(false)
    expect(prefs.filtersExpanded.value).toBe(true)
  })

  it('persists excludeShortDrama changes to localStorage and shares state across instances', () => {
    const first = useDiscoverPreferences()
    const second = useDiscoverPreferences()

    first.toggleExcludeShortDrama()

    expect(first.excludeShortDrama.value).toBe(false)
    expect(second.excludeShortDrama.value).toBe(false)
    expect(localStorage.getItem(DISCOVER_EXCLUDE_SHORT_DRAMA_KEY)).toBe('false')

    second.setExcludeShortDrama(true)

    expect(first.excludeShortDrama.value).toBe(true)
    expect(localStorage.getItem(DISCOVER_EXCLUDE_SHORT_DRAMA_KEY)).toBe('true')
  })

  it('hydrates stored boolean values from localStorage', () => {
    localStorage.setItem(DISCOVER_EXCLUDE_SHORT_DRAMA_KEY, 'false')
    localStorage.setItem(DISCOVER_DESKTOP_FILTERS_COLLAPSED_KEY, 'true')

    const prefs = useDiscoverPreferences()

    expect(prefs.excludeShortDrama.value).toBe(false)
    expect(prefs.desktopFiltersCollapsed.value).toBe(true)
    expect(prefs.filtersExpanded.value).toBe(false)
  })

  it('collapses secondary filters by default on mobile (< 600px) without overwriting desktop preference', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 390,
      writable: true,
    })
    vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: query.includes('599.98px') || query.includes('600px'),
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }))

    const MobileHarness = defineComponent({
      setup() {
        const prefs = useDiscoverPreferences()
        return () =>
          h('div', [
            h('output', { 'data-testid': 'expanded' }, String(prefs.filtersExpanded.value)),
            h('button', { type: 'button', onClick: () => prefs.toggleFiltersExpanded() }, 'toggle'),
          ])
      },
    })

    render(MobileHarness)

    expect(screen.getByTestId('expanded')).toHaveTextContent('false')
    expect(localStorage.getItem(DISCOVER_DESKTOP_FILTERS_COLLAPSED_KEY)).toBeNull()

    await fireEvent.click(screen.getByRole('button', { name: 'toggle' }))
    expect(screen.getByTestId('expanded')).toHaveTextContent('true')
    expect(localStorage.getItem(DISCOVER_DESKTOP_FILTERS_COLLAPSED_KEY)).toBeNull()
  })
})
