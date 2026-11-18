<script lang="ts" setup>
import type { FileItem } from '@/api/types'
import { useI18n } from '@/composables/useChineseText'

const props = defineProps({
  item: Object as PropType<FileItem>,
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
  recursive: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits<{
  (event: 'auto-name'): void
  (event: 'close'): void
  (event: 'rename'): void
  (event: 'update:modelValue', value: boolean): void
  (event: 'update:name', value: string): void
  (event: 'update:recursive', value: boolean): void
}>()

const { t } = useI18n()

const dialogVisible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const renameName = computed({
  get: () => props.name,
  set: value => emit('update:name', value),
})

const includeSubfolders = computed({
  get: () => props.recursive,
  set: value => emit('update:recursive', value),
})

// 关闭弹窗并通知共享弹窗 Host 回收当前实例。
function closeDialog() {
  emit('close')
  emit('update:modelValue', false)
}
</script>

<template>
  <VDialog v-model="dialogVisible" max-width="35rem">
    <VCard class="mp-dialog-card">
      <VCardItem class="mp-dialog-header">
        <template #prepend>
          <VIcon icon="mdi-pencil-outline" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>{{ t('file.rename') }}</VCardTitle>
      </VCardItem>
      <VDialogCloseBtn @click="closeDialog" />
      <VDivider />
      <VCardText class="mp-dialog-body">
        <div class="mp-form-sections">
          <VTextField
            v-model="renameName"
            :label="t('file.newName')"
            :loading="loading"
            hide-details="auto"
            prepend-inner-icon="mdi-format-text"
            mobile-control-width="80%"
          />
          <div v-if="item && item.type == 'dir'" class="mp-settings-card">
            <div class="mp-setting-row">
              <VSwitch
                v-model="includeSubfolders"
                :label="t('file.includeSubfolders')"
                color="primary"
                inset
                density="compact"
                hide-details
              />
            </div>
          </div>
        </div>
      </VCardText>
      <VDivider />
      <VCardActions class="app-dialog-actions mp-dialog-footer">
        <VBtn
          color="default"
          variant="outlined"
          size="small"
          prepend-icon="mdi-magic"
          :loading="loading"
          :disabled="loading"
          @click="emit('auto-name')"
        >
          {{ t('file.autoRecognizeName') }}
        </VBtn>
        <VSpacer />
        <VBtn color="default" variant="text" size="small" :disabled="loading" @click="closeDialog">
          {{ t('common.cancel') }}
        </VBtn>
        <VBtn
          color="primary"
          variant="flat"
          size="small"
          :loading="loading"
          :disabled="loading || !renameName?.trim()"
          class="px-4"
          @click="emit('rename')"
        >
          {{ t('common.confirm') }}
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

.mp-form-sections {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

@media (max-width: 599.98px) {
  .mp-dialog-body {
    padding: 16px !important;
  }
}
</style>
