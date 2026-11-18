<script lang="ts">
import { useDisplay } from 'vuetify'
import VerticalNav from '@layouts/components/VerticalNav.vue'
import {
  readThemeCustomizerSettings,
  THEME_CUSTOMIZER_CHANGE_EVENT,
  type ThemeCustomizerSettings,
} from '@/composables/useThemeCustomizer'
import { usePWA } from '@/composables/usePWA'

export default defineComponent({
  setup(_props, { slots }) {
    const isOverlayNavActive = ref(false)
    const isLayoutOverlayVisible = ref(false)
    const toggleIsOverlayNavActive = useToggle(isOverlayNavActive)

    const route = useRoute()
    const { mdAndDown } = useDisplay()
    const { appMode } = usePWA()
    const themeLayout = ref(readThemeCustomizerSettings().layout)
    const canUseDesktopLayout = computed(() => !mdAndDown.value && !appMode.value)
    const isCollapsedLayout = computed(() => canUseDesktopLayout.value && themeLayout.value === 'collapsed')
    const isHorizontalLayout = computed(() => canUseDesktopLayout.value && themeLayout.value === 'horizontal')

    syncRef(isOverlayNavActive, isLayoutOverlayVisible)

    const scrollDistance = ref(window.scrollY)
    const isDialogOpen = ref(false)
    const wasScrolledBeforeDialog = ref(false)
    let dialogObserver: MutationObserver | null = null

    const handleScroll = () => {
      scrollDistance.value = window.scrollY
    }

    const handleThemeCustomizerChange = (event: Event) => {
      themeLayout.value = (event as CustomEvent<ThemeCustomizerSettings>).detail.layout
    }

    // 监听弹窗状态变化
    const checkDialogState = () => {
      const wasDialogOpen = isDialogOpen.value
      isDialogOpen.value = document.documentElement.classList.contains('v-overlay-scroll-blocked')

      if (!wasDialogOpen && isDialogOpen.value) {
        wasScrolledBeforeDialog.value = scrollDistance.value > 10
      }
    }

    onMounted(() => {
      window.addEventListener('scroll', handleScroll)
      window.addEventListener(THEME_CUSTOMIZER_CHANGE_EVENT, handleThemeCustomizerChange)

      checkDialogState()

      dialogObserver = new MutationObserver(checkDialogState)
      dialogObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      })
    })

    onBeforeUnmount(() => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener(THEME_CUSTOMIZER_CHANGE_EVENT, handleThemeCustomizerChange)
      dialogObserver?.disconnect()
      dialogObserver = null
    })

    return () => {
      // 👉 Vertical nav
      const verticalNav = h(
        VerticalNav,
        { isOverlayNavActive: isOverlayNavActive.value, toggleIsOverlayNavActive },
        {
          'nav-header': () => slots['vertical-nav-header']?.(),
          'before-nav-items': () => slots['before-vertical-nav-items']?.(),
          'default': () => slots['vertical-nav-content']?.(),
          'after-nav-items': () => slots['after-vertical-nav-items']?.(),
        },
      )

      // 👉 Navbar (L0 solid shell)
      const navbar = h(
        'header',
        { class: ['layout-navbar'] },
        [
          h(
            'div',
            { class: 'navbar-content-container' },
            [
              slots.navbar?.({
                toggleVerticalOverlayNavActive: toggleIsOverlayNavActive,
              }),
              // 👉 Dynamic Header Tab in NavBar
              slots['dynamic-header-tab']?.()
                ? h('div', { class: 'layout-dynamic-header-tab' }, slots['dynamic-header-tab']?.())
                : null,
            ].filter(Boolean),
          ),
        ].filter(Boolean),
      )

      const main = h(
        'main',
        { class: 'layout-page-content' },
        h('section', { class: 'page-content-container' }, slots.default?.()),
      )

      // 👉 根据路由 meta 决定 footer 高度
      const shouldShowFooter = !route.meta.hideFooter
      const isNavbarScrolled = scrollDistance.value > 5 || (isDialogOpen.value && wasScrolledBeforeDialog.value)

      // 👉 Footer
      const footer = h('footer', { class: 'layout-footer' }, [
        h(
          'div',
          {
            class: ['footer-content-container', !shouldShowFooter && 'footer-content-container-noheight'],
          },
          slots.footer?.(),
        ),
      ])

      // 👉 Overlay
      const layoutOverlay = h('div', {
        class: ['layout-overlay', 'touch-none', { visible: isLayoutOverlayVisible.value }],
        onClick: () => {
          isLayoutOverlayVisible.value = !isLayoutOverlayVisible.value
        },
      })

      return h(
        'div',
        {
          class: [
            'layout-wrapper layout-nav-type-vertical layout-navbar-static layout-footer-static layout-content-width-fluid',
            'layout-navbar-fixed',
            appMode.value && 'layout-app-mode',
            mdAndDown.value && 'layout-overlay-nav',
            isCollapsedLayout.value && 'layout-vertical-nav-collapsed',
            isHorizontalLayout.value && 'layout-horizontal-nav-active',
            isHorizontalLayout.value && isNavbarScrolled && 'layout-horizontal-nav-scrolled',
            route.meta.layoutWrapperClasses,
            !isHorizontalLayout.value && isNavbarScrolled && 'window-scrolled',
          ],
        },
        [verticalNav, h('div', { class: 'layout-content-wrapper' }, [navbar, main, footer]), layoutOverlay],
      )
    }
  },
})
</script>

<style lang="scss">
/* stylelint-disable no-descending-specificity */

@use '@configured-variables' as variables;
@use '@layouts/styles/placeholders';
@use '@layouts/styles/mixins';

.layout-page-content {
  position: relative;
  z-index: 1;
  margin-block-start: 0;
}

.layout-wrapper.layout-nav-type-vertical {
  --layout-navbar-block-size: calc(
    env(safe-area-inset-top, 0px) + #{variables.$layout-vertical-nav-navbar-height} + var(--navbar-tab-height, 0rem)
  );

  min-block-size: 100%;

  .layout-content-wrapper {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    min-block-size: calc(var(--vh, 1vh) * 100);
    min-inline-size: 0;
    transition: padding-inline-start 0.2s ease-in-out;
    will-change: padding-inline-start;
  }

  .layout-navbar {
    position: fixed;
    z-index: variables.$layout-vertical-nav-layout-navbar-z-index;
    backface-visibility: hidden;
    background-color: var(--mp-canvas-bg);
    border-block-end: 1px solid var(--mp-border-subtle);
    block-size: var(--layout-navbar-block-size);
    box-shadow: none;
    inline-size: calc(100% - variables.$layout-vertical-nav-width);
    inset-block-start: 0;
    inset-inline-end: 0;
    margin-inline: 0;
    max-inline-size: none;
    padding-inline: 0;
    transform: translate3d(0, 0, 0);

    .navbar-content-container {
      background-color: transparent;
      block-size: var(--layout-navbar-block-size);
      box-shadow: none;
      margin-inline: 0;
      max-inline-size: none;
      padding-block-start: env(safe-area-inset-top, 0px);
      padding-inline: 20px;
    }
  }

  &.layout-navbar-fixed .layout-navbar {
    @extend %layout-navbar-fixed;
  }

  &.layout-navbar-hidden .layout-navbar {
    @extend %layout-navbar-hidden;
  }

  // 👉 Footer
  .layout-footer {
    @include mixins.boxed-content;
  }

  // 👉 Layout overlay
  .layout-overlay {
    position: fixed;
    z-index: variables.$layout-overlay-z-index;
    background-color: rgb(0 0 0 / 60%);
    cursor: pointer;
    inset: 0;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.25s ease-in-out;
    will-change: transform;

    &.visible {
      opacity: 1;
      pointer-events: auto;
    }
  }

  &:not(.layout-overlay-nav) .layout-content-wrapper {
    padding-inline-start: calc(variables.$layout-vertical-nav-width);
  }

  // Adjust right column pl when vertical nav is collapsed
  &.layout-vertical-nav-collapsed .layout-content-wrapper {
    padding-inline-start: variables.$layout-vertical-nav-collapsed-width;
  }

  &.layout-vertical-nav-collapsed .layout-navbar {
    inline-size: calc(100% - variables.$layout-vertical-nav-collapsed-width);
  }

  &.layout-vertical-nav-collapsed .layout-vertical-nav:not(.overlay-nav) {
    .nav-header {
      display: flex;
      align-items: center;
      justify-content: center;
      margin-inline: 0 !important;
      padding-inline: 0 !important;
    }

    .app-logo {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0;
      inline-size: auto;
      margin: 0;
      transform: none !important;
    }

    .app-logo .brand-logo-mark {
      block-size: 25px;
      inline-size: 25px;
    }

    .app-logo h1,
    .nav-item-title,
    .nav-section-title {
      display: none;
    }

    .nav-link > a {
      justify-content: center;
      border-radius: 8px !important;
      block-size: 2.25rem;
      margin-inline: 10px;
      padding-inline: 0;
    }

    .nav-item-icon {
      margin-inline-end: 0 !important;
    }
  }

  &.layout-horizontal-nav-active {
    .layout-vertical-nav:not(.overlay-nav) {
      pointer-events: none;
      transform: translateX(-100%);
      visibility: hidden;
    }

    .layout-content-wrapper {
      padding-inline-start: 0;
    }

    .layout-navbar {
      background: var(--mp-canvas-bg);
      border-block-end: 1px solid var(--mp-border-subtle);
      inline-size: 100%;
      inset-inline: 0;
      max-inline-size: none;
      padding-inline: 0;
    }

    .navbar-content-container {
      border: 0 !important;
      border-radius: 0 !important;
      background: transparent !important;
      inline-size: 100%;
      margin-inline: auto;
      max-inline-size: variables.$layout-boxed-content-width;
      padding-inline: 20px;
    }

    .layout-page-content {
      inline-size: 100%;
      margin-inline: auto;
      max-inline-size: variables.$layout-boxed-content-width;
      padding-inline: 20px;
    }

    .page-content-container > div:first-child {
      inline-size: 100%;
    }
  }

  // 非 App 模式统一由 --layout-navbar-block-size 承接固定顶栏偏移，彻底杜绝顶部截断与双倍空白
  &:not(.layout-app-mode).layout-navbar-fixed .layout-page-content {
    padding-block-start: var(--layout-navbar-block-size);
  }

  // 桌面端一体化正交工作区画布（width >= 960px 且非 appMode）
  @media (width >= 960px) {
    &:not(.layout-app-mode) {
      .layout-content-wrapper {
        background-color: var(--mp-canvas-bg);
      }

      .layout-page-content {
        margin-inline: 0;
        max-inline-size: none;
        padding-block: var(--layout-navbar-block-size) 0;
        padding-inline: 20px;
      }

      &.layout-horizontal-nav-active .layout-page-content {
        margin-inline: auto;
        max-inline-size: variables.$layout-boxed-content-width;
        padding-inline: 20px;
      }

      .page-content-container {
        border: 0;
        border-radius: 0;
        background-color: transparent;
        padding-block: 18px 24px;
        padding-inline: 0;
      }
    }
  }

  @at-root {
    .layout-wrapper.layout-horizontal-nav-active.layout-horizontal-nav-scrolled.layout-navbar-fixed .layout-navbar {
      background: var(--mp-canvas-bg) !important;
      border-block-end: 1px solid var(--mp-border-subtle);
      box-shadow: none !important;
    }

    .layout-wrapper.layout-horizontal-nav-active.layout-horizontal-nav-scrolled.layout-navbar-fixed
      .navbar-content-container {
      background: transparent !important;
      background-color: transparent !important;
      box-shadow: none !important;
      padding-inline: 20px !important;
    }

    html[data-theme='light'][data-theme-semi-dark-menu='true'][data-theme-layout='vertical']
      .layout-wrapper.layout-nav-type-vertical:not(.layout-horizontal-nav-active)
      .layout-vertical-nav:not(.overlay-nav),
    html[data-theme='light'][data-theme-semi-dark-menu='true'][data-theme-layout='collapsed']
      .layout-wrapper.layout-nav-type-vertical:not(.layout-horizontal-nav-active)
      .layout-vertical-nav:not(.overlay-nav) {
      background: #16171d;
      color: #ecedf2;

      .app-logo h1,
      .nav-section-title,
      .nav-link > a,
      .nav-item-icon {
        color: rgba(236, 237, 242, 0.68) !important;
      }

      .nav-link > a:hover {
        background-color: rgba(236, 237, 242, 0.05);
      }

      .nav-link > .router-link-exact-active,
      .nav-link > .router-link-active:not([href='/']) {
        border-color: rgba(255, 255, 255, 0.06) !important;
        background: rgba(255, 255, 255, 0.085) !important;
        color: rgba(236, 237, 242, 0.96) !important;

        .nav-item-icon,
        .nav-item-title {
          color: rgba(236, 237, 242, 0.96) !important;
        }
      }
    }
  }

  // 👉 Content height fixed
  &.layout-content-height-fixed {
    .layout-content-wrapper {
      max-block-size: calc(var(--vh) * 100);
    }

    .layout-page-content {
      overflow: auto;

      .page-content-container {
        inline-size: 100%;

        > :first-child {
          max-block-size: 100%;
          overflow-y: auto;
        }
      }
    }
  }
}

.layout-wrapper.layout-nav-type-vertical.layout-overlay-nav {
  .layout-navbar {
    inline-size: 100%;
    inset-inline: 0;
    padding-inline: 0;

    .navbar-content-container {
      padding-inline: 16px;
    }
  }
}
</style>
