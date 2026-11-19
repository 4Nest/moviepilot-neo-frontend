<script lang="ts" setup>
import api from '@/api'
import type { DownloadingInfo } from '@/api/types'
import NoDataFound from '@/components/states/NoDataFound.vue'
import DownloadingCard from '@/components/cards/DownloadingCard.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { useI18n } from '@/composables/useChineseText'
import { useBackground } from '@/composables/useBackground'
import { useKeepAliveRefresh } from '@/composables/useKeepAliveRefresh'

// 国际化
const { t } = useI18n()
const { useConditionalDataRefresh } = useBackground()

// 定义输入参数
const props = defineProps<{
  name: string
  active?: boolean
}>()

// 数据列表
const dataList = ref<DownloadingInfo[]>([])

// 是否刷新过
const isRefreshed = ref(false)

// 获取当前下载器的任务快照
async function fetchData() {
  try {
    dataList.value = await api.get('download/', { params: { name: props.name } })
    isRefreshed.value = true
  } catch (error) {
    console.error(error)
  }
}

// 立即从本地列表剔除已删除任务，释放网格单元并触发后方卡片弹性补位
function removeDownloadItem(hash?: string) {
  if (!hash) return
  dataList.value = dataList.value.filter(item => item.hash !== hash)
}

// 每个下载器独立持有刷新身份，非活动标签不占用轮询资源。
useConditionalDataRefresh(
  `downloading-list-${props.name}`,
  fetchData,
  computed(() => props.active !== false),
  3000, // 3秒间隔
  false, // 初始加载交给 keep-alive 页面自身，避免同时发起两次请求
)

onMounted(fetchData)

useKeepAliveRefresh(fetchData, {
  active: computed(() => props.active !== false),
})

defineExpose({ fetchData })
</script>

<template>
  <LoadingBanner v-if="!isRefreshed" class="mt-10" />
  <div v-if="dataList.length > 0" class="downloading-list-view">
    <ProgressiveCardGrid
      :items="dataList"
      :get-item-key="item => item.hash || item.name"
      :min-item-width="320"
      :gap="14"
      :estimated-item-height="230"
    >
      <template #default="{ item }">
        <DownloadingCard :info="item" :downloader-name="props.name" @remove="removeDownloadItem" />
      </template>
    </ProgressiveCardGrid>
  </div>
  <NoDataFound
    v-if="dataList.length === 0 && isRefreshed"
    error-code="404"
    :error-title="t('downloading.noTask')"
    :error-description="t('downloading.noTaskDescription')"
  />
</template>

<style scoped>
.downloading-list-view {
  min-inline-size: 0;
}

@media (width <= 600px) {
  .downloading-list-view :deep(.progressive-card-grid__track) {
    gap: 10px !important;
  }
}
</style>
