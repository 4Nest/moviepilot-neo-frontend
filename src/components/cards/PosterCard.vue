<script lang="ts" setup>
import type { PropType } from 'vue'
import type { MediaServerPlayItem } from '@/api/types'
import noImage from '@images/no-image.jpeg'
import { openMediaServerItem } from '@/utils/appDeepLink'

// 输入参数
const props = defineProps({
  media: Object as PropType<MediaServerPlayItem>,
  width: String,
  height: String,
})

// 图片加载状态
const isImageLoaded = ref(false)

// 图片加载失败
const imageLoadError = ref(false)

const cardStyle = computed(() => ({
  aspectRatio: props.height ? undefined : '2 / 3',
  blockSize: props.height,
  inlineSize: props.width || '100%',
}))

// 类型微圆点语义类名
function getTypeDotClass(type?: string) {
  if (type === '电影') return 'poster-card__type-dot--movie'
  if (type === '电视剧') return 'poster-card__type-dot--tv'
  return 'poster-card__type-dot--other'
}

// 计算图片地址
const getImgUrl = computed(() => {
  if (imageLoadError.value) return noImage
  const image = props.media?.image || ''
  let url = `${import.meta.env.VITE_API_BASE_URL}system/img/0?imgurl=${encodeURIComponent(image)}`
  const use_cookies = props.media?.use_cookies
  if (use_cookies) {
    url += `&use_cookies=${encodeURIComponent(use_cookies)}`
  }
  return url
})

// 跳转播放
async function goPlay() {
  if (props.media) {
    await openMediaServerItem(props.media)
  }
}
</script>

<template>
  <VHover>
    <template #default="hover">
      <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
      <div v-bind="hover.props" class="poster-card-hover-area">
        <VCard
          :style="cardStyle"
          class="poster-card app-hover-lift-card cursor-pointer outline-none"
          :class="{
            'app-hover-lift-card--hovering': hover.isHovering,
            'ring-1': isImageLoaded,
          }"
          @click="goPlay"
        >
          <!-- 媒体服务器图片统一采用匿名 CORS，避免同一代理资源分裂为两种请求与缓存模式；Safari 普通 dev 可能重复请求，PWA 下由图片缓存路由统一处理。 -->
          <VImg
            aspect-ratio="2/3"
            :src="getImgUrl"
            crossorigin="anonymous"
            class="poster-card-image object-cover aspect-w-2 aspect-h-3"
            :class="{ 'poster-card-image--loaded': isImageLoaded }"
            cover
            @load="isImageLoaded = true"
            @error="imageLoadError = true"
          >
            <template #placeholder>
              <div class="w-full h-full">
                <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
              </div>
            </template>
          </VImg>
          <!-- 类型微胶囊角标 -->
          <div
            v-show="isImageLoaded && props.media?.type && !(hover.isHovering || imageLoadError)"
            class="poster-card-chip"
          >
            <span class="poster-card__type-dot" :class="getTypeDotClass(props.media?.type)" />
            <span>{{ props.media?.type }}</span>
          </div>
          <!-- 详情 -->
          <VCardText v-show="hover.isHovering || imageLoadError" class="poster-card-overlay">
            <span v-if="props.media?.subtitle" class="poster-card-subtitle">{{ props.media?.subtitle }}</span>
            <h1 class="poster-card-title">
              {{ props.media?.title }}
            </h1>
          </VCardText>
        </VCard>
      </div>
    </template>
  </VHover>
</template>

<style scoped lang="scss">
/* stylelint-disable selector-pseudo-class-no-unknown */

.poster-card-hover-area {
  block-size: 100%;
  inline-size: 100%;
}

.poster-card {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px !important;
  background: rgb(var(--v-theme-surface));
}

.poster-card-chip {
  position: absolute;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  background: rgba(12, 15, 24, 0.88);
  block-size: 20px;
  color: rgba(248, 250, 252, 0.96);
  font-size: 11px;
  font-weight: 600;
  gap: 4px;
  inset-block-start: 7px;
  inset-inline-start: 7px;
  line-height: 1;
  padding-inline: 6.5px;
  pointer-events: none;
}

.poster-card__type-dot {
  border-radius: 999px;
  block-size: 5px;
  inline-size: 5px;
}

.poster-card__type-dot--movie {
  background: #60a5fa;
}

.poster-card__type-dot--tv {
  background: #818cf8;
}

.poster-card__type-dot--other {
  background: #c084fc;
}

.poster-card-overlay {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 10px !important;
  background: linear-gradient(
    180deg,
    rgba(10, 13, 21, 0.25) 0%,
    rgba(10, 13, 21, 0.72) 55%,
    rgba(10, 13, 21, 0.95) 100%
  );
  color: #f8fafc;
  cursor: pointer;
}

.poster-card-subtitle {
  color: rgba(226, 232, 240, 0.76);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.3;
  margin-block-end: 2px;
}

.poster-card-title {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  -webkit-box-orient: vertical;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  -webkit-line-clamp: 2;
  line-height: 1.3;
  text-overflow: ellipsis;
}

.poster-card-image {
  block-size: 100%;
  inline-size: 100%;
}

.poster-card-image :deep(.v-img__img) {
  opacity: 0;
  transition: opacity 0.2s ease;
}

.poster-card-image--loaded :deep(.v-img__img) {
  opacity: 1;
}

.poster-card-image :deep(.v-responsive__sizer) {
  padding-bottom: 150%;
}

@media (prefers-reduced-motion: reduce) {
  .poster-card-image :deep(.v-img__img) {
    transition: none;
  }
}
</style>
