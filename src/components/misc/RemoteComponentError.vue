<!-- 联邦远程组件加载失败时使用预编译错误态，兼容生产环境的 Vue runtime-only 构建。 -->
<script setup lang="ts">
import { useI18n } from '@/composables/useChineseText'

defineProps<{ onRetry?: () => void }>()

const { t } = useI18n()
</script>

<template>
  <div class="pa-4">
    <VAlert type="error" title="组件加载错误">
      无法加载组件，请稍后再试
      <VBtn v-if="onRetry" class="ms-3" variant="tonal" @click="onRetry">
        {{ t('common.retry') }}
      </VBtn>
    </VAlert>
  </div>
</template>
