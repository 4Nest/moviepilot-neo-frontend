<script lang="ts" setup>
import { isNullOrEmptyObject } from '@/@core/utils'
import api from '@/api'
import { useToast } from 'vue-toastification'
import { useI18n } from '@/composables/useChineseText'
import { useDisplay } from 'vuetify'

// 多语言支持与响应式断点
const { t } = useI18n()
const display = useDisplay()

// 定义事件
const emit = defineEmits(['done', 'close'])

// 提示框
const $toast = useToast()

// 是否加载中
const loading = ref(false)
let doneTimer: ReturnType<typeof setTimeout> | undefined

// 用户认证表单
const authForm = ref<any>({
  site: null,
  params: {},
})

// 所有认证站点
const authSites = ref<{
  [key: string]: {
    name: string
    icon: string
    params: { [key: string]: any }
  }
}>({})

// 生成站点拉选项
const dropdownItems = computed(() => {
  return Object.keys(authSites.value).map(key => {
    return {
      key,
      name: authSites.value[key].name,
      prependAvatar: authSites.value[key].icon,
    }
  })
})

// 读取authSites.params，生成表单配置列表
const formFields = computed(() => {
  const site = authSites.value[authForm.value.site]
  return Object.keys(site?.params || {})
    .filter(item => {
      return site.params[item].name && site.params[item].type
    })
    .map(key => {
      return {
        key,
        site: authForm.value.site,
        name: site.params[key].name,
        type: site.params[key].type,
        placeholder: site.params[key].placeholder,
        tooltip: site.params[key].tooltip,
      }
    })
})

// 查询之前使用的认证参数
async function loadLastAuthParams() {
  try {
    const result: { [key: string]: any } = await api.get(`system/setting/UserSiteAuthParams`)
    if (result.success) {
      const ret = result.data?.value
      if (ret && !isNullOrEmptyObject(ret.params)) {
        authForm.value = ret
      }
    }
  } catch (e) {
    console.error(e)
  }
}

// 加载认证站点配置
async function loadAuthSites() {
  try {
    authSites.value = (await api.get(`site/auth`)) || {}
  } catch (e) {
    console.error(e)
  }
}

// 完成
async function handleDone() {
  await checkUser()
}

// 认证处理
async function checkUser() {
  if (loading.value) return
  if (!authForm.value.site) {
    $toast.error(t('dialog.userAuth.selectSiteRequired'))
    return
  }
  if (!authSites.value[authForm.value.site]) {
    $toast.error(t('dialog.userAuth.siteConfigNotExist'))
    return
  }
  if (formFields.value.length > 0) {
    for (const field of formFields.value) {
      if (!authForm.value.params[field.site.toUpperCase() + '_' + field.key.toUpperCase()]) {
        $toast.error(t('dialog.userAuth.fieldRequired', { name: field.name }))
        return
      }
    }
  }
  loading.value = true
  try {
    const result: { [key: string]: any } = await api.post(`site/auth`, authForm.value)
    if (result.success) {
      $toast.success(t('dialog.userAuth.authSuccess'))
      // 1秒后刷新页面
      doneTimer = setTimeout(() => {
        emit('done')
      }, 1000)
    } else {
      $toast.error(t('dialog.userAuth.authFailed', { message: result.message }))
    }
  } catch (e) {
    console.error(e)
    $toast.error(t('dialog.userAuth.authFailed', { message: e instanceof Error ? e.message : t('common.error') }))
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadAuthSites()
  loadLastAuthParams()
})

onUnmounted(() => {
  if (doneTimer) clearTimeout(doneTimer)
})
</script>

<template>
  <VDialog max-width="38rem" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard class="mp-dialog-card">
      <VCardItem class="mp-dialog-header">
        <template #prepend>
          <VIcon icon="mdi-user-check" size="20" class="me-2 text-primary" />
        </template>
        <VCardTitle>
          {{ t('dialog.userAuth.title') }}
        </VCardTitle>
      </VCardItem>
      <VDialogCloseBtn :disabled="loading" @click="emit('close')" />
      <VDivider />
      <VCardText class="mp-dialog-body">
        <VRow class="mp-form-grid">
          <VCol cols="12">
            <VSelect
              v-model="authForm.site"
              :items="dropdownItems"
              item-value="key"
              item-title="name"
              :label="t('dialog.userAuth.selectSite')"
              prepend-inner-icon="mdi-web"
            >
              <template #selection="{ item }">
                <div class="d-flex align-center gap-2">
                  <span v-if="item.raw.prependAvatar" class="user-auth-site-icon">
                    <img :src="item.raw.prependAvatar" :alt="item.raw.name" width="16" height="16" />
                  </span>
                  <span>{{ item.raw.name }}</span>
                </div>
              </template>
              <template #item="{ props: itemProps, item }">
                <VListItem v-bind="itemProps" :title="item.raw.name">
                  <template v-if="item.raw.prependAvatar" #prepend>
                    <span class="user-auth-site-icon me-2">
                      <img :src="item.raw.prependAvatar" :alt="item.raw.name" width="16" height="16" />
                    </span>
                  </template>
                </VListItem>
              </template>
            </VSelect>
          </VCol>
          <VCol v-for="param in formFields" :key="param.key" cols="12" :sm="formFields.length > 1 ? 6 : 12">
            <VTextField
              v-model="authForm.params[param.site.toUpperCase() + '_' + param.key.toUpperCase()]"
              :type="param.type"
              :label="param.name"
              :placeholder="param.placeholder"
              :hint="param.tooltip && param.tooltip !== param.name ? param.tooltip : undefined"
              clearable
            />
          </VCol>
        </VRow>
      </VCardText>
      <VDivider />
      <VCardActions class="app-dialog-actions mp-dialog-footer">
        <VSpacer />
        <VBtn color="default" variant="text" size="small" :disabled="loading" @click="emit('close')">
          {{ t('common.cancel') }}
        </VBtn>
        <VBtn
          color="primary"
          variant="flat"
          size="small"
          prepend-icon="mdi-check"
          class="px-4"
          :loading="loading"
          :disabled="loading"
          @click="handleDone"
        >
          {{ t('dialog.userAuth.authBtn') }}
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

.mp-form-grid {
  row-gap: 6px;
}

.user-auth-site-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  padding: 2px;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 5px;
  background-color: rgba(255, 255, 255, 0.08);
  block-size: 22px;
  inline-size: 22px;
}

:root[data-theme='light'] .user-auth-site-icon,
.v-theme--light .user-auth-site-icon {
  background-color: var(--mp-item-active-bg);
}

.user-auth-site-icon img {
  display: block;
  block-size: 16px;
  inline-size: 16px;
  object-fit: contain;
}

@media (max-width: 599.98px) {
  .mp-dialog-body {
    padding: 16px !important;
  }
}
</style>
