<script lang="ts" setup>
import { formatDateDifference } from '@/@core/utils/formatters'
import type { SubscribeShare } from '@/api/types'

import { useGlobalSettingsStore } from '@/stores'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { getDisplayImageUrl } from '@/utils/imageUtils'

const ForkSubscribeDialog = defineAsyncComponent(() => import('../dialog/ForkSubscribeDialog.vue'))
const SubscribeEditDialog = defineAsyncComponent(() => import('../dialog/SubscribeEditDialog.vue'))

// 输入参数
const props = defineProps({
  media: Object as PropType<SubscribeShare>,
  // 批量管理模式
  batchMode: Boolean,
  // 是否已选中
  selected: Boolean,
})

// 定义删除事件
const emit = defineEmits(['delete', 'toggle-select'])

// 从 provide 中获取全局设置
// 全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// 图片是否加载完成
const imageLoaded = ref(false)

// 图片加载完成响应
function imageLoadHandler() {
  imageLoaded.value = true
}

// 分享时间
const dateText = ref(props.media && props.media?.date ? formatDateDifference(props.media.date) : '')

// 计算backdrop图片地址
const backdropUrl = computed(() => {
  const url = props.media?.backdrop || props.media?.poster
  return getDisplayImageUrl(url || '', globalSettings.GLOBAL_IMAGE_CACHE)
})

// 计算海报图片地址
const posterUrl = computed(() => {
  const url = props.media?.poster
  return getDisplayImageUrl(url || '', globalSettings.GLOBAL_IMAGE_CACHE)
})

// 卡片点击：批量模式下切换选择，正常模式打开详情
function handleCardClick() {
  if (props.batchMode) {
    emit('toggle-select')
  } else {
    showForkSubscribe()
  }
}

// 复用订阅
function showForkSubscribe() {
  openSharedDialog(
    ForkSubscribeDialog,
    { media: props.media },
    {
      fork: finishForkSubscribe,
      delete: doDelete,
    },
    { closeOn: ['close', 'fork', 'delete'] },
  )
}

// 完成复用订阅
function finishForkSubscribe(subid: number) {
  openSharedDialog(SubscribeEditDialog, { subid }, {}, { closeOn: ['close', 'save', 'remove'] })
}

// 删除订阅分享时处理
function doDelete() {
  // 通知父组件刷新
  emit('delete')
}
</script>

<template>
  <div class="h-full">
    <VHover>
      <template #default="hover">
        <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
        <div v-bind="hover.props" class="subscribe-share-card-hover-area w-full h-full">
          <VCard
            :key="props.media?.id"
            class="app-hover-lift-card flex flex-col h-full overflow-hidden"
            :class="{ 'share-card--selected': props.selected, 'app-hover-lift-card--hovering': hover.isHovering }"
            min-height="150"
            @click="handleCardClick"
          >
            <!-- 批量模式选择框 -->
            <div v-if="props.batchMode" class="share-card-checkbox">
              <VIcon
                :icon="props.selected ? 'mdi-checkbox-marked-circle' : 'mdi-checkbox-blank-circle-outline'"
                :color="props.selected ? 'primary' : undefined"
                size="24"
              />
            </div>
            <template #image>
              <VImg :src="backdropUrl || posterUrl" aspect-ratio="3/2" cover @load="imageLoadHandler" position="top">
                <template #placeholder>
                  <div class="w-full h-full">
                    <VSkeletonLoader class="object-cover aspect-w-3 aspect-h-2" />
                  </div>
                </template>
                <template #default>
                  <div class="absolute inset-0 subscribe-card-background"></div>
                </template>
              </VImg>
            </template>
            <div class="h-full flex flex-col">
              <VCardText class="flex items-center pa-3 pb-1 grow">
                <div class="h-auto w-16 flex-shrink-0 overflow-hidden rounded-md" v-if="imageLoaded">
                  <VImg :src="posterUrl" aspect-ratio="2/3" cover>
                    <template #placeholder>
                      <div class="w-full h-full">
                        <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
                      </div>
                    </template>
                  </VImg>
                </div>
                <div class="flex flex-col justify-center pl-2 xl:pl-4">
                  <div class="mr-2 min-w-0 text-lg font-bold text-white line-clamp-2 overflow-hidden text-ellipsis ...">
                    {{ props.media?.share_title }}
                  </div>
                  <div class="text-sm font-medium text-gray-200 sm:pt-1 line-clamp-3 overflow-hidden text-ellipsis ...">
                    {{ props.media?.share_comment }}
                  </div>
                </div>
              </VCardText>
              <VCardText class="share-card-meta">
                <div class="share-card-meta__author text-white">
                  <VIcon icon="mdi-account" size="16" aria-hidden="true" />
                  <span class="share-card-meta__name" :title="props.media?.share_user">
                    {{ props.media?.share_user }}
                  </span>
                </div>
                <div v-if="props.media?.count" class="share-card-meta__heat text-white">
                  <VIcon icon="mdi-fire" size="16" aria-hidden="true" />
                  <span>{{ props.media.count.toLocaleString() }}</span>
                </div>
                <div v-if="dateText" class="share-card-meta__date text-gray-300" :title="props.media?.date">
                  <VIcon icon="mdi-calendar" size="16" aria-hidden="true" />
                  <span>{{ dateText }}</span>
                </div>
              </VCardText>
            </div>
          </VCard>
        </div>
      </template>
    </VHover>
  </div>
</template>
<style lang="scss" scoped>
.subscribe-share-card-hover-area {
  inline-size: 100%;
  container-type: inline-size;
}

.subscribe-card-background {
  background-image: linear-gradient(180deg, rgba(31, 41, 55, 47%) 0%, rgb(31, 41, 55) 100%);
}
.share-card-meta {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px 12px;
  padding-block: 8px;
  padding-inline: 12px;
}

.share-card-meta__author,
.share-card-meta__heat,
.share-card-meta__date {
  display: inline-flex;
  align-items: center;
  min-inline-size: 0;
  gap: 5px;
}

.share-card-meta__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-card-meta__date {
  grid-column: 1 / -1;
  justify-self: end;
  max-inline-size: 100%;
  font-size: 0.8125rem;
}

@container (min-width: 360px) {
  .share-card-meta {
    grid-template-columns: minmax(0, 1fr) auto auto;
  }

  .share-card-meta__date {
    grid-column: auto;
    justify-self: auto;
  }
}

// 批量模式选择框
.share-card-checkbox {
  position: absolute;
  z-index: 2;
  display: grid;
  padding: 0.35rem;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  inset-block-start: 0.75rem;
  inset-inline-end: 0.75rem;
  place-items: center;
}

// 选中状态高亮
.share-card--selected {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}
</style>
