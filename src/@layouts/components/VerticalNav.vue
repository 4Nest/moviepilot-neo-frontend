<script lang="ts" setup>
import type { Component } from 'vue'
import { useDisplay } from 'vuetify'
import NeoLogoMark from '@/components/misc/NeoLogoMark.vue'

interface Props {
  tag?: string | Component
  isOverlayNavActive: boolean
  toggleIsOverlayNavActive: (value: boolean) => void
  isCollapsed?: boolean
  canToggleCollapse?: boolean
  toggleCollapsed?: () => void
}

const props = withDefaults(defineProps<Props>(), {
  tag: 'aside',
  isCollapsed: false,
  canToggleCollapse: false,
})

const { mdAndDown } = useDisplay()
const refNav = ref()
const route = useRoute()

watch(
  () => route.path,
  () => {
    props.toggleIsOverlayNavActive(false)
  },
)

// 是否滚动
const isVerticalNavScrolled = ref(false)
const updateIsVerticalNavScrolled = (val: boolean) => (isVerticalNavScrolled.value = val)

// 滚动响应
function handleNavScroll(evt: Event) {
  isVerticalNavScrolled.value = (evt.target as HTMLElement).scrollTop > 0
}
</script>

<template>
  <Component
    :is="props.tag"
    ref="refNav"
    class="layout-vertical-nav touch-none"
    :class="[
      {
        'visible': isOverlayNavActive,
        'scrolled': isVerticalNavScrolled,
        'overlay-nav': mdAndDown,
      },
    ]"
  >
    <!-- 👉 Header -->
    <div class="nav-header">
      <slot name="nav-header">
        <RouterLink to="/" class="app-logo app-title-wrapper">
          <NeoLogoMark class="brand-logo-mark" />

          <h1 class="app-logo-title text-nowrap">
            <span class="moviepilot-neo-badge moviepilot-neo-badge--solo">NEO</span>
          </h1>
        </RouterLink>
      </slot>
    </div>
    <slot name="nav-items" :update-is-vertical-nav-scrolled="updateIsVerticalNavScrolled">
      <PerfectScrollbar
        tag="ul"
        class="nav-items"
        :options="{ wheelPropagation: false }"
        @ps-scroll-y="handleNavScroll"
      >
        <slot />
      </PerfectScrollbar>
    </slot>

    <slot name="after-nav-items" />

    <!-- 👉 Desktop Collapse Toggle Footer -->
    <div v-if="props.canToggleCollapse && !mdAndDown" class="nav-collapse-footer">
      <button
        type="button"
        class="nav-collapse-toggle"
        data-testid="sidebar-collapse-toggle"
        :aria-label="props.isCollapsed ? '展开侧边栏' : '收起侧边栏'"
        :aria-expanded="!props.isCollapsed"
        :title="props.isCollapsed ? '展开侧边栏' : '收起侧边栏'"
        @click="props.toggleCollapsed?.()"
      >
        <VIcon :icon="props.isCollapsed ? 'mdi-chevron-right' : 'mdi-chevron-left'" class="nav-collapse-toggle__icon" />
      </button>
    </div>
  </Component>
</template>

<style lang="scss">
@use '@configured-variables' as variables;
@use '@layouts/styles/mixins';

.visible {
  visibility: visible !important;
}

// 👉 Vertical Nav
.layout-vertical-nav {
  position: fixed;
  z-index: variables.$layout-vertical-nav-z-index;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  block-size: 100%;
  block-size: 100dvh;
  inline-size: var(--layout-vertical-nav-width, #{variables.$layout-vertical-nav-width});
  inset-block-start: 0;
  inset-inline-start: 0;
  transition:
    transform 0.25s ease-in-out,
    inline-size 0.2s ease-in-out,
    box-shadow 0.25s ease-in-out;
  visibility: hidden;
  will-change: transform, inline-size;

  &:not(.overlay-nav) {
    visibility: visible;
  }

  .nav-header {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-inline: 0 !important;
    padding-inline: 0 !important;

    .header-action {
      cursor: pointer;
    }
  }

  .app-title-wrapper {
    display: inline-flex;
    flex: 0 1 auto;
    align-items: center;
    justify-content: center;
    gap: 9px;
    margin: 0;
    text-decoration: none;

    .brand-logo-mark {
      block-size: 1.5rem;
      inline-size: 1.5rem;
    }
  }

  .app-logo-title {
    display: inline-flex;
    align-items: center;
    margin: 0;
    color: rgba(var(--v-theme-on-surface), 0.92);
    font-size: 0.9375rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    line-height: 1;

    .moviepilot-neo-badge {
      display: block;
      color: inherit;
      font-size: inherit;
      font-weight: inherit;
      letter-spacing: inherit;
      line-height: 1;
    }
  }

  .nav-items {
    flex: 1 1 auto;
    min-block-size: 0;
    block-size: 100%;

    // ℹ️ We no loner needs this overflow styles as perfect scrollbar applies it
    // overflow-x: hidden;

    // // ℹ️ We used `overflow-y` instead of `overflow` to mitigate overflow x. Revert back if any issue found.
    // overflow-y: auto;
  }

  .nav-collapse-footer {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: flex-end;
    border-block-start: 1px solid var(--mp-border-subtle);
    padding-block: 8px;
    padding-inline: 12px;
  }

  .nav-collapse-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--mp-border-subtle);
    border-radius: 8px;
    background-color: transparent;
    block-size: 30px;
    color: rgba(var(--v-theme-on-surface), 0.64);
    cursor: pointer;
    inline-size: 30px;
    padding: 0;
    transition:
      background-color 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease;

    &:hover {
      border-color: rgba(var(--v-theme-on-surface), 0.18);
      background-color: rgba(var(--v-theme-on-surface), 0.06);
      color: rgba(var(--v-theme-on-surface), 0.92);
    }

    &:focus-visible {
      outline: 2px solid rgb(var(--v-theme-primary));
      outline-offset: -2px;
    }
  }

  .nav-collapse-toggle__icon {
    flex-shrink: 0;
    block-size: 1.125rem;
    color: inherit;
    font-size: 1.125rem;
    inline-size: 1.125rem;
  }

  .nav-item-title {
    overflow: hidden;
    margin-inline-end: auto;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  // 👉 Collapsed
  .layout-vertical-nav-collapsed & {
    &:not(.hovered):not(.overlay-nav) {
      inline-size: var(--layout-vertical-nav-width, #{variables.$layout-vertical-nav-collapsed-width});
    }
  }

  // 👉 Overlay nav
  &.overlay-nav {
    inline-size: variables.$layout-vertical-nav-width;

    &:not(.visible) {
      transform: translateX(-#{variables.$layout-vertical-nav-width});

      @include mixins.rtl {
        transform: translateX(variables.$layout-vertical-nav-width);
      }
    }
  }
}
</style>
