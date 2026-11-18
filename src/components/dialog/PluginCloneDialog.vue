<script setup lang="ts">
import type { Plugin } from '@/api/types'
import { useI18n } from '@/composables/useChineseText'
import { useDisplay } from 'vuetify'

// 多语言
const { t } = useI18n()

// 显示器宽度
const display = useDisplay()

// 输入参数
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: true,
  },
  plugin: {
    type: Object as PropType<Plugin>,
    required: true,
  },
  loading: {
    type: Boolean,
    default: false,
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['update:modelValue', 'close', 'clone'])

// 弹窗显示状态
const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

// 插件分身表单引用与数据
const cloneFormRef = ref()
const cloneForm = ref({
  suffix: '',
  name: '',
  description: '',
  version: '',
  icon: '',
})

/** 初始化插件分身表单。 */
function initializeCloneForm() {
  cloneForm.value = {
    suffix: '',
    name: t('plugin.cloneDefaultName', { name: props.plugin?.plugin_name }),
    description: t('plugin.cloneDefaultDescription', { description: props.plugin?.plugin_desc }),
    version: props.plugin?.plugin_version || '1.0',
    icon: props.plugin?.plugin_icon || '',
  }
}

/** 提交插件分身表单。 */
async function submitClone() {
  if (props.loading) return
  const { valid } = (await cloneFormRef.value?.validate()) || { valid: true }
  if (!valid || !cloneForm.value.suffix.trim()) return
  emit('clone', { ...cloneForm.value })
}

onMounted(() => {
  initializeCloneForm()
})
</script>

<template>
  <VDialog v-if="visible" v-model="visible" max-width="40rem" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard class="mp-dialog-card">
      <VCardItem class="mp-dialog-header">
        <template #prepend>
          <VIcon icon="mdi-content-copy" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>{{ t('plugin.cloneTitle') }}</VCardTitle>
        <VCardSubtitle>{{ t('plugin.cloneSubtitle', { name: props.plugin?.plugin_name }) }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn v-model="visible" />
      <VDivider />
      <VCardText class="mp-dialog-body">
        <VForm ref="cloneFormRef" @submit.prevent="submitClone">
          <VRow class="mp-form-grid">
            <VCol cols="12" sm="6">
              <VTextField
                v-model="cloneForm.suffix"
                :label="t('plugin.suffix') + ' *'"
                :placeholder="t('plugin.suffixPlaceholder')"
                :hint="t('plugin.suffixHint')"
                persistent-hint
                :rules="[
                  v => !!v || t('plugin.suffixRequired'),
                  v => /^[a-zA-Z0-9]+$/.test(v) || t('plugin.suffixFormatError'),
                  v => v.length <= 20 || t('plugin.suffixLengthError'),
                ]"
                required
                prepend-inner-icon="mdi-tag"
              />
            </VCol>

            <VCol cols="12" sm="6">
              <VTextField
                v-model="cloneForm.name"
                :label="t('plugin.cloneName')"
                :placeholder="t('plugin.cloneNamePlaceholder')"
                :hint="t('plugin.cloneNameHint')"
                persistent-hint
                prepend-inner-icon="mdi-rename-box"
              />
            </VCol>

            <VCol cols="12">
              <VTextField
                v-model="cloneForm.description"
                :label="t('plugin.cloneDescriptionLabel')"
                :placeholder="t('plugin.cloneDescriptionPlaceholder')"
                :hint="t('plugin.cloneDescriptionHint')"
                persistent-hint
                prepend-inner-icon="mdi-text"
              />
            </VCol>

            <VCol cols="12" sm="6">
              <VTextField
                v-model="cloneForm.version"
                :label="t('plugin.cloneVersion')"
                :placeholder="t('plugin.cloneVersionPlaceholder')"
                :hint="t('plugin.cloneVersionHint')"
                persistent-hint
                prepend-inner-icon="mdi-numeric"
              />
            </VCol>

            <VCol cols="12" sm="6">
              <VTextField
                v-model="cloneForm.icon"
                :label="t('plugin.cloneIcon')"
                :placeholder="t('plugin.cloneIconPlaceholder')"
                :hint="t('plugin.cloneIconHint')"
                persistent-hint
                prepend-inner-icon="mdi-image"
              />
            </VCol>

            <VCol cols="12">
              <VAlert type="warning" variant="tonal" density="compact" icon="mdi-alert-circle-outline">
                <div class="text-body-2">
                  <strong>{{ t('common.notice') }}</strong
                  >：{{ t('plugin.cloneNotice') }}
                </div>
              </VAlert>
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
      <VDivider />
      <VCardActions class="app-dialog-actions mp-dialog-footer">
        <VSpacer />
        <VBtn color="default" variant="text" size="small" :disabled="props.loading" @click="visible = false">
          {{ t('common.cancel') }}
        </VBtn>
        <VBtn
          color="primary"
          variant="flat"
          size="small"
          class="px-4"
          :disabled="props.loading"
          :loading="props.loading"
          @click="submitClone"
        >
          {{ t('plugin.createClone') }}
        </VBtn>
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

.mp-form-grid {
  row-gap: 6px;
}

@media (max-width: 599.98px) {
  .mp-dialog-body {
    padding: 16px !important;
  }
}
</style>
