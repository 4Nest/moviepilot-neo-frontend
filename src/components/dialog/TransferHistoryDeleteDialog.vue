<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    title?: string
  }>(),
  {
    modelValue: true,
    title: '',
  },
)

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'delete', deleteSrc: boolean, deleteDest: boolean): void
  (event: 'update:modelValue', value: boolean): void
}>()

const { t } = useI18n()

const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

// 选择删除范围并通知历史列表执行实际删除。
function selectDeleteMode(deleteSrc: boolean, deleteDest: boolean) {
  emit('delete', deleteSrc, deleteDest)
}
</script>

<template>
  <VBottomSheet v-if="visible" v-model="visible" inset>
    <VCard class="transfer-delete-sheet">
      <VCardItem class="py-3">
        <VCardTitle class="pe-8">
          {{ props.title }}
        </VCardTitle>
        <VDialogCloseBtn v-model="visible" />
      </VCardItem>
      <VDivider />
      <VCardText class="py-4">
        <div class="d-flex flex-column flex-lg-row flex-wrap justify-center gap-2">
          <VBtn color="default" variant="outlined" @click="selectDeleteMode(false, false)">
            {{ t('transferHistory.deleteRecordOnly') }}
          </VBtn>
          <VBtn color="warning" variant="tonal" @click="selectDeleteMode(true, false)">
            {{ t('transferHistory.deleteSourceOnly') }}
          </VBtn>
          <VBtn color="warning" variant="tonal" @click="selectDeleteMode(false, true)">
            {{ t('transferHistory.deleteDestOnly') }}
          </VBtn>
          <VBtn color="error" variant="flat" @click="selectDeleteMode(true, true)">
            {{ t('transferHistory.deleteAll') }}
          </VBtn>
        </div>
      </VCardText>
      <VDivider />
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn color="default" variant="text" @click="visible = false">
          {{ t('common.cancel') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VBottomSheet>
</template>
