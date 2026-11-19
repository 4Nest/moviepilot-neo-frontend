<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import { VForm } from 'vuetify/lib/components/index.mjs'
import api, { getApiErrorMessage } from '@/api'
import type { ApiResponse, User, PassKey } from '@/api/types'
import { useUserStore } from '@/stores'
import { useI18n } from '@/composables/useChineseText'
import { openSharedDialog } from '@/composables/useSharedDialog'

// 极简现代几何线性默认头像（深灰蓝圆底 + 柔和中性色人像轮廓）
const DEFAULT_AVATAR_DATA_URI =
  'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20fill%3D%22%23232A38%22%2F%3E%3Ccircle%20cx%3D%2264%22%20cy%3D%2264%22%20r%3D%2252%22%20fill%3D%22%232C3547%22%20stroke%3D%22%2394A3B8%22%20stroke-opacity%3D%220.18%22%20stroke-width%3D%221.5%22%2F%3E%3Ccircle%20cx%3D%2264%22%20cy%3D%2249%22%20r%3D%2215.5%22%20fill%3D%22%23CBD5E1%22%20fill-opacity%3D%220.9%22%2F%3E%3Cpath%20d%3D%22M37%20102c3.8-14.8%2014.4-23%2027-23s23.2%208.2%2027%2023%22%20fill%3D%22none%22%20stroke%3D%22%23CBD5E1%22%20stroke-opacity%3D%220.88%22%20stroke-width%3D%228%22%20stroke-linecap%3D%22round%22%2F%3E%3C%2Fsvg%3E'

const OTPAuthDialog = defineAsyncComponent(() => import('@/components/dialog/OTPAuthDialog.vue'))
const PasskeyDialog = defineAsyncComponent(() => import('@/components/dialog/PasskeyDialog.vue'))
const VerifyPasswordDialog = defineAsyncComponent(() => import('@/components/dialog/VerifyPasswordDialog.vue'))

// 国际化
const { t } = useI18n()

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
const currentAvatar = ref(DEFAULT_AVATAR_DATA_URI)

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
function changeAvatar(e: Event) {
  const fileReader = new FileReader()
  const target = e.target as HTMLInputElement
  const { files } = target
  if (files && files.length > 0) {
    const selectedFile = files[0]
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    const maxSize = 800 * 1024
    // 检查文件是否为图片
    if (!allowedTypes.includes(selectedFile.type)) {
      target.value = ''
      $toast.error(t('profile.avatarFormatError'))
      return
    }
    // 检查文件大小
    if (selectedFile.size > maxSize) {
      target.value = ''
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
  target.value = ''
}

// 提示头像预览已更新，待保存后生效
function notifyAvatarPreviewUpdated() {
  const message = '已更新头像预览，点击保存后生效'
  if (typeof $toast.info === 'function') $toast.info(message)
  else $toast.success(message)
}

// 重置默认头像
function resetDefaultAvatar() {
  currentAvatar.value = DEFAULT_AVATAR_DATA_URI
  notifyAvatarPreviewUpdated()
}

// 还原当前头像
function restoreCurrentAvatar() {
  currentAvatar.value = accountInfo.value.avatar
  notifyAvatarPreviewUpdated()
}

// 加载当前用户信息
async function fetchUserInfo() {
  try {
    const result: User = await api.get('user/current')
    if (result) {
      accountInfo.value = {
        ...result,
        settings: result.settings || {},
      }
      accountInfo.value.avatar = accountInfo.value.avatar ? accountInfo.value.avatar : DEFAULT_AVATAR_DATA_URI
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
    withPasswordVerification(
      t('profile.accountSecurity'),
      t('profile.confirmToChangePassword'),
      (currentPassword: string) => {
        doSaveAccountInfo(currentPassword)
      },
    )
    return
  }
  doSaveAccountInfo()
}

// 执行账户信息保存，仅回传允许修改的字段
async function doSaveAccountInfo(currentPassword?: string) {
  const oldAvatar = accountInfo.value.avatar
  accountInfo.value.avatar = currentAvatar.value
  isSaving.value = true
  try {
    // 昵称等扩展信息保存在 settings 中，后端可以直接处理JSON对象
    const payload: {
      avatar: string
      email: string
      password?: string
      current_password?: string
      settings: User['settings']
    } = {
      email: accountInfo.value.email,
      avatar: currentAvatar.value,
      settings: { ...accountInfo.value.settings, nickname: accountInfo.value.nickname ?? '' },
    }
    if (newPassword.value) {
      payload.password = newPassword.value
      if (currentPassword !== undefined) {
        payload.current_password = currentPassword
      }
    }

    const result = (await api.put('user/current', payload)) as ApiResponse<unknown>

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
      $toast.error(result.message || t('profile.saveFailed', { message: '' }))
      // 失败缓存值还原，且保留已填写的新密码避免用户重输
      accountInfo.value.avatar = oldAvatar
    }
  } catch (error) {
    accountInfo.value.avatar = oldAvatar
    $toast.error(getApiErrorMessage(error) || t('profile.saveFailed', { message: (error as Error)?.message || '' }))
    console.log('保存失败:', error)
  } finally {
    isSaving.value = false
  }
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
    const result = (await api.get('mfa/passkey/list')) as ApiResponse<PassKey[]>
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
  <div class="profile-view">
    <VRow>
      <!-- 👉 账号概览 -->
      <VCol cols="12" md="4">
        <VCard>
          <VCardItem>
            <VCardTitle>{{ t('profile.accountOverview') }}</VCardTitle>
          </VCardItem>
          <VCardText class="profile-overview-body">
            <!-- 👉 Avatar -->
            <VAvatar rounded="lg" size="88" :image="currentAvatar" class="profile-avatar" />

            <!-- 👉 Username（只读） -->
            <VTextField
              v-model="currentUserName"
              readonly
              hide-details="auto"
              class="w-100"
              :label="t('user.username')"
              prepend-inner-icon="mdi-account"
            />

            <!-- 👉 Upload Photo -->
            <form class="w-100" @submit.prevent>
              <div class="profile-avatar-actions">
                <VBtn
                  color="primary"
                  variant="flat"
                  size="small"
                  rounded="lg"
                  prepend-icon="mdi-cloud-upload-outline"
                  @click="refInputEl?.click()"
                >
                  {{ t('profile.uploadNewAvatar') }}
                </VBtn>

                <input
                  ref="refInputEl"
                  type="file"
                  name="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  hidden
                  @change="changeAvatar"
                />

                <VBtn
                  type="reset"
                  color="secondary"
                  variant="outlined"
                  size="small"
                  rounded="lg"
                  prepend-icon="mdi-refresh"
                  @click="restoreCurrentAvatar"
                >
                  {{ t('common.reset') }}
                </VBtn>

                <VBtn
                  type="reset"
                  color="secondary"
                  variant="outlined"
                  size="small"
                  rounded="lg"
                  prepend-icon="mdi-image-sync-outline"
                  @click="resetDefaultAvatar"
                >
                  {{ t('common.default') }}
                </VBtn>
              </div>

              <p class="profile-avatar-tip">{{ t('profile.avatarFormatTip') }}</p>
            </form>

            <!-- 👉 账号安全入口 -->
            <div class="profile-security-section w-100">
              <div class="profile-section-label">{{ t('profile.accountSecurity') }}</div>
              <div class="mp-settings-group">
                <button type="button" class="mp-settings-row profile-security-row" @click="openOtpDialog">
                  <span class="mp-settings-row__meta profile-security-meta">
                    <span class="profile-security-icon" aria-hidden="true">
                      <VIcon icon="mdi-cellphone-key" size="16" />
                    </span>
                    <span class="profile-security-copy">
                      <span class="mp-settings-row__title">{{ t('profile.authenticatorManagement') }}</span>
                      <span class="mp-settings-row__desc">{{ t('profile.otpSecondFactor') }}</span>
                    </span>
                  </span>
                  <span class="mp-settings-row__control profile-security-control">
                    <VChip v-if="accountInfo.is_otp" color="success" variant="tonal" size="x-small">
                      {{ t('profile.enabled') }}
                    </VChip>
                    <VIcon icon="mdi-chevron-right" size="16" class="profile-security-arrow" />
                  </span>
                </button>

                <button type="button" class="mp-settings-row profile-security-row" @click="openPasskeyDialog">
                  <span class="mp-settings-row__meta profile-security-meta">
                    <span class="profile-security-icon" aria-hidden="true">
                      <VIcon icon="material-symbols:passkey" size="16" />
                    </span>
                    <span class="profile-security-copy">
                      <span class="mp-settings-row__title">{{ t('profile.passkeyManagement') }}</span>
                      <span class="mp-settings-row__desc">{{ t('profile.passkeyPasswordless') }}</span>
                    </span>
                  </span>
                  <span class="mp-settings-row__control profile-security-control">
                    <VChip v-if="passkeyList.length > 0" color="success" variant="tonal" size="x-small">
                      {{ t('profile.keysCount', { count: passkeyList.length }) }}
                    </VChip>
                    <VIcon icon="mdi-chevron-right" size="16" class="profile-security-arrow" />
                  </span>
                </button>
              </div>
            </div>
          </VCardText>
        </VCard>
      </VCol>

      <!-- 👉 资料与安全表单 -->
      <VCol cols="12" md="8">
        <VCard>
          <VCardItem>
            <VCardTitle>{{ t('profile.personalInfo') }}</VCardTitle>
          </VCardItem>
          <VCardText>
            <VForm @submit.prevent="saveAccountInfo">
              <VRow>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="accountInfo.email"
                    clearable
                    :label="t('user.email')"
                    type="email"
                    prepend-inner-icon="mdi-email"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="accountInfo.nickname"
                    clearable
                    :label="t('profile.nickname')"
                    :placeholder="t('profile.nicknamePlaceholder')"
                    prepend-inner-icon="mdi-card-account-details"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="newPassword"
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
                  <VTextField
                    v-model="confirmPassword"
                    :type="isConfirmPasswordVisible ? 'text' : 'password'"
                    :append-inner-icon="isConfirmPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                    clearable
                    :label="t('user.confirmPassword')"
                    prepend-inner-icon="mdi-lock-check"
                    @click:append-inner="isConfirmPasswordVisible = !isConfirmPasswordVisible"
                  />
                </VCol>
              </VRow>

              <VDivider class="profile-form-divider" />
              <div class="profile-section-heading">{{ t('profile.accountBinding') }}</div>

              <VRow>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="accountInfo.settings.wechat_userid"
                    clearable
                    :label="t('profile.wechatUser')"
                    prepend-inner-icon="mdi-wechat"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="accountInfo.settings.telegram_userid"
                    clearable
                    :label="t('profile.telegramUser')"
                    prepend-inner-icon="mdi-send"
                  />
                </VCol>
              </VRow>

              <div class="mp-card-footer">
                <VBtn
                  type="submit"
                  size="small"
                  color="primary"
                  variant="flat"
                  rounded="lg"
                  prepend-icon="mdi-content-save-outline"
                  class="px-4"
                  :loading="isSaving"
                  :disabled="isSaving"
                >
                  {{ isSaving ? `${t('common.saving')}...` : t('common.save') }}
                </VBtn>
              </div>
            </VForm>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>
  </div>
</template>

<style scoped>
.profile-overview-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 13px;
}

.profile-avatar {
  border: 1px solid var(--mp-border-subtle);
}

.profile-avatar-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.profile-avatar-tip {
  margin: 8px 0 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  line-height: 1.45;
  text-align: center;
}

.profile-security-section {
  border-block-start: 1px solid var(--mp-border-subtle);
  margin-block-start: 4px;
  padding-block-start: 13px;
}

.profile-section-label {
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 12px;
  font-weight: 600;
  margin-block-end: 8px;
}

.profile-security-row {
  border: 0;
  background: transparent;
  cursor: pointer;
  inline-size: 100%;
  text-align: start;
  transition: background-color 0.14s ease;
}

.profile-security-row:hover {
  background: rgba(var(--v-theme-on-surface), 0.035);
}

.profile-security-meta {
  display: flex;
  flex-direction: row !important;
  align-items: center;
  gap: 10px;
}

.profile-security-icon {
  display: inline-flex;
  flex: 0 0 30px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 7px;
  background: rgba(var(--v-theme-on-surface), 0.045);
  block-size: 30px;
  color: rgba(var(--v-theme-on-surface), 0.78);
  inline-size: 30px;
}

.profile-security-copy {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-inline-size: 0;
}

.profile-security-control {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.profile-security-arrow {
  color: rgba(var(--v-theme-on-surface), 0.42);
}

.profile-form-divider {
  margin-block: 21px 13px;
}

.profile-section-heading {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.4;
  margin-block-end: 13px;
}

@media (width <= 600px) {
  .profile-view {
    padding-block-end: env(safe-area-inset-bottom, 0px);
  }

  .profile-view :deep(.v-card) {
    border: 1px solid var(--mp-border-card);
    border-radius: 10px;
    background: rgb(var(--v-theme-surface));
    box-shadow: none;
  }

  .profile-view :deep(.v-card > .v-card-item) {
    padding: 11px 14px;
  }

  .profile-view :deep(.v-card > .v-card-item .v-card-title) {
    font-size: 14.5px;
    font-weight: 600;
  }

  .profile-view :deep(.v-card > .v-card-text) {
    padding: 12px 14px;
  }

  .profile-overview-body {
    gap: 11px;
  }

  .profile-avatar-actions {
    gap: 6px;
  }

  .profile-avatar-tip {
    font-size: 11.5px;
    overflow-wrap: anywhere;
    word-break: normal;
  }

  .profile-security-meta {
    gap: 8px;
    min-inline-size: 0;
  }

  .profile-security-copy {
    overflow-wrap: anywhere;
    word-break: normal;
  }

  .profile-form-divider {
    margin-block: 14px 10px;
  }

  .profile-section-heading {
    margin-block-end: 10px;
  }
}
</style>
