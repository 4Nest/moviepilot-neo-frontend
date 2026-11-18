<script lang="ts" setup>
import type { AxiosError } from 'axios'
import { useToast } from 'vue-toastification'
import type { DownloaderConf, Site } from '@/api/types'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import { numberValidator, requiredValidator } from '@/@validators'
import api from '@/api'
import { useDisplay } from 'vuetify'
import { useI18n } from '@/composables/useChineseText'

// 国际化
const { t } = useI18n()

// 显示器宽度
const display = useDisplay()

// 输入参数
const props = defineProps({
  siteid: Number,
  oper: String,
})

// 注册事件
const emit = defineEmits(['save', 'remove', 'close'])

// 站点编辑表单数据
const siteForm = ref<Site>({
  id: props.siteid ?? 0,
  url: '',
  rss: '',
  cookie: '',
  ua: '',
  pri: 0,
  is_active: true,
  limit_interval: 0,
  limit_seconds: 0,
  name: '',
  domain: '',
  downloader: '',
})

// 提示框
const $toast = useToast()

// 维护类型
const siteType = ref('cookie')

// 是否限流
const isLimit = ref(false)
// 是否开启单站点健康预警通知
const sentinelAlert = ref(true)
// 加入 CookieCloud 同步域名黑名单状态
const addingToCookieCloudBlacklist = ref(false)
// 表单引用与保存加载状态
const siteFormRef = ref()
const saving = ref(false)
const optionalNumberValidator = (val: unknown) =>
  val === undefined || val === null || val === '' || numberValidator(val)
const priorityRequiredValidator = (val: unknown) => val !== undefined && val !== null && val !== ''

// 状态下拉项
const statusItems = [
  { title: t('site.status.enabled'), value: true },
  { title: t('site.status.disabled'), value: false },
]

// 生成1到50的优先级下拉框选项
const priorityItems = ref(
  Array.from({ length: 100 }, (_, i) => i + 1).map(item => ({
    title: item,
    value: item,
  })),
)

// 下载器选项
const downloaderOptions = ref<{ title: string; value: string }[]>([])

async function loadDownloaderSetting() {
  try {
    const downloaders: DownloaderConf[] = await api.get('download/clients')
    downloaderOptions.value = [
      { title: t('common.default'), value: '' },
      ...downloaders.map((item: { name: any }) => ({
        title: item.name,
        value: item.name,
      })),
    ]
  } catch (error) {
    console.error(t('site.errors.loadDownloader'), error)
  }
}

// 解析站点扩展配置字典；普通字符串、数组或空值返回 null，避免误覆盖原有备注。
function parseSiteNoteObject(rawNote: Site['note']): Record<string, unknown> | null {
  if (rawNote && typeof rawNote === 'object' && !Array.isArray(rawNote)) {
    return { ...rawNote }
  }
  if (typeof rawNote === 'string' && rawNote.trim()) {
    try {
      const parsed = JSON.parse(rawNote)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...parsed }
      }
    } catch {
      return null
    }
  }
  return null
}

// 将单站点健康预警通知开关安全写回 note 扩展配置
function syncSentinelAlertToNote() {
  const noteObj = parseSiteNoteObject(siteForm.value.note)
  if (!sentinelAlert.value) {
    siteForm.value.note = { ...(noteObj ?? {}), sentinel_alert: false }
  } else if (noteObj !== null && 'sentinel_alert' in noteObj) {
    delete noteObj.sentinel_alert
    siteForm.value.note = noteObj
  }
}

// 查询站点信息
async function fetchSiteInfo() {
  try {
    siteForm.value = await api.get(`site/${props.siteid}`)
    siteForm.value.proxy = siteForm.value.proxy === 1
    siteForm.value.render = siteForm.value.render === 1
    const noteObj = parseSiteNoteObject(siteForm.value.note)
    sentinelAlert.value = noteObj?.sentinel_alert !== false
  } catch (error) {
    console.error(error)
  }
}

// 调用API 新增站点
async function addSite() {
  if (saving.value) return
  const { valid } = (await siteFormRef.value?.validate()) || { valid: true }
  if (!valid || !siteForm.value?.url) return
  saving.value = true
  startNProgress()
  try {
    syncSentinelAlertToNote()
    const result: { [key: string]: string } = await api.post('site/', siteForm.value)
    if (result.success) {
      $toast.success(t('site.messages.addSuccess'))
      emit('save')
    } else {
      $toast.error(`${t('site.messages.addFailed')}：${result.message}`)
    }
  } catch (error) {
    $toast.error(`${t('site.messages.addFailed')}！`)
    console.error(error)
  } finally {
    saving.value = false
    doneNProgress()
  }
}

// 调用API更新站点信息
async function updateSiteInfo() {
  if (saving.value) return
  const { valid } = (await siteFormRef.value?.validate()) || { valid: true }
  if (!valid || !siteForm.value?.url) return
  saving.value = true
  startNProgress()
  try {
    if (isLimit.value) {
      siteForm.value.limit_interval = siteForm.value.limit_interval || 0
      siteForm.value.limit_count = siteForm.value.limit_count || 0
      siteForm.value.limit_seconds = siteForm.value.limit_seconds || 0
    } else {
      siteForm.value.limit_interval = 0
      siteForm.value.limit_count = 0
      siteForm.value.limit_seconds = 0
    }
    syncSentinelAlertToNote()
    const result: { [key: string]: any } = await api.put('site/', siteForm.value)
    if (result.success) {
      $toast.success(`${siteForm.value?.name} ${t('site.messages.updateSuccess')}`)
      emit('save')
    } else {
      $toast.error(`${siteForm.value?.name} ${t('site.messages.updateFailed')}：${result.message}`)
    }
  } catch (error) {
    $toast.error(`${siteForm.value?.name} ${t('site.messages.updateFailed')}！`)
    console.error(error)
  } finally {
    saving.value = false
    doneNProgress()
  }
}

// 将当前已保存站点加入 CookieCloud 同步域名黑名单
async function addToCookieCloudBlacklist() {
  if (!siteForm.value.id) return

  addingToCookieCloudBlacklist.value = true
  try {
    const result: { message?: string; success: boolean } = await api.post(
      `site/${siteForm.value.id}/cookiecloud-blacklist`,
    )
    if (result.success) {
      $toast.success(result.message || t('site.messages.blacklistSuccess'))
    } else {
      $toast.error(result.message || t('site.messages.blacklistFailed'))
    }
  } catch (error) {
    console.error(error)
    const apiError = error as AxiosError<{ detail?: unknown; message?: unknown }>
    const message = apiError.response?.data?.message || apiError.response?.data?.detail
    $toast.error(typeof message === 'string' ? message : t('site.messages.blacklistFailed'))
  } finally {
    addingToCookieCloudBlacklist.value = false
  }
}

onMounted(async () => {
  if (props.oper !== 'add') {
    await fetchSiteInfo()
    if (siteForm.value.limit_interval || siteForm.value.limit_count || siteForm.value.limit_seconds)
      isLimit.value = true
    if (siteForm.value.apikey || siteForm.value.token) siteType.value = 'api'
  }
  await loadDownloaderSetting()
})
</script>

<template>
  <VDialog scrollable :close-on-back="false" eager max-width="46rem" :fullscreen="!display.mdAndUp.value">
    <VCard class="mp-dialog-card">
      <VCardItem class="mp-dialog-header">
        <template #prepend>
          <VIcon :icon="oper == 'add' ? 'mdi-web-plus' : 'mdi-web'" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>{{ `${props.oper === 'add' ? t('site.actions.add') : t('site.actions.edit')}` }}</VCardTitle>
        <VCardSubtitle v-if="siteForm.name">{{ siteForm.name }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn :disabled="saving" @click="emit('close')" />
      <VDivider />
      <VCardText class="mp-dialog-body">
        <VForm ref="siteFormRef" @submit.prevent="() => {}" class="mp-form-sections">
          <!-- 基础站点连接与调度 -->
          <section class="mp-form-section">
            <VRow class="mp-form-grid">
              <VCol cols="12">
                <VTextField
                  v-model="siteForm.url"
                  :label="t('site.fields.url')"
                  :rules="[requiredValidator]"
                  :hint="t('site.hints.url')"
                  persistent-hint
                  prepend-inner-icon="mdi-web"
                />
              </VCol>
              <VCol cols="12">
                <VTextField
                  v-model="siteForm.rss"
                  :label="t('site.fields.rss')"
                  :hint="t('site.hints.rss')"
                  persistent-hint
                  prepend-inner-icon="mdi-rss"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VAutocomplete
                  v-model="siteForm.pri"
                  :label="t('site.fields.priority')"
                  :items="priorityItems"
                  :rules="[priorityRequiredValidator]"
                  :hint="t('site.hints.priority')"
                  persistent-hint
                  prepend-inner-icon="mdi-priority-high"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VSelect
                  v-model="siteForm.is_active"
                  :items="statusItems"
                  :label="t('site.fields.status')"
                  :hint="t('site.hints.status')"
                  persistent-hint
                  prepend-inner-icon="mdi-toggle-switch"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VTextField
                  v-model="siteForm.timeout"
                  :label="t('site.fields.timeout')"
                  :hint="t('site.hints.timeout')"
                  persistent-hint
                  prepend-inner-icon="mdi-timer"
                />
              </VCol>
              <VCol cols="12" sm="6">
                <VAutocomplete
                  v-model="siteForm.downloader"
                  :label="t('site.fields.downloader')"
                  :items="downloaderOptions"
                  :hint="t('site.hints.downloader')"
                  persistent-hint
                  prepend-inner-icon="mdi-download"
                />
              </VCol>
            </VRow>
          </section>

          <!-- 鉴权模式与凭证 -->
          <section class="mp-form-section">
            <div class="mp-segmented-bar">
              <VTabs v-model="siteType" density="compact" class="mp-segmented-tabs">
                <VTab value="cookie" :ripple="false">
                  <VIcon size="16" start icon="mdi-cookie" />
                  Cookie
                </VTab>
                <VTab value="api" :ripple="false">
                  <VIcon size="16" start icon="mdi-api" />
                  API
                </VTab>
              </VTabs>
            </div>
            <VWindow v-model="siteType" class="mt-3 disable-tab-transition" :touch="false">
              <VWindowItem value="cookie">
                <VRow class="mp-form-grid">
                  <VCol cols="12">
                    <VTextarea
                      v-model="siteForm.cookie"
                      :label="t('site.fields.cookie')"
                      :hint="t('site.hints.cookie')"
                      rows="3"
                      auto-grow
                      persistent-hint
                      prepend-inner-icon="mdi-cookie"
                    />
                  </VCol>
                  <VCol cols="12">
                    <VTextField
                      v-model="siteForm.ua"
                      :label="t('site.fields.userAgent')"
                      :hint="t('site.hints.userAgent')"
                      persistent-hint
                      prepend-inner-icon="mdi-web-box"
                    />
                  </VCol>
                </VRow>
              </VWindowItem>
              <VWindowItem value="api">
                <VRow class="mp-form-grid">
                  <VCol cols="12" sm="6">
                    <VTextField
                      v-model="siteForm.token"
                      :label="t('site.fields.authorization')"
                      :hint="t('site.hints.authorization')"
                      persistent-hint
                      prepend-inner-icon="mdi-key"
                    />
                  </VCol>
                  <VCol cols="12" sm="6">
                    <VTextField
                      v-model="siteForm.apikey"
                      :label="t('site.fields.apiKey')"
                      :hint="t('site.hints.apiKey')"
                      persistent-hint
                      prepend-inner-icon="mdi-api"
                    />
                  </VCol>
                </VRow>
              </VWindowItem>
            </VWindow>
          </section>

          <!-- 访问频率流控分组面板 -->
          <section class="mp-form-section">
            <div class="mp-settings-card">
              <div class="mp-setting-row">
                <VSwitch
                  v-model="isLimit"
                  :label="t('site.fields.limitAccess')"
                  color="primary"
                  inset
                  density="compact"
                  hide-details
                />
              </div>
              <div v-if="isLimit" class="mp-setting-subpanel">
                <VRow class="mp-form-grid">
                  <VCol cols="12" sm="4">
                    <VTextField
                      v-model="siteForm.limit_interval"
                      :label="t('site.fields.limitInterval')"
                      :rules="[optionalNumberValidator]"
                      :hint="t('site.hints.limitInterval')"
                      persistent-hint
                      prepend-inner-icon="mdi-clock-outline"
                    />
                  </VCol>
                  <VCol cols="12" sm="4">
                    <VTextField
                      v-model="siteForm.limit_count"
                      :label="t('site.fields.limitCount')"
                      :rules="[optionalNumberValidator]"
                      :hint="t('site.hints.limitCount')"
                      persistent-hint
                      prepend-inner-icon="mdi-counter"
                    />
                  </VCol>
                  <VCol cols="12" sm="4">
                    <VTextField
                      v-model="siteForm.limit_seconds"
                      :label="t('site.fields.limitSeconds')"
                      :rules="[optionalNumberValidator]"
                      :hint="t('site.hints.limitSeconds')"
                      persistent-hint
                      prepend-inner-icon="mdi-timer-sand"
                    />
                  </VCol>
                </VRow>
              </div>
            </div>
          </section>

          <!-- 网络策略与监控预警紧凑开关组 -->
          <section class="mp-form-section">
            <div class="mp-settings-card">
              <div class="mp-setting-row" :title="t('site.hints.useProxy')">
                <VSwitch
                  v-model="siteForm.proxy"
                  :label="t('site.fields.useProxy')"
                  hide-details
                  color="primary"
                  inset
                  density="compact"
                />
              </div>
              <div class="mp-setting-row" :title="t('site.hints.browserSimulation')">
                <VSwitch
                  v-model="siteForm.render"
                  :label="t('site.fields.browserSimulation')"
                  hide-details
                  color="primary"
                  inset
                  density="compact"
                />
              </div>
              <div class="mp-setting-row" :title="t('site.hints.sentinelAlert')">
                <VSwitch
                  v-model="sentinelAlert"
                  :label="t('site.fields.sentinelAlert')"
                  hide-details
                  color="primary"
                  inset
                  density="compact"
                />
              </div>
            </div>
          </section>
        </VForm>
      </VCardText>
      <VDivider />
      <VCardActions class="app-dialog-actions mp-dialog-footer">
        <VBtn
          v-if="props.oper !== 'add'"
          color="default"
          variant="outlined"
          size="small"
          prepend-icon="mdi-cloud-off-outline"
          :loading="addingToCookieCloudBlacklist"
          :disabled="addingToCookieCloudBlacklist || saving"
          @click="addToCookieCloudBlacklist"
        >
          {{ t('site.actions.addToBlacklist') }}
        </VBtn>
        <VSpacer />
        <VBtn color="default" variant="text" size="small" :disabled="saving" @click="emit('close')">
          {{ t('common.cancel') }}
        </VBtn>
        <VBtn
          v-if="props.oper === 'add'"
          color="primary"
          variant="flat"
          size="small"
          class="px-4"
          :loading="saving"
          :disabled="saving"
          @click="addSite"
        >
          {{ t('site.actions.add') }}
        </VBtn>
        <VBtn
          v-else
          color="primary"
          variant="flat"
          size="small"
          class="px-4"
          :loading="saving"
          :disabled="saving"
          @click="updateSiteInfo"
        >
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

.mp-segmented-bar {
  display: flex;
  align-items: center;
}

.mp-segmented-tabs {
  display: inline-flex;
  border: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.1));
  border-radius: 8px;
  background: var(--mp-item-bg, rgba(var(--v-theme-on-surface), 0.04));
  block-size: 36px !important;
  inline-size: fit-content;
  max-inline-size: 100%;
  min-block-size: 36px !important;
  padding: 3px;

  :deep(.v-slide-group__container),
  :deep(.v-slide-group__content) {
    align-items: center;
    gap: 2px;
  }

  :deep(.v-tab__slider) {
    display: none !important;
  }

  :deep(.v-tab) {
    border-radius: 6px !important;
    block-size: 28px !important;
    color: rgba(var(--v-theme-on-surface), 0.64);
    font-size: 0.8125rem;
    font-weight: 500;
    letter-spacing: 0.01em;
    min-block-size: 28px !important;
    min-inline-size: 84px;
    padding-inline: 14px;
    text-transform: none;
    transition:
      background-color 0.16s ease,
      color 0.16s ease,
      box-shadow 0.16s ease;
  }

  :deep(.v-tab--selected) {
    background: rgb(var(--v-theme-surface));
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.08),
      0 0 0 1px var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.08));
    color: rgb(var(--v-theme-on-surface)) !important;
    font-weight: 600;
  }
}

@media (max-width: 599.98px) {
  .mp-dialog-body {
    padding: 16px !important;
  }
}
</style>
