<script setup lang="ts">
import { useI18n } from '@/composables/useChineseText'

/** 日志弹窗共用标题栏参数。 */
interface Props {
  /** 弹窗标题。 */
  title: string
}

defineProps<Props>()

const emit = defineEmits<{
  /** 下载当前日志文件或压缩包。 */
  download: []
  /** 在新窗口中打开完整原始日志。 */
  openWindow: []
}>()

const { t } = useI18n()
</script>

<template>
  <VCardItem class="logging-dialog-header">
    <VCardTitle class="logging-dialog-title">
      <span class="logging-dialog-title__main">
        <VIcon icon="mdi-file-document" class="me-2 flex-shrink-0" />
        <span class="text-truncate">{{ title }}</span>
      </span>
      <span class="logging-dialog-title__actions">
        <button
          type="button"
          class="logging-dialog-action"
          :aria-label="t('common.download')"
          @click="emit('download')"
        >
          <VChip color="grey-darken-1" size="small">
            <VIcon icon="mdi-download" size="small" start />
            {{ t('common.download') }}
          </VChip>
        </button>
        <button
          type="button"
          class="logging-dialog-action"
          :aria-label="t('common.openInNewWindow')"
          @click="emit('openWindow')"
        >
          <VChip color="grey-darken-1" size="small">
            <VIcon icon="mdi-open-in-new" size="small" start />
            {{ t('common.openInNewWindow') }}
          </VChip>
        </button>
      </span>
    </VCardTitle>
  </VCardItem>
</template>

<style lang="scss" src="@/styles/logging-dialog.scss"></style>
