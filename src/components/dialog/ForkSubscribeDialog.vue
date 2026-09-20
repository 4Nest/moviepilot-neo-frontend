<script setup lang="ts">
import api from '@/api'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import { SubscribeShare } from '@/api/types'

import { useToast } from 'vue-toastification'
import { VBtn } from 'vuetify/lib/components/index.mjs'
import { useI18n } from '@/composables/useChineseText'
import { useGlobalSettingsStore } from '@/stores'
import { getDisplayImageUrl } from '@/utils/imageUtils'

// 国际化
const { t } = useI18n()

// 输入参数
const props = defineProps({
  media: Object as PropType<SubscribeShare>,
})

// 定义事件
const emit = defineEmits(['fork', 'delete', 'close'])

// 从 provide 中获取全局设置
// 全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// 提示框
const $toast = useToast()

// 处理中
const processing = ref(false)

// 删除中
const deleting = ref(false)

// 是否折叠
const isExpanded = ref(false)

// follow用户列表
const followUsers = ref<string[]>([])

// 当前用户是否已follow
const isFollowed = computed(() => followUsers.value.includes(props.media?.share_uid || ''))

// 折叠展开
function toggleExpand() {
  isExpanded.value = !isExpanded.value
}

// 加载follow用户列表
async function queryFollowUsers() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/public/FollowSubscribers')
    followUsers.value = result.data?.value ?? []
  } catch (error) {
    console.error(error)
    $toast.error(t('subscribe.requestFailed'))
  }
}

// follow用户
async function followUser() {
  try {
    const result: { [key: string]: any } = await api.post(`subscribe/follow?share_uid=${props.media?.share_uid}`)
    if (result.success) {
      queryFollowUsers()
    }
  } catch (error) {
    console.error(error)
    $toast.error(t('subscribe.requestFailed'))
  }
}

// unfollow用户
async function unfollowUser() {
  try {
    const result: { [key: string]: any } = await api.delete('subscribe/follow', {
      params: {
        share_uid: props.media?.share_uid,
      },
    })
    if (result.success) {
      queryFollowUsers()
    }
  } catch (error) {
    console.error(error)
    $toast.error(t('subscribe.requestFailed'))
  }
}

// 计算海报图片地址
const posterUrl = computed(() => {
  const url = props.media?.poster
  return getDisplayImageUrl(url || '', globalSettings.GLOBAL_IMAGE_CACHE)
})

// 复用订阅
async function doFork() {
  // 开始处理
  startNProgress()
  try {
    processing.value = true
    // 请求API
    const result: { [key: string]: any } = await api.post('subscribe/fork', props.media)
    // 订阅状态
    if (result.success) {
      $toast.success(t('subscribe.addSuccess', { name: props.media?.share_title }))
      // 完成
      emit('fork', result.data.id)
    } else {
      $toast.error(t('subscribe.addFailed', { name: props.media?.share_title, message: result.message }))
    }
  } catch (error) {
    console.error(error)
    $toast.error(
      t('subscribe.addFailed', {
        name: props.media?.share_title,
        message: t('subscribe.requestFailed'),
      }),
    )
  } finally {
    processing.value = false
    doneNProgress()
  }
}

// 删除订阅分享
async function doDelete() {
  // 开始处理
  startNProgress()
  try {
    deleting.value = true
    // 请求API
    const result: { [key: string]: any } = await api.delete(`subscribe/share/${props.media?.id}`, {
      params: {
        share_uid: globalSettings.USER_UNIQUE_ID,
      },
    })
    // 订阅状态
    if (result.success) {
      $toast.success(t('subscribe.cancelSuccess'))
      // 完成
      emit('delete')
    } else {
      $toast.error(t('subscribe.cancelFailed', { message: result.message }))
    }
  } catch (error) {
    console.error(error)
    $toast.error(t('subscribe.cancelFailed', { message: t('subscribe.requestFailed') }))
  } finally {
    deleting.value = false
    doneNProgress()
  }
}

onMounted(() => {
  queryFollowUsers()
})
</script>
<template>
  <VDialog max-width="34rem" scrollable>
    <VCard class="share-detail-card">
      <!-- 顶部：海报 + 标题区 -->
      <div class="share-hero">
        <div class="share-hero__poster">
          <VImg :src="posterUrl" aspect-ratio="2/3" cover>
            <template #placeholder>
              <VSkeletonLoader class="h-100 w-100" />
            </template>
          </VImg>
        </div>
        <div class="share-hero__info">
          <h2 class="share-hero__title">{{ props.media?.share_title }}</h2>
          <p v-if="props.media?.share_comment" class="share-hero__comment">
            {{ props.media?.share_comment }}
          </p>
          <!-- 分享者 / 关注 / 复用 -->
          <div class="share-hero__meta">
            <span
              class="share-hero__meta-item"
              :class="{ 'share-hero__meta-item--clickable': props.media?.share_uid }"
              :role="props.media?.share_uid ? 'button' : undefined"
              :aria-label="
                props.media?.share_uid ? (isFollowed ? t('subscribe.unfollow') : t('subscribe.follow')) : undefined
              "
              :tabindex="props.media?.share_uid ? 0 : undefined"
              @click.stop="props.media?.share_uid && (isFollowed ? unfollowUser() : followUser())"
              @keydown.enter.stop="props.media?.share_uid && (isFollowed ? unfollowUser() : followUser())"
            >
              <!-- 图标即关注状态：点击标签任意位置切换 -->
              <VIcon
                v-if="props.media?.share_uid"
                :icon="isFollowed ? 'mdi-account-check' : 'mdi-account-plus-outline'"
                :color="isFollowed ? 'warning' : 'info'"
                size="16"
              />
              <VIcon v-else icon="mdi-account" size="16" />
              {{ media?.share_user }}
            </span>
            <span v-if="props.media?.count" class="share-hero__meta-item share-hero__meta-item--hot">
              <VIcon icon="mdi-fire" size="16" />
              {{ t('subscribe.usageCount', { count: props.media?.count?.toLocaleString() }) }}
            </span>
          </div>
          <!-- 操作按钮 -->
          <div class="share-hero__actions">
            <VBtn
              color="primary"
              variant="flat"
              size="small"
              :disabled="processing"
              :loading="processing"
              @click="doFork"
            >
              <template #prepend>
                <VIcon icon="mdi-heart" />
              </template>
              {{ t('subscribe.normalSub') }}
            </VBtn>
            <VBtn
              v-if="
                (props.media?.share_uid && props.media?.share_uid === globalSettings.USER_UNIQUE_ID) ||
                globalSettings.SUBSCRIBE_SHARE_MANAGE
              "
              color="error"
              variant="tonal"
              size="small"
              :disabled="deleting"
              :loading="deleting"
              @click="doDelete"
            >
              <template #prepend>
                <VIcon icon="mdi-delete" />
              </template>
              {{ t('subscribe.cancelShare') }}
            </VBtn>
          </div>
        </div>
      </div>

      <!-- 元信息 -->
      <div v-if="media?.keyword" class="share-meta">
        <div class="share-meta__row">
          <span class="share-meta__label">{{ t('subscribe.keyword') }}</span>
          <span class="share-meta__value">{{ media?.keyword }}</span>
        </div>
      </div>

      <!-- 识别词（可折叠） -->
      <div v-if="media?.custom_words" class="share-words">
        <button class="share-words__toggle" @click="toggleExpand">
          <VIcon :icon="isExpanded ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="18" />
          {{ t('subscribe.recognitionWords') }}
          <span class="share-words__count">{{ media?.custom_words?.split('\n').length || 0 }} 条</span>
        </button>
        <div v-show="isExpanded" class="share-words__content">
          <pre>{{ media?.custom_words }}</pre>
        </div>
      </div>

      <VDialogCloseBtn @click="emit('close')" />
    </VCard>
  </VDialog>
</template>

<style scoped>
.share-detail-card {
  overflow: hidden;
}

/* ===== 顶部 Hero 区 ===== */
.share-hero {
  display: flex;
  align-items: flex-start;
  padding: 1.25rem;
  gap: 1.25rem;
}

.share-hero__poster {
  position: relative;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 12px;
  block-size: 13rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  inline-size: 8.75rem;
}

.share-hero__info {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-block-size: 13rem;
  min-inline-size: 0;
}

.share-hero__title {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.25;
}

.share-hero__comment {
  display: -webkit-box;
  overflow: hidden;
  margin: 0.4rem 0 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.875rem;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.45;
}

.share-hero__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-block-start: auto;
  padding-block-start: 0.75rem;
}

.share-hero__meta-item {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  font-size: 0.8125rem;
  gap: 0.35rem;
  padding-block: 0.35rem;
  padding-inline: 0.75rem;
}

.share-hero__meta-item--hot {
  background: rgba(var(--v-theme-error), 0.1);
  color: rgb(var(--v-theme-error));
}

/* ===== 元信息 ===== */
.share-meta {
  padding: 0 1.5rem;
  padding-block-end: 0.5rem;
}

.share-meta__row {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.share-meta__label {
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.8125rem;
}

.share-meta__value {
  font-size: 0.875rem;
  font-weight: 500;
  word-break: break-all;
}

/* ===== 识别词折叠区 ===== */
.share-words {
  margin: 0 1.5rem;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 10px;
  margin-block: 0.75rem 1.25rem;
  overflow: hidden;
}

.share-words__toggle {
  display: flex;
  align-items: center;
  border: none;
  background: rgba(var(--v-theme-on-surface), 0.02);
  color: inherit;
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 500;
  gap: 0.5rem;
  inline-size: 100%;
  padding-block: 0.625rem;
  padding-inline: 0.875rem;
  transition: background-color 0.2s;
}

.share-words__toggle:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.share-words__count {
  margin-inline-start: auto;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.08);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.7rem;
  padding-block: 0.15rem;
  padding-inline: 0.5rem;
}

.share-words__content {
  border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  max-block-size: 12rem;
  overflow-y: auto;
}

.share-words__content pre {
  margin: 0;
  padding: 0.875rem;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 0.75rem;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-all;
}

.share-words__content::-webkit-scrollbar {
  inline-size: 4px;
}

.share-words__content::-webkit-scrollbar-thumb {
  border-radius: 2px;
  background: rgba(var(--v-theme-on-surface), 0.2);
}

/* ===== Hero 内操作区：订阅与取消左右并排 ===== */
.share-hero__actions {
  display: flex;
  gap: 0.5rem;
  margin-block-start: 0.75rem;
}

.share-hero__actions .v-btn {
  flex: 1;
}

/* 分享者标签可点击（切换关注） */
.share-hero__meta-item--clickable {
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.share-hero__meta-item--clickable:hover {
  background: rgba(var(--v-theme-on-surface), 0.12);
}

/* ===== 响应式 ===== */
@media (width <= 640px) {
  .share-hero {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .share-hero__info {
    align-items: center;
    inline-size: 100%;
  }

  .share-hero__meta {
    justify-content: center;
  }

  .share-hero__actions {
    inline-size: 100%;
  }
}
</style>
