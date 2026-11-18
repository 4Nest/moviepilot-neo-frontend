<script setup lang="ts">
import { useI18n } from '@/composables/useChineseText'
import type { MediaDataSource } from '@/api/types'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    itemTitle?: string
    loading?: boolean
    modelValue?: boolean
    recognizeSource?: string
  }>(),
  {
    itemTitle: '',
    loading: false,
    modelValue: true,
    recognizeSource: '',
  },
)

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'confirm', payload: { mediaSource?: MediaDataSource; mediaId?: string }): void
  (event: 'update:modelValue', value: boolean): void
}>()

const mediaSource = ref<MediaDataSource>((props.recognizeSource as MediaDataSource) || 'themoviedb')
const mediaId = ref<string>()
const mediaSourceItems = computed<{ title: string; value: MediaDataSource }[]>(() => [
  { title: t('setting.cache.recognitionSource.themoviedb'), value: 'themoviedb' },
  { title: t('setting.cache.recognitionSource.douban'), value: 'douban' },
  { title: t('setting.cache.recognitionSource.bangumi'), value: 'bangumi' },
  { title: t('setting.cache.recognitionSource.anilist'), value: 'anilist' },
])

const mediaIdLabel = computed(() => {
  const labels: Record<string, string> = {
    themoviedb: t('setting.cache.reidentifyDialog.tmdbId'),
    douban: t('setting.cache.reidentifyDialog.doubanId'),
    bangumi: t('setting.cache.reidentifyDialog.bangumiId'),
    anilist: t('setting.cache.reidentifyDialog.anilistId'),
  }
  return labels[mediaSource.value] || t('setting.cache.reidentifyDialog.mediaId')
})

const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

// 提交重新识别参数给缓存页执行接口调用。
function submitReidentify() {
  emit('confirm', {
    mediaSource: mediaSource.value,
    mediaId: mediaId.value?.trim() || undefined,
  })
}
</script>

<template>
  <VDialog v-if="visible" v-model="visible" scrollable max-width="36rem">
    <VCard class="mp-dialog-card">
      <VCardItem class="mp-dialog-header">
        <template #prepend>
          <VIcon icon="mdi-text-recognition" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>{{ t('setting.cache.reidentifyDialog.title') }}</VCardTitle>
        <VCardSubtitle v-if="props.itemTitle">{{ props.itemTitle }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn v-model="visible" />
      <VDivider />
      <VCardText class="mp-dialog-body">
        <VRow class="mp-form-grid">
          <VCol cols="12">
            <VSelect
              v-model="mediaSource"
              :items="mediaSourceItems"
              :label="t('setting.cache.reidentifyDialog.mediaSource')"
              :hint="t('setting.cache.reidentifyDialog.mediaSourceHint')"
              prepend-inner-icon="mdi-database-search"
              persistent-hint
            />
          </VCol>
          <VCol cols="12">
            <VTextField
              v-model="mediaId"
              :label="mediaIdLabel"
              :hint="t('setting.cache.reidentifyDialog.mediaIdHint')"
              clearable
              prepend-inner-icon="mdi-id-card"
              persistent-hint
            />
          </VCol>
        </VRow>
        <VAlert type="info" variant="tonal" density="compact" class="mt-4">
          {{ t('setting.cache.reidentifyDialog.autoHint') }}
        </VAlert>
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
          :loading="props.loading"
          class="px-4"
          @click="submitReidentify"
        >
          {{ t('setting.cache.reidentifyDialog.confirm') }}
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
