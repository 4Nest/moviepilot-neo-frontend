<script setup lang="ts">
import { getNavMenus } from '@/router/i18n-menu'
import { useDisplay } from 'vuetify'
import { NavMenu } from '@/@layouts/types'
import { useI18n } from '@/composables/useChineseText'
import { useLaunchLoading } from '@/composables/useLaunchLoading'
import { usePWA } from '@/composables/usePWA'
import { useUserStore } from '@/stores'
import {
  dynamicButtonRegistry,
  type DynamicButtonRegister,
  type DynamicButtonUnregister,
} from '@/composables/dynamicButtonRegistry'
import { nativeChromeActive } from '@/native/layout'
const { register: registerSharedDynamicButton, unregister: unregisterSharedDynamicButton } = dynamicButtonRegistry
// 是否显示的输入参数
const props = defineProps({
  showNav: {
    type: Boolean,
    default: true,
  },
})

const display = useDisplay()
// PWA模式检测
const { appMode } = usePWA()
const { isLaunchLoading } = useLaunchLoading()
const { t } = useI18n()

const userStore = useUserStore()
const route = useRoute()

// 获取导航菜单
const navMenus = computed(() => getNavMenus(t))

// 根据当前路径获取匹配的菜单路径
function getMenuPathFromRoute(path: string): string {
  const matchedMenu = navMenus.value.find((menu: NavMenu) => menu.footer === true && path.startsWith(menu.to as string))
  if (matchedMenu) return matchedMenu.to as string
  return userStore.superUser ? '/apps' : '/recommend'
}

// 当前选中的菜单，初始值基于当前路由
const currentMenu = ref<string>(getMenuPathFromRoute(route.path))

// 过滤出底部菜单项
const footerMenus = computed(() => {
  // 底部导航只承接字符串路径菜单
  const allMenus = navMenus.value.filter((menu): menu is NavMenu & { to: string } => typeof menu.to === 'string')

  // 优先获取有 footer: true 属性的菜单
  const footerMenusWithProperty = allMenus.filter(menu => menu.footer === true)

  // 设置期望的底部菜单数量（不包括"更多"按钮）
  // 一般来说，底部导航栏显示 3-4 个主要功能比较合适
  const expectedFooterMenuCount = userStore.superUser ? 3 : 4

  // 如果有 footer 属性的菜单已经足够，优先显示它们
  if (footerMenusWithProperty.length >= expectedFooterMenuCount) {
    return footerMenusWithProperty.slice(0, expectedFooterMenuCount)
  }

  // 如果不够，从没有 footer 属性或 footer 为 false 的菜单中补充
  // 优先选择一些常用的功能菜单
  const nonFooterMenus = allMenus.filter(
    menu =>
      menu.footer !== true &&
      // 排除已经在 footerMenusWithProperty 中的菜单
      !footerMenusWithProperty.some(footerMenu => footerMenu.to === menu.to),
  )

  // 计算还需要多少个菜单
  const needCount = expectedFooterMenuCount - footerMenusWithProperty.length

  // 合并菜单：优先显示有 footer 属性的，然后按菜单定义顺序补充其他菜单
  let finalMenus = [...footerMenusWithProperty, ...nonFooterMenus.slice(0, needCount)]

  // 确保至少有一个菜单显示
  if (finalMenus.length === 0 && allMenus.length > 0) {
    finalMenus = [allMenus[0]]
  }

  return finalMenus
})

// 监听路由变化来更新currentMenu
watch(
  () => route.path,
  newPath => {
    currentMenu.value = getMenuPathFromRoute(newPath)
    // 当路由变化时，清除动态按钮
    const registration = dynamicButtonRegistry.registration.value
    if (registration?.button.routePath && registration.button.routePath !== newPath) {
      unregisterSharedDynamicButton(registration.ownerId ?? undefined)
    }
  },
  { immediate: false },
)

// 动态按钮相关
// 提供动态按钮注册和获取的方法
const dynamicButton = computed(() => dynamicButtonRegistry.registration.value?.button ?? null)

// 提供一个方法让其他组件注册动态按钮
const registerDynamicButton: DynamicButtonRegister = (button, ownerId) => {
  registerSharedDynamicButton(
    {
      ...button,
      routePath: button.routePath ?? route.path,
    },
    ownerId,
  )
}

// 提供一个方法让其他组件取消注册动态按钮
const unregisterDynamicButton: DynamicButtonUnregister = ownerId => {
  unregisterSharedDynamicButton(ownerId)
}

// 添加全局注册方法，解决注入不可用的问题
if (typeof window !== 'undefined') {
  // 确保在浏览器环境中
  window.__VUE_INJECT_DYNAMIC_BUTTON__ = registerDynamicButton
  window.__VUE_UNINJECT_DYNAMIC_BUTTON__ = unregisterDynamicButton
}

// 提供给其他组件使用
provide('registerDynamicButton', registerDynamicButton)
provide('unregisterDynamicButton', unregisterDynamicButton)
provide('dynamicButton', dynamicButton)

// 在组件销毁时清理
onUnmounted(() => {
  if (typeof window === 'undefined') return

  const ownsRegisterBridge = window.__VUE_INJECT_DYNAMIC_BUTTON__ === registerDynamicButton
  const ownsUnregisterBridge = window.__VUE_UNINJECT_DYNAMIC_BUTTON__ === unregisterDynamicButton

  if (ownsRegisterBridge && ownsUnregisterBridge) {
    const registration = dynamicButtonRegistry.registration.value
    if (registration) unregisterSharedDynamicButton(registration.ownerId ?? undefined)
  }

  if (ownsRegisterBridge) {
    delete window.__VUE_INJECT_DYNAMIC_BUTTON__
  }
  if (ownsUnregisterBridge) {
    delete window.__VUE_UNINJECT_DYNAMIC_BUTTON__
  }
})
const shouldRenderFooterNav = computed(() => appMode.value && props.showNav && !nativeChromeActive.value)
const shouldRevealFooterNav = computed(() => shouldRenderFooterNav.value && !isLaunchLoading.value)
</script>

<template>
  <Teleport v-if="shouldRenderFooterNav" to="body">
    <div v-show="shouldRevealFooterNav" class="footer-nav-container">
      <TransitionGroup name="footer-nav" tag="div" class="footer-nav-group">
        <VCard key="main-nav" elevation="0" class="footer-nav-card">
          <VCardText class="footer-card-content">
            <VBtnToggle class="footer-btn-group" :mandatory="true" variant="plain" v-model="currentMenu">
              <!-- 遍历底部菜单项 -->
              <VBtn
                v-for="menu in footerMenus"
                :key="menu.to"
                :to="menu.to"
                :variant="currentMenu === menu.to ? 'text' : 'plain'"
                color="primary"
                :ripple="false"
                class="footer-nav-btn"
                :class="{ 'footer-nav-btn-active': currentMenu === menu.to }"
                :value="menu.to"
              >
                <div class="btn-content">
                  <VIcon :icon="menu.icon as string" size="22" class="footer-nav-btn__icon"></VIcon>
                  <span class="footer-nav-btn__label">{{ menu.title }}</span>
                </div>
              </VBtn>

              <!-- 更多按钮 -->
              <VBtn
                v-if="userStore.superUser"
                :variant="currentMenu === '/apps' ? 'text' : 'plain'"
                color="primary"
                :ripple="false"
                to="/apps"
                class="footer-nav-btn"
                :class="{ 'footer-nav-btn-active': currentMenu === '/apps' }"
                value="/apps"
              >
                <div class="btn-content">
                  <VIcon icon="mdi-dots-horizontal" size="22" class="footer-nav-btn__icon"></VIcon>
                  <span class="footer-nav-btn__label">{{ t('nav.more') }}</span>
                </div>
              </VBtn>
            </VBtnToggle>
          </VCardText>
        </VCard>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style lang="scss">
.footer-nav-container {
  position: fixed;
  z-index: 1999;
  display: flex;
  align-items: center;
  justify-content: center;
  border-block-start: 1px solid var(--mp-border-subtle, rgba(var(--v-theme-on-surface), 0.08));
  background-color: rgb(var(--v-theme-surface));
  inset-block-end: 0;
  inset-inline: 0;
  padding-block-end: env(safe-area-inset-bottom, 0px);
  padding-inline: 0;
  pointer-events: auto;

  .footer-nav-group {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    inline-size: 100%;
    max-inline-size: min(100%, 640px);
    padding-block: 6px;
    padding-inline: 8px;
  }

  .footer-nav-card {
    position: relative;
    flex: 1 1 auto;
    overflow: hidden;
    border: none !important;
    border-radius: 0 !important;
    background-color: transparent !important;
    box-shadow: none !important;
    min-inline-size: 0;
    pointer-events: auto;
    transition: all 0.25s cubic-bezier(0.25, 1, 0.5, 1);

    .v-btn-toggle {
      block-size: auto;
      min-block-size: 46px;
    }
  }

  .footer-card-content {
    position: relative;
    padding: 0;
  }

  .footer-nav-card .footer-btn-group.v-btn-group {
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
    border: none;
    border-radius: 0 !important;
    background-color: transparent;
    box-shadow: none !important;
    inline-size: 100%;

    &:hover {
      box-shadow: none !important;
    }
  }

  .footer-nav-btn {
    position: relative;
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border: 1px solid transparent;
    border-radius: 10px !important;
    background-color: transparent;
    block-size: 46px;
    box-shadow: none !important;
    color: rgba(var(--v-theme-on-surface), 0.58) !important;
    min-inline-size: 0;
    opacity: 1 !important;
    padding-block: 4px;
    padding-inline: 6px;
    transition:
      background-color 0.18s ease,
      border-color 0.18s ease,
      color 0.18s ease;

    &:hover {
      background-color: rgba(var(--v-theme-on-surface), 0.04);
      box-shadow: none !important;
      color: rgba(var(--v-theme-on-surface), 0.86) !important;
    }

    &.footer-nav-btn-active,
    &.v-btn--active {
      border-color: rgba(var(--v-theme-primary), 0.18);
      background-color: rgba(var(--v-theme-primary), 0.12);
      box-shadow: none !important;
      color: rgb(var(--v-theme-primary)) !important;

      .footer-nav-btn__label {
        font-weight: 600;
      }
    }

    .btn-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      inline-size: 100%;
    }
  }

  .footer-nav-btn__icon {
    flex-shrink: 0;
    line-height: 1;
  }

  .footer-nav-btn__label {
    overflow: hidden;
    font-size: 11px;
    font-weight: 500;
    line-height: 1.2;
    max-inline-size: 100%;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  // 底部导航动画
  .footer-nav-enter-active,
  .footer-nav-leave-active {
    overflow: hidden;
    transition: all 0.25s cubic-bezier(0.25, 1, 0.5, 1);
  }

  .footer-nav-enter-from,
  .footer-nav-leave-to {
    padding: 0 !important;
    border-width: 0 !important;
    margin-inline-start: 0 !important;
    max-inline-size: 0 !important;
    opacity: 0;
    transform: translateX(12px);
  }

  .footer-nav-move {
    transition: transform 0.25s cubic-bezier(0.25, 1, 0.5, 1);
  }
}

// 移动端主题面板全屏展示时隐藏底部导航，避免不可见控件参与焦点和合成。
html[data-theme-customizer-open='true'] {
  .footer-nav-container {
    visibility: hidden;
    opacity: 0;
    pointer-events: none;
  }
}
</style>
