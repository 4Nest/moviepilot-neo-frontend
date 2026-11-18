import ThemeCustomizer from '@/components/theme/ThemeCustomizer.vue'
import { persistPartialThemeCustomizerSettings } from '@/composables/useThemeCustomizer'
import vuetify from '@/plugins/vuetify'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  appModeRef: null as unknown as { value: boolean },
  nativeChromeActiveRef: null as unknown as { value: boolean },
}))

vi.mock('@/composables/usePWA', async () => {
  const { ref } = await import('vue')
  if (!hoisted.appModeRef) hoisted.appModeRef = ref(false)
  return {
    usePWA: () => ({
      appMode: hoisted.appModeRef,
    }),
  }
})

vi.mock('@/native/layout', async () => {
  const { ref } = await import('vue')
  if (!hoisted.nativeChromeActiveRef) hoisted.nativeChromeActiveRef = ref(false)
  return {
    nativeChromeActive: hoisted.nativeChromeActiveRef,
  }
})

vi.mock('@/composables/useChineseText', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params?.color ? `${key}:${String(params.color)}` : key),
  }),
}))

describe('ThemeCustomizer', () => {
  function mountPanel() {
    return mount(ThemeCustomizer, {
      global: {
        plugins: [vuetify],
        stubs: {
          IconBtn: {
            template: '<button type="button" v-bind="$attrs"><slot /></button>',
          },
          VTooltip: {
            template: '<span><slot name="activator" :props="{}" /></span>',
          },
        },
      },
    })
  }

  beforeEach(() => {
    if (hoisted.appModeRef) hoisted.appModeRef.value = false
    if (hoisted.nativeChromeActiveRef) hoisted.nativeChromeActiveRef.value = false
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
  })

  it('renders only core IDE appearance sections without legacy skin, radius, shadow, or semi-dark controls', () => {
    const wrapper = mountPanel()

    expect(wrapper.findAll('[data-testid="theme-mode-option"]')).toHaveLength(3)
    expect(wrapper.find('[data-testid="primary-color-hex"]').text()).toBe('#8B7CF6')
    expect(wrapper.findAll('[data-testid="layout-option"]')).toHaveLength(3)

    expect(wrapper.find('.theme-customizer-shadow-slider').exists()).toBe(false)
    expect(wrapper.find('.theme-customizer-radius-scene').exists()).toBe(false)
    expect(wrapper.find('.theme-customizer-border-scene').exists()).toBe(false)
    expect(wrapper.find('.theme-customizer-semi-dark').exists()).toBe(false)

    wrapper.unmount()
  })

  it('updates theme mode, primary color, and desktop layout cleanly and supports reset', async () => {
    const wrapper = mountPanel()

    const darkOption = wrapper.find('[data-testid="theme-mode-option"][data-value="dark"]')
    await darkOption.trigger('click')
    expect(darkOption.classes()).toContain('is-active')

    const cyanSwatch = wrapper.find('[data-testid="color-swatch"][data-color="#00BCD4"]')
    await cyanSwatch.trigger('click')
    expect(wrapper.find('[data-testid="primary-color-hex"]').text()).toBe('#00BCD4')

    const collapsedLayout = wrapper.find('[data-testid="layout-option"][data-value="collapsed"]')
    await collapsedLayout.trigger('click')
    expect(collapsedLayout.classes()).toContain('is-active')

    await wrapper.find('[data-testid="theme-customizer-reset"]').trigger('click')
    expect(wrapper.find('[data-testid="primary-color-hex"]').text()).toBe('#8B7CF6')
    expect(wrapper.find('[data-testid="layout-option"][data-value="vertical"]').classes()).toContain('is-active')

    wrapper.unmount()
  })

  it('hides desktop layout section in appMode and emits close on Escape or close button click', async () => {
    hoisted.appModeRef.value = true
    const wrapper = mountPanel()

    expect(wrapper.findAll('[data-testid="layout-option"]')).toHaveLength(0)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toHaveLength(1)

    await wrapper.find('[data-native-dialog-close]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(2)

    wrapper.unmount()
  })
})
