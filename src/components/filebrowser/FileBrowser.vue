<script lang="ts" setup>
import FileList from './FileList.vue'
import FileToolbar from './FileToolbar.vue'
import FileNavigator from './FileNavigator.vue'
import type { EndPoints, FileItem, StorageConf } from '@/api/types'
import { storageIconDict } from '@/api/constants'
import type { AxiosInstance } from 'axios'
import { useDynamicButton } from '@/composables/useDynamicButton'
import { usePWA } from '@/composables/usePWA'

// LocalStorage keys
const SORT_KEY = 'fileBrowser.sort'
const SHOW_TREE_KEY = 'fileBrowser.showDirTree'
const NAV_WIDTH_KEY = 'fileBrowser.navigatorWidth'

// 输入参数
const props = defineProps({
  storages: Array as PropType<StorageConf[]>,
  tree: Boolean,
  endpoints: Object as PropType<EndPoints>,
  // Axios 实例是可调用函数，运行时 prop 类型需与其实际形态一致。
  axios: {
    type: Function as PropType<AxiosInstance>,
    required: true,
  },
  axiosconfig: Object,
  item: {
    type: Object as PropType<FileItem>,
    required: true,
  },
  itemstack: {
    type: Array as PropType<FileItem[]>,
    default: () => [],
  },
  active: {
    type: Boolean,
    default: true,
  },
})

// 对外事件
const emit = defineEmits(['pathchanged'])
const route = useRoute()
const { appMode } = usePWA()
const toolbarRef = ref<InstanceType<typeof FileToolbar> | null>(null)

const fileIcons = {
  // 压缩包
  zip: 'mdi-folder-zip-outline',
  rar: 'mdi-folder-zip-outline',
  bak: 'mdi-folder-zip-outline',
  tar: 'mdi-folder-zip-outline',
  gz: 'mdi-folder-zip-outline',
  bz2: 'mdi-folder-zip-outline',
  // 开发
  htm: 'mdi-language-html5',
  html: 'mdi-language-html5',
  vue: 'mdi-vuejs',
  js: 'mdi-nodejs',
  ts: 'mdi-language-typescript',
  json: 'mdi-file-document-outline',
  css: 'mdi-language-css3',
  scss: 'mdi-language-css3',
  less: 'mdi-language-css3',
  php: 'mdi-language-php',
  py: 'mdi-language-python',
  java: 'mdi-language-java',
  go: 'mdi-language-go',
  c: 'mdi-language-c',
  cpp: 'mdi-language-cpp',
  h: 'mdi-language-c',
  cs: 'mdi-language-csharp',
  sql: 'mdi-database',
  sh: 'mdi-bash',
  bat: 'mdi-bash',
  ps1: 'mdi-powershell',
  // markdown
  md: 'mdi-language-markdown-outline',
  markdown: 'mdi-language-markdown-outline',
  // 图片
  png: 'mdi-file-png-box',
  jpg: 'mdi-file-jpg-box',
  jpeg: 'mdi-file-jpg-box',
  gif: 'mdi-file-gif-box',
  bmp: 'mdi-file-image-box',
  webp: 'mdi-file-image-box',
  ico: 'mdi-file-image-box',
  svg: 'mdi-file-image-box',
  // 视频
  mp4: 'mdi-filmstrip',
  mkv: 'mdi-filmstrip',
  avi: 'mdi-filmstrip',
  wmv: 'mdi-filmstrip',
  mov: 'mdi-filmstrip',
  flv: 'mdi-filmstrip',
  rmvb: 'mdi-filmstrip',
  // 文档
  txt: 'mdi-file-document-outline',
  env: 'mdi-file-cog-outline',
  yml: 'mdi-file-cog-outline',
  yaml: 'mdi-file-cog-outline',
  conf: 'mdi-file-cog-outline',
  log: 'mdi-file-document-outline',
  csv: 'mdi-file-delimited',
  // office
  xls: 'mdi-file-excel',
  xlsx: 'mdi-file-excel',
  doc: 'mdi-file-word',
  docx: 'mdi-file-word',
  ppt: 'mdi-file-powerpoint',
  pptx: 'mdi-file-powerpoint',
  pdf: 'mdi-file-pdf',
  // 音频
  mp2: 'mdi-music',
  mp3: 'mdi-music',
  m4a: 'mdi-music',
  wma: 'mdi-music',
  aac: 'mdi-music',
  ogg: 'mdi-music',
  flac: 'mdi-music',
  wav: 'mdi-music',
  // 字体
  ttf: 'mdi-format-font',
  otf: 'mdi-format-font',
  woff: 'mdi-format-font',
  woff2: 'mdi-format-font',
  eot: 'mdi-format-font',
  // 字幕
  srt: 'mdi-subtitles-outline',
  ass: 'mdi-subtitles-outline',
  sub: 'mdi-subtitles-outline',
  // 其他
  other: 'mdi-file-outline',
}

function openNewFolderDialog() {
  toolbarRef.value?.openNewFolderDialog()
}

const showFloatingNewFolderAction = computed(() => route.path === '/filemanager')

useDynamicButton({
  icon: 'mdi-folder-plus-outline',
  onClick: openNewFolderDialog,
  show: computed(() => appMode.value && showFloatingNewFolderAction.value),
})
// 加载次数
const loading = ref(0)

// 刷新
const refreshPending = ref(false)
// 排序 - 从localStorage恢复
const sort = ref(localStorage.getItem(SORT_KEY) || 'name')

// 是否显示目录树 - 从localStorage恢复
const showDirTree = ref(localStorage.getItem(SHOW_TREE_KEY) === 'true')

// 拖动分隔条相关 - 从localStorage恢复宽度
const navigatorWidth = ref(parseInt(localStorage.getItem(NAV_WIDTH_KEY) || '280'))
const isDragging = ref(false)
const dragStartX = ref(0)
const dragStartWidth = ref(0)

watch(sort, val => {
  localStorage.setItem(SORT_KEY, val)
})

watch(showDirTree, val => {
  localStorage.setItem(SHOW_TREE_KEY, String(val))
})

watch(navigatorWidth, val => {
  localStorage.setItem(NAV_WIDTH_KEY, String(val))
})

// 计算属性
const storagesArray = computed(() => {
  return props.storages?.map(item => ({
    title: item.name,
    value: item.type,
    icon: storageIconDict[item.type] ?? 'mdi-server-network-outline',
  }))
})

// 方法
function loadingChanged(isLoading: number | boolean) {
  if (isLoading) loading.value++
  else if (loading.value > 0) loading.value--
}

// 存储切换
async function storageChanged(storage: string) {
  emit('pathchanged', { storage: storage, path: '/', fileid: 'root' })
}

// 路径变化
function pathChanged(item: FileItem) {
  emit('pathchanged', item)
}

// 排序变化
function sortChanged(s: string) {
  sort.value = s
  refreshPending.value = true
}

// 切换目录树
function switchDirTree(state: boolean) {
  showDirTree.value = state
}

// 文件列表
const fileListItems = ref<FileItem[]>([])

// 文件列表数据更新
function fileListUpdated(items: FileItem[]) {
  fileListItems.value = items
}

// 阻止选择事件
function preventSelect(event: Event) {
  event.preventDefault()
  return false
}

interface DocumentDragStyle extends CSSStyleDeclaration {
  MozUserSelect: string
  webkitUserSelect: string
}

/** 拖动期间写入 document 全局样式，停止拖动或卸载时必须成对恢复。 */
function setDocumentDragStyles(active: boolean) {
  const value = active ? 'none' : ''
  const style = document.body.style as DocumentDragStyle
  style.cursor = active ? 'col-resize' : ''
  style.userSelect = value
  style.webkitUserSelect = value
  style.MozUserSelect = value
}

// 拖动分隔条相关方法
function startDrag(event: MouseEvent) {
  event.preventDefault() // 阻止默认行为
  event.stopPropagation() // 阻止事件冒泡

  isDragging.value = true
  dragStartX.value = event.clientX
  dragStartWidth.value = navigatorWidth.value

  document.addEventListener('mousemove', handleDrag, { passive: false })
  document.addEventListener('mouseup', stopDrag, { passive: false })
  document.addEventListener('selectstart', preventSelect) // 阻止选择开始

  setDocumentDragStyles(true)
}

function handleDrag(event: MouseEvent) {
  if (!isDragging.value) return

  event.preventDefault() // 阻止默认行为

  const deltaX = event.clientX - dragStartX.value
  const newWidth = dragStartWidth.value + deltaX

  // 设置最小和最大宽度限制
  const minWidth = 200
  const maxWidth = window.innerWidth * 0.6

  navigatorWidth.value = Math.max(minWidth, Math.min(maxWidth, newWidth))
}

function stopDrag() {
  isDragging.value = false
  document.removeEventListener('mousemove', handleDrag)
  document.removeEventListener('mouseup', stopDrag)
  document.removeEventListener('selectstart', preventSelect)

  setDocumentDragStyles(false)
}

function cleanupDrag() {
  if (isDragging.value) {
    stopDrag()
  }
}

onDeactivated(cleanupDrag)
onUnmounted(cleanupDrag)
</script>

<template>
  <div class="file-browser-shell mx-auto overflow-hidden" :aria-busy="loading > 0">
    <VProgressLinear v-if="loading > 0" indeterminate color="primary" height="2" class="file-browser-progress" />
    <div v-if="item">
      <FileToolbar
        ref="toolbarRef"
        :sort="sort"
        :item="item"
        :itemstack="itemstack"
        :storages="storagesArray"
        :endpoints="endpoints"
        :axios="axios"
        :show-new-folder-button="!(appMode && showFloatingNewFolderAction)"
        @storagechanged="storageChanged"
        @pathchanged="pathChanged"
        @loading="loadingChanged"
        @foldercreated="refreshPending = true"
        @sortchanged="sortChanged"
      />
      <div class="file-browser-body flex">
        <FileNavigator
          v-if="showDirTree"
          :storage="item.storage"
          :currentPath="item.path"
          :items="fileListItems"
          :endpoints="endpoints"
          :axios="axios"
          :style="{ width: `${navigatorWidth}px`, minWidth: `${navigatorWidth}px` }"
          @navigate="pathChanged"
        />
        <!-- 拖动分隔条 -->
        <div v-if="showDirTree" class="divider" :class="{ 'divider-dragging': isDragging }" @mousedown="startDrag">
          <div class="divider-line"></div>
          <VIcon class="divider-icon" size="small">mdi-drag-vertical</VIcon>
        </div>
        <FileList
          :item="item"
          :icons="fileIcons"
          :endpoints="endpoints"
          :axios="axios"
          :refreshpending="refreshPending"
          :sort="sort"
          :showTree="showDirTree"
          :active="active"
          :style="{ flex: 1, minWidth: 0 }"
          @pathchanged="pathChanged"
          @loading="loadingChanged"
          @refreshed="refreshPending = false"
          @filedeleted="refreshPending = true"
          @renamed="refreshPending = true"
          @items-updated="fileListUpdated"
          @switch-tree="switchDirTree"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-browser-shell {
  border: 1px solid var(--mp-border-card);
  border-radius: 12px;
  background: rgb(var(--v-theme-surface));
}

.file-browser-body {
  display: flex;
  min-inline-size: 0;
}

.divider {
  position: relative;
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  background-color: transparent;
  cursor: col-resize;
  inline-size: 5px;
  margin-inline: -2px;
  transition: background-color 0.16s ease;
  user-select: none;
  z-index: 2;
}

.divider-line {
  background-color: var(--mp-border-subtle);
  block-size: 100%;
  inline-size: 1px;
  transition: background-color 0.16s ease;
  user-select: none;
}

.divider:hover .divider-line {
  background-color: rgba(var(--v-theme-primary), 0.65);
}

.divider-dragging .divider-line {
  background-color: rgb(var(--v-theme-primary)) !important;
}

.divider-icon {
  position: absolute;
  z-index: 1;
  padding: 2px;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 4px;
  background-color: rgb(var(--v-theme-surface));
  color: rgba(var(--v-theme-on-surface), 0.56);
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.16s ease,
    color 0.16s ease;
}

.divider:hover .divider-icon {
  color: rgba(var(--v-theme-primary), 0.9);
  opacity: 1;
}

.divider-dragging .divider-icon {
  border-color: rgba(var(--v-theme-primary), 0.4);
  color: rgb(var(--v-theme-primary));
  opacity: 1;
}
</style>
