<script setup lang="ts">
import api from '@/api'
import { useI18n } from '@/composables/useChineseText'

// 国际化
const { t } = useI18n()

interface ModuleListItem {
  id: string
  name: string
  name_i18n?: string
  name_key?: string
}

interface ModuleTestResponse {
  success: boolean
  message?: string
  message_i18n?: string
}

// 定义所有的模块ID、名称列表
const modules = ref<
  {
    id: string
    name: string
    state: 'success' | 'error' | 'warning' | 'info' | undefined
    errmsg: string
    loading: boolean
    visible: boolean
  }[]
>([])

// 总体进度
const overallProgress = ref(0)
const isChecking = ref(false)
const checkComplete = ref(false)
let checkGeneration = 0
let isUnmounted = false

// 调用API查询模块列表
async function getModules() {
  const generation = ++checkGeneration
  try {
    isChecking.value = true
    checkComplete.value = false
    overallProgress.value = 0

    const result: { [key: string]: any } = await api.get('system/modulelist')
    if (generation !== checkGeneration || isUnmounted) return

    if (result.success) {
      const moduleList = result.data?.modules
      if (moduleList) {
        // 初始化模块列表并直接展示，避免人工延迟导致进度与条目显示脱节
        modules.value = moduleList.map((module: ModuleListItem) => ({
          id: module.id,
          name: module.name_i18n || module.name,
          state: undefined,
          errmsg: '',
          loading: false,
          visible: true,
        }))

        // 开始检查
        await startModuleCheck(generation)
        return
      }
    }
    if (generation === checkGeneration && !isUnmounted) {
      isChecking.value = false
    }
  } catch (error) {
    console.error(error)
    if (generation === checkGeneration && !isUnmounted) {
      isChecking.value = false
    }
  }
}

// 开始模块检查
async function startModuleCheck(generation: number) {
  const totalModules = modules.value.length

  for (let i = 0; i < totalModules; i++) {
    if (generation !== checkGeneration || isUnmounted) return

    // 开始检查
    await moduleTest(i, generation)
    if (generation !== checkGeneration || isUnmounted) return

    // 更新总体进度
    overallProgress.value = ((i + 1) / totalModules) * 100
  }

  if (generation === checkGeneration && !isUnmounted) {
    isChecking.value = false
    checkComplete.value = true
  }
}

// 调用API测试模块
async function moduleTest(index: number, generation: number) {
  const target = modules.value[index]
  if (!target) return
  try {
    const moduleid = target.id
    target.loading = true

    const result = (await api.get(`system/moduletest/${moduleid}`)) as ModuleTestResponse
    if (generation !== checkGeneration || isUnmounted) return
    target.loading = false

    if (result.success) {
      target.state = 'success'
      target.errmsg = ''
    } else if (!result.message) {
      target.state = undefined
      target.errmsg = ''
    } else {
      target.state = 'error'
      target.errmsg = result.message_i18n || result.message || ''
    }
  } catch (error) {
    console.error(error)
    if (generation !== checkGeneration || isUnmounted) return
    target.loading = false
    target.state = 'error'
    target.errmsg = t('moduleTest.requestFailed')
  }
}

// 重新检查
function recheck() {
  modules.value = []
  overallProgress.value = 0
  isChecking.value = false
  checkComplete.value = false
  void getModules()
}

// 加载
onMounted(getModules)

onBeforeUnmount(() => {
  isUnmounted = true
  checkGeneration++
})
</script>

<template>
  <div class="system-health-check">
    <!-- 动态进度与操作面板 -->
    <div class="progress-container">
      <div class="progress-card">
        <div class="progress-header">
          <span class="progress-icon-box" :class="{ 'is-complete': checkComplete }" aria-hidden="true">
            <VIcon
              :icon="isChecking ? 'mdi-cog-sync' : checkComplete ? 'mdi-check-circle' : 'mdi-cog'"
              :class="isChecking ? 'rotating' : ''"
              size="18"
            />
          </span>
          <h3 class="progress-title">
            {{
              isChecking
                ? t('moduleTest.checking')
                : checkComplete
                  ? t('moduleTest.complete')
                  : t('moduleTest.preparing')
            }}
          </h3>
          <span class="progress-text">{{ Math.round(overallProgress) }}%</span>
          <VBtn
            color="primary"
            variant="flat"
            prepend-icon="mdi-refresh"
            :loading="isChecking"
            :disabled="isChecking"
            @click="recheck"
          >
            {{ t('moduleTest.recheck') }}
          </VBtn>
        </div>

        <div class="progress-bar-container">
          <VProgressLinear v-model="overallProgress" color="primary" height="5" rounded class="progress-bar" />
        </div>

        <div class="progress-stats">
          <div class="stat-item">
            <span class="stat-number">{{ modules.length }}</span>
            <span class="stat-label">{{ t('moduleTest.totalModules') }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-number success">{{ modules.filter(m => m.state === 'success').length }}</span>
            <span class="stat-label">{{ t('moduleTest.normal') }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-number error">{{ modules.filter(m => m.state === 'error').length }}</span>
            <span class="stat-label">{{ t('moduleTest.error') }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 检查结果结构化列表 -->
    <div class="results-container">
      <div class="module-list">
        <Transition v-for="module in modules" :key="module.id" name="module-item" appear>
          <div v-show="module.visible" class="module-item" :class="[module.state]">
            <div class="module-header">
              <div class="module-icon" :class="[module.state]">
                <VIcon v-if="module.loading" icon="mdi-loading" class="rotating" color="primary" size="16" />
                <VIcon v-else-if="module.state === 'success'" icon="mdi-check-circle" color="success" size="16" />
                <VIcon v-else-if="module.state === 'error'" icon="mdi-alert-circle" color="error" size="16" />
                <VIcon v-else icon="mdi-minus-circle" size="16" />
              </div>
              <div class="module-info">
                <div class="module-name">{{ module.name }}</div>
                <div v-if="module.errmsg" class="module-error">{{ module.errmsg }}</div>
              </div>
              <div class="module-status">
                <VChip v-if="module.loading" color="primary" size="x-small" variant="tonal" class="module-status-chip">
                  {{ t('moduleTest.checking') }}
                </VChip>
                <VChip
                  v-else-if="module.state === 'success'"
                  color="success"
                  size="x-small"
                  variant="tonal"
                  class="module-status-chip"
                >
                  {{ t('moduleTest.normal') }}
                </VChip>
                <VChip
                  v-else-if="module.state === 'error'"
                  color="error"
                  size="x-small"
                  variant="tonal"
                  class="module-status-chip"
                >
                  {{ t('moduleTest.error') }}
                </VChip>
                <VChip v-else-if="module.state === undefined" size="x-small" variant="tonal" class="module-status-chip">
                  {{ t('moduleTest.disabled') }}
                </VChip>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
.system-health-check {
  display: flex;
  overflow: hidden;
  flex: 1 1 auto;
  flex-direction: column;
  block-size: 100%;
  min-block-size: 0;
}

.progress-container {
  flex-shrink: 0;
}

.progress-card {
  padding: 13px 16px;
  margin: 10px 14px;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: var(--mp-field-bg);
  color: rgb(var(--v-theme-on-surface));
}

.progress-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-block-end: 10px;
}

.progress-icon-box {
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

.progress-icon-box.is-complete {
  background: rgba(var(--v-theme-success), 0.1);
  color: rgb(var(--v-theme-success));
}

.progress-title {
  flex: 1;
  min-inline-size: 120px;
  margin: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
}

.progress-bar-container {
  position: relative;
  margin-block-end: 12px;
}

.progress-bar {
  background: rgba(var(--v-theme-on-surface), 0.08) !important;
}

.progress-text {
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(var(--v-theme-primary), 0.24);
  border-radius: 6px;
  background: rgba(var(--v-theme-primary), 0.1);
  block-size: 22px;
  color: rgb(var(--v-theme-primary));
  font-size: 11.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  padding-inline: 8px;
}

.progress-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-block-start: 1px solid var(--mp-border-subtle);
  padding-block-start: 10px;
}

.stat-item {
  text-align: center;
}

.stat-item + .stat-item {
  border-inline-start: 1px solid var(--mp-border-subtle);
}

.stat-number {
  display: block;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 21px;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  line-height: 1.15;
}

.stat-number.success {
  color: rgb(var(--v-theme-success));
}

.stat-number.error {
  color: rgb(var(--v-theme-error));
}

.stat-label {
  display: block;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11.5px;
  margin-block-start: 2px;
}

.results-container {
  flex: 1;
  min-block-size: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-block: 0 14px;
  padding-inline: 14px;
}

.module-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.module-item {
  padding: 10px 13px;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: var(--mp-field-bg);
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease;
}

.module-item.success {
  border-color: rgba(var(--v-theme-success), 0.28);
}

.module-item.error {
  border-color: rgba(var(--v-theme-error), 0.32);
  background: rgba(var(--v-theme-error), 0.04);
}

.module-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.module-icon {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 7px;
  background: var(--mp-item-bg);
  block-size: 28px;
  color: rgba(var(--v-theme-on-surface), 0.45);
  inline-size: 28px;
}

.module-info {
  flex: 1;
  min-inline-size: 0;
}

.module-name {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
}

.module-error {
  color: rgb(var(--v-theme-error));
  font-size: 12px;
  line-height: 1.4;
  margin-block-start: 2px;
}

.module-status {
  flex-shrink: 0;
}

.module-status-chip {
  block-size: 20px;
  font-size: 11px;
  font-weight: 600;
}

/* 动画效果 */
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

/* 模块项单独动画 - 从下方滑出 */
.module-item-enter-active {
  transition: all 0.32s ease;
}

.module-item-enter-from {
  opacity: 0;
  transform: translateY(12px);
}

.module-item-enter-to {
  opacity: 1;
  transform: translateY(0);
}
</style>
