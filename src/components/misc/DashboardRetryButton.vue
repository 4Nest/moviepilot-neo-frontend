<script setup lang="ts">
const props = defineProps<{
  /** 有可展示快照时，在支持悬停的桌面设备上延后到卡片交互时显示。 */
  deferred?: boolean
  /** 描述当前卡片重试目标的可访问文案。 */
  label: string
}>()

const emit = defineEmits<{
  /** 请求用户主动重新加载当前卡片。 */
  retry: []
}>()

const buttonRef = ref<{ $el?: HTMLElement } | HTMLElement | null>(null)
const isCardInteractive = ref(false)
let hostCardEl: HTMLElement | null = null
let isHovered = false

function updateInteractiveState() {
  const hasFocus = Boolean(hostCardEl && hostCardEl.contains(document.activeElement))
  isCardInteractive.value = isHovered || hasFocus
}

function handleMouseEnter() {
  isHovered = true
  updateInteractiveState()
}

function handleMouseLeave() {
  isHovered = false
  updateInteractiveState()
}

function handleFocusIn() {
  updateInteractiveState()
}

function handleFocusOut() {
  requestAnimationFrame(updateInteractiveState)
}

function detachCardListeners() {
  if (!hostCardEl) return
  hostCardEl.removeEventListener('mouseenter', handleMouseEnter)
  hostCardEl.removeEventListener('mouseleave', handleMouseLeave)
  hostCardEl.removeEventListener('focusin', handleFocusIn)
  hostCardEl.removeEventListener('focusout', handleFocusOut)
  hostCardEl = null
}

onMounted(() => {
  const rawEl = buttonRef.value instanceof HTMLElement ? buttonRef.value : buttonRef.value?.$el
  const card = rawEl?.closest<HTMLElement>('.v-card') ?? null
  if (!card) return
  hostCardEl = card
  hostCardEl.addEventListener('mouseenter', handleMouseEnter)
  hostCardEl.addEventListener('mouseleave', handleMouseLeave)
  hostCardEl.addEventListener('focusin', handleFocusIn)
  hostCardEl.addEventListener('focusout', handleFocusOut)
})

onBeforeUnmount(() => {
  detachCardListeners()
})
</script>

<template>
  <VBtn
    ref="buttonRef"
    icon
    variant="text"
    color="warning"
    size="small"
    :class="{
      'dashboard-retry-button--deferred': props.deferred,
      'dashboard-retry-button--interactive': isCardInteractive,
    }"
    :title="props.label"
    :aria-label="props.label"
    @click="emit('retry')"
  >
    <VIcon icon="mdi-cloud-alert-outline" size="20" />
    <VTooltip activator="parent" location="top">
      {{ props.label }}
    </VTooltip>
  </VBtn>
</template>

<style scoped>
@media (hover: none), (pointer: coarse) {
  .dashboard-retry-button--deferred {
    opacity: 1;
    pointer-events: auto;
  }
}

@media (hover: hover) and (pointer: fine) {
  .dashboard-retry-button--deferred {
    opacity: 0;
    pointer-events: none;
    transition: opacity 180ms ease;
  }

  .dashboard-retry-button--deferred.dashboard-retry-button--interactive,
  .dashboard-retry-button--deferred:focus-visible {
    opacity: 1;
    pointer-events: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dashboard-retry-button--deferred {
    transition: none;
  }
}
</style>
