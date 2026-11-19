import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import VerticalNavLayout, { SIDEBAR_COLLAPSED_STORAGE_KEY } from '@layouts/components/VerticalNavLayout.vue'
import VerticalNavLink from '@layouts/components/VerticalNavLink.vue'
import {
  THEME_CUSTOMIZER_CHANGE_EVENT,
  THEME_CUSTOMIZER_STORAGE_KEY,
  type ThemeCustomizerSettings,
} from '@/composables/useThemeCustomizer'

const mocks = vi.hoisted(() => ({
  mdAndDown: { value: false } as { value: boolean },
  appMode: { value: false } as { value: boolean },
  routeMock: { path: '/dashboard', meta: {} as Record<string, unknown> },
}))

vi.mock('vuetify', async importOriginal => {
  const { ref: vueRef } = await import('vue')
  mocks.mdAndDown = vueRef(false)

  return {
    ...(await importOriginal<typeof import('vuetify')>()),
    useDisplay: () => ({ mdAndDown: mocks.mdAndDown }),
  }
})

vi.mock('@/composables/usePWA', async () => {
  const { ref: vueRef } = await import('vue')
  mocks.appMode = vueRef(false)

  return {
    usePWA: () => ({ appMode: mocks.appMode }),
  }
})

vi.mock('vue-router', async importOriginal => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => mocks.routeMock,
}))

function mountLayout() {
  return mount(VerticalNavLayout, {
    global: {
      stubs: {
        NeoLogoMark: { template: '<span class="brand-logo-mark" />' },
        PerfectScrollbar: { template: '<ul class="nav-items"><slot /></ul>' },
        RouterLink: {
          props: ['to'],
          template: '<a :href="to"><slot /></a>',
        },
        VIcon: {
          props: ['icon'],
          template: '<i class="v-icon" :data-icon="icon" />',
        },
      },
    },
    slots: {
      'vertical-nav-content': () => '<li class="nav-link"><a href="/dashboard">首页</a></li>',
      'default': () => '<div data-testid="page-content">Main</div>',
    },
  })
}

describe('VerticalNavLayout sidebar collapse (rail mode)', () => {
  beforeEach(() => {
    localStorage.clear()
    mocks.mdAndDown.value = false
    mocks.appMode.value = false
    mocks.routeMock.path = '/dashboard'
    mocks.routeMock.meta = {}
  })

  it('toggles desktop rail mode via collapse button and persists to localStorage', async () => {
    const wrapper = mountLayout()
    await nextTick()

    const root = wrapper.find('.layout-wrapper')
    const toggleBtn = wrapper.find('[data-testid="sidebar-collapse-toggle"]')

    expect(toggleBtn.exists()).toBe(true)
    expect(toggleBtn.text().trim()).toBe('')
    expect(root.classes()).not.toContain('layout-vertical-nav-collapsed')
    expect(toggleBtn.attributes('aria-label')).toBe('收起侧边栏')
    expect(toggleBtn.attributes('title')).toBe('收起侧边栏')
    expect(toggleBtn.attributes('aria-expanded')).toBe('true')

    await toggleBtn.trigger('click')
    await nextTick()

    expect(root.classes()).toContain('layout-vertical-nav-collapsed')
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe('true')
    expect(toggleBtn.attributes('aria-label')).toBe('展开侧边栏')
    expect(toggleBtn.attributes('title')).toBe('展开侧边栏')
    expect(toggleBtn.attributes('aria-expanded')).toBe('false')

    await toggleBtn.trigger('click')
    await nextTick()

    expect(root.classes()).not.toContain('layout-vertical-nav-collapsed')
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe('false')
    expect(toggleBtn.attributes('aria-label')).toBe('收起侧边栏')
    expect(toggleBtn.attributes('aria-expanded')).toBe('true')

    wrapper.unmount()
  })

  it('restores collapsed state from localStorage on desktop mount', async () => {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, 'true')

    const wrapper = mountLayout()
    await nextTick()

    const root = wrapper.find('.layout-wrapper')
    const toggleBtn = wrapper.find('[data-testid="sidebar-collapse-toggle"]')

    expect(root.classes()).toContain('layout-vertical-nav-collapsed')
    expect(toggleBtn.exists()).toBe(true)
    expect(toggleBtn.attributes('aria-expanded')).toBe('false')

    wrapper.unmount()
  })

  it('keeps mobile drawer expanded and hides desktop collapse button even when MP_SIDEBAR_COLLAPSED is true', async () => {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, 'true')
    mocks.mdAndDown.value = true

    const wrapper = mountLayout()
    await nextTick()

    const root = wrapper.find('.layout-wrapper')
    expect(root.classes()).toContain('layout-overlay-nav')
    expect(root.classes()).not.toContain('layout-vertical-nav-collapsed')
    expect(wrapper.find('[data-testid="sidebar-collapse-toggle"]').exists()).toBe(false)

    // 切回桌面端时恢复折叠态
    mocks.mdAndDown.value = false
    await nextTick()

    expect(root.classes()).toContain('layout-vertical-nav-collapsed')
    expect(wrapper.find('[data-testid="sidebar-collapse-toggle"]').exists()).toBe(true)

    wrapper.unmount()
  })

  it('syncs with ThemeCustomizer layout change events and disables rail mode in horizontal layout', async () => {
    const wrapper = mountLayout()
    await nextTick()

    const root = wrapper.find('.layout-wrapper')

    window.dispatchEvent(
      new CustomEvent<ThemeCustomizerSettings>(THEME_CUSTOMIZER_CHANGE_EVENT, {
        detail: {
          layout: 'collapsed',
          primaryColor: '#8B7CF6',
          radius: 'default',
          semiDarkMenu: false,
          shadow: '0',
          skin: 'default',
          theme: 'auto',
        },
      }),
    )
    await nextTick()

    expect(root.classes()).toContain('layout-vertical-nav-collapsed')
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe('true')

    window.dispatchEvent(
      new CustomEvent<ThemeCustomizerSettings>(THEME_CUSTOMIZER_CHANGE_EVENT, {
        detail: {
          layout: 'horizontal',
          primaryColor: '#8B7CF6',
          radius: 'default',
          semiDarkMenu: false,
          shadow: '0',
          skin: 'default',
          theme: 'auto',
        },
      }),
    )
    await nextTick()

    expect(root.classes()).toContain('layout-horizontal-nav-active')
    expect(root.classes()).not.toContain('layout-vertical-nav-collapsed')
    expect(wrapper.find('[data-testid="sidebar-collapse-toggle"]').exists()).toBe(false)

    // 清理主题存储影响
    localStorage.removeItem(THEME_CUSTOMIZER_STORAGE_KEY)
    wrapper.unmount()
  })

  it('renders native title and aria-label on VerticalNavLink for collapsed hover hint', () => {
    const isRefCheck = ref(true)
    expect(isRefCheck.value).toBe(true)

    const wrapper = mount(VerticalNavLink, {
      props: {
        item: {
          title: '推荐',
          icon: 'mdi-fire',
          to: '/recommend',
        },
      },
      global: {
        stubs: {
          RouterLink: {
            props: ['to'],
            template: '<a :href="to"><slot /></a>',
          },
          VIcon: {
            props: ['icon'],
            template: '<i class="v-icon" :data-icon="icon" />',
          },
        },
      },
    })

    const link = wrapper.get('a')
    expect(link.attributes('title')).toBe('推荐')
    expect(link.attributes('aria-label')).toBe('推荐')
  })

  it('uses --layout-vertical-nav-width CSS variable, divider section title, and zero glassmorphism', () => {
    const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
    const layoutSource = readFileSync(resolve(rootDir, 'src/@layouts/components/VerticalNavLayout.vue'), 'utf8')
    const navSource = readFileSync(resolve(rootDir, 'src/@layouts/components/VerticalNav.vue'), 'utf8')
    const varsSource = readFileSync(resolve(rootDir, 'src/@core/scss/_variables.scss'), 'utf8')

    expect(varsSource).toContain('$layout-vertical-nav-collapsed-width: 68px !default')
    expect(layoutSource).toContain('--layout-vertical-nav-width:')
    expect(layoutSource).toContain('padding-inline-start: var(--layout-vertical-nav-width)')
    expect(layoutSource).toContain('inline-size: calc(100% - var(--layout-vertical-nav-width))')
    expect(layoutSource).not.toContain('backdrop-filter')
    expect(navSource).not.toContain('backdrop-filter')
  })

  it('unifies mobile appMode shell spacing, drawer dvh height, and zero desktop footer whitespace', () => {
    const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
    const layoutSource = readFileSync(resolve(rootDir, 'src/@layouts/components/VerticalNavLayout.vue'), 'utf8')
    const navSource = readFileSync(resolve(rootDir, 'src/@layouts/components/VerticalNav.vue'), 'utf8')
    const defaultLayoutScss = readFileSync(resolve(rootDir, 'src/@layouts/styles/_default-layout.scss'), 'utf8')

    // 顶栏偏移统一由 --layout-navbar-block-size 承接，不再排除 appMode
    expect(layoutSource).not.toContain('&:not(.layout-app-mode).layout-navbar-fixed .layout-page-content')
    expect(layoutSource).toMatch(
      /&\.layout-navbar-fixed\s+\.layout-page-content\s*\{[\s\S]*?padding-block-start:\s*var\(--layout-navbar-block-size\);/m,
    )

    // 移动端抽屉补齐 100dvh 并保留 100% 回退
    expect(navSource).toContain('block-size: 100%;\n  block-size: 100dvh;')

    // 桌面端 footer 占位归零，仅 appMode 保留悬浮底栏安全占位
    expect(defaultLayoutScss).toMatch(/\.footer-content-container\s*\{\s*block-size:\s*0;/m)
    expect(defaultLayoutScss).toContain('.layout-app-mode & .footer-content-container')
    expect(defaultLayoutScss).toContain('calc(5.25rem + env(safe-area-inset-bottom, 0px))')
  })
})
