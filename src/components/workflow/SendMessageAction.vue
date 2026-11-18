<script setup lang="ts">
import api from '@/api'
import { NotificationConf } from '@/api/types'
import { Handle, Position } from '@vue-flow/core'
import { useI18n } from '@/composables/useChineseText'
const { t } = useI18n()

defineProps({
  id: {
    type: String,
    required: true,
  },
  data: {
    type: Object,
    required: true,
  },
})

// 所有消息渠道
const notifications = ref<NotificationConf[]>([])

// 调用API查询通知渠道设置
async function loadNotificationSetting() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/Notifications')
    notifications.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 计算消息渠道选项
const sourceOptions = computed(() => {
  return notifications.value.map(item => {
    return {
      title: item.name,
      value: item.name,
    }
  })
})

onMounted(() => {
  loadNotificationSetting()
})
</script>
<template>
  <div>
    <VCard max-width="20rem" class="workflow-node-card">
      <Handle id="edge_in" type="target" :position="Position.Left" />
      <VCardItem class="workflow-node-header">
        <template #prepend>
          <VAvatar size="34" rounded="lg" variant="tonal" color="primary" class="workflow-node-avatar">
            <VIcon icon="mdi-message-arrow-right" size="18" />
          </VAvatar>
        </template>
        <VCardTitle class="workflow-node-title">{{ t('workflow.sendMessage.title') }}</VCardTitle>
        <VCardSubtitle class="workflow-node-subtitle">{{ t('workflow.sendMessage.subtitle') }}</VCardSubtitle>
      </VCardItem>
      <VDivider />
      <VCardText class="workflow-node-body">
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol cols="12">
              <VSelect
                v-model="data.client"
                :items="sourceOptions"
                :label="t('workflow.sendMessage.channel')"
                chips
                multiple
                variant="outlined"
                density="compact"
                hide-details="auto"
                clearable
              />
            </VCol>
            <VCol cols="12">
              <VTextField
                v-model="data.userid"
                :label="t('workflow.sendMessage.userId')"
                variant="outlined"
                density="compact"
                hide-details="auto"
                clearable
              />
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
</style>
