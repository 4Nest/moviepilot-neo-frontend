<script setup lang="ts">
import { useTabStateRestore } from '@/composables/useStateRestore'

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  items: {
    type: Array as PropType<{ title: string; icon?: string; tab: string }[]>,
    default: () => [],
  },
  // 新增：是否启用PWA状态恢复
  enableStateRestore: {
    type: Boolean,
    default: true,
  },
})

const emit = defineEmits(['update:modelValue'])

// 集成PWA状态恢复功能
const pwaTabState = props.enableStateRestore ? useTabStateRestore(props.modelValue) : null

// 使用PWA状态恢复的activeTab或本地状态
const currentValue = ref(pwaTabState?.activeTab.value || props.modelValue)

// 监听currentValue变化，同时更新PWA状态和父组件
watch(currentValue, newVal => {
  emit('update:modelValue', newVal)
  if (pwaTabState && newVal) {
    pwaTabState.activeTab.value = newVal
  }
})

// 监听父组件的modelValue变化
watch(
  () => props.modelValue,
  value => {
    currentValue.value = value
    if (pwaTabState && value) {
      pwaTabState.activeTab.value = value
    }
  },
)

// 如果启用了PWA状态恢复，监听PWA状态变化
if (pwaTabState) {
  watch(pwaTabState.activeTab, newTab => {
    if (newTab && newTab !== currentValue.value) {
      currentValue.value = newTab
      emit('update:modelValue', newTab)
    }
  })
}

// Ref for the tabs container
const tabsContainerRef = ref<HTMLElement | null>(null)
const showTabsScrollIndicator = ref(false)
const showLeftButton = ref(false)
const showRightButton = ref(false)

const isTouchDevice = () => {
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches || navigator.maxTouchPoints > 0
}

let scrollIndicatorTimeout: ReturnType<typeof setTimeout> | null = null

const scrollTabs = (direction: 'left' | 'right') => {
  const el = tabsContainerRef.value
  if (!el) return

  const scrollAmount = 200
  const scrollPosition = direction === 'left' ? el.scrollLeft - scrollAmount : el.scrollLeft + scrollAmount

  el.scrollTo({
    left: scrollPosition,
    behavior: 'smooth',
  })

  if (scrollIndicatorTimeout) clearTimeout(scrollIndicatorTimeout)
  scrollIndicatorTimeout = setTimeout(() => {
    scrollIndicatorTimeout = null
    updateTabsIndicator()
  }, 300)
}

const updateTabsIndicator = () => {
  const el = tabsContainerRef.value
  if (!el) return

  const shouldHideScrollControls = isTouchDevice()

  const tolerance = 1
  const hasOverflow = el.scrollWidth > el.clientWidth + tolerance
  const isScrolledToEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - tolerance
  const isScrolledToStart = el.scrollLeft <= tolerance

  showTabsScrollIndicator.value = hasOverflow && !isScrolledToEnd && !shouldHideScrollControls
  showLeftButton.value = hasOverflow && !isScrolledToStart && !shouldHideScrollControls
  showRightButton.value = hasOverflow && !isScrolledToEnd && !shouldHideScrollControls
}

let resizeTimeout: ReturnType<typeof setTimeout> | null = null
const handleResize = () => {
  if (resizeTimeout) clearTimeout(resizeTimeout)
  resizeTimeout = setTimeout(() => {
    updateTabsIndicator()
  }, 150)
}

onMounted(async () => {
  window.addEventListener('resize', handleResize)
  tabsContainerRef.value?.addEventListener('scroll', updateTabsIndicator)
  await nextTick()
  updateTabsIndicator()
})

onUnmounted(() => {
  if (resizeTimeout) {
    clearTimeout(resizeTimeout)
    resizeTimeout = null
  }
  if (scrollIndicatorTimeout) {
    clearTimeout(scrollIndicatorTimeout)
    scrollIndicatorTimeout = null
  }
  window.removeEventListener('resize', handleResize)
  tabsContainerRef.value?.removeEventListener('scroll', updateTabsIndicator)
})
</script>
<template>
  <div class="tab-header">
    <VBtn v-if="showLeftButton" class="scroll-button left-button" @click="scrollTabs('left')" variant="text" icon>
      <VIcon icon="tabler-chevron-left" size="small" color="secondary" />
    </VBtn>

    <div ref="tabsContainerRef" class="header-tabs" :class="{ 'show-indicator': showTabsScrollIndicator }">
      <div
        v-for="(item, index) in items"
        :key="index"
        class="header-tab"
        :class="{ active: currentValue === item.tab }"
        @click="currentValue = item.tab"
      >
        <VIcon v-if="item.icon" :icon="item.icon" size="16" class="header-tab-icon" />
        <span>{{ item.title }}</span>
      </div>
    </div>

    <VBtn v-if="showRightButton" class="scroll-button right-button" @click="scrollTabs('right')" variant="text" icon>
      <VIcon icon="tabler-chevron-right" size="small" color="secondary" />
    </VBtn>

    <div class="tab-header-append">
      <slot name="append" />
    </div>
  </div>
</template>
<style scoped lang="scss">
/* stylelint-disable selector-pseudo-class-no-unknown */

.tab-header {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-inline-size: 0;
}

.tab-header-append {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
  margin-inline-start: auto;

  :deep(.v-btn) {
    border-radius: 8px !important;
    block-size: 32px !important;
    color: rgba(var(--v-theme-on-surface), 0.72);
    margin-inline-start: 0 !important;
    min-block-size: 32px !important;

    &.v-btn--icon {
      inline-size: 32px !important;
      min-inline-size: 32px !important;
    }

    &:hover {
      background-color: rgba(var(--v-theme-on-surface), 0.06);
      color: rgba(var(--v-theme-on-surface), 0.94);
      opacity: 1;
    }

    .v-icon {
      block-size: 17px !important;
      font-size: 17px !important;
      inline-size: 17px !important;
    }
  }
}

.scroll-button {
  z-index: 2;
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  block-size: 28px;
  cursor: pointer;
  inline-size: 28px;
  outline: none;
  transition: background-color 0.16s ease;

  &.left-button {
    margin-inline-end: 2px;
  }

  &.right-button {
    margin-inline-start: 2px;
  }

  @media (hover: none) and (pointer: coarse) {
    display: none !important;
  }
}

.header-tabs {
  position: relative;
  display: inline-flex;
  align-items: center;
  padding: 3px;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 9px;
  background: var(--mp-tab-groove-bg);
  gap: 2px;
  max-inline-size: 100%;
  min-inline-size: 0;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.header-tab-icon {
  color: rgba(var(--v-theme-on-surface), 0.56);
  margin-inline-end: 6px;
  transition: color 0.15s ease;
}

.header-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  border: 1px solid transparent;
  border-radius: 6px;
  background-color: transparent;
  block-size: 30px;
  color: rgba(var(--v-theme-on-surface), 0.66);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  padding-block: 0;
  padding-inline: 11px;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    color 0.15s ease;
  white-space: nowrap;

  &.active {
    border-color: var(--mp-tab-active-border);
    background-color: var(--mp-tab-active-bg);
    box-shadow: var(--mp-tab-active-shadow);
    color: rgba(var(--v-theme-on-surface), 0.96);
    font-weight: 600;

    .header-tab-icon {
      color: rgba(var(--v-theme-on-surface), 0.92);
    }
  }

  &:hover:not(.active) {
    background-color: rgba(var(--v-theme-on-surface), 0.04);
    color: rgba(var(--v-theme-on-surface), 0.88);

    .header-tab-icon {
      color: rgba(var(--v-theme-on-surface), 0.8);
    }
  }
}
</style>
