<script lang="ts" setup>
import api from '@/api'
import { Subscribe } from '@/api/types'
import { useGlobalSettingsStore } from '@/stores'
import { getDisplayImageUrl } from '@/utils/imageUtils'
import { formatDateDifference } from '@core/utils/formatters'
import noImage from '@images/no-image.jpeg'
import { useDisplay } from 'vuetify'
import ProgressDialog from './ProgressDialog.vue'
import { useI18n } from '@/composables/useChineseText'
import { mediaTypeDict } from '@/api/constants'
import { useToast } from 'vue-toastification'

// 国际化
const { t } = useI18n()

const $toast = useToast()
const globalSettingsStore = useGlobalSettingsStore()

// 显示器宽度
const display = useDisplay()

// 输入参数
const props = defineProps({
  type: String,
})

// 定义触发的自定义事件
const emit = defineEmits(['close', 'save'])

// 订阅历史列表
const historyList = ref<Subscribe[]>([])

// 当前加载数据
const currData = ref<Subscribe[]>([])

// 当前页
const currentPage = ref(1)

// 每页数量
const pageSize = ref(30)

// 是否加载中
const loading = ref(false)

// 是否加载完成
const isRefreshed = ref(false)

// 进度框
const progressDialog = ref(false)

// 进度文字
const progressText = ref('')

// 调用API查询列表
async function loadHistory({ done }: { done: any }) {
  // 如果正在加载中，直接返回
  if (loading.value) {
    done('ok')
    return
  }

  // 调用API查询列表
  try {
    // 设置加载中
    loading.value = true
    currData.value = await api.get(`subscribe/history/${props.type}`, {
      params: {
        page: currentPage.value,
        count: pageSize.value,
      },
    })
    // 标计为已请求完成
    isRefreshed.value = true
    if (currData.value.length === 0) {
      // 如果没有数据，跳出
      done('empty')
    } else {
      // 合并数据
      historyList.value = [...historyList.value, ...currData.value]
      // 页码+1
      currentPage.value++
      // 返回加载成功
      done('ok')
    }
  } catch (e) {
    console.error(e)
    // 返回加载失败
    done('error')
  } finally {
    loading.value = false
  }
}

// 重新订阅
async function reSubscribe(item: Subscribe) {
  if (item.type === '电影') {
    progressText.value = t('dialog.subscribeHistory.resubscribeMovie', { name: item.name })
  } else {
    progressText.value = t('dialog.subscribeHistory.resubscribeTv', { name: item.name, season: item.season })
  }
  progressDialog.value = true
  try {
    const result: { [key: string]: any } = await api.post('subscribe/', item)
    if (result.success && result.data?.pending_approval) {
      $toast.info(result.message || '已提交订阅审批，等待管理员审核')
      emit('save')
    } else if (result.success) {
      emit('save')
    } else {
      $toast.error(t('subscribe.requestFailed'))
    }
  } catch (e) {
    console.error(e)
    $toast.error(t('subscribe.requestFailed'))
  }
  progressDialog.value = false
}

// 删除记录
async function deleteHistory(item: Subscribe) {
  try {
    const result: { [key: string]: any } = await api.delete(`subscribe/history/${item.id}`)
    if (result.success) {
      historyList.value = historyList.value.filter(i => i.id !== item.id)
    }
  } catch (e) {
    console.error(e)
    $toast.error(t('subscribe.requestFailed'))
  }
}

// 弹出菜单
const dropdownItems = ref([
  {
    title: t('dialog.subscribeHistory.resubscribe'),
    value: 1,
    color: '',
    props: {
      prependIcon: 'mdi-redo',
      click: reSubscribe,
    },
  },
  {
    title: t('common.delete'),
    value: 2,
    color: 'error',
    props: {
      prependIcon: 'mdi-delete',
      click: deleteHistory,
    },
  },
])

// 获取媒体类型文本
function getMediaTypeText(type: string | undefined) {
  if (!type) return ''
  return mediaTypeDict[type]
}

// 获取订阅历史海报地址，缺失时回退默认占位图
function getHistoryPoster(item: Subscribe) {
  if (!item.poster) return noImage
  return getDisplayImageUrl(item.poster, globalSettingsStore.globalSettings.GLOBAL_IMAGE_CACHE)
}
</script>

<template>
  <VDialog
    scrollable
    max-width="50rem"
    :height="display.mdAndUp.value ? '42rem' : undefined"
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard class="subscribe-history-dialog mx-auto d-flex flex-column" width="100%">
      <VCardItem class="flex-none">
        <VCardTitle>{{ t('dialog.subscribeHistory.title', { type: getMediaTypeText(props.type) }) }}</VCardTitle>
      </VCardItem>
      <VDivider class="flex-none" />
      <VDialogCloseBtn @click="emit('close')" />
      <VInfiniteScroll
        v-if="!isRefreshed || historyList.length > 0"
        mode="intersect"
        side="end"
        :items="historyList"
        class="subscribe-history-dialog__scroll"
        @load="loadHistory"
      >
        <template #loading>
          <LoadingBanner />
        </template>
        <template #error="{ props: retryProps }">
          <div class="d-flex flex-column align-center ga-2 py-4" role="alert">
            <span class="text-medium-emphasis">{{ t('subscribe.requestFailed') }}</span>
            <VBtn v-bind="retryProps" prepend-icon="mdi-refresh" size="small" variant="tonal">
              {{ t('common.retry') }}
            </VBtn>
          </div>
        </template>
        <template #empty />
        <VList lines="two" class="subscribe-history-dialog__content py-0">
          <VVirtualScroll v-if="historyList.length > 0" renderless :items="historyList" :item-height="104">
            <template #default="{ item, itemRef }">
              <div :ref="itemRef">
                <VListItem class="subscribe-history-item">
                  <template #prepend>
                    <VImg
                      height="75"
                      width="50"
                      :max-width="50"
                      :src="getHistoryPoster(item)"
                      aspect-ratio="2/3"
                      class="flex-none rounded object-cover me-3"
                      cover
                    >
                      <template #placeholder>
                        <div class="w-full h-full">
                          <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
                        </div>
                      </template>
                    </VImg>
                  </template>
                  <VListItemTitle v-if="item.type == '电视剧'">
                    {{ item.name }}
                    <span class="text-sm">{{ t('dialog.subscribeHistory.season', { season: item.season }) }}</span>
                  </VListItemTitle>
                  <VListItemTitle v-else>
                    {{ item.name }}
                  </VListItemTitle>
                  <VListItemSubtitle class="mt-1">{{ formatDateDifference(item.date) }}</VListItemSubtitle>
                  <VListItemSubtitle class="mt-1">{{ item.description }}</VListItemSubtitle>
                  <template #append>
                    <div class="me-n2">
                      <IconBtn>
                        <VIcon icon="mdi-dots-vertical" />
                        <VMenu activator="parent" close-on-content-click>
                          <VList>
                            <VListItem
                              v-for="(menu, i) in dropdownItems"
                              :key="i"
                              :base-color="menu.color"
                              @click="menu.props.click(item)"
                            >
                              <template #prepend>
                                <VIcon :icon="menu.props.prependIcon" />
                              </template>
                              <VListItemTitle v-text="menu.title" />
                            </VListItem>
                          </VList>
                        </VMenu>
                      </IconBtn>
                    </div>
                  </template>
                </VListItem>
              </div>
            </template>
          </VVirtualScroll>
        </VList>
      </VInfiniteScroll>
      <VCardText v-else class="subscribe-history-empty flex-grow-1">
        <VIcon class="subscribe-history-empty__icon" icon="mdi-sync" size="30" />

        <div class="subscribe-history-empty__headline">
          {{ t('dialog.subscribeHistory.noData') }}
        </div>

        <div class="subscribe-history-empty__description">
          {{ t('dialog.subscribeHistory.noDataHint') }}
        </div>
      </VCardText>
    </VCard>
    <!-- 进度框 -->
    <ProgressDialog v-if="progressDialog" v-model="progressDialog" :text="progressText" />
  </VDialog>
</template>
<style scoped>
.subscribe-history-dialog {
  overflow: hidden !important;
  block-size: 100%;
}

.subscribe-history-dialog__scroll {
  flex: 1 1 0;
  min-block-size: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.subscribe-history-dialog__content {
  overflow: visible !important;
}

.subscribe-history-item {
  min-block-size: 6rem;
  padding-block: 0.5rem !important;
}

.subscribe-history-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  min-block-size: 13rem;
  padding-block: 2.5rem !important;
  padding-inline: 1.5rem !important;
  text-align: center;
}

.subscribe-history-empty__icon {
  color: rgba(var(--v-theme-on-surface), 0.32);
}

.subscribe-history-empty__headline {
  color: rgba(var(--v-theme-on-surface), 0.9);
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.4;
}

.subscribe-history-empty__description {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.875rem;
  line-height: 1.6;
  max-inline-size: 22rem;
}
</style>
