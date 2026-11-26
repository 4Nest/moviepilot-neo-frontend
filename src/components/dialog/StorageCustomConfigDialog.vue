<script setup lang="ts">
import { cloneDeep } from 'lodash-es'
import { useToast } from 'vue-toastification'
import type { StorageConf } from '@/api/types'
import { useI18n } from '@/composables/useChineseText'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

// 国际化
const { t } = useI18n()
const $toast = useToast()

// 定义输入
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: true,
  },
  storage: {
    type: Object as PropType<StorageConf>,
    required: true,
  },
})

// 定义事件
const emit = defineEmits(['update:modelValue', 'close', 'done'])

// 本地配置草稿
const localConf = ref<StorageConf>(cloneDeep(props.storage))

watch(
  () => props.storage,
  next => {
    localConf.value = cloneDeep(next)
  },
)

// 自定义存储配置对话框
const customConfigDialog = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

/** 保存自定义存储基础信息并通知父级刷新。 */
function handleDone() {
  const trimmedName = localConf.value.name?.trim() || ''
  if (!trimmedName) {
    $toast.error(t('common.nameRequired'))
    return
  }
  const nextStorage: StorageConf = {
    ...cloneDeep(props.storage),
    name: trimmedName,
    type: localConf.value.type?.trim() || props.storage.type,
  }
  customConfigDialog.value = false
  emit('done', nextStorage)
}
</script>

<template>
  <VDialog
    v-if="customConfigDialog"
    v-model="customConfigDialog"
    scrollable
    max-width="36rem"
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard class="mp-dialog-card">
      <VCardItem class="mp-dialog-header">
        <template #prepend>
          <VIcon icon="mdi-cog-outline" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>{{ t('storage.custom') }}</VCardTitle>
        <VDialogCloseBtn v-model="customConfigDialog" />
      </VCardItem>
      <VDivider />
      <VCardText class="mp-dialog-body">
        <VRow class="mp-form-grid">
          <VCol cols="12" sm="6">
            <VTextField
              v-model="localConf.type"
              :label="t('storage.type')"
              :hint="t('storage.customTypeHint')"
              prepend-inner-icon="mdi-database"
            />
          </VCol>
          <VCol cols="12" sm="6">
            <VTextField
              v-model="localConf.name"
              :label="t('storage.name')"
              :rules="[v => !!v?.trim() || t('common.nameRequired')]"
              prepend-inner-icon="mdi-label"
            />
          </VCol>
        </VRow>
      </VCardText>
      <VDivider />
      <VCardActions class="app-dialog-actions mp-dialog-footer">
        <VSpacer />
        <VBtn color="default" variant="text" size="small" @click="customConfigDialog = false">
          {{ t('common.cancel') }}
        </VBtn>
        <VBtn color="primary" variant="flat" size="small" class="px-4" @click="handleDone">
          {{ t('common.save') }}
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

.mp-form-grid {
  row-gap: 6px;
}

@media (max-width: 599.98px) {
  .mp-dialog-body {
    padding: 16px !important;
  }
}
</style>
