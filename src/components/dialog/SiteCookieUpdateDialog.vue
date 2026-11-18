<script setup lang="ts">
import api from '@/api'
import { Site } from '@/api/types'
import { requiredValidator } from '@/@validators'
import { useToast } from 'vue-toastification'
import ProgressDialog from '../dialog/ProgressDialog.vue'
import { useI18n } from '@/composables/useChineseText'

// 国际化
const { t } = useI18n()

// 输入参数
const cardProps = defineProps({
  site: Object as PropType<Site>,
})

// 定义触发的自定义事件
const emit = defineEmits(['close', 'done'])

// 提示框
const $toast = useToast()

// 用户名密码表单
const userPwForm = ref({
  username: '',
  password: '',
  code: '',
})

// 密码输入
const isPasswordVisible = ref(false)

// 更新按钮可用性
const updateButtonDisable = ref(false)

// 进度条
const progressDialog = ref(false)

// 表单引用
const cookieFormRef = ref()

// 进度文本
const progressText = ref(t('dialog.siteCookieUpdate.processing'))

// 调用API，更新站点Cookie UA
async function updateSiteCookie() {
  if (updateButtonDisable.value) return
  const { valid } = (await cookieFormRef.value?.validate()) || { valid: true }
  if (!valid || !userPwForm.value.username || !userPwForm.value.password) return

  try {
    // 更新按钮状态
    updateButtonDisable.value = true

    progressDialog.value = true
    progressText.value = t('dialog.siteCookieUpdate.updating', { site: cardProps.site?.name })

    const result: { [key: string]: any } = await api.post(`site/cookie/${cardProps.site?.id}`, {
      username: userPwForm.value.username,
      password: userPwForm.value.password,
      code: userPwForm.value.code,
    })

    if (result.success) {
      $toast.success(t('dialog.siteCookieUpdate.success', { site: cardProps.site?.name }))
      emit('done')
    } else {
      $toast.error(
        t('dialog.siteCookieUpdate.failed', {
          site: cardProps.site?.name,
          message: result.message || t('dialog.siteCookieUpdate.requestFailed'),
        }),
      )
    }
  } catch (error: any) {
    console.error(error)
    const message =
      error?.response?.data?.message ||
      (typeof error?.response?.data?.detail === 'string' ? error.response.data.detail : error?.message) ||
      t('dialog.siteCookieUpdate.requestFailed')
    $toast.error(t('dialog.siteCookieUpdate.failed', { site: cardProps.site?.name, message }))
  } finally {
    progressDialog.value = false
    updateButtonDisable.value = false
  }
}
</script>
<template>
  <VDialog max-width="32rem" scrollable>
    <!-- Dialog Content -->
    <VCard class="mp-dialog-card">
      <VCardItem class="mp-dialog-header">
        <template #prepend>
          <VIcon icon="mdi-cookie-refresh-outline" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>{{ t('dialog.siteCookieUpdate.title') }}</VCardTitle>
        <VCardSubtitle v-if="cardProps.site?.name">{{ cardProps.site.name }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn @click="emit('close')" />
      <VDivider />
      <VCardText class="mp-dialog-body">
        <VForm ref="cookieFormRef" @submit.prevent="() => {}">
          <VRow class="mp-form-grid">
            <VCol cols="12">
              <VTextField
                v-model="userPwForm.username"
                :label="t('login.username')"
                :rules="[requiredValidator]"
                prepend-inner-icon="mdi-account-outline"
              />
            </VCol>
            <VCol cols="12">
              <VTextField
                v-model="userPwForm.password"
                :label="t('login.password')"
                :type="isPasswordVisible ? 'text' : 'password'"
                :append-inner-icon="isPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                :rules="[requiredValidator]"
                prepend-inner-icon="mdi-lock-outline"
                @click:append-inner="isPasswordVisible = !isPasswordVisible"
                @keydown.enter="updateSiteCookie"
              />
            </VCol>
            <VCol cols="12">
              <VTextField
                v-model="userPwForm.code"
                :label="t('login.otpCode')"
                hide-details="auto"
                prepend-inner-icon="mdi-shield-key-outline"
              />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
      <VDivider />
      <VCardActions class="app-dialog-actions mp-dialog-footer">
        <VSpacer />
        <VBtn color="default" variant="text" size="small" @click="emit('close')">
          {{ t('common.cancel') }}
        </VBtn>
        <VBtn
          color="primary"
          variant="flat"
          size="small"
          :disabled="updateButtonDisable"
          :loading="updateButtonDisable"
          class="px-4"
          @click="updateSiteCookie"
        >
          {{ t('dialog.siteCookieUpdate.updateButton') }}
        </VBtn>
      </VCardActions>
    </VCard>
    <!-- 进度框 -->
    <ProgressDialog v-if="progressDialog" v-model="progressDialog" :text="progressText" />
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
