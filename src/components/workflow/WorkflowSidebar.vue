<script lang="ts" setup>
import api from '@/api'
import useDragAndDrop from '@core/utils/workflow'
import { useDisplay } from 'vuetify'
import { useI18n } from '@/composables/useChineseText'
import { actionStepDict } from '@/api/constants'
import { usePWA } from '@/composables/usePWA'

interface ActionItem {
  name: string
  type: string
  desc?: string
  description?: string
  data?: Record<string, unknown>
  contract?: Record<string, unknown>
}

interface ActionGroup {
  key: string
  title: string
  items: ActionItem[]
}

const DATA_SOURCE_TYPES = new Set([
  'FetchRssAction',
  'FetchTorrentsAction',
  'FetchMediasAction',
  'FetchDownloadsAction',
  'ScanFileAction',
])

const FILTER_TYPES = new Set(['FilterTorrentsAction', 'FilterMediasAction'])

const EXECUTE_TYPES = new Set(['AddDownloadAction', 'AddSubscribeAction', 'TransferFileAction', 'ScrapeFileAction'])

const NOTIFY_EXT_TYPES = new Set(['SendMessageAction', 'InvokePluginAction', 'SendEventAction', 'NoteAction'])

const display = useDisplay()
const { appMode } = usePWA()
const { t } = useI18n()

const { onDragStart } = useDragAndDrop()

// 组件列表
const actions = ref<ActionItem[]>([])
// 搜索词
const searchQuery = ref('')
// 侧边栏是否收起 (仅在桌面端有效)
const isSidebarCollapsed = ref(false)
// 侧边栏在移动端是否显示
const showMobileSidebar = ref(false)

// 定义emit
const emit = defineEmits<{
  (e: 'component-click', action: ActionItem): void
  (e: 'collapse-change', collapsed: boolean): void
}>()

// 加载组件列表
async function loadActions() {
  try {
    actions.value = await api.get('workflow/actions')
  } catch (error) {
    console.error(error)
  }
}

// 切换侧边栏收起状态
function toggleSidebar() {
  isSidebarCollapsed.value = !isSidebarCollapsed.value
  emit('collapse-change', isSidebarCollapsed.value)
}

// 切换移动端侧边栏显示状态
function toggleMobileSidebar() {
  showMobileSidebar.value = !showMobileSidebar.value
}

// 处理点击或快捷添加组件事件
function handleComponentClick(action: ActionItem) {
  emit('component-click', action)
  if (display.smAndDown.value) {
    showMobileSidebar.value = false
  }
}

// 根据动作类型获取图标
function getActionIcon(type: string): string {
  const iconMap: Record<string, string> = {
    AddSubscribeAction: 'mdi-star-plus',
    AddDownloadAction: 'mdi-download',
    FetchDownloadsAction: 'mdi-progress-download',
    FetchMediasAction: 'mdi-movie-search',
    FetchRssAction: 'mdi-rss',
    FetchTorrentsAction: 'mdi-search-web',
    FilterMediasAction: 'mdi-filter-check',
    FilterTorrentsAction: 'mdi-filter-multiple',
    ScanFileAction: 'mdi-folder-search',
    ScrapeFileAction: 'mdi-file-find',
    SendEventAction: 'mdi-send-check',
    SendMessageAction: 'mdi-message-arrow-right',
    TransferFileAction: 'mdi-file-move',
    InvokePluginAction: 'mdi-run',
    NoteAction: 'mdi-note-text',
  }

  return iconMap[type] || 'mdi-puzzle-outline'
}

// 获取动作步骤文本
function getActionStepText(action: ActionItem) {
  if (!action.name) return action.type
  return actionStepDict[action.name] || action.name
}

// 获取动作描述文本
function getActionDescText(action: ActionItem) {
  return action.description || action.desc || ''
}

// 搜索过滤后的动作
const filteredActions = computed(() => {
  const keyword = (searchQuery.value || '').trim().toLowerCase()
  if (!keyword) return actions.value
  return actions.value.filter(action => {
    const label = getActionStepText(action)
    const desc = getActionDescText(action)
    return [label, action.name, action.type, desc].filter(Boolean).join(' ').toLowerCase().includes(keyword)
  })
})

// 按 4 组归类展示
const groupedActions = computed<ActionGroup[]>(() => {
  const dataSourceItems: ActionItem[] = []
  const filterItems: ActionItem[] = []
  const executeItems: ActionItem[] = []
  const notifyExtItems: ActionItem[] = []

  filteredActions.value.forEach(action => {
    if (DATA_SOURCE_TYPES.has(action.type)) {
      dataSourceItems.push(action)
    } else if (FILTER_TYPES.has(action.type)) {
      filterItems.push(action)
    } else if (EXECUTE_TYPES.has(action.type)) {
      executeItems.push(action)
    } else if (NOTIFY_EXT_TYPES.has(action.type)) {
      notifyExtItems.push(action)
    } else {
      notifyExtItems.push(action)
    }
  })

  return [
    { key: 'dataSource', title: t('workflow.sidebar.groups.dataSource'), items: dataSourceItems },
    { key: 'filter', title: t('workflow.sidebar.groups.filter'), items: filterItems },
    { key: 'execute', title: t('workflow.sidebar.groups.execute'), items: executeItems },
    { key: 'notifyAndExt', title: t('workflow.sidebar.groups.notifyAndExt'), items: notifyExtItems },
  ].filter(group => group.items.length > 0)
})

// 计算侧边栏类名
const sidebarClasses = computed(() => {
  return {
    'sidebar-collapsed': isSidebarCollapsed.value && !display.smAndDown.value,
    'sidebar-mobile': display.smAndDown.value,
    'sidebar-mobile-open': showMobileSidebar.value && display.smAndDown.value,
  }
})

// 监听屏幕尺寸变化，自动关闭移动端侧边栏
watch(
  () => display.smAndDown.value,
  isMobile => {
    if (!isMobile) {
      showMobileSidebar.value = false
    }
  },
)

onMounted(() => {
  loadActions()
})
</script>

<template>
  <!-- 移动端触发按钮 -->
  <div
    v-if="display.smAndDown.value"
    class="workflow-sidebar-trigger"
    :class="appMode ? 'right-4 bottom-28' : 'right-4 bottom-4'"
    @click="toggleMobileSidebar"
  >
    <VBtn icon size="large" class="workflow-sidebar-fab">
      <VIcon :icon="showMobileSidebar ? 'mdi-close' : 'mdi-plus'" />
    </VBtn>
  </div>

  <!-- 侧边栏 -->
  <aside class="workflow-sidebar" :class="sidebarClasses">
    <div class="sidebar-container">
      <!-- 侧边栏头部 -->
      <div class="sidebar-header">
        <div class="header-content">
          <VAvatar size="34" class="workflow-logo">
            <VIcon icon="mdi-apps" size="18" />
          </VAvatar>
          <span v-if="!isSidebarCollapsed || display.smAndDown.value" class="header-title">
            {{ t('workflow.components') }}
          </span>
          <IconBtn v-if="!display.smAndDown.value" class="collapse-btn" size="small" @click="toggleSidebar">
            <VIcon :icon="isSidebarCollapsed ? 'mdi-chevron-right' : 'mdi-chevron-left'" />
          </IconBtn>
        </div>

        <!-- 搜索框（展开态显示） -->
        <div v-if="!isSidebarCollapsed || display.smAndDown.value" class="sidebar-search mt-3">
          <VTextField
            v-model="searchQuery"
            :placeholder="t('workflow.sidebar.searchPlaceholder')"
            prepend-inner-icon="mdi-magnify"
            density="compact"
            variant="outlined"
            hide-details
            clearable
          />
        </div>
      </div>

      <!-- 组件分组列表 -->
      <div class="components-container">
        <template v-if="groupedActions.length > 0">
          <div v-for="group in groupedActions" :key="group.key" class="component-group">
            <div v-if="!isSidebarCollapsed || display.smAndDown.value" class="component-group__title">
              {{ group.title }}
            </div>

            <div
              v-for="action in group.items"
              :key="action.type"
              class="component-item"
              :draggable="!display.smAndDown.value"
              @dragstart="!display.smAndDown.value && onDragStart($event, action)"
              @click="display.smAndDown.value && handleComponentClick(action)"
            >
              <VCard class="component-card" variant="flat">
                <VAvatar size="34" class="component-avatar">
                  <VIcon :icon="getActionIcon(action.type)" size="18" />
                </VAvatar>

                <div v-if="!isSidebarCollapsed || display.smAndDown.value" class="component-info">
                  <div class="component-name" :title="getActionStepText(action)">
                    {{ getActionStepText(action) }}
                  </div>
                  <div class="component-desc" :title="getActionDescText(action)">
                    {{
                      getActionDescText(action) ||
                      (display.smAndDown.value ? t('workflow.clickToAdd') : t('workflow.dragToCanvas'))
                    }}
                  </div>
                </div>

                <!-- 桌面端快捷添加按钮 -->
                <IconBtn
                  v-if="!display.smAndDown.value && !isSidebarCollapsed"
                  size="x-small"
                  color="primary"
                  class="component-quick-add"
                  :aria-label="`${t('workflow.sidebar.quickAdd')} ${getActionStepText(action)}`"
                  @click.stop="handleComponentClick(action)"
                >
                  <VIcon icon="mdi-plus" size="17" />
                  <VTooltip activator="parent" location="end">{{ t('workflow.sidebar.quickAdd') }}</VTooltip>
                </IconBtn>

                <VTooltip v-if="isSidebarCollapsed && !display.smAndDown.value" activator="parent" location="end">
                  {{ getActionStepText(action) }}
                </VTooltip>
              </VCard>
            </div>
          </div>
        </template>

        <div v-else class="sidebar-empty text-body-2 text-medium-emphasis py-8 text-center">
          {{ t('workflow.sidebar.noMatch') }}
        </div>
      </div>

      <!-- 底部提示 -->
      <div class="sidebar-footer">
        <div class="sidebar-footer-hint">
          <VIcon v-if="isSidebarCollapsed && !display.smAndDown.value" icon="mdi-gesture-swipe" size="18" />
          <template v-else>
            <VIcon :icon="display.smAndDown.value ? 'mdi-gesture-tap' : 'mdi-gesture-swipe'" size="16" class="me-1" />
            <span>{{
              display.smAndDown.value ? t('workflow.tapComponentHint') : t('workflow.dragComponentHint')
            }}</span>
          </template>
        </div>
      </div>
    </div>
  </aside>
</template>

<style lang="scss" scoped>
.workflow-sidebar {
  position: absolute;
  z-index: 100;
  overflow: hidden;
  background-color: rgb(var(--v-theme-surface));
  border-inline-end: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 8%);
  inline-size: 280px;
  inset-block: 0;
  inset-inline-start: 0;
  transition:
    inline-size 0.25s ease,
    transform 0.25s ease;

  &.sidebar-collapsed {
    inline-size: 70px;
  }

  &.sidebar-mobile {
    inline-size: 256px;
    transform: translateX(-100%);

    &.sidebar-mobile-open {
      transform: translateX(0);
    }
  }
}

.sidebar-container {
  display: flex;
  flex-direction: column;
  block-size: 100%;
}

.sidebar-header {
  flex-shrink: 0;
  padding: 12px 14px;
  border-block-end: 1px solid rgba(var(--v-theme-on-surface), 0.06);

  .header-content {
    position: relative;
    display: flex;
    align-items: center;
  }

  .workflow-logo {
    background-color: rgb(var(--v-theme-primary));
    color: rgb(var(--v-theme-on-primary));
    margin-inline-end: 10px;
  }

  .header-title {
    color: rgb(var(--v-theme-on-surface));
    font-size: 16px;
    font-weight: 600;
  }

  .collapse-btn {
    color: rgb(var(--v-theme-primary));
    margin-inline-start: auto;
  }
}

.components-container {
  flex: 1;
  padding: 10px 12px;
  overflow-y: auto;

  &::-webkit-scrollbar {
    inline-size: 5px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    border-radius: 10px;
    background-color: rgba(var(--v-theme-primary), 0.28);
  }
}

.component-group + .component-group {
  margin-block-start: 12px;
}

.component-group__title {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  margin-block-end: 6px;
  padding-inline: 2px;
  text-transform: uppercase;
}

.component-item {
  cursor: grab;
  margin-block-end: 7px;

  &:active {
    cursor: grabbing;
  }
}

.component-card {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  border-radius: var(--app-control-radius);
  background-color: rgba(var(--v-theme-on-surface), 0.035);
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    background-color 0.18s ease;

  &:hover {
    border-color: rgba(var(--v-theme-primary), 0.35);
    background-color: rgba(var(--v-theme-primary), 0.06);
    transform: translateY(-1px);
  }
}

.component-avatar {
  flex-shrink: 0;
  background-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  margin-inline-end: 10px;

  .v-icon {
    color: rgb(var(--v-theme-on-primary)) !important;
    opacity: 1 !important;
  }
}

.component-info {
  min-inline-size: 0;
  flex: 1;
  overflow: hidden;
}

.component-name {
  overflow: hidden;
  color: rgb(var(--v-theme-on-surface));
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.component-desc {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.component-quick-add {
  flex-shrink: 0;
  margin-inline-start: 4px;
  opacity: 0.78;
  transition: opacity 0.15s ease;

  .component-card:hover & {
    opacity: 1;
  }
}

.sidebar-footer {
  flex-shrink: 0;
  padding: 10px 12px;
  border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}

.sidebar-footer-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 10px;
  border-radius: var(--app-control-radius);
  background-color: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
  font-size: 12px;
  font-weight: 500;
}

// 移动端悬浮按钮
.workflow-sidebar-trigger {
  position: fixed;
  z-index: 100;
}

.workflow-sidebar-fab {
  background-color: rgb(var(--v-theme-primary));
  box-shadow: 0 4px 12px rgba(var(--v-theme-primary), 0.4);
  color: rgb(var(--v-theme-on-primary));
}

.sidebar-collapsed {
  .sidebar-header {
    padding: 12px 8px;

    .header-content {
      flex-direction: column;
      gap: 6px;
    }

    .workflow-logo {
      margin-inline-end: 0;
    }

    .collapse-btn {
      margin-inline-start: 0;
    }
  }

  .components-container {
    padding: 8px;
  }

  .component-card {
    justify-content: center;
    padding: 8px;
  }

  .component-avatar {
    margin-inline-end: 0;
  }

  .sidebar-footer {
    padding: 8px 6px;
  }
}

@media (width <= 600px) {
  .component-card {
    padding: 8px;
  }

  .component-item {
    margin-block-end: 6px;
  }

  .components-container {
    padding: 8px;
  }

  .sidebar-header {
    padding: 10px 12px;
  }

  .sidebar-footer {
    padding: 8px;
  }
}
</style>
