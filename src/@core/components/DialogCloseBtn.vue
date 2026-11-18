<script lang="ts" setup>
import { useI18n } from '@/composables/useChineseText'

const { t } = useI18n()
const props = defineProps({
  /** 覆盖关闭按钮默认的右上角定位 class。 */
  innerClass: String,
})
const emit = defineEmits(['click', 'update:modelValue'])

function onClick() {
  emit('update:modelValue', false)
  emit('click')
}
</script>

<template>
  <IconBtn
    data-native-dialog-close
    :aria-label="t('common.close')"
    class="app-dialog-close-btn"
    :class="props.innerClass ? props.innerClass : 'absolute right-3 top-3 z-10 app-dialog-close-btn--default'"
    @click.stop="onClick"
  >
    <VIcon icon="mdi-close" size="18" />
  </IconBtn>
</template>

<style lang="scss" scoped>
.app-dialog-close-btn {
  border-radius: 8px !important;
  block-size: 32px !important;
  color: rgba(var(--v-theme-on-surface), 0.64);
  inline-size: 32px !important;
  min-inline-size: 32px !important;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;

  &:hover {
    background-color: rgba(var(--v-theme-on-surface), 0.06);
    color: rgba(var(--v-theme-on-surface), 0.94);
    opacity: 1;
  }
}

.app-dialog-close-btn--default {
  position: absolute !important;
  z-index: 10;
  inset-block-start: 12px;
  inset-inline-end: 12px;
}
</style>
