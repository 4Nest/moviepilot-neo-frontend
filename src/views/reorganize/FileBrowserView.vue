<script lang="ts" setup>
import api from '@/api'
import { ApiResponse, FileItem, StorageConf, TransferDirectoryConf } from '@/api/types'
import FileBrowser from '@/components/filebrowser/FileBrowser.vue'
import { getPathDisplayName, normalizeDirectoryPath, type QuickDirectoryItem } from '@/components/filebrowser/types'
import { useToast } from 'vue-toastification'

const $toast = useToast()

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

const STORAGE_KEY = 'fileBrowserView.activeStorage'
const DEFAULT_PATHS_STORAGE_KEY = 'MP_FILE_MANAGER_DEFAULT_PATHS'
const DEFAULT_PATHS_CONFIG_URL = '/user/config/FileManagerDefaultPaths'

// 所有存储
const storages = ref<StorageConf[]>([])
const storageTypes = computed(() => storages.value.map(s => s.type))

// 已配置的目录列表
const directories = ref<TransferDirectoryConf[]>([])

// 各存储默认打开路径配置（服务端权威 + 本地缓存预热兜底）
const defaultPaths = ref<Record<string, string>>({})
const savingDefaultPath = ref(false)

// 当前文件项
const operItem = ref<FileItem | undefined>(undefined)

// fileid的堆栈
const itemstack = ref<FileItem[]>([])

/** 校验并规范化默认打开路径映射表 */
function parseDefaultPathsRecord(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const result: Record<string, string> = {}
  for (const [storage, rawPath] of Object.entries(raw as Record<string, unknown>)) {
    const storageKey = storage.trim()
    if (!storageKey || typeof rawPath !== 'string') continue
    const normalized = normalizeDirectoryPath(rawPath)
    if (normalized) {
      result[storageKey] = normalized
    }
  }
  return result
}

/** 从本地缓存同步读取默认打开路径，用于首屏预热与远端失败兜底 */
function readLocalDefaultPaths(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DEFAULT_PATHS_STORAGE_KEY)
    if (!raw) return {}
    return parseDefaultPathsRecord(JSON.parse(raw))
  } catch {
    return {}
  }
}

/** 回写默认打开路径至本地缓存 */
function writeLocalDefaultPaths(paths: Record<string, string>) {
  try {
    localStorage.setItem(DEFAULT_PATHS_STORAGE_KEY, JSON.stringify(paths))
  } catch {
    // 忽略隐私模式或存储配额异常
  }
}

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

interface BrowserInitialParams {
  storage: string
  path: string
  name: string
}

/** 收集指定存储下已配置的下载/媒体库目录路径，用于切存储时计算公共入口 */
function collectStorageConfiguredPaths(storage: string, allDirectories: TransferDirectoryConf[]): string[] {
  const downloadPaths = allDirectories
    .filter(item => item.storage === storage && Boolean(item.download_path?.trim()))
    .map(item => item.download_path!.trim())
  if (downloadPaths.length > 0) return downloadPaths

  return allDirectories
    .filter(item => (item.library_storage || item.storage) === storage && Boolean(item.library_path?.trim()))
    .map(item => item.library_path!.trim())
}

/** 计算指定存储的目标入口路径：默认打开路径 → 已配置目录公共路径 → 根目录 */
function resolveStorageEntryPath(storage: string, allDirectories: TransferDirectoryConf[] = directories.value): string {
  const customDefaultPath = defaultPaths.value[storage]
  if (customDefaultPath) return customDefaultPath

  const configuredPaths = collectStorageConfiguredPaths(storage, allDirectories)
  if (configuredPaths.length > 0) {
    return findCommonPath(configuredPaths)
  }

  return '/'
}

/** 从可用存储、默认打开路径和下载目录中选择初始入口，未配置有效目录时回退到存储根路径。 */
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

  // 若上次访问的存储可用且已显式配置默认打开路径，优先进入该存储
  if (cachedStorage && isAvailable(cachedStorage) && defaultPaths.value[cachedStorage]) {
    const path = defaultPaths.value[cachedStorage]
    return {
      storage: cachedStorage,
      path,
      name: getPathDisplayName(path),
    }
  }

  // if no download directories are configured, fall back to cached storage or first available storage
  if (buckets.size === 0) {
    const fallbackStorage = isAvailable(cachedStorage) ? cachedStorage : storageTypes.value[0] || 'local'
    const path = defaultPaths.value[fallbackStorage] || '/'
    return {
      storage: fallbackStorage,
      path,
      name: getPathDisplayName(path),
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

  const selectedStorage = selectedEntry[0]
  const path = defaultPaths.value[selectedStorage] || findCommonPath(selectedEntry[1])
  return {
    storage: selectedStorage,
    path,
    name: getPathDisplayName(path),
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

/** 提取当前存储已配置的快捷目录（下载目录与媒体库目录按规范化路径去重） */
const currentQuickDirectories = computed<QuickDirectoryItem[]>(() => {
  const activeStorage = operItem.value?.storage
  if (!activeStorage) return []

  const seenPaths = new Set<string>(['/'])
  const quickList: QuickDirectoryItem[] = []

  const appendItem = (rawPath: string | undefined, name: string, kind: 'download' | 'library') => {
    if (!rawPath) return
    const normalized = normalizeDirectoryPath(rawPath)
    if (!normalized || seenPaths.has(normalized)) return
    seenPaths.add(normalized)
    quickList.push({
      kind,
      name,
      path: normalized,
    })
  }

  for (const dir of directories.value) {
    if (dir.storage === activeStorage && dir.download_path) {
      appendItem(dir.download_path, dir.name?.trim() || '下载目录', 'download')
    }
    const libStorage: string = dir.library_storage || dir.storage
    if (libStorage === activeStorage && dir.library_path) {
      const baseName = dir.name?.trim()
      appendItem(dir.library_path, baseName ? `${baseName}（媒体库）` : '媒体库目录', 'library')
    }
  }

  return quickList
})

/** 当前存储已配置的默认打开路径 */
const currentDefaultPath = computed(() => {
  const activeStorage = operItem.value?.storage
  if (!activeStorage) return ''
  return defaultPaths.value[activeStorage] ?? ''
})

// 查询存储、目录与默认打开路径配置
async function loadDownloadDirectories() {
  // 先用本地缓存预热，服务端返回有效配置后再权威覆盖
  defaultPaths.value = readLocalDefaultPaths()

  try {
    const [storageResult, directoryResult, defaultPathsResult] = await Promise.all([
      api.get<unknown, ApiResponse<{ value?: StorageConf[] | null }>>('system/setting/public/Storages'),
      api.get<unknown, ApiResponse<{ value?: TransferDirectoryConf[] | null }>>('system/setting/public/Directories'),
      Promise.resolve()
        .then(() => api.get<unknown, ApiResponse<{ value?: Record<string, string> | null }>>(DEFAULT_PATHS_CONFIG_URL))
        .catch(() => null),
    ])

    storages.value = storageResult.data?.value ?? []

    if (
      defaultPathsResult?.success &&
      defaultPathsResult.data &&
      defaultPathsResult.data.value !== null &&
      defaultPathsResult.data.value !== undefined &&
      typeof defaultPathsResult.data.value === 'object' &&
      !Array.isArray(defaultPathsResult.data.value)
    ) {
      const remotePaths = parseDefaultPathsRecord(defaultPathsResult.data.value)
      defaultPaths.value = remotePaths
      writeLocalDefaultPaths(remotePaths)
    }

    if (directoryResult.success) {
      const loadedDirectories = Array.isArray(directoryResult.data?.value) ? directoryResult.data.value : []
      directories.value = loadedDirectories
      const { storage, path, name } = determineBrowserInitialParams(loadedDirectories)
      const initialItem: FileItem = {
        type: 'dir',
        storage,
        name,
        path,
        ...(path === '/' ? { fileid: 'root' } : {}),
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

// 存储切换：优先跳到目标存储的默认打开路径，再回退已配置目录公共路径，最后回退根目录
function storageChanged(storage: string) {
  if (!storage) return
  const targetPath = resolveStorageEntryPath(storage)
  pathChanged({
    storage,
    type: 'dir',
    name: getPathDisplayName(targetPath),
    path: targetPath,
    ...(targetPath === '/' ? { fileid: 'root' } : {}),
  })
}

// 保存或清除当前存储的默认打开路径（空字符串表示清除）
async function saveDefaultPath(rawPath: string) {
  const activeStorage = operItem.value?.storage
  if (!activeStorage || savingDefaultPath.value) return

  const normalized = normalizeDirectoryPath(rawPath)
  const nextPaths: Record<string, string> = { ...defaultPaths.value }
  if (normalized) {
    nextPaths[activeStorage] = normalized
  } else {
    delete nextPaths[activeStorage]
  }

  savingDefaultPath.value = true
  try {
    const result = await api.post<unknown, ApiResponse<unknown>>(DEFAULT_PATHS_CONFIG_URL, nextPaths)
    if (!result?.success) {
      $toast.error(result?.message || '保存默认打开路径失败')
      return
    }

    defaultPaths.value = nextPaths
    writeLocalDefaultPaths(nextPaths)
    $toast.success(normalized ? '已保存默认打开路径' : '已清除默认打开路径')
  } catch (error) {
    $toast.error(error instanceof Error ? error.message : '保存默认打开路径失败')
  } finally {
    savingDefaultPath.value = false
  }
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
      :default-path="currentDefaultPath"
      :quick-directories="currentQuickDirectories"
      :saving-default-path="savingDefaultPath"
      @pathchanged="pathChanged"
      @storagechanged="storageChanged"
      @save-default-path="saveDefaultPath"
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
