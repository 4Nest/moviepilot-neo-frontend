import { readFileSync } from 'node:fs'
import { attachRouterNavigationGuards, isAllowedSubscribeUserPath } from '@/router'
import { useAuthStore, useUserStore } from '@/stores'
import { isNavigatingState, setNavigatingState } from '@/utils/requestOptimizer'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const PageStub = defineComponent({
  setup: () => () => h('div'),
})

describe('router navigation reset timer and nginx prefix guards', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    setNavigatingState(false)
    const authStore = useAuthStore()
    const userStore = useUserStore()
    authStore.setToken('valid-token')
    userStore.setSuperUser(true)
  })

  afterEach(() => {
    vi.useRealTimers()
    setNavigatingState(false)
  })

  it('cancels the previous reset timer during rapid consecutive navigations', async () => {
    vi.useFakeTimers()

    let resolveSlowRoute!: () => void
    const slowRouteGate = new Promise<void>(resolve => {
      resolveSlowRoute = resolve
    })

    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/recommend', component: PageStub, meta: { requiresAuth: true } },
        { path: '/discover', component: PageStub, meta: { requiresAuth: true } },
        {
          path: '/plugins',
          component: () => slowRouteGate.then(() => PageStub),
          meta: { requiresAuth: true },
        },
      ],
    })
    attachRouterNavigationGuards(testRouter)

    await testRouter.push('/recommend')
    await vi.runAllTimersAsync()
    expect(isNavigatingState()).toBe(false)

    // 第一次导航完成后调度重置定时器，尚未触发时立刻发起第二次慢导航
    await testRouter.push('/discover')
    const secondNav = testRouter.push('/plugins')
    await Promise.resolve()

    // 推进所有宏任务：旧导航的重置定时器应已被 clearTimeout，不得提前将第二次在途导航置为 false
    await vi.advanceTimersByTimeAsync(200)
    expect(isNavigatingState()).toBe(true)

    // 第二次导航完成后应通过 nextTick + 短定时器干净归位为 false
    resolveSlowRoute()
    await secondNav
    await vi.runAllTimersAsync()
    expect(isNavigatingState()).toBe(false)
  })

  it('keeps ordinary user path whitelist and nginx ^~ prefix locations intact', () => {
    expect(isAllowedSubscribeUserPath('/subscribe/tv')).toBe(true)
    expect(isAllowedSubscribeUserPath('/plugins')).toBe(false)

    const nginxConf = readFileSync('public/nginx.conf', 'utf8')
    expect(nginxConf).toContain('client_max_body_size 50m;')
    expect(nginxConf).toContain('location ^~ /assets')
    expect(nginxConf).toContain('location ^~ /api/v1/site/icon/')
    expect(nginxConf).toContain('location ^~ /api')
  })
})
