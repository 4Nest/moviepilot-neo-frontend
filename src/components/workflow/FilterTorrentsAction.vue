<script setup lang="ts">
import api from '@/api'
import { FilterRuleGroup } from '@/api/types'
import { Handle, Position } from '@vue-flow/core'
import { useI18n } from '@/composables/useChineseText'
import { qualityOptions, resolutionOptions, effectOptions } from '@/api/constants'
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

// 所有规则组列表
const filterRuleGroups = ref<FilterRuleGroup[]>([])

// 加载规则组
async function queryFilterRuleGroups() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/UserFilterRuleGroups')
    filterRuleGroups.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 计算过滤规则组选择框数据
const ruleGroupsOptions = computed(() => {
  return filterRuleGroups.value.map(group => ({
    title: group.name,
    value: group.name,
  }))
})

onMounted(() => {
  queryFilterRuleGroups()
})
</script>
<template>
  <div>
    <VCard max-width="20rem">
      <Handle id="edge_in" type="target" :position="Position.Left" />
      <VCardItem>
        <template v-slot:prepend>
          <VAvatar>
            <VIcon icon="mdi-filter-multiple" size="x-large"></VIcon>
          </VAvatar>
        </template>
        <VCardTitle>{{ t('workflow.filterTorrents.title') }}</VCardTitle>
        <VCardSubtitle>{{ t('workflow.filterTorrents.subtitle') }}</VCardSubtitle>
      </VCardItem>
      <VDivider />
      <VCardText>
        <VRow>
          <VCol cols="6">
            <VSelect
              v-model="nodeData.quality"
              :label="t('workflow.filterTorrents.quality')"
              :items="qualityOptions"
              outlined
              dense
            />
          </VCol>
          <VCol cols="6">
            <VSelect
              v-model="nodeData.resolution"
              :label="t('workflow.filterTorrents.resolution')"
              :items="resolutionOptions"
              outlined
              dense
            />
          </VCol>
          <VCol cols="6">
            <VSelect
              v-model="nodeData.effect"
              :label="t('workflow.filterTorrents.effect')"
              :items="effectOptions"
              outlined
              dense
            />
          </VCol>
          <VCol cols="6">
            <VTextField
              v-model="nodeData.size"
              :label="t('workflow.filterTorrents.size')"
              placeholder="MB"
              outlined
              dense
            />
          </VCol>
          <VCol cols="12">
            <VTextField
              v-model="nodeData.max_age_hours"
              type="number"
              min="1"
              clearable
              :label="t('workflow.filterTorrents.maxAgeHours')"
              :placeholder="t('workflow.filterTorrents.maxAgeHoursPlaceholder')"
              outlined
              dense
            />
          </VCol>
          <VCol cols="12">
            <VTextField v-model="nodeData.include" :label="t('workflow.filterTorrents.include')" outlined dense />
          </VCol>
          <VCol cols="12">
            <VTextField v-model="nodeData.exclude" :label="t('workflow.filterTorrents.exclude')" outlined dense />
          </VCol>
          <VCol cols="12">
            <VSelect
              v-model="nodeData.rule_groups"
              chips
              multiple
              :label="t('workflow.filterTorrents.ruleGroups')"
              :items="ruleGroupsOptions"
              outlined
              dense
            />
          </VCol>
        </VRow>
      </VCardText>
      <Handle id="edge_out" type="source" :position="Position.Right" />
    </VCard>
  </div>
</template>
