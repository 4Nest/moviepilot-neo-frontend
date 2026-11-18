<script lang="ts" setup>
import type { StorageConf, TransferDirectoryConf } from '@/api/types'
import api from '@/api'
import { nextTick } from 'vue'
import { useI18n } from '@/composables/useChineseText'
import { storageRemoteDict } from '@/api/constants'

// 国际化
const { t } = useI18n()

// 输入参数
const props = defineProps({
  type: String, // download/library
  directory: {
    type: Object as PropType<TransferDirectoryConf>,
    required: true, // 必填参数
  },
  categories: {
    type: Object as PropType<{ [key: string]: any }>,
    required: true,
  },
  storages: {
    type: Array as PropType<StorageConf[]>,
    required: true,
  },
  width: String,
  height: String,
})

// 卡片是否折叠状态
const isCollapsed = ref(true)

// 类型下拉字典
const typeItems = computed(() => [
  { title: t('common.all'), value: '' },
  { title: t('mediaType.movie'), value: '电影' },
  { title: t('mediaType.tv'), value: '电视剧' },
])

// 计算资源存储字典（整理方式为下载器时不能为远程存储）
const resourceStorageOptions = computed(() => {
  return props.storages
    .filter(item => !storageRemoteDict[item.type] || props.directory.monitor_type !== 'downloader')
    .map(item => ({
      title: item.name,
      value: item.type,
    }))
})

// 存储字典
const libraryStorageOptions = computed(() => {
  return props.storages.map(item => ({
    title: item.name,
    value: item.type,
  }))
})

// 自动整理方式下拉字典
const transferSourceItems = computed(() => [
  { title: t('directory.noTransfer'), value: '' },
  { title: t('directory.downloaderMonitor'), value: 'downloader' },
  { title: t('directory.directoryMonitor'), value: 'monitor' },
  { title: t('directory.manualTransfer'), value: 'manual' },
])

// 折叠态摘要信息
const directorySummaryTags = computed(() => {
  const tags: string[] = []
  const mediaLabel = props.directory.media_category || props.directory.media_type || t('common.all')
  tags.push(mediaLabel)
  if (props.directory.download_path) {
    tags.push(props.directory.download_path)
  }
  if (props.directory.monitor_type && props.directory.library_path) {
    tags.push(`→ ${props.directory.library_path}`)
  }
  return tags
})

// 监控模式下拉字典
const MonitorModeItems = computed(() => [
  { title: t('directory.performanceMode'), value: 'fast' },
  { title: t('directory.compatibilityMode'), value: 'compatibility' },
])

// 整理方式下拉字典
const transferTypeItems = ref<{ title: string; value: string }[]>([])

// 调用API查询支持的整理方式
async function loadTransferTypeItems() {
  // 参数不全时不查询
  if (!props.directory.library_storage || !props.directory.storage) return
  try {
    // 下载器储存整理方法
    const storage_res = await api.get(`storage/transtype/${props.directory.storage}`)
    const storage_transtype = (storage_res as any)?.transtype
    // 媒体库储存整理方法
    const library_storage_res = await api.get(`storage/transtype/${props.directory.library_storage}`)
    const library_storage_transtype = (library_storage_res as any)?.transtype
    // 为空终止
    if (!library_storage_transtype || !storage_transtype) return
    // 取交集
    const transtype: { [key: string]: string } = {}
    Object.keys(storage_transtype).forEach(key => {
      if (key in library_storage_transtype) {
        transtype[key] = storage_transtype[key]
      }
    })
    // 非空时设置整理方式下拉字典
    if (transtype && Object.keys(transtype).length > 0) {
      transferTypeItems.value = Object.keys(transtype).map(key => ({
        title: transtype[key],
        value: key,
      }))
      // 如果整理方式下拉字典不为空，且当前值不在新的transferTypeItems里，则设置整理方式为第一个
      if (
        transferTypeItems.value.length > 0 &&
        !transferTypeItems.value.find(item => item.value === props.directory.transfer_type)
      ) {
        nextTick(() => {
          props.directory.transfer_type = transferTypeItems.value[0].value
        })
      }
      // 如果整理方式下拉字典为空，清空整理方式
      if (transferTypeItems.value.length === 0) {
        props.directory.transfer_type = ''
      }
    } else {
      // 无可用整理方式，清除已选值
      transferTypeItems.value = []
      props.directory.transfer_type = ''
    }
  } catch (e) {
    console.log(e)
  }
}

// 整理方式无数据提示
const computedNoDataText = computed(() => {
  if (!props.directory.library_storage && !props.directory.storage) {
    return t('directory.pleaseSelectStorage')
  } else if (!props.directory.library_storage) {
    return t('directory.pleaseSelectLibraryStorage')
  } else if (!props.directory.storage) {
    return t('directory.pleaseSelectDownloadStorage')
  } else {
    return t('directory.noSupportedTransferType')
  }
})

// 覆盖模式下拉字典
const overwriteModeItems = computed(() => [
  { title: t('directory.never'), value: 'never' },
  { title: t('directory.always'), value: 'always' },
  { title: t('directory.byFileSize'), value: 'size' },
  { title: t('directory.keepLatestOnly'), value: 'latest' },
])

// 定义触发的自定义事件
const emit = defineEmits(['close', 'changed', 'update:modelValue'])

// 按钮点击
function onClose() {
  emit('close')
}

// 根据选中的媒体类型，获取对应的媒体类别
const getCategories = computed(() => {
  const default_value = [{ title: t('common.all'), value: '' }]
  if (!props.categories || !props.categories[props.directory?.media_type ?? '']) return default_value
  return default_value.concat(props.categories[props.directory.media_type ?? ''])
})

const showDownloadSubfolderSwitches = computed(
  () =>
    !props.directory.media_type ||
    props.directory.media_type === '' ||
    !props.directory.media_category ||
    props.directory.media_category === '',
)

// 监听 资源存储与媒体库储存 变化，重新加载整理方式下拉字典
watch(
  [() => props.directory.library_storage, () => props.directory.storage],
  ([newLibraryStorage, newStorage], [oldLibraryStorage, oldStorage]) => {
    if (newLibraryStorage !== oldLibraryStorage || newStorage !== oldStorage) {
      loadTransferTypeItems()
    }
  },
  { immediate: true },
)

// 媒体类别和类型变更非空时，将按类型分类和按类别分类置为false
watch(
  [() => props.directory.media_type, () => props.directory.media_category],
  ([newMediaType, newMediaCategory], [oldMediaType, oldMediaCategory]) => {
    if (newMediaType && newMediaType !== oldMediaType) {
      props.directory.download_type_folder = false
      props.directory.library_type_folder = false
    }
    if (newMediaCategory && newMediaCategory !== oldMediaCategory) {
      props.directory.download_category_folder = false
      props.directory.library_category_folder = false
    }
  },
)

// 监听monitor_type变化，如果为downloader则设置为本地
watch(
  () => props.directory.monitor_type,
  newMonitorType => {
    if (newMonitorType === 'downloader') {
      props.directory.storage = 'local'
    }
  },
)
</script>

<template>
  <VCard
    v-bind="$attrs"
    variant="flat"
    class="app-card-shell directory-card"
    :width="props.width"
    :height="props.height"
  >
    <!-- 卡片头部：34×34 柔和文件夹图标底座 + 目录别名编辑框 + 紧凑中性色操作按钮组 -->
    <div class="directory-card__header">
      <span class="directory-card__icon-badge" @click="isCollapsed = !isCollapsed">
        <VIcon :icon="isCollapsed ? 'mdi-folder-outline' : 'mdi-folder-open-outline'" size="18" />
      </span>
      <VTextField
        v-model="props.directory.name"
        variant="outlined"
        density="compact"
        hide-details
        :label="t('directory.alias')"
        class="directory-card__name-field text-high-emphasis font-weight-medium"
      />
      <div class="directory-card__actions" @click.stop>
        <VBtn
          variant="text"
          color="default"
          icon
          class="directory-card__action-btn"
          :title="isCollapsed ? '展开目录配置' : '折叠目录配置'"
          :aria-label="isCollapsed ? '展开目录配置' : '折叠目录配置'"
          @click.stop="isCollapsed = !isCollapsed"
        >
          <VIcon :icon="isCollapsed ? 'mdi-chevron-down' : 'mdi-chevron-up'" size="18" />
        </VBtn>
        <VBtn
          variant="text"
          color="default"
          icon
          class="directory-card__action-btn cursor-move"
          title="拖拽调整优先级"
          aria-label="拖拽调整优先级"
          @click.stop
        >
          <VIcon class="cursor-move" icon="mdi-drag" size="18" />
        </VBtn>
        <VBtn
          variant="text"
          color="default"
          icon
          class="directory-card__action-btn directory-card__action-btn--delete"
          :title="t('common.delete')"
          :aria-label="t('common.delete')"
          @click.stop="onClose"
        >
          <VIcon icon="mdi-close" size="17" />
        </VBtn>
      </div>
    </div>

    <!-- 折叠态摘要标签（点击可快捷展开） -->
    <div v-if="isCollapsed" class="directory-card__summary" @click="isCollapsed = false">
      <span v-for="(tag, idx) in directorySummaryTags" :key="idx" class="directory-card__summary-pill" :title="tag">
        {{ tag }}
      </span>
    </div>

    <!-- 展开态双小节宽敞表单区（零截断、舒适行距） -->
    <VCardText v-else class="directory-card__body">
      <VForm @submit.prevent="() => {}">
        <!-- 第一小节：资源下载目录 -->
        <div class="directory-card__section">
          <div class="directory-card__section-head">
            <VIcon icon="mdi-tray-arrow-down" size="15" class="directory-card__section-icon" />
            <span>资源下载目录</span>
          </div>

          <VRow class="directory-card__form-row">
            <VCol cols="12" sm="6">
              <VAutocomplete
                v-model="props.directory.media_type"
                variant="outlined"
                density="compact"
                hide-details="auto"
                :items="typeItems"
                :label="t('directory.mediaType')"
                @update:modelValue="props.directory.media_category = ''"
              />
            </VCol>
            <VCol cols="12" sm="6">
              <VAutocomplete
                v-model="props.directory.media_category"
                variant="outlined"
                density="compact"
                hide-details="auto"
                :items="getCategories"
                :label="t('directory.mediaCategory')"
              />
            </VCol>
            <VCol cols="12" sm="4">
              <VAutocomplete
                v-model="props.directory.storage"
                variant="outlined"
                density="compact"
                hide-details="auto"
                :items="resourceStorageOptions"
                :label="t('directory.resourceStorage')"
              />
            </VCol>
            <VCol cols="12" sm="8">
              <VPathField
                v-model="props.directory.download_path"
                :storage="props.directory.storage"
                variant="outlined"
                density="compact"
                hide-details="auto"
                :label="t('directory.resourceDirectory')"
              />
            </VCol>
          </VRow>

          <div v-if="showDownloadSubfolderSwitches" class="directory-card__switch-box mt-3">
            <VSwitch
              v-if="!props.directory.media_type || props.directory.media_type === ''"
              v-model="props.directory.download_type_folder"
              :label="t('directory.sortByType')"
              color="primary"
              density="compact"
              hide-details
              inset
            />
            <VSwitch
              v-if="!props.directory.media_category || props.directory.media_category === ''"
              v-model="props.directory.download_category_folder"
              :label="t('directory.sortByCategory')"
              color="primary"
              density="compact"
              hide-details
              inset
            />
          </div>
        </div>

        <!-- 第二小节：媒体库入库与整理 -->
        <div class="directory-card__section directory-card__section--bordered">
          <div class="directory-card__section-head">
            <VIcon icon="mdi-folder-sync-outline" size="15" class="directory-card__section-icon" />
            <span>媒体库入库与整理</span>
          </div>

          <VRow class="directory-card__form-row">
            <VCol cols="12" :sm="props.directory.monitor_type === 'monitor' ? 6 : 12">
              <VSelect
                v-model="props.directory.monitor_type"
                variant="outlined"
                density="compact"
                hide-details="auto"
                :items="transferSourceItems"
                :label="t('directory.autoTransfer')"
              />
            </VCol>
            <VCol v-if="props.directory.monitor_type === 'monitor'" cols="12" sm="6">
              <VSelect
                v-model="props.directory.monitor_mode"
                variant="outlined"
                density="compact"
                hide-details="auto"
                :items="MonitorModeItems"
                :label="t('directory.monitorMode')"
              />
            </VCol>

            <template v-if="props.directory.monitor_type">
              <VCol cols="12" sm="4">
                <VAutocomplete
                  v-model="props.directory.library_storage"
                  variant="outlined"
                  density="compact"
                  hide-details="auto"
                  :items="libraryStorageOptions"
                  :label="t('directory.libraryStorage')"
                />
              </VCol>
              <VCol cols="12" sm="8">
                <VPathField
                  v-model="props.directory.library_path"
                  :storage="props.directory.library_storage"
                  variant="outlined"
                  density="compact"
                  hide-details="auto"
                  :label="t('directory.libraryDirectory')"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VSelect
                  v-model="props.directory.transfer_type"
                  variant="outlined"
                  density="compact"
                  hide-details="auto"
                  :items="transferTypeItems"
                  :label="t('directory.transferType')"
                  :no-data-text="computedNoDataText"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VSelect
                  v-model="props.directory.overwrite_mode"
                  variant="outlined"
                  density="compact"
                  hide-details="auto"
                  :items="overwriteModeItems"
                  :label="t('directory.overwriteMode')"
                />
              </VCol>
            </template>
          </VRow>

          <div v-if="props.directory.monitor_type" class="directory-card__switch-box mt-3">
            <VSwitch
              v-if="!props.directory.media_type || props.directory.media_type === ''"
              v-model="props.directory.library_type_folder"
              :label="t('directory.sortByType')"
              color="primary"
              density="compact"
              hide-details
              inset
            />
            <VSwitch
              v-if="!props.directory.media_category || props.directory.media_category === ''"
              v-model="props.directory.library_category_folder"
              :label="t('directory.sortByCategory')"
              color="primary"
              density="compact"
              hide-details
              inset
            />
            <VSwitch
              v-model="props.directory.renaming"
              :label="t('directory.smartRename')"
              color="primary"
              density="compact"
              hide-details
              inset
            />
            <VSwitch
              v-model="props.directory.scraping"
              :label="t('directory.scrapingMetadata')"
              color="primary"
              density="compact"
              hide-details
              inset
            />
            <VSwitch
              v-model="props.directory.notify"
              :label="t('directory.sendNotification')"
              color="primary"
              density="compact"
              hide-details
              inset
            />
          </div>
        </div>
      </VForm>
    </VCardText>
  </VCard>
</template>

<style scoped>
.directory-card {
  border: 1px solid var(--mp-border-card);
  border-radius: 12px !important;
  background-color: rgba(var(--v-theme-on-surface), 0.025) !important;
  transition: border-color 0.16s ease;
}

.directory-card:hover {
  border-color: var(--mp-border-hover);
}

.directory-card :deep(.v-field) {
  border-radius: 8px;
}

.directory-card__header {
  display: flex;
  align-items: center;
  padding: 12px 14px;
  gap: 10px;
}

.directory-card__icon-badge {
  display: inline-flex;
  flex: 0 0 34px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 8px;
  background: var(--mp-item-bg, rgba(var(--v-theme-on-surface), 0.04));
  block-size: 34px;
  color: rgba(var(--v-theme-on-surface), 0.72);
  cursor: pointer;
  inline-size: 34px;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.directory-card__icon-badge:hover {
  background: rgba(var(--v-theme-on-surface), 0.07);
  color: rgb(var(--v-theme-on-surface));
}

.directory-card__name-field {
  flex: 1 1 auto;
  min-inline-size: 0;
}

.directory-card__actions {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 2px;
}

.directory-card__action-btn {
  padding: 0 !important;
  border-radius: 7px !important;
  block-size: 30px !important;
  color: rgba(var(--v-theme-on-surface), 0.56) !important;
  inline-size: 30px !important;
  min-inline-size: 30px !important;
}

.directory-card__action-btn:hover {
  background: rgba(var(--v-theme-on-surface), 0.06) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
}

.directory-card__action-btn--delete:hover {
  background: rgba(var(--v-theme-error), 0.1) !important;
  color: rgb(var(--v-theme-error)) !important;
}

.directory-card__summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  padding: 0 14px 12px 58px;
  cursor: pointer;
  gap: 6px;
}

.directory-card__summary-pill {
  overflow: hidden;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 6px;
  background: var(--mp-item-bg, rgba(var(--v-theme-on-surface), 0.04));
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  line-height: 1.45;
  max-inline-size: 100%;
  padding-block: 2px;
  padding-inline: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.directory-card__body {
  padding: 4px 16px 16px !important;
  border-block-start: 1px solid var(--mp-border-subtle);
}

.directory-card__section {
  padding-block-start: 12px;
}

.directory-card__section--bordered {
  border-block-start: 1px solid var(--mp-border-subtle);
  margin-block-start: 14px;
  padding-block-start: 14px;
}

.directory-card__section-head {
  display: flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 12.5px;
  font-weight: 600;
  gap: 6px;
  margin-block-end: 12px;
}

.directory-card__section-icon {
  color: rgba(var(--v-theme-on-surface), 0.56);
}

.directory-card__form-row {
  row-gap: 4px;
}

.directory-card__switch-box {
  display: grid;
  padding: 8px 12px;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 8px;
  background: var(--mp-item-bg);
  gap: 6px 14px;
  grid-template-columns: repeat(auto-fill, minmax(145px, 1fr));
}

.directory-card__switch-box :deep(.v-selection-control) {
  min-block-size: 24px;
}

.directory-card__switch-box :deep(.v-label) {
  font-size: 13px;
}

@media (width <= 600px) {
  .directory-card__summary {
    padding-inline-start: 14px;
  }
}
</style>
