<script lang="ts" setup>
import api from '@/api'
import type { ApiResponse, Plugin } from '@/api/types'
import { getLogoUrl } from '@/utils/imageUtils'
import { usePluginCardAccent } from '@/composables/usePluginCardAccent'
import { isNullOrEmptyObject } from '@/@core/utils'
import { formatDownloadCount } from '@/@core/utils/formatters'
import { useToast } from 'vue-toastification'
import { useI18n } from '@/composables/useChineseText'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useConfirm } from '@/composables/useConfirm'

const PluginMarketDetailDialog = defineAsyncComponent(() => import('@/components/dialog/PluginMarketDetailDialog.vue'))
const PluginVersionHistoryDialog = defineAsyncComponent(
  () => import('@/components/dialog/PluginVersionHistoryDialog.vue'),
)
const ProgressDialog = defineAsyncComponent(() => import('@/components/dialog/ProgressDialog.vue'))

// 输入参数
const props = defineProps({
  plugin: Object as PropType<Plugin>,
  width: String,
  height: String,
  count: Number,
})

// 定义触发的自定义事件
const emit = defineEmits(['install'])

// 多语言
const { t } = useI18n()

// 提示框
const $toast = useToast()

const createConfirm = useConfirm()

const { accentStyle, imageRef, resetAccentColor, updateAccentColor } = usePluginCardAccent()

// 获取当前插件的标签
const pluginLabels = computed(() => {
  if (!props.plugin?.plugin_label) return []

  return props.plugin.plugin_label
    .split(',')
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0)
})

// 图片是否加载失败
const imageLoadError = ref(false)

let progressDialogController: ReturnType<typeof openSharedDialog> | null = null
let versionHistoryDialogController: ReturnType<typeof openSharedDialog> | null = null

/** 打开插件安装进度弹窗。 */
function showInstallProgress(text: string) {
  progressDialogController?.close()
  progressDialogController = openSharedDialog(ProgressDialog, { text }, {}, { closeOn: false })
}

/** 关闭插件安装进度弹窗。 */
function closeInstallProgress() {
  progressDialogController?.close()
  progressDialogController = null
}

// 图片加载完成
async function imageLoaded() {
  await updateAccentColor()
}

function imageFailed() {
  imageLoadError.value = true
  resetAccentColor()
}

// 计算图标路径
const iconPath: Ref<string> = computed(() => {
  if (imageLoadError.value) return getLogoUrl('plugin')
  // 如果是网络图片则使用代理后返回
  if (props.plugin?.plugin_icon?.startsWith('http'))
    return `${import.meta.env.VITE_API_BASE_URL}system/img/1?imgurl=${encodeURIComponent(
      props.plugin?.plugin_icon,
    )}&cache=true`

  return `./plugin_icon/${props.plugin?.plugin_icon}`
})

// 访问插件页面
function visitPluginPage() {
  // 将raw.githubusercontent.com转换为项目地址
  let repoUrl = props.plugin?.repo_url
  if (props.plugin?.is_local || repoUrl?.startsWith('local://')) {
    repoUrl = props.plugin?.author_url
  }
  if (repoUrl?.includes('raw.githubusercontent.com')) {
    try {
      const rawUrl = new URL(repoUrl)
      const [user, repo] = rawUrl.pathname.split('/').filter(Boolean)
      if (user && repo) repoUrl = `https://github.com/${user}/${repo}`
    } catch {
      return
    }
  }
  if (!repoUrl) {
    repoUrl = props.plugin?.author_url
  }
  window.open(repoUrl, '_blank')
}

// 显示更新日志
function showUpdateHistory() {
  versionHistoryDialogController?.close()
  versionHistoryDialogController = openSharedDialog(
    PluginVersionHistoryDialog,
    { plugin: props.plugin, actionMode: 'install' },
    {
      update: installPlugin,
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

/** 从插件市场版本历史安装指定 Release；最新版本走普通安装路径以保留主程序兼容校验。 */
async function installPlugin(releaseVersion?: string, repoUrl?: string) {
  if (!releaseVersion && props.plugin?.system_version_compatible === false) {
    $toast.error(props.plugin?.system_version_message || t('plugin.incompatibleSystemVersion'))
    return
  }

  if (releaseVersion) {
    const isConfirmed = await createConfirm({
      title: t('common.confirm'),
      content: t('plugin.confirmInstallOldRelease', {
        name: props.plugin?.plugin_name,
        version: releaseVersion,
      }),
      confirmText: t('common.confirm'),
    })

    if (!isConfirmed) return
  }

  try {
    showInstallProgress(
      t('plugin.installing', {
        name: props.plugin?.plugin_name,
        version: releaseVersion || props.plugin?.plugin_version,
      }),
    )

    const result: ApiResponse<unknown> = await api.get(`plugin/install/${props.plugin?.id}`, {
      // 安装事务跨页面继续完成，切换路由不中断进行中的请求。
      cancelOnNavigation: false,
      params: {
        repo_url: repoUrl || props.plugin?.repo_url,
        release_version: releaseVersion,
        force: props.plugin?.has_update || Boolean(releaseVersion),
      },
    })

    if (result.success) {
      $toast.success(t('plugin.installSuccess', { name: props.plugin?.plugin_name }))
      versionHistoryDialogController?.close()
      versionHistoryDialogController = null
      emit('install')
    } else {
      $toast.error(t('plugin.installFailed', { name: props.plugin?.plugin_name, message: result.message }))
    }
  } catch (error) {
    $toast.error(
      t('plugin.installFailed', {
        name: props.plugin?.plugin_name,
        message: t('common.serverConnectionFailed'),
      }),
    )
    console.error(error)
  } finally {
    closeInstallProgress()
  }
}

/** 打开共享插件市场详情弹窗。 */
function showPluginDetail() {
  openSharedDialog(
    PluginMarketDetailDialog,
    {
      plugin: props.plugin,
      count: props.count,
    },
    {
      install: () => emit('install'),
    },
    { closeOn: ['close', 'install', 'update:modelValue'] },
  )
}

// 弹出菜单（动态响应 props.plugin 更新）
const dropdownItems = computed(() => [
  {
    title: t('plugin.versionHistory'),
    value: 2,
    show: !isNullOrEmptyObject(props.plugin?.history || {}),
    props: {
      prependIcon: 'mdi-update',
      click: showUpdateHistory,
    },
  },
  {
    title: t('plugin.projectHome'),
    value: 1,
    show: true,
    props: {
      prependIcon: 'mdi-github',
      click: visitPluginPage,
    },
  },
])

onUnmounted(() => {
  closeInstallProgress()
  versionHistoryDialogController?.close()
})
</script>

<template>
  <div class="h-full">
    <VHover>
      <template #default="hover">
        <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
        <div v-bind="hover.props" class="plugin-app-card-hover-area h-full">
          <VCard
            :width="props.width"
            :height="props.height"
            @click="showPluginDetail"
            class="plugin-card app-hover-lift-card flex flex-col h-full"
            :class="{
              'app-hover-lift-card--hovering': hover.isHovering,
            }"
            :style="accentStyle"
          >
            <div class="plugin-card__banner flex-grow">
              <div class="plugin-app-card__header">
                <VCardTitle
                  class="plugin-app-card__title text-high-emphasis whitespace-nowrap overflow-hidden text-ellipsis"
                  :class="{ 'plugin-app-card__title--with-rating': (props.plugin?.rating_count || 0) > 0 }"
                >
                  {{ props.plugin?.plugin_name }}
                  <span class="plugin-app-card__version text-medium-emphasis">v{{ props.plugin?.plugin_version }}</span>
                </VCardTitle>
              </div>
              <div class="plugin-app-card__main relative flex flex-row items-start justify-between grow">
                <div class="relative flex-1 min-w-0">
                  <div
                    class="plugin-app-card__desc text-medium-emphasis overflow-hidden"
                    :class="{ 'line-clamp-3': !props.plugin?.plugin_label, 'line-clamp-2': props.plugin?.plugin_label }"
                  >
                    {{ props.plugin?.plugin_desc }}
                  </div>
                  <!-- 插件标签 -->
                  <div v-if="pluginLabels.length > 0" class="plugin-app-card__tags-section">
                    <VChip
                      v-for="tag in pluginLabels"
                      :key="tag"
                      size="x-small"
                      variant="tonal"
                      color="secondary"
                      class="plugin-app-card__tag"
                    >
                      {{ tag }}
                    </VChip>
                  </div>
                </div>
                <div class="plugin-app-card__icon-slot relative flex-shrink-0 self-center">
                  <VAvatar size="42" rounded="lg" class="plugin-app-card__icon-avatar">
                    <VImg
                      ref="imageRef"
                      :src="iconPath"
                      contain
                      class="w-full h-full"
                      @load="imageLoaded"
                      @error="imageFailed"
                    />
                  </VAvatar>
                </div>
              </div>
            </div>
            <VCardText
              class="plugin-app-card__footer relative flex items-center justify-between w-full overflow-hidden"
            >
              <div class="flex flex-nowrap items-center w-full pe-8 min-w-0">
                <div class="plugin-app-card__author flex flex-nowrap max-w-40 items-center">
                  <VIcon size="14" icon="mdi-github" class="me-1 flex-shrink-0" />
                  <a
                    class="overflow-hidden text-ellipsis whitespace-nowrap"
                    :href="props.plugin?.author_url"
                    target="_blank"
                    @click.stop
                  >
                    {{ props.plugin?.plugin_author }}
                  </a>
                </div>
                <span
                  v-if="props.count"
                  class="plugin-app-card__downloads ms-2.5 flex-shrink-0 inline-flex items-center"
                >
                  <VIcon size="13" icon="mdi-download" class="me-0.5" />
                  <span>{{ formatDownloadCount(props.count) }}</span>
                </span>
              </div>
              <div class="plugin-app-card__menu-wrap">
                <IconBtn class="plugin-app-card__menu-btn" @click.stop>
                  <VIcon size="16" icon="mdi-dots-vertical" />
                  <VMenu activator="parent" close-on-content-click>
                    <VList density="compact">
                      <VListItem
                        v-for="(item, i) in dropdownItems"
                        v-show="item.show"
                        :key="i"
                        @click="item.props.click"
                      >
                        <template #prepend>
                          <VIcon :icon="item.props.prependIcon" size="18" />
                        </template>
                        <VListItemTitle>{{ item.title }}</VListItemTitle>
                      </VListItem>
                    </VList>
                  </VMenu>
                </IconBtn>
              </div>
            </VCardText>
            <div
              v-if="(props.plugin?.rating_count || 0) > 0"
              class="plugin-app-card__rating"
              :aria-label="
                t('plugin.ratingSummary', {
                  rating: Number(props.plugin?.average_rating || 0).toFixed(1),
                  count: props.plugin?.rating_count || 0,
                })
              "
              :title="
                t('plugin.ratingSummary', {
                  rating: Number(props.plugin?.average_rating || 0).toFixed(1),
                  count: props.plugin?.rating_count || 0,
                })
              "
            >
              <VIcon icon="mdi-star" color="warning" size="13" />
              <span>{{ Number(props.plugin?.average_rating || 0).toFixed(1) }}</span>
            </div>
          </VCard>
        </div>
      </template>
    </VHover>
  </div>
</template>

<style scoped>
.plugin-app-card-hover-area {
  inline-size: 100%;
}

.plugin-card {
  border: 1px solid var(--mp-border-card) !important;
  border-radius: 12px !important;
  background-color: rgb(var(--v-theme-surface)) !important;
  transition:
    border-color 0.16s ease,
    transform 0.18s ease;
}

.plugin-card:hover {
  border-color: var(--mp-border-hover) !important;
}

.plugin-card__banner {
  display: flex;
  flex-direction: column;
  padding: 13px 15px 11px;
  background: rgba(var(--v-theme-on-surface), 0.025) !important;
  border-block-end: 1px solid var(--mp-border-subtle);
  gap: 6px;
}

.plugin-app-card__header {
  min-inline-size: 0;
}

.plugin-app-card__title {
  padding: 0 !important;
  font-size: 15px !important;
  font-weight: 600 !important;
  line-height: 1.35 !important;
}

.plugin-app-card__title--with-rating {
  padding-inline-end: 3.5rem !important;
}

.plugin-app-card__version {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  margin-inline-start: 4px;
}

.plugin-app-card__main {
  gap: 12px;
}

.plugin-app-card__desc {
  font-size: 12.5px;
  line-height: 1.45;
}

.plugin-app-card__icon-slot {
  padding-block-end: 2px;
}

.plugin-app-card__icon-avatar {
  padding: 5px;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 10px !important;
  background: rgba(255, 255, 255, 0.12);
}

.plugin-app-card__icon-avatar :deep(.v-img__img) {
  object-fit: contain !important;
}

.plugin-app-card__tags-section {
  display: flex;
  overflow: hidden;
  flex-wrap: nowrap;
  gap: 4px;
  margin-block-start: 6px;
  max-inline-size: 100%;
}

.plugin-app-card__tag {
  flex: 0 0 auto;
  border-radius: 5px !important;
  block-size: 20px !important;
  font-size: 11px !important;
  max-inline-size: 100%;
  min-inline-size: 0;
  padding-inline: 6px !important;
}

.plugin-app-card__tag :deep(.v-chip__content) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plugin-app-card__footer {
  block-size: 36px;
  max-block-size: 36px;
  min-block-size: 36px;
  padding: 0 14px !important;
}

.plugin-app-card__author {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  line-height: 1.3;
}

.plugin-app-card__author a {
  color: inherit;
  text-decoration: none;
}

.plugin-app-card__author a:hover {
  color: rgb(var(--v-theme-primary));
}

.plugin-app-card__downloads {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  line-height: 1.25;
}

.plugin-app-card__menu-wrap {
  position: absolute;
  display: inline-flex;
  align-items: center;
  inset-block: 0;
  inset-inline-end: 8px;
}

.plugin-app-card__menu-btn {
  border-radius: 6px !important;
  block-size: 26px !important;
  color: rgba(var(--v-theme-on-surface), 0.6);
  inline-size: 26px !important;
  min-inline-size: 26px !important;
  padding: 0 !important;
}

.plugin-app-card__menu-btn:hover {
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgb(var(--v-theme-on-surface));
}

.plugin-app-card__rating {
  position: absolute;
  z-index: 2;
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
  inset-block-start: 12px;
  inset-inline-end: 12px;
  line-height: 1;
  padding-inline: 6px;
}
</style>
