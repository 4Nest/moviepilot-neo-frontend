<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  modelValue: boolean
  type?: 'info' | 'warn' | 'error'
  title?: string
  content?: string
  confirmText?: string
  cancelText?: string
  width?: string | number
}

const props = withDefaults(defineProps<Props>(), {
  type: 'info',
  title: '',
  content: '',
  confirmText: '',
  cancelText: '',
  width: '28rem',
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

// 对话框类型对应的图标和颜色
const typeConfig = {
  info: {
    icon: 'mdi-information-outline',
    color: 'info',
  },
  warn: {
    icon: 'mdi-alert-outline',
    color: 'warning',
  },
  error: {
    icon: 'mdi-alert-circle-outline',
    color: 'error',
  },
}

// 获取当前类型的配置
const currentType = computed(() => typeConfig[props.type])

// 确认按钮点击
function handleConfirm() {
  emit('confirm')
  emit('update:modelValue', false)
}

// 取消按钮点击
function handleCancel() {
  emit('cancel')
  emit('update:modelValue', false)
}
</script>

<template>
  <VDialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :max-width="width"
    :retain-focus="false"
    data-native-confirm-dialog
    :data-native-confirm-kind="type"
  >
    <VCard class="app-confirm-dialog-card">
      <div class="app-confirm-dialog-body">
        <div class="app-confirm-dialog-icon" :class="`app-confirm-dialog-icon--${currentType.color}`">
          <VIcon size="20" :color="currentType.color" :icon="currentType.icon" />
        </div>
        <div class="app-confirm-dialog-copy">
          <p data-native-confirm-title class="app-confirm-dialog-title">{{ title }}</p>
          <p data-native-confirm-message class="app-confirm-dialog-message">{{ content }}</p>
        </div>
      </div>
      <VCardActions class="app-confirm-dialog-actions">
        <VBtn data-native-confirm-cancel variant="outlined" color="secondary" class="px-4" @click="handleCancel">
          {{ cancelText }}
        </VBtn>
        <VBtn data-native-confirm-accept variant="flat" :color="currentType.color" class="px-4" @click="handleConfirm">
          {{ confirmText }}
        </VBtn>
      </VCardActions>
      <VDialogCloseBtn @click="handleCancel" />
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped>
.app-confirm-dialog-card {
  border-radius: 14px !important;
}

.app-confirm-dialog-body {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding-block: 20px 12px;
  padding-inline: 20px 52px;
}

.app-confirm-dialog-icon {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background-color: rgba(var(--v-theme-info), 0.12);
  block-size: 38px;
  inline-size: 38px;
}

.app-confirm-dialog-icon--warning {
  background-color: rgba(var(--v-theme-warning), 0.12);
}

.app-confirm-dialog-icon--error {
  background-color: rgba(var(--v-theme-error), 0.12);
}

.app-confirm-dialog-copy {
  min-inline-size: 0;
}

.app-confirm-dialog-title {
  margin: 0 0 6px;
  color: rgba(var(--v-theme-on-surface), 0.95);
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.4;
}

.app-confirm-dialog-message {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 0.875rem;
  line-height: 1.55;
}

.app-confirm-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-block: 8px 16px !important;
  padding-inline: 20px !important;
}
</style>
