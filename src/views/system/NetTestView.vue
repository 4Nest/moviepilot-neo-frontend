<script setup lang="ts">
import { useTheme } from 'vuetify'
import api from '@/api'
import { getLogoUrl } from '@/utils/imageUtils'
import tvdb from '@images/logos/thetvdb.jpeg'
import { useI18n } from '@/composables/useChineseText'

// 国际化
const { t } = useI18n()
const { global: globalTheme } = useTheme()
const isDark = computed(() => Boolean(globalTheme?.current?.value?.dark))

interface Status {
  OK: string
  Fail: string
  Normal: string
  Doing?: string
}

interface TargetItem {
  id: string
  icon: string
  name: string
}

interface Address {
  id: string
  image: string
  name: string
  status: keyof Status
  time: string
  message: string
  btndisable: boolean
}

function resolveTargetImage(icon: string) {
  if (icon === 'tvdb') return tvdb
  return getLogoUrl(icon)
}

const targets = ref<Address[]>([])

const abortControllers = new Set<AbortController>()
const isUnmounting = ref(false)
const isBatchTesting = ref(false)

const okCount = computed(() => targets.value.filter(item => item.status === 'OK').length)
const failCount = computed(() => targets.value.filter(item => item.status === 'Fail').length)

async function loadTargets() {
  // 测试项由后端下发，前端只负责展示，避免再把可测试目标和校验规则留在客户端。
  const result: { [key: string]: any } = await api.get('system/nettest/targets')
  if (!result.success || !Array.isArray(result.data)) {
    targets.value = []
    return
  }

  targets.value = result.data.map((item: TargetItem) => ({
    id: item.id,
    image: resolveTargetImage(item.icon),
    name: item.name,
    status: 'Normal',
    time: '',
    message: t('netTest.notTested'),
    btndisable: false,
  }))
}

// 调用API测试网络连接
async function netTest(index: number) {
  const target = targets.value[index]
  if (!target) return

  // 页面切换时需要主动中止请求，否则自动轮询中的旧请求会回写已卸载页面状态。
  const abortController = new AbortController()
  abortControllers.add(abortController)

  try {
    const { signal } = abortController

    target.btndisable = true
    target.status = 'Doing'
    target.message = t('netTest.testing')

    const result: { [key: string]: any } = await api.get('system/nettest', {
      params: {
        target_id: target.id,
      },
      signal,
    })

    if (result.success) {
      target.status = 'OK'
      target.message = t('netTest.normal')
    } else {
      target.status = 'Fail'
      target.message = result.message
    }
    target.time = result.data?.time
    target.btndisable = false
  } catch (error) {
    if (!isUnmounting.value) {
      target.status = 'Fail'
      target.message = error instanceof Error ? error.message : t('netTest.notTested')
      target.btndisable = false
    }
  } finally {
    abortControllers.delete(abortController)
  }
}

/** 逐个串行测试全部目标，避免同时触发过多外部请求。 */
async function runAllNetTests() {
  if (isBatchTesting.value) return
  isBatchTesting.value = true
  try {
    for (let i = 0; !isUnmounting.value && i < targets.value.length; i++) {
      await netTest(i)
    }
  } finally {
    if (!isUnmounting.value) {
      isBatchTesting.value = false
    }
  }
}

// 加载时测试所有连接
onMounted(async () => {
  isUnmounting.value = false
  await loadTargets()
  await runAllNetTests()
})
onBeforeUnmount(() => {
  isUnmounting.value = true
  for (const controller of abortControllers) {
    controller.abort()
  }
  abortControllers.clear()
})
</script>

<template>
  <div class="nettest-workbench">
    <div class="nettest-toolbar">
      <div class="nettest-summary">
        <span class="nettest-icon-box" aria-hidden="true">
          <VIcon icon="mdi-access-point-network" size="18" />
        </span>
        <div class="nettest-stats">
          <span class="nettest-stat">
            总计 <strong>{{ targets.length }}</strong>
          </span>
          <span class="nettest-stat nettest-stat--success">
            {{ t('netTest.normal') }} <strong>{{ okCount }}</strong>
          </span>
          <span v-if="failCount > 0" class="nettest-stat nettest-stat--error">
            异常 <strong>{{ failCount }}</strong>
          </span>
        </div>
      </div>

      <VBtn
        color="primary"
        variant="flat"
        prepend-icon="mdi-refresh"
        :loading="isBatchTesting"
        :disabled="targets.length === 0"
        @click="runAllNetTests"
      >
        重新测试
      </VBtn>
    </div>

    <div class="nettest-panel">
      <div v-for="(target, index) of targets" :key="target.id" class="nettest-row">
        <span class="nettest-avatar" :class="{ 'nettest-avatar--dark': isDark }">
          <VImg
            v-if="target.image"
            :src="target.image"
            :alt="target.name"
            width="22"
            height="22"
            :max-width="22"
            :max-height="22"
            contain
            class="flex-grow-0"
          />
          <VIcon v-else icon="mdi-earth" size="18" />
        </span>

        <div class="nettest-main">
          <div class="nettest-name">{{ target.name }}</div>
          <div class="nettest-message" :class="`is-${target.status.toLowerCase()}`">
            <i class="nettest-dot" :class="`is-${target.status.toLowerCase()}`" aria-hidden="true" />
            <span>{{ target.message }}</span>
          </div>
        </div>

        <span v-if="target.time" class="nettest-latency"> {{ target.time }} ms </span>

        <VBtn
          icon
          size="small"
          variant="text"
          class="nettest-icon-trigger"
          :disabled="target.btndisable"
          :aria-label="target.name"
          @click="netTest(index)"
        >
          <VIcon icon="mdi-connection" size="16" />
        </VBtn>
      </div>
    </div>
  </div>
</template>

<style scoped>
.nettest-workbench {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-block-start: 4px;
}

.nettest-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: var(--mp-field-bg);
  gap: 10px;
}

.nettest-summary {
  display: flex;
  align-items: center;
  gap: 10px;
}

.nettest-icon-box {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.1);
  block-size: 34px;
  color: rgb(var(--v-theme-primary));
  inline-size: 34px;
}

.nettest-stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.nettest-stat strong {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 13.5px;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  margin-inline-start: 3px;
}

.nettest-stat--success strong {
  color: rgb(var(--v-theme-success));
}

.nettest-stat--error strong {
  color: rgb(var(--v-theme-error));
}

.nettest-panel {
  overflow: hidden;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: var(--mp-field-bg);
}

.nettest-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto 28px;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
}

.nettest-row + .nettest-row {
  border-block-start: 1px solid var(--mp-border-subtle);
}

.nettest-avatar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 8px;
  background: rgb(var(--v-theme-surface));
  block-size: 34px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  inline-size: 34px;
}

.nettest-avatar--dark {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.085);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.nettest-main {
  min-inline-size: 0;
}

.nettest-name {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nettest-message {
  display: flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  gap: 6px;
  line-height: 1.35;
  margin-block-start: 3px;
}

.nettest-message.is-fail {
  color: rgb(var(--v-theme-error));
}

.nettest-dot {
  flex-shrink: 0;
  border-radius: 50%;
  background: rgba(var(--v-theme-on-surface), 0.3);
  block-size: 6px;
  inline-size: 6px;
}

.nettest-dot.is-ok {
  background: rgb(var(--v-theme-success));
}

.nettest-dot.is-fail {
  background: rgb(var(--v-theme-error));
}

.nettest-dot.is-doing {
  background: rgb(var(--v-theme-warning));
}

.nettest-latency {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 6px;
  background: var(--mp-item-bg);
  block-size: 21px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  padding-inline: 8px;
  white-space: nowrap;
}

.nettest-icon-trigger {
  border: 1px solid var(--mp-border-subtle);
  border-radius: 7px !important;
  background: var(--mp-item-bg);
  block-size: 28px !important;
  inline-size: 28px !important;
  min-inline-size: 28px !important;
}

.nettest-icon-trigger:hover:not(:disabled) {
  border-color: rgba(var(--v-theme-primary), 0.36);
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
}
</style>
