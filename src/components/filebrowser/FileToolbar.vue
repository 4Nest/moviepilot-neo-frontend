<script lang="ts" setup>
import type { AxiosRequestConfig, AxiosInstance } from 'axios'
import type { ApiResponse, EndPoints, FileItem } from '@/api/types'
import { getPathDisplayName, normalizeDirectoryPath, type QuickDirectoryItem } from './types'
import { useToast } from 'vue-toastification'
import { useI18n } from '@/composables/useChineseText'
import { openSharedDialog } from '@/composables/useSharedDialog'

const FileNewFolderDialog = defineAsyncComponent(() => import('../dialog/FileNewFolderDialog.vue'))

const $toast = useToast()
const { t } = useI18n()
const breadcrumbsRef = ref<HTMLElement | null>(null)
const pathInputRef = ref<HTMLInputElement | null>(null)

/** 工具栏存储选择项，由文件浏览器从存储配置映射得到。 */
interface StorageOption {
  // 存储类型对应的展示图标
  icon: string
  // 存储显示名称
  title: string
  // 存储类型标识
  value: string
}

// 输入参数
const inProps = defineProps({
  storages: Array as PropType<StorageOption[]>,
  item: {
    type: Object as PropType<FileItem>,
    required: true,
  },
  itemstack: {
    type: Array as PropType<FileItem[]>,
    required: true,
  },
  endpoints: Object as PropType<EndPoints>,
  // Axios 实例是可调用函数，运行时 prop 类型需与其实际形态一致。
  axios: {
    type: Function as PropType<AxiosInstance>,
    required: true,
  },
  sort: {
    type: String,
    default: 'name',
  },
  showNewFolderButton: {
    type: Boolean,
    default: true,
  },
  defaultPath: {
    type: String,
    default: '',
  },
  quickDirectories: {
    type: Array as PropType<QuickDirectoryItem[]>,
    default: () => [],
  },
  savingDefaultPath: {
    type: Boolean,
    default: false,
  },
})

// 对外事件
const emit = defineEmits([
  'storagechanged',
  'pathchanged',
  'loading',
  'foldercreated',
  'sortchanged',
  'save-default-path',
])

// 新建文件名称
const newFolderName = ref('')
const creatingFolder = ref(false)
let newFolderDialogController: ReturnType<typeof openSharedDialog> | null = null

// 默认打开路径与快捷目录菜单状态
const defaultPathMenuOpen = ref(false)
const draftDefaultPath = ref('')

// 地址栏路径直输状态
const isEditingPath = ref(false)
const draftJumpPath = ref('')

// 调整排序方式
function changeSort() {
  const newSort = inProps.sort === 'name' ? 'time' : 'name'
  emit('sortchanged', newSort)
}

// 计算PATH面包屑
const pathSegments = computed(() => {
  let path_str = ''
  const isFolder = inProps.item.path?.endsWith('/')
  const segments = inProps.item.path?.split('/').filter(item => item)
  return (
    segments?.map((item, index) => {
      path_str += item + (index < segments.length - 1 || isFolder ? '/' : '')
      return {
        name: item,
        path: path_str,
      }
    }) ?? []
  )
})

// 当前存储
const storageObject = computed(() => {
  return inProps.storages?.find(item => item.value === inProps.item.storage)
})

// 当前路径规范化后的目录路径（若当前是文件则为空）
const currentDirPath = computed(() => {
  if (inProps.item.type === 'file') return ''
  return normalizeDirectoryPath(inProps.item.path || '/')
})

// 当前存储已保存的规范化默认路径
const normalizedDefaultPath = computed(() => normalizeDirectoryPath(inProps.defaultPath || ''))

// 当前目录是否即默认打开路径
const isCurrentDefaultPath = computed(
  () =>
    Boolean(currentDirPath.value) &&
    Boolean(normalizedDefaultPath.value) &&
    currentDirPath.value === normalizedDefaultPath.value,
)

// 是否允许一键「设为当前目录」
const canSetCurrentAsDefault = computed(
  () =>
    inProps.item.type !== 'file' &&
    Boolean(currentDirPath.value) &&
    currentDirPath.value !== normalizedDefaultPath.value,
)

// 是否允许保存手动编辑的默认路径
const canSaveDraftDefaultPath = computed(() => {
  const normalizedDraft = normalizeDirectoryPath(draftDefaultPath.value)
  return Boolean(normalizedDraft) && normalizedDraft !== normalizedDefaultPath.value && !inProps.savingDefaultPath
})

const defaultPathButtonTitle = computed(() => {
  if (isCurrentDefaultPath.value) return `当前为默认打开路径：${normalizedDefaultPath.value}`
  if (normalizedDefaultPath.value) return `默认打开路径：${normalizedDefaultPath.value}（点击配置或快捷跳转）`
  return '设置默认打开路径与快捷目录'
})

// 同步菜单内输入框草稿
watch(
  [defaultPathMenuOpen, () => inProps.defaultPath, currentDirPath],
  ([opened]) => {
    if (opened) {
      draftDefaultPath.value = normalizedDefaultPath.value || currentDirPath.value || '/'
    }
  },
  { immediate: true },
)

// 切换存储
function changeStorage(code: string) {
  if (inProps.item.storage !== code) {
    emit('storagechanged', code)
  }
}

// 路径变化
function changePath(item: FileItem) {
  emit('pathchanged', item)
}

// 直接按规范化路径跳转到目标目录
function jumpToDirectoryPath(rawPath: string) {
  const targetPath = normalizeDirectoryPath(rawPath)
  if (!targetPath) return

  if (targetPath === '/') {
    changePath(resolveCrumbItem(0))
    return
  }

  const existing = inProps.itemstack.find(entry => entry?.path === targetPath)
  if (existing) {
    changePath(existing)
    return
  }

  changePath({
    storage: inProps.item.storage,
    type: 'dir',
    name: getPathDisplayName(targetPath),
    path: targetPath,
  })
}

// 保存手动输入的默认打开路径
function submitDefaultPath() {
  if (!canSaveDraftDefaultPath.value) return
  emit('save-default-path', normalizeDirectoryPath(draftDefaultPath.value))
}

// 一键将当前目录设为默认打开路径
function setCurrentDirAsDefault() {
  if (!canSetCurrentAsDefault.value || inProps.savingDefaultPath) return
  draftDefaultPath.value = currentDirPath.value
  emit('save-default-path', currentDirPath.value)
}

// 一键清除默认打开路径
function clearDefaultPath() {
  if (!normalizedDefaultPath.value || inProps.savingDefaultPath) return
  emit('save-default-path', '')
}

// 从快捷目录菜单跳转并关闭弹层
function handleQuickJump(targetPath: string) {
  defaultPathMenuOpen.value = false
  jumpToDirectoryPath(targetPath)
}

// 进入地址栏路径直输模式
async function startPathEdit() {
  draftJumpPath.value = inProps.item.path || '/'
  isEditingPath.value = true
  await nextTick()
  pathInputRef.value?.focus()
  pathInputRef.value?.select()
}

// 退出地址栏路径直输模式
function cancelPathEdit() {
  isEditingPath.value = false
}

// 提交地址栏输入的路径并跳转
function submitPathEdit() {
  const normalized = normalizeDirectoryPath(draftJumpPath.value)
  isEditingPath.value = false
  if (!normalized) return
  jumpToDirectoryPath(normalized)
}

// 根据面包屑层级解析对应的 FileItem；当跨级导航导致 itemstack 不完整时回退按路径合成
function resolveCrumbItem(index: number): FileItem {
  if (index <= 0) {
    return (
      inProps.itemstack[0] ?? {
        storage: inProps.item.storage,
        type: 'dir',
        name: '/',
        path: '/',
        fileid: 'root',
      }
    )
  }

  const segment = pathSegments.value[index - 1]
  if (!segment) {
    return (
      inProps.itemstack[0] ?? {
        storage: inProps.item.storage,
        type: 'dir',
        name: '/',
        path: '/',
        fileid: 'root',
      }
    )
  }

  const targetPath = `/${segment.path}`
  const matched = inProps.itemstack.find(entry => entry?.path === targetPath)
  if (matched) return matched

  const indexed = inProps.itemstack[index]
  if (indexed?.path === targetPath) return indexed

  const isLastFile = index === pathSegments.value.length && inProps.item.type === 'file'
  return {
    storage: inProps.item.storage,
    type: isLastFile ? 'file' : 'dir',
    name: segment.name,
    path: isLastFile ? targetPath : targetPath.endsWith('/') ? targetPath : `${targetPath}/`,
  }
}

// 返回上一级
function goUp() {
  const segments = pathSegments.value ?? []
  if (segments.length === 0) return
  changePath(resolveCrumbItem(segments.length - 1))
}

// 创建目录
async function mkdir() {
  if (creatingFolder.value) return
  creatingFolder.value = true
  emit('loading', true)
  try {
    const url = inProps.endpoints?.mkdir.url.replace(/{name}/g, newFolderName.value)

    const config: AxiosRequestConfig<FileItem> = {
      url,
      method: inProps.endpoints?.mkdir.method || 'post',
      data: inProps.item,
    }

    const result = await inProps.axios.request<unknown, ApiResponse<unknown>>(config)
    if (!result?.success) {
      $toast.error(result?.message || t('common.error'))
      return
    }

    newFolderDialogController?.close()
    newFolderDialogController = null
    newFolderName.value = ''
    emit('foldercreated')
  } catch (error) {
    console.error('创建目录失败:', error)
    $toast.error(error instanceof Error ? error.message : t('common.error'))
  } finally {
    creatingFolder.value = false
    emit('loading', false)
  }
}

function openNewFolderDialog() {
  newFolderName.value = ''
  newFolderDialogController = openSharedDialog(
    FileNewFolderDialog,
    { name: newFolderName.value },
    {
      create: mkdir,
      'update:name': (value: string) => {
        newFolderName.value = value
        newFolderDialogController?.updateProps({ name: value })
      },
    },
    { closeOn: ['close'] },
  )
}

// 计算排序图标与提示文案
const sortIcon = computed(() => {
  if (inProps.sort === 'time') return 'mdi-sort-clock-ascending-outline'
  return 'mdi-sort-alphabetical-ascending'
})

const sortLabel = computed(() =>
  inProps.sort === 'time' ? '按修改时间排序（点击切为按名称）' : '按名称排序（点击切为按时间）',
)

// 路径变化后将面包屑自动滚到末尾，并退出路径编辑态，确保深层目录优先露出当前目录。
watch(
  () => inProps.item.path,
  async () => {
    isEditingPath.value = false
    await nextTick()
    if (breadcrumbsRef.value) {
      breadcrumbsRef.value.scrollLeft = breadcrumbsRef.value.scrollWidth
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  newFolderDialogController?.close()
})

defineExpose({
  openNewFolderDialog,
})
</script>

<template>
  <header class="file-browser-toolbar">
    <div class="file-toolbar__left">
      <!-- 存储切换下拉胶囊 -->
      <VMenu v-if="(storages?.length ?? 0) > 1" offset-y>
        <template #activator="{ props }">
          <VBtn v-bind="props" variant="text" color="default" size="small" class="file-toolbar__storage-pill">
            <VIcon :icon="storageObject?.icon || 'mdi-harddisk'" size="15" class="file-toolbar__storage-icon" />
            <span class="file-toolbar__storage-name">{{ storageObject?.title || inProps.item.storage }}</span>
            <VIcon icon="mdi-chevron-down" size="14" class="file-toolbar__storage-caret" />
          </VBtn>
        </template>
        <VList density="compact">
          <VListItem
            v-for="(storageItem, index) in storages"
            :key="index"
            :disabled="storageItem.value === storageObject?.value"
            @click="changeStorage(storageItem.value)"
          >
            <template #prepend>
              <VIcon :icon="storageItem.icon" size="17" />
            </template>
            <VListItemTitle>{{ storageItem.title }}</VListItemTitle>
          </VListItem>
        </VList>
      </VMenu>
      <span v-else class="file-toolbar__storage-pill file-toolbar__storage-pill--static">
        <VIcon :icon="storageObject?.icon || 'mdi-harddisk'" size="15" class="file-toolbar__storage-icon" />
        <span class="file-toolbar__storage-name">{{ storageObject?.title || inProps.item.storage }}</span>
      </span>

      <!-- 地址栏路径直输态 -->
      <form v-if="isEditingPath" class="file-toolbar__path-editor" @submit.prevent="submitPathEdit">
        <VIcon icon="mdi-folder-search-outline" size="15" class="file-toolbar__path-editor-icon" />
        <input
          ref="pathInputRef"
          v-model="draftJumpPath"
          type="text"
          class="file-toolbar__path-input"
          data-testid="path-jump-input"
          placeholder="输入目录路径后按 Enter 跳转，如 /media/Raw/"
          aria-label="输入目录路径"
          @keydown.esc.prevent="cancelPathEdit"
        />
        <button
          type="submit"
          class="file-toolbar__inline-btn file-toolbar__inline-btn--primary"
          data-testid="path-jump-confirm"
          title="跳转到该路径"
          aria-label="跳转到该路径"
        >
          <VIcon icon="mdi-check" size="15" />
        </button>
        <button
          type="button"
          class="file-toolbar__inline-btn"
          data-testid="path-jump-cancel"
          title="取消编辑"
          aria-label="取消编辑"
          @click="cancelPathEdit"
        >
          <VIcon icon="mdi-close" size="15" />
        </button>
      </form>

      <!-- / 分隔面包屑路径胶囊 + 编辑直输入口 -->
      <div v-else class="file-toolbar__path-bar">
        <nav ref="breadcrumbsRef" class="file-toolbar__breadcrumbs" aria-label="文件路径">
          <VBtn
            variant="text"
            color="default"
            size="small"
            class="file-toolbar__crumb"
            :class="{ 'file-toolbar__crumb--active': item.path === '/' }"
            title="根目录"
            aria-label="根目录"
            @click="changePath(resolveCrumbItem(0))"
          >
            <VIcon icon="mdi-folder-home-outline" size="15" />
            <span v-if="pathSegments.length === 0" class="ms-1">/</span>
          </VBtn>

          <template v-for="(segment, index) in pathSegments" :key="index">
            <span class="file-toolbar__slash">/</span>
            <VBtn
              variant="text"
              color="default"
              size="small"
              class="file-toolbar__crumb"
              :class="{ 'file-toolbar__crumb--active': index === pathSegments.length - 1 }"
              @click="changePath(resolveCrumbItem(index + 1))"
            >
              {{ segment.name }}
            </VBtn>
          </template>
        </nav>

        <button
          type="button"
          class="file-toolbar__inline-btn file-toolbar__edit-path-btn"
          data-testid="path-edit-trigger"
          title="输入路径跳转"
          aria-label="输入路径跳转"
          @click="startPathEdit"
        >
          <VIcon icon="mdi-pencil-outline" size="14" />
        </button>
      </div>
    </div>

    <div class="file-toolbar__actions">
      <IconBtn
        class="file-toolbar__action-btn"
        data-testid="sort-toggle-btn"
        :title="sortLabel"
        :aria-label="sortLabel"
        @click="changeSort"
      >
        <VIcon :icon="sortIcon" size="17" />
      </IconBtn>
      <IconBtn
        v-if="pathSegments.length > 0"
        class="file-toolbar__action-btn"
        data-testid="go-up-btn"
        title="返回上级目录"
        aria-label="返回上级目录"
        @click="goUp"
      >
        <VIcon icon="mdi-arrow-up" size="17" />
      </IconBtn>
      <IconBtn
        v-if="showNewFolderButton"
        class="file-toolbar__action-btn"
        data-testid="new-folder-btn"
        title="新建文件夹"
        aria-label="新建文件夹"
        @click="openNewFolderDialog"
      >
        <VIcon icon="mdi-folder-plus-outline" size="17" />
      </IconBtn>

      <!-- 默认打开路径设置与快捷目录菜单 -->
      <VMenu v-model="defaultPathMenuOpen" :close-on-content-click="false" location="bottom end" offset="6">
        <template #activator="{ props }">
          <button
            v-bind="props"
            type="button"
            class="file-toolbar__action-btn file-toolbar__home-btn"
            :class="{
              'is-active': isCurrentDefaultPath,
              'has-default': Boolean(normalizedDefaultPath) && !isCurrentDefaultPath,
            }"
            data-testid="default-path-trigger"
            :title="defaultPathButtonTitle"
            :aria-label="defaultPathButtonTitle"
          >
            <VIcon :icon="isCurrentDefaultPath ? 'mdi-home-check' : 'mdi-home-outline'" size="17" />
          </button>
        </template>

        <div class="file-default-menu" data-testid="default-path-menu">
          <!-- 当前存储默认打开路径配置区 -->
          <div class="file-default-menu__section">
            <div class="file-default-menu__header">
              <span class="file-default-menu__title">当前存储默认打开路径</span>
              <span class="file-default-menu__storage-tag">{{ storageObject?.title || inProps.item.storage }}</span>
            </div>
            <div class="file-default-menu__status" data-testid="default-path-status">
              {{ normalizedDefaultPath || '自动（公共下载目录）' }}
            </div>

            <form class="file-default-menu__form" @submit.prevent="submitDefaultPath">
              <input
                v-model="draftDefaultPath"
                type="text"
                class="file-default-menu__input"
                data-testid="default-path-input"
                placeholder="输入默认目录路径，如 /media/Raw/"
                aria-label="默认打开路径"
              />
              <button
                type="submit"
                class="file-default-menu__save-btn"
                data-testid="default-path-save"
                :disabled="!canSaveDraftDefaultPath"
              >
                {{ savingDefaultPath ? '保存中' : '保存' }}
              </button>
            </form>

            <div class="file-default-menu__quick-ops">
              <button
                type="button"
                class="file-default-menu__op-btn file-default-menu__op-btn--primary"
                data-testid="default-path-set-current"
                :disabled="!canSetCurrentAsDefault || savingDefaultPath"
                @click="setCurrentDirAsDefault"
              >
                <VIcon icon="mdi-home-plus-outline" size="14" />
                <span>设为当前目录</span>
              </button>
              <button
                v-if="normalizedDefaultPath"
                type="button"
                class="file-default-menu__op-btn file-default-menu__op-btn--danger"
                data-testid="default-path-clear"
                :disabled="savingDefaultPath"
                @click="clearDefaultPath"
              >
                <VIcon icon="mdi-close-circle-outline" size="14" />
                <span>清除默认路径</span>
              </button>
            </div>
          </div>

          <div class="file-default-menu__divider" />

          <!-- 快捷跳转区 -->
          <div class="file-default-menu__section">
            <div class="file-default-menu__header">
              <span class="file-default-menu__title">快捷跳转</span>
            </div>
            <div class="file-default-menu__jump-list">
              <button
                v-if="normalizedDefaultPath"
                type="button"
                class="file-default-menu__jump-item"
                :class="{ 'is-current': currentDirPath === normalizedDefaultPath }"
                data-testid="quick-jump-default"
                @click="handleQuickJump(normalizedDefaultPath)"
              >
                <VIcon icon="mdi-home-outline" size="15" class="file-default-menu__jump-icon is-primary" />
                <span class="file-default-menu__jump-body">
                  <span class="file-default-menu__jump-label">默认路径</span>
                  <span class="file-default-menu__jump-path">{{ normalizedDefaultPath }}</span>
                </span>
              </button>

              <button
                type="button"
                class="file-default-menu__jump-item"
                :class="{ 'is-current': currentDirPath === '/' }"
                data-testid="quick-jump-root"
                @click="handleQuickJump('/')"
              >
                <VIcon icon="mdi-folder-home-outline" size="15" class="file-default-menu__jump-icon" />
                <span class="file-default-menu__jump-body">
                  <span class="file-default-menu__jump-label">根目录</span>
                  <span class="file-default-menu__jump-path">/</span>
                </span>
              </button>

              <button
                v-for="dir in quickDirectories"
                :key="`${dir.kind}-${dir.path}`"
                type="button"
                class="file-default-menu__jump-item"
                :class="{ 'is-current': currentDirPath === dir.path }"
                data-testid="quick-jump-directory"
                @click="handleQuickJump(dir.path)"
              >
                <VIcon
                  :icon="dir.kind === 'library' ? 'mdi-filmstrip-box-multiple-outline' : 'mdi-download-outline'"
                  size="15"
                  class="file-default-menu__jump-icon"
                />
                <span class="file-default-menu__jump-body">
                  <span class="file-default-menu__jump-label">{{ dir.name }}</span>
                  <span class="file-default-menu__jump-path">{{ dir.path }}</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </VMenu>
    </div>
  </header>
</template>

<style scoped>
.file-browser-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-block-end: 1px solid var(--mp-border-subtle);
  background: rgb(var(--v-theme-surface));
  block-size: 48px;
  gap: 8px;
}

.file-toolbar__left {
  display: flex;
  overflow: hidden;
  flex: 1 1 auto;
  align-items: center;
  gap: 6px;
  min-inline-size: 0;
}

.file-toolbar__storage-pill {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  padding: 0 9px !important;
  border: 1px solid var(--mp-border-subtle) !important;
  border-radius: 7px !important;
  background: var(--mp-item-bg, rgba(var(--v-theme-on-surface), 0.04)) !important;
  block-size: 28px !important;
  color: rgb(var(--v-theme-on-surface)) !important;
  font-size: 12.5px !important;
  font-weight: 500 !important;
  gap: 5px;
  letter-spacing: 0 !important;
  min-inline-size: 0 !important;
  text-transform: none !important;
}

.file-toolbar__storage-pill:hover {
  border-color: var(--mp-border-hover) !important;
  background: rgba(var(--v-theme-on-surface), 0.065) !important;
}

.file-toolbar__storage-pill--static {
  cursor: default;
}

.file-toolbar__storage-icon {
  color: rgba(var(--v-theme-on-surface), 0.72);
}

.file-toolbar__storage-caret {
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin-inline-start: 1px;
}

.file-toolbar__path-bar {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 4px;
  min-inline-size: 0;
}

.file-toolbar__breadcrumbs {
  display: flex;
  overflow-x: auto;
  flex: 1 1 auto;
  align-items: center;
  gap: 2px;
  min-inline-size: 0;
  scroll-behavior: smooth;
  scrollbar-width: none;
}

.file-toolbar__breadcrumbs::-webkit-scrollbar {
  display: none;
}

.file-toolbar__slash {
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), 0.3);
  font-size: 13px;
  user-select: none;
}

.file-toolbar__crumb {
  flex-shrink: 0;
  padding: 0 7px !important;
  border-radius: 7px !important;
  block-size: 28px !important;
  color: rgba(var(--v-theme-on-surface), 0.64) !important;
  font-size: 13px !important;
  font-weight: 400 !important;
  letter-spacing: 0 !important;
  min-inline-size: 28px !important;
  text-transform: none !important;
}

.file-toolbar__crumb:hover {
  background: rgba(var(--v-theme-on-surface), 0.05) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
}

.file-toolbar__crumb--active {
  background: rgba(var(--v-theme-on-surface), 0.06) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
  font-weight: 600 !important;
}

.file-toolbar__path-editor {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  padding: 0 4px 0 8px;
  border: 1px solid rgba(var(--v-theme-primary), 0.5);
  border-radius: 7px;
  background: rgb(var(--v-theme-surface));
  block-size: 30px;
  gap: 4px;
  min-inline-size: 0;
}

.file-toolbar__path-editor-icon {
  flex-shrink: 0;
  color: rgb(var(--v-theme-primary));
}

.file-toolbar__path-input {
  flex: 1 1 auto;
  border: none;
  background: transparent;
  color: rgb(var(--v-theme-on-surface));
  font-size: 12.5px;
  min-inline-size: 0;
  outline: none;
}

.file-toolbar__inline-btn {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  block-size: 24px;
  color: rgba(var(--v-theme-on-surface), 0.56);
  cursor: pointer;
  inline-size: 24px;
  transition:
    background-color 0.14s ease,
    color 0.14s ease;
}

.file-toolbar__inline-btn:hover {
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgb(var(--v-theme-on-surface));
}

.file-toolbar__inline-btn--primary {
  color: rgb(var(--v-theme-primary));
}

.file-toolbar__inline-btn--primary:hover {
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
}

.file-toolbar__edit-path-btn {
  opacity: 0.72;
}

.file-toolbar__edit-path-btn:hover {
  opacity: 1;
}

.file-toolbar__actions {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
}

.file-toolbar__action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 !important;
  border: 1px solid transparent;
  border-radius: 7px !important;
  background: transparent;
  block-size: 30px !important;
  color: rgba(var(--v-theme-on-surface), 0.68) !important;
  cursor: pointer;
  inline-size: 30px !important;
  min-inline-size: 30px !important;
  transition:
    background-color 0.14s ease,
    border-color 0.14s ease,
    color 0.14s ease;
}

.file-toolbar__action-btn:hover {
  background: rgba(var(--v-theme-on-surface), 0.06) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
}

.file-toolbar__home-btn.is-active {
  border-color: rgba(var(--v-theme-primary), 0.35) !important;
  background: rgba(var(--v-theme-primary), 0.12) !important;
  color: rgb(var(--v-theme-primary)) !important;
}

.file-toolbar__home-btn.has-default {
  color: rgba(var(--v-theme-primary), 0.85) !important;
}

/* ===== 默认打开路径与快捷目录 Popover ===== */
.file-default-menu {
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
  color: rgb(var(--v-theme-on-surface));
  inline-size: min(328px, calc(100vw - 24px));
}

.file-default-menu__section {
  padding: 12px;
}

.file-default-menu__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-block-end: 6px;
}

.file-default-menu__title {
  color: rgba(var(--v-theme-on-surface), 0.68);
  font-size: 12px;
  font-weight: 600;
}

.file-default-menu__storage-tag {
  padding: 1px 6px;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 11px;
  font-weight: 500;
}

.file-default-menu__status {
  padding: 6px 8px;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 7px;
  background: rgba(var(--v-theme-on-surface), 0.025);
  color: rgba(var(--v-theme-on-surface), 0.84);
  font-size: 12px;
  line-height: 1.4;
  margin-block-end: 8px;
  overflow-wrap: anywhere;
  word-break: normal;
}

.file-default-menu__form {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-block-end: 8px;
}

.file-default-menu__input {
  flex: 1 1 auto;
  padding: 0 8px;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 7px;
  background: rgb(var(--v-theme-surface));
  block-size: 30px;
  color: rgb(var(--v-theme-on-surface));
  font-size: 12.5px;
  min-inline-size: 0;
  outline: none;
  transition: border-color 0.14s ease;
}

.file-default-menu__input:focus {
  border-color: rgba(var(--v-theme-primary), 0.65);
}

.file-default-menu__save-btn {
  flex-shrink: 0;
  padding: 0 10px;
  border: 1px solid rgba(var(--v-theme-primary), 0.45);
  border-radius: 7px;
  background: rgb(var(--v-theme-primary));
  block-size: 30px;
  color: rgb(var(--v-theme-on-primary));
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: opacity 0.14s ease;
}

.file-default-menu__save-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.file-default-menu__quick-ops {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.file-default-menu__op-btn {
  display: inline-flex;
  align-items: center;
  padding: 0 9px;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 7px;
  background: transparent;
  block-size: 28px;
  color: rgba(var(--v-theme-on-surface), 0.8);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  gap: 4px;
  transition:
    background-color 0.14s ease,
    border-color 0.14s ease,
    color 0.14s ease;
}

.file-default-menu__op-btn--primary:not(:disabled) {
  border-color: rgba(var(--v-theme-primary), 0.35);
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
}

.file-default-menu__op-btn--primary:not(:disabled):hover {
  background: rgba(var(--v-theme-primary), 0.16);
}

.file-default-menu__op-btn--danger:not(:disabled) {
  border-color: rgba(var(--v-theme-error), 0.3);
  color: rgb(var(--v-theme-error));
}

.file-default-menu__op-btn--danger:not(:disabled):hover {
  background: rgba(var(--v-theme-error), 0.08);
}

.file-default-menu__op-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.file-default-menu__divider {
  background: var(--mp-border-subtle);
  block-size: 1px;
}

.file-default-menu__jump-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-block-size: 220px;
  overflow-y: auto;
}

.file-default-menu__jump-item {
  display: flex;
  align-items: flex-start;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: rgb(var(--v-theme-on-surface));
  cursor: pointer;
  gap: 8px;
  text-align: start;
  transition:
    background-color 0.14s ease,
    border-color 0.14s ease;
}

.file-default-menu__jump-item:hover {
  background: rgba(var(--v-theme-on-surface), 0.05);
}

.file-default-menu__jump-item.is-current {
  border-color: rgba(var(--v-theme-primary), 0.28);
  background: rgba(var(--v-theme-primary), 0.08);
}

.file-default-menu__jump-icon {
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), 0.62);
  margin-block-start: 2px;
}

.file-default-menu__jump-icon.is-primary {
  color: rgb(var(--v-theme-primary));
}

.file-default-menu__jump-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 1px;
  min-inline-size: 0;
}

.file-default-menu__jump-label {
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.3;
}

.file-default-menu__jump-path {
  color: rgba(var(--v-theme-on-surface), 0.56);
  font-size: 11.5px;
  line-height: 1.35;
  overflow-wrap: anywhere;
  word-break: normal;
}

@media (width <= 600px) {
  .file-browser-toolbar {
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    padding: 8px 10px;
    block-size: auto;
    gap: 8px;
  }

  .file-toolbar__left {
    inline-size: 100%;
    gap: 6px;
  }

  .file-toolbar__storage-pill {
    padding: 0 10px !important;
    border-radius: 8px !important;
    background: rgba(var(--v-theme-on-surface), 0.03) !important;
    block-size: 32px !important;
    font-size: 12.5px !important;
  }

  .file-toolbar__breadcrumbs {
    padding-block: 1px;
    -webkit-overflow-scrolling: touch;
  }

  .file-toolbar__crumb {
    padding: 0 8px !important;
    border-radius: 7px !important;
    block-size: 30px !important;
    font-size: 12.5px !important;
    min-inline-size: 30px !important;
  }

  .file-toolbar__path-editor {
    block-size: 32px;
  }

  .file-toolbar__actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-block-start: 6px;
    border-block-start: 1px solid var(--mp-border-subtle);
    inline-size: 100%;
    gap: 6px;
  }

  .file-toolbar__action-btn {
    border: 1px solid var(--mp-border-subtle) !important;
    border-radius: 8px !important;
    background: rgba(var(--v-theme-on-surface), 0.03) !important;
    block-size: 34px !important;
    inline-size: 34px !important;
    min-inline-size: 34px !important;
  }
}
</style>
