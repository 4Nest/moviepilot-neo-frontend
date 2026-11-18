<script lang="ts" setup>
import type { Component } from 'vue'
import { useDisplay } from 'vuetify'
import NeoLogoMark from '@/components/misc/NeoLogoMark.vue'

interface Props {
  tag?: string | Component
  isOverlayNavActive: boolean
  toggleIsOverlayNavActive: (value: boolean) => void
}

const props = withDefaults(defineProps<Props>(), {
  tag: 'aside',
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
  block-size: 100%;
  inline-size: variables.$layout-vertical-nav-width;
  inset-block-start: 0;
  inset-inline-start: 0;
  transition:
    transform 0.25s ease-in-out,
    inline-size 0.25s ease-in-out,
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
    block-size: 100%;

    // ℹ️ We no loner needs this overflow styles as perfect scrollbar applies it
    // overflow-x: hidden;

    // // ℹ️ We used `overflow-y` instead of `overflow` to mitigate overflow x. Revert back if any issue found.
    // overflow-y: auto;
  }

  .nav-item-title {
    overflow: hidden;
    margin-inline-end: auto;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  // 👉 Collapsed
  .layout-vertical-nav-collapsed & {
    &:not(.hovered) {
      inline-size: variables.$layout-vertical-nav-collapsed-width;
    }
  }

  // 👉 Overlay nav
  &.overlay-nav {
    &:not(.visible) {
      transform: translateX(-#{variables.$layout-vertical-nav-width});

      @include mixins.rtl {
        transform: translateX(variables.$layout-vertical-nav-width);
      }
    }
  }
}
</style>
