<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import { useI18n } from '@/composables/useChineseText'

const props = defineProps({
  loading: {
    type: Boolean,
    default: false,
  },
  modelValue: {
    type: Boolean,
    default: true,
  },
  name: {
    type: String,
    default: '',
  },
})

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'create'): void
  (event: 'update:modelValue', value: boolean): void
  (event: 'update:name', value: string): void
}>()

const { t } = useI18n()
const $toast = useToast()

const dialogVisible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const folderName = computed({
  get: () => props.name,
  set: value => emit('update:name', value),
})

// 校验并触发新建目录
function handleCreate() {
  if (props.loading) return
  if (!folderName.value?.trim()) {
    $toast.error(t('common.nameRequired'))
    return
  }
  emit('create')
}

// 关闭新建目录弹窗并通知共享弹窗 Host 回收实例。
function closeDialog() {
  if (props.loading) return
  emit('close')
  emit('update:modelValue', false)
}
</script>

<template>
  <VDialog v-model="dialogVisible" max-width="32rem">
    <VCard class="mp-dialog-card">
      <VCardItem class="mp-dialog-header">
        <template #prepend>
          <VIcon icon="mdi-folder-plus-outline" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>{{ t('file.newFolder') }}</VCardTitle>
      </VCardItem>
      <VDialogCloseBtn :disabled="props.loading" @click="closeDialog" />
      <VDivider />
      <VCardText class="mp-dialog-body">
        <VTextField
          v-model="folderName"
          :label="t('common.name')"
          :loading="props.loading"
          :disabled="props.loading"
          hide-details="auto"
          prepend-inner-icon="mdi-format-text"
          @keyup.enter="handleCreate"
        />
      </VCardText>
      <VDivider />
      <VCardActions class="app-dialog-actions mp-dialog-footer">
        <VSpacer />
        <VBtn color="default" variant="text" size="small" :disabled="props.loading" @click="closeDialog">
          {{ t('common.cancel') }}
        </VBtn>
        <VBtn
          color="primary"
          variant="flat"
          size="small"
          :loading="props.loading"
          :disabled="props.loading || !folderName?.trim()"
          class="px-4"
          @click="handleCreate"
        >
          {{ t('common.create') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped>
.mp-dialog-header {
  padding-block: 14px;
  padding-inline: 22px 48px;
}

.mp-dialog-body {
  padding: 18px 22px !important;
}

.mp-dialog-footer {
  gap: 8px;
  padding: 10px 20px !important;
}

@media (max-width: 599.98px) {
  .mp-dialog-body {
    padding: 16px !important;
  }
}
</style>
