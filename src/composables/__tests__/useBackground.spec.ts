import { useBackground } from '@/composables/useBackground'
import { mount } from '@vue/test-utils'
import { defineComponent, h, KeepAlive, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const timerMocks = vi.hoisted(() => ({
  addBackgroundTimer: vi.fn(),
  removeBackgroundTimer: vi.fn(),
}))

vi.mock('@/utils/backgroundManager', () => ({
  addBackgroundTimer: (...args: unknown[]) => timerMocks.addBackgroundTimer(...args),
  removeBackgroundTimer: (...args: unknown[]) => timerMocks.removeBackgroundTimer(...args),
}))

describe('useBackground KeepAlive lifecycle', () => {
  beforeEach(() => {
    timerMocks.addBackgroundTimer.mockReset()
    timerMocks.removeBackgroundTimer.mockReset()
  })

  it('pauses useTimer on deactivation and restores it on reactivation without duplicating initial mount', async () => {
    const callback = vi.fn()
    const active = ref(true)
    const Child = defineComponent({
      setup() {
        const { useTimer } = useBackground()
        useTimer('timer-1', callback, 3000, { skipInitialRun: true })
        return () => h('div', 'child')
      },
    })
    const Host = defineComponent({
      setup() {
        return () => h(KeepAlive, null, { default: () => (active.value ? h(Child) : h('div', 'idle')) })
      },
    })

    mount(Host)
    await nextTick()
    expect(timerMocks.addBackgroundTimer).toHaveBeenCalledTimes(1)
    expect(timerMocks.removeBackgroundTimer).not.toHaveBeenCalled()

    active.value = false
    await nextTick()
    expect(timerMocks.removeBackgroundTimer).toHaveBeenCalledWith('timer-1')

    active.value = true
    await nextTick()
    expect(timerMocks.addBackgroundTimer).toHaveBeenCalledTimes(2)
  })

  it('pauses useDataRefresh on deactivation and refreshes + restores timer on reactivation', async () => {
    const loadData = vi.fn().mockResolvedValue(undefined)
    const active = ref(true)
    const Child = defineComponent({
      setup() {
        const { useDataRefresh } = useBackground()
        useDataRefresh('refresh-1', loadData, 3000, true)
        return () => h('div', 'child')
      },
    })
    const Host = defineComponent({
      setup() {
        return () => h(KeepAlive, null, { default: () => (active.value ? h(Child) : h('div', 'idle')) })
      },
    })

    mount(Host)
    await nextTick()
    await nextTick()
    expect(loadData).toHaveBeenCalledTimes(1)
    expect(timerMocks.addBackgroundTimer).toHaveBeenCalledTimes(1)

    active.value = false
    await nextTick()
    expect(timerMocks.removeBackgroundTimer).toHaveBeenCalledWith('refresh-1')

    active.value = true
    await nextTick()
    await nextTick()
    expect(loadData).toHaveBeenCalledTimes(2)
    expect(timerMocks.addBackgroundTimer).toHaveBeenCalledTimes(2)
  })

  it('pauses useConditionalDataRefresh on deactivation and resumes only when condition is true', async () => {
    const loadData = vi.fn().mockResolvedValue(undefined)
    const condition = ref(true)
    const active = ref(true)
    const Child = defineComponent({
      setup() {
        const { useConditionalDataRefresh } = useBackground()
        useConditionalDataRefresh('cond-1', loadData, condition, 3000, false)
        return () => h('div', 'child')
      },
    })
    const Host = defineComponent({
      setup() {
        return () => h(KeepAlive, null, { default: () => (active.value ? h(Child) : h('div', 'idle')) })
      },
    })

    mount(Host)
    await nextTick()
    expect(timerMocks.addBackgroundTimer).toHaveBeenCalledTimes(1)

    active.value = false
    await nextTick()
    expect(timerMocks.removeBackgroundTimer).toHaveBeenCalledWith('cond-1')

    // 停用状态下切换 condition 不会重启定时器，重新激活但 condition=false 时同样保持暂停
    condition.value = false
    active.value = true
    await nextTick()
    expect(timerMocks.addBackgroundTimer).toHaveBeenCalledTimes(1)

    condition.value = true
    await nextTick()
    expect(timerMocks.addBackgroundTimer).toHaveBeenCalledTimes(2)
  })
})
