<script setup lang="ts">
import api from '@/api'
import { RecommendSource } from '@/api/types'
import MediaCardSlideView from '@/views/discover/MediaCardSlideView.vue'
import { useI18n } from '@/composables/useChineseText'
import { useDynamicHeaderTab } from '@/composables/useDynamicHeaderTab'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { getRecommendTabs } from '@/router/i18n-menu'
import { useToast } from 'vue-toastification'

import {
  createBuiltInRecommendSources,
  mergeExtraRecommendSources,
  type RecommendViewSource,
} from '@/utils/recommendSources'

const ContentToggleSettingsDialog = defineAsyncComponent(
  () => import('@/components/dialog/ContentToggleSettingsDialog.vue'),
)

// 国际化
const { t } = useI18n()
const $toast = useToast()

// 路由
const route = useRoute()

// 本地存储键值
const localConfigKey = 'MP_RECOMMEND'

// 当前选择的分类
const currentCategory = ref(t('recommend.all'))

// 使用动态标签页
const { registerHeaderTab } = useDynamicHeaderTab()

let settingsDialogController: ReturnType<typeof openSharedDialog> | null = null

// 打开推荐内容共享设置弹窗。
function openRecommendSettings() {
  settingsDialogController?.close()
  const releaseController = () => {
    if (settingsDialogController === controller) settingsDialogController = null
  }

  const controller = openSharedDialog(
    ContentToggleSettingsDialog,
    {
      enabled: enableConfig.value,
      hint: t('recommend.selectContentToDisplay'),
      items: viewList,
      selectAllText: t('recommend.selectAll'),
      selectNoneText: t('recommend.selectNone'),
      showBulkActions: true,
      title: t('recommend.customizeContent'),
      valueGetter: (item: { title: string }) => item.title,
    },
    {
      close: releaseController,
      save: (payload?: { enabled?: Record<string, boolean> }) => saveConfig(payload, controller),
      'update:modelValue': (value: boolean) => {
        if (!value) releaseController()
      },
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
  settingsDialogController = controller
}

// 关闭推荐内容共享设置弹窗。
function closeRecommendSettings(controller = settingsDialogController) {
  if (!controller || settingsDialogController !== controller) return
  controller.close()
  settingsDialogController = null
}

const builtInRecommendSources = createBuiltInRecommendSources(t)
const viewList = reactive<RecommendViewSource[]>([...builtInRecommendSources])
const newlyAddedBuiltInPaths = new Set(['anilist/trending', 'anilist/popular-this-season'])

// 计算当前分类下显示的视图
const filteredViews = computed(() => {
  if (currentCategory.value === t('recommend.all')) {
    return viewList.filter(item => enableConfig.value[item.title])
  }
  return viewList.filter(item => enableConfig.value[item.title] && item.type === currentCategory.value)
})

// 榜单启用配置， 以title为key
const enableConfig = ref<{ [key: string]: boolean }>({
  ...Object.fromEntries(viewList.map(item => [item.title, true])),
})

// 额外的数据源
const extraRecommendSources = ref<RecommendSource[]>([])
let configRequest: Promise<void> | null = null
let extraSourcesRequest: Promise<void> | null = null
let initialLoadPromise: Promise<void> | null = null
let hasDeactivated = false

/** 只接受以标题为键、布尔值为开关的推荐配置。 */
function normalizeEnableConfig(value: unknown): Record<string, boolean> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const entries = Object.entries(value)
  if (entries.some(([, enabled]) => typeof enabled !== 'boolean')) return null

  return Object.fromEntries(entries)
}

// 同步读取本地缓存；若数据损坏则自动清理。
function readLocalConfig(): Record<string, boolean> | null {
  const localEnable = localStorage.getItem(localConfigKey)
  if (!localEnable) return null

  try {
    const localConfig = normalizeEnableConfig(JSON.parse(localEnable))
    if (localConfig) return localConfig
  } catch {
    // 损坏的本地值按未配置处理。
  }
  localStorage.removeItem(localConfigKey)
  return null
}

/** 为旧版推荐配置补入新增内置榜单，同时保留用户已经明确保存的开关值。 */
function enableMissingBuiltInSources() {
  builtInRecommendSources.forEach(source => {
    if (newlyAddedBuiltInPaths.has(source.apipath) && !(source.title in enableConfig.value)) {
      enableConfig.value[source.title] = true
    }
  })
}

/** 刷新扩展推荐源；并发生命周期入口共享请求，成功响应按当前服务端快照替换列表。 */
function loadExtraRecommendSources() {
  if (extraSourcesRequest) return extraSourcesRequest

  extraSourcesRequest = (async () => {
    try {
      extraRecommendSources.value = await api.get('recommend/source')
      const nextViewList = [...builtInRecommendSources]
      mergeExtraRecommendSources(nextViewList, extraRecommendSources.value)
      viewList.splice(0, viewList.length, ...nextViewList)
    } catch (error) {
      console.log(error)
    }
  })().finally(() => {
    extraSourcesRequest = null
  })

  return extraSourcesRequest
}

// 加载面板配置；服务端为跨设备权威源，本地 localStorage 仅在远端无配置或请求失败时兜底，且去重在途请求。
function loadConfig() {
  if (configRequest) return configRequest

  configRequest = (async () => {
    try {
      const response = await api.get('/user/config/Recommend')
      const remoteConfig = normalizeEnableConfig(response?.data?.value)
      if (remoteConfig) {
        localStorage.setItem(localConfigKey, JSON.stringify(remoteConfig))
        enableConfig.value = { ...remoteConfig }
        enableMissingBuiltInSources()
        return
      }
    } catch (error) {
      console.error(error)
    }

    const localConfig = readLocalConfig()
    if (localConfig) {
      enableConfig.value = { ...localConfig }
      enableMissingBuiltInSources()
    }
  })().finally(() => {
    configRequest = null
  })

  return configRequest
}

// 设置项目；服务端确认成功后再更新页面状态与本地回退缓存。
async function saveConfig(payload?: { enabled?: Record<string, boolean> }, controller = settingsDialogController) {
  const nextConfig = payload?.enabled ? { ...payload.enabled } : { ...enableConfig.value }

  try {
    await api.post('/user/config/Recommend', nextConfig)
  } catch (error) {
    console.error(error)
    $toast.error(t('common.saveFailed'))
    return
  }

  enableConfig.value = nextConfig
  localStorage.setItem(localConfigKey, JSON.stringify(nextConfig))
  closeRecommendSettings(controller)
}

// 推荐分类标签与导航三级菜单共用同一份定义。
const categoryItems = computed(() => getRecommendTabs(t))

// 注册动态标签页，将设置按钮合并至顶栏右侧同行。
registerHeaderTab({
  items: categoryItems,
  modelValue: currentCategory,
  appendButtons: [
    {
      title: t('recommend.configureContent'),
      label: t('recommend.configureContent'),
      icon: 'mdi-tune',
      variant: 'outlined',
      testId: 'recommend-settings-btn',
      action: openRecommendSettings,
    },
  ],
})

// 页面是否准备就绪
const isReady = ref(false)

// 定时器
let timer: ReturnType<typeof setTimeout>

async function initializeRecommend() {
  // 同步预热本地缓存，降低首屏内容闪跳
  const localConfig = readLocalConfig()
  if (localConfig) {
    enableConfig.value = localConfig
    enableMissingBuiltInSources()
  }

  await Promise.all([loadConfig(), loadExtraRecommendSources()])
  enableMissingBuiltInSources()
}

onBeforeMount(() => {
  initialLoadPromise = initializeRecommend().finally(() => {
    initialLoadPromise = null
  })
})

onMounted(() => {
  // 适度延迟渲染内容，兼顾页面切换流畅度与首屏速度
  timer = setTimeout(() => {
    isReady.value = true
  }, 120)
})

onUnmounted(() => {
  if (timer) clearTimeout(timer)
})

onDeactivated(() => {
  hasDeactivated = true
})

onActivated(async () => {
  if (!hasDeactivated) {
    if (initialLoadPromise) {
      await initialLoadPromise
    }
    return
  }

  await Promise.all([loadConfig(), loadExtraRecommendSources()])
  enableMissingBuiltInSources()
})
</script>

<template>
  <div class="mp-recommend">
    <!-- 滚动内容区域 -->
    <div class="recommend-content">
      <TransitionGroup name="fade">
        <MediaCardSlideView
          v-for="item in filteredViews"
          :key="item.title"
          v-bind="item"
          :ready="isReady"
          class="content-group"
        />
      </TransitionGroup>

      <div v-if="isReady && filteredViews.length === 0" class="empty-category">
        <VIcon icon="mdi-alert-circle-outline" size="large" class="empty-icon" />
        <p class="empty-text">{{ t('recommend.noCategoryContent') }}</p>
        <VBtn color="primary" variant="tonal" size="small" rounded="lg" @click="openRecommendSettings">
          {{ t('recommend.configureContent') }}
        </VBtn>
      </div>
    </div>

    <Teleport to="body" v-if="route.path === '/recommend'">
      <VScrollToTopBtn :offset-fab="false" />
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.mp-recommend {
  position: relative;
  padding: 0;
  max-inline-size: 100%;
}

.recommend-content {
  padding-block: 0;
}

/* Fade transition for content groups */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.content-group {
  transition: opacity 0.3s ease;
}

// 横向滚动层依靠纵向缓冲展示上浮与阴影，不可在外层启用会裁切溢出的 paint containment。

.empty-category {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  text-align: center;
}

.empty-icon {
  margin-block-end: 16px;
  opacity: 0.5;
}

.empty-text {
  font-size: 1rem;
  margin-block-end: 16px;
}
</style>
