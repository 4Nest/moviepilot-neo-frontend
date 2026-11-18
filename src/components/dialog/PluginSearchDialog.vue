<script lang="ts" setup>
import { getLogoUrl } from '@/utils/imageUtils'
import type { Plugin } from '@/api/types'
import { useDisplay } from 'vuetify'
import { useI18n } from '@/composables/useChineseText'

const props = defineProps({
  keyword: {
    type: String,
    default: '',
  },
  modelValue: {
    type: Boolean,
    default: true,
  },
  plugins: {
    type: Array as PropType<Plugin[]>,
    default: () => [],
  },
})

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'open-plugin', plugin: Plugin): void
  (event: 'update:keyword', value: string): void
  (event: 'update:modelValue', value: boolean): void
}>()

const { t } = useI18n()
const display = useDisplay()
const pluginIconLoaded = ref<Record<string, boolean>>({})

const dialogVisible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const searchKeyword = computed({
  get: () => props.keyword,
  set: value => emit('update:keyword', value),
})

// 返回插件图标地址，并在远程图标失败后回退到默认图标。
function pluginIcon(item: Plugin) {
  if (pluginIconLoaded.value[item.id || '0'] === false) return getLogoUrl('plugin')
  if (item?.plugin_icon?.startsWith('http')) {
    return `${import.meta.env.VITE_API_BASE_URL}system/img/1?imgurl=${encodeURIComponent(item?.plugin_icon)}&cache=true`
  }

  return `./plugin_icon/${item?.plugin_icon}`
}

// 标记指定插件图标加载失败。
function pluginIconError(item: Plugin) {
  pluginIconLoaded.value[item.id || '0'] = false
}

// 获取插件标签列表。
function pluginLabels(label: string | undefined) {
  if (!label) return []
  return label.split(',')
}

// 关闭搜索弹窗并通知共享弹窗 Host 回收实例。
function closeDialog() {
  emit('close')
  emit('update:modelValue', false)
}
</script>

<template>
  <VDialog
    v-model="dialogVisible"
    scrollable
    max-width="40rem"
    :max-height="!display.mdAndUp.value ? '' : '85vh'"
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard class="mx-auto mp-dialog-card" width="100%">
      <div class="plugin-search-header">
        <VTextField
          v-model="searchKeyword"
          :aria-label="t('plugin.searchPlugins')"
          :mobile-layout="false"
          single-line
          :placeholder="t('plugin.searchPlaceholder')"
          variant="solo-filled"
          density="compact"
          prepend-inner-icon="mdi-magnify"
          flat
          autofocus
          clearable
          hide-details
          class="plugin-search-input"
        />
      </div>
      <VDialogCloseBtn @click="closeDialog" />
      <VDivider />
      <VList v-if="plugins.length > 0" class="plugin-search-list py-1" lines="two" density="compact">
        <VVirtualScroll :items="plugins">
          <template #default="{ item }">
            <VListItem class="plugin-search-item" @click="emit('open-plugin', item)">
              <template #prepend>
                <VAvatar size="36" rounded="lg" class="me-3 plugin-search-avatar">
                  <VImg :src="pluginIcon(item)" @error="pluginIconError(item)">
                    <template #placeholder>
                      <div class="w-full h-full">
                        <VSkeletonLoader class="object-cover aspect-w-1 aspect-h-1" />
                      </div>
                    </template>
                  </VImg>
                </VAvatar>
              </template>
              <VListItemTitle class="font-weight-medium">
                {{ item.plugin_name
                }}<span class="text-caption ms-2 text-medium-emphasis">v{{ item?.plugin_version }}</span>
                <VIcon v-if="item.installed" color="success" icon="mdi-check-circle" class="ms-1.5" size="15" />
              </VListItemTitle>
              <VListItemSubtitle class="mt-0.5">
                <VChip
                  v-for="label in pluginLabels(item.plugin_label)"
                  :key="label"
                  variant="tonal"
                  size="x-small"
                  class="me-1 my-0.5"
                  color="info"
                  label
                >
                  {{ label }}
                </VChip>
                {{ item.plugin_desc }}
              </VListItemSubtitle>
            </VListItem>
          </template>
        </VVirtualScroll>
      </VList>
      <VCardText v-else class="text-center text-medium-emphasis py-8">
        {{ t('common.noMatchingData') }}
      </VCardText>
    </VCard>
  </VDialog>
</template>
<style lang="scss" scoped>
.plugin-search-header {
  padding-block: 10px;
  padding-inline: 14px 50px;
}

.plugin-search-input :deep(.v-field) {
  border: 1px solid var(--mp-border-subtle);
  border-radius: 8px;
  background: var(--mp-field-bg);
  box-shadow: none;
  min-block-size: 36px;
}

.plugin-search-list {
  border-radius: 0 !important;
}

.plugin-search-avatar {
  border: 1px solid var(--mp-border-subtle);
}
</style>
