import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import HeaderTab from '@/layouts/default/components/HeaderTab.vue'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/composables/useStateRestore', () => ({
  useTabStateRestore: (initial: string) => ({ activeTab: ref(initial) }),
}))

describe('HeaderTab.vue timer cleanup', () => {
  it('clears pending resize and scroll indicator timers on unmount', () => {
    vi.useFakeTimers()
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')

    const wrapper = mount(HeaderTab, {
      props: {
        modelValue: 'tab1',
        items: [
          { title: 'Tab 1', tab: 'tab1' },
          { title: 'Tab 2', tab: 'tab2' },
        ],
      },
      global: {
        stubs: {
          VBtn: { template: '<button @click="$emit(`click`)"><slot /></button>' },
          VIcon: true,
        },
      },
    })

    window.dispatchEvent(new Event('resize'))
    clearTimeoutSpy.mockClear()

    wrapper.unmount()
    expect(clearTimeoutSpy).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('tracks overflow fade classes on touch devices without showing arrow buttons and defines compact mobile styles', async () => {
    const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockImplementation(
      query =>
        ({
          matches: query.includes('pointer: coarse'),
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList,
    )

    const wrapper = mount(HeaderTab, {
      props: {
        modelValue: 'tab1',
        items: [
          { title: 'Tab 1', tab: 'tab1' },
          { title: 'Tab 2', tab: 'tab2' },
          { title: 'Tab 3', tab: 'tab3' },
          { title: 'Tab 4', tab: 'tab4' },
        ],
      },
      global: {
        stubs: {
          VBtn: { template: '<button class="scroll-btn-stub" @click="$emit(`click`)"><slot /></button>' },
          VIcon: true,
        },
      },
    })

    const tabsEl = wrapper.get('.header-tabs').element as HTMLElement
    Object.defineProperty(tabsEl, 'scrollWidth', { value: 420, configurable: true })
    Object.defineProperty(tabsEl, 'clientWidth', { value: 240, configurable: true })
    Object.defineProperty(tabsEl, 'scrollLeft', { value: 0, writable: true, configurable: true })

    tabsEl.dispatchEvent(new Event('scroll'))
    await nextTick()

    expect(wrapper.find('.scroll-button').exists()).toBe(false)
    expect(wrapper.get('.header-tabs').classes()).toContain('has-overflow-right')
    expect(wrapper.get('.header-tabs').classes()).not.toContain('has-overflow-left')

    tabsEl.scrollLeft = 60
    tabsEl.dispatchEvent(new Event('scroll'))
    await nextTick()

    expect(wrapper.get('.header-tabs').classes()).toContain('has-overflow-left')
    expect(wrapper.get('.header-tabs').classes()).toContain('has-overflow-right')

    const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..')
    const headerTabSource = readFileSync(resolve(rootDir, 'src/layouts/default/components/HeaderTab.vue'), 'utf8')
    expect(headerTabSource).toContain('@media (width <= 600px)')
    expect(headerTabSource).toContain('padding-inline: 9px;')
    expect(headerTabSource).toContain('font-size: 12.5px;')
    expect(headerTabSource).toContain('mask-image:')

    wrapper.unmount()
    matchMediaSpy.mockRestore()
  })
})
