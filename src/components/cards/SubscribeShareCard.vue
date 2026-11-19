<script lang="ts" setup>
import { formatDateDifference } from '@/@core/utils/formatters'
import { formatSeasonLabel } from '@/@core/utils/season'
import type { SubscribeShare } from '@/api/types'
import { useI18n } from '@/composables/useChineseText'
import { openSharedDialog } from '@/composables/useSharedDialog'
import router from '@/router'
import { useGlobalSettingsStore } from '@/stores'
import { getDisplayImageUrl } from '@/utils/imageUtils'
import { isOwnShare, resolveShareMediaId } from '@/utils/sharePermissions'

const ForkSubscribeDialog = defineAsyncComponent(() => import('../dialog/ForkSubscribeDialog.vue'))
const SubscribeEditDialog = defineAsyncComponent(() => import('../dialog/SubscribeEditDialog.vue'))

// 输入参数
const props = defineProps({
  media: Object as PropType<SubscribeShare>,
  // 批量管理模式
  batchMode: Boolean,
  // 是否已选中
  selected: Boolean,
  // 当前用户在批量模式下是否有权删除此卡片（未显式传入时默认允许选择）
  deletable: {
    type: Boolean,
    default: undefined,
  },
})

// 定义事件
const emit = defineEmits(['delete', 'toggle-select'])

const { t } = useI18n()
const globalSettingsStore = useGlobalSettingsStore()

const posterLoadFailed = ref(false)

// 单海报源：优先使用竖版 poster，缺失时回退 backdrop，杜绝双 VImg 并发原图解码
const rawPosterUrl = computed(() => props.media?.poster || props.media?.backdrop || '')
const posterUrl = computed(() =>
  getDisplayImageUrl(rawPosterUrl.value, globalSettingsStore.globalSettings.GLOBAL_IMAGE_CACHE),
)

watch(rawPosterUrl, () => {
  posterLoadFailed.value = false
})

const hasPoster = computed(() => Boolean(posterUrl.value && !posterLoadFailed.value))

// 响应式分享相对时间
const dateText = computed(() => (props.media?.date ? formatDateDifference(props.media.date) : ''))

// 是否为当前实例发布的本人分享
const isMine = computed(() => isOwnShare(props.media?.share_uid, globalSettingsStore.globalSettings.USER_UNIQUE_ID))

// 批量模式下是否允许勾选该卡片
const isSelectableInBatch = computed(() => props.deletable ?? true)

// 标题与年份季号标签
const displayTitle = computed(() => props.media?.share_title || props.media?.name || t('common.unknown'))
const seasonTag = computed(() => formatSeasonLabel(props.media?.season, t('media.specials')))
const yearSeasonTag = computed(() => [props.media?.year?.trim(), seasonTag.value].filter(Boolean).join(' · '))

// 媒体类型标识（剧集 / 电影）
const mediaTypeBadge = computed(() => {
  const rawType = props.media?.type?.trim()
  if (rawType === '电视剧' || rawType?.toLowerCase() === 'tv' || props.media?.season !== undefined) {
    return t('mediaType.tv')
  }
  if (rawType === '电影' || rawType?.toLowerCase() === 'movie') {
    return t('mediaType.movie')
  }
  return ''
})

// TMDB 评分徽标
const ratingText = computed(() => {
  const vote = Number(props.media?.vote ?? 0)
  if (!Number.isFinite(vote) || vote <= 0) return ''
  return vote.toFixed(1)
})

// 分享说明（无说明时回退媒体原名或简介摘要，保持卡片版面充实均衡）
const commentText = computed(() => {
  const comment = props.media?.share_comment?.trim()
  if (comment) return comment
  const desc = props.media?.description?.trim()
  if (desc) return desc
  const fallbackName = props.media?.name?.trim()
  if (fallbackName && fallbackName !== displayTitle.value) return fallbackName
  return ''
})

// 规则亮点胶囊（最多提取 4 个非空规则特征）
const ruleHighlights = computed(() => {
  const highlights: Array<{ key: string; label: string; accent?: boolean }> = []
  const resolution = props.media?.resolution?.trim()
  if (resolution) highlights.push({ key: 'resolution', label: resolution, accent: true })

  const quality = props.media?.quality?.trim()
  if (quality) highlights.push({ key: 'quality', label: quality })

  const effect = props.media?.effect?.trim()
  if (effect) highlights.push({ key: 'effect', label: effect })

  if (props.media?.custom_words?.trim()) {
    highlights.push({ key: 'custom_words', label: t('subscribe.ruleCustomWords'), accent: true })
  }
  if (props.media?.include?.trim()) {
    highlights.push({ key: 'include', label: t('subscribe.ruleInclude') })
  }
  if (props.media?.exclude?.trim()) {
    highlights.push({ key: 'exclude', label: t('subscribe.ruleExclude') })
  }
  if ((props.media?.total_episode ?? 0) > 0) {
    highlights.push({
      key: 'episodes',
      label: t('subscribe.ruleEpisodes', { count: props.media?.total_episode }),
    })
  }

  return highlights.slice(0, 4)
})

// 关联媒体详情路由 ID
const mediaDetailId = computed(() => resolveShareMediaId(props.media))

// 点击左侧海报跳转对应媒体详情页
function viewMediaDetail() {
  if (props.batchMode) {
    handleCardClick()
    return
  }
  if (!mediaDetailId.value) {
    showForkSubscribe()
    return
  }
  router.push({
    path: '/media',
    query: {
      mediaid: mediaDetailId.value,
      title: props.media?.name || props.media?.share_title,
      year: props.media?.year,
      type: props.media?.type,
    },
  })
}

// 卡片点击：批量模式下切换选择（仅可删项），正常模式打开复用详情弹窗
function handleCardClick() {
  if (props.batchMode) {
    if (isSelectableInBatch.value) {
      emit('toggle-select')
    }
    return
  }
  showForkSubscribe()
}

// 复用订阅弹窗
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

// 完成复用订阅后衔接打开订阅编辑弹窗
function finishForkSubscribe(subid: number) {
  openSharedDialog(SubscribeEditDialog, { subid }, {}, { closeOn: ['close', 'save', 'remove'] })
}

// 删除订阅分享回调
function doDelete() {
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
            class="share-card app-hover-lift-card h-full overflow-hidden"
            :class="{
              'share-card--selected': props.batchMode && props.selected,
              'share-card--disabled': props.batchMode && !isSelectableInBatch,
              'app-hover-lift-card--hovering': hover.isHovering && !(props.batchMode && !isSelectableInBatch),
            }"
            @click="handleCardClick"
          >
            <div class="share-card__layout">
              <!-- 左侧固定 68x102 独立海报框：首帧稳定占位，图片解码绝不挤压右侧文字 -->
              <div
                class="share-card__poster"
                :class="{ 'share-card__poster--interactive': !props.batchMode && Boolean(mediaDetailId) }"
                :role="!props.batchMode && mediaDetailId ? 'button' : undefined"
                :tabindex="!props.batchMode && mediaDetailId ? 0 : undefined"
                :aria-label="!props.batchMode && mediaDetailId ? t('subscribe.mediaDetail') : undefined"
                :title="!props.batchMode && mediaDetailId ? t('subscribe.mediaDetail') : undefined"
                @click.stop="viewMediaDetail"
                @keydown.enter.stop.prevent="viewMediaDetail"
              >
                <VImg
                  v-if="hasPoster"
                  :src="posterUrl"
                  class="share-card__poster-img"
                  cover
                  @error="posterLoadFailed = true"
                >
                  <template #placeholder>
                    <VSkeletonLoader class="w-full h-full" />
                  </template>
                </VImg>
                <div v-else class="share-card__poster-fallback">
                  <VIcon icon="mdi-movie-open-outline" size="24" />
                </div>
                <span v-if="mediaTypeBadge" class="share-card__type-badge">
                  {{ mediaTypeBadge }}
                </span>
              </div>

              <!-- 右侧高密度主信息区 -->
              <div class="share-card__main">
                <!-- 1. 标题行 + 右上角评分/本人标识/管理勾选框 -->
                <div class="share-card__header">
                  <div class="share-card__title-wrap">
                    <span class="share-card__title" :title="displayTitle">
                      {{ displayTitle }}
                    </span>
                    <span v-if="yearSeasonTag" class="share-card__year-tag">
                      {{ yearSeasonTag }}
                    </span>
                  </div>

                  <div class="share-card__badges">
                    <template v-if="props.batchMode">
                      <VIcon
                        v-if="isSelectableInBatch"
                        :icon="props.selected ? 'mdi-checkbox-marked-circle' : 'mdi-checkbox-blank-circle-outline'"
                        :color="props.selected ? 'primary' : undefined"
                        size="20"
                        class="share-card__check-icon"
                      />
                      <VIcon v-else icon="mdi-lock-outline" size="16" class="text-disabled" />
                    </template>
                    <template v-else>
                      <span v-if="isMine" class="share-card__mine-badge">
                        {{ t('subscribe.myShareBadge') }}
                      </span>
                      <span v-if="ratingText" class="share-card__rating-badge">
                        <VIcon icon="mdi-star" size="12" />
                        <span>{{ ratingText }}</span>
                      </span>
                    </template>
                  </div>
                </div>

                <!-- 2. 分享说明（2 行截断） -->
                <div v-if="commentText" class="share-card__comment" :title="commentText">
                  {{ commentText }}
                </div>

                <!-- 3. 规则亮点胶囊行 -->
                <div v-if="ruleHighlights.length > 0" class="share-card__rules">
                  <span
                    v-for="rule in ruleHighlights"
                    :key="rule.key"
                    class="share-card__rule-pill"
                    :class="{ 'share-card__rule-pill--accent': rule.accent }"
                    :title="rule.label"
                  >
                    {{ rule.label }}
                  </span>
                </div>

                <!-- 4. 底栏：分享人 + 复用热度 + 相对时间 -->
                <div class="share-card__footer">
                  <div
                    class="share-card__author"
                    :class="{ 'share-card__author--mine': isMine }"
                    :title="props.media?.share_user"
                  >
                    <VIcon icon="mdi-account-circle-outline" size="15" aria-hidden="true" />
                    <span class="share-card__author-name">{{ props.media?.share_user || t('common.unknown') }}</span>
                  </div>

                  <div class="share-card__stats">
                    <span v-if="props.media?.count" class="share-card__heat">
                      <VIcon icon="mdi-fire" size="14" aria-hidden="true" />
                      <span>{{ props.media.count.toLocaleString() }}</span>
                    </span>
                    <span v-if="dateText" class="share-card__date" :title="props.media?.date">
                      <VIcon icon="mdi-calendar" size="14" aria-hidden="true" />
                      <span>{{ dateText }}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </VCard>
        </div>
      </template>
    </VHover>
  </div>
</template>

<style lang="scss" scoped>
.subscribe-share-card-hover-area {
  container-type: inline-size;
  inline-size: 100%;
}

.share-card {
  background-color: rgb(var(--v-theme-surface)) !important;
  border: 1px solid var(--mp-border-card);
  border-radius: 12px !important;
  color: rgb(var(--v-theme-on-surface));
  cursor: pointer;
  min-block-size: 142px;
  min-inline-size: 0;
}

.share-card--selected {
  border-color: rgb(var(--v-theme-primary));
  box-shadow: 0 0 0 2px rgba(var(--v-theme-primary), 0.28);
}

.share-card--disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.share-card__layout {
  display: flex;
  align-items: stretch;
  block-size: 100%;
  gap: 13px;
  min-inline-size: 0;
  padding: 13px 15px;
}

.share-card__poster {
  position: relative;
  flex: 0 0 66px;
  overflow: hidden;
  border-radius: 8px;
  align-self: center;
  background: rgba(var(--v-theme-on-surface), 0.06);
  block-size: 99px;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.12);
  inline-size: 66px;
}

.share-card__poster--interactive {
  cursor: pointer;
  transition: transform 0.16s ease;
}

.share-card__poster--interactive:hover {
  transform: scale(1.03);
}

.share-card__poster-img {
  block-size: 100%;
  inline-size: 100%;
}

.share-card__poster-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  block-size: 100%;
  color: rgba(var(--v-theme-on-surface), 0.38);
  inline-size: 100%;
}

.share-card__type-badge {
  position: absolute;
  z-index: 1;
  border-radius: 4px;
  background: rgba(15, 23, 42, 0.78);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  inset-block-end: 4px;
  inset-inline-start: 4px;
  line-height: 1.2;
  padding-block: 1px;
  padding-inline: 5px;
}

.share-card__main {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 5px;
  min-block-size: 0;
  min-inline-size: 0;
}

.share-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  min-inline-size: 0;
}

.share-card__title-wrap {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 6px;
  min-inline-size: 0;
  row-gap: 2px;
}

.share-card__title {
  overflow: hidden;
  max-inline-size: 100%;
  font-size: 14.5px;
  font-weight: 600;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-card__year-tag {
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

.share-card__badges {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 5px;
}

.share-card__mine-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 5px;
  background: rgba(var(--v-theme-success), 0.14);
  block-size: 20px;
  color: rgb(var(--v-theme-success));
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  padding-inline: 6px;
}

.share-card__rating-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 5px;
  background: rgba(var(--v-theme-warning), 0.14);
  block-size: 20px;
  color: rgb(var(--v-theme-warning));
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  gap: 2px;
  line-height: 1;
  padding-inline: 6px;
}

.share-card__comment {
  display: -webkit-box;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.share-card__rules {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  min-inline-size: 0;
}

.share-card__rule-pill {
  display: inline-flex;
  align-items: center;
  overflow: hidden;
  border-radius: 5px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  block-size: 20px;
  color: rgba(var(--v-theme-on-surface), 0.82);
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  max-inline-size: 9rem;
  padding-inline: 6px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-card__rule-pill--accent {
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}

.share-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-block-start: auto;
  min-inline-size: 0;
  padding-block-start: 3px;
}

.share-card__author {
  display: inline-flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  font-weight: 500;
  gap: 4px;
  min-inline-size: 0;
}

.share-card__author--mine {
  color: rgb(var(--v-theme-success));
  font-weight: 600;
}

.share-card__author-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-card__stats {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  gap: 8px;
}

.share-card__heat {
  display: inline-flex;
  align-items: center;
  color: rgb(var(--v-theme-error));
  font-weight: 600;
  gap: 0.18rem;
}

.share-card__date {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
}

@media (width <= 600px) {
  .share-card {
    border-radius: 10px !important;
    min-block-size: 124px;
  }

  .share-card__layout {
    gap: 10px;
    padding: 10px 12px;
  }

  .share-card__poster {
    flex: 0 0 58px;
    border-radius: 7px;
    block-size: 87px;
    inline-size: 58px;
  }

  .share-card__main {
    gap: 4px;
  }

  .share-card__header {
    gap: 6px;
  }

  .share-card__title {
    font-size: 14px;
    line-height: 1.3;
    overflow-wrap: anywhere;
    word-break: normal;
  }

  .share-card__year-tag {
    font-size: 11.5px;
  }

  .share-card__mine-badge,
  .share-card__rating-badge {
    border-radius: 6px;
    block-size: 19px;
    font-size: 11px;
    padding-inline: 5px;
  }

  .share-card__comment {
    font-size: 12px;
    line-height: 1.38;
    overflow-wrap: anywhere;
    word-break: normal;
  }

  .share-card__rules {
    gap: 4px;
  }

  .share-card__rule-pill {
    border-radius: 6px;
    block-size: 19px;
    font-size: 11px;
    max-inline-size: 7.5rem;
    padding-inline: 5px;
  }

  .share-card__footer {
    gap: 6px;
    padding-block-start: 2px;
  }

  .share-card__author,
  .share-card__stats {
    font-size: 11.5px;
  }

  .share-card__stats {
    gap: 6px;
  }
}
</style>
