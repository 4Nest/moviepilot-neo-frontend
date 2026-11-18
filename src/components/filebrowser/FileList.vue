<script lang="ts" setup>
import type { AxiosRequestConfig, AxiosInstance } from 'axios'
import type { PropType } from 'vue'
import { useConfirm } from '@/composables/useConfirm'
import { useToast } from 'vue-toastification'
import { formatBytes } from '@core/utils/formatters'
import type { ApiResponse, Context, EndPoints, FileItem, ManualScrapeOptions } from '@/api/types'
import api from '@/api'
import { useDisplay } from 'vuetify'
import { useI18n } from '@/composables/useChineseText'
import { useBackground } from '@/composables/useBackground'
import { usePWA } from '@/composables/usePWA'
import { useAvailableHeight } from '@/composables/useAvailableHeight'
import { useKeepAliveRefresh, type KeepAliveRefreshContext } from '@/composables/useKeepAliveRefresh'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useRangeSelection } from '@/composables/useRangeSelection'

const FileRenameDialog = defineAsyncComponent(() => import('../dialog/FileRenameDialog.vue'))
const MediaInfoDialog = defineAsyncComponent(() => import('../dialog/MediaInfoDialog.vue'))
const ProgressDialog = defineAsyncComponent(() => import('../dialog/ProgressDialog.vue'))
const ReorganizeDialog = defineAsyncComponent(() => import('../dialog/ReorganizeDialog.vue'))
const ScrapeDialog = defineAsyncComponent(() => import('../dialog/ScrapeDialog.vue'))

// 国际化
const { t } = useI18n()
const { useProgressSSE } = useBackground()

// 显示器宽度
const display = useDisplay()

const { appMode } = usePWA()

// 计算列表可用高度
const { availableHeight: listAvailableHeight } = useAvailableHeight(100, 300)

// 输入参数
const inProps = defineProps({
  icons: Object,
  endpoints: Object as PropType<EndPoints>,
  // Axios 实例是可调用函数，运行时 prop 类型需与其实际形态一致。
  axios: {
    type: Function as PropType<AxiosInstance>,
    required: true,
  },
  refreshpending: Boolean,
  item: {
    type: Object as PropType<FileItem>,
    required: true,
  },
  sort: String,
  showTree: Boolean,
  active: {
    type: Boolean,
    default: true,
  },
})

// 对外事件
const emit = defineEmits([
  'loading',
  'pathchanged',
  'refreshed',
  'filedeleted',
  'renamed',
  'items-updated',
  'switch-tree',
])

// 确认框
const createConfirm = useConfirm()

// 提示框
const $toast = useToast()

// 是否选择模式
const selectMode = ref(false)

// 是否正在加载
const loading = ref(true)

// 重命名loading
const renameLoading = ref(false)

// 下载中loading
const downloading = ref(false)

// 识别进度文本
const progressText = ref(t('common.pleaseWait'))

// 识别进度
const progressValue = ref(0)

// 内容列表
const items = ref<FileItem[]>([])

// 过滤条件
const filter = ref('')

// 是否忽略大小写
const ignoreCase = ref(true)

// 新名称
const newName = ref('')

// 处理目录内所有文件
const renameAll = ref(false)

// 当前操作项
const currentItem = ref<FileItem>()

// 选中的项目
const selected = ref<FileItem[]>([])

// 生成文件项稳定键，用于去重和状态同步。
function getFileItemKey(item?: FileItem) {
  return [item?.storage ?? inProps.item.storage ?? '', item?.type ?? '', item?.path ?? ''].join('|')
}

// 按存储、类型和路径去重文件项。
function dedupeFileItems(fileItems: FileItem[]) {
  const uniqueItems = new Map<string, FileItem>()
  fileItems.forEach(item => {
    uniqueItems.set(getFileItemKey(item), item)
  })

  return Array.from(uniqueItems.values())
}

// 列表刷新后将选中项同步为最新文件对象。
function syncSelectedItems(nextItems: FileItem[] = items.value) {
  if (!selected.value.length) return

  const currentItemMap = new Map(nextItems.map(item => [getFileItemKey(item), item]))
  selected.value = dedupeFileItems(selected.value)
    .map(item => currentItemMap.get(getFileItemKey(item)))
    .filter((item): item is FileItem => !!item)
}

const selectedKeys = computed(() => new Set(selected.value.map(item => getFileItemKey(item))))

// 判断文件项当前是否已选中。
function isSelected(item: FileItem) {
  return selectedKeys.value.has(getFileItemKey(item))
}

// 批量更新文件项选中状态，并按存储、类型和路径去重。
function setItemsSelected(fileItems: readonly FileItem[], checked: boolean) {
  const itemKeys = new Set(fileItems.map(item => getFileItemKey(item)))
  if (checked) {
    const nextItems = new Map(selected.value.map(item => [getFileItemKey(item), item]))
    fileItems.forEach(item => nextItems.set(getFileItemKey(item), item))
    selected.value = [...nextItems.values()]
    return
  }

  selected.value = selected.value.filter(selectedItem => !itemKeys.has(getFileItemKey(selectedItem)))
}

// 识别结果
const nameTestResult = ref<Context>()

let renameDialogController: ReturnType<typeof openSharedDialog> | null = null
let progressDialogController: ReturnType<typeof openSharedDialog> | null = null

// 打开共享进度弹窗并记录控制器，方便 SSE 更新文本和进度值。
function openProgressDialog(text = progressText.value, value = progressValue.value) {
  progressDialogController?.close()
  progressDialogController = openSharedDialog(ProgressDialog, { text, value }, {}, { closeOn: false })
}

// 关闭当前共享进度弹窗。
function closeProgressDialog() {
  progressDialogController?.close()
  progressDialogController = null
}

// 弹出菜单
const dropdownItems = ref<{ [key: string]: any }[]>([])

// 进度是否激活
const progressActive = ref(false)

// 将 glob 模式转换为正则表达式
function globToRegex(pattern: string, flags: string = ''): RegExp {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${regexStr}$`, flags)
}

// 通用过滤
const filteredItems = computed(() => {
  const filterValue = filter.value
  if (!filterValue) {
    return items.value
  }

  // 通配符模式
  if (filterValue.includes('*') || filterValue.includes('?')) {
    const flags = ignoreCase.value ? 'i' : ''
    const regex = globToRegex(filterValue, flags)
    return items.value.filter(item => regex.test(item.name ?? ''))
  }

  // 子字符串模式
  if (ignoreCase.value) {
    const lowerCaseFilter = filterValue.toLowerCase()
    return items.value.filter(item => (item.name ?? '').toLowerCase().includes(lowerCaseFilter))
  } else {
    return items.value.filter(item => (item.name ?? '').includes(filterValue))
  }
})

// 目录过滤
const dirs = computed(() => filteredItems.value.filter(item => item.type === 'dir'))

// 文件过滤
const files = computed(() => filteredItems.value.filter(item => item.type === 'file'))

// 虚拟列表数据，保持引用稳定，避免模板内联展开数组导致虚拟列表重算。
const displayItems = computed(() => [...dirs.value, ...files.value])

// 当前可见列表项是否已全部选中
const isAllDisplayedSelected = computed(
  () => displayItems.value.length > 0 && displayItems.value.every(item => isSelected(item)),
)

function toggleSelectAllDisplayed() {
  if (!displayItems.value.length) return
  setItemsSelected(displayItems.value, !isAllDisplayedSelected.value)
}

// 文件列表按当前目录、文件及筛选后的显示顺序支持 Shift 连选。
const rangeSelection = useRangeSelection<FileItem>({
  items: () => displayItems.value,
  getKey: getFileItemKey,
  isSelected,
  setSelected: setItemsSelected,
})

// 是否文件
const isFile = computed(() => inProps.item.type == 'file')

// 需要整理的文件项
const transferItems = ref<FileItem[]>([])

// 当前图片地址
const currentImgLink = ref('')

let imageRequestSeed = 0
// request seed 决定响应提交和内部 loading 归属；外部 loading 按非静默调用配对，重叠时也分别完成事件收口。
let listLoadingRequestSeed = 0
let listRequestSeed = 0

// 释放当前图片预览使用的临时对象地址。
function revokeCurrentImgLink() {
  if (!currentImgLink.value) return

  URL.revokeObjectURL(currentImgLink.value)
  currentImgLink.value = ''
}

// 是否为图片文件
const isImage = computed(() => {
  const ext = inProps.item.path?.split('.').pop()?.toLowerCase()
  return ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext ?? '')
})

// 调整选择模式
function changeSelectMode() {
  if (selectMode.value) exitSelectMode()
  else selectMode.value = true
}

// 退出多选模式
function exitSelectMode() {
  selectMode.value = false
  selected.value = []
  rangeSelection.reset()
}

// 调API加载文件夹内的内容
async function list_files(context: KeepAliveRefreshContext = {}) {
  const requestSeed = ++listRequestSeed
  const silentRefresh = Boolean(context.silent && items.value.length > 0)

  if (!silentRefresh) {
    listLoadingRequestSeed = requestSeed
    loading.value = true
    emit('loading', true)
  }

  try {
    // 参数
    const url = inProps.endpoints?.list.url.replace(/{sort}/g, inProps.sort || 'name')

    const config: AxiosRequestConfig<FileItem> = {
      url,
      method: inProps.endpoints?.list.method || 'get',
      data: inProps.item,
    }

    // 加载数据
    const data = (await inProps.axios.request<FileItem[], FileItem[]>(config)) ?? []
    if (requestSeed !== listRequestSeed) return

    items.value = data
    syncSelectedItems(data)

    // 通知父组件文件列表更新
    emit('items-updated', items.value)
  } catch (error) {
    console.error(error)
  } finally {
    if (!silentRefresh) {
      emit('loading', false)
      if (requestSeed === listLoadingRequestSeed) loading.value = false
    }
  }
}

// 请求删除文件项，由单项或批量操作分别决定反馈和刷新策略。
async function requestDeleteItem(item: FileItem) {
  const config: AxiosRequestConfig<FileItem> = {
    url: inProps.endpoints?.delete.url,
    method: inProps.endpoints?.delete.method || 'post',
    data: item,
  }
  return inProps.axios.request<ApiResponse<unknown>, ApiResponse<unknown>>(config)
}

// 删除项目
async function deleteItem(item: FileItem, confirm: boolean = true) {
  if (confirm) {
    const confirmed = await createConfirm({
      title: t('common.confirm'),
      content: t('file.confirmFileDelete', {
        type: item.type === 'dir' ? t('file.directory') : t('file.file'),
        name: item.name,
      }),
    })
    if (!confirmed) return
  }

  // 加载中
  emit('loading', true)

  try {
    const result = await requestDeleteItem(item)
    if (!result.success) {
      $toast.error(result.message || t('common.error'))
      return false
    }

    emit('filedeleted')
    await list_files()
    return true
  } catch (error) {
    console.error(error)
    $toast.error(error instanceof Error ? error.message : t('common.error'))
    return false
  } finally {
    emit('loading', false)
  }
}

// 批量删除
async function batchDelete() {
  if (!selected.value.length) return

  const confirmed = await createConfirm({
    title: t('common.confirm'),
    content: t('file.confirmBatchDelete', { count: selected.value.length }),
  })

  if (!confirmed) return

  // 显示进度条
  progressValue.value = 0
  openProgressDialog(progressText.value, progressValue.value)
  emit('loading', true)

  try {
    const selectedItems = dedupeFileItems(selected.value)
    const failedItems: FileItem[] = []

    // 删除选中的项目
    for (const [index, item] of selectedItems.entries()) {
      progressText.value = t('file.deleting', { name: item.name })
      progressValue.value = Math.round(((index + 1) / selectedItems.length) * 100)
      progressDialogController?.updateProps({ text: progressText.value, value: progressValue.value })
      try {
        const result = await requestDeleteItem(item)
        if (!result.success) failedItems.push(item)
      } catch (error) {
        console.error(error)
        failedItems.push(item)
      }
    }

    if (failedItems.length) {
      selected.value = failedItems
      $toast.error(`${t('common.error')}: ${failedItems.map(item => item.name).join(', ')}`)
    } else {
      exitSelectMode()
    }
  } finally {
    // 关闭进度条
    closeProgressDialog()

    // 重新加载
    try {
      await list_files({ silent: true })
    } finally {
      emit('loading', false)
    }
  }
}

// 切换路径
function changePath(item: FileItem) {
  item.path = inProps.item.path + item.name + (item.type === 'dir' ? '/' : '')
  emit('pathchanged', item)
}

// 点击列表项
function listItemClick(item: FileItem, event?: MouseEvent | KeyboardEvent) {
  if (selectMode.value) {
    rangeSelection.select(item, !isSelected(item), !!event?.shiftKey)
    return false
  }
  changePath(item)
}

// 新窗口中下载文件
async function download(item: FileItem) {
  if (downloading.value) return
  downloading.value = true
  emit('loading', true)
  try {
    const url = inProps.endpoints?.download.url
    // 下载文件
    const config: AxiosRequestConfig<FileItem> = {
      url,
      method: inProps.endpoints?.download.method || 'post',
      data: item,
      responseType: 'blob',
    }
    // 加载数据
    const result: Blob = await inProps.axios.request<Blob, Blob>(config)
    if (result) {
      const downloadUrl = URL.createObjectURL(result)
      window.open(downloadUrl, '_blank')
      setTimeout(() => {
        URL.revokeObjectURL(downloadUrl)
      }, 60000)
    }
  } catch (error) {
    console.error(error)
    $toast.error(error instanceof Error ? error.message : t('common.error'))
  } finally {
    downloading.value = false
    emit('loading', false)
  }
}

// 获取图片地址
async function getImgLink(item: FileItem) {
  const requestSeed = ++imageRequestSeed
  const url = inProps.endpoints?.image.url
  // 下载文件
  const config: AxiosRequestConfig<FileItem> = {
    url,
    method: inProps.endpoints?.image.method || 'post',
    data: item,
    responseType: 'blob',
  }
  // 加载二进制数据
  const result: Blob = await inProps.axios.request<Blob, Blob>(config)
  if (result && requestSeed === imageRequestSeed) {
    // 创建图片地址
    revokeCurrentImgLink()
    currentImgLink.value = URL.createObjectURL(result)
  }
}

// 如果当前是图片且是文件，则获取图片地址
watch(
  () => inProps.item,
  async () => {
    imageRequestSeed += 1
    revokeCurrentImgLink()
    if (isImage.value && isFile.value) {
      await getImgLink(inProps.item)
    }
  },
  { immediate: true },
)

// 显示重命名弹窗
function showRenmae(item: FileItem) {
  currentItem.value = item
  newName.value = item.name
  renameAll.value = false
  openRenameDialog()
}

// 打开共享重命名弹窗，并双向同步当前文件名和递归选项。
function openRenameDialog() {
  renameDialogController = openSharedDialog(
    FileRenameDialog,
    {
      item: currentItem.value,
      loading: renameLoading.value,
      name: newName.value,
      recursive: renameAll.value,
    },
    {
      'auto-name': get_recommend_name,
      rename,
      'update:name': (value: string) => {
        newName.value = value
        renameDialogController?.updateProps({ name: value })
      },
      'update:recursive': (value: boolean) => {
        renameAll.value = value
        renameDialogController?.updateProps({ recursive: value })
      },
    },
    { closeOn: ['close'] },
  )
}

// 调用API获取新名称
async function get_recommend_name() {
  renameLoading.value = true
  renameDialogController?.updateProps({ loading: true })
  try {
    const result: { [key: string]: any } = await api.get('transfer/name', {
      params: {
        path: `${inProps.item.path}${currentItem.value?.name}`,
        filetype: currentItem.value?.type ?? 'file',
      },
    })
    if (result.success && result.data) {
      newName.value = result.data.name
    } else {
      $toast.error(result.message)
    }
  } catch (error) {
    console.error(error)
  }
  renameLoading.value = false
  renameDialogController?.updateProps({ loading: false, name: newName.value })
}

// 仅在后端确认成功后关闭编辑弹窗并通知刷新；失败时保留输入以便重试。
async function rename() {
  emit('loading', true)
  const recursive = renameAll.value

  // 显示进度条
  progressValue.value = 0
  if (recursive) {
    progressText.value = t('file.renamingAll', { path: currentItem.value?.path })
  } else {
    progressText.value = t('file.renaming', { name: currentItem.value?.name })
  }
  openProgressDialog(progressText.value, progressValue.value)
  if (recursive) {
    startLoadingProgress()
  }

  try {
    let url = inProps.endpoints?.rename.url.replace(/{newname}/g, encodeURIComponent(newName.value))
    if (recursive) url += '&recursive=true'

    const config: AxiosRequestConfig<FileItem> = {
      url,
      method: inProps.endpoints?.rename.method || 'post',
      data: currentItem.value,
    }
    const result: { [key: string]: any } = await inProps.axios.request<any, { [key: string]: any }>(config)
    if (!result.success) {
      $toast.error(result.message || t('common.error'))
      return
    }

    newName.value = ''
    renameAll.value = false
    renameDialogController?.close()
    renameDialogController = null
    emit('renamed')
  } catch (error) {
    console.error(error)
    $toast.error(error instanceof Error ? error.message : t('common.error'))
  } finally {
    if (recursive) stopLoadingProgress()
    closeProgressDialog()
    emit('loading', false)
  }
}

// 显示整理对话框
function showTransfer(item: FileItem) {
  transferItems.value = [item]
  openTransferDialog()
}

// 显示批量整理对话框
function showBatchTransfer() {
  transferItems.value = dedupeFileItems(selected.value)
  openTransferDialog()
}

// 整理完成
function transferDone() {
  exitSelectMode()
  list_files()
}

// 打开共享文件整理弹窗，整理完成后刷新当前目录。
function openTransferDialog() {
  openSharedDialog(
    ReorganizeDialog,
    {
      items: transferItems.value,
      target_storage: inProps.item.storage,
    },
    {
      done: transferDone,
    },
    { closeOn: ['close', 'done'] },
  )
}

// 将文件修改时间（timestape）转换为本地时间
function formatTime(timestape: number) {
  return new Date(timestape * 1000).toLocaleString()
}

// 切换文件树显示
function switchFileTree(state: boolean) {
  emit('switch-tree', state)
}

// 监听refreshPending变化
watch(
  () => inProps.refreshpending,
  async () => {
    if (inProps.refreshpending) {
      await list_files()
      emit('refreshed')
    }
  },
)

// 监听item变化
watch(
  () => inProps.item,
  async () => {
    // 清空列表
    items.value = []
    selected.value = []
    // 关闭弹窗
    nameTestResult.value = undefined
    // 重置菜单
    dropdownItems.value = [
      {
        title: t('file.recognize'),
        value: 1,
        show: true,
        props: {
          prependIcon: 'mdi-text-recognition',
          click: (_item: FileItem) => {
            recognize(_item.path || '')
          },
        },
      },
      {
        title: t('file.scrape'),
        value: 2,
        show: true,
        props: {
          prependIcon: 'mdi-auto-fix',
          click: (_item: FileItem) => {
            showScrape(_item)
          },
        },
      },
      {
        title: t('file.rename'),
        value: 3,
        show: true,
        props: {
          prependIcon: 'mdi-rename',
          click: showRenmae,
        },
      },
      {
        title: t('file.reorganize'),
        value: 4,
        show: true,
        props: {
          prependIcon: 'mdi-folder-arrow-right',
          click: showTransfer,
        },
      },
      {
        title: t('common.delete'),
        value: 5,
        show: true,
        props: {
          prependIcon: 'mdi-delete-outline',
          color: 'error',
          click: deleteItem,
        },
      },
    ]
    await list_files()
  },
  { immediate: true },
)

// 调用API识别
async function recognize(path: string) {
  try {
    // 显示进度条
    progressText.value = t('file.recognizing', { path })
    progressValue.value = 0
    openProgressDialog(progressText.value, progressValue.value)
    nameTestResult.value = await api.get('media/recognize_file', {
      params: {
        path,
      },
    })
    // 关闭进度条
    closeProgressDialog()
    if (nameTestResult.value?.meta_info?.name) {
      openSharedDialog(MediaInfoDialog, { context: nameTestResult.value }, {}, { closeOn: ['close'] })
    } else {
      $toast.warning(t('nameTest.unrecognized'))
    }
  } catch (error) {
    closeProgressDialog()
    console.error(error)
    $toast.error(error instanceof Error ? error.message : t('file.recognizeFailed', { path }))
  }
}

// 调用 API 按请求级媒体条件刮削单个文件项。
async function scrape(item: FileItem, options: ManualScrapeOptions) {
  try {
    progressText.value = t('file.scraping', { path: item.path })
    progressDialogController?.updateProps({ text: progressText.value })

    const result: { [key: string]: any } = await api.post(`media/scrape/${inProps.item.storage}`, item, {
      params: options,
    })

    if (!result.success) $toast.error(result.message)
    else $toast.success(t('file.scrapeCompleted', { path: item.path }))
  } catch (error) {
    console.error(error)
  }
}

// 按同一媒体条件依次刮削选中的文件项。
async function scrapeItems(itemsToScrape: FileItem[], options: ManualScrapeOptions) {
  const normalizedItems = dedupeFileItems(itemsToScrape)
  if (!normalizedItems.length) return

  progressText.value = t('file.scraping', { path: normalizedItems[0].path })
  progressValue.value = 0
  openProgressDialog(progressText.value, progressValue.value)
  try {
    for (const [index, item] of normalizedItems.entries()) {
      await scrape(item, options)
      progressValue.value = Math.round(((index + 1) / normalizedItems.length) * 100)
      progressDialogController?.updateProps({ value: progressValue.value })
    }
  } finally {
    closeProgressDialog()
    if (selectMode.value) exitSelectMode()
    list_files({ silent: true })
  }
}

// 打开单项手动刮削弹窗。
function showScrape(item: FileItem) {
  openScrapeDialog([item])
}

// 打开批量手动刮削弹窗。
function showBatchScrape() {
  openScrapeDialog(dedupeFileItems(selected.value))
}

// 打开手动刮削弹窗，并将确认结果交给文件列表执行。
function openScrapeDialog(itemsToScrape: FileItem[]) {
  if (!itemsToScrape.length) return
  openSharedDialog(
    ScrapeDialog,
    { items: itemsToScrape },
    {
      scrape: (options: ManualScrapeOptions) => scrapeItems(itemsToScrape, options),
    },
    { closeOn: ['close', 'scrape'] },
  )
}

// 进度SSE消息处理函数
function handleProgressMessage(event: MessageEvent) {
  const progress = JSON.parse(event.data)
  if (progress) {
    progressText.value = progress.text_i18n || progress.text
    progressValue.value = progress.value
    progressDialogController?.updateProps({ text: progressText.value, value: progressValue.value })
  }
}

// 使用进度SSE连接
const progressSSE = useProgressSSE(
  `${import.meta.env.VITE_API_BASE_URL}system/progress/batchrename`,
  handleProgressMessage,
  'file-batch-rename-progress',
  progressActive,
)

// 使用SSE监听加载进度
function startLoadingProgress() {
  progressText.value = t('common.pleaseWait')
  progressActive.value = true
  progressSSE.start()
}

// 停止监听加载进度
function stopLoadingProgress() {
  progressActive.value = false
  progressSSE.stop()
}

useKeepAliveRefresh(list_files, {
  active: computed(() => inProps.active),
})

onUnmounted(() => {
  imageRequestSeed += 1
  listLoadingRequestSeed = ++listRequestSeed
  revokeCurrentImgLink()
  stopLoadingProgress()
  closeProgressDialog()
  renameDialogController?.close()
})
</script>

<template>
  <div class="file-list-host">
    <VCard class="d-flex flex-column w-full h-full file-list">
      <!-- 清爽过滤与操作子工具栏 -->
      <div v-if="!loading" class="file-subtoolbar">
        <div class="file-subtoolbar__left">
          <IconBtn
            v-if="display.mdAndUp.value"
            class="file-subtoolbar__icon-btn"
            :class="{ 'is-active': showTree }"
            :title="showTree ? '隐藏目录树' : '显示目录树'"
            :aria-label="showTree ? '隐藏目录树' : '显示目录树'"
            @click="switchFileTree(!showTree)"
          >
            <VIcon :icon="showTree ? 'mdi-file-tree' : 'mdi-file-tree-outline'" size="17" />
          </IconBtn>

          <VTextField
            v-if="!isFile"
            v-model="filter"
            hide-details
            density="compact"
            variant="outlined"
            clearable
            :placeholder="t('file.filterPlaceholder')"
            :prepend-inner-icon="filter.includes('*') || filter.includes('?') ? 'mdi-asterisk' : 'mdi-magnify'"
            class="file-subtoolbar__filter"
          />

          <button
            v-if="!isFile"
            type="button"
            class="file-case-pill"
            :class="{ 'is-active': !ignoreCase }"
            :title="ignoreCase ? '忽略大小写（点击开启区分大小写）' : '已开启区分大小写'"
            :aria-label="ignoreCase ? '开启区分大小写' : '关闭区分大小写'"
            :aria-pressed="!ignoreCase"
            @click="ignoreCase = !ignoreCase"
          >
            <VIcon icon="mdi-format-letter-case" size="16" />
          </button>
        </div>

        <div class="file-subtoolbar__right">
          <IconBtn
            v-if="isFile"
            class="file-subtoolbar__icon-btn"
            :title="t('file.recognize')"
            :aria-label="t('file.recognize')"
            @click="recognize(inProps.item.path || '')"
          >
            <VIcon size="17">mdi-text-recognition</VIcon>
          </IconBtn>
          <IconBtn
            v-if="isFile && items.length > 0"
            class="file-subtoolbar__icon-btn"
            title="下载文件"
            aria-label="下载文件"
            :loading="downloading"
            :disabled="downloading"
            @click="download(items[0])"
          >
            <VIcon size="17">mdi-download</VIcon>
          </IconBtn>

          <VBtn
            v-if="!isFile && selectMode"
            size="small"
            variant="outlined"
            color="secondary"
            rounded="lg"
            class="file-batch-btn"
            :disabled="displayItems.length === 0"
            @click.stop="toggleSelectAllDisplayed"
          >
            <VIcon
              :icon="isAllDisplayedSelected ? 'mdi-checkbox-blank-outline' : 'mdi-checkbox-multiple-marked-outline'"
              size="15"
              class="me-1"
            />
            {{ isAllDisplayedSelected ? t('common.deselectAll') : t('common.selectAll') }}
          </VBtn>

          <!-- 批量操作按钮组 -->
          <template v-if="selected.length > 0">
            <span class="file-selected-badge">已选 {{ selected.length }} 项</span>
            <VBtn
              size="small"
              variant="outlined"
              color="secondary"
              rounded="lg"
              class="file-batch-btn"
              @click.stop="showBatchScrape"
            >
              <VIcon icon="mdi-auto-fix" size="15" class="me-1" />
              {{ t('file.scrape') }}
            </VBtn>
            <VBtn
              size="small"
              variant="outlined"
              color="secondary"
              rounded="lg"
              class="file-batch-btn"
              @click.stop="showBatchTransfer"
            >
              <VIcon icon="mdi-folder-arrow-right" size="15" class="me-1" />
              {{ t('file.reorganize') }}
            </VBtn>
            <VBtn
              size="small"
              variant="tonal"
              color="error"
              rounded="lg"
              class="file-batch-btn"
              @click.stop="batchDelete"
            >
              <VIcon icon="mdi-delete-outline" size="15" class="me-1" />
              {{ t('common.delete') }}
            </VBtn>
          </template>

          <IconBtn
            v-if="!isFile && !selectMode"
            class="file-subtoolbar__icon-btn"
            title="刷新目录"
            aria-label="刷新目录"
            @click="list_files"
          >
            <VIcon size="17">mdi-refresh</VIcon>
          </IconBtn>
          <IconBtn
            v-if="!isFile"
            class="file-subtoolbar__icon-btn"
            :class="{ 'is-active': selectMode }"
            :title="selectMode ? '退出多选' : '多选模式'"
            :aria-label="selectMode ? '退出多选' : '多选模式'"
            @click="changeSelectMode"
          >
            <VIcon :icon="selectMode ? 'mdi-selection-remove' : 'mdi-select'" size="17" />
          </IconBtn>
        </div>
      </div>

      <LoadingBanner v-if="loading" />
      <!-- 文件详情 -->
      <VCardText v-else-if="isFile && !isImage && items.length > 0" class="text-center break-all py-8">
        <div v-if="items[0]?.thumbnail" class="flex justify-center">
          <VImg max-width="15rem" cover :src="items[0]?.thumbnail" class="rounded-lg border">
            <template #placeholder>
              <VSkeletonLoader class="object-cover w-full h-full" />
            </template>
          </VImg>
        </div>
        <div class="text-subtitle-1 font-weight-semibold text-high-emphasis mt-3">{{ items[0]?.name }}</div>
        <p class="text-body-2 text-medium-emphasis mt-2" v-if="items[0]?.size && items[0].modify_time">
          {{ t('file.size') }}：{{ formatBytes(items[0]?.size || 0) }}<br />
          {{ t('file.modifyTime') }}：{{ formatTime(items[0]?.modify_time || 0) }}
        </p>
      </VCardText>
      <!-- 图片 -->
      <VCardText v-else-if="isFile && isImage && items.length > 0" class="grow d-flex justify-center align-center">
        <VImg :src="currentImgLink" max-width="100%" max-height="100%" />
      </VCardText>
      <!-- 目录和文件列表 -->
      <VCardText v-else-if="dirs.length || files.length" class="p-0 flex-grow-1 overflow-hidden">
        <VList
          class="text-high-emphasis file-list-container py-1"
          :style="{ height: `${listAvailableHeight}px`, maxHeight: `${listAvailableHeight}px` }"
        >
          <VVirtualScroll :items="displayItems" :item-height="42" style="block-size: 100%">
            <template #default="{ item }">
              <VHover>
                <template #default="hover">
                  <VListItem
                    v-bind="hover.props"
                    class="file-list-row"
                    :class="{ 'file-list-row--selected': selectMode && isSelected(item) }"
                    @click="listItemClick(item, $event)"
                    @mousedown.shift.prevent
                  >
                    <template #prepend>
                      <VListItemAction v-if="selectMode" class="me-2">
                        <VCheckbox
                          density="compact"
                          hide-details
                          :model-value="isSelected(item)"
                          @update:model-value="rangeSelection.selectFromCheckbox(item, !!$event)"
                          @click.stop="rangeSelection.onCheckboxClick"
                          @input="rangeSelection.onCheckboxInput(item, $event)"
                        />
                      </VListItemAction>
                      <span v-else class="file-item-icon" :class="{ 'file-item-icon--dir': item.type === 'dir' }">
                        <VIcon
                          v-if="inProps.icons && item.extension"
                          size="19"
                          :icon="inProps.icons[item.extension.toLowerCase()] || inProps.icons?.other"
                        />
                        <VIcon v-else-if="item.type == 'dir'" size="19" icon="mdi-folder" />
                        <VIcon v-else size="19" icon="mdi-file-outline" />
                      </span>
                    </template>
                    <VListItemTitle class="file-item-title" :title="item.name" v-text="item.name" />
                    <VListItemSubtitle v-if="item.size" class="file-item-size">
                      {{ formatBytes(item.size) }}
                    </VListItemSubtitle>
                    <template #append>
                      <IconBtn v-if="display.smAndDown.value && !selectMode" class="file-row-action-btn">
                        <VIcon icon="mdi-dots-vertical" size="18" />
                        <VMenu activator="parent" close-on-content-click>
                          <VList density="compact">
                            <template v-for="(menu, i) in dropdownItems" :key="i">
                              <VListItem
                                v-if="menu.show"
                                :base-color="menu.props.color"
                                @click="menu.props.click(item)"
                              >
                                <template #prepend>
                                  <VIcon :icon="menu.props.prependIcon" size="17" />
                                </template>
                                <VListItemTitle v-text="menu.title" />
                              </VListItem>
                            </template>
                          </VList>
                        </VMenu>
                      </IconBtn>
                      <span v-if="hover.isHovering && display.mdAndUp.value && !selectMode" class="file-row-actions">
                        <IconBtn
                          class="file-row-action-btn"
                          :title="t('file.recognize')"
                          @click.stop="recognize(item.path || '')"
                        >
                          <VIcon icon="mdi-text-recognition" size="16" />
                        </IconBtn>
                        <IconBtn class="file-row-action-btn" :title="t('file.scrape')" @click.stop="showScrape(item)">
                          <VIcon icon="mdi-auto-fix" size="16" />
                        </IconBtn>
                        <IconBtn class="file-row-action-btn" :title="t('file.rename')" @click.stop="showRenmae(item)">
                          <VIcon icon="mdi-rename" size="16" />
                        </IconBtn>
                        <IconBtn
                          class="file-row-action-btn"
                          :title="t('file.reorganize')"
                          @click.stop="showTransfer(item)"
                        >
                          <VIcon icon="mdi-folder-arrow-right" size="16" />
                        </IconBtn>
                        <IconBtn
                          class="file-row-action-btn file-row-action-btn--danger"
                          :title="t('common.delete')"
                          @click.stop="deleteItem(item)"
                        >
                          <VIcon icon="mdi-delete-outline" size="16" />
                        </IconBtn>
                      </span>
                    </template>
                  </VListItem>
                </template>
              </VHover>
            </template>
          </VVirtualScroll>
        </VList>
      </VCardText>
      <VCardText v-else-if="filter" class="file-list-empty">
        <VIcon icon="mdi-file-search-outline" size="32" class="file-list-empty__icon" />
        <span>{{ t('file.noFiles') }}</span>
      </VCardText>
      <VCardText v-else-if="!loading" class="file-list-empty">
        <VIcon icon="mdi-folder-open-outline" size="32" class="file-list-empty__icon" />
        <span>{{ t('file.emptyDirectory') }}</span>
      </VCardText>
    </VCard>
  </div>
</template>

<style scoped>
.file-list-host {
  min-inline-size: 0;
}

.file-list {
  border-radius: 0 !important;
  background: rgb(var(--v-theme-surface)) !important;
  box-shadow: none !important;
}

/* ===== 44px 清爽过滤与操作子工具栏 ===== */
.file-subtoolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-block-end: 1px solid var(--mp-border-subtle);
  gap: 8px;
  min-block-size: 44px;
}

.file-subtoolbar__left {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 6px;
  min-inline-size: 0;
}

.file-subtoolbar__right {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.file-subtoolbar__icon-btn {
  display: inline-flex;
  flex-shrink: 0;
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

.file-subtoolbar__icon-btn:hover {
  background: rgba(var(--v-theme-on-surface), 0.06) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
}

.file-subtoolbar__icon-btn.is-active {
  background: var(--mp-nav-pill-active-bg, rgba(var(--v-theme-on-surface), 0.08)) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
}

.file-subtoolbar__filter {
  flex: 1 1 200px;
  max-inline-size: 280px;
}

.file-subtoolbar__filter :deep(.v-field) {
  border-radius: 8px;
  font-size: 13px;
  min-block-size: 30px !important;
  padding-inline: 8px;
}

.file-subtoolbar__filter :deep(.v-field__input) {
  min-block-size: 30px !important;
  padding-block: 0 !important;
}

.file-subtoolbar__filter :deep(.v-field__prepend-inner),
.file-subtoolbar__filter :deep(.v-field__clearable) {
  align-items: center;
  padding-block-start: 0 !important;
}

.file-case-pill {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 7px;
  background: transparent;
  block-size: 30px;
  color: rgba(var(--v-theme-on-surface), 0.56);
  cursor: pointer;
  inline-size: 30px;
  transition:
    background-color 0.14s ease,
    border-color 0.14s ease,
    color 0.14s ease;
}

.file-case-pill:hover {
  border-color: var(--mp-border-hover);
  background: rgba(var(--v-theme-on-surface), 0.05);
  color: rgb(var(--v-theme-on-surface));
}

.file-case-pill.is-active {
  border-color: rgba(var(--v-theme-primary), 0.35);
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
}

.file-selected-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 6px;
  background: var(--mp-item-bg, rgba(var(--v-theme-on-surface), 0.04));
  color: rgba(var(--v-theme-on-surface), 0.78);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
}

.file-batch-btn {
  block-size: 28px !important;
  font-size: 12.5px !important;
  padding-inline: 10px !important;
}

/* ===== 40px IDE 文件行 ===== */
.file-list-container {
  overflow: hidden auto;
  border-radius: 0 !important;
  background: transparent !important;
  block-size: 100%;
  max-block-size: 100%;
}

.file-list-row {
  border-radius: 6px !important;
  block-size: 40px !important;
  margin-block: 1px !important;
  margin-inline: 6px !important;
  min-block-size: 40px !important;
  padding-inline: 10px 8px !important;
  transition: background-color 0.12s ease;
}

.file-list-row:hover {
  background: rgba(var(--v-theme-on-surface), 0.045) !important;
}

.file-list-row--selected {
  background: rgba(var(--v-theme-primary), 0.08) !important;
}

.file-list-row :deep(.v-list-item__content) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-inline-size: 0;
}

.file-item-icon {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  color: rgba(var(--v-theme-on-surface), 0.62);
  margin-inline-end: 10px;
}

.file-item-icon--dir {
  color: rgba(var(--v-theme-warning), 0.85);
}

.file-item-title {
  flex: 1 1 auto;
  color: rgb(var(--v-theme-on-surface));
  font-size: 13.5px !important;
  font-weight: 450;
  line-height: 1.4 !important;
  min-inline-size: 0;
}

.file-item-size {
  flex-shrink: 0;
  margin: 0 !important;
  color: rgba(var(--v-theme-on-surface), 0.5) !important;
  font-size: 12px !important;
  font-variant-numeric: tabular-nums;
  opacity: 1 !important;
}

.file-row-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-inline-start: 8px;
}

.file-row-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 !important;
  border-radius: 6px !important;
  block-size: 26px !important;
  color: rgba(var(--v-theme-on-surface), 0.64) !important;
  inline-size: 26px !important;
  min-inline-size: 26px !important;
}

.file-row-action-btn:hover {
  background: rgba(var(--v-theme-on-surface), 0.08) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
}

.file-row-action-btn--danger:hover {
  background: rgba(var(--v-theme-error), 0.12) !important;
  color: rgb(var(--v-theme-error)) !important;
}

/* ===== 空目录与无过滤匹配提示 ===== */
.file-list-empty {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px !important;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 13.5px;
  gap: 10px;
  min-block-size: 240px;
}

.file-list-empty__icon {
  color: rgba(var(--v-theme-on-surface), 0.34);
}
</style>
