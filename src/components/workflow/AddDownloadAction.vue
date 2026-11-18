<script setup lang="ts">
import api from '@/api'
import { DownloaderConf } from '@/api/types'
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

// 下载器选项
const downloaderOptions = ref<{ title: string; value: string }[]>([])

// 加载所有下载器
async function loadDownloaderSetting() {
  try {
    const downloaders: DownloaderConf[] = await api.get('download/clients')
    downloaderOptions.value = [
      { title: t('common.default'), value: '' },
      ...downloaders.map((item: DownloaderConf) => ({
        title: item.name,
        value: item.name,
      })),
    ]
  } catch (error) {
    console.error(error)
  }
}

onMounted(() => {
  loadDownloaderSetting()
})
</script>
<template>
  <div>
    <VCard max-width="20rem" class="workflow-node-card">
      <Handle id="edge_in" type="target" :position="Position.Left" />
      <VCardItem class="workflow-node-header">
        <template #prepend>
          <VAvatar size="34" rounded="lg" variant="tonal" color="primary" class="workflow-node-avatar">
            <VIcon icon="mdi-download" size="18" />
          </VAvatar>
        </template>
        <VCardTitle class="workflow-node-title">{{ t('workflow.addDownload.title') }}</VCardTitle>
        <VCardSubtitle class="workflow-node-subtitle">{{ t('workflow.addDownload.subtitle') }}</VCardSubtitle>
      </VCardItem>
      <VDivider />
      <VCardText class="workflow-node-body">
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol cols="12">
              <VSelect
                v-model="nodeData.downloader"
                :items="downloaderOptions"
                :label="t('workflow.addDownload.downloader')"
                variant="outlined"
                density="compact"
                hide-details="auto"
              />
            </VCol>
            <VCol cols="12">
              <VTextField
                v-model="nodeData.labels"
                :label="t('workflow.addDownload.category')"
                :placeholder="t('workflow.addDownload.categoryPlaceholder')"
                variant="outlined"
                density="compact"
                hide-details="auto"
              />
            </VCol>
            <VCol cols="12">
              <VPathField
                v-model="nodeData.save_path"
                storage="local"
                :label="t('workflow.addDownload.savePath')"
                clearable
                :placeholder="t('workflow.addDownload.savePathPlaceholder')"
                variant="outlined"
                density="compact"
                hide-details="auto"
              />
            </VCol>
            <VCol cols="12">
              <VTextField
                v-model="nodeData.max_downloads"
                type="number"
                min="1"
                clearable
                :label="t('workflow.addDownload.maxDownloads')"
                :placeholder="t('workflow.addDownload.maxDownloadsPlaceholder')"
                variant="outlined"
                density="compact"
                hide-details="auto"
              />
            </VCol>
            <VCol cols="12">
              <div class="mp-switch-card workflow-node-switch">
                <VSwitch
                  v-model="nodeData.only_lack"
                  :label="t('workflow.addDownload.onlyLack')"
                  color="primary"
                  density="compact"
                  hide-details
                  inset
                  :mobile-layout="false"
                />
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
