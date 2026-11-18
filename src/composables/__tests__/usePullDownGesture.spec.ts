import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { usePullDownGesture } from '@/composables/usePullDownGesture'

vi.mock('vuetify', () => ({
  useDisplay: () => ({
    mdAndDown: ref(true),
  }),
}))

vi.mock('@/composables/usePWA', () => ({
  usePWA: () => ({
    appMode: ref(true),
  }),
}))

describe('usePullDownGesture', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('excludes .plugin-quick-access from blocking pull-down gesture when hidden/mounted', () => {
    const panel = document.createElement('div')
    panel.className = 'plugin-quick-access'
    panel.setAttribute('role', 'dialog')
    document.body.appendChild(panel)

    let exposed!: ReturnType<typeof usePullDownGesture>
    const Host = defineComponent({
      setup() {
        exposed = usePullDownGesture({ enabled: true })
        return () => null
      },
    })

    const wrapper = mount(Host)
    expect(exposed.hasOpenDialog('.quick-access-panel, .plugin-quick-access')).toBe(false)

    // 触发 touchstart 検証不把 .plugin-quick-access 误判为阻塞弹窗
    const touchStart = new Event('touchstart') as TouchEvent
    Object.defineProperty(touchStart, 'touches', { value: [{ clientY: 10 }] })
    document.dispatchEvent(touchStart)

    const touchMove = new Event('touchmove', { cancelable: true }) as TouchEvent
    Object.defineProperty(touchMove, 'touches', { value: [{ clientY: 120 }] })
    document.dispatchEvent(touchMove)

    expect(exposed.isPulling.value).toBe(true)
    wrapper.unmount()
  })
})
