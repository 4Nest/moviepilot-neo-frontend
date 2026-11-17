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
    <VCard max-width="20rem">
      <Handle id="edge_in" type="target" :position="Position.Left" />
      <VCardItem>
        <template v-slot:prepend>
          <VAvatar>
            <VIcon icon="mdi-rss" size="x-large"></VIcon>
          </VAvatar>
        </template>
        <VCardTitle>{{ t('workflow.fetchRss.title') }}</VCardTitle>
        <VCardSubtitle>{{ t('workflow.fetchRss.subtitle') }}</VCardSubtitle>
      </VCardItem>
      <VDivider />
      <VCardText>
        <VRow>
          <VCol cols="12">
            <VTextField v-model="nodeData.url" :label="t('workflow.fetchRss.url')" outlined dense clearable />
          </VCol>
          <VCol cols="12">
            <VTextField v-model="nodeData.ua" :label="t('workflow.fetchRss.userAgent')" outlined dense clearable />
          </VCol>
          <VCol cols="12">
            <VTextField
              v-model="nodeData.timeout"
              type="number"
              :label="t('workflow.fetchRss.timeout')"
              outlined
              dense
              clearable
            />
          </VCol>
          <VCol cols="6" class="py-1">
            <VSwitch
              v-model="nodeData.match_media"
              :label="t('workflow.fetchRss.matchMedia')"
              hide-details
              density="compact"
            />
          </VCol>
          <VCol cols="6" class="py-1">
            <VSwitch v-model="nodeData.proxy" :label="t('workflow.fetchRss.useProxy')" hide-details density="compact" />
          </VCol>
          <VCol cols="12" class="py-1">
            <div class="d-flex align-center">
              <VSwitch
                v-model="nodeData.only_new"
                :label="t('workflow.fetchRss.onlyNew')"
                hide-details
                density="compact"
              />
              <VTooltip location="top" max-width="260">
                <template #activator="{ props: tipProps }">
                  <VIcon v-bind="tipProps" icon="mdi-help-circle-outline" size="16" class="ms-1 text-medium-emphasis" />
                </template>
                <span>{{ t('workflow.fetchRss.onlyNewHint') }}</span>
              </VTooltip>
            </div>
          </VCol>
        </VRow>
      </VCardText>
      <Handle id="edge_out" type="source" :position="Position.Right" />
    </VCard>
  </div>
</template>
