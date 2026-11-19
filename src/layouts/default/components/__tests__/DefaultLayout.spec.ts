import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import DefaultLayout from '@/layouts/default/components/DefaultLayout.vue'
import vuetifyDefaults from '@/plugins/vuetify/defaults'
import { THEME_CUSTOMIZER_CHANGE_EVENT, THEME_CUSTOMIZER_OPEN_EVENT } from '@/composables/useThemeCustomizer'
import { flushPromises, shallowMount } from '@vue/test-utils'
import type { PluginSidebarNavItem } from '@/api/types'
import { nextTick, type Component } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface SidebarStoreMock {
  ensureSidebarNav: ReturnType<typeof vi.fn>
  items: PluginSidebarNavItem[]
}

const mocks = vi.hoisted(() => ({
  emptyComponent: { template: '<div><slot /></div>' },
  ensureSidebarNav: vi.fn(),
  navLink: {
    name: 'VerticalNavLink',
    props: ['item'],
    template: '<span data-testid="vertical-nav-link">{{ item.title }}</span>',
  },
  sidebarStore: undefined as SidebarStoreMock | undefined,
  userStore: undefined as { superUser: boolean } | undefined,
  appMode: { value: false } as { value: boolean },
  displayXs: { value: false } as { value: boolean },
  routeMock: { path: '/', meta: {} as Record<string, unknown> },
  footerStub: {
    name: 'Footer',
    props: ['showNav'],
    template: '<div data-testid="footer-stub" :data-show-nav="String(showNav)" />',
  },
  headerTabStub: {
    name: 'HeaderTab',
    props: ['items', 'modelValue'],
    template: '<div data-testid="header-tab-stub"><slot name="append" /></div>',
  },
  verticalNavLayout: {
    template:
      '<div><slot name="vertical-nav-content" /><slot name="dynamic-header-tab" /><slot /><slot name="footer" /></div>',
  },
}))

vi.mock('@layouts/components/VerticalNavLayout.vue', () => ({ default: mocks.verticalNavLayout }))
vi.mock('@layouts/components/VerticalNavLink.vue', () => ({ default: mocks.navLink }))
vi.mock('@layouts/components/VerticalNavSectionTitle.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/components/misc/ThemeLogoMark.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/components/theme/ThemeCustomizer.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/layouts/default/components/Footer.vue', () => ({ default: mocks.footerStub }))
vi.mock('@/layouts/default/components/HeaderTab.vue', () => ({ default: mocks.headerTabStub }))
vi.mock('@/layouts/default/components/OfflinePage.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/layouts/default/components/QuickAccess.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/layouts/default/components/SearchBar.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/layouts/default/components/ShortcutBar.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/layouts/default/components/UserNotification.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/layouts/default/components/UserProfile.vue', () => ({ default: mocks.emptyComponent }))

vi.mock('@/stores', async () => {
  const { reactive } = await import('vue')
  mocks.sidebarStore = reactive({
    ensureSidebarNav: mocks.ensureSidebarNav,
    items: [] as PluginSidebarNavItem[],
  })
  mocks.userStore = reactive({
    superUser: true,
  })

  return {
    useGlobalSettingsStore: () => ({ get: vi.fn(() => false) }),
    usePluginSidebarNavStore: () => mocks.sidebarStore,
    useUserStore: () => mocks.userStore,
  }
})

vi.mock('@/router/i18n-menu', () => ({
  getNavMenus: () => [{ header: 'menu.start', title: 'Built-in dashboard', to: '/dashboard' }],
  pluginSidebarSectionToHeaderKey: (section: string) => `menu.${section}`,
}))
vi.mock('@/composables/useOfflineStatus', () => ({
  useGlobalOfflineStatus: () => ({ isOffline: { value: false } }),
}))
vi.mock('@/composables/usePullDownGesture', () => ({
  usePullDownGesture: () => ({
    config: {
      MAX_PULL_DISTANCE: 220,
      SHOW_INDICATOR: 80,
      TRIGGER_THRESHOLD: 140,
    },
    contentTransform: { value: '' },
    contentTransition: { value: '' },
    indicatorOpacity: { value: 0 },
    indicatorRotation: { value: 0 },
    indicatorTransform: { value: '' },
    pullDistance: { value: 0 },
    showPullIndicator: { value: false },
  }),
}))
vi.mock('@/composables/usePWA', async () => {
  const { ref } = await import('vue')
  mocks.appMode = ref(false)

  return { usePWA: () => ({ appMode: mocks.appMode }) }
})
vi.mock('@/composables/useChineseText', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))
vi.mock('vue-router', async importOriginal => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => mocks.routeMock,
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('vuetify', async importOriginal => {
  const { ref } = await import('vue')
  mocks.displayXs = ref(false)

  return {
    ...(await importOriginal<typeof import('vuetify')>()),
    useDisplay: () => ({ mdAndDown: { value: false }, xs: mocks.displayXs }),
  }
})

describe('DefaultLayout', () => {
  beforeEach(() => {
    mocks.ensureSidebarNav.mockReset()
    mocks.ensureSidebarNav.mockResolvedValue(undefined)
    mocks.sidebarStore!.items = []
    mocks.userStore!.superUser = true
    mocks.appMode.value = false
    mocks.displayXs.value = false
    mocks.routeMock.path = '/'
    mocks.routeMock.meta = {}
  })

  it('removes theme customizer listeners while sidebar loading is still pending', async () => {
    let resolveSidebarNav!: () => void
    mocks.ensureSidebarNav.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          resolveSidebarNav = resolve
        }),
    )
    const addEventListener = vi.spyOn(window, 'addEventListener')
    const removeEventListener = vi.spyOn(window, 'removeEventListener')
    const wrapper = shallowMount(DefaultLayout, {
      global: {
        renderStubDefaultSlot: true,
        stubs: {
          IconBtn: mocks.emptyComponent,
          RouterLink: mocks.emptyComponent,
          VerticalNavLayout: mocks.verticalNavLayout,
          VerticalNavLink: mocks.navLink,
        },
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Built-in dashboard')

    const changeHandler = addEventListener.mock.calls.find(
      ([event]) => String(event) === THEME_CUSTOMIZER_CHANGE_EVENT,
    )?.[1]
    const openHandler = addEventListener.mock.calls.find(
      ([event]) => String(event) === THEME_CUSTOMIZER_OPEN_EVENT,
    )?.[1]

    expect(changeHandler).toBeTypeOf('function')
    expect(openHandler).toBeTypeOf('function')

    wrapper.unmount()

    expect(removeEventListener).toHaveBeenCalledWith(THEME_CUSTOMIZER_CHANGE_EVENT, changeHandler)
    expect(removeEventListener).toHaveBeenCalledWith(THEME_CUSTOMIZER_OPEN_EVENT, openHandler)

    resolveSidebarNav()
    await flushPromises()
  })

  it('replaces plugin links when the shared snapshot refreshes after mount', async () => {
    mocks.sidebarStore!.items = [
      {
        icon: 'mdi-puzzle-outline',
        nav_key: 'main',
        order: 1,
        plugin_id: 'old',
        section: 'system',
        title: 'Old plugin',
      },
    ]
    const wrapper = shallowMount(DefaultLayout, {
      global: {
        renderStubDefaultSlot: true,
        stubs: {
          IconBtn: mocks.emptyComponent as Component,
          RouterLink: mocks.emptyComponent as Component,
          VerticalNavLayout: mocks.verticalNavLayout,
          VerticalNavLink: mocks.navLink,
        },
      },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('Old plugin')

    mocks.sidebarStore!.items = [
      {
        icon: 'mdi-puzzle-outline',
        nav_key: 'main',
        order: 1,
        plugin_id: 'new',
        section: 'system',
        title: 'New plugin',
      },
    ]
    await nextTick()

    expect(wrapper.text()).toContain('New plugin')
    expect(wrapper.text()).not.toContain('Old plugin')
  })

  it('keeps mainContentPaddingTop at zero on desktop even when dynamic header tabs are registered', async () => {
    const wrapper = shallowMount(DefaultLayout, {
      global: {
        renderStubDefaultSlot: true,
        stubs: {
          IconBtn: mocks.emptyComponent as Component,
          RouterLink: mocks.emptyComponent as Component,
          VerticalNavLayout: mocks.verticalNavLayout,
          VerticalNavLink: mocks.navLink,
        },
      },
    })
    await flushPromises()

    const injectRegister = (
      window as Window & {
        __VUE_INJECT_DYNAMIC_HEADER_TAB__?: (tab: {
          items: Array<{ tab: string; title: string }>
          modelValue: string
        }) => void
      }
    ).__VUE_INJECT_DYNAMIC_HEADER_TAB__

    expect(injectRegister).toBeTypeOf('function')
    injectRegister?.({
      items: [{ title: 'TMDB', tab: 'themoviedb' }],
      modelValue: 'themoviedb',
    })
    await nextTick()

    const contentWrapper = wrapper.find('.main-content-wrapper')
    expect(contentWrapper.exists()).toBe(true)
    expect((contentWrapper.element as HTMLElement).style.paddingTop).toBe('0rem')

    // appMode 下同样由 --layout-navbar-block-size 统一承接，不再叠加 2.75rem 造成偏移偏差与切页跳动
    mocks.appMode.value = true
    await nextTick()
    expect((contentWrapper.element as HTMLElement).style.paddingTop).toBe('0rem')

    wrapper.unmount()
  })

  it('enforces Antigravity golden-ratio brand header, compact controls, inset switch, and settings tokens', () => {
    const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..')
    const verticalNavSource = readFileSync(resolve(rootDir, 'src/@layouts/components/VerticalNav.vue'), 'utf8')
    const verticalNavLayoutSource = readFileSync(
      resolve(rootDir, 'src/@layouts/components/VerticalNavLayout.vue'),
      'utf8',
    )
    const verticalNavScss = readFileSync(resolve(rootDir, 'src/@core/scss/_vertical-nav.scss'), 'utf8')
    const defaultLayoutSource = readFileSync(
      resolve(rootDir, 'src/layouts/default/components/DefaultLayout.vue'),
      'utf8',
    )
    const neoLogoSource = readFileSync(resolve(rootDir, 'src/components/misc/NeoLogoMark.vue'), 'utf8')
    const commonScss = readFileSync(resolve(rootDir, 'src/styles/common.scss'), 'utf8')

    // 1. VSwitch defaults to inset capsule
    expect(vuetifyDefaults.VSwitch).toMatchObject({
      color: 'primary',
      inset: true,
      hideDetails: 'auto',
    })

    // 2. Dual-axis centered nav-header and golden-ratio NEO logo (24px mark / 9px gap / 15px title)
    expect(verticalNavScss).toMatch(/\.nav-header\s*\{[\s\S]*?justify-content:\s*center;/m)
    expect(verticalNavSource).toMatch(/\.app-title-wrapper\s*\{[\s\S]*?gap:\s*9px;/m)
    expect(verticalNavSource).toMatch(/\.brand-logo-mark\s*\{[\s\S]*?block-size:\s*1\.5rem;/m)
    expect(verticalNavSource).toMatch(/\.app-logo-title\s*\{[\s\S]*?font-size:\s*0\.9375rem;/m)
    expect(verticalNavLayoutSource).toMatch(/\.app-logo\s+\.brand-logo-mark\s*\{[\s\S]*?block-size:\s*25px;/m)
    expect(defaultLayoutSource).toMatch(/\.theme-horizontal-logo\s*\{[\s\S]*?column-gap:\s*9px;/m)
    expect(neoLogoSource).toMatch(/\.neo-logo-mark\s*\{[\s\S]*?display:\s*block;[\s\S]*?flex-shrink:\s*0;/m)

    // 3. Global compact buttons, inset switch track/thumb, breathable inputs, and settings rows
    expect(commonScss).toContain('--mp-switch-off-bg:')
    expect(commonScss).toContain('--mp-field-bg:')
    expect(commonScss).toContain('--mp-field-hover-bg:')
    expect(commonScss).toContain('--v-btn-height: 32px;')
    expect(commonScss).toContain('.v-btn--variant-outlined:is(.text-primary, .text-secondary, .text-default)')
    expect(commonScss).toContain('.mp-settings-section-title')
    expect(commonScss).toContain('.mp-settings-group')
    expect(commonScss).toContain('.mp-settings-row')
    expect(commonScss).toContain('.mp-segmented')
    expect(commonScss).toContain('.mp-switch-card')
    expect(commonScss).toContain(':is(.v-radio, .v-checkbox, .v-checkbox-btn):not(.v-switch)')
    expect(commonScss).toContain('--v-field-label-scale: 0.85em;')
    expect(commonScss).not.toMatch(/--v-field-label-scale:\s*[\d.]+px/)
  })

  it('binds disabled, aria-label, title, click guard on dynamic header buttons and hides Footer when route.meta.hideFooter is set', async () => {
    mocks.routeMock.meta = { hideFooter: true }
    const disabledAction = vi.fn()
    const enabledAction = vi.fn()

    const BtnStub = {
      name: 'VBtn',
      props: ['icon', 'disabled', 'loading', 'title', 'color', 'variant'],
      emits: ['click'],
      template:
        '<button type="button" data-testid="dyn-btn" :disabled="disabled" :title="title" :data-color="color" :data-variant="variant" :data-icon="icon" @click="$emit(`click`)"><slot>{{ icon }}</slot></button>',
    }

    const wrapper = shallowMount(DefaultLayout, {
      global: {
        renderStubDefaultSlot: true,
        stubs: {
          Footer: mocks.footerStub,
          HeaderTab: mocks.headerTabStub,
          IconBtn: mocks.emptyComponent as Component,
          RouterLink: mocks.emptyComponent as Component,
          VBtn: BtnStub,
          VerticalNavLayout: mocks.verticalNavLayout,
          VerticalNavLink: mocks.navLink,
        },
      },
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="footer-stub"]').attributes('data-show-nav')).toBe('false')

    const injectRegister = (
      window as Window & {
        __VUE_INJECT_DYNAMIC_HEADER_TAB__?: (tab: {
          items: Array<{ tab: string; title: string }>
          modelValue: string
          appendButtons?: Array<{
            title?: string
            label?: string
            color?: string
            variant?: string
            show?: boolean
            testId?: string
            icon: string
            disabled?: boolean
            action?: () => void
          }>
        }) => void
      }
    ).__VUE_INJECT_DYNAMIC_HEADER_TAB__

    const labeledAction = vi.fn()
    const primaryAction = vi.fn()
    injectRegister?.({
      items: [{ title: 'TMDB', tab: 'themoviedb' }],
      modelValue: 'themoviedb',
      appendButtons: [
        { title: '禁用刷新', icon: 'mdi-refresh', disabled: true, action: disabledAction },
        { title: '可用刷新', icon: 'mdi-refresh', disabled: false, action: enabledAction },
        {
          title: '订阅历史',
          label: '订阅历史',
          testId: 'labeled-history-btn',
          icon: 'mdi-history',
          action: labeledAction,
        },
        {
          title: '添加下载',
          label: '添加下载',
          color: 'primary',
          variant: 'flat',
          testId: 'primary-add-btn',
          icon: 'mdi-plus',
          action: primaryAction,
        },
        {
          title: '隐藏按钮',
          label: '隐藏按钮',
          testId: 'hidden-btn',
          icon: 'mdi-eye-off',
          show: false,
        },
      ],
    })
    await nextTick()

    const buttons = wrapper.findAll('[data-testid="dyn-btn"]')
    expect(buttons).toHaveLength(2)
    expect(buttons[0].attributes('aria-label')).toBe('禁用刷新')
    expect(buttons[0].attributes('title')).toBe('禁用刷新')
    expect(buttons[0].attributes('disabled')).toBeDefined()

    expect(wrapper.find('[data-testid="hidden-btn"]').exists()).toBe(false)

    const labeledBtn = wrapper.get('[data-testid="labeled-history-btn"]')
    expect(labeledBtn.text()).toContain('订阅历史')
    expect(labeledBtn.attributes('data-variant')).toBe('outlined')
    await labeledBtn.trigger('click')
    expect(labeledAction).toHaveBeenCalledOnce()

    const primaryBtn = wrapper.get('[data-testid="primary-add-btn"]')
    expect(primaryBtn.text()).toContain('添加下载')
    expect(primaryBtn.attributes('data-color')).toBe('primary')
    expect(primaryBtn.attributes('data-variant')).toBe('flat')
    await primaryBtn.trigger('click')
    expect(primaryAction).toHaveBeenCalledOnce()

    // 窄屏 xs 下带文本标签的按钮应自动回退为紧凑图标按钮，且保留主按钮 flat 变体与无障碍标签
    mocks.displayXs.value = true
    await nextTick()
    const compactPrimaryBtn = wrapper.get('[data-testid="primary-add-btn"]')
    expect(compactPrimaryBtn.attributes('data-icon')).toBe('mdi-plus')
    expect(compactPrimaryBtn.attributes('data-color')).toBe('primary')
    expect(compactPrimaryBtn.attributes('data-variant')).toBe('flat')
    expect(compactPrimaryBtn.attributes('aria-label')).toBe('添加下载')

    const compactHistoryBtn = wrapper.get('[data-testid="labeled-history-btn"]')
    expect(compactHistoryBtn.attributes('data-icon')).toBe('mdi-history')
    expect(compactHistoryBtn.attributes('data-variant')).toBe('text')
    mocks.displayXs.value = false
    await nextTick()

    // 即使直接触发组件 click 事件，handleHeaderButtonClick 守卫也应阻止禁用按钮执行 action
    wrapper.findAllComponents(BtnStub)[0].vm.$emit('click')
    expect(disabledAction).not.toHaveBeenCalled()

    await buttons[1].trigger('click')
    expect(enabledAction).toHaveBeenCalledOnce()

    wrapper.unmount()
  })
})
