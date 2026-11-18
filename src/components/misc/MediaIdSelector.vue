<script lang="ts" setup>
import api from '@/api'
import noImage from '@images/no-image.jpeg'
import type { MediaDataSource, MediaInfo } from '@/api/types'
import { useI18n } from '@/composables/useChineseText'

const { t } = useI18n()

// 定义输入变量
const props = defineProps<{
  type?: MediaDataSource
}>()

interface MediaSelectorItem {
  // 数据源原生ID
  id: string
  // 媒体标题
  title: string
  // 媒体简介，包含类型标签
  overview: string
  // 海报地址
  poster: string
  // 媒体类型
  type?: string
}

// update:modelValue 事件
const emit = defineEmits(['update:modelValue', 'select', 'close'])

const items = ref<MediaSelectorItem[]>([])
const failedPosters = ref<Record<string, boolean>>({})

// 搜索词
const keyword = ref('')

// 加载中
const loading = ref(false)

// ref
const inputKeyword = ref<HTMLElement | null>(null)

// 选中条目并通知父组件同步额外媒体信息。
function selectMedia(item: MediaSelectorItem) {
  emit('update:modelValue', item.id)
  emit('select', item)
  emit('close')
}

// TMDB图片转换为w500大小
function getW500Image(url = '') {
  if (!url) return ''
  return url.replace('original', 'w500')
}

function getPosterSrc(item: MediaSelectorItem) {
  const key = `${item.type || 'media'}-${item.id}`
  if (!item.poster || failedPosters.value[key]) return noImage
  return item.poster
}

function handlePosterError(item: MediaSelectorItem) {
  const key = `${item.type || 'media'}-${item.id}`
  failedPosters.value[key] = true
}

// 搜索词条
async function searchMedias() {
  const searchKeyword = keyword.value.trim()
  if (!searchKeyword) return

  // 调用API搜索词条
  try {
    loading.value = true
    const result: MediaInfo[] = await api.get('media/search', {
      params: {
        title: searchKeyword,
        page: 1,
        count: 20,
        source: props.type,
      },
    })

    // 清空
    items.value = []
    failedPosters.value = {}

    // 赋值
    for (const item of result) {
      const mediaId =
        item.media_id ||
        item.tmdb_id?.toString() ||
        item.douban_id ||
        item.bangumi_id?.toString() ||
        item.anilist_id?.toString()
      if (!mediaId) continue
      items.value.push({
        id: mediaId,
        poster: getW500Image(item.poster_path),
        type: item.type,
        title: item.year ? `${item.title}（${item.year}）` : item.title || '',
        overview: item.overview || '',
      })
    }
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

// 加载时聚焦搜索框
onMounted(() => {
  // 500ms后聚焦
  setTimeout(() => {
    inputKeyword.value?.focus()
  }, 500)
})
</script>

<template>
  <VCard class="media-id-selector mx-auto" width="100%">
    <VCardTitle class="d-flex align-center justify-space-between">
      <span>{{ t('dialog.reorganize.mediaSearchInput') }}</span>
      <VDialogCloseBtn
        :aria-label="t('common.close')"
        inner-class="media-id-selector__close"
        @click="
          () => {
            emit('close')
          }
        "
      />
    </VCardTitle>
    <VCardText class="media-id-selector__search">
      <VTextField
        ref="inputKeyword"
        v-model="keyword"
        :mobile-layout="false"
        density="compact"
        single-line
        :placeholder="t('dialog.reorganize.mediaSearchPlaceholder')"
        variant="outlined"
        append-inner-icon="mdi-magnify"
        flat
        hide-details
        :loading="loading"
        @click:append-inner="searchMedias"
        @keydown.enter="searchMedias"
      />
    </VCardText>
    <VDivider />
    <VList v-if="items.length > 0" class="media-id-selector__results" lines="three">
      <template v-for="item in items" :key="`${item.type || 'media'}-${item.id}`">
        <VListItem @click="selectMedia(item)">
          <template #prepend>
            <VImg
              height="75"
              width="50"
              :max-width="50"
              :src="getPosterSrc(item)"
              aspect-ratio="2/3"
              class="media-id-selector__poster flex-none rounded object-cover me-3"
              cover
              @error="handlePosterError(item)"
            >
              <template #placeholder>
                <div class="w-full h-full">
                  <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
                </div>
              </template>
            </VImg>
          </template>
          <VListItemTitle>
            {{ item.title }}
          </VListItemTitle>
          <VListItemSubtitle class="mt-2">
            <span v-if="item.type" class="text-primary me-1">{{ item.type }}</span
            >{{ item.overview }}
          </VListItemSubtitle>
        </VListItem>
      </template>
    </VList>
  </VCard>
</template>

<style lang="scss" scoped>
.media-id-selector {
  overflow: hidden !important;
}

.media-id-selector__search {
  flex: 0 0 auto;
  overflow: visible !important;
  padding-block: 0.25rem 0.75rem !important;
}

.media-id-selector__close {
  position: relative;
  flex: 0 0 auto;
}

.media-id-selector__poster {
  flex: 0 0 50px !important;
  border: 1px solid var(--mp-border-subtle);
  block-size: 75px;
  inline-size: 50px;
  max-inline-size: 50px;
}

.media-id-selector__results {
  flex: 1 1 auto;
  min-block-size: 0;
  overflow-anchor: none;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
</style>
