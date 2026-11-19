<script setup lang="ts">
import api from '@/api'
import { DownloaderConf } from '@/api/types'
import DownloadingListView from '@/views/reorganize/DownloadingListView.vue'
import NoDataFound from '@/components/states/NoDataFound.vue'
import { useI18n } from '@/composables/useChineseText'
import { useDynamicHeaderTab } from '@/composables/useDynamicHeaderTab'
import { useKeepAliveRefresh } from '@/composables/useKeepAliveRefresh'
import { openSharedDialog } from '@/composables/useSharedDialog'

const AddDownloadDialog = defineAsyncComponent(() => import('@/components/dialog/AddDownloadDialog.vue'))
const DownloadHistoryDialog = defineAsyncComponent(() => import('@/components/dialog/DownloadHistoryDialog.vue'))

// 国际化
const { t } = useI18n()

const route = useRoute()
const activeTab = ref<string>((route.query.tab as string) || '')
const isPageActive = ref(true)

onActivated(() => {
  isPageActive.value = true
})

onDeactivated(() => {
  isPageActive.value = false
})

function openDownloadHistoryDialog() {
  openSharedDialog(DownloadHistoryDialog, {}, {}, { closeOn: ['close'] })
}

type DownloadingListViewExpose = { fetchData: () => Promise<void> }
const downloadingListViews = new Map<string, DownloadingListViewExpose>()

function setDownloadingListRef(name: string, instance: unknown) {
  if (instance) downloadingListViews.set(name, instance as DownloadingListViewExpose)
  else downloadingListViews.delete(name)
}

async function refreshCurrentDownloader() {
  await downloadingListViews.get(activeTab.value)?.fetchData()
}

function openAddDownloadDialog() {
  openSharedDialog(
    AddDownloadDialog,
    { downloader: activeTab.value || undefined },
    { done: refreshCurrentDownloader },
    { closeOn: ['close', 'done'] },
  )
}

// 下载器
const downloaders = ref<DownloaderConf[]>([])

// 下载器字典
const downloaderItems = computed(() => {
  return downloaders.value.map(item => ({
    title: item.name,
    tab: item.name,
  }))
})

// 使用动态标签页
const { registerHeaderTab } = useDynamicHeaderTab()
registerHeaderTab({
  items: downloaderItems,
  modelValue: activeTab,
  appendButtons: [
    {
      title: t('downloading.history'),
      label: t('downloading.history'),
      icon: 'mdi-history',
      variant: 'outlined',
      testId: 'downloading-history-btn',
      action: openDownloadHistoryDialog,
      show: computed(() => route.path === '/downloading'),
    },
    {
      title: t('downloading.addTorrent'),
      label: t('downloading.addTorrent'),
      icon: 'mdi-plus',
      color: 'primary',
      variant: 'flat',
      testId: 'downloading-add-btn',
      action: openAddDownloadDialog,
      show: computed(() => route.path === '/downloading'),
    },
  ],
})

// 调用API查询下载器设置
async function loadDownloaderSetting() {
  try {
    downloaders.value = await api.get('download/clients')
    if (downloaders.value && downloaders.value.length > 0 && !activeTab.value)
      activeTab.value = downloaders.value[0].name
  } catch (error) {
    console.log(error)
  }
}

onMounted(async () => {
  await loadDownloaderSetting()
})

useKeepAliveRefresh(async () => {
  await loadDownloaderSetting()
})
</script>

<template>
  <div>
    <div v-if="downloaders.length > 0">
      <VWindow v-model="activeTab" class="disable-tab-transition" :touch="false">
        <VWindowItem v-for="item in downloaders" :key="item.name" :value="item.name">
          <div>
            <DownloadingListView
              :ref="instance => setDownloadingListRef(item.name, instance)"
              :name="item.name"
              :active="isPageActive && activeTab === item.name"
            />
          </div>
        </VWindowItem>
      </VWindow>
    </div>
    <NoDataFound
      v-else
      error-code="404"
      :error-title="t('downloading.noDownloader')"
      :error-description="t('downloading.configureDownloader')"
    />
  </div>
</template>
