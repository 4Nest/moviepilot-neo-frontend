<script setup lang="ts">
import {
  themeCustomizerPrimaryColors,
  useThemeCustomizer,
  type ThemeCustomizerLayout,
  type ThemeCustomizerTheme,
} from '@/composables/useThemeCustomizer'
import { nativeChromeActive } from '@/native/layout'
import { usePWA } from '@/composables/usePWA'
import { useI18n } from '@/composables/useChineseText'

const emit = defineEmits<{
  'close': []
}>()

const customColorInput = ref<HTMLInputElement | null>(null)

const { isCustomized, resetSettings, setLayout, setPrimaryColor, setTheme, settings } = useThemeCustomizer()
const { appMode } = usePWA()
const { t } = useI18n()
const defaultPrimaryColor = themeCustomizerPrimaryColors[0].value

// 将主题定制器打开状态同步到根节点，供全局悬浮按钮避让右侧面板。
function syncThemeCustomizerOpenState(isOpen: boolean) {
  if (typeof document === 'undefined') return

  if (isOpen) {
    document.documentElement.setAttribute('data-theme-customizer-open', 'true')
    document.body.setAttribute('data-theme-customizer-open', 'true')

    return
  }

  document.documentElement.removeAttribute('data-theme-customizer-open')
  document.body.removeAttribute('data-theme-customizer-open')
}

// 组件卸载时清理根节点状态，避免路由切换后悬浮按钮继续保持让位。
function clearThemeCustomizerOpenState() {
  syncThemeCustomizerOpenState(false)
}

// 处理固定面板的全局 Esc 关闭快捷键。
function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => {
  syncThemeCustomizerOpenState(true)
  window.addEventListener('keydown', handleGlobalKeydown)
})

onScopeDispose(clearThemeCustomizerOpenState)
onScopeDispose(() => {
  if (typeof window === 'undefined') return

  window.removeEventListener('keydown', handleGlobalKeydown)
})

const themeOptions = computed<Array<{ icon: string; title: string; value: ThemeCustomizerTheme }>>(() => [
  { title: t('theme.light'), value: 'light', icon: 'mdi-weather-sunny' },
  { title: t('theme.dark'), value: 'dark', icon: 'mdi-weather-night' },
  { title: t('theme.auto'), value: 'auto', icon: 'mdi-monitor' },
])

const layoutOptions = computed<Array<{ title: string; value: ThemeCustomizerLayout }>>(() => [
  { title: t('theme.customizer.layoutVertical'), value: 'vertical' },
  { title: t('theme.customizer.layoutCollapsed'), value: 'collapsed' },
  { title: t('theme.customizer.layoutHorizontal'), value: 'horizontal' },
])

const showLayoutSection = computed(() => !nativeChromeActive.value && !appMode.value)
const isCustomPrimaryColor = computed(
  () => !themeCustomizerPrimaryColors.some(color => color.value === settings.value.primaryColor),
)

const showResetBadge = computed(() =>
  nativeChromeActive.value || appMode.value
    ? settings.value.primaryColor !== defaultPrimaryColor || settings.value.theme !== 'auto'
    : isCustomized.value,
)

/** 根据背景色亮度返回高对比对勾颜色。 */
function getCheckContrastColor(hexColor: string) {
  const hex = hexColor.replace('#', '')
  if (hex.length !== 6) return '#FFFFFF'
  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255

  return luminance > 0.68 ? '#181A22' : '#FFFFFF'
}

// 打开原生颜色选择器。
function openColorPicker() {
  customColorInput.value?.click()
}

// 处理原生颜色选择器的自定义主色输入。
function handleCustomColorInput(event: Event) {
  const color = (event.target as HTMLInputElement).value

  setPrimaryColor(color)
}

// 切换布局类型，App 模式下保留移动端固定布局。
function handleLayoutChange(layout: ThemeCustomizerLayout) {
  if (appMode.value) return

  setLayout(layout)
}

// 重置主题定制设置，App 模式只恢复可调整的外观项。
async function handleResetSettings() {
  if (nativeChromeActive.value || appMode.value) {
    await setPrimaryColor(defaultPrimaryColor)
    await setTheme('auto')

    return
  }

  await resetSettings()
}
</script>

<template>
  <aside
    class="theme-customizer-panel-host"
    role="dialog"
    :data-native-sheet-size="nativeChromeActive ? 'medium' : undefined"
    :aria-label="t('theme.customizer.title')"
  >
    <div class="theme-customizer-panel" :class="{ 'theme-customizer-panel--dialog': appMode }">
      <!-- 顶部栏 52px -->
      <header class="theme-customizer-header">
        <div class="theme-customizer-header__brand">
          <VIcon class="theme-customizer-header__icon" icon="mdi-tune-variant" size="18" />
          <h2 class="theme-customizer-title">{{ t('theme.customizer.title') }}</h2>
        </div>
        <div class="theme-customizer-header__actions">
          <VTooltip :text="t('theme.customizer.reset')" location="bottom">
            <template #activator="{ props: tooltipProps }">
              <IconBtn
                v-bind="tooltipProps"
                data-testid="theme-customizer-reset"
                class="theme-customizer-action-btn"
                :aria-label="t('theme.customizer.reset')"
                @click="handleResetSettings"
              >
                <span v-if="showResetBadge" class="theme-customizer-reset-dot" aria-hidden="true" />
                <VIcon icon="mdi-refresh" size="17" />
              </IconBtn>
            </template>
          </VTooltip>
          <IconBtn
            data-native-dialog-close
            class="theme-customizer-action-btn"
            :aria-label="t('common.close')"
            @click="emit('close')"
          >
            <VIcon icon="mdi-close" size="17" />
          </IconBtn>
        </div>
      </header>

      <div class="theme-customizer-body">
        <!-- 分组 1：色彩模式 -->
        <section class="theme-customizer-group">
          <div class="theme-customizer-group__header">
            <h3 class="theme-customizer-group__title">{{ t('theme.customizer.colorMode') }}</h3>
          </div>
          <div class="theme-customizer-mode-grid">
            <button
              v-for="theme in themeOptions"
              :key="theme.value"
              type="button"
              data-testid="theme-mode-option"
              :data-value="theme.value"
              class="theme-customizer-mode-card"
              :class="{ 'is-active': settings.theme === theme.value }"
              @click="setTheme(theme.value)"
            >
              <span class="mini-theme-preview" :class="`mini-theme-preview--${theme.value}`" aria-hidden="true">
                <span class="mini-theme-preview__sidebar">
                  <i />
                  <i />
                </span>
                <span class="mini-theme-preview__workspace">
                  <span class="mini-theme-preview__topbar" />
                  <span class="mini-theme-preview__canvas">
                    <i />
                    <i />
                  </span>
                </span>
              </span>
              <span class="theme-customizer-mode-card__label">
                <VIcon :icon="theme.icon" size="14" />
                <span>{{ theme.title }}</span>
              </span>
            </button>
          </div>
        </section>

        <!-- 分组 2：强调色 -->
        <section class="theme-customizer-group">
          <div class="theme-customizer-group__header">
            <h3 class="theme-customizer-group__title">{{ t('theme.customizer.primaryColor') }}</h3>
            <span class="theme-customizer-hex-pill">
              <span class="theme-customizer-hex-pill__dot" :style="{ backgroundColor: settings.primaryColor }" />
              <span data-testid="primary-color-hex">{{ settings.primaryColor.toUpperCase() }}</span>
            </span>
          </div>
          <div class="theme-customizer-color-grid">
            <button
              v-for="color in themeCustomizerPrimaryColors"
              :key="color.value"
              type="button"
              data-testid="color-swatch"
              :data-color="color.value"
              class="theme-customizer-color-swatch"
              :class="{ 'is-active': settings.primaryColor === color.value }"
              :style="{ backgroundColor: color.value }"
              :aria-label="t('theme.customizer.usePrimaryColor', { color: color.name })"
              @click="setPrimaryColor(color.value)"
            >
              <VIcon
                v-if="settings.primaryColor === color.value"
                icon="mdi-check"
                size="16"
                :style="{ color: getCheckContrastColor(color.value) }"
              />
            </button>

            <button
              v-if="!appMode"
              type="button"
              class="theme-customizer-color-swatch theme-customizer-color-swatch--picker"
              :class="{ 'is-active': isCustomPrimaryColor }"
              :style="isCustomPrimaryColor ? { backgroundColor: settings.primaryColor } : undefined"
              :aria-label="t('theme.customizer.chooseCustomColor')"
              @click="openColorPicker"
            >
              <VIcon
                icon="mdi-palette-outline"
                size="17"
                :style="isCustomPrimaryColor ? { color: getCheckContrastColor(settings.primaryColor) } : undefined"
              />
              <input
                ref="customColorInput"
                class="theme-customizer-native-color"
                type="color"
                :value="settings.primaryColor"
                @input="handleCustomColorInput"
              />
            </button>
          </div>
        </section>

        <!-- 分组 3：桌面导航布局 -->
        <section v-if="showLayoutSection" class="theme-customizer-group">
          <div class="theme-customizer-group__header">
            <h3 class="theme-customizer-group__title">{{ t('theme.customizer.layout') }}</h3>
          </div>
          <div class="theme-customizer-layout-grid">
            <button
              v-for="layout in layoutOptions"
              :key="layout.value"
              type="button"
              data-testid="layout-option"
              :data-value="layout.value"
              class="theme-customizer-layout-card"
              :class="{ 'is-active': settings.layout === layout.value }"
              @click="handleLayoutChange(layout.value)"
            >
              <span class="mini-ide-layout" :class="`mini-ide-layout--${layout.value}`" aria-hidden="true">
                <span class="mini-ide-layout__nav">
                  <i class="is-accent" />
                  <i />
                  <i />
                </span>
                <span class="mini-ide-layout__main">
                  <span class="mini-ide-layout__bar" />
                  <span class="mini-ide-layout__cards">
                    <i />
                    <i />
                  </span>
                </span>
              </span>
              <span class="theme-customizer-layout-card__label">{{ layout.title }}</span>
            </button>
          </div>
        </section>
      </div>

      <footer class="theme-customizer-footer">
        <span>{{ t('theme.customizer.autoSavedHint') }}</span>
      </footer>
    </div>
  </aside>
</template>

<style lang="scss" scoped>
/* stylelint-disable no-descending-specificity */

.theme-customizer-panel-host {
  position: fixed !important;
  z-index: 2102 !important;
  display: flex;
  overflow: hidden;
  border-radius: 0;
  background: rgb(var(--v-theme-surface));
  block-size: 100vh !important;
  border-inline-start: 1px solid var(--mp-border-card) !important;
  box-shadow: var(--mp-overlay-shadow) !important;
  inline-size: 320px !important;
  inset-block-start: 0 !important;
  inset-inline-end: 0 !important;
  max-block-size: none !important;
  min-block-size: 100vh !important;
}

@supports (block-size: 100lvh) {
  .theme-customizer-panel-host {
    block-size: 100lvh !important;
    min-block-size: 100lvh !important;
  }
}

@media (width <= 600px) {
  .theme-customizer-panel-host {
    inline-size: 100vw !important;
  }
}

.theme-customizer-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  block-size: 100vh;
  inline-size: 100%;
  min-block-size: 0;
}

@supports (block-size: 100dvh) {
  .theme-customizer-panel {
    block-size: 100dvh;
  }
}

.theme-customizer-panel--dialog {
  overflow: hidden;
  block-size: 100%;
  max-block-size: 100%;
  padding-block-start: env(safe-area-inset-top, 0px);
}

.theme-customizer-header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  border-block-end: 1px solid var(--mp-border-subtle);
  block-size: 52px;
  gap: 12px;
  padding-inline: 16px;
}

.theme-customizer-header__brand {
  display: flex;
  align-items: center;
  gap: 8px;
  min-inline-size: 0;
}

.theme-customizer-header__icon {
  color: rgba(var(--v-theme-on-surface), 0.68);
}

.theme-customizer-title {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.95);
  font-size: 14.5px;
  font-weight: 600;
  letter-spacing: -0.005em;
  line-height: 1.2;
}

.theme-customizer-header__actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.theme-customizer-action-btn {
  position: relative;
  border-radius: 8px !important;
  block-size: 30px !important;
  color: rgba(var(--v-theme-on-surface), 0.68);
  inline-size: 30px !important;
  min-inline-size: 30px !important;

  &:hover {
    background-color: rgba(var(--v-theme-on-surface), 0.06);
    color: rgba(var(--v-theme-on-surface), 0.94);
    opacity: 1;
  }
}

.theme-customizer-reset-dot {
  position: absolute;
  border-radius: 50%;
  background-color: rgb(var(--v-theme-primary));
  block-size: 6px;
  inline-size: 6px;
  inset-block-start: 5px;
  inset-inline-end: 5px;
}

.theme-customizer-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 20px;
  min-block-size: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-block: 18px;
  padding-inline: 16px;
  scrollbar-width: thin;
}

.theme-customizer-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.theme-customizer-group__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.theme-customizer-group__title {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.78);
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1.3;
}

// 分组 1：色彩模式卡片
.theme-customizer-mode-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.theme-customizer-mode-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: 6px;
  border: 1px solid var(--mp-border-card);
  border-radius: 8px;
  appearance: none;
  background: rgba(var(--v-theme-on-surface), 0.02);
  color: rgba(var(--v-theme-on-surface), 0.72);
  cursor: pointer;
  gap: 6px;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    color 0.15s ease;

  &:hover:not(.is-active) {
    border-color: var(--mp-border-hover);
    background: rgba(var(--v-theme-on-surface), 0.04);
    color: rgba(var(--v-theme-on-surface), 0.9);
  }

  &.is-active {
    border: 1.5px solid rgb(var(--v-theme-primary));
    padding: 5.5px;
    background: rgba(var(--v-theme-primary), 0.06);
    color: rgba(var(--v-theme-on-surface), 0.96);
    font-weight: 600;
  }
}

.theme-customizer-mode-card__label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  gap: 4px;
  line-height: 1.2;
  white-space: nowrap;
}

.mini-theme-preview {
  position: relative;
  display: grid;
  overflow: hidden;
  border: 1px solid rgba(128, 134, 150, 0.22);
  border-radius: 5px;
  block-size: 40px;
  grid-template-columns: 26% 1fr;
  inline-size: 100%;
}

.mini-theme-preview__sidebar {
  display: flex;
  flex-direction: column;
  border-inline-end: 1px solid rgba(128, 134, 150, 0.16);
  gap: 3px;
  padding-block: 6px;
  padding-inline: 4px;

  i {
    display: block;
    border-radius: 2px;
    block-size: 3px;
  }
}

.mini-theme-preview__workspace {
  display: flex;
  flex-direction: column;
}

.mini-theme-preview__topbar {
  block-size: 8px;
  border-block-end: 1px solid rgba(128, 134, 150, 0.16);
}

.mini-theme-preview__canvas {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  padding: 5px;

  i {
    display: block;
    border-radius: 2px;
    block-size: 6px;
  }
}

.mini-theme-preview--light {
  background: #fafafc;

  .mini-theme-preview__sidebar {
    background: #eef0f5;

    i {
      background: rgba(15, 23, 42, 0.2);
    }
  }

  .mini-theme-preview__canvas i {
    border: 1px solid rgba(15, 23, 42, 0.08);
    background: #ffffff;
  }
}

.mini-theme-preview--dark {
  background: #1d1f27;

  .mini-theme-preview__sidebar {
    background: #15161c;

    i {
      background: rgba(255, 255, 255, 0.22);
    }
  }

  .mini-theme-preview__canvas i {
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: #252834;
  }
}

.mini-theme-preview--auto {
  background: linear-gradient(110deg, #fafafc 0 50%, #1d1f27 50% 100%);

  .mini-theme-preview__sidebar {
    background: #eef0f5;

    i {
      background: rgba(15, 23, 42, 0.22);
    }
  }

  .mini-theme-preview__canvas i {
    border: 1px solid rgba(128, 134, 150, 0.2);
    background: rgba(128, 134, 150, 0.16);
  }
}

// 分组 2：强调色与 HEX 胶囊
.theme-customizer-hex-pill {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--mp-border-card);
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.035);
  color: rgba(var(--v-theme-on-surface), 0.78);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.6875rem;
  font-weight: 500;
  gap: 5px;
  line-height: 1;
  padding-block: 3px;
  padding-inline: 6px;
}

.theme-customizer-hex-pill__dot {
  border-radius: 50%;
  block-size: 8px;
  inline-size: 8px;
}

.theme-customizer-color-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(7, 34px);
  justify-content: space-between;
}

.theme-customizer-color-swatch {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  appearance: none;
  block-size: 34px;
  cursor: pointer;
  inline-size: 34px;
  transition:
    transform 0.14s ease,
    box-shadow 0.14s ease,
    border-color 0.14s ease;

  &:hover {
    transform: translateY(-1px);
  }

  &.is-active {
    box-shadow:
      0 0 0 2px rgb(var(--v-theme-surface)),
      0 0 0 3.5px rgba(var(--v-theme-on-surface), 0.72);
  }
}

.theme-customizer-color-swatch--picker {
  border: 1px dashed var(--mp-border-hover);
  background: rgba(var(--v-theme-on-surface), 0.04);
  color: rgba(var(--v-theme-on-surface), 0.74);

  &.is-active {
    border-style: solid;
  }
}

.theme-customizer-native-color {
  position: absolute;
  block-size: 1px;
  inline-size: 1px;
  inset-block-start: 50%;
  inset-inline-start: 50%;
  opacity: 0;
  pointer-events: none;
}

// 分组 3：桌面导航布局示意图
.theme-customizer-layout-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.theme-customizer-layout-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: 6px;
  border: 1px solid var(--mp-border-card);
  border-radius: 8px;
  appearance: none;
  background: rgba(var(--v-theme-on-surface), 0.02);
  color: rgba(var(--v-theme-on-surface), 0.72);
  cursor: pointer;
  gap: 6px;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    color 0.15s ease;

  &:hover:not(.is-active) {
    border-color: var(--mp-border-hover);
    background: rgba(var(--v-theme-on-surface), 0.04);
    color: rgba(var(--v-theme-on-surface), 0.9);
  }

  &.is-active {
    border: 1.5px solid rgb(var(--v-theme-primary));
    padding: 5.5px;
    background: rgba(var(--v-theme-primary), 0.06);
    color: rgba(var(--v-theme-on-surface), 0.96);
    font-weight: 600;
  }
}

.theme-customizer-layout-card__label {
  font-size: 0.75rem;
  line-height: 1.2;
  text-align: center;
  white-space: nowrap;
}

.mini-ide-layout {
  display: grid;
  overflow: hidden;
  border: 1px solid var(--mp-border-subtle);
  border-radius: 5px;
  background: var(--mp-canvas-bg);
  block-size: 46px;
  grid-template-columns: 30% 1fr;
  inline-size: 100%;
}

.mini-ide-layout__nav {
  display: flex;
  flex-direction: column;
  border-inline-end: 1px solid var(--mp-border-subtle);
  background: var(--mp-shell-bg);
  gap: 3px;
  padding-block: 6px;
  padding-inline: 4px;

  i {
    display: block;
    border-radius: 2px;
    background: rgba(var(--v-theme-on-surface), 0.16);
    block-size: 3.5px;

    &.is-accent {
      background: rgb(var(--v-theme-primary));
    }
  }
}

.mini-ide-layout__main {
  display: flex;
  flex-direction: column;
  min-inline-size: 0;
}

.mini-ide-layout__bar {
  block-size: 8px;
  border-block-end: 1px solid var(--mp-border-subtle);
}

.mini-ide-layout__cards {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  padding: 5px;

  i {
    display: block;
    border: 1px solid var(--mp-border-subtle);
    border-radius: 2px;
    background: rgb(var(--v-theme-surface));
    block-size: 8px;
  }
}

.mini-ide-layout--collapsed {
  grid-template-columns: 16% 1fr;

  .mini-ide-layout__nav {
    align-items: center;
    padding-inline: 2px;

    i {
      block-size: 4px;
      inline-size: 4px;
    }
  }
}

.mini-ide-layout--horizontal {
  grid-template-columns: 1fr;
  grid-template-rows: 13px 1fr;

  .mini-ide-layout__nav {
    flex-direction: row;
    align-items: center;
    border-block-end: 1px solid var(--mp-border-subtle);
    border-inline-end: 0;
    padding-block: 0;
    padding-inline: 5px;

    i {
      block-size: 3.5px;
      inline-size: 12px;
    }
  }

  .mini-ide-layout__bar {
    display: none;
  }
}

.theme-customizer-footer {
  flex-shrink: 0;
  border-block-start: 1px solid var(--mp-border-subtle);
  color: rgba(var(--v-theme-on-surface), 0.44);
  font-size: 11.5px;
  line-height: 1.4;
  padding-block: 10px calc(10px + env(safe-area-inset-bottom, 0px));
  padding-inline: 16px;
  text-align: center;
}
</style>
