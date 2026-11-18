<script lang="ts" setup>
import type { PluginRating } from '@/api/types'
import PluginCard from './PluginCard.vue'
import PluginFolderCard from './PluginFolderCard.vue'

interface MixedSortItem {
  type: 'folder' | 'plugin'
  id: string
  data: any
  order: number
}

interface Props {
  item: MixedSortItem
  pluginStatistics?: { [key: string]: number }
  pluginActions?: { [key: string]: boolean }
  showRemoveButton?: boolean
  sortable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  pluginStatistics: () => ({}),
  pluginActions: () => ({}),
  showRemoveButton: false,
  sortable: false,
})

const emit = defineEmits<{
  openFolder: [folderName: string]
  deleteFolder: [folderName: string]
  renameFolder: [oldName: string, newName: string]
  updateFolderConfig: [folderName: string, config: any]
  refreshData: []
  remove: [pluginId: string]
  rating: [pluginRating: PluginRating]
  actionDone: [pluginId: string]
  removeFromFolder: [pluginId: string]
  dropToFolder: [event: DragEvent, folderName: string]
}>()

function handlePluginRemove(removedPluginId?: string) {
  if (removedPluginId) {
    emit('remove', removedPluginId)
    return
  }
  emit('refreshData')
}

// 拖拽事件处理
function handleDragOver(event: DragEvent) {
  // 只有当拖拽的是插件时才允许放入文件夹
  if (props.sortable && props.item.type === 'folder') {
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer!.dropEffect = 'move'
    const target = event.currentTarget as HTMLElement
    target.classList.add('drag-over')
  }
}

function handleDragEnter(event: DragEvent) {
  if (props.sortable && props.item.type === 'folder') {
    event.preventDefault()
    event.stopPropagation()
  }
}

function handleDragLeave(event: DragEvent) {
  if (props.sortable && props.item.type === 'folder') {
    event.preventDefault()
    event.stopPropagation()
    const target = event.currentTarget as HTMLElement
    target.classList.remove('drag-over')
  }
}

function handleDropToFolder(event: DragEvent) {
  if (props.sortable && props.item.type === 'folder') {
    event.preventDefault()
    event.stopPropagation()
    const target = event.currentTarget as HTMLElement
    target.classList.remove('drag-over')

    emit('dropToFolder', event, props.item.id)
  }
}
</script>

<template>
  <div class="mixed-sort-card-wrapper h-full">
    <!-- 文件夹卡片 -->
    <div
      v-if="item.type === 'folder'"
      class="drop-zone h-full"
      :data-plugin-id="item.id"
      @dragover="handleDragOver"
      @dragenter="handleDragEnter"
      @dragleave="handleDragLeave"
      @drop="handleDropToFolder"
    >
      <PluginFolderCard
        :folder-name="item.data.name"
        :plugin-count="item.data.pluginCount"
        :folder-config="item.data.config"
        :sortable="sortable"
        @open="$emit('openFolder', item.id)"
        @delete="$emit('deleteFolder', item.id)"
        @rename="(oldName, newName) => $emit('renameFolder', oldName, newName)"
        @update-config="(folderName, config) => $emit('updateFolderConfig', folderName, config)"
      />
    </div>

    <!-- 插件卡片 -->
    <div v-else-if="item.type === 'plugin'" class="plugin-item-wrapper h-full" :data-plugin-id="item.id">
      <PluginCard
        :count="pluginStatistics[item.id] || 0"
        :plugin="item.data"
        :action="pluginActions[item.id] || false"
        :sortable="sortable"
        @remove="handlePluginRemove"
        @save="$emit('refreshData')"
        @rating="$emit('rating', $event)"
        @action-done="$emit('actionDone', item.id)"
      />

      <!-- 移出文件夹按钮（仅在文件夹内显示，置于底栏菜单旁避免遮挡右上角状态/评分角标） -->
      <VBtn
        v-if="showRemoveButton && !sortable"
        icon="mdi-folder-remove"
        variant="text"
        color="warning"
        size="x-small"
        title="移出文件夹"
        aria-label="移出文件夹"
        class="remove-from-folder-btn"
        @click.stop="$emit('removeFromFolder', item.id)"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.mixed-sort-card-wrapper {
  block-size: 100%;
  inline-size: 100%;

  // 确保拖拽时的边界清晰
  &.sortable-chosen {
    opacity: 0.5;
  }

  &.sortable-ghost {
    border: 2px dashed rgb(var(--v-theme-primary));
    border-radius: var(--app-surface-radius);
    background: rgba(var(--v-theme-primary), 0.1);
    opacity: 0.3;
  }
}

// 拖拽相关样式
.drop-zone {
  position: relative;
  isolation: isolate; // 创建新的层叠上下文
  transition: all 0.3s ease;

  &.drag-over {
    border: 2px dashed rgb(var(--v-theme-primary));
    border-radius: var(--app-surface-radius);
    box-shadow: 0 0 20px rgba(var(--v-theme-primary), 0.5);
    transform: scale(1.02);
  }
}

.plugin-item-wrapper {
  position: relative;
  isolation: isolate; // 创建新的层叠上下文

  .remove-from-folder-btn {
    position: absolute;
    z-index: 10;
    border-radius: 6px !important;
    background: rgba(var(--v-theme-surface), 0.9);
    block-size: 26px !important;
    inline-size: 26px !important;
    inset-block-end: 5px;
    inset-inline-end: 38px;
    min-inline-size: 26px !important;
    opacity: 0;
    padding: 0 !important;
    transition: opacity 0.2s ease;
  }

  &:hover .remove-from-folder-btn,
  &:focus-within .remove-from-folder-btn {
    opacity: 1;
  }
}

@media (hover: none), (pointer: coarse) {
  .plugin-item-wrapper .remove-from-folder-btn {
    opacity: 1;
  }
}

// 拖拽时的样式优化
.mixed-sort-card-wrapper.sortable-drag {
  .remove-from-folder-btn {
    display: none !important;
  }
}
</style>
