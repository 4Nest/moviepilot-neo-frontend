<script setup lang="ts">
const props = defineProps({
  modelValue: {
    type: String,
    default: '* * * * *',
  },
})

const emit = defineEmits(['update:modelValue'])

const menu = ref(false)
const currentCron = ref(props.modelValue)
const menuRoot = ref<HTMLElement>()
const instance = getCurrentInstance()
const menuContentClass = `cron-input-menu-${instance?.uid ?? 'default'}`
const menuContentSelector = `.${menuContentClass}`

function isCronMenuTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false

  if (menuRoot.value?.contains(target)) return true

  const menuContent = document.querySelector(menuContentSelector)

  if (menuContent?.contains(target)) return true

  const overlayId = target.closest('.v-overlay')?.getAttribute('id')

  if (!overlayId || !menuContent) return false

  return Array.from(menuContent.querySelectorAll('[aria-owns]')).some(
    activator => activator.getAttribute('aria-owns') === overlayId,
  )
}

function closeOnOutsidePointerDown(event: PointerEvent) {
  if (!menu.value || isCronMenuTarget(event.target)) return

  menu.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', closeOnOutsidePointerDown, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeOnOutsidePointerDown, true)
})

watch(currentCron, newVal => {
  emit('update:modelValue', newVal)
})

watch(
  () => props.modelValue,
  value => {
    currentCron.value = value
  },
)
</script>

<template>
  <div ref="menuRoot">
    <VMenu
      v-model="menu"
      :close-on-content-click="false"
      :content-class="['cursor-default', menuContentClass]"
      persistent
    >
      <template v-slot:activator="{ props }">
        <slot name="activator" :menuprops="props" />
      </template>
      <VList>
        <VListItem>
          <VCronVuetify
            key="zh-cn"
            v-model="currentCron"
            :chip-props="{ color: 'success' }"
            class="mt-1"
            locale="zh-cn"
          />
        </VListItem>
      </VList>
    </VMenu>
  </div>
</template>
