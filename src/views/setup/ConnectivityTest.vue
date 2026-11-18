<script lang="ts" setup>
import { useI18n } from '@/composables/useChineseText'
import { useSetupWizard } from '@/composables/useSetupWizard'

const { t } = useI18n()
const { connectivityTest } = useSetupWizard()
</script>

<template>
  <!-- 连通性测试进度条 -->
  <div v-if="connectivityTest.isTesting || connectivityTest.showResult" class="connectivity-test">
    <!-- 测试中 -->
    <div v-if="connectivityTest.isTesting" class="connectivity-test__body">
      <VIcon icon="mdi-cog-sync" class="rotating" color="primary" size="20" />
      <div class="connectivity-test__msg">{{ connectivityTest.testMessage }}</div>
      <VProgressLinear v-model="connectivityTest.testProgress" color="primary" height="5" rounded class="my-1" />
      <div class="connectivity-test__meta">{{ Math.round(connectivityTest.testProgress) }}%</div>
    </div>

    <!-- 测试结果 -->
    <div v-else-if="connectivityTest.showResult" class="connectivity-test__body">
      <VIcon
        :icon="connectivityTest.testResult === 'success' ? 'mdi-check-circle' : 'mdi-alert-circle'"
        :color="connectivityTest.testResult === 'success' ? 'success' : 'error'"
        size="20"
      />
      <div
        :class="connectivityTest.testResult === 'success' ? 'text-success' : 'text-error'"
        class="connectivity-test__msg font-weight-medium"
      >
        {{ connectivityTest.testMessage }}
      </div>
      <div v-if="connectivityTest.testResult === 'error'" class="connectivity-test__meta">
        {{ t('setupWizard.testFailedHint') }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.connectivity-test {
  margin: 0 21px 16px;
  padding: 13px 16px;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.02);
  text-align: center;
}

.connectivity-test__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.connectivity-test__msg {
  font-size: 13px;
  line-height: 1.4;
}

.connectivity-test__meta {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
}

/* 旋转动画 */
.rotating {
  animation: rotate 2s linear infinite;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
