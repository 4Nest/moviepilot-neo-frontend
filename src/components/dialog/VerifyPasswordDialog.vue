<script setup lang="ts">
import { useI18n } from '@/composables/useChineseText'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    text?: string
    title?: string
  }>(),
  {
    modelValue: true,
    text: '',
    title: '',
  },
)

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'confirm', password: string): void
  (event: 'update:modelValue', value: boolean): void
}>()

const password = ref('')
const passwordVisible = ref(false)

const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

// 提交当前输入的密码给调用方继续业务验证。
function submitPassword() {
  if (!password.value.trim()) return
  emit('confirm', password.value)
}
</script>

<template>
  <VDialog v-if="visible" v-model="visible" max-width="28rem">
    <VCard class="mp-dialog-card">
      <VCardItem class="mp-dialog-header">
        <template #prepend>
          <VIcon icon="mdi-lock-check-outline" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>{{ props.title }}</VCardTitle>
      </VCardItem>
      <VDialogCloseBtn v-model="visible" />
      <VDivider />
      <VCardText class="mp-dialog-body">
        <p v-if="props.text" class="verify-password-text">{{ props.text }}</p>
        <VForm @submit.prevent="submitPassword">
          <VTextField
            v-model="password"
            :type="passwordVisible ? 'text' : 'password'"
            :label="t('user.password')"
            :append-inner-icon="passwordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
            variant="outlined"
            density="compact"
            hide-details
            prepend-inner-icon="mdi-lock"
            autocomplete="current-password"
            @click:append-inner="passwordVisible = !passwordVisible"
          />
        </VForm>
      </VCardText>
      <VDivider />
      <VCardActions class="app-dialog-actions mp-dialog-footer">
        <VSpacer />
        <VBtn color="default" variant="text" size="small" @click="visible = false">
          {{ t('common.cancel') }}
        </VBtn>
        <VBtn
          color="primary"
          variant="flat"
          size="small"
          class="px-4"
          :disabled="!password.trim()"
          @click="submitPassword"
        >
          {{ t('common.confirm') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
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

.verify-password-text {
  margin: 0 0 12px;
  color: rgba(var(--v-theme-on-surface), 0.75);
  font-size: 0.84rem;
  line-height: 1.5;
}
</style>
