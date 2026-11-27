<script setup lang="ts">
import LoggingDialogHeader from '@/components/dialog/LoggingDialogHeader.vue'
import { useI18n } from '@/composables/useChineseText'
import { useDisplay } from 'vuetify'

const LoggingView = defineAsyncComponent(() => import('@/views/system/LoggingView.vue'))

// 国际化
const { t } = useI18n()

// 显示器宽度
const display = useDisplay()

// 输入参数
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: true,
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['update:modelValue', 'close'])

// 弹窗显示状态
const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

/** 打开主程序日志新窗口或触发日志下载。 */
function openLogging(download: boolean) {
  const url = download
    ? `${import.meta.env.VITE_API_BASE_URL}system/logging/download/moviepilot`
    : `${import.meta.env.VITE_API_BASE_URL}system/logging?length=-1`
  window.open(url, '_blank')
}
</script>

<template>
  <VDialog
    v-if="visible"
    v-model="visible"
    :scrollable="display.mdAndUp.value"
    max-width="80rem"
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard class="logging-dialog-card">
      <VDialogCloseBtn v-model="visible" />
      <LoggingDialogHeader
        :title="t('shortcut.log.subtitle')"
        @download="openLogging(true)"
        @open-window="openLogging(false)"
      />
      <VDivider />
      <VCardText class="logging-dialog-content pa-0">
        <LoggingView logfile="moviepilot.log" />
      </VCardText>
    </VCard>
  </VDialog>
</template>
