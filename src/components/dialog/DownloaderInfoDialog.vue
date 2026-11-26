<script setup lang="ts">
import type { DownloaderConf } from '@/api/types'
import { storageAttributes } from '@/api/constants'
import { cloneDeep } from 'lodash-es'
import { useToast } from 'vue-toastification'
import { useI18n } from '@/composables/useChineseText'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

// 获取i18n实例
const { t } = useI18n()

// 定义输入
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: true,
  },
  downloader: {
    type: Object as PropType<DownloaderConf>,
    required: true,
  },
  downloaders: {
    type: Array as PropType<DownloaderConf[]>,
    required: true,
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['update:modelValue', 'close', 'change', 'done'])

// 提示框
const $toast = useToast()

// 表单
const downloaderForm = ref()

// 下载器详情弹窗
const downloaderInfoDialog = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

// 下载器详情
const downloaderInfo = ref<DownloaderConf>({
  name: '',
  type: '',
  default: false,
  bt_default: false,
  bt_save_path: '',
  enabled: false,
  config: {},
  path_mapping: [],
})

// 路径映射行定义
interface PathMappingRow {
  id: string
  storage: string
  download: string
}

// 路径映射行数据
const pathMappingRows = ref<PathMappingRow[]>([])

// 路径前缀选项
const prefixOptions = computed(() => {
  return storageAttributes.map(item => ({
    title: t(`storage.${item.type}`),
    value: item.type,
  }))
})

/** 获取路径所属的存储类型。 */
function getStorageType(path: string) {
  if (!path) return 'local'
  const storage = storageAttributes.find(s => s.type !== 'local' && path.startsWith(`${s.type}:`))
  return storage?.type || 'local'
}

/** 将存储类型转换为路径前缀。 */
function storage2Prefix(storage: string) {
  return storage === 'local' ? '' : storage + ':'
}

/** 拆分存储路径的前缀和真实路径。 */
function parseStoragePath(path: string): [prefix: string, suffix: string] {
  if (!path) return ['', '']
  const storage = getStorageType(path)
  const prefix = storage2Prefix(storage)
  return [prefix, path.slice(prefix.length)]
}

/** 更新单行路径映射的存储前缀。 */
function updateStoragePrefix(row: PathMappingRow, storage: string) {
  const [, currentSuffix] = parseStoragePath(row.storage)
  const prefix = storage2Prefix(storage)
  row.storage = prefix + currentSuffix
}

/** 更新单行路径映射的存储路径主体。 */
function updateStorageSuffix(row: PathMappingRow, suffix: string) {
  const [currentPrefix] = parseStoragePath(row.storage)
  row.storage = currentPrefix + suffix
}

const pathValidationRules = [
  (v: string) => !!v || t('downloader.pathMappingRequired'),
  (v: string) => v.startsWith('/') || t('downloader.pathMappingError'),
]

/** 生成路径映射行使用的临时唯一 ID。 */
function generateId() {
  return Math.random().toString(36).substring(2, 9)
}

/** 初始化下载器新增配置项的兼容默认值。 */
function initializeDownloaderConfigDefaults() {
  if (!['qbittorrent', 'transmission'].includes(downloaderInfo.value.type)) return
  if (!downloaderInfo.value.config) downloaderInfo.value.config = {}
  if (downloaderInfo.value.type === 'qbittorrent' && downloaderInfo.value.config.incomplete_files_ext === undefined)
    downloaderInfo.value.config.incomplete_files_ext = true
  if (downloaderInfo.value.type === 'transmission' && downloaderInfo.value.config.rename_partial_files === undefined)
    downloaderInfo.value.config.rename_partial_files = true
}

/** 初始化下载器编辑表单数据。 */
function initializeDownloaderInfo() {
  downloaderInfo.value = cloneDeep(props.downloader)
  if (!downloaderInfo.value.enabled) {
    downloaderInfo.value.default = false
    downloaderInfo.value.bt_default = false
  }
  initializeDownloaderConfigDefaults()
  pathMappingRows.value = (downloaderInfo.value.path_mapping || []).map(item => ({
    id: generateId(),
    storage: item[0],
    download: item[1],
  }))
}

watch(
  () => downloaderInfo.value.enabled,
  enabled => {
    if (!enabled) {
      downloaderInfo.value.default = false
      downloaderInfo.value.bt_default = false
    }
  },
)

/** 保存下载器编辑结果并通知父级刷新。 */
async function saveDownloaderInfo() {
  const { valid } = (await downloaderForm.value?.validate()) || { valid: true }
  if (!valid) return

  if (!downloaderInfo.value.enabled) {
    downloaderInfo.value.default = false
    downloaderInfo.value.bt_default = false
  }

  downloaderInfo.value.path_mapping = pathMappingRows.value.map(row => [row.storage, row.download])

  if (!downloaderInfo.value.name) {
    $toast.error(t('downloader.nameRequired'))
    return
  }
  if (props.downloaders.some(item => item.name === downloaderInfo.value.name && item !== props.downloader)) {
    $toast.error(t('downloader.nameDuplicate'))
    return
  }
  if (downloaderInfo.value.default) {
    props.downloaders.forEach(item => {
      if (item.default && item !== props.downloader) {
        item.default = false
        $toast.info(t('downloader.defaultChanged'))
      }
    })
  }
  if (downloaderInfo.value.bt_default) {
    props.downloaders.forEach(item => {
      if (item.bt_default && item !== props.downloader) {
        item.bt_default = false
        $toast.info(t('downloader.btDefaultChanged'))
      }
    })
  }
  downloaderInfoDialog.value = false
  emit('change', cloneDeep(downloaderInfo.value), props.downloader.name)
  emit('done')
}

/** 新增一行路径映射。 */
function addPathMapping() {
  pathMappingRows.value.push({
    id: generateId(),
    storage: '',
    download: '',
  })
}

/** 移除指定位置的路径映射。 */
function removePathMapping(index: number) {
  pathMappingRows.value.splice(index, 1)
}

onMounted(() => {
  initializeDownloaderInfo()
})
</script>

<template>
  <VDialog
    v-if="downloaderInfoDialog"
    v-model="downloaderInfoDialog"
    scrollable
    max-width="44rem"
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard class="mp-dialog-card">
      <VCardItem class="mp-dialog-header">
        <template #prepend>
          <VIcon icon="mdi-download" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>{{ t('common.config') }}</VCardTitle>
        <VCardSubtitle>{{ props.downloader.name }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn v-model="downloaderInfoDialog" />
      <VDivider />
      <VCardText class="mp-dialog-body">
        <VForm ref="downloaderForm" class="mp-form-sections">
          <!-- 状态与默认角色分组卡片 -->
          <section class="mp-form-section">
            <div class="mp-settings-card">
              <div class="mp-setting-row">
                <VSwitch
                  v-model="downloaderInfo.enabled"
                  :label="t('downloader.enabled')"
                  color="primary"
                  inset
                  density="compact"
                  hide-details
                />
              </div>
              <div class="mp-setting-row">
                <VSwitch
                  v-model="downloaderInfo.default"
                  :label="t('downloader.default')"
                  :disabled="!downloaderInfo.enabled"
                  color="primary"
                  inset
                  density="compact"
                  hide-details
                />
              </div>
              <div class="mp-setting-row" :title="t('downloader.btDefaultHint')">
                <VSwitch
                  v-model="downloaderInfo.bt_default"
                  :label="t('downloader.btDefault')"
                  :hint="t('downloader.btDefaultHint')"
                  persistent-hint
                  :disabled="!downloaderInfo.enabled"
                  color="primary"
                  inset
                  density="compact"
                />
              </div>
              <div class="mp-setting-subpanel">
                <VTextField
                  v-model="downloaderInfo.bt_save_path"
                  :label="t('downloader.btSavePath')"
                  :hint="t('downloader.btSavePathHint')"
                  clearable
                  :disabled="!downloaderInfo.enabled || !downloaderInfo.bt_default"
                  prepend-inner-icon="mdi-folder-outline"
                />
              </div>
            </div>
          </section>

          <!-- 连接参数与客户端行为配置 -->
          <template v-if="downloaderInfo.type == 'qbittorrent'">
            <section class="mp-form-section">
              <VRow class="mp-form-grid">
                <VCol cols="12" sm="6">
                  <VTextField
                    v-model="downloaderInfo.name"
                    :label="t('downloader.name')"
                    :placeholder="t('downloader.nameRequired')"
                    active
                    prepend-inner-icon="mdi-label"
                  />
                </VCol>
                <VCol cols="12" sm="6">
                  <VTextField
                    v-model="downloaderInfo.config.host"
                    :label="t('downloader.host')"
                    placeholder="http(s)://ip:port"
                    active
                    prepend-inner-icon="mdi-server"
                  />
                </VCol>
                <VCol cols="12">
                  <VTextField
                    v-model="downloaderInfo.config.apikey"
                    type="password"
                    :label="t('downloader.apiKey')"
                    :hint="t('downloader.qbittorrentApiKeyHint')"
                    active
                    prepend-inner-icon="mdi-key-variant"
                  />
                </VCol>
                <VCol cols="12" sm="6">
                  <VTextField
                    v-model="downloaderInfo.config.username"
                    :label="t('downloader.username')"
                    :disabled="!!downloaderInfo.config.apikey"
                    active
                    prepend-inner-icon="mdi-account"
                  />
                </VCol>
                <VCol cols="12" sm="6">
                  <VTextField
                    v-model="downloaderInfo.config.password"
                    type="password"
                    :label="t('downloader.password')"
                    :disabled="!!downloaderInfo.config.apikey"
                    active
                    prepend-inner-icon="mdi-lock"
                  />
                </VCol>
              </VRow>
            </section>

            <section class="mp-form-section">
              <div class="mp-settings-card">
                <div class="mp-setting-row">
                  <VSwitch
                    v-model="downloaderInfo.config.category"
                    :label="t('downloader.category')"
                    hide-details
                    color="primary"
                    inset
                    density="compact"
                  />
                </div>
                <div class="mp-setting-row">
                  <VSwitch
                    v-model="downloaderInfo.config.sequentail"
                    :label="t('downloader.sequentail')"
                    hide-details
                    color="primary"
                    inset
                    density="compact"
                  />
                </div>
                <div class="mp-setting-row">
                  <VSwitch
                    v-model="downloaderInfo.config.force_resume"
                    :label="t('downloader.force_resume')"
                    hide-details
                    color="primary"
                    inset
                    density="compact"
                  />
                </div>
                <div class="mp-setting-row">
                  <VSwitch
                    v-model="downloaderInfo.config.first_last_piece"
                    :label="t('downloader.first_last_piece')"
                    hide-details
                    color="primary"
                    inset
                    density="compact"
                  />
                </div>
                <div class="mp-setting-row" :title="t('downloader.incomplete_files_extHint')">
                  <VSwitch
                    v-model="downloaderInfo.config.incomplete_files_ext"
                    :label="t('downloader.incomplete_files_ext')"
                    hide-details
                    color="primary"
                    inset
                    density="compact"
                  />
                </div>
              </div>
            </section>
          </template>

          <template v-else-if="downloaderInfo.type == 'transmission'">
            <section class="mp-form-section">
              <VRow class="mp-form-grid">
                <VCol cols="12" sm="6">
                  <VTextField
                    v-model="downloaderInfo.name"
                    :label="t('downloader.name')"
                    :placeholder="t('downloader.nameRequired')"
                    active
                    prepend-inner-icon="mdi-label"
                  />
                </VCol>
                <VCol cols="12" sm="6">
                  <VTextField
                    v-model="downloaderInfo.config.host"
                    :label="t('downloader.host')"
                    placeholder="http(s)://ip:port"
                    active
                    prepend-inner-icon="mdi-server"
                  />
                </VCol>
                <VCol cols="12" sm="6">
                  <VTextField
                    v-model="downloaderInfo.config.username"
                    :label="t('downloader.username')"
                    active
                    prepend-inner-icon="mdi-account"
                  />
                </VCol>
                <VCol cols="12" sm="6">
                  <VTextField
                    v-model="downloaderInfo.config.password"
                    type="password"
                    :label="t('downloader.password')"
                    active
                    prepend-inner-icon="mdi-lock"
                  />
                </VCol>
              </VRow>
            </section>

            <section class="mp-form-section">
              <div class="mp-settings-card">
                <div class="mp-setting-row" :title="t('downloader.rename_partial_filesHint')">
                  <VSwitch
                    v-model="downloaderInfo.config.rename_partial_files"
                    :label="t('downloader.rename_partial_files')"
                    hide-details
                    color="primary"
                    inset
                    density="compact"
                  />
                </div>
              </div>
            </section>
          </template>

          <section v-else-if="downloaderInfo.type == 'rtorrent'" class="mp-form-section">
            <VRow class="mp-form-grid">
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="downloaderInfo.name"
                  :label="t('downloader.name')"
                  :placeholder="t('downloader.nameRequired')"
                  active
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="downloaderInfo.config.host"
                  :label="t('downloader.host')"
                  placeholder="http(s)://ip:port/RPC2"
                  :hint="t('downloader.rtorrentHostHint')"
                  active
                  prepend-inner-icon="mdi-server"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="downloaderInfo.config.username"
                  :label="t('downloader.username')"
                  active
                  prepend-inner-icon="mdi-account"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="downloaderInfo.config.password"
                  type="password"
                  :label="t('downloader.password')"
                  active
                  prepend-inner-icon="mdi-lock"
                />
              </VCol>
            </VRow>
          </section>

          <section v-else class="mp-form-section">
            <VRow class="mp-form-grid">
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="downloaderInfo.type"
                  :label="t('downloader.type')"
                  :hint="t('downloader.customTypeHint')"
                  active
                  prepend-inner-icon="mdi-cog"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="downloaderInfo.name"
                  :label="t('downloader.name')"
                  :hint="t('downloader.nameRequired')"
                  active
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
            </VRow>
          </section>

          <!-- 路径映射结构化子面板 -->
          <section class="mp-form-section">
            <div class="mp-subpanel">
              <div class="mp-subpanel__header">
                <div class="mp-subpanel__title">
                  <VIcon icon="mdi-folder-swap-outline" size="17" class="me-1 text-primary" />
                  <span>{{ t('downloader.pathMapping') }}</span>
                </div>
                <VBtn variant="outlined" color="default" size="small" prepend-icon="mdi-plus" @click="addPathMapping">
                  {{ t('common.add') }} {{ t('downloader.pathMapping') }}
                </VBtn>
              </div>

              <div v-if="pathMappingRows.length === 0" class="mp-subpanel__empty">
                <VIcon icon="mdi-folder-network-outline" size="28" class="text-disabled mb-1" />
                <div class="text-caption text-medium-emphasis">{{ t('common.noData') }}</div>
              </div>

              <div v-else class="mp-mapping-list">
                <div v-for="(row, index) in pathMappingRows" :key="row.id" class="mp-mapping-row">
                  <div class="mp-mapping-row__header">
                    <span class="mp-mapping-row__badge">#{{ index + 1 }}</span>
                    <IconBtn variant="text" color="error" size="x-small" @click="removePathMapping(index)">
                      <VIcon icon="mdi-delete-outline" size="18" />
                    </IconBtn>
                  </div>
                  <div class="mp-mapping-row__fields">
                    <div class="mp-mapping-field">
                      <div class="mp-mapping-field__label">
                        <VIcon icon="mdi-folder-outline" size="15" class="me-1 text-primary" />
                        <span>{{ t('downloader.storagePath') }}</span>
                      </div>
                      <VRow no-gutters>
                        <VCol cols="12" sm="4" class="path-storage-select-col pe-sm-2">
                          <VSelect
                            :model-value="getStorageType(row.storage)"
                            :items="prefixOptions"
                            density="compact"
                            variant="outlined"
                            hide-details
                            @update:model-value="v => updateStoragePrefix(row, v)"
                          />
                        </VCol>
                        <VCol cols="12" sm="8">
                          <VTextField
                            :model-value="parseStoragePath(row.storage)[1]"
                            placeholder="/path/to/storage"
                            density="compact"
                            variant="outlined"
                            hide-details="auto"
                            :rules="pathValidationRules"
                            @update:model-value="v => updateStorageSuffix(row, v)"
                          />
                        </VCol>
                      </VRow>
                    </div>

                    <div class="mp-mapping-field">
                      <div class="mp-mapping-field__label">
                        <VIcon icon="mdi-download-outline" size="15" class="me-1 text-success" />
                        <span>{{ t('downloader.downloadPath') }}</span>
                      </div>
                      <VTextField
                        v-model="row.download"
                        placeholder="/path/to/download"
                        density="compact"
                        variant="outlined"
                        hide-details="auto"
                        :rules="pathValidationRules"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </VForm>
      </VCardText>
      <VDivider />
      <VCardActions class="app-dialog-actions mp-dialog-footer">
        <VSpacer />
        <VBtn color="default" variant="text" size="small" @click="downloaderInfoDialog = false">
          {{ t('common.cancel') }}
        </VBtn>
        <VBtn color="primary" variant="flat" size="small" class="px-4" @click="saveDownloaderInfo">
          {{ t('common.save') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped>
.mp-dialog-header {
  padding-block: 14px;
  padding-inline: 22px 48px;
}

.mp-dialog-body {
  padding: 18px 22px !important;
}

.mp-dialog-footer {
  gap: 8px;
  padding: 10px 20px !important;
}

.mp-form-sections {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.mp-form-grid {
  row-gap: 6px;
}

.mp-subpanel {
  overflow: hidden;
  border: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.1));
  border-radius: 10px;
  background: var(--mp-item-bg, rgba(var(--v-theme-on-surface), 0.02));
}

.mp-subpanel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-end: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.08));
  gap: 12px;
  padding: 10px 16px;
}

.mp-subpanel__title {
  display: inline-flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), 0.9);
  font-size: 0.875rem;
  font-weight: 600;
}

.mp-subpanel__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px 16px;
}

.mp-mapping-list {
  display: flex;
  flex-direction: column;
}

.mp-mapping-row {
  padding: 12px 16px 14px;

  & + .mp-mapping-row {
    border-block-start: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.08));
  }
}

.mp-mapping-row__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-block-end: 6px;
}

.mp-mapping-row__badge {
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.mp-mapping-row__fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mp-mapping-field__label {
  display: flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), 0.65);
  font-size: 0.75rem;
  font-weight: 500;
  margin-block-end: 4px;
}

@media (max-width: 599.98px) {
  .mp-dialog-body {
    padding: 16px !important;
  }

  .path-storage-select-col {
    margin-block-end: 8px;
  }
}
</style>
