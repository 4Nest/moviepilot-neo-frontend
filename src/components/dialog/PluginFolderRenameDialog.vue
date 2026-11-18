<script setup lang="ts">
import { useI18n } from '@/composables/useChineseText'

// 多语言
const { t } = useI18n()

// 输入参数
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: true,
  },
  folderName: {
    type: String,
    default: '',
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['update:modelValue', 'close', 'rename'])

// 新名称
const newFolderName = ref(props.folderName)

watch(
  () => props.folderName,
  val => {
    newFolderName.value = val
  },
)

// 弹窗显示状态
const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

/** 提交文件夹重命名。 */
function confirmRename() {
  if (!newFolderName.value.trim()) return
  emit('rename', newFolderName.value)
}
</script>

<template>
  <VDialog v-if="visible" v-model="visible" max-width="28rem">
    <VCard class="mp-dialog-card">
      <VCardItem class="mp-dialog-header">
        <template #prepend>
          <VIcon icon="mdi-pencil-outline" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>{{ t('folder.renameFolder') }}</VCardTitle>
      </VCardItem>
      <VDialogCloseBtn v-model="visible" />
      <VDivider />
      <VCardText class="mp-dialog-body">
        <VTextField
          v-model="newFolderName"
          :label="t('folder.folderName')"
          variant="outlined"
          hide-details="auto"
          prepend-inner-icon="mdi-format-text"
          autofocus
          @keyup.enter="confirmRename"
        />
      </VCardText>
      <VDivider />
      <VCardActions class="app-dialog-actions mp-dialog-footer">
        <VSpacer />
        <VBtn color="default" variant="text" size="small" @click="visible = false">
          {{ t('common.cancel') }}
        </VBtn>
        <VBtn
          color="primary"
          variant="flat"
          size="small"
          class="px-4"
          :disabled="!newFolderName.trim()"
          @click="confirmRename"
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

@media (max-width: 599.98px) {
  .mp-dialog-body {
    padding: 16px !important;
  }
}
</style>
