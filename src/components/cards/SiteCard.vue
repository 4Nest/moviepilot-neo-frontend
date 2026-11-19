<script lang="ts" setup>
import type { PropType } from 'vue'
import { getLogoUrl } from '@/utils/imageUtils'
import { useToast } from 'vue-toastification'
import { useI18n } from '@/composables/useChineseText'
import api from '@/api'
import type { ApiResponse, Site, SiteStatistic, SiteUserData } from '@/api/types'
import { isNullOrEmptyObject } from '@/@core/utils'
import { formatFileSize } from '@/@core/utils/formatters'
import { useConfirm } from '@/composables/useConfirm'
import { clearSiteIconCache, getCachedSiteIcon } from '@/utils/siteIconCache'
import { useDisplay } from 'vuetify'
import { openSharedDialog } from '@/composables/useSharedDialog'

const SiteAddEditDialog = defineAsyncComponent(() => import('../dialog/SiteAddEditDialog.vue'))
const SiteCookieUpdateDialog = defineAsyncComponent(() => import('../dialog/SiteCookieUpdateDialog.vue'))
const SiteResourceDialog = defineAsyncComponent(() => import('../dialog/SiteResourceDialog.vue'))
const SiteUserDataDialog = defineAsyncComponent(() => import('../dialog/SiteUserDataDialog.vue'))

// 显示器宽度
const display = useDisplay()

// 国际化
const { t } = useI18n()

// 输入参数
const cardProps = defineProps({
  site: Object as PropType<Site>,
  data: Object as PropType<SiteUserData>,
  stats: Object as PropType<SiteStatistic>,
  sortable: {
    type: Boolean,
    default: false,
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['update', 'remove', 'refresh-stats'])

// 确认框
const createConfirm = useConfirm()

// 图标
const defaultSiteIcon = getLogoUrl('site')
const siteIcon = ref<string>(defaultSiteIcon)

// 提示框
const $toast = useToast()

// 测试按钮文字
const testButtonText = ref(t('site.testConnectivity'))

// 测试按钮可用性
const testButtonDisable = ref(false)

// 查询站点图标
async function getSiteIcon(force = false) {
  const siteId = cardProps.site?.id
  if (!siteId) {
    siteIcon.value = defaultSiteIcon
    return
  }

  if (force) clearSiteIconCache(siteId)

  try {
    siteIcon.value = await getCachedSiteIcon(
      siteId,
      async () => {
        const response = await api.get(`site/icon/${siteId}`, { cancelOnNavigation: false })

        return response?.data?.icon || defaultSiteIcon
      },
      defaultSiteIcon,
    )
  } catch (error) {
    siteIcon.value = defaultSiteIcon
    console.error(error)
  }
}

// 测试站点连通性
async function testSite() {
  try {
    testButtonText.value = t('site.testing')
    testButtonDisable.value = true

    const result = (await api.get(`site/test/${cardProps.site?.id}`)) as ApiResponse<unknown>
    if (result.success) {
      $toast.success(t('site.testSuccess', { name: cardProps.site?.name }))
      await getSiteIcon(true)
    } else $toast.error(t('site.testFailed', { name: cardProps.site?.name, message: result.message }))

    // 测试完成后刷新统计数据
    emit('refresh-stats', cardProps.site?.domain)
  } catch (error) {
    console.error(error)
    $toast.error(
      t('site.testFailed', {
        name: cardProps.site?.name,
        message: error instanceof Error ? error.message : t('common.serverConnectionFailed'),
      }),
    )
  } finally {
    testButtonText.value = t('site.testConnectivity')
    testButtonDisable.value = false
  }
}

// 更新需要认证的站点 Cookie 与 UA。
async function handleSiteUpdate() {
  if (cardProps.site?.public) return

  openSharedDialog(
    SiteCookieUpdateDialog,
    { site: cardProps.site },
    {
      done: onSiteCookieUpdated,
    },
    { closeOn: ['close', 'done'] },
  )
}

// 打开资源浏览弹窗
async function handleResourceBrowse() {
  openSharedDialog(
    SiteResourceDialog,
    { site: cardProps.site },
    {
      close: onSiteResourceDone,
    },
    { closeOn: ['close'] },
  )
}

// 打开站点用户数据弹窗
async function handleSiteUserData() {
  openSharedDialog(SiteUserDataDialog, { site: cardProps.site }, {}, { closeOn: ['close'] })
}

// 打开站点编辑弹窗
function handleSiteEdit() {
  openSharedDialog(
    SiteAddEditDialog,
    { siteid: cardProps.site?.id },
    {
      save: saveSite,
      remove: () => emit('remove', cardProps.site?.id),
    },
    { closeOn: ['close', 'save', 'remove'] },
  )
}

// 打开站点页面
function openSitePage() {
  window.open(cardProps.site?.url, '_blank')
}

function handleCardClick() {
  if (cardProps.sortable) {
    return
  }

  handleResourceBrowse()
}

function handleSiteUrlClick() {
  if (cardProps.sortable) {
    return
  }

  openSitePage()
}

// 调用API删除站点信息
async function deleteSiteInfo() {
  const isConfirmed = await createConfirm({
    title: t('common.confirm'),
    content: t('site.deleteConfirm'),
  })

  if (!isConfirmed) return

  try {
    const result = (await api.delete(`site/${cardProps.site?.id}`)) as ApiResponse<unknown>
    if (result.success) emit('remove', cardProps.site?.id)
    else $toast.error(t('site.deleteFailed', { name: cardProps.site?.name, message: result.message }))
  } catch (error) {
    $toast.error(t('site.deleteFailed', { name: cardProps.site?.name, message: error }))
    console.error(error)
  }
}

// 根据站点状态显示不同的状态图标
const statColor = computed(() => {
  if (!cardProps.stats || isNullOrEmptyObject(cardProps.stats)) {
    return 'secondary'
  }
  if (cardProps.stats.circuit_open) {
    return 'error'
  }
  if (cardProps.stats?.lst_state === 1) {
    return 'error'
  } else if (cardProps.stats?.lst_state === 0) {
    if (!cardProps.stats?.seconds) return 'secondary'
    if (cardProps.stats?.seconds >= 5) return 'warning'
    return 'success'
  }
  return 'secondary'
})

// 数据百分比计算
const getMaxDataValue = computed(() => {
  // 获取站点数据中的最大值作为基准
  const upload = cardProps.data?.upload || 0
  const download = cardProps.data?.download || 0

  // 避免两者都为0的情况
  if (upload === 0 && download === 0) return 1

  return Math.max(upload, download)
})

// 上传百分比
const getUploadPercent = computed(() => {
  const upload = cardProps.data?.upload || 0
  return Math.min(100, Math.max(3, (upload / getMaxDataValue.value) * 100))
})

// 下载百分比
const getDownloadPercent = computed(() => {
  const download = cardProps.data?.download || 0
  return Math.min(100, Math.max(3, (download / getMaxDataValue.value) * 100))
})

// 分享率与做种数（有有效数据时在 PT 卡片指标网格中展示）
const formattedRatio = computed(() => {
  const ratio = cardProps.data?.ratio
  if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio <= 0) return ''
  return ratio >= 100 ? ratio.toFixed(0) : ratio.toFixed(2)
})

const formattedSeeding = computed(() => {
  const seeding = cardProps.data?.seeding
  if (typeof seeding !== 'number' || !Number.isFinite(seeding) || seeding <= 0) return ''
  return seeding.toLocaleString('zh-CN')
})

const hasSecondaryMetrics = computed(() => Boolean(formattedRatio.value || formattedSeeding.value))

// 保存站点
function saveSite() {
  void getSiteIcon(true)
  emit('update')
}

// 更新站点Cookie UA后的回调
function onSiteCookieUpdated() {
  // Cookie更新后刷新统计数据
  emit('refresh-stats', cardProps.site?.domain)
}

// 资源浏览弹窗关闭后的回调
function onSiteResourceDone() {
  // 资源操作完成后刷新统计数据
  emit('refresh-stats', cardProps.site?.domain)
}

// 装载时查询站点图标
onMounted(() => {
  getSiteIcon()
})

// 窄视口中从按钮下方弹出，避免菜单横向覆盖卡片主体。
const siteMenuLocation = computed(() => (display.smAndDown.value ? 'bottom end' : 'left'))
</script>

<template>
  <div>
    <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
    <div class="site-card-hover-area h-full">
      <VCard
        class="site-card app-hover-lift-card relative h-full flex flex-col overflow-hidden group"
        :class="[
          cardProps.site?.is_active ? '' : 'opacity-70',
          {
            'cursor-pointer site-card--hoverable': !cardProps.sortable,
            'cursor-move': cardProps.sortable,
            'site-card--sortable': cardProps.sortable,
          },
        ]"
        :ripple="false"
        variant="flat"
        elevation="0"
        :hover="!cardProps.sortable"
        @click="handleCardClick"
      >
        <!-- 主体部分 -->
        <div class="site-card__body relative z-1 flex flex-1 flex-col">
          <!-- 顶部：图标和站点名称 -->
          <div class="flex min-w-0 items-center gap-2.5">
            <!-- 站点图标 -->
            <VAvatar
              tile
              size="38"
              class="site-card__avatar shrink-0"
              :class="{ 'cursor-move': cardProps.sortable && display.mdAndUp.value }"
            >
              <VImg :src="siteIcon" class="w-full h-full" :alt="cardProps.site?.name" contain>
                <template #placeholder>
                  <div class="w-full h-full">
                    <VSkeletonLoader class="object-cover aspect-square" />
                  </div>
                </template>
              </VImg>
            </VAvatar>

            <!-- 站点名称、状态圆点和特性图标 -->
            <div class="flex min-w-0 flex-1 items-center gap-2">
              <div class="flex min-w-0 flex-1 items-center gap-1.5">
                <h3 class="site-card__title min-w-0 truncate">{{ cardProps.site?.name }}</h3>
                <span
                  data-testid="site-status-dot"
                  class="site-status-dot shrink-0"
                  :class="`site-status-dot--${statColor}`"
                />
              </div>

              <!-- 站点特性图标 -->
              <div class="ml-auto flex shrink-0 items-center gap-2">
                <div
                  v-if="cardProps.site?.limit_interval"
                  :class="cardProps.sortable ? '' : 'hover:bg-primary/8 transition-colors'"
                >
                  <VIcon
                    icon="mdi-speedometer"
                    size="15"
                    color="primary"
                    :class="cardProps.sortable ? 'opacity-85' : 'opacity-85 hover:opacity-100'"
                  />
                </div>
                <div
                  v-if="cardProps.site?.proxy"
                  :class="cardProps.sortable ? '' : 'hover:bg-primary/8 transition-colors'"
                >
                  <VIcon
                    icon="mdi-network-outline"
                    size="15"
                    color="primary"
                    :class="cardProps.sortable ? 'opacity-85' : 'opacity-85 hover:opacity-100'"
                  />
                </div>
                <div
                  v-if="cardProps.site?.render"
                  :class="cardProps.sortable ? '' : 'hover:bg-primary/8 transition-colors'"
                >
                  <VIcon
                    icon="mdi-apple-safari"
                    size="15"
                    color="primary"
                    :class="cardProps.sortable ? 'opacity-85' : 'opacity-85 hover:opacity-100'"
                  />
                </div>
                <div
                  v-if="cardProps.site?.filter"
                  :class="cardProps.sortable ? '' : 'hover:bg-primary/8 transition-colors'"
                >
                  <VIcon
                    icon="mdi-filter-cog-outline"
                    size="15"
                    color="primary"
                    :class="cardProps.sortable ? 'opacity-85' : 'opacity-85 hover:opacity-100'"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- 站点地址 -->
          <div class="site-card__url-row">
            <div class="site-card__url min-w-0 truncate" @click.stop="handleSiteUrlClick">
              {{ cardProps.site?.url }}
            </div>
          </div>

          <VAlert
            v-if="cardProps.stats?.circuit_open"
            color="error"
            density="compact"
            variant="tonal"
            class="mb-2 text-caption"
          >
            <div class="font-weight-medium">{{ t('site.circuitOpen') }}</div>
            <div v-if="cardProps.stats.circuit_until">
              {{ t('site.circuitUntil', { time: cardProps.stats.circuit_until }) }}
            </div>
            <div v-if="cardProps.stats.last_error" class="text-truncate" :title="cardProps.stats.last_error">
              {{ t('site.circuitLastError', { reason: cardProps.stats.last_error }) }}
            </div>
          </VAlert>

          <!-- 公开 BT 标签占据剩余空间并在底部对齐，避免短行卡片覆盖站点地址。 -->
          <div v-if="cardProps.site?.public" class="site-card-public-summary flex flex-1 items-end">
            <VChip size="small" color="success" variant="tonal" prepend-icon="mdi-earth" class="site-card__public-chip">
              公开 BT
            </VChip>
          </div>

          <!-- PT 站点显示上传下载数据。 -->
          <div v-else class="flex-1 flex flex-col justify-end">
            <div class="site-card__metrics border-t">
              <div class="site-card__transfer-row mb-1.5">
                <div class="site-card__metric-text">
                  <VIcon icon="mdi-arrow-up" size="13" color="info" class="mr-1 shrink-0" />
                  <span>{{ formatFileSize(cardProps.data?.upload || 0) }}</span>
                </div>
                <div class="flex-grow h-1 rounded bg-on-surface/8 relative overflow-hidden">
                  <VProgressLinear :model-value="getUploadPercent" color="info" height="4" rounded="lg" />
                </div>
              </div>

              <div class="site-card__transfer-row">
                <div class="site-card__metric-text">
                  <VIcon icon="mdi-arrow-down" size="13" color="success" class="mr-1 shrink-0" />
                  <span>{{ formatFileSize(cardProps.data?.download || 0) }}</span>
                </div>
                <div class="flex-grow h-1 rounded bg-on-surface/8 relative overflow-hidden">
                  <VProgressLinear :model-value="getDownloadPercent" color="warning" height="4" rounded="lg" />
                </div>
              </div>

              <div v-if="hasSecondaryMetrics" class="site-card__submetrics">
                <div v-if="formattedRatio" class="site-card__submetric-item">
                  <VIcon icon="mdi-scale-balance" size="12" class="shrink-0" />
                  <span class="site-card__submetric-label">{{ t('dialog.siteUserData.ratio') }}</span>
                  <strong class="site-card__submetric-value">{{ formattedRatio }}</strong>
                </div>
                <div v-if="formattedSeeding" class="site-card__submetric-item">
                  <VIcon icon="mdi-seed-outline" size="12" class="shrink-0" />
                  <span class="site-card__submetric-label">{{ t('dialog.siteUserData.seedingTitle') }}</span>
                  <strong class="site-card__submetric-value">{{ formattedSeeding }}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
        <!-- 紧凑操作区：26x26 微圆角按钮组 -->
        <VSheet v-if="!cardProps.sortable" class="site-card-actions absolute top-2 right-2 z-20 flex items-center">
          <VBtn
            icon
            variant="text"
            density="comfortable"
            class="site-card__action-btn relative flex items-center justify-center"
            :disabled="testButtonDisable"
            :title="testButtonText"
            :aria-label="testButtonText"
            @click.stop="testSite"
          >
            <div class="relative flex items-center justify-center w-full h-full">
              <div
                class="w-[14px] h-[14px] rounded-full shadow-[inset_0_0_0_1.5px_rgba(var(--v-theme-on-surface),0.12)] pulse-dot"
                :class="statColor"
              ></div>
            </div>
            <div
              v-if="testButtonDisable"
              class="absolute inset-0 flex flex-col items-center justify-center bg-surface/95 rounded-md shadow-sm animate-fade-in"
            >
              <div class="relative w-4 h-4">
                <div class="spinner-circle"></div>
              </div>
            </div>
            <VTooltip activator="parent" location="top">{{ testButtonText }}</VTooltip>
          </VBtn>

          <VBtn
            v-if="!cardProps.site?.public"
            icon
            variant="text"
            class="site-card__action-btn"
            :title="t('site.viewUserData')"
            :aria-label="t('site.viewUserData')"
            @click.stop="handleSiteUserData"
          >
            <VIcon icon="mdi-chart-bell-curve" size="16" />
            <VTooltip activator="parent" location="top">{{ t('site.viewUserData') }}</VTooltip>
          </VBtn>

          <VBtn
            v-if="!cardProps.site?.public"
            icon
            variant="text"
            class="site-card__action-btn"
            :title="t('site.updateCookie')"
            :aria-label="t('site.updateCookie')"
            @click.stop="handleSiteUpdate"
          >
            <VIcon icon="mdi-refresh" size="16" />
            <VTooltip activator="parent" location="top">{{ t('site.updateCookie') }}</VTooltip>
          </VBtn>

          <VBtn
            icon
            variant="text"
            class="site-card__action-btn"
            :title="t('common.moreActions')"
            :aria-label="t('common.moreActions')"
            @click.stop
          >
            <VIcon icon="mdi-dots-vertical" size="16" />
            <VTooltip activator="parent" location="top">{{ t('common.moreActions') }}</VTooltip>
            <VMenu :activator="'parent'" :close-on-content-click="true" :location="siteMenuLocation">
              <VList density="compact">
                <VListItem @click="handleSiteEdit" base-color="info">
                  <template #prepend>
                    <VIcon icon="mdi-file-edit-outline" size="18" />
                  </template>
                  <VListItemTitle>{{ t('site.actions.edit') }}</VListItemTitle>
                </VListItem>
                <VListItem @click="deleteSiteInfo">
                  <template #prepend>
                    <VIcon icon="mdi-delete-outline" size="18" color="error" />
                  </template>
                  <VListItemTitle class="text-error">{{ t('site.deleteSite') }}</VListItemTitle>
                </VListItem>
              </VList>
            </VMenu>
          </VBtn>
        </VSheet>
      </VCard>
    </div>
  </div>
</template>

<style scoped>
.site-card-hover-area {
  inline-size: 100%;
}

.site-card {
  border: 1px solid var(--mp-border-card) !important;
  border-radius: 12px !important;
  background-color: rgb(var(--v-theme-surface));
  min-block-size: 150px;
  transition:
    border-color 0.18s ease,
    transform 0.18s ease;
}

.site-card-hover-area:hover .site-card--hoverable {
  border-color: var(--mp-border-hover) !important;
  transform: translate3d(0, -0.25rem, 0);
}

.site-card__body {
  padding: 14px 16px;
}

.site-card__avatar {
  padding: 4px;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 9px !important;
  background: rgba(255, 255, 255, 0.12);
}

.site-card__avatar :deep(.v-img__img) {
  object-fit: contain !important;
}

.site-card__title {
  color: rgb(var(--v-theme-on-surface));
  font-size: 15px;
  font-weight: 600;
  line-height: 1.35;
}

.site-card__url-row {
  margin-block: 7px 9px;
}

.site-card__url {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  line-height: 1.35;
}

.site-card__metrics {
  border-color: var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.08));
  margin-block-start: 4px;
  padding-block-start: 8px;
}

.site-card__transfer-row {
  display: grid;
  align-items: center;
  gap: 10px;
  grid-template-columns: minmax(76px, auto) minmax(0, 1fr);
}

.site-card__metric-text {
  display: inline-flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  line-height: 1.25;
  min-inline-size: 72px;
  white-space: nowrap;
}

.site-card__submetrics {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-block-start: 8px;
  padding: 5px 8px;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 7px;
  background: rgba(var(--v-theme-on-surface), 0.03);
}

.site-card__submetric-item {
  display: inline-flex;
  min-inline-size: 0;
  align-items: center;
  gap: 4px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  line-height: 1.25;
  white-space: nowrap;
}

.site-card__submetric-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.site-card__submetric-value {
  color: rgb(var(--v-theme-on-surface));
  font-weight: 600;
}

.site-card__public-chip {
  border-radius: 6px !important;
  block-size: 22px !important;
  font-size: 11.5px !important;
  font-weight: 500;
  padding-inline: 8px !important;
}

.site-status-dot {
  display: inline-block;
  border-radius: 50%;
  block-size: 7px;
  inline-size: 7px;
}

.site-status-dot--success {
  background-color: rgb(var(--v-theme-success));
}

.site-status-dot--warning {
  background-color: rgb(var(--v-theme-warning));
}

.site-status-dot--error {
  background-color: rgb(var(--v-theme-error));
}

.site-status-dot--secondary {
  background-color: rgba(var(--v-theme-on-surface), 0.28);
}

/* 测试按钮状态圆点 */
.pulse-dot::before {
  position: absolute;
  z-index: 1;
  border-radius: 50%;
  block-size: 56%;
  content: '';
  inline-size: 56%;
  inset-block-start: 22%;
  inset-inline-start: 22%;
}

.pulse-dot.error::before {
  background-color: rgb(var(--v-theme-error));
}

.pulse-dot.warning::before {
  background-color: rgb(var(--v-theme-warning));
}

.pulse-dot.success::before {
  background-color: rgb(var(--v-theme-success));
}

.pulse-dot.secondary::before {
  background-color: rgba(var(--v-theme-on-surface), 0.35);
}

/* 加载动画 */
.spinner-circle {
  position: absolute;
  border: 1.5px solid rgba(var(--v-theme-primary), 0.2);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  block-size: 100%;
  border-block-start-color: rgb(var(--v-theme-primary));
  inline-size: 100%;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

.site-card-public-summary {
  min-block-size: 1.75rem;
}

.site-card-actions {
  border: 1px solid var(--mp-border-card);
  border-radius: 8px;
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.08);
  gap: 2px;
  opacity: 0;
  padding: 2px;
  transform: translateY(-0.2rem);
  transition:
    opacity 0.16s ease,
    transform 0.16s ease,
    visibility 0.16s ease;
  visibility: hidden;
}

.site-card__action-btn {
  border-radius: 6px !important;
  block-size: 26px !important;
  color: rgba(var(--v-theme-on-surface), 0.68);
  inline-size: 26px !important;
  min-inline-size: 26px !important;
  padding: 0 !important;
}

.site-card__action-btn:hover {
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgb(var(--v-theme-on-surface));
}

.site-card-hover-area:hover .site-card-actions {
  opacity: 1;
  transform: translateY(0);
  visibility: visible;
}

@media (hover: none) and (width > 600px) {
  .site-card-actions {
    opacity: 1;
    transform: none;
    visibility: visible;
  }
}

@media (width <= 600px) {
  .site-card {
    border-radius: 10px !important;
    min-block-size: 0;
  }

  .site-card__body {
    padding: 11px 12px 10px;
  }

  .site-card__avatar {
    border-radius: 8px !important;
    block-size: 34px !important;
    inline-size: 34px !important;
  }

  .site-card__title {
    font-size: 14px;
    line-height: 1.3;
  }

  .site-card__url-row {
    margin-block: 5px 7px;
  }

  .site-card__url {
    font-size: 11.5px;
  }

  .site-card__metrics {
    padding-block-start: 7px;
  }

  .site-card__transfer-row {
    gap: 8px;
    grid-template-columns: minmax(72px, auto) minmax(0, 1fr);
  }

  .site-card__metric-text {
    font-size: 11.5px;
    min-inline-size: 68px;
  }

  .site-card-actions {
    position: static !important;
    inset: auto !important;
    justify-content: flex-end;
    border: 0;
    border-block-start: 1px solid var(--mp-border-subtle);
    border-radius: 0;
    background: rgba(var(--v-theme-on-surface), 0.03);
    box-shadow: none;
    gap: 6px;
    opacity: 1;
    padding: 6px 12px;
    transform: none;
    visibility: visible;
  }

  .site-card__action-btn {
    border: 1px solid var(--mp-border-subtle);
    border-radius: 7px !important;
    background: rgb(var(--v-theme-surface));
    block-size: 28px !important;
    inline-size: 28px !important;
    min-inline-size: 28px !important;
  }
}
</style>
