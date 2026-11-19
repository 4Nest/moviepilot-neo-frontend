<script lang="ts" setup>
import api from '@/api'
import { ApiResponse, FileItem, StorageConf, TransferDirectoryConf } from '@/api/types'
import FileBrowser from '@/components/filebrowser/FileBrowser.vue'

const endpoints = {
  list: {
    url: '/storage/list?sort={sort}',
    method: 'post',
  },
  mkdir: {
    url: '/storage/mkdir?name={name}',
    method: 'post',
  },
  delete: {
    url: '/storage/delete',
    method: 'post',
  },
  download: {
    url: '/storage/download',
    method: 'post',
  },
  image: {
    url: '/storage/image',
    method: 'post',
  },
  rename: {
    url: '/storage/rename?new_name={newname}',
    method: 'post',
  },
}

// 所有存储
const storages = ref<StorageConf[]>([])
const storageTypes = computed(() => storages.value.map(s => s.type))

// 当前文件项
const operItem = ref<FileItem | undefined>(undefined)

// fileid的堆栈
const itemstack = ref<FileItem[]>([])

// 计算公共路径
function findCommonPath(paths: string[]): string {
  let commonPath
  if (!paths || paths.length === 0) {
    commonPath = '/'
  } else if (paths.length === 1) {
    commonPath = paths[0]
    commonPath = commonPath.replace(/\\/g, '/')
  } else {
    const normalizedPaths = paths.map(path => path.replace(/\\/g, '/'))
    const splitPaths = normalizedPaths.map(path => path.split('/'))
    const commonParts: string[] = []
    for (let i = 0; i < splitPaths[0].length; i++) {
      const part = splitPaths[0][i]
      if (splitPaths.every(pathParts => pathParts[i] === part)) {
        commonParts.push(part)
      } else {
        break
      }
    }
    commonPath = commonParts.join('/')
  }

  if (!commonPath.endsWith('/')) {
    commonPath += '/'
  }

  if (commonPath.includes(':')) {
    commonPath = commonPath.replace('\\', '/')
  }

  return commonPath
}

const STORAGE_KEY = 'fileBrowserView.activeStorage'

interface BrowserInitialParams {
  storage: string
  path: string
  name: string
}

/** 从可用存储和下载目录中选择初始入口，未配置有效目录时回退到存储根路径。 */
function determineBrowserInitialParams(downloadDirectories: TransferDirectoryConf[]): BrowserInitialParams {
  const isAvailable = (storage: string) => storageTypes.value.includes(storage)
  const buckets = downloadDirectories.reduce<Map<string, string[]>>((dict, item) => {
    // filter out directories whose storage is not available
    if (!isAvailable(item.storage)) {
      return dict
    }
    if (item.download_path == undefined) {
      return dict
    }
    if (!dict.has(item.storage)) {
      dict.set(item.storage, [item.download_path])
    } else {
      dict.get(item.storage)!.push(item.download_path)
    }
    return dict
  }, new Map())

  const cachedStorage = localStorage.getItem(STORAGE_KEY) || ''
  // if no download directories are configured, fall back to cached storage or first available storage
  if (buckets.size === 0) {
    return {
      storage: isAvailable(cachedStorage) ? cachedStorage : storageTypes.value[0] || 'local',
      path: '/',
      name: '/',
    }
  }
  let selectedEntry: [string, string[]]
  if (cachedStorage && buckets.has(cachedStorage)) {
    selectedEntry = [cachedStorage, buckets.get(cachedStorage)!]
  } else {
    // if no storage selected previously, use the most populous one
    selectedEntry = Array.from(buckets.entries()).reduce((prev, curr) => {
      return curr[1].length > prev[1].length ? curr : prev
    })
  }

  const path = findCommonPath(selectedEntry[1])
  return {
    storage: selectedEntry[0],
    path,
    name: path.split('/').filter(Boolean).pop() ?? '',
  }
}

/** 按目标路径完整拆解并重建面包屑层级栈，保留同存储下已缓存层级的元数据。 */
function buildItemStack(targetItem: FileItem, previousStack: FileItem[] = []): FileItem[] {
  const sameStorage = previousStack[0]?.storage === targetItem.storage
  const existingByPath = new Map<string, FileItem>()
  if (sameStorage) {
    for (const entry of previousStack) {
      if (entry?.path) existingByPath.set(entry.path, entry)
    }
  }

  const rootDriveId = targetItem.path === '/' ? targetItem.drive_id : existingByPath.get('/')?.drive_id
  const rootEntry: FileItem =
    targetItem.path === '/'
      ? {
          storage: targetItem.storage,
          type: 'dir',
          name: '/',
          path: '/',
          fileid: targetItem.fileid || existingByPath.get('/')?.fileid || 'root',
          ...(rootDriveId ? { drive_id: rootDriveId } : {}),
        }
      : (existingByPath.get('/') ?? {
          storage: targetItem.storage,
          type: 'dir',
          name: '/',
          path: '/',
          fileid: 'root',
        })

  const stack: FileItem[] = [rootEntry]
  if (!targetItem.path || targetItem.path === '/') {
    return stack
  }

  const isFileItem = targetItem.type === 'file'
  const parts = targetItem.path.split('/').filter(Boolean)
  parts.forEach((segmentName, index) => {
    const isLast = index === parts.length - 1
    const segmentPath = '/' + parts.slice(0, index + 1).join('/') + (isLast && isFileItem ? '' : '/')

    if (isLast) {
      stack.push({
        ...(existingByPath.get(segmentPath) ?? {}),
        ...targetItem,
        name: targetItem.name || segmentName,
        path: segmentPath,
        type: isFileItem ? 'file' : 'dir',
      })
      return
    }

    stack.push(
      existingByPath.get(segmentPath) ?? {
        storage: targetItem.storage,
        type: 'dir',
        name: segmentName,
        path: segmentPath,
      },
    )
  })

  return stack
}

// 查询下载目录
async function loadDownloadDirectories() {
  try {
    // fetch available storages
    const storageResult = await api.get<unknown, ApiResponse<{ value?: StorageConf[] | null }>>(
      'system/setting/public/Storages',
    )
    storages.value = storageResult.data?.value ?? []

    const result = await api.get<unknown, ApiResponse<{ value?: TransferDirectoryConf[] | null }>>(
      'system/setting/public/Directories',
    )
    if (result.success) {
      const directories = Array.isArray(result.data?.value) ? result.data.value : []
      const { storage, path, name } = determineBrowserInitialParams(directories)
      const initialItem: FileItem = {
        type: 'dir',
        storage,
        name,
        path,
      }
      itemstack.value = buildItemStack(initialItem)
      operItem.value = initialItem
    }
  } catch (error) {
    console.log(error)
  }
}

// 目录变化
function pathChanged(item: FileItem) {
  if (!item) return
  // save storage to localStorage
  if (item.storage !== operItem.value?.storage) {
    localStorage.setItem(STORAGE_KEY, item.storage)
  }

  const nextStack = buildItemStack(item, itemstack.value)
  itemstack.value = nextStack
  operItem.value = nextStack[nextStack.length - 1]
}

// 加载初始目录
onMounted(loadDownloadDirectories)
</script>

<template>
  <div class="file-browser-view">
    <FileBrowser
      v-if="operItem"
      :storages="storages"
      :tree="false"
      :itemstack="itemstack"
      :endpoints="endpoints"
      :axios="api"
      :item="operItem"
      @pathchanged="pathChanged"
    />
  </div>
</template>

<style lang="scss" scoped>
.file-browser-view {
  position: relative;
  block-size: 100%;
  min-inline-size: 0;
}
</style>
