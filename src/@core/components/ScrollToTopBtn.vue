<script lang="ts" setup>
import { usePWA } from '@/composables/usePWA'

defineProps<{ offsetFab?: boolean }>()

// App 模式下显示底部导航栏，隐藏回到顶部浮钮以避免任何视口下与底栏重叠
const { appMode } = usePWA()

// 控制回到顶部按钮的可见性
const showScrollToTop = ref(false)
const scrollThreshold = 200 // 滚动多少像素后显示按钮

// 滚动事件处理函数
const handleScroll = () => {
  showScrollToTop.value = window.scrollY > scrollThreshold
}

const scrollToTop = () => {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(async () => {
  // Add scroll event listener
  window.addEventListener('scroll', handleScroll)
  // Initial check for scroll-to-top
  handleScroll()
})

onUnmounted(() => {
  // Remove scroll event listener
  window.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <div
    v-if="!appMode"
    class="global-action-buttons d-none d-sm-block"
    :class="{ 'global-action-buttons--offset-fab': offsetFab }"
  >
    <Transition name="scroll-fade">
      <button v-show="showScrollToTop" class="global-action-button" @click="scrollToTop">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M7 14L12 9L17 14"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
/* Global Action Button Styles (FAB) */
.global-action-buttons {
  position: fixed;
  z-index: 1099;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  inset-block-end: max(1rem, calc(env(safe-area-inset-bottom) + 1rem));
  inset-inline-end: max(1rem, calc(env(safe-area-inset-right) + 1rem));
  transition: inset-inline-end 0.2s ease;
}

.global-action-buttons--offset-fab {
  inset-inline-end: calc(max(1rem, calc(env(safe-area-inset-right) + 1rem)) + 3.75rem);
}

.global-action-button {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--mp-border-hover);
  border-radius: 50%;
  background-color: var(--mp-elevated-bg);
  block-size: 3rem;
  box-shadow: var(--app-fab-shadow);
  color: rgb(var(--v-theme-primary));
  cursor: pointer;
  inline-size: 3rem;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease,
    background-color 0.18s ease;

  &:hover {
    border-color: rgba(var(--v-theme-primary), 0.42);
    background-color: rgb(var(--v-theme-surface));
    box-shadow: var(--app-fab-shadow-hover);
    transform: translateY(-2px);
  }

  &:active {
    box-shadow: var(--app-fab-shadow-active);
    transform: translateY(0) scale(0.98);
  }

  svg {
    block-size: 22px;
    inline-size: 22px;
    transition: transform 0.18s ease;
  }
}
</style>
