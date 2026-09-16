<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import { VForm } from 'vuetify/lib/components/index.mjs'
import api from '@/api'
import type { User, PassKey } from '@/api/types'
import avatar1 from '@images/avatars/avatar-1.png'
import { useDisplay } from 'vuetify'
import { useUserStore } from '@/stores'
import { useI18n } from 'vue-i18n'
import { openSharedDialog } from '@/composables/useSharedDialog'

const OTPAuthDialog = defineAsyncComponent(() => import('@/components/dialog/OTPAuthDialog.vue'))
const PasskeyDialog = defineAsyncComponent(() => import('@/components/dialog/PasskeyDialog.vue'))
const VerifyPasswordDialog = defineAsyncComponent(() => import('@/components/dialog/VerifyPasswordDialog.vue'))

// 国际化
const { t, locale } = useI18n()

// 显示器宽度
const display = useDisplay()

const isNewPasswordVisible = ref(false)
const isConfirmPasswordVisible = ref(false)
const newPassword = ref('')
const confirmPassword = ref('')

// 用户 Store
const userStore = useUserStore()

// 提示框
const $toast = useToast()

const refInputEl = ref<HTMLElement>()

// 正在保存
const isSaving = ref(false)

// 当前头像缓存
const currentAvatar = ref(avatar1)

// 当前用户名
const currentUserName = ref('')

const accountInfo = ref<User>({
  id: 0,
  name: '',
  email: '',
  avatar: '',
  is_otp: false,
  settings: {},
  nickname: '',
})

// PassKey列表
const passkeyList = ref<PassKey[]>([])

// 验证密码
const verifyPassword = ref('')

// 验证后的回调
const verifyCallback = ref<((password: string) => void) | null>(null)

// 验证对话框标题
const verifyTitle = ref('')

// 验证对话框提示
const verifyText = ref('')

let otpDialogController: ReturnType<typeof openSharedDialog> | null = null
let passkeyDialogController: ReturnType<typeof openSharedDialog> | null = null
let verifyPasswordDialogController: ReturnType<typeof openSharedDialog> | null = null

// 打开共享 OTP 管理弹窗，并把状态变更回写到用户资料。
function openOtpDialog() {
  otpDialogController?.close()
  otpDialogController = openSharedDialog(
    OTPAuthDialog,
    {
      isOtp: accountInfo.value.is_otp,
    },
    {
      'update:isOtp': (value: boolean) => {
        accountInfo.value.is_otp = value
      },
      'update:modelValue': (value: boolean) => {
        if (!value) otpDialogController = null
      },
      verifyPassword: onVerifyPassword,
    },
    { closeOn: ['update:modelValue'] },
  )
}

// 打开共享 PassKey 管理弹窗，并同步最新 PassKey 列表。
function openPasskeyDialog() {
  passkeyDialogController?.close()
  passkeyDialogController = openSharedDialog(
    PasskeyDialog,
    {},
    {
      'update:modelValue': (value: boolean) => {
        if (!value) passkeyDialogController = null
      },
      'update:passkeyList': (value: PassKey[]) => {
        passkeyList.value = value
      },
      verifyPassword: onVerifyPassword,
    },
    { closeOn: ['update:modelValue'] },
  )
}

// 打开共享密码验证弹窗。
function openVerifyPasswordDialog() {
  verifyPasswordDialogController?.close()
  verifyPasswordDialogController = openSharedDialog(
    VerifyPasswordDialog,
    {
      text: verifyText.value,
      title: verifyTitle.value,
    },
    {
      close: () => {
        verifyPasswordDialogController = null
      },
      confirm: confirmVerifyPassword,
      'update:modelValue': (value: boolean) => {
        if (!value) verifyPasswordDialogController = null
      },
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

// 关闭共享密码验证弹窗并清理控制器。
function closeVerifyPasswordDialog() {
  verifyPasswordDialogController?.close()
  verifyPasswordDialogController = null
}

// 更新头像
function changeAvatar(file: Event) {
  const fileReader = new FileReader()
  const { files } = file.target as HTMLInputElement
  if (files && files.length > 0) {
    const selectedFile = files[0]
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    const maxSize = 800 * 1024
    // 检查文件是否为图片
    if (!allowedTypes.includes(selectedFile.type)) {
      $toast.error(t('profile.avatarFormatError'))
      return
    }
    // 检查文件大小
    if (selectedFile.size > maxSize) {
      $toast.error(t('profile.avatarSizeError'))
      return
    }
    fileReader.readAsDataURL(selectedFile)
    fileReader.onload = () => {
      if (typeof fileReader.result === 'string') {
        currentAvatar.value = fileReader.result
        $toast.success(t('profile.avatarUploadSuccess'))
      }
    }
  }
}

// 重置默认头像
function resetDefaultAvatar() {
  currentAvatar.value = avatar1
  $toast.success(t('profile.resetAvatarSuccess'))
}

// 还原当前头像
function restoreCurrentAvatar() {
  currentAvatar.value = accountInfo.value.avatar
  $toast.success(t('profile.restoreAvatarSuccess'))
}

// 加载当前用户信息
async function fetchUserInfo() {
  try {
    const result: User = await api.get('user/current')
    if (result) {
      accountInfo.value = result
      accountInfo.value.avatar = accountInfo.value.avatar ? accountInfo.value.avatar : avatar1
      accountInfo.value.nickname = accountInfo.value.settings?.nickname ?? ''
      currentUserName.value = accountInfo.value.name
      currentAvatar.value = accountInfo.value.avatar
      // 同时加载PassKey列表
      await fetchPassKeyList()
    }
  } catch (error) {
    console.log(error)
  }
}

// 保存账户信息
function saveAccountInfo() {
  if (isSaving.value) {
    $toast.error(t('profile.savingInProgress'))
    return
  }
  if (newPassword.value || confirmPassword.value) {
    if (newPassword.value !== confirmPassword.value) {
      $toast.error(t('profile.passwordMismatch'))
      return
    }
  }
  // 修改密码前需要验证当前登录密码
  if (newPassword.value) {
    withPasswordVerification(t('profile.accountSecurity'), t('profile.confirmToChangePassword'), () => {
      doSaveAccountInfo()
    })
    return
  }
  doSaveAccountInfo()
}

// 执行账户信息保存，仅回传允许修改的字段
async function doSaveAccountInfo() {
  const oldAvatar = accountInfo.value.avatar
  accountInfo.value.avatar = currentAvatar.value
  isSaving.value = true
  try {
    // 昵称等扩展信息保存在 settings 中，后端可以直接处理JSON对象
    const payload: { [key: string]: any } = {
      email: accountInfo.value.email,
      avatar: currentAvatar.value,
      settings: { ...accountInfo.value.settings, nickname: accountInfo.value.nickname ?? '' },
    }
    if (newPassword.value) {
      payload.password = newPassword.value
    }

    const result: { [key: string]: any } = await api.put('user/current', payload)

    if (result.success) {
      $toast.success(t('profile.saveSuccess'))
      // 清空密码输入框
      newPassword.value = ''
      confirmPassword.value = ''
      // 更新本地头像显示
      if (oldAvatar !== currentAvatar.value) {
        userStore.setAvatar(currentAvatar.value)
      }
    } else {
      $toast.error(t('profile.saveFailed', { message: result.message }))
      // 失败缓存值还原
      currentAvatar.value = oldAvatar
      accountInfo.value.avatar = oldAvatar
    }
  } catch (error) {
    console.log('保存失败:', error)
  }
  isSaving.value = false
}

// 验证密码载荷接口
interface VerifyPasswordPayload {
  title: string
  text: string
  callback: (password: string) => void
}

// 密码验证并执行回调
function withPasswordVerification(title: string, text: string, callback: (password: string) => void) {
  verifyTitle.value = title
  verifyText.value = text
  verifyCallback.value = callback
  verifyPassword.value = ''
  openVerifyPasswordDialog()
}

// 弹窗请求密码验证
function onVerifyPassword({ title, text, callback }: VerifyPasswordPayload) {
  withPasswordVerification(title, text, callback)
}

// 确认密码验证
async function confirmVerifyPassword(password = verifyPassword.value) {
  verifyPassword.value = password
  if (!verifyPassword.value) {
    $toast.error(t('user.passwordHint'))
    return
  }
  if (verifyCallback.value) {
    verifyCallback.value(verifyPassword.value)
  }
  closeVerifyPasswordDialog()
}

// 获取PassKey列表
async function fetchPassKeyList() {
  try {
    const result: { [key: string]: any } = await api.get('mfa/passkey/list')
    if (result.success) {
      passkeyList.value = result.data || []
    }
  } catch (error) {
    console.log(error)
  }
}

// 加载当前用户数据
onMounted(() => {
  fetchUserInfo()
})

// 监听 localStorage 中的用户头像变化
watch(
  () => userStore.avatar,
  () => {
    currentAvatar.value = userStore.avatar
  },
)
</script>

<template>
  <div>
    <VRow>
      <!-- 👉 账号概览 -->
      <VCol cols="12" md="4">
        <VCard :title="t('profile.accountOverview')">
          <VCardText class="d-flex flex-column align-center gap-4">
            <!-- 👉 Avatar -->
            <VAvatar rounded="lg" size="120" :image="currentAvatar" />

            <!-- 👉 Username（只读） -->
            <VTextField
              v-model="currentUserName"
              density="comfortable"
              readonly
              class="w-100"
              :label="t('user.username')"
              prepend-inner-icon="mdi-account"
            />

            <!-- 👉 Upload Photo -->
            <form class="w-100">
              <div class="flex flex-wrap justify-center gap-2">
                <VBtn color="primary" @click="refInputEl?.click()">
                  <VIcon icon="mdi-cloud-upload-outline" />
                  <span v-if="display.mdAndUp.value" class="ms-2">{{ t('profile.uploadNewAvatar') }}</span>
                </VBtn>

                <input
                  ref="refInputEl"
                  type="file"
                  name="file"
                  accept=".jpeg,.png,.jpg,GIF"
                  hidden
                  @input="changeAvatar"
                />

                <VBtn type="reset" color="info" variant="tonal" @click="restoreCurrentAvatar">
                  <VIcon icon="mdi-refresh" />
                  <span v-if="display.mdAndUp.value" class="ms-2">{{ t('common.reset') }}</span>
                </VBtn>

                <VBtn type="reset" color="error" variant="tonal" @click="resetDefaultAvatar">
                  <VIcon icon="mdi-image-sync-outline" />
                  <span v-if="display.mdAndUp.value" class="ms-2">{{ t('common.default') }}</span>
                </VBtn>
              </div>

              <p class="text-body-1 text-center mb-0 mt-4">{{ t('profile.avatarFormatTip') }}</p>
            </form>
          </VCardText>

          <!-- 👉 账号安全入口 -->
          <VDivider class="my-2">
            <span>{{ t('profile.accountSecurity') }}</span>
          </VDivider>

          <VList>
            <VListItem @click="openOtpDialog">
              <template #prepend>
                <VIcon icon="mdi-cellphone-key" />
              </template>
              <VListItemTitle>{{ t('profile.authenticatorManagement') }}</VListItemTitle>
              <VListItemSubtitle>
                {{ t('profile.otpSecondFactor') }}
              </VListItemSubtitle>
              <template #append>
                <VChip v-if="accountInfo.is_otp" color="success" size="small">{{ t('profile.enabled') }}</VChip>
              </template>
            </VListItem>
            <VListItem @click="openPasskeyDialog">
              <template #prepend>
                <VIcon icon="material-symbols:passkey" />
              </template>
              <VListItemTitle>{{ t('profile.passkeyManagement') }}</VListItemTitle>
              <VListItemSubtitle>
                {{ t('profile.passkeyPasswordless') }}
              </VListItemSubtitle>
              <template #append>
                <VChip v-if="passkeyList.length > 0" color="success" size="small">
                  {{ t('profile.keysCount', { count: passkeyList.length }) }}
                </VChip>
              </template>
            </VListItem>
          </VList>
        </VCard>
      </VCol>

      <!-- 👉 资料与安全表单 -->
      <VCol cols="12" md="8">
        <VCard :title="t('profile.personalInfo')">
          <VCardText>
            <!-- 👉 Form -->
            <VForm class="mt-2">
              <VRow>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="accountInfo.email"
                    density="comfortable"
                    clearable
                    :label="t('user.email')"
                    type="email"
                    prepend-inner-icon="mdi-email"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="accountInfo.nickname"
                    density="comfortable"
                    clearable
                    :label="t('profile.nickname')"
                    :placeholder="t('profile.nicknamePlaceholder')"
                    prepend-inner-icon="mdi-card-account-details"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="newPassword"
                    density="comfortable"
                    :type="isNewPasswordVisible ? 'text' : 'password'"
                    :append-inner-icon="isNewPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                    clearable
                    :label="t('user.password')"
                    autocomplete=""
                    prepend-inner-icon="mdi-lock"
                    @click:append-inner="isNewPasswordVisible = !isNewPasswordVisible"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <!-- 👉 confirm password -->
                  <VTextField
                    v-model="confirmPassword"
                    density="comfortable"
                    :type="isConfirmPasswordVisible ? 'text' : 'password'"
                    :append-inner-icon="isConfirmPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                    clearable
                    :label="t('user.confirmPassword')"
                    prepend-inner-icon="mdi-lock-check"
                    @click:append-inner="isConfirmPasswordVisible = !isConfirmPasswordVisible"
                  />
                </VCol>
              </VRow>

              <VDivider class="my-10">
                <span>{{ t('profile.accountBinding') }}</span>
              </VDivider>

              <VRow>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="accountInfo.settings.wechat_userid"
                    density="comfortable"
                    clearable
                    :label="t('profile.wechatUser')"
                    prepend-inner-icon="mdi-wechat"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="accountInfo.settings.telegram_userid"
                    density="comfortable"
                    clearable
                    :label="t('profile.telegramUser')"
                    prepend-inner-icon="mdi-send"
                  />
                </VCol>
              </VRow>
              <VRow>
                <!-- 👉 Form Actions -->
                <VCol cols="12" class="d-flex flex-wrap gap-4">
                  <VBtn @click="saveAccountInfo" :disabled="isSaving" prepend-icon="mdi-content-save">
                    <span v-if="isSaving">{{ t('common.saving') }}...</span>
                    <span v-else>{{ t('common.save') }}</span>
                  </VBtn>
                </VCol>
              </VRow>
            </VForm>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>
  </div>
</template>
