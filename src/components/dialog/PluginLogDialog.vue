<script setup lang="ts">
import type { Plugin } from '@/api/types'
import LoggingDialogHeader from '@/components/dialog/LoggingDialogHeader.vue'
import { useI18n } from '@/composables/useChineseText'
import { useDisplay } from 'vuetify'

const LoggingView = defineAsyncComponent(() => import('@/views/system/LoggingView.vue'))

// 多语言
const { t } = useI18n()

// 显示器宽度
const display = useDisplay()

// 输入参数
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: true,
  },
  plugin: {
    type: Object as PropType<Plugin>,
    required: true,
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

/** 打开当前插件日志的新窗口。 */
function openLoggerWindow() {
  const url = `${
    import.meta.env.VITE_API_BASE_URL
  }system/logging?length=-1&logfile=plugins/${props.plugin?.id?.toLowerCase()}.log`
  window.open(url, '_blank')
}

/** 下载当前插件日志压缩包。 */
function downloadLogger() {
  const url = `${import.meta.env.VITE_API_BASE_URL}system/logging/download/${props.plugin?.id?.toLowerCase()}`
  window.open(url, '_blank')
}
</script>

<template>
  <VDialog
    v-if="visible"
    v-model="visible"
    :scrollable="display.mdAndUp.value"
    max-width="72rem"
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard class="logging-dialog-card">
      <VDialogCloseBtn v-model="visible" />
      <LoggingDialogHeader
        :title="t('plugin.logTitle')"
        @download="downloadLogger"
        @open-window="openLoggerWindow"
      />
      <VDivider />
      <VCardText class="logging-dialog-content pa-0">
        <LoggingView :key="props.plugin?.id" :logfile="`plugins/${props.plugin?.id?.toLowerCase()}.log`" />
      </VCardText>
    </VCard>
  </VDialog>
</template>
