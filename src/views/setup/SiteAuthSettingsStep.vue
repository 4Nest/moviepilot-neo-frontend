<script lang="ts" setup>
import { computed } from 'vue'
import { useI18n } from '@/composables/useChineseText'
import { useSetupWizard } from '@/composables/useSetupWizard'

const { t } = useI18n()
const { wizardData, authSites, validationErrors } = useSetupWizard()

const siteItems = computed(() => {
  return Object.keys(authSites.value).map(key => ({
    key,
    name: authSites.value[key].name,
    prependAvatar: authSites.value[key].icon,
  }))
})

const formFields = computed(() => {
  const site = authSites.value[wizardData.value.siteAuth.site]
  return Object.keys(site?.params || {})
    .filter(key => site.params[key]?.name && site.params[key]?.type)
    .map(key => ({
      key,
      site: wizardData.value.siteAuth.site,
      name: site.params[key].name,
      type: site.params[key].type,
      placeholder: site.params[key].placeholder,
      tooltip: site.params[key].tooltip,
    }))
})
</script>

<template>
  <div class="setup-step">
    <div class="setup-step-head">
      <h3 class="setup-step-title">{{ t('setupWizard.siteAuth.title') }}</h3>
      <p class="setup-step-desc">{{ t('setupWizard.siteAuth.description') }}</p>
    </div>

    <VAlert type="info" variant="tonal" density="compact" class="setup-step-alert mb-3">
      <div class="setup-step-alert__title">{{ t('setupWizard.siteAuth.info') }}</div>
      <div class="setup-step-alert__desc">{{ t('setupWizard.siteAuth.infoDesc') }}</div>
    </VAlert>

    <div class="setup-step-panel">
      <VForm @submit.prevent="() => {}">
        <VRow>
          <VCol cols="12">
            <VSelect
              v-model="wizardData.siteAuth.site"
              :items="siteItems"
              item-value="key"
              item-title="name"
              item-props
              :label="t('dialog.userAuth.selectSite')"
              :hint="t('setupWizard.siteAuth.selectSiteHint')"
              :error="validationErrors.siteAuth.site"
              :error-messages="validationErrors.siteAuth.site ? [t('dialog.userAuth.selectSiteRequired')] : []"
              persistent-hint
              prepend-inner-icon="mdi-web"
              clearable
            />
          </VCol>

          <template v-if="wizardData.siteAuth.site">
            <VCol cols="12">
              <VAlert type="warning" variant="tonal" density="compact" class="setup-step-alert">
                <div class="setup-step-alert__desc">{{ t('setupWizard.siteAuth.submitHint') }}</div>
              </VAlert>
            </VCol>

            <VCol v-for="param in formFields" :key="param.key" cols="12" md="6">
              <VTextField
                v-model="wizardData.siteAuth.params[param.site.toUpperCase() + '_' + param.key.toUpperCase()]"
                :type="param.type"
                :label="param.name"
                :placeholder="param.placeholder"
                :hint="param.tooltip"
                :error="validationErrors.siteAuth[param.site.toUpperCase() + '_' + param.key.toUpperCase()]"
                :error-messages="
                  validationErrors.siteAuth[param.site.toUpperCase() + '_' + param.key.toUpperCase()]
                    ? [t('setupWizard.siteAuth.fieldRequired', { name: param.name })]
                    : []
                "
                clearable
                persistent-hint
              />
            </VCol>
          </template>
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

.setup-step-panel {
  padding: 16px;
  border: 1px solid var(--mp-border-card);
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.015);
}
</style>
