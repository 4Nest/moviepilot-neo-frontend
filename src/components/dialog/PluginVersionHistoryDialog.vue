<script setup lang="ts">
import api from '@/api'
import type { Plugin, PluginReleaseVersion, PluginReleaseVersionsResponse } from '@/api/types'
import VersionHistory from '@/components/misc/VersionHistory.vue'
import { useI18n } from '@/composables/useChineseText'

// 多语言
const { t } = useI18n()

// 输入参数
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: true,
  },
  plugin: {
    type: Object as PropType<Plugin>,
    required: true,
  },
  showUpdateAction: {
    type: Boolean,
    default: false,
  },
  actionMode: {
    type: String as PropType<'install' | 'update'>,
    default: 'update',
  },
  updating: {
    type: Boolean,
    default: false,
  },
})

// 定义触发的自定义事件
const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'close'): void
  (event: 'update', releaseVersion?: string, repoUrl?: string): void
}>()

const loading = ref(false)
const loadError = ref('')
const pluginDetail = ref<Plugin | null>(null)
const releaseLoading = ref(false)
const releaseError = ref('')
const releaseDetail = ref<PluginReleaseVersionsResponse | null>(null)
// 递增序号用于在关闭或切换插件后丢弃延迟返回的旧请求结果。
let loadSequence = 0

// 弹窗显示状态
const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

const resolvedPlugin = computed(() => pluginDetail.value ?? props.plugin)

const resolvedHistory = computed(() => {
  const declaredHistory = Object.fromEntries(
    Object.entries(resolvedPlugin.value?.history || {}).map(([version, body]) => [
      normalizeHistoryVersion(version),
      body,
    ]),
  )
  const history: Record<string, string> = {}

  // Release 与 history 可能来自不同数据源；合并后统一按版本号降序，不能依赖接口返回或对象插入顺序。
  const entries = new Map<string, string>(Object.entries(declaredHistory))
  releaseItems.value.forEach(item => {
    const key = normalizeHistoryVersion(item.version)
    if (!entries.has(key)) entries.set(key, item.body || '')
  })

  Array.from(entries.entries())
    .sort(([left], [right]) => compareVersions(right, left))
    .forEach(([version, body]) => {
      history[version] = body
    })

  return history
})

const hasHistory = computed(() => Object.keys(resolvedHistory.value).length > 0)
// 已有传入快照时直接渲染历史内容，仅在无内容可展示时使用居中加载占位。
const showBlockingLoading = computed(() => loading.value && !hasHistory.value)
const showTopProgress = computed(() => !showBlockingLoading.value && (loading.value || releaseLoading.value))

// 兼容旧后端按原始字符串标记版本的响应，避免 v 前缀差异导致最新版和当前版本失配。
const releaseItems = computed(() => {
  const detail = releaseDetail.value
  return (detail?.items || []).map(item => ({
    ...item,
    is_latest: detail?.latest_version
      ? normalizeHistoryVersion(item.version) === normalizeHistoryVersion(detail.latest_version)
      : item.is_latest,
    is_current: detail?.current_version
      ? normalizeHistoryVersion(item.version) === normalizeHistoryVersion(detail.current_version)
      : item.is_current,
  }))
})

// 优先使用本次强制刷新的更新判据；旧接口缺少标记时才比较 Release 版本，未知状态保持不可操作。
const latestUpdateAvailable = computed(() => {
  if (typeof pluginDetail.value?.has_update === 'boolean') return pluginDetail.value.has_update
  const latestVersion = releaseDetail.value?.latest_version
  const currentVersion = releaseDetail.value?.current_version || pluginDetail.value?.plugin_version
  return latestVersion && currentVersion ? isVersionHigher(latestVersion, currentVersion) : null
})

const updateCheckComplete = computed(
  () => !loading.value && !releaseLoading.value && !loadError.value && !releaseError.value,
)

const latestActionText = computed(() =>
  props.actionMode === 'install'
    ? t('plugin.installReleaseVersion')
    : updateCheckComplete.value && latestUpdateAvailable.value === false
      ? t('plugin.upToDate')
      : t('plugin.updateToLatest'),
)

const latestActionDisabled = computed(
  () =>
    props.updating ||
    !updateCheckComplete.value ||
    resolvedPlugin.value?.system_version_compatible === false ||
    (props.actionMode === 'update' && latestUpdateAvailable.value !== true),
)

// 保留调用方要求的底部面板，无更新时展示禁用提示。
const shouldShowUpdatePanel = computed(() => props.showUpdateAction)

const releaseByHistoryVersion = computed(() => {
  const releaseMap = new Map<string, PluginReleaseVersion>()
  releaseItems.value.forEach(item => {
    releaseMap.set(normalizeHistoryVersion(item.version), item)
  })
  return releaseMap
})

/** 历史与 Release 共用带 v 前缀的展示键。 */
function normalizeHistoryVersion(version: string) {
  return `v${version.trim().replace(/^v/i, '')}`
}

/** 将版本拆成数值段，兼容插件旧的连字符版本。 */
function versionParts(value: string) {
  return value
    .replace(/^v/i, '')
    .split(/[.-]/)
    .map(part => Number.parseInt(part, 10) || 0)
}

/** 按数值段比较，避免字典序把 3.10 排在 3.9 之前。 */
function compareVersions(left: string, right: string) {
  const leftParts = versionParts(left)
  const rightParts = versionParts(right)
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0)
    if (difference !== 0) return difference
  }
  return 0
}

/** 缺失版本不能被视为可升级版本。 */
function isVersionHigher(candidate?: string | null, current?: string | null) {
  if (!candidate || !current) return false
  return compareVersions(candidate, current) > 0
}

function formatReleaseDate(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('zh-CN')
}

function releaseItemByHistoryVersion(version: string) {
  return releaseByHistoryVersion.value.get(version)
}

function shouldShowReleaseButton(item?: PluginReleaseVersion) {
  if (!item || item.is_current) return false
  return !(item.is_latest && shouldShowUpdatePanel.value && props.actionMode === 'update')
}

/** 打开时优先保留传入快照并异步刷新历史与 Release，市场未安装条目不查询已安装接口。 */
async function loadPluginHistory() {
  const requestSequence = ++loadSequence
  pluginDetail.value = null
  loadError.value = ''
  releaseDetail.value = null
  releaseError.value = ''

  if (!props.plugin?.id) {
    loading.value = false
    releaseLoading.value = false
    return
  }

  // 插件市场条目已经携带远端信息；history 接口只查询已安装插件，
  // 未安装插件打开版本历史时只能基于传入的市场数据和 Release 列表展示。
  if (props.actionMode === 'install' && props.plugin?.repo_url) {
    loading.value = false
    await loadPluginReleases(props.plugin, false, requestSequence)
    return
  }

  loading.value = true
  try {
    const fetchedDetail: Plugin | null = await api.get(`plugin/history/${props.plugin.id}`, {
      params: {
        force: true,
      },
    })
    if (requestSequence !== loadSequence) return
    pluginDetail.value = fetchedDetail
  } catch (error) {
    if (requestSequence !== loadSequence) return
    pluginDetail.value = null
    loadError.value = t('plugin.updateHistoryLoadFailed')
    console.error(error)
    return
  } finally {
    if (requestSequence === loadSequence) {
      loading.value = false
    }
  }

  // 历史说明返回后立即解除主加载态，再异步补齐 Release 列表。
  await loadPluginReleases(pluginDetail.value ?? props.plugin, true, requestSequence)
}

async function loadPluginReleases(
  plugin: Plugin | null | undefined = resolvedPlugin.value,
  force = false,
  requestSequence = loadSequence,
) {
  if (!plugin?.id || !plugin?.repo_url || !plugin?.release) {
    if (requestSequence === loadSequence) {
      releaseDetail.value = null
      releaseError.value = ''
      releaseLoading.value = false
    }
    return
  }

  releaseLoading.value = true
  releaseError.value = ''

  try {
    const detail: PluginReleaseVersionsResponse | null = await api.get(`plugin/releases/${plugin.id}`, {
      params: {
        repo_url: plugin.repo_url,
        force,
      },
    })
    if (requestSequence !== loadSequence) return
    releaseDetail.value = detail
  } catch (error) {
    if (requestSequence !== loadSequence) return
    releaseDetail.value = null
    releaseError.value = t('plugin.releaseVersionsLoadFailed')
    console.error(error)
  } finally {
    if (requestSequence === loadSequence) {
      releaseLoading.value = false
    }
  }
}

/** 触发插件更新操作。 */
function handleUpdate(releaseItem?: PluginReleaseVersion) {
  if (props.updating) return
  if ((!releaseItem || releaseItem.is_latest) && latestActionDisabled.value) return
  emit('update', releaseItem?.is_latest ? undefined : releaseItem?.version, resolvedPlugin.value?.repo_url)
}

watch(
  () => [visible.value, props.plugin?.id],
  ([isVisible]) => {
    if (isVisible) {
      void loadPluginHistory()
    } else {
      loadSequence += 1
      loading.value = false
      releaseLoading.value = false
    }
  },
  { immediate: true },
)
</script>

<template>
  <VDialog v-if="visible" v-model="visible" width="680" max-height="85vh" scrollable>
    <VCard :title="t('plugin.updateHistoryTitle', { name: resolvedPlugin?.plugin_name })">
      <VDialogCloseBtn v-model="visible" />
      <VDivider />
      <VProgressLinear v-if="showTopProgress" indeterminate color="primary" height="2" />
      <div v-if="showBlockingLoading" class="plugin-version-history-dialog__loading">
        <VProgressCircular indeterminate color="primary" />
      </div>
      <template v-else>
        <VCardText v-if="loadError || releaseError" class="pb-0">
          <VAlert v-if="loadError" type="warning" variant="tonal" density="compact" :text="loadError" />
          <VAlert
            v-if="releaseError"
            type="warning"
            variant="tonal"
            density="compact"
            :class="{ 'mt-2': loadError }"
            :text="releaseError"
          />
        </VCardText>
        <VCardText v-if="!hasHistory && !loading && !releaseLoading && !loadError && !releaseError">
          <VAlert type="info" variant="tonal" density="compact" :text="t('plugin.updateHistoryEmpty')" />
        </VCardText>
        <VersionHistory
          v-if="hasHistory"
          :history="resolvedHistory"
          :has-action="version => shouldShowReleaseButton(releaseItemByHistoryVersion(version))"
        >
          <template #meta="{ version }">
            <div v-if="releaseItemByHistoryVersion(version)" class="plugin-release-meta">
              <span
                v-if="formatReleaseDate(releaseItemByHistoryVersion(version)?.published_at)"
                class="plugin-release-meta__date"
              >
                {{ formatReleaseDate(releaseItemByHistoryVersion(version)?.published_at) }}
              </span>
              <VChip
                v-if="releaseItemByHistoryVersion(version)?.is_latest"
                size="x-small"
                color="primary"
                variant="tonal"
              >
                {{ t('plugin.latestVersion') }}
              </VChip>
              <VChip
                v-if="releaseItemByHistoryVersion(version)?.is_current"
                size="x-small"
                color="success"
                variant="tonal"
              >
                {{ t('plugin.currentVersion') }}
              </VChip>
            </div>
          </template>
          <template #action="{ version }">
            <VBtn
              v-if="shouldShowReleaseButton(releaseItemByHistoryVersion(version))"
              class="plugin-release-button"
              size="small"
              min-width="5rem"
              :color="releaseItemByHistoryVersion(version)?.is_latest ? 'primary' : undefined"
              :variant="releaseItemByHistoryVersion(version)?.is_latest ? 'flat' : 'tonal'"
              :loading="props.updating"
              :disabled="
                props.updating ||
                releaseItemByHistoryVersion(version)?.is_current ||
                (releaseItemByHistoryVersion(version)?.is_latest && latestActionDisabled)
              "
              @click.stop="handleUpdate(releaseItemByHistoryVersion(version))"
            >
              {{
                releaseItemByHistoryVersion(version)?.is_latest ? latestActionText : t('plugin.installReleaseVersion')
              }}
            </VBtn>
          </template>
        </VersionHistory>
      </template>
      <template v-if="shouldShowUpdatePanel">
        <VDivider />
        <VCardItem>
          <VAlert
            v-if="resolvedPlugin?.system_version_compatible === false"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-3"
            :text="resolvedPlugin?.system_version_message || t('plugin.incompatibleSystemVersion')"
          />
          <VBtn block :loading="props.updating" :disabled="latestActionDisabled" @click="handleUpdate()">
            <template #prepend>
              <VIcon icon="mdi-arrow-up-circle-outline" />
            </template>
            {{ latestActionText }}
          </VBtn>
        </VCardItem>
      </template>
    </VCard>
  </VDialog>
</template>

<style scoped>
.plugin-version-history-dialog__loading {
  min-height: 12rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.plugin-release-button {
  white-space: nowrap;
}

.plugin-release-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  min-width: 0;
}

.plugin-release-meta__date {
  color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity));
  font-size: 0.875rem;
  white-space: nowrap;
}
</style>
