import {
  applyThemeCustomizerRootSettings,
  isDefaultThemeCustomizerSettings,
  persistPartialThemeCustomizerSettings,
  readThemeCustomizerSettings,
  THEME_CUSTOMIZER_STORAGE_KEY,
  themeCustomizerPrimaryColors,
  useThemeCustomizer,
} from '@/composables/useThemeCustomizer'
import vuetify from '@/plugins/vuetify'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'

describe('useThemeCustomizer settings', () => {
  function mountThemeCustomizer() {
    let customizer: ReturnType<typeof useThemeCustomizer> | undefined
    const wrapper = mount(
      defineComponent({
        setup() {
          customizer = useThemeCustomizer()

          return () => h('div')
        },
      }),
      { global: { plugins: [vuetify] } },
    )

    if (!customizer) throw new Error('theme customizer setup failed')

    return { customizer, wrapper }
  }

  beforeEach(() => {
    localStorage.clear()
    persistPartialThemeCustomizerSettings({
      layout: 'vertical',
      primaryColor: '#8B7CF6',
      radius: 'default',
      semiDarkMenu: false,
      shadow: '0',
      skin: 'default',
      theme: 'auto',
    })
    localStorage.clear()
  })

  it('uses Antigravity workbench defaults with zero shadow and primary color #8B7CF6', () => {
    const settings = readThemeCustomizerSettings()

    expect(themeCustomizerPrimaryColors[0]?.value).toBe('#8B7CF6')
    expect(settings).toEqual({
      layout: 'vertical',
      primaryColor: '#8B7CF6',
      radius: 'default',
      semiDarkMenu: false,
      shadow: '0',
      skin: 'default',
      theme: 'auto',
    })
    expect(isDefaultThemeCustomizerSettings(settings)).toBe(true)
  })

  it('migrates legacy glass, transparent, and purple localStorage theme values to dark', () => {
    for (const legacyTheme of ['glass', 'transparent', 'purple']) {
      localStorage.setItem('theme', legacyTheme)

      const settings = readThemeCustomizerSettings()
      expect(settings.theme).toBe('dark')
      expect(localStorage.getItem('theme')).toBe('dark')
    }
  })

  it('tracks customization state and resets cleanly to defaults', async () => {
    const { customizer, wrapper } = mountThemeCustomizer()

    expect(customizer.isCustomized.value).toBe(false)

    await customizer.setPrimaryColor('#00BCD4')
    customizer.setRadius('small')
    customizer.setSkin('bordered')
    expect(customizer.isCustomized.value).toBe(true)
    expect(vuetify.theme.current.value.colors.primary).toBe('#00BCD4')

    await customizer.resetSettings()
    expect(isDefaultThemeCustomizerSettings(customizer.settings.value)).toBe(true)
    expect(customizer.isCustomized.value).toBe(false)
    expect(customizer.settings.value.primaryColor).toBe('#8B7CF6')

    wrapper.unmount()
  })

  it('falls back safely when stored customizer settings contain invalid values', () => {
    localStorage.setItem(
      THEME_CUSTOMIZER_STORAGE_KEY,
      JSON.stringify({
        layout: 'floating',
        primaryColor: 'not-a-color',
        radius: 'pill',
        semiDarkMenu: 'yes',
        shadow: 'heavy',
        skin: 'frosted',
        theme: 'glass',
      }),
    )

    expect(readThemeCustomizerSettings()).toEqual({
      layout: 'vertical',
      primaryColor: '#8B7CF6',
      radius: 'default',
      semiDarkMenu: false,
      shadow: '0',
      skin: 'default',
      theme: 'dark',
    })
  })

  it('converges legacy stored radius, shadow, skin, and semiDarkMenu overrides back to clean IDE defaults', () => {
    localStorage.setItem(
      THEME_CUSTOMIZER_STORAGE_KEY,
      JSON.stringify({
        layout: 'collapsed',
        primaryColor: '#00BCD4',
        radius: 'extra',
        semiDarkMenu: true,
        shadow: '18',
        skin: 'bordered',
        theme: 'dark',
      }),
    )

    const settings = readThemeCustomizerSettings()
    expect(settings).toEqual({
      layout: 'collapsed',
      primaryColor: '#00BCD4',
      radius: 'default',
      semiDarkMenu: false,
      shadow: '0',
      skin: 'default',
      theme: 'dark',
    })
  })

  it('syncs root dataset attributes for layout, radius, shadow, skin, and semiDarkMenu', () => {
    applyThemeCustomizerRootSettings({
      layout: 'collapsed',
      primaryColor: '#8B7CF6',
      radius: 'large',
      semiDarkMenu: true,
      shadow: '4',
      skin: 'bordered',
    })

    expect(document.documentElement.dataset.themeLayout).toBe('collapsed')
    expect(document.documentElement.dataset.themeRadius).toBe('large')
    expect(document.documentElement.dataset.themeShadow).toBe('4')
    expect(document.documentElement.dataset.themeSkin).toBe('bordered')
    expect(document.documentElement.dataset.themeSemiDarkMenu).toBe('true')
    expect(document.body.dataset.themeSkin).toBe('bordered')
  })
})
