<script lang="ts" setup>
import type { AxiosRequestConfig, AxiosInstance } from 'axios'
import type { ApiResponse, EndPoints, FileItem } from '@/api/types'
import { useToast } from 'vue-toastification'
import { useI18n } from '@/composables/useChineseText'
import { openSharedDialog } from '@/composables/useSharedDialog'

const FileNewFolderDialog = defineAsyncComponent(() => import('../dialog/FileNewFolderDialog.vue'))

const $toast = useToast()
const { t } = useI18n()
const breadcrumbsRef = ref<HTMLElement | null>(null)

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
})

// 对外事件
const emit = defineEmits(['storagechanged', 'pathchanged', 'loading', 'foldercreated', 'sortchanged'])

// 新建文件名称
const newFolderName = ref('')
const creatingFolder = ref(false)
let newFolderDialogController: ReturnType<typeof openSharedDialog> | null = null

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

// 路径变化后将面包屑自动滚到末尾，确保移动端深层目录始终优先露出当前目录。
watch(
  () => inProps.item.path,
  async () => {
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

      <!-- / 分隔面包屑路径胶囊 -->
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
    </div>

    <div class="file-toolbar__actions">
      <IconBtn class="file-toolbar__action-btn" :title="sortLabel" :aria-label="sortLabel" @click="changeSort">
        <VIcon :icon="sortIcon" size="17" />
      </IconBtn>
      <IconBtn
        v-if="pathSegments.length > 0"
        class="file-toolbar__action-btn"
        title="返回上级目录"
        aria-label="返回上级目录"
        @click="goUp"
      >
        <VIcon icon="mdi-arrow-up" size="17" />
      </IconBtn>
      <IconBtn
        v-if="showNewFolderButton"
        class="file-toolbar__action-btn"
        title="新建文件夹"
        aria-label="新建文件夹"
        @click="openNewFolderDialog"
      >
        <VIcon icon="mdi-folder-plus-outline" size="17" />
      </IconBtn>
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
  block-size: 46px;
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
  color: rgba(var(--v-theme-on-surface), 0.34);
  font-size: 13px;
  user-select: none;
}

.file-toolbar__crumb {
  flex-shrink: 0;
  padding: 0 7px !important;
  border-radius: 6px !important;
  block-size: 26px !important;
  color: rgba(var(--v-theme-on-surface), 0.64) !important;
  font-size: 13px !important;
  font-weight: 400 !important;
  letter-spacing: 0 !important;
  min-inline-size: 26px !important;
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
  border-radius: 7px !important;
  block-size: 30px !important;
  color: rgba(var(--v-theme-on-surface), 0.68) !important;
  inline-size: 30px !important;
  min-inline-size: 30px !important;
  transition:
    background-color 0.14s ease,
    color 0.14s ease;
}

.file-toolbar__action-btn:hover {
  background: rgba(var(--v-theme-on-surface), 0.06) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
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
