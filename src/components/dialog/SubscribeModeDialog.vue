<script setup lang="ts">
import { useI18n } from '@/composables/useChineseText'

type SubscribeMode = 'normal' | 'best_version' | 'best_version_full'

const props = defineProps<{
  modelValue?: boolean
  type?: string
  modes?: SubscribeMode[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'choose', mode: SubscribeMode): void
  (e: 'close'): void
}>()

const { t } = useI18n()

const modeItems = computed<SubscribeMode[]>(() =>
  props.modes?.length
    ? props.modes
    : props.type === '电视剧'
      ? ['normal', 'best_version', 'best_version_full']
      : ['normal', 'best_version'],
)

const optionMeta: Record<SubscribeMode, { icon: string; title: string }> = {
  normal: {
    icon: 'mdi-plus-circle-outline',
    title: t('dialog.subscribeMode.normal'),
  },
  best_version: {
    icon: 'mdi-refresh',
    title:
      props.type === '电视剧' ? t('dialog.subscribeMode.bestVersionEpisode') : t('dialog.subscribeMode.bestVersion'),
  },
  best_version_full: {
    icon: 'mdi-shimmer',
    title: t('dialog.subscribeMode.bestVersionFull'),
  },
}
</script>

<template>
  <VDialog :model-value="modelValue" max-width="28rem" @update:model-value="emit('update:modelValue', $event)">
    <VCard>
      <VCardItem class="py-3">
        <VCardTitle>
          {{ t('dialog.subscribeMode.title') }}
        </VCardTitle>
        <VDialogCloseBtn @click="emit('close')" />
      </VCardItem>
      <VDivider />
      <VList class="py-2">
        <VListItem
          v-for="mode in modeItems"
          :key="mode"
          :prepend-icon="optionMeta[mode].icon"
          :title="optionMeta[mode].title"
          @click="emit('choose', mode)"
        />
      </VList>
    </VCard>
  </VDialog>
</template>
