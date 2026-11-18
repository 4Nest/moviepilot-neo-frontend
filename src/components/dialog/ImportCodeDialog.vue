<script lang="ts" setup>
import { useI18n } from '@/composables/useChineseText'

// 多语言支持
const { t } = useI18n()

// 输入参数
const props = defineProps({
  title: String,
  dataType: String,
})

// 代码
const codeString = ref('')

// 定义事件
const emit = defineEmits(['close', 'save'])

// 导入
function handleImport() {
  emit('save', props.dataType, codeString)
  emit('close')
}
</script>

<template>
  <VDialog max-width="40rem" scrollable max-height="85vh">
    <VCard class="mp-dialog-card">
      <VCardItem class="mp-dialog-header">
        <template #prepend>
          <VIcon icon="mdi-code-json" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>{{ props.title }}</VCardTitle>
      </VCardItem>
      <VDialogCloseBtn @click="emit('close')" />
      <VDivider />
      <VCardText class="mp-dialog-body">
        <VTextarea
          v-model="codeString"
          rows="5"
          auto-grow
          hide-details="auto"
          variant="outlined"
          prepend-inner-icon="mdi-code-json"
        />
      </VCardText>
      <VDivider />
      <VCardActions class="app-dialog-actions mp-dialog-footer">
        <VSpacer />
        <VBtn color="default" variant="text" size="small" @click="emit('close')">
          {{ t('common.cancel') }}
        </VBtn>
        <VBtn color="primary" variant="flat" size="small" class="px-4" @click="handleImport">
          {{ t('dialog.importCode.import') }}
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
