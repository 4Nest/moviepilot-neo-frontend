<script setup lang="ts">
import { useI18n } from '@/composables/useChineseText'
import { useDisplay } from 'vuetify'

interface FolderConfig {
  plugins?: string[]
  order?: number
  background?: string
  icon?: string
  color?: string
  gradient?: string
  showIcon?: boolean
}

// 多语言
const { t } = useI18n()

// 响应式显示
const display = useDisplay()

// 默认颜色
const defaultColor = '#2196F3'
// 默认图标
const defaultIcon = 'mdi-folder'

// 预设图标选项
const iconOptions = [
  'mdi-folder',
  'mdi-folder-star',
  'mdi-folder-heart',
  'mdi-folder-cog',
  'mdi-folder-music',
  'mdi-folder-image',
  'mdi-folder-video',
  'mdi-folder-download',
  'mdi-folder-network',
  'mdi-folder-special',
]

// 预设颜色选项
const colorOptions = ['#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#F44336', '#607D8B', '#795548', '#E91E63']

// 预设渐变选项
const gradientOptions = [
  'linear-gradient(rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.4) 100%), linear-gradient(135deg, rgba(33, 150, 243, 0.7) 0%, rgba(33, 150, 243, 0.8) 100%)',
  'linear-gradient(rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.4) 100%), linear-gradient(135deg, rgba(76, 175, 80, 0.7) 0%, rgba(76, 175, 80, 0.8) 100%)',
  'linear-gradient(rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.4) 100%), linear-gradient(135deg, rgba(255, 152, 0, 0.7) 0%, rgba(255, 152, 0, 0.8) 100%)',
  'linear-gradient(rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.4) 100%), linear-gradient(135deg, rgba(156, 39, 176, 0.7) 0%, rgba(156, 39, 176, 0.8) 100%)',
  'linear-gradient(rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.4) 100%), linear-gradient(135deg, rgba(244, 67, 54, 0.7) 0%, rgba(244, 67, 54, 0.8) 100%)',
  'linear-gradient(rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.4) 100%), linear-gradient(135deg, rgba(96, 125, 139, 0.7) 0%, rgba(96, 125, 139, 0.8) 100%)',
  'linear-gradient(rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.4) 100%), linear-gradient(135deg, rgba(233, 30, 99, 0.7) 0%, rgba(233, 30, 99, 0.8) 100%)',
  'linear-gradient(rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.4) 100%), linear-gradient(135deg, rgba(63, 81, 181, 0.7) 0%, rgba(156, 39, 176, 0.8) 100%)',
]

// 输入参数
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: true,
  },
  folderConfig: {
    type: Object as PropType<FolderConfig>,
    default: () => ({}),
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['update:modelValue', 'close', 'save'])

// 文件夹设置
const folderSettings = ref<FolderConfig>({
  background: '',
  icon: defaultIcon,
  color: defaultColor,
  gradient: gradientOptions[0],
  showIcon: true,
})

// 设置对话框
const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

/** 初始化文件夹外观设置。 */
function initializeSettings() {
  folderSettings.value = {
    background: props.folderConfig?.background || '',
    icon: props.folderConfig?.icon || defaultIcon,
    color: props.folderConfig?.color || defaultColor,
    gradient: props.folderConfig?.gradient || gradientOptions[0],
    showIcon: props.folderConfig?.showIcon !== undefined ? props.folderConfig.showIcon : true,
  }
}

/** 保存文件夹外观设置。 */
function saveSettings() {
  emit('save', {
    ...props.folderConfig,
    ...folderSettings.value,
  })
}

onMounted(() => {
  initializeSettings()
})
</script>

<template>
  <VDialog v-if="visible" v-model="visible" max-width="38rem" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard class="mp-dialog-card">
      <VDialogCloseBtn v-model="visible" />
      <VCardItem class="mp-dialog-header">
        <template #prepend>
          <VIcon icon="mdi-palette-outline" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>
          {{ t('folder.folderAppearanceSettings') }}
        </VCardTitle>
      </VCardItem>
      <VDivider />
      <VCardText class="mp-dialog-body">
        <div class="mp-form-sections">
          <div class="mp-settings-card">
            <div class="mp-setting-row">
              <VSwitch
                v-model="folderSettings.showIcon"
                :label="t('folder.showFolderIcon')"
                color="primary"
                inset
                density="compact"
                hide-details
              />
            </div>
          </div>

          <VRow v-if="folderSettings.showIcon" class="mp-form-grid">
            <VCol cols="12" sm="6">
              <div class="mp-picker-panel">
                <div class="mp-picker-label">{{ t('folder.icon') }}</div>
                <div class="icon-grid">
                  <VBtn
                    v-for="icon in iconOptions"
                    icon
                    :key="icon"
                    :variant="folderSettings.icon === icon ? 'tonal' : 'text'"
                    :color="folderSettings.icon === icon ? 'primary' : 'default'"
                    size="small"
                    class="ma-1"
                    @click="folderSettings.icon = icon"
                  >
                    <VIcon :icon="icon" size="20" />
                  </VBtn>
                </div>
              </div>
            </VCol>

            <VCol cols="12" sm="6">
              <div class="mp-picker-panel">
                <div class="mp-picker-label">{{ t('folder.iconColor') }}</div>
                <div class="color-grid">
                  <VBtn
                    v-for="color in colorOptions"
                    :key="color"
                    :variant="folderSettings.color === color ? 'tonal' : 'text'"
                    :color="color"
                    size="small"
                    icon
                    class="ma-1 color-btn"
                    :style="{ backgroundColor: color }"
                    @click="folderSettings.color = color"
                  >
                    <VIcon v-if="folderSettings.color === color" icon="mdi-check" size="18" color="white" />
                  </VBtn>
                </div>
              </div>
            </VCol>
          </VRow>

          <div class="mp-picker-panel">
            <div class="mp-picker-label">{{ t('folder.backgroundGradient') }}</div>
            <div class="gradient-grid">
              <VBtn
                v-for="(gradient, index) in gradientOptions"
                :key="index"
                :variant="folderSettings.gradient === gradient ? 'tonal' : 'text'"
                class="ma-1 gradient-btn"
                :style="{ background: gradient }"
                size="small"
                icon
                @click="folderSettings.gradient = gradient"
              >
                <VIcon v-if="folderSettings.gradient === gradient" icon="mdi-check" size="18" color="white" />
              </VBtn>
            </div>
          </div>

          <VTextField
            v-model="folderSettings.background"
            :label="t('folder.customBackgroundImageURL')"
            placeholder="https://example.com/image.jpg"
            variant="outlined"
            :hint="t('folder.customBackgroundImageHint')"
            prepend-inner-icon="mdi-image"
          />
        </div>
      </VCardText>
      <VDivider />
      <VCardActions class="app-dialog-actions mp-dialog-footer">
        <VSpacer />
        <VBtn color="default" variant="text" size="small" @click="visible = false">
          {{ t('common.cancel') }}
        </VBtn>
        <VBtn color="primary" variant="flat" size="small" class="px-4" @click="saveSettings"> 保存 </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped>
.mp-dialog-header {
  padding-block: 14px;
  padding-inline: 22px 48px;
}

.mp-dialog-body {
  padding: 18px 22px !important;
}

.mp-dialog-footer {
  gap: 8px;
  padding: 10px 20px !important;
}

.mp-form-sections {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mp-form-grid {
  row-gap: 6px;
}

.mp-picker-panel {
  overflow: hidden;
  border: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.1));
  border-radius: 10px;
  background: var(--mp-item-bg, rgba(var(--v-theme-on-surface), 0.025));
  padding: 12px 14px;
}

.mp-picker-label {
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 0.8125rem;
  font-weight: 600;
  margin-block-end: 8px;
}

@media (max-width: 599.98px) {
  .mp-dialog-body {
    padding: 16px !important;
  }
}
</style>
