<script lang="ts" setup>
import api from '@/api'
import type { SubscribeShare } from '@/api/types'
import NoDataFound from '@/components/states/NoDataFound.vue'
import SubscribeShareCard from '@/components/cards/SubscribeShareCard.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

// 国际化
const { t } = useI18n()
const $toast = useToast()

// 定义输入参数
const props = defineProps({
  // 过滤关键字
  keyword: String,
})

// 判断是否有滚动条
function hasScroll() {
  return document.body.scrollHeight - (window.innerHeight || document.documentElement.clientHeight) > 2
}

// API
const apipath = 'subscribe/shares'

// 当前页码
const page = ref(1)

// 搜索关键字
const keyword = ref(props.keyword)

// 当前Key（用于重新加载数据）
const currentKey = ref(0)

function resetData() {
  requestGeneration++
  dataList.value = []
  page.value = 1
  isRefreshed.value = false
  loadError.value = false
  currentKey.value++
}

// 监听 props.keyword 变化
watch(
  () => props.keyword,
  newKeyword => {
    keyword.value = newKeyword || ''
    resetData()
  },
)

// 是否加载完成
const isRefreshed = ref(false)

// 当前列表请求是否失败；合法空数组仍使用空数据状态。
const loadError = ref(false)

// 数据列表
const dataList = ref<SubscribeShare[]>([])

// 批量管理模式
const isBatchMode = ref(false)

// 批量选择中的分享 ID 集合
const selectedShareIds = ref<Set<number>>(new Set())

// 搜索或筛选重置允许新旧请求短暂并行，只接纳当前代次的响应。
let requestGeneration = 0
const loadingGenerations = new Set<number>()

// 拼装参数
function getParams() {
  return {
    page: page.value,
    count: 30,
    name: keyword.value,
  }
}

// 获取列表数据
async function fetchData({ done }: { done: (status: 'empty' | 'error' | 'ok') => void }) {
  const generation = requestGeneration

  // 同一搜索条件只允许一个分页请求在途。
  if (loadingGenerations.has(generation)) {
    return
  }

  loadingGenerations.add(generation)
  loadError.value = false

  try {
    while (generation === requestGeneration) {
      const currentData: SubscribeShare[] = await api.get(apipath, {
        params: getParams(),
      })

      if (generation !== requestGeneration) return

      isRefreshed.value = true
      if (currentData.length === 0) {
        done('empty')
        return
      }

      dataList.value = [...dataList.value, ...currentData]
      page.value++
      done('ok')
      await nextTick()

      if (hasScroll()) return
    }
  } catch (error) {
    if (generation !== requestGeneration) return

    console.error(error)
    isRefreshed.value = true
    loadError.value = true
    done('error')
  } finally {
    loadingGenerations.delete(generation)
  }
}

// 将数据从列表中移除
function removeData(id: number) {
  dataList.value = dataList.value.filter(item => item.id !== id)
  selectedShareIds.value.delete(id)
}

// 切换批量管理模式
function toggleBatchMode() {
  isBatchMode.value = !isBatchMode.value
  if (!isBatchMode.value) selectedShareIds.value.clear()
}

// 切换单个分享选中状态
function toggleSelectShare(id: number) {
  if (selectedShareIds.value.has(id)) selectedShareIds.value.delete(id)
  else selectedShareIds.value.add(id)
}

// 批量删除选中分享
async function batchDelete() {
  const ids = [...selectedShareIds.value]
  if (ids.length === 0) return

  const failedIds: number[] = []
  for (const id of ids) {
    try {
      await api.delete(`subscribe/share/${id}`)
      removeData(id)
    } catch {
      failedIds.push(id)
    }
  }

  if (failedIds.length > 0) {
    selectedShareIds.value = new Set(failedIds)
    $toast.error(t('subscribe.batchDeleteFailed', { count: failedIds.length }))
  } else {
    selectedShareIds.value.clear()
    isBatchMode.value = false
    $toast.success(t('subscribe.batchDeleteSuccess', { count: ids.length }))
  }
}
</script>

<template>
  <!-- 批量管理工具栏 -->
  <div class="px-3 mb-4">
    <div class="d-flex justify-end align-center gap-2">
      <!-- 批量操作工具（批量模式下显示） -->
      <template v-if="isBatchMode">
        <VBtn
          color="error"
          variant="flat"
          size="small"
          :disabled="selectedShareIds.size === 0"
          @click="batchDelete"
        >
          <template #prepend>
            <VIcon icon="mdi-delete-outline" />
          </template>
          {{ t('common.delete') }}
        </VBtn>
      </template>
      <!-- 批量管理切换按钮 -->
      <VBtn
        v-if="dataList.length > 0"
        :color="isBatchMode ? 'primary' : undefined"
        :variant="isBatchMode ? 'flat' : 'tonal'"
        size="small"
        @click="toggleBatchMode"
      >
        <template #prepend>
          <VIcon :icon="isBatchMode ? 'mdi-close' : 'mdi-checkbox-multiple-marked-outline'" />
        </template>
        {{ isBatchMode ? t('subscribe.exitBatchMode') : t('subscribe.batchManage') }}
      </VBtn>
    </div>
  </div>

  <VPageContentTitle v-if="keyword" :title="`${t('common.search')}：${keyword}`" />
  <LoadingBanner v-if="!isRefreshed" class="mt-12" />
  <VInfiniteScroll
    mode="intersect"
    side="end"
    :items="dataList"
    :margin="dataList.length > 0 ? 480 : 0"
    class="overflow-visible px-2"
    @load="fetchData"
    :key="currentKey"
  >
    <template #loading />
    <template #error="{ props: retryProps }">
      <div class="d-flex flex-column align-center ga-2 py-4" role="alert">
        <span class="text-medium-emphasis">{{ t('subscribe.requestFailed') }}</span>
        <VBtn v-bind="retryProps" prepend-icon="mdi-refresh" size="small" variant="tonal">
          {{ t('common.retry') }}
        </VBtn>
      </div>
    </template>
    <template #empty />
    <ProgressiveCardGrid
      v-if="dataList.length > 0"
      :items="dataList"
      :get-item-key="
        item =>
          item.id ||
          `${item.media_id || item.tmdbid || item.doubanid || item.bangumiid || item.anilistid || item.name}-${item.share_user}`
      "
      :min-item-width="240"
      :estimated-item-height="260"
      tabindex="0"
    >
      <template #default="{ item }">
        <SubscribeShareCard
          :media="item"
          :batch-mode="isBatchMode"
          :selected="selectedShareIds.has(item.id || 0)"
          @delete="removeData(item.id || 0)"
          @toggle-select="toggleSelectShare(item.id || 0)"
        />
      </template>
    </ProgressiveCardGrid>
    <NoDataFound
      v-if="dataList.length === 0 && isRefreshed && !loadError"
      error-code="404"
      :error-title="t('common.noData')"
      :error-description="keyword ? t('common.noContent') : t('subscribe.noShareData')"
    />
  </VInfiniteScroll>

</template>

