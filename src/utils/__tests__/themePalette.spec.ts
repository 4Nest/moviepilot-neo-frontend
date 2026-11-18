import {
  applyDocumentThemeChrome,
  getThemeColorScheme,
  normalizeResolvedThemeName,
  resolveThemeName,
  themeRootPalettes,
} from '@/utils/themePalette'
import { describe, expect, it, vi } from 'vitest'

describe('theme palette', () => {
  it('defines Antigravity Dark and Light launch palettes and migrates legacy themes seamlessly to dark', () => {
    expect(themeRootPalettes.dark).toEqual({
      background: '#16171D',
      primary: '#8B7CF6',
    })
    expect(themeRootPalettes.light).toEqual({
      background: '#F1F2F6',
      primary: '#6E5DCF',
    })

    expect(resolveThemeName('dark')).toBe('dark')
    expect(resolveThemeName('light')).toBe('light')
    expect(['dark', 'light']).toContain(resolveThemeName('auto'))
    expect(resolveThemeName('glass')).toBe('dark')
    expect(resolveThemeName('transparent')).toBe('dark')
    expect(resolveThemeName('purple')).toBe('dark')

    expect(normalizeResolvedThemeName('glass')).toBe('dark')
    expect(normalizeResolvedThemeName('transparent')).toBe('dark')
    expect(normalizeResolvedThemeName('purple')).toBe('dark')
    expect(normalizeResolvedThemeName('light')).toBe('light')

    expect(getThemeColorScheme('dark')).toBe('dark')
    expect(getThemeColorScheme('light')).toBe('light')
  })

  it('notifies the favicon renderer with the applied primary color', () => {
    const handleFaviconChange = vi.fn()

    window.addEventListener('moviepilot-theme-primary-color-change', handleFaviconChange)

    try {
      const result = applyDocumentThemeChrome('dark', {
        background: '#16171D',
        primary: '#00BCD4',
      })
      const event = handleFaviconChange.mock.calls[0]?.[0] as CustomEvent<{ color: string }>

      expect(result.primary).toBe('#00BCD4')
      expect(document.documentElement.style.getPropertyValue('--initial-loader-color')).toBe('#00BCD4')
      expect(handleFaviconChange).toHaveBeenCalledOnce()
      expect(event.detail).toEqual({ color: '#00BCD4' })
    } finally {
      window.removeEventListener('moviepilot-theme-primary-color-change', handleFaviconChange)
    }
  })

  it('persists the resolved auto theme for the next PWA resume', () => {
    applyDocumentThemeChrome('auto', {
      background: '#16171D',
      persistLoaderColors: true,
      primary: '#8B7CF6',
      resolvedTheme: 'dark',
    })

    expect(localStorage.getItem('materio-initial-loader-bg')).toBe('#16171D')
    expect(localStorage.getItem('materio-initial-resolved-theme')).toBe('dark')
  })

  it('updates the resolved theme cache when the actual theme is confirmed', () => {
    localStorage.setItem('materio-initial-resolved-theme', 'dark')

    applyDocumentThemeChrome('light', {
      background: '#F1F2F6',
      persistLoaderColors: true,
      primary: '#6E5DCF',
      resolvedTheme: 'light',
    })

    expect(localStorage.getItem('materio-initial-resolved-theme')).toBe('light')
  })
})
