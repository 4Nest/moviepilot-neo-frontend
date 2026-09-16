<script lang="ts" setup>
import api from '@/api'
import type { Subscribe, SubscribeVersionRule } from '@/api/types'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'
import { useConfirm } from '@/composables/useConfirm'
import { formatSeason } from '@/@core/utils/formatters'

// i18n
const { t } = useI18n()

// 显示器宽度
const display = useDisplay()

// 提示框
const $toast = useToast()

// 确认框
const createConfirm = useConfirm()

// 输入参数
const props = defineProps({
  subscribe: Object as PropType<Subscribe>,
})

// 定义触发的自定义事件
const emit = defineEmits(['close', 'select', 'add', 'save'])

// 本地版本副本：启停/删除在本页直接保存，不经过编辑弹窗
const versions = ref<SubscribeVersionRule[]>([])

watch(
  () => props.subscribe,
  value => {
    versions.value = JSON.parse(JSON.stringify(value?.version_rules ?? [])) as SubscribeVersionRule[]
  },
  { immediate: true },
)

// 版本运行事实
function versionProgress(rule: SubscribeVersionRule) {
  return props.subscribe?.version_progress?.[rule.id]
}

function isCompleted(rule: SubscribeVersionRule) {
  return versionProgress(rule)?.completed === true
}

// 版本总集数:优先版本自定义总集数,否则回落订阅总集数
function versionTotal(rule: SubscribeVersionRule) {
  return rule.settings?.total_episode ?? props.subscribe?.total_episode ?? 0
}

// 已下载集数:与 SubscribeCard downloadedEpisode 同口径
function downloadedEpisodes(rule: SubscribeVersionRule) {
  const total = versionTotal(rule)
  if (!total) return 0
  const lack = versionProgress(rule)?.lack_episode ?? 0
  return Math.min(Math.max(total - lack, 0), total)
}

// 第 2 行进度文案:复用订阅卡片 hover 的「已下载 X · 共 Y 集」语义
function progressText(rule: SubscribeVersionRule) {
  const total = versionTotal(rule)
  if (!total) return ''
  return t('subscribe.subscribeProgressTooltip', { downloaded: downloadedEpisodes(rule), total })
}

// 完成满格,其余按已下载占比取整
function progressPercent(rule: SubscribeVersionRule) {
  if (isCompleted(rule)) return 100
  const total = versionTotal(rule)
  if (!total) return 0
  return Math.round((downloadedEpisodes(rule) / total) * 100)
}

// 进度条配色:运行/完成 success,停用 secondary(同 SubscribeCard 状态色映射)
function progressColor(rule: SubscribeVersionRule) {
  return rule.enabled ? 'success' : 'secondary'
}

// 版本副标题:运行状态
function versionSubtitle(rule: SubscribeVersionRule) {
  if (isCompleted(rule)) return t('dialog.subscribeVersions.completed')
  if (!rule.enabled) return t('dialog.subscribeVersions.disabled')
  return ''
}

// 行首状态指示图标:运行中 mdi-rss / 已完成 mdi-check-circle / 已停用 mdi-pause-circle-outline
function versionIcon(rule: SubscribeVersionRule) {
  if (isCompleted(rule)) return { icon: 'mdi-check-circle', color: 'success' }
  if (!rule.enabled) return { icon: 'mdi-pause-circle-outline', color: 'secondary' }
  return { icon: 'mdi-rss', color: 'success' }
}

// 底条汇总:已完成 X / Y(语义同 SubscribeCard completedVersionCount/versionCount)
const completedVersionCount = computed(
  () => versions.value.filter(rule => versionProgress(rule)?.completed === true).length,
)
const summaryText = computed(() =>
  t('dialog.subscribeVersions.summary', { completed: completedVersionCount.value, total: versions.value.length }),
)

// 移动端(sm 以下)启停/删除按钮保持默认命中区,桌面端收紧为 small
const actionBtnSize = computed(() => (display.smAndUp.value ? ('small' as const) : undefined))

// 订阅显示名
const displayName = computed(() => {
  const name = props.subscribe?.name ?? ''
  const season = props.subscribe?.season
  if (season === null || season === undefined) return name
  return `${name} ${formatSeason(season.toString())}`
})

// 持久化版本数组（启停/删除共用）
const saving = ref(false)

async function persistVersions(next: SubscribeVersionRule[]) {
  if (!props.subscribe || saving.value) return
  saving.value = true
  try {
    const payload = {
      ...props.subscribe,
      version_rules: next,
      version_mode: next.length ? 'all' : 'any',
    }
    const result: { [key: string]: unknown } = await api.put('subscribe/', payload)
    if (result.success) {
      versions.value = next
      emit('save')
    } else {
      $toast.error(typeof result.message === 'string' ? result.message : t('subscribe.requestFailed'))
    }
  } catch (error) {
    $toast.error(t('subscribe.requestFailed'))
    console.log(error)
  } finally {
    saving.value = false
  }
}

// 启用/停用版本
async function toggleVersion(rule: SubscribeVersionRule) {
  const next = versions.value.map(item => (item.id === rule.id ? { ...item, enabled: !rule.enabled } : item))
  await persistVersions(next)
}

// 删除版本：至少保留一个
async function deleteVersion(rule: SubscribeVersionRule) {
  if (versions.value.length <= 1) {
    $toast.error(t('dialog.subscribeEdit.versionLastCannotDelete'))
    return
  }
  const confirmed = await createConfirm({
    title: t('common.confirm'),
    content: t('dialog.subscribeVersions.deleteConfirm', { name: rule.name }),
  })
  if (!confirmed) return
  await persistVersions(versions.value.filter(item => item.id !== rule.id))
}

// 选择版本进入编辑
function selectVersion(rule: SubscribeVersionRule) {
  // saving 期间行样式只挡指针事件,键盘 Enter 仍会触发行点击,这里拦截
  if (saving.value) return
  emit('select', rule.id)
}

// 新增版本
function addVersion() {
  if (saving.value) return
  emit('add')
}
</script>

<template>
  <VDialog scrollable max-width="28rem" :fullscreen="!display.smAndUp.value">
    <VCard>
      <VProgressLinear v-if="saving" indeterminate color="primary" absolute />
      <VCardItem class="py-2">
        <VDialogCloseBtn @click="emit('close')" />
        <template #prepend>
          <VIcon icon="mdi-layers-triple-outline" class="me-2" />
        </template>
        <VCardTitle>{{ t('dialog.subscribeVersions.title') }}</VCardTitle>
        <VCardSubtitle class="text-truncate">{{ displayName }}</VCardSubtitle>
      </VCardItem>
      <VCardText>
        <LoadingBanner v-if="!props.subscribe" />
        <div v-else-if="versions.length === 0" class="subscribe-versions-empty">
          <VIcon class="subscribe-versions-empty__icon" icon="mdi-layers-off-outline" size="30" />
          <div class="subscribe-versions-empty__headline">{{ t('dialog.subscribeVersions.noVersions') }}</div>
          <div class="subscribe-versions-empty__description">{{ t('dialog.subscribeVersions.noVersionsHint') }}</div>
          <VBtn color="primary" variant="flat" prepend-icon="mdi-plus" class="px-5 mt-4" @click="addVersion">
            {{ t('dialog.subscribeVersions.addVersion') }}
          </VBtn>
        </div>
        <VList v-else class="py-0 d-flex flex-column ga-2">
          <VListItem
            v-for="rule in versions"
            :key="rule.id"
            class="subscribe-version-item"
            :class="{ 'subscribe-version-item--saving': saving }"
            rounded="lg"
            @click="selectVersion(rule)"
          >
            <VTooltip activator="parent" location="top">{{ t('dialog.subscribeVersions.editVersionHint') }}</VTooltip>
            <template #prepend>
              <VIcon
                :icon="versionIcon(rule).icon"
                :color="versionIcon(rule).color"
                :data-version-state-icon="versionIcon(rule).icon"
              />
            </template>
            <VListItemTitle class="subscribe-version-title">
              <span class="subscribe-version-name" :title="rule.name">{{ rule.name }}</span>
              <VChip
                v-if="versionSubtitle(rule)"
                size="x-small"
                variant="tonal"
                :color="isCompleted(rule) ? 'success' : 'secondary'"
                class="ms-2 flex-shrink-0"
              >
                {{ versionSubtitle(rule) }}
              </VChip>
            </VListItemTitle>
            <VListItemSubtitle v-if="versionProgress(rule) && versionTotal(rule)" class="subscribe-version-progress">
              <span class="text-caption text-medium-emphasis">{{ progressText(rule) }}</span>
              <VProgressLinear
                :model-value="progressPercent(rule)"
                :color="progressColor(rule)"
                bg-opacity="0.18"
                height="3"
                rounded
              />
            </VListItemSubtitle>
            <template #append>
              <IconBtn
                :size="actionBtnSize"
                :color="rule.enabled ? 'success' : 'grey'"
                :disabled="saving"
                :aria-label="rule.enabled ? t('common.pause') : t('common.enable')"
                @click.stop="toggleVersion(rule)"
              >
                <VIcon :icon="rule.enabled ? 'mdi-pause-circle-outline' : 'mdi-play-circle-outline'" size="20" />
                <VTooltip activator="parent" location="top">
                  {{ rule.enabled ? t('common.pause') : t('common.enable') }}
                </VTooltip>
              </IconBtn>
              <IconBtn
                :size="actionBtnSize"
                :disabled="saving"
                :aria-label="t('dialog.subscribeEdit.deleteVersion')"
                class="subscribe-version-delete"
                @click.stop="deleteVersion(rule)"
              >
                <VIcon icon="mdi-delete-outline" size="20" />
                <VTooltip activator="parent" location="top">{{ t('dialog.subscribeEdit.deleteVersion') }}</VTooltip>
              </IconBtn>
              <span class="text-disabled ms-1">
                <VIcon icon="mdi-chevron-right" />
              </span>
            </template>
          </VListItem>
        </VList>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <span v-if="versions.length > 0" class="text-caption text-medium-emphasis">{{ summaryText }}</span>
        <VSpacer />
        <VBtn color="primary" variant="flat" prepend-icon="mdi-plus" class="px-5" :disabled="saving" @click="addVersion">
          {{ t('dialog.subscribeVersions.addVersion') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped>
.subscribe-version-item {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));

  &:hover {
    background-color: rgba(var(--v-theme-on-surface), 0.04);
  }

  &:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
  }
}

// 保存中整行降透明度并禁用交互,配合顶部 indeterminate 进度条
.subscribe-version-item--saving {
  opacity: 0.6;
  pointer-events: none;
}

// 第 2 行承载进度文案与进度条,解除 VListItemSubtitle 默认单行截断
.subscribe-version-progress {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
}

// 版本名占满剩余宽度并截断，状态徽章固定不被挤压
.subscribe-version-title {
  display: flex;
  align-items: center;
}

.subscribe-version-name {
  flex: 1 1 auto;
  font-weight: 500;
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// 删除按钮默认保持中性，悬停时才强调错误色，与启停按钮视觉重量一致
.subscribe-version-delete:hover {
  color: rgb(var(--v-theme-error));
}

.subscribe-versions-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-block-size: 11rem;
  padding-block: 2rem;
  text-align: center;
}

.subscribe-versions-empty__icon {
  color: rgba(var(--v-theme-on-surface), 0.32);
  margin-block-end: 0.75rem;
}

.subscribe-versions-empty__headline {
  color: rgba(var(--v-theme-on-surface), 0.9);
  font-size: 1.05rem;
  font-weight: 600;
}

.subscribe-versions-empty__description {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.875rem;
  line-height: 1.65;
}
</style>
