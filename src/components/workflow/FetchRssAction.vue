<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { useI18n } from '@/composables/useChineseText'

const { t } = useI18n()

const props = defineProps({
  id: {
    type: String,
    required: true,
  },
  data: {
    type: Object,
    required: true,
  },
})

const nodeData = computed(() => props.data)
</script>
<template>
  <div>
    <VCard max-width="20rem" class="workflow-node-card">
      <Handle id="edge_in" type="target" :position="Position.Left" />
      <VCardItem class="workflow-node-header">
        <template #prepend>
          <VAvatar size="34" rounded="lg" variant="tonal" color="primary" class="workflow-node-avatar">
            <VIcon icon="mdi-rss" size="18" />
          </VAvatar>
        </template>
        <VCardTitle class="workflow-node-title">{{ t('workflow.fetchRss.title') }}</VCardTitle>
        <VCardSubtitle class="workflow-node-subtitle">{{ t('workflow.fetchRss.subtitle') }}</VCardSubtitle>
      </VCardItem>
      <VDivider />
      <VCardText class="workflow-node-body">
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol cols="12">
              <VTextField
                v-model="nodeData.url"
                :label="t('workflow.fetchRss.url')"
                variant="outlined"
                density="compact"
                hide-details="auto"
                clearable
              />
            </VCol>
            <VCol cols="12">
              <VTextField
                v-model="nodeData.ua"
                :label="t('workflow.fetchRss.userAgent')"
                variant="outlined"
                density="compact"
                hide-details="auto"
                clearable
              />
            </VCol>
            <VCol cols="12">
              <VTextField
                v-model="nodeData.timeout"
                type="number"
                :label="t('workflow.fetchRss.timeout')"
                variant="outlined"
                density="compact"
                hide-details="auto"
                clearable
              />
            </VCol>
            <VCol cols="6">
              <div class="mp-switch-card workflow-node-switch">
                <VSwitch
                  v-model="nodeData.match_media"
                  :label="t('workflow.fetchRss.matchMedia')"
                  color="primary"
                  density="compact"
                  hide-details
                  inset
                  :mobile-layout="false"
                />
              </div>
            </VCol>
            <VCol cols="6">
              <div class="mp-switch-card workflow-node-switch">
                <VSwitch
                  v-model="nodeData.proxy"
                  :label="t('workflow.fetchRss.useProxy')"
                  color="primary"
                  density="compact"
                  hide-details
                  inset
                  :mobile-layout="false"
                />
              </div>
            </VCol>
            <VCol cols="12">
              <div class="mp-switch-card workflow-node-switch">
                <VSwitch
                  v-model="nodeData.only_new"
                  :label="t('workflow.fetchRss.onlyNew')"
                  color="primary"
                  density="compact"
                  hide-details
                  inset
                  :mobile-layout="false"
                />
                <VTooltip location="top" max-width="260">
                  <template #activator="{ props: tipProps }">
                    <VIcon
                      v-bind="tipProps"
                      icon="mdi-help-circle-outline"
                      size="15"
                      class="flex-shrink-0 text-medium-emphasis"
                    />
                  </template>
                  <span>{{ t('workflow.fetchRss.onlyNewHint') }}</span>
                </VTooltip>
              </div>
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
      <Handle id="edge_out" type="source" :position="Position.Right" />
    </VCard>
  </div>
</template>

<style lang="scss" scoped>
.workflow-node-header {
  padding: 10px 14px;
}

.workflow-node-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
}

.workflow-node-subtitle {
  font-size: 12px;
  line-height: 1.35;
  margin-block-start: 1px;
}

.workflow-node-body {
  padding: 12px 14px !important;
}

.workflow-node-switch {
  justify-content: space-between;
  gap: 6px;
  min-block-size: 32px;
  padding: 3px 10px;
}
</style>
