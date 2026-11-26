<!-- eslint-disable sonarjs/no-duplicate-string -->
<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api, { getApiErrorMessage } from '@/api'
import type { ApiResponse, StorageConf, TransferDirectoryConf } from '@/api/types'
import DirectoryCard from '@/components/cards/DirectoryCard.vue'
import StorageCard from '@/components/cards/StorageCard.vue'
import { useI18n } from '@/composables/useChineseText'
import { useTheme } from 'vuetify'
import { storageAttributes } from '@/api/constants'
import { useSilentSettingRefresh } from '@/composables/useSilentSettingRefresh'
import { openSharedDialog } from '@/composables/useSharedDialog'
import RenameFormatEditor from '@/components/form/RenameFormatEditor.vue'

const { t } = useI18n()
const { global: globalTheme } = useTheme()

const props = defineProps({
  active: {
    type: Boolean,
    default: true,
  },
})

// 拖拽排序和分类编辑弹窗按需加载，避免设置框架预加载目录页时带上这些交互依赖。
const Draggable = defineAsyncComponent(() => import('vuedraggable').then(module => module.default))
const CategoryEditDialog = defineAsyncComponent(() => import('@/components/dialog/CategoryEditDialog.vue'))

// 所有下载目录
const directories = ref<TransferDirectoryConf[]>([])

// 为目录条目提供不随优先级重排或改名漂移的稳定渲染键，避免删除中间目录时后续卡片卸载重挂。
const directoryKeys = new WeakMap<TransferDirectoryConf, string>()
let directoryKeySeed = 0
function getDirectoryKey(directory: TransferDirectoryConf): string {
  const existing = directoryKeys.get(directory)
  if (existing) return existing
  directoryKeySeed += 1
  const nextKey = `dir-${directoryKeySeed}`
  directoryKeys.set(directory, nextKey)
  return nextKey
}

// 所有存储
const storages = ref<StorageConf[]>([])

// 为存储条目提供不随改名或拖拽漂移的稳定渲染键
const storageKeys = new WeakMap<StorageConf, string>()
let storageKeySeed = 0
function getStorageKey(storage: StorageConf): string {
  const existing = storageKeys.get(storage)
  if (existing) return existing
  storageKeySeed += 1
  const nextKey = `storage-${storageKeySeed}`
  storageKeys.set(storage, nextKey)
  return nextKey
}

// 独立的保存按钮加载锁
const savingStorages = ref(false)
const savingDirectories = ref(false)
const savingOrganize = ref(false)

// 二级分类策略
const mediaCategories = ref<{ [key: string]: any }>({})

// 提示框
const $toast = useToast()

// 数据源
const sourceItems = [
  { 'title': 'TheMovieDb', 'value': 'themoviedb' },
  { 'title': '豆瓣', 'value': 'douban' },
  { 'title': 'Bangumi', 'value': 'bangumi' },
  { 'title': 'AniList', 'value': 'anilist' },
]

// 存储选项（排除已添加的）
const storageOptions = computed(() => {
  const existingTypes = storages.value.map(storage => storage.type)
  return storageAttributes
    .filter(item => !existingTypes.includes(item.type))
    .map(item => ({
      title: t(`storage.${item.type}`),
      value: item.type,
    }))
})

// 系统设置
const SystemSettings = ref<any>({
  Basic: {
    SCRAP_SOURCE: 'themoviedb',
    MOVIE_RENAME_FORMAT: null,
    TV_RENAME_FORMAT: null,
  },
})

// 挂载型本地盘删除空目录开关
const mountedLocalDiskDeleteEmptyDirs = ref(true)
const mountedLocalDiskDeleteEmptyDirsKey = 'MountedLocalDiskDeleteEmptyDirs'

// 编辑器主题
// Ace 跟随 Vuetify 当前生效主题，auto 模式下也按实际明暗色渲染。
const editorTheme = computed(() => (globalTheme.current.value.dark ? 'github_dark' : 'github_light_default'))

type RenameMediaType = 'movie' | 'tv'
const activeRenameMediaType = ref<RenameMediaType>('movie')

// 打开共享分类编辑弹窗，保存后刷新本页分类配置。
// closeOn 不含 save:进阶页保存原文仅触发 save,弹窗需保持打开;可视化保存由弹窗自身 emit close 关闭。
function openCategoryDialog() {
  openSharedDialog(
    CategoryEditDialog,
    {},
    {
      save: loadMediaCategories,
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

const movieRenameFormat = computed({
  get: () => SystemSettings.value.Basic.MOVIE_RENAME_FORMAT ?? '',
  set: (value: string) => {
    SystemSettings.value.Basic.MOVIE_RENAME_FORMAT = value || null
  },
})

const tvRenameFormat = computed({
  get: () => SystemSettings.value.Basic.TV_RENAME_FORMAT ?? '',
  set: (value: string) => {
    SystemSettings.value.Basic.TV_RENAME_FORMAT = value || null
  },
})

const activeRenameFormat = computed({
  get: () => (activeRenameMediaType.value === 'movie' ? movieRenameFormat.value : tvRenameFormat.value),
  set: (value: string) => {
    if (activeRenameMediaType.value === 'movie') movieRenameFormat.value = value
    else tvRenameFormat.value = value
  },
})

// 加载系统设置
async function loadSystemSettings() {
  try {
    const result: { [key: string]: any } = await api.get('system/env')
    if (result.success) {
      // 将API返回的值赋值给SystemSettings
      for (const sectionKey of Object.keys(SystemSettings.value) as Array<keyof typeof SystemSettings.value>) {
        Object.keys(SystemSettings.value[sectionKey]).forEach((key: string) => {
          if (result.data.hasOwnProperty(key)) (SystemSettings.value[sectionKey] as any)[key] = result.data[key]
        })
      }
    }
  } catch (error) {
    console.log(error)
  }
}

// 加载挂载盘空目录清理设置
async function loadMountedLocalDiskDeleteEmptyDirs() {
  try {
    const result: { data?: { value?: boolean | null } } = await api.get(
      `system/setting/${mountedLocalDiskDeleteEmptyDirsKey}`,
    )
    mountedLocalDiskDeleteEmptyDirs.value = result.data?.value ?? true
  } catch (error) {
    console.log(error)
  }
}

// 移动结束
function orderDirectoryCards() {
  // 更新所有目录的优先级
  directories.value.forEach((item, index) => {
    item.priority = index
  })
}

// 查询存储
async function loadStorages() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/public/Storages')

    storages.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 保存存储
async function saveStorages() {
  if (savingStorages.value) return
  savingStorages.value = true
  try {
    const result: { [key: string]: any } = await api.post('system/setting/Storages', storages.value)
    if (result.success) $toast.success(t('setting.directory.storageSaveSuccess'))
    else $toast.error(result.message || t('setting.directory.storageSaveFailed'))
  } catch (error) {
    console.log(error)
    $toast.error(getApiErrorMessage(error) || t('setting.directory.storageSaveFailed'))
  } finally {
    savingStorages.value = false
  }
}

// 查询目录
async function loadDirectories() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/public/Directories')
    directories.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 保存目录
async function saveDirectories() {
  if (savingDirectories.value) return
  orderDirectoryCards()
  savingDirectories.value = true
  try {
    const names = directories.value.map(item => item.name)
    if (new Set(names).size !== names.length) {
      $toast.error(t('setting.directory.duplicateDirectoryName'))
      return
    }
    const result: { [key: string]: any } = await api.post('system/setting/Directories', directories.value)
    if (result.success) {
      $toast.success(t('setting.directory.directorySaveSuccess'))
    } else $toast.error(result.message || t('setting.directory.directorySaveFailed'))
  } catch (error) {
    console.log(error)
    $toast.error(getApiErrorMessage(error) || t('setting.directory.directorySaveFailed'))
  } finally {
    savingDirectories.value = false
  }
}

// 添加媒体库目录
function addDirectory() {
  let name = `${t('setting.directory.defaultDirName')}${directories.value.length + 1}`
  while (directories.value.some(item => item.name === name)) {
    name = `${t('setting.directory.defaultDirName')}${
      parseInt(name.split(t('setting.directory.defaultDirName'))[1]) + 1
    }`
  }
  directories.value.push({
    name: name,
    storage: 'local',
    download_path: '',
    priority: -1,
    monitor_type: '',
    media_type: '',
    media_category: '',
    transfer_type: '',
  })
  orderDirectoryCards()
}

// 移除媒体库目录
function removeDirectory(directory: TransferDirectoryConf) {
  const index = directories.value.indexOf(directory)
  if (index > -1) {
    directories.value.splice(index, 1)
  }
}

// 调用API查询自动分类配置
async function loadMediaCategories() {
  try {
    mediaCategories.value = await api.get('media/category')
  } catch (error) {
    console.log(error)
  }
}

// 添加存储
function addStorage(storageType = 'custom') {
  let name: string
  let type: string

  if (storageType === 'custom') {
    // 自定义存储需要数字序号
    name = `${t(`storage.${storageType}`)} ${storages.value.length + 1}`
    while (storages.value.some(item => item.name === name)) {
      const num = parseInt(name.match(/\d+$/)?.[0] || '1') + 1
      name = `${t(`storage.${storageType}`)} ${num}`
    }
    type = `custom${storages.value.length + 1}`
  } else {
    // 预定义存储类型直接使用类型名称
    name = t(`storage.${storageType}`)
    type = storageType
  }

  storages.value.push({
    name: name,
    type: type,
    config: {},
  })
}

// 移除存储
function removeStorage(storage: StorageConf) {
  const index = storages.value.indexOf(storage)
  if (index > -1) {
    storages.value.splice(index, 1)
  }
}

// 保存设置
async function saveSystemSettings(value: any) {
  if (savingOrganize.value) return
  savingOrganize.value = true
  try {
    // 响应拦截器返回业务响应体，并行组合前需收窄 Axios 的静态返回类型。
    const [envResult, mountedDiskResult] = await Promise.all([
      api.post('system/env', value) as unknown as Promise<ApiResponse>,
      api.post(
        `system/setting/${mountedLocalDiskDeleteEmptyDirsKey}`,
        mountedLocalDiskDeleteEmptyDirs.value,
      ) as unknown as Promise<ApiResponse>,
    ])
    if (envResult.success && mountedDiskResult.success) {
      $toast.success(t('setting.directory.organizeSaveSuccess'))
    } else $toast.error(t('setting.directory.organizeSaveFailed'))
  } catch (error) {
    console.log(error)
    $toast.error(getApiErrorMessage(error) || t('setting.directory.organizeSaveFailed'))
  } finally {
    savingOrganize.value = false
  }
}

async function loadPageData() {
  await Promise.all([
    loadDirectories(),
    loadStorages(),
    loadMediaCategories(),
    loadSystemSettings(),
    loadMountedLocalDiskDeleteEmptyDirs(),
  ])
}

// 加载数据
onMounted(() => {
  loadPageData()
})

useSilentSettingRefresh(
  async () => {
    if (savingStorages.value || savingDirectories.value || savingOrganize.value) return
    await loadPageData()
  },
  {
    active: computed(() => props.active),
  },
)
</script>

<template>
  <div class="mp-setting-stack">
    <VCard id="sec-dir-storage" class="mp-setting-card">
      <VCardItem>
        <template #prepend>
          <div class="mp-setting-card__icon mp-setting-card__icon--info">
            <VIcon icon="mdi-harddisk" size="18" />
          </div>
        </template>
        <VCardTitle class="d-flex align-center gap-2">
          <span>{{ t('setting.directory.storage') }}</span>
          <span v-if="storages.length > 0" class="mp-count-pill">{{ storages.length }}</span>
        </VCardTitle>
        <VCardSubtitle>{{ t('setting.directory.storageDesc') }}</VCardSubtitle>
        <template #append>
          <VBtn size="small" color="secondary" variant="outlined" rounded="lg" prepend-icon="mdi-plus">
            添加存储
            <VMenu activator="parent" close-on-content-click>
              <VList>
                <VListItem v-for="item in storageOptions" :key="item.value" @click="addStorage(item.value)">
                  <VListItemTitle>{{ item.title }}</VListItemTitle>
                </VListItem>
                <VListItem @click="addStorage('custom')">
                  <VListItemTitle>{{ t('storage.custom') }}</VListItemTitle>
                </VListItem>
              </VList>
            </VMenu>
          </VBtn>
        </template>
      </VCardItem>
      <VCardText>
        <Draggable
          v-if="storages.length"
          v-model="storages"
          handle=".cursor-move"
          :item-key="getStorageKey"
          tag="div"
          :component-data="{ 'class': 'grid gap-3 grid-app-card' }"
        >
          <template #item="{ element }">
            <StorageCard :storage="element" @close="removeStorage(element)" @done="loadStorages" />
          </template>
        </Draggable>
        <div v-else class="mp-empty-hint">
          <VIcon icon="mdi-harddisk" size="16" class="mp-empty-hint__icon" />
          <span>暂未添加存储，可点击右上角「添加存储」新增配置</span>
        </div>

        <VForm class="mp-card-footer" @submit.prevent="() => {}">
          <VBtn
            type="submit"
            size="small"
            color="primary"
            variant="flat"
            rounded="lg"
            prepend-icon="mdi-content-save-outline"
            :loading="savingStorages"
            :disabled="savingStorages"
            class="px-4"
            @click="saveStorages"
          >
            {{ t('common.save') }}
          </VBtn>
        </VForm>
      </VCardText>
    </VCard>

    <VCard id="sec-dir-library" class="mp-setting-card">
      <VCardItem>
        <template #prepend>
          <div class="mp-setting-card__icon mp-setting-card__icon--primary">
            <VIcon icon="mdi-folder-multiple-outline" size="18" />
          </div>
        </template>
        <VCardTitle class="d-flex align-center gap-2">
          <span>{{ t('setting.directory.directory') }}</span>
          <span v-if="directories.length > 0" class="mp-count-pill">{{ directories.length }}</span>
        </VCardTitle>
        <VCardSubtitle>{{ t('setting.directory.directoryDesc') }}</VCardSubtitle>
        <template #append>
          <div class="d-flex flex-wrap align-center justify-end gap-2">
            <VBtn
              size="small"
              color="primary"
              variant="tonal"
              rounded="lg"
              prepend-icon="mdi-shape-plus"
              @click="openCategoryDialog"
            >
              {{ t('setting.category.title') }}
            </VBtn>
            <VBtn
              size="small"
              color="secondary"
              variant="outlined"
              rounded="lg"
              prepend-icon="mdi-plus"
              @click="addDirectory"
            >
              添加目录
            </VBtn>
          </div>
        </template>
      </VCardItem>
      <VCardText>
        <Draggable
          v-if="directories.length"
          v-model="directories"
          handle=".cursor-move"
          :item-key="getDirectoryKey"
          tag="div"
          @end="orderDirectoryCards"
          :component-data="{ 'class': 'directory-card-grid' }"
        >
          <template #item="{ element }">
            <DirectoryCard
              :directory="element"
              :categories="mediaCategories"
              :storages="storages"
              @close="removeDirectory(element)"
            />
          </template>
        </Draggable>
        <div v-else class="mp-empty-hint">
          <VIcon icon="mdi-folder-outline" size="16" class="mp-empty-hint__icon" />
          <span>暂未添加目录，可点击右上角「添加目录」新增配置</span>
        </div>

        <VForm class="mp-card-footer" @submit.prevent="() => {}">
          <VBtn
            type="submit"
            size="small"
            color="primary"
            variant="flat"
            rounded="lg"
            prepend-icon="mdi-content-save-outline"
            :loading="savingDirectories"
            :disabled="savingDirectories"
            class="px-4"
            @click="saveDirectories"
          >
            {{ t('common.save') }}
          </VBtn>
        </VForm>
      </VCardText>
    </VCard>

    <VCard id="sec-dir-organize" class="mp-setting-card">
      <VCardItem>
        <template #prepend>
          <div class="mp-setting-card__icon mp-setting-card__icon--success">
            <VIcon icon="mdi-file-tree-outline" size="18" />
          </div>
        </template>
        <VCardTitle>{{ t('setting.directory.organizeAndScrap') }}</VCardTitle>
        <VCardSubtitle>{{ t('setting.directory.organizeAndScrapDesc') }}</VCardSubtitle>
      </VCardItem>
      <VCardText>
        <VForm @submit.prevent="() => {}">
          <VRow align="start">
            <VCol cols="12" md="6">
              <VSelect
                v-model="SystemSettings.Basic.SCRAP_SOURCE"
                :items="sourceItems"
                :label="t('setting.directory.scrapSource')"
                :hint="t('setting.directory.scrapSourceHint')"
                prepend-inner-icon="mdi-database"
              />
            </VCol>
            <VCol cols="12" md="6">
              <div class="mp-switch-card" :title="t('setting.directory.mountedLocalDiskDeleteEmptyDirsHint')">
                <VSwitch
                  v-model="mountedLocalDiskDeleteEmptyDirs"
                  :label="t('setting.directory.mountedLocalDiskDeleteEmptyDirs')"
                  :hint="t('setting.directory.mountedLocalDiskDeleteEmptyDirsHint')"
                  color="primary"
                  density="compact"
                  persistent-hint
                  inset
                />
              </div>
            </VCol>
            <VCol cols="12">
              <VDivider class="my-2" />
              <div class="rename-format-section-head">
                <div class="rename-format-section-title">{{ t('renameFormat.sectionTitle') }}</div>
                <div class="rename-format-section-desc">{{ t('renameFormat.sectionDesc') }}</div>
              </div>
              <RenameFormatEditor
                v-model="activeRenameFormat"
                :media-type="activeRenameMediaType"
                :editor-theme="editorTheme"
              >
                <template #toolbar>
                  <div
                    class="mp-segmented rename-format-media-segmented"
                    role="tablist"
                    :aria-label="t('renameFormat.sectionTitle')"
                  >
                    <button
                      type="button"
                      role="tab"
                      :aria-selected="activeRenameMediaType === 'movie'"
                      class="mp-segmented__btn"
                      :class="{ 'is-active': activeRenameMediaType === 'movie' }"
                      @click="activeRenameMediaType = 'movie'"
                    >
                      <VIcon icon="mdi-movie-open-outline" size="15" />
                      <span>{{ t('mediaType.movie') }}</span>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      :aria-selected="activeRenameMediaType === 'tv'"
                      class="mp-segmented__btn"
                      :class="{ 'is-active': activeRenameMediaType === 'tv' }"
                      @click="activeRenameMediaType = 'tv'"
                    >
                      <VIcon icon="mdi-television" size="15" />
                      <span>{{ t('mediaType.tv') }}</span>
                    </button>
                  </div>
                </template>
              </RenameFormatEditor>
            </VCol>
          </VRow>
        </VForm>

        <VForm class="mp-card-footer" @submit.prevent="() => {}">
          <VBtn
            type="submit"
            size="small"
            color="primary"
            variant="flat"
            rounded="lg"
            prepend-icon="mdi-content-save-outline"
            :loading="savingOrganize"
            :disabled="savingOrganize"
            class="px-4"
            @click="saveSystemSettings(SystemSettings.Basic)"
          >
            {{ t('common.save') }}
          </VBtn>
        </VForm>
      </VCardText>
    </VCard>
  </div>
</template>

<style scoped>
.directory-card-grid {
  display: grid;
  align-items: start;
  gap: 13px;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 480px), 1fr));
}

.rename-format-section-head {
  margin-block: 10px 13px;
}

.rename-format-section-title {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.4;
}

.rename-format-section-desc {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  margin-block-start: 2px;
}

@media (width <= 600px) {
  .rename-format-media-segmented {
    display: flex;
    inline-size: 100%;
  }

  .rename-format-media-segmented .mp-segmented__btn {
    flex: 1 1 50%;
  }
}

.mp-empty-hint {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  padding: 16px 14px;
  border: 1px dashed var(--mp-border-card);
  border-radius: 8px;
  background: var(--mp-item-bg);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12.5px;
  gap: 5px;
  line-height: 1.5;
}

.mp-empty-hint__icon {
  color: rgba(var(--v-theme-on-surface), 0.45);
}
</style>
