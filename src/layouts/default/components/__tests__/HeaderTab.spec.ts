import HeaderTab from '@/layouts/default/components/HeaderTab.vue'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
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
})
