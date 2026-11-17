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
    <VCard max-width="20rem">
      <Handle id="edge_in" type="target" :position="Position.Left" />
      <VCardItem>
        <template v-slot:prepend>
          <VAvatar>
            <VIcon icon="mdi-download" size="x-large"></VIcon>
          </VAvatar>
        </template>
        <VCardTitle>{{ t('workflow.addDownload.title') }}</VCardTitle>
        <VCardSubtitle>{{ t('workflow.addDownload.subtitle') }}</VCardSubtitle>
      </VCardItem>
      <VDivider />
      <VCardText>
        <VRow>
          <VCol cols="12">
            <VSelect
              v-model="nodeData.downloader"
              :items="downloaderOptions"
              :label="t('workflow.addDownload.downloader')"
              outlined
              dense
            />
          </VCol>
          <VCol cols="12">
            <VTextField
              v-model="nodeData.labels"
              :label="t('workflow.addDownload.category')"
              :placeholder="t('workflow.addDownload.categoryPlaceholder')"
              outlined
              dense
            />
          </VCol>
          <VCol cols="12">
            <VPathField
              v-model="nodeData.save_path"
              storage="local"
              :label="t('workflow.addDownload.savePath')"
              clearable
              :placeholder="t('workflow.addDownload.savePathPlaceholder')"
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
              outlined
              dense
            />
          </VCol>
          <VCol cols="12" class="py-1">
            <VSwitch
              v-model="nodeData.only_lack"
              :label="t('workflow.addDownload.onlyLack')"
              hide-details
              density="compact"
            />
          </VCol>
        </VRow>
      </VCardText>
      <Handle id="edge_out" type="source" :position="Position.Right" />
    </VCard>
  </div>
</template>
