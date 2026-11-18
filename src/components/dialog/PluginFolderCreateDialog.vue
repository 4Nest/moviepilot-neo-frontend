<script lang="ts" setup>
import { useI18n } from '@/composables/useChineseText'

const props = defineProps({
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

const dialogVisible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const folderName = computed({
  get: () => props.name,
  set: value => emit('update:name', value),
})

// 关闭插件文件夹新建弹窗。
function closeDialog() {
  emit('close')
  emit('update:modelValue', false)
}
</script>

<template>
  <VDialog v-model="dialogVisible" max-width="28rem">
    <VCard class="mp-dialog-card">
      <VDialogCloseBtn @click="closeDialog" />
      <VCardItem class="mp-dialog-header">
        <template #prepend>
          <VIcon icon="mdi-folder-plus-outline" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>{{ t('plugin.newFolder') }}</VCardTitle>
      </VCardItem>
      <VDivider />
      <VCardText class="mp-dialog-body">
        <VTextField
          v-model="folderName"
          :label="t('plugin.folderName')"
          variant="outlined"
          hide-details="auto"
          prepend-inner-icon="mdi-format-text"
          @keyup.enter="folderName.trim() && emit('create')"
        />
      </VCardText>
      <VDivider />
      <VCardActions class="app-dialog-actions mp-dialog-footer">
        <VSpacer />
        <VBtn color="default" variant="text" size="small" @click="closeDialog">
          {{ t('common.cancel') }}
        </VBtn>
        <VBtn
          color="primary"
          variant="flat"
          size="small"
          class="px-4"
          :disabled="!folderName.trim()"
          @click="emit('create')"
        >
          {{ t('plugin.create') }}
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
