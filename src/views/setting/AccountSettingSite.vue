<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api, { getApiErrorMessage } from '@/api'
import { useI18n } from '@/composables/useChineseText'
import { useSilentSettingRefresh } from '@/composables/useSilentSettingRefresh'

// 国际化
const { t } = useI18n()

const props = defineProps({
  active: {
    type: Boolean,
    default: true,
  },
})

// 提示框
const $toast = useToast()

// 站点重置
const isConfirmResetSites = ref(false)

// 站点重置按钮文本
const resetSitesText = ref(t('setting.site.resetSites'))

// 站点重置按钮可用状态
const resetSitesDisabled = ref(false)

// 各卡片独立的保存加载锁
const savingCookieCloud = ref(false)
const savingSiteOptions = ref(false)

const isPasswordVisible = ref(false)

const isCookieCloudAuthHeaderVisible = ref(false)

// 站点设置默认值
const siteSetting = ref<any>({
  CookieCloud: {
    COOKIECLOUD_HOST: '',
    COOKIECLOUD_KEY: '',
    COOKIECLOUD_PASSWORD: '',
    COOKIECLOUD_AUTH_HEADER: '',
    COOKIECLOUD_INTERVAL: 0,
    COOKIECLOUD_ENABLE_LOCAL: false,
    COOKIECLOUD_BLACKLIST: '',
  },
  Site: {
    SITEDATA_REFRESH_INTERVAL: 0,
    SITE_MESSAGE: false,
    SITE_SENTINEL_ALERT: true,
    BROWSER_EMULATION: 'cloakbrowser',
    OCR_HOST: '',
    FLARESOLVERR_URL: '',
  },
})

// 同步间隔下拉框
const CookieCloudIntervalItems = [
  { title: t('setting.site.syncInterval.hourly'), value: 60 },
  { title: t('setting.site.syncInterval.every6Hours'), value: 360 },
  { title: t('setting.site.syncInterval.every12Hours'), value: 720 },
  { title: t('setting.site.syncInterval.daily'), value: 1440 },
  { title: t('setting.site.syncInterval.weekly'), value: 10080 },
  { title: t('setting.site.syncInterval.monthly'), value: 43200 },
  { title: t('setting.site.syncInterval.never'), value: 0 },
]

// 站点数据刷新间隔
const SiteDataRefreshIntervalItems = [
  { title: t('setting.site.syncInterval.hourly'), value: 1 },
  { title: t('setting.site.syncInterval.every6Hours'), value: 6 },
  { title: t('setting.site.syncInterval.every12Hours'), value: 12 },
  { title: t('setting.site.syncInterval.daily'), value: 24 },
  { title: t('setting.site.syncInterval.weekly'), value: 168 },
  { title: t('setting.site.syncInterval.never'), value: 0 },
]

// 站点访问仿真方式
const BrowserEmulationItems = [
  { title: 'CloakBrowser', value: 'cloakbrowser' },
  { title: 'FlareSolverr', value: 'flaresolverr' },
]

// 重置站点
async function resetSites() {
  if (resetSitesDisabled.value) return
  try {
    resetSitesDisabled.value = true
    resetSitesText.value = t('setting.site.resettingSites')

    const result: { [key: string]: any } = await api.get('site/reset')
    if (result.success) $toast.success(t('setting.site.resetSuccess'))
    else $toast.error(result.message || t('setting.site.resetFailed'))
  } catch (error) {
    console.log(error)
    $toast.error(getApiErrorMessage(error) || t('setting.site.resetFailed'))
  } finally {
    resetSitesDisabled.value = false
    resetSitesText.value = t('setting.site.resetSites')
  }
}

// 加载站点设置
async function loadSiteSettings() {
  try {
    const result: { [key: string]: any } = await api.get('system/env')
    if (result.success) {
      // 将API返回的值赋值给SystemSettings
      for (const sectionKey of Object.keys(siteSetting.value) as Array<keyof typeof siteSetting.value>) {
        Object.keys(siteSetting.value[sectionKey]).forEach((key: string) => {
          if (result.data.hasOwnProperty(key)) (siteSetting.value[sectionKey] as any)[key] = result.data[key]
        })
      }
    }
  } catch (error) {
    console.log(error)
  }
}

// 调用API保存设置
async function saveSiteSetting(value: { [key: string]: any }, section: 'cookieCloud' | 'site' = 'site') {
  const lockRef = section === 'cookieCloud' ? savingCookieCloud : savingSiteOptions
  if (lockRef.value) return
  lockRef.value = true
  try {
    const result: { [key: string]: any } = await api.post('system/env', value)
    if (result.success) {
      $toast.success(t('setting.site.saveSuccess'))
    } else {
      $toast.error(result.message || t('setting.site.saveFailed'))
    }
  } catch (error) {
    console.log(error)
    $toast.error(t('setting.system.saveFailed', { message: getApiErrorMessage(error) || t('setting.site.saveFailed') }))
  } finally {
    lockRef.value = false
  }
}

// 加载数据
onMounted(() => {
  loadSiteSettings()
})

useSilentSettingRefresh(
  async () => {
    if (savingCookieCloud.value || savingSiteOptions.value || resetSitesDisabled.value) return
    await loadSiteSettings()
  },
  {
    active: computed(() => props.active),
  },
)
</script>

<template>
  <div class="mp-setting-stack">
    <VCard id="sec-site-sync" class="mp-setting-card">
      <VCardItem>
        <template #prepend>
          <div class="mp-setting-card__icon mp-setting-card__icon--primary">
            <VIcon icon="mdi-cloud-sync-outline" size="18" />
          </div>
        </template>
        <VCardTitle>{{ t('setting.site.siteSync') }}</VCardTitle>
        <VCardSubtitle>{{ t('setting.site.siteSyncDesc') }}</VCardSubtitle>
      </VCardItem>
      <VCardText>
        <VForm>
          <VRow>
            <VCol cols="12" md="6">
              <div class="mp-switch-card" :title="t('setting.site.enableLocalCookieCloudHint')">
                <VSwitch
                  v-model="siteSetting.CookieCloud.COOKIECLOUD_ENABLE_LOCAL"
                  :label="t('setting.site.enableLocalCookieCloud')"
                  :hint="t('setting.site.enableLocalCookieCloudHint')"
                  color="primary"
                  density="compact"
                  inset
                  persistent-hint
                />
              </div>
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="12" md="6">
              <VTextField
                v-model="siteSetting.CookieCloud.COOKIECLOUD_HOST"
                :label="t('setting.site.serviceAddress')"
                :placeholder="t('setting.site.serviceAddressPlaceholder')"
                :disabled="siteSetting.CookieCloud.COOKIECLOUD_ENABLE_LOCAL"
                :hint="t('setting.site.serviceAddressHint')"
                prepend-inner-icon="mdi-server"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="siteSetting.CookieCloud.COOKIECLOUD_KEY"
                :label="t('setting.site.userKey')"
                :hint="t('setting.site.userKeyHint')"
                prepend-inner-icon="mdi-key"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="siteSetting.CookieCloud.COOKIECLOUD_PASSWORD"
                :type="isPasswordVisible ? 'text' : 'password'"
                :append-inner-icon="isPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                @click:append-inner="isPasswordVisible = !isPasswordVisible"
                :label="t('setting.site.e2ePassword')"
                :hint="t('setting.site.e2ePasswordHint')"
                prepend-inner-icon="mdi-lock"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="siteSetting.CookieCloud.COOKIECLOUD_AUTH_HEADER"
                :type="isCookieCloudAuthHeaderVisible ? 'text' : 'password'"
                :append-inner-icon="isCookieCloudAuthHeaderVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                @click:append-inner="isCookieCloudAuthHeaderVisible = !isCookieCloudAuthHeaderVisible"
                :label="t('setting.site.cookieCloudAuthHeader')"
                :hint="t('setting.site.cookieCloudAuthHeaderHint')"
                prepend-inner-icon="mdi-shield-key"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VSelect
                v-model="siteSetting.CookieCloud.COOKIECLOUD_INTERVAL"
                :label="t('setting.site.autoSyncInterval')"
                :items="CookieCloudIntervalItems"
                :hint="t('setting.site.autoSyncIntervalHint')"
                prepend-inner-icon="mdi-timer"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="siteSetting.CookieCloud.COOKIECLOUD_BLACKLIST"
                :label="t('setting.site.syncBlacklist')"
                :placeholder="t('setting.site.syncBlacklistPlaceholder')"
                :hint="t('setting.site.syncBlacklistHint')"
                prepend-inner-icon="mdi-block-helper"
              />
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
            :loading="savingCookieCloud"
            :disabled="savingCookieCloud"
            class="px-4"
            @click="saveSiteSetting(siteSetting.CookieCloud, 'cookieCloud')"
          >
            {{ t('common.save') }}
          </VBtn>
        </VForm>
      </VCardText>
    </VCard>

    <VCard id="sec-site-options" class="mp-setting-card">
      <VCardItem>
        <template #prepend>
          <div class="mp-setting-card__icon mp-setting-card__icon--info">
            <VIcon icon="mdi-earth" size="18" />
          </div>
        </template>
        <VCardTitle>{{ t('setting.site.siteOptions') }}</VCardTitle>
        <VCardSubtitle>配置站点数据定时刷新、浏览器防盾仿真、验证码识别与告警推送</VCardSubtitle>
      </VCardItem>
      <VCardText>
        <VForm>
          <VRow>
            <VCol cols="12" md="6">
              <VSelect
                v-model="siteSetting.Site.SITEDATA_REFRESH_INTERVAL"
                :label="t('setting.site.siteDataRefreshInterval')"
                :items="SiteDataRefreshIntervalItems"
                :hint="t('setting.site.siteDataRefreshIntervalHint')"
                prepend-inner-icon="mdi-refresh"
              />
            </VCol>

            <VCol cols="12" md="6">
              <VSelect
                v-model="siteSetting.Site.BROWSER_EMULATION"
                :items="BrowserEmulationItems"
                :label="t('setting.site.browserEmulation')"
                :hint="t('setting.site.browserEmulationHint')"
                prepend-inner-icon="mdi-web"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="siteSetting.Site.OCR_HOST"
                :label="t('setting.site.ocrHost')"
                placeholder="https://movie-pilot.org"
                :hint="t('setting.site.ocrHostHint')"
                prepend-inner-icon="mdi-text-recognition"
              />
            </VCol>
            <VCol v-if="siteSetting.Site.BROWSER_EMULATION == 'flaresolverr'" cols="12" md="6">
              <VTextField
                v-model="siteSetting.Site.FLARESOLVERR_URL"
                :label="t('setting.site.flaresolverrUrl')"
                :placeholder="'http://127.0.0.1:8191'"
                :hint="t('setting.site.flaresolverrUrlHint')"
                prepend-inner-icon="mdi-server"
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="12" md="6">
              <div class="mp-switch-card" :title="t('setting.site.readSiteMessageHint')">
                <VSwitch
                  v-model="siteSetting.Site.SITE_MESSAGE"
                  :label="t('setting.site.readSiteMessage')"
                  :hint="t('setting.site.readSiteMessageHint')"
                  color="primary"
                  density="compact"
                  inset
                  persistent-hint
                />
              </div>
            </VCol>
            <VCol cols="12" md="6">
              <div class="mp-switch-card" :title="t('setting.site.sentinelAlertHint')">
                <VSwitch
                  v-model="siteSetting.Site.SITE_SENTINEL_ALERT"
                  :label="t('setting.site.sentinelAlert')"
                  :hint="t('setting.site.sentinelAlertHint')"
                  color="primary"
                  density="compact"
                  inset
                  persistent-hint
                />
              </div>
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
            :loading="savingSiteOptions"
            :disabled="savingSiteOptions"
            class="px-4"
            @click="saveSiteSetting(siteSetting.Site, 'site')"
          >
            {{ t('common.save') }}
          </VBtn>
        </VForm>
      </VCardText>
    </VCard>

    <VCard id="sec-site-danger" class="mp-setting-card mp-setting-card--danger">
      <VCardItem>
        <template #prepend>
          <div class="mp-setting-card__icon mp-setting-card__icon--error">
            <VIcon icon="mdi-alert-octagon-outline" size="18" />
          </div>
        </template>
        <VCardTitle>{{ t('setting.site.siteReset') }}</VCardTitle>
        <VCardSubtitle>清空所有已同步和手动添加的站点凭证与统计缓存，此操作不可撤销</VCardSubtitle>
      </VCardItem>
      <VCardText>
        <div class="site-reset-box">
          <div class="site-reset-box__control">
            <VCheckbox
              v-model="isConfirmResetSites"
              :label="t('setting.site.confirmReset')"
              :hint="t('setting.site.confirmResetHint')"
              density="compact"
              persistent-hint
            />
          </div>

          <VBtn
            :loading="resetSitesDisabled"
            :disabled="!isConfirmResetSites || resetSitesDisabled"
            size="small"
            color="error"
            variant="tonal"
            rounded="lg"
            prepend-icon="mdi-restore-alert"
            class="px-4 flex-shrink-0"
            @click="resetSites"
          >
            {{ resetSitesText }}
          </VBtn>
        </div>
      </VCardText>
    </VCard>
  </div>
</template>

<style scoped>
.site-reset-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 14px;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: var(--mp-item-bg, rgba(var(--v-theme-on-surface), 0.02));
  gap: 13px;
}

.site-reset-box__control {
  flex: 1 1 auto;
  min-inline-size: 0;
}

@media (width <= 600px) {
  .site-reset-box {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
  }

  .site-reset-box__control {
    inline-size: 100%;
  }
}
</style>
