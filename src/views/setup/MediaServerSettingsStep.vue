<script lang="ts" setup>
import { useTheme } from 'vuetify'
import { useI18n } from '@/composables/useChineseText'
import { useSetupWizard } from '@/composables/useSetupWizard'
import api from '@/api'
import { getLogoUrl } from '@/utils/imageUtils'

const { t } = useI18n()
const { global: globalTheme } = useTheme()
const isDark = computed(() => Boolean(globalTheme?.current?.value?.dark))
const { wizardData, selectMediaServer, validationErrors, savedMediaServerNames } = useSetupWizard()

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

function ensureUgreenConfig() {
  if (wizardData.value.mediaServer.type !== 'ugreen') return
  wizardData.value.mediaServer.config = wizardData.value.mediaServer.config || {}
  if (!wizardData.value.mediaServer.config.scan_mode) {
    wizardData.value.mediaServer.config.scan_mode = 'supplement_missing'
  }
  if (wizardData.value.mediaServer.config.verify_ssl === undefined) {
    wizardData.value.mediaServer.config.verify_ssl = true
  }
}

// 调用API查询媒体库
async function loadLibrary(server: string) {
  try {
    console.log('Loading library for server:', server)
    const result: any[] = await api.get('mediaserver/library', { params: { server } })
    if (result && result.length > 0) {
      librariesOptions.value = result.map(item => ({
        title: item.name,
        value: item.id?.toString(),
      }))
      console.log('Loaded libraries:', librariesOptions.value)
    } else {
      librariesOptions.value = []
      console.log('No libraries found')
    }
    librariesOptions.value.unshift({
      title: t('common.all'),
      value: 'all',
    })
  } catch (e) {
    console.log('Error loading library:', e)
  }
}

// 选择媒体服务器类型（媒体库自动加载由下方 type watch 统一处理）
function selectMediaServerWithLibrary(type: string) {
  selectMediaServer(type)
  ensureUgreenConfig()
}

// 仅在媒体服务器类型切换且名称已存在于服务端保存配置时自动加载媒体库，避免输入名称时逐字符请求
watch(
  () => wizardData.value.mediaServer.type,
  async type => {
    ensureUgreenConfig()
    const serverName = wizardData.value.mediaServer.name?.trim()
    if (type && serverName && savedMediaServerNames.value.includes(serverName)) {
      await loadLibrary(serverName)
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="setup-step">
    <div class="setup-step-head">
      <h3 class="setup-step-title">{{ t('setupWizard.mediaServer.title') }}</h3>
      <p class="setup-step-desc">{{ t('setupWizard.mediaServer.description') }}</p>
    </div>

    <VAlert type="info" variant="tonal" density="compact" class="setup-step-alert mb-3">
      <div class="setup-step-alert__title">{{ t('setupWizard.mediaServer.info') }}</div>
      <div class="setup-step-alert__desc">{{ t('setupWizard.mediaServer.infoDesc') }}</div>
    </VAlert>

    <!-- 媒体服务器选择 -->
    <div class="setup-section">
      <div class="setup-section__label">{{ t('setupWizard.mediaServer.type') }}</div>
      <div class="setup-choice-grid setup-choice-grid--6">
        <button
          v-for="srv in [
            { type: 'emby', label: 'Emby' },
            { type: 'zspace', label: '极影视' },
            { type: 'jellyfin', label: 'Jellyfin' },
            { type: 'plex', label: 'Plex' },
            { type: 'trimemedia', label: '飞牛影视' },
            { type: 'ugreen', label: '绿联影视' },
          ]"
          :key="srv.type"
          type="button"
          class="setup-choice-card"
          :class="{ 'is-selected': wizardData.mediaServer.type === srv.type }"
          @click="selectMediaServerWithLibrary(srv.type)"
        >
          <span class="setup-choice-card__logo" :class="{ 'setup-choice-card__logo--dark': isDark }" aria-hidden="true">
            <VImg
              :src="getLogoUrl(srv.type)"
              height="36"
              width="36"
              :max-width="36"
              :max-height="36"
              contain
              class="mx-auto flex-grow-0 flex-shrink-0"
            />
          </span>
          <span class="setup-choice-card__title">{{ srv.label }}</span>
        </button>
      </div>
    </div>

    <!-- 媒体服务器配置 -->
    <div v-if="wizardData.mediaServer.type" class="setup-step-panel mt-3">
      <VForm @submit.prevent="() => {}">
        <VRow v-if="wizardData.mediaServer.type === 'emby'">
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.mediaServer.name"
              :label="t('common.name')"
              :placeholder="t('mediaserver.nameRequired')"
              :hint="t('mediaserver.serverAlias')"
              :error="validationErrors.mediaServer.name"
              :error-messages="validationErrors.mediaServer.name ? [t('mediaserver.nameRequired')] : []"
              persistent-hint
              active
              prepend-inner-icon="mdi-label"
              required
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.mediaServer.config.host"
              :label="t('mediaserver.host')"
              :placeholder="t('mediaserver.hostPlaceholder')"
              :hint="t('mediaserver.hostHint')"
              :error="validationErrors.mediaServer.host"
              :error-messages="validationErrors.mediaServer.host ? [t('mediaserver.hostRequired')] : []"
              persistent-hint
              active
              prepend-inner-icon="mdi-server"
              required
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.mediaServer.config.play_host"
              :label="t('mediaserver.playHost')"
              :placeholder="t('mediaserver.playHostPlaceholder')"
              :hint="t('mediaserver.playHostHint')"
              persistent-hint
              active
              prepend-inner-icon="mdi-play-network"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.mediaServer.config.username"
              :label="t('mediaserver.username')"
              :hint="t('mediaserver.usernameHint')"
              persistent-hint
              active
              prepend-inner-icon="mdi-account"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.mediaServer.config.apikey"
              :label="t('mediaserver.apiKey')"
              :hint="t('mediaserver.embyApiKeyHint')"
              :error="validationErrors.mediaServer.apikey"
              :error-messages="validationErrors.mediaServer.apikey ? [t('mediaserver.apiKeyRequired')] : []"
              persistent-hint
              active
              prepend-inner-icon="mdi-key"
              required
            />
          </VCol>
          <VCol cols="12">
            <VAutocomplete
              v-model="wizardData.mediaServer.sync_libraries"
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
              @click:append-inner="loadLibrary(wizardData.mediaServer.name)"
            />
          </VCol>
        </VRow>
        <VRow v-else-if="wizardData.mediaServer.type === 'zspace'">
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.mediaServer.name"
              :label="t('common.name')"
              :placeholder="t('mediaserver.nameRequired')"
              :hint="t('mediaserver.serverAlias')"
              :error="validationErrors.mediaServer.name"
              :error-messages="validationErrors.mediaServer.name ? [t('mediaserver.nameRequired')] : []"
              persistent-hint
              active
              prepend-inner-icon="mdi-label"
              required
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.mediaServer.config.host"
              :label="t('mediaserver.host')"
              :placeholder="t('mediaserver.hostPlaceholder')"
              :hint="t('mediaserver.hostHint')"
              :error="validationErrors.mediaServer.host"
              :error-messages="validationErrors.mediaServer.host ? [t('mediaserver.hostRequired')] : []"
              persistent-hint
              active
              prepend-inner-icon="mdi-server"
              required
            />
          </VCol>
          <VCol cols="12">
            <VTextField
              v-model="wizardData.mediaServer.config.play_host"
              :label="t('mediaserver.playHost')"
              :placeholder="t('mediaserver.playHostPlaceholder')"
              :hint="t('mediaserver.playHostHint')"
              persistent-hint
              active
              prepend-inner-icon="mdi-play-network"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.mediaServer.config.username"
              :label="t('mediaserver.username')"
              :hint="t('mediaserver.usernameHint')"
              :error="validationErrors.mediaServer.username"
              :error-messages="validationErrors.mediaServer.username ? [t('mediaserver.usernameRequired')] : []"
              persistent-hint
              active
              prepend-inner-icon="mdi-account"
              required
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              type="password"
              v-model="wizardData.mediaServer.config.password"
              :label="t('mediaserver.password')"
              :error="validationErrors.mediaServer.password"
              :error-messages="validationErrors.mediaServer.password ? [t('mediaserver.passwordRequired')] : []"
              persistent-hint
              active
              prepend-inner-icon="mdi-lock"
              required
            />
          </VCol>
          <VCol cols="12">
            <VAutocomplete
              v-model="wizardData.mediaServer.sync_libraries"
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
              @click:append-inner="loadLibrary(wizardData.mediaServer.name)"
            />
          </VCol>
        </VRow>
        <VRow v-else-if="wizardData.mediaServer.type === 'jellyfin'">
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.mediaServer.name"
              :label="t('common.name')"
              :placeholder="t('mediaserver.nameRequired')"
              :hint="t('mediaserver.serverAlias')"
              :error="validationErrors.mediaServer.name"
              :error-messages="validationErrors.mediaServer.name ? [t('mediaserver.nameRequired')] : []"
              persistent-hint
              active
              prepend-inner-icon="mdi-label"
              required
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.mediaServer.config.host"
              :label="t('mediaserver.host')"
              :placeholder="t('mediaserver.hostPlaceholder')"
              :hint="t('mediaserver.hostHint')"
              :error="validationErrors.mediaServer.host"
              :error-messages="validationErrors.mediaServer.host ? [t('mediaserver.hostRequired')] : []"
              persistent-hint
              active
              prepend-inner-icon="mdi-server"
              required
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.mediaServer.config.play_host"
              :label="t('mediaserver.playHost')"
              :placeholder="t('mediaserver.playHostPlaceholder')"
              :hint="t('mediaserver.playHostHint')"
              persistent-hint
              active
              prepend-inner-icon="mdi-play-network"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.mediaServer.config.apikey"
              :label="t('mediaserver.apiKey')"
              :hint="t('mediaserver.jellyfinApiKeyHint')"
              :error="validationErrors.mediaServer.apikey"
              :error-messages="validationErrors.mediaServer.apikey ? [t('mediaserver.apiKeyRequired')] : []"
              persistent-hint
              active
              prepend-inner-icon="mdi-key"
              required
            />
          </VCol>
          <VCol cols="12">
            <VAutocomplete
              v-model="wizardData.mediaServer.sync_libraries"
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
              @click:append-inner="loadLibrary(wizardData.mediaServer.name)"
            />
          </VCol>
        </VRow>
        <VRow v-else-if="wizardData.mediaServer.type === 'trimemedia'">
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.mediaServer.name"
              :label="t('common.name')"
              :placeholder="t('mediaserver.nameRequired')"
              :hint="t('mediaserver.serverAlias')"
              :error="validationErrors.mediaServer.name"
              :error-messages="validationErrors.mediaServer.name ? [t('mediaserver.nameRequired')] : []"
              persistent-hint
              active
              prepend-inner-icon="mdi-label"
              required
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.mediaServer.config.host"
              :label="t('mediaserver.host')"
              :placeholder="t('mediaserver.hostPlaceholder')"
              :hint="t('mediaserver.hostHint')"
              :error="validationErrors.mediaServer.host"
              :error-messages="validationErrors.mediaServer.host ? [t('mediaserver.hostRequired')] : []"
              persistent-hint
              active
              prepend-inner-icon="mdi-server"
              required
            />
          </VCol>
          <VCol cols="12">
            <VTextField
              v-model="wizardData.mediaServer.config.play_host"
              :label="t('mediaserver.playHost')"
              :placeholder="t('mediaserver.playHostPlaceholder')"
              :hint="t('mediaserver.playHostHint')"
              persistent-hint
              active
              prepend-inner-icon="mdi-play-network"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.mediaServer.config.username"
              :label="t('mediaserver.username')"
              :error="validationErrors.mediaServer.username"
              :error-messages="validationErrors.mediaServer.username ? [t('mediaserver.usernameRequired')] : []"
              active
              prepend-inner-icon="mdi-account"
              required
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              type="password"
              v-model="wizardData.mediaServer.config.password"
              :label="t('mediaserver.password')"
              :error="validationErrors.mediaServer.password"
              :error-messages="validationErrors.mediaServer.password ? [t('mediaserver.passwordRequired')] : []"
              active
              prepend-inner-icon="mdi-lock"
              required
            />
          </VCol>
          <VCol cols="12">
            <VTextField
              type="password"
              v-model="wizardData.mediaServer.config.access_code"
              :label="t('mediaserver.accessCode')"
              :hint="t('mediaserver.accessCodeHint')"
              persistent-hint
              active
              prepend-inner-icon="mdi-shield-key"
            />
          </VCol>
          <VCol cols="12">
            <VAutocomplete
              v-model="wizardData.mediaServer.sync_libraries"
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
              @click:append-inner="loadLibrary(wizardData.mediaServer.name)"
            />
          </VCol>
        </VRow>
        <VRow v-else-if="wizardData.mediaServer.type === 'ugreen'">
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.mediaServer.name"
              :label="t('common.name')"
              :placeholder="t('mediaserver.nameRequired')"
              :hint="t('mediaserver.serverAlias')"
              :error="validationErrors.mediaServer.name"
              :error-messages="validationErrors.mediaServer.name ? [t('mediaserver.nameRequired')] : []"
              persistent-hint
              active
              prepend-inner-icon="mdi-label"
              required
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.mediaServer.config.host"
              :label="t('mediaserver.host')"
              :placeholder="t('mediaserver.hostPlaceholder')"
              :hint="t('mediaserver.hostHint')"
              :error="validationErrors.mediaServer.host"
              :error-messages="validationErrors.mediaServer.host ? [t('mediaserver.hostRequired')] : []"
              persistent-hint
              active
              prepend-inner-icon="mdi-server"
              required
            />
          </VCol>
          <VCol cols="12">
            <VTextField
              v-model="wizardData.mediaServer.config.play_host"
              :label="t('mediaserver.playHost')"
              :placeholder="t('mediaserver.playHostPlaceholder')"
              :hint="t('mediaserver.playHostHint')"
              persistent-hint
              active
              prepend-inner-icon="mdi-play-network"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.mediaServer.config.username"
              :label="t('mediaserver.username')"
              :error="validationErrors.mediaServer.username"
              :error-messages="validationErrors.mediaServer.username ? [t('mediaserver.usernameRequired')] : []"
              active
              prepend-inner-icon="mdi-account"
              required
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              type="password"
              v-model="wizardData.mediaServer.config.password"
              :label="t('mediaserver.password')"
              :error="validationErrors.mediaServer.password"
              :error-messages="validationErrors.mediaServer.password ? [t('mediaserver.passwordRequired')] : []"
              active
              prepend-inner-icon="mdi-lock"
              required
            />
          </VCol>
          <VCol cols="12">
            <VAutocomplete
              v-model="wizardData.mediaServer.sync_libraries"
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
              @click:append-inner="loadLibrary(wizardData.mediaServer.name)"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VSelect
              v-model="wizardData.mediaServer.config.scan_mode"
              :label="t('mediaserver.scanMode')"
              :items="ugreenScanModeOptions"
              :hint="t('mediaserver.scanModeHint')"
              persistent-hint
              active
              prepend-inner-icon="mdi-radar"
            />
          </VCol>
          <VCol cols="12" md="6">
            <div class="mp-switch-card" :title="t('mediaserver.verifySslHint')">
              <VSwitch
                v-model="wizardData.mediaServer.config.verify_ssl"
                :label="t('mediaserver.verifySsl')"
                :hint="t('mediaserver.verifySslHint')"
                persistent-hint
                color="primary"
                density="compact"
                inset
              />
            </div>
          </VCol>
        </VRow>
        <VRow v-else-if="wizardData.mediaServer.type === 'plex'">
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.mediaServer.name"
              :label="t('common.name')"
              :placeholder="t('mediaserver.nameRequired')"
              :hint="t('mediaserver.serverAlias')"
              :error="validationErrors.mediaServer.name"
              :error-messages="validationErrors.mediaServer.name ? [t('mediaserver.nameRequired')] : []"
              persistent-hint
              active
              prepend-inner-icon="mdi-label"
              required
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.mediaServer.config.host"
              :label="t('mediaserver.host')"
              :placeholder="t('mediaserver.hostPlaceholder')"
              :hint="t('mediaserver.hostHint')"
              :error="validationErrors.mediaServer.host"
              :error-messages="validationErrors.mediaServer.host ? [t('mediaserver.hostRequired')] : []"
              persistent-hint
              active
              prepend-inner-icon="mdi-server"
              required
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.mediaServer.config.play_host"
              :label="t('mediaserver.playHost')"
              :placeholder="t('mediaserver.playHostPlaceholder')"
              :hint="t('mediaserver.playHostHint')"
              persistent-hint
              active
              prepend-inner-icon="mdi-play-network"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.mediaServer.config.token"
              :label="t('mediaserver.plexToken')"
              :hint="t('mediaserver.plexTokenHint')"
              :error="validationErrors.mediaServer.token"
              :error-messages="validationErrors.mediaServer.token ? [t('mediaserver.tokenRequired')] : []"
              persistent-hint
              active
              prepend-inner-icon="mdi-key"
              required
            />
          </VCol>
          <VCol cols="12">
            <VAutocomplete
              v-model="wizardData.mediaServer.sync_libraries"
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
              @click:append-inner="loadLibrary(wizardData.mediaServer.name)"
            />
          </VCol>
        </VRow>
        <VRow v-else>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.mediaServer.type"
              :label="t('mediaserver.type')"
              :hint="t('mediaserver.customTypeHint')"
              persistent-hint
              prepend-inner-icon="mdi-cog"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.mediaServer.name"
              :label="t('common.name')"
              :hint="t('mediaserver.nameRequired')"
              persistent-hint
              prepend-inner-icon="mdi-label"
            />
          </VCol>
        </VRow>
      </VForm>
    </div>
  </div>
</template>

<style scoped>
.setup-step-head {
  margin-block-end: 16px;
}

.setup-step-title {
  margin: 0;
  color: rgb(var(--v-theme-on-surface));
  font-size: 16px;
  font-weight: 600;
  line-height: 1.35;
}

.setup-step-desc {
  margin: 4px 0 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12.5px;
  line-height: 1.45;
}

.setup-step-alert__title {
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.35;
}

.setup-step-alert__desc {
  font-size: 12.5px;
  line-height: 1.45;
}

.setup-section__label {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 13.5px;
  font-weight: 600;
  margin-block-end: 10px;
}

.setup-choice-grid {
  display: grid;
  gap: 13px;
}

.setup-choice-grid--6 {
  grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
}

.setup-choice-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 13px 10px;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.02);
  cursor: pointer;
  gap: 8px;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}

.setup-choice-card:hover {
  border-color: var(--mp-border-hover);
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.setup-choice-card.is-selected {
  border-color: rgba(var(--v-theme-primary), 0.65);
  background: rgba(var(--v-theme-primary), 0.08);
}

.setup-choice-card__logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.03);
  block-size: 46px;
  inline-size: 46px;
}

.setup-choice-card__logo--dark {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.085);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.setup-choice-card__title {
  color: rgb(var(--v-theme-on-surface));
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.35;
}

.setup-step-panel {
  padding: 16px;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.015);
}
</style>
