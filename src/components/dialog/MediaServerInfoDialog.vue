<script setup lang="ts">
import api from '@/api'
import type { MediaServerConf, MediaServerLibrary } from '@/api/types'
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
  mediaserver: {
    type: Object as PropType<MediaServerConf>,
    required: true,
  },
  mediaservers: {
    type: Array as PropType<MediaServerConf[]>,
    required: true,
  },
  defaultSyncInterval: {
    type: Number,
    default: null,
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['update:modelValue', 'close', 'done', 'change'])

// 提示框
const $toast = useToast()

// 媒体服务器详情弹窗
const mediaServerInfoDialog = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

// 媒体服务器详情
const mediaServerInfo = ref<MediaServerConf>({
  name: '',
  type: '',
  enabled: false,
  config: {},
})

// 同步媒体库选项
const librariesOptions = ref<{ title: string; value: string | undefined }[]>([
  {
    title: t('common.all'),
    value: 'all',
  },
])

const ugreenScanModeOptions = computed(() => [
  { title: t('mediaserver.scanModeOptions.newAndModified'), value: 'new_and_modified' },
  { title: t('mediaserver.scanModeOptions.supplementMissing'), value: 'supplement_missing' },
  { title: t('mediaserver.scanModeOptions.fullOverride'), value: 'full_override' },
])

/** 初始化媒体服务器编辑表单数据。 */
function initializeMediaServerInfo() {
  loadLibrary(props.mediaserver.name)
  mediaServerInfo.value = cloneDeep(props.mediaserver)
  if (mediaServerInfo.value.type === 'ugreen') {
    mediaServerInfo.value.config = mediaServerInfo.value.config || {}
    if (!mediaServerInfo.value.config.scan_mode) {
      mediaServerInfo.value.config.scan_mode = 'supplement_missing'
    }
    if (mediaServerInfo.value.config.verify_ssl === undefined) {
      mediaServerInfo.value.config.verify_ssl = true
    }
  }
  if (!props.mediaserver.sync_libraries) {
    mediaServerInfo.value.sync_libraries = ['all']
  }
}

/** 保存媒体服务器编辑结果并通知父级刷新。 */
function saveMediaServerInfo() {
  if (!mediaServerInfo.value.name) {
    $toast.error(t('common.nameRequired'))
    return
  }
  if (props.mediaservers.some(item => item.name === mediaServerInfo.value.name && item !== props.mediaserver)) {
    $toast.error(t('common.nameExists', { name: mediaServerInfo.value.name }))
    return
  }
  mediaServerInfoDialog.value = false
  emit('change', mediaServerInfo.value, props.mediaserver.name)
  emit('done')
}

/** 调用 API 查询指定媒体服务器的媒体库列表。 */
async function loadLibrary(server: string) {
  try {
    const result: MediaServerLibrary[] = await api.get('mediaserver/library', { params: { server } })
    if (result && result.length > 0) {
      librariesOptions.value = result.map(item => ({
        title: item.name,
        value: item.id?.toString(),
      }))
    } else {
      librariesOptions.value = []
    }
    librariesOptions.value.unshift({
      title: t('common.all'),
      value: 'all',
    })
  } catch (e) {
    console.log(e)
  }
}

onMounted(() => {
  initializeMediaServerInfo()
})
</script>

<template>
  <VDialog
    v-if="mediaServerInfoDialog"
    v-model="mediaServerInfoDialog"
    scrollable
    max-width="44rem"
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard class="mp-dialog-card">
      <VCardItem class="mp-dialog-header">
        <template #prepend>
          <VIcon icon="mdi-television-play" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>{{ t('common.config') }}</VCardTitle>
        <VCardSubtitle>{{ props.mediaserver.name }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn v-model="mediaServerInfoDialog" />
      <VDivider />
      <VCardText class="mp-dialog-body">
        <VForm class="mp-form-sections">
          <!-- 状态分组卡片 -->
          <section class="mp-form-section">
            <div class="mp-settings-card">
              <div class="mp-setting-row">
                <VSwitch
                  v-model="mediaServerInfo.enabled"
                  :label="t('mediaserver.enableMediaServer')"
                  color="primary"
                  inset
                  density="compact"
                  hide-details
                />
              </div>
            </div>
          </section>

          <section v-if="mediaServerInfo.type == 'emby'" class="mp-form-section">
            <VRow class="mp-form-grid">
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="mediaServerInfo.name"
                  :label="t('common.name')"
                  :placeholder="t('mediaserver.nameRequired')"
                  :hint="t('mediaserver.serverAlias')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="mediaServerInfo.config.host"
                  :label="t('mediaserver.host')"
                  :placeholder="t('mediaserver.hostPlaceholder')"
                  :hint="t('mediaserver.hostHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-server"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="mediaServerInfo.config.play_host"
                  :label="t('mediaserver.playHost')"
                  :placeholder="t('mediaserver.playHostPlaceholder')"
                  :hint="t('mediaserver.playHostHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-play-network"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="mediaServerInfo.config.username"
                  :label="t('mediaserver.username')"
                  :hint="t('mediaserver.usernameHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-account"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="mediaServerInfo.config.apikey"
                  :label="t('mediaserver.apiKey')"
                  :hint="t('mediaserver.embyApiKeyHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-key"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model.number="mediaServerInfo.sync_interval"
                  type="number"
                  min="0"
                  step="1"
                  clearable
                  :label="t('mediaserver.syncInterval')"
                  :hint="t('mediaserver.syncIntervalHint', { interval: props.defaultSyncInterval ?? 6 })"
                  persistent-hint
                  suffix="h"
                  prepend-inner-icon="mdi-sync"
                />
              </VCol>
              <VCol cols="12">
                <VAutocomplete
                  v-model="mediaServerInfo.sync_libraries"
                  :label="t('mediaserver.syncLibraries')"
                  :items="librariesOptions"
                  chips
                  multiple
                  clearable
                  :hint="t('mediaserver.syncLibrariesHint')"
                  persistent-hint
                  active
                  append-inner-icon="mdi-refresh"
                  prepend-inner-icon="mdi-library"
                  @click:append-inner="loadLibrary(mediaServerInfo.name)"
                />
              </VCol>
            </VRow>
          </section>

          <section v-else-if="mediaServerInfo.type == 'zspace'" class="mp-form-section">
            <VRow class="mp-form-grid">
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="mediaServerInfo.name"
                  :label="t('common.name')"
                  :placeholder="t('mediaserver.nameRequired')"
                  :hint="t('mediaserver.serverAlias')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="mediaServerInfo.config.host"
                  :label="t('mediaserver.host')"
                  :placeholder="t('mediaserver.hostPlaceholder')"
                  :hint="t('mediaserver.hostHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-server"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="mediaServerInfo.config.play_host"
                  :label="t('mediaserver.playHost')"
                  :placeholder="t('mediaserver.playHostPlaceholder')"
                  :hint="t('mediaserver.playHostHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-play-network"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="mediaServerInfo.config.username"
                  :label="t('mediaserver.username')"
                  :hint="t('mediaserver.usernameHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-account"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  type="password"
                  v-model="mediaServerInfo.config.password"
                  :label="t('mediaserver.password')"
                  :hint="t('mediaserver.passwordHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-lock"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model.number="mediaServerInfo.sync_interval"
                  type="number"
                  min="0"
                  step="1"
                  clearable
                  :label="t('mediaserver.syncInterval')"
                  :hint="t('mediaserver.syncIntervalHint', { interval: props.defaultSyncInterval ?? 6 })"
                  persistent-hint
                  suffix="h"
                  prepend-inner-icon="mdi-sync"
                />
              </VCol>
              <VCol cols="12">
                <VAutocomplete
                  v-model="mediaServerInfo.sync_libraries"
                  :label="t('mediaserver.syncLibraries')"
                  :items="librariesOptions"
                  chips
                  multiple
                  clearable
                  :hint="t('mediaserver.syncLibrariesHint')"
                  persistent-hint
                  active
                  append-inner-icon="mdi-refresh"
                  prepend-inner-icon="mdi-library"
                  @click:append-inner="loadLibrary(mediaServerInfo.name)"
                />
              </VCol>
            </VRow>
          </section>

          <section v-else-if="mediaServerInfo.type == 'jellyfin'" class="mp-form-section">
            <VRow class="mp-form-grid">
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="mediaServerInfo.name"
                  :label="t('common.name')"
                  :placeholder="t('mediaserver.nameRequired')"
                  :hint="t('mediaserver.serverAlias')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="mediaServerInfo.config.host"
                  :label="t('mediaserver.host')"
                  :placeholder="t('mediaserver.hostPlaceholder')"
                  :hint="t('mediaserver.hostHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-server"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="mediaServerInfo.config.play_host"
                  :label="t('mediaserver.playHost')"
                  :placeholder="t('mediaserver.playHostPlaceholder')"
                  :hint="t('mediaserver.playHostHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-play-network"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="mediaServerInfo.config.apikey"
                  :label="t('mediaserver.apiKey')"
                  :hint="t('mediaserver.jellyfinApiKeyHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-key"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model.number="mediaServerInfo.sync_interval"
                  type="number"
                  min="0"
                  step="1"
                  clearable
                  :label="t('mediaserver.syncInterval')"
                  :hint="t('mediaserver.syncIntervalHint', { interval: props.defaultSyncInterval ?? 6 })"
                  persistent-hint
                  suffix="h"
                  prepend-inner-icon="mdi-sync"
                />
              </VCol>
              <VCol cols="12">
                <VAutocomplete
                  v-model="mediaServerInfo.sync_libraries"
                  :label="t('mediaserver.syncLibraries')"
                  :items="librariesOptions"
                  chips
                  multiple
                  clearable
                  :hint="t('mediaserver.syncLibrariesHint')"
                  persistent-hint
                  active
                  append-inner-icon="mdi-refresh"
                  prepend-inner-icon="mdi-library"
                  @click:append-inner="loadLibrary(mediaServerInfo.name)"
                />
              </VCol>
            </VRow>
          </section>

          <section v-else-if="mediaServerInfo.type == 'trimemedia'" class="mp-form-section">
            <VRow class="mp-form-grid">
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="mediaServerInfo.name"
                  :label="t('common.name')"
                  :placeholder="t('mediaserver.nameRequired')"
                  :hint="t('mediaserver.serverAlias')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="mediaServerInfo.config.host"
                  :label="t('mediaserver.host')"
                  :placeholder="t('mediaserver.hostPlaceholder')"
                  :hint="t('mediaserver.hostHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-server"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="mediaServerInfo.config.play_host"
                  :label="t('mediaserver.playHost')"
                  :placeholder="t('mediaserver.playHostPlaceholder')"
                  :hint="t('mediaserver.playHostHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-play-network"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="mediaServerInfo.config.username"
                  :label="t('mediaserver.username')"
                  :hint="t('mediaserver.usernameHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-account"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  type="password"
                  v-model="mediaServerInfo.config.password"
                  :label="t('mediaserver.password')"
                  :hint="t('mediaserver.passwordHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-lock"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  type="password"
                  v-model="mediaServerInfo.config.access_code"
                  :label="t('mediaserver.accessCode')"
                  :hint="t('mediaserver.accessCodeHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-shield-key"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model.number="mediaServerInfo.sync_interval"
                  type="number"
                  min="0"
                  step="1"
                  clearable
                  :label="t('mediaserver.syncInterval')"
                  :hint="t('mediaserver.syncIntervalHint', { interval: props.defaultSyncInterval ?? 6 })"
                  persistent-hint
                  suffix="h"
                  prepend-inner-icon="mdi-sync"
                />
              </VCol>
              <VCol cols="12">
                <VAutocomplete
                  v-model="mediaServerInfo.sync_libraries"
                  :label="t('mediaserver.syncLibraries')"
                  :items="librariesOptions"
                  chips
                  multiple
                  clearable
                  :hint="t('mediaserver.syncLibrariesHint')"
                  persistent-hint
                  active
                  append-inner-icon="mdi-refresh"
                  prepend-inner-icon="mdi-library"
                  @click:append-inner="loadLibrary(mediaServerInfo.name)"
                />
              </VCol>
            </VRow>
          </section>

          <template v-else-if="mediaServerInfo.type == 'ugreen'">
            <section class="mp-form-section">
              <VRow class="mp-form-grid">
                <VCol cols="12" sm="6">
                  <VTextField
                    v-model="mediaServerInfo.name"
                    :label="t('common.name')"
                    :placeholder="t('mediaserver.nameRequired')"
                    :hint="t('mediaserver.serverAlias')"
                    persistent-hint
                    active
                    prepend-inner-icon="mdi-label"
                  />
                </VCol>
                <VCol cols="12" sm="6">
                  <VTextField
                    v-model="mediaServerInfo.config.host"
                    :label="t('mediaserver.host')"
                    :placeholder="t('mediaserver.hostPlaceholder')"
                    :hint="t('mediaserver.hostHint')"
                    persistent-hint
                    active
                    prepend-inner-icon="mdi-server"
                  />
                </VCol>
                <VCol cols="12" sm="6">
                  <VTextField
                    v-model="mediaServerInfo.config.play_host"
                    :label="t('mediaserver.playHost')"
                    :placeholder="t('mediaserver.playHostPlaceholder')"
                    :hint="t('mediaserver.playHostHint')"
                    persistent-hint
                    active
                    prepend-inner-icon="mdi-play-network"
                  />
                </VCol>
                <VCol cols="12" sm="6">
                  <VTextField
                    v-model="mediaServerInfo.config.username"
                    :label="t('mediaserver.username')"
                    :hint="t('mediaserver.usernameHint')"
                    persistent-hint
                    active
                    prepend-inner-icon="mdi-account"
                  />
                </VCol>
                <VCol cols="12" sm="6">
                  <VTextField
                    type="password"
                    v-model="mediaServerInfo.config.password"
                    :label="t('mediaserver.password')"
                    :hint="t('mediaserver.passwordHint')"
                    persistent-hint
                    active
                    prepend-inner-icon="mdi-lock"
                  />
                </VCol>
                <VCol cols="12" sm="6">
                  <VTextField
                    v-model.number="mediaServerInfo.sync_interval"
                    type="number"
                    min="0"
                    step="1"
                    clearable
                    :label="t('mediaserver.syncInterval')"
                    :hint="t('mediaserver.syncIntervalHint', { interval: props.defaultSyncInterval ?? 6 })"
                    persistent-hint
                    suffix="h"
                    prepend-inner-icon="mdi-sync"
                  />
                </VCol>
                <VCol cols="12">
                  <VSelect
                    v-model="mediaServerInfo.config.scan_mode"
                    :label="t('mediaserver.scanMode')"
                    :items="ugreenScanModeOptions"
                    :hint="t('mediaserver.scanModeHint')"
                    persistent-hint
                    active
                    prepend-inner-icon="mdi-radar"
                  />
                </VCol>
                <VCol cols="12">
                  <VAutocomplete
                    v-model="mediaServerInfo.sync_libraries"
                    :label="t('mediaserver.syncLibraries')"
                    :items="librariesOptions"
                    chips
                    multiple
                    clearable
                    :hint="t('mediaserver.syncLibrariesHint')"
                    persistent-hint
                    active
                    append-inner-icon="mdi-refresh"
                    prepend-inner-icon="mdi-library"
                    @click:append-inner="loadLibrary(mediaServerInfo.name)"
                  />
                </VCol>
              </VRow>
            </section>
            <section class="mp-form-section">
              <div class="mp-settings-card">
                <div class="mp-setting-row" :title="t('mediaserver.verifySslHint')">
                  <VSwitch
                    v-model="mediaServerInfo.config.verify_ssl"
                    :label="t('mediaserver.verifySsl')"
                    hide-details
                    color="primary"
                    inset
                    density="compact"
                  />
                </div>
              </div>
            </section>
          </template>

          <section v-else-if="mediaServerInfo.type == 'plex'" class="mp-form-section">
            <VRow class="mp-form-grid">
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="mediaServerInfo.name"
                  :label="t('common.name')"
                  :placeholder="t('mediaserver.nameRequired')"
                  :hint="t('mediaserver.serverAlias')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="mediaServerInfo.config.host"
                  :label="t('mediaserver.host')"
                  :placeholder="t('mediaserver.hostPlaceholder')"
                  :hint="t('mediaserver.hostHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-server"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="mediaServerInfo.config.play_host"
                  :label="t('mediaserver.playHost')"
                  :placeholder="t('mediaserver.playHostPlaceholder')"
                  :hint="t('mediaserver.playHostHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-play-network"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="mediaServerInfo.config.token"
                  :label="t('mediaserver.plexToken')"
                  :hint="t('mediaserver.plexTokenHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-key"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model.number="mediaServerInfo.sync_interval"
                  type="number"
                  min="0"
                  step="1"
                  clearable
                  :label="t('mediaserver.syncInterval')"
                  :hint="t('mediaserver.syncIntervalHint', { interval: props.defaultSyncInterval ?? 6 })"
                  persistent-hint
                  suffix="h"
                  prepend-inner-icon="mdi-sync"
                />
              </VCol>
              <VCol cols="12">
                <VAutocomplete
                  v-model="mediaServerInfo.sync_libraries"
                  :label="t('mediaserver.syncLibraries')"
                  :items="librariesOptions"
                  chips
                  multiple
                  clearable
                  :hint="t('mediaserver.syncLibrariesHint')"
                  persistent-hint
                  active
                  append-inner-icon="mdi-refresh"
                  prepend-inner-icon="mdi-library"
                  @click:append-inner="loadLibrary(mediaServerInfo.name)"
                />
              </VCol>
            </VRow>
          </section>

          <section v-else-if="mediaServerInfo.type == 'mediavault'" class="mp-form-section">
            <VRow class="mp-form-grid">
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="mediaServerInfo.name"
                  :label="t('common.name')"
                  :placeholder="t('mediaserver.nameRequired')"
                  :hint="t('mediaserver.serverAlias')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="mediaServerInfo.config.host"
                  :label="t('mediaserver.host')"
                  :placeholder="t('mediaserver.hostPlaceholder')"
                  :hint="t('mediaserver.vyoHostHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-server"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="mediaServerInfo.config.play_host"
                  :label="t('mediaserver.playHost')"
                  :placeholder="t('mediaserver.playHostPlaceholder')"
                  :hint="t('mediaserver.playHostHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-play-network"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="mediaServerInfo.config.apikey"
                  :label="t('mediaserver.apiKey')"
                  :hint="t('mediaserver.vyoApiKeyHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-key"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model.number="mediaServerInfo.sync_interval"
                  type="number"
                  min="0"
                  step="1"
                  clearable
                  :label="t('mediaserver.syncInterval')"
                  :hint="t('mediaserver.syncIntervalHint', { interval: props.defaultSyncInterval ?? 6 })"
                  persistent-hint
                  suffix="h"
                  prepend-inner-icon="mdi-sync"
                />
              </VCol>
              <VCol cols="12">
                <VAutocomplete
                  v-model="mediaServerInfo.sync_libraries"
                  :label="t('mediaserver.syncLibraries')"
                  :items="librariesOptions"
                  chips
                  multiple
                  clearable
                  :hint="t('mediaserver.syncLibrariesHint')"
                  persistent-hint
                  active
                  append-inner-icon="mdi-refresh"
                  prepend-inner-icon="mdi-library"
                  @click:append-inner="loadLibrary(mediaServerInfo.name)"
                />
              </VCol>
            </VRow>
          </section>

          <section v-else class="mp-form-section">
            <VRow class="mp-form-grid">
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="mediaServerInfo.type"
                  :label="t('mediaserver.type')"
                  :hint="t('mediaserver.customTypeHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-cog"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="mediaServerInfo.name"
                  :label="t('common.name')"
                  :hint="t('mediaserver.nameRequired')"
                  persistent-hint
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
            </VRow>
          </section>
        </VForm>
      </VCardText>
      <VDivider />
      <VCardActions class="app-dialog-actions mp-dialog-footer">
        <VSpacer />
        <VBtn color="default" variant="text" size="small" @click="mediaServerInfoDialog = false">
          {{ t('common.cancel') }}
        </VBtn>
        <VBtn color="primary" variant="flat" size="small" class="px-4" @click="saveMediaServerInfo">
          {{ t('common.confirm') }}
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

@media (max-width: 599.98px) {
  .mp-dialog-body {
    padding: 16px !important;
  }
}
</style>
