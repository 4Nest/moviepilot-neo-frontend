<script setup lang="ts">
import { NavMenu } from '@/@layouts/types'
import { getNavMenus } from '@/router/i18n-menu'
import { usePluginSidebarNavStore } from '@/stores'
import { useI18n } from '@/composables/useChineseText'
import { filterPluginSidebarNavEntries } from '@/utils/pluginSidebarNav'

// 国际化
const { t } = useI18n()

const pluginSidebarNavStore = usePluginSidebarNavStore()

// 应用分组（以header分组）
const appGroups = ref<Record<string, NavMenu[]>>({})

/** 按菜单 header 聚合当前内置与插件入口，并保持与桌面侧栏一致。 */
function categorizeApps() {
  let menus = getNavMenus(t).filter((item: NavMenu) => !item.footer)

  if (pluginSidebarNavStore.items.length > 0) {
    const pluginNavMenus = filterPluginSidebarNavEntries(pluginSidebarNavStore.items, t).map(e => e.navMenu)
    menus = [...menus, ...pluginNavMenus]
  }

  const groupedMenus: Record<string, NavMenu[]> = {}

  menus.forEach(menu => {
    const header = menu.header || t('appcenter.others')
    if (!groupedMenus[header]) {
      groupedMenus[header] = []
    }
    groupedMenus[header].push(menu)
  })

  appGroups.value = groupedMenus
}

let appGroupsMounted = false
watch(
  () => pluginSidebarNavStore.items,
  () => {
    if (appGroupsMounted) categorizeApps()
  },
)

onMounted(async () => {
  await pluginSidebarNavStore.ensureSidebarNav()
  categorizeApps()
  appGroupsMounted = true
})
</script>
<template>
  <div class="app-settings-container">
    <div class="app-settings-content">
      <!-- 遍历所有分组 -->
      <section v-for="(apps, header) in appGroups" :key="header" class="settings-section">
        <h2 class="settings-section-title">
          {{ header }}
        </h2>
        <!-- 分组内容 - 统一纯色微边框卡片 -->
        <VCard variant="flat" class="app-grouped-list settings-section-card">
          <VList lines="one" class="settings-list">
            <VListItem
              v-for="(app, appIndex) in apps"
              :key="`${header}-${appIndex}-${String(app.to)}`"
              :to="app.to || ''"
              color="primary"
              class="settings-list-item"
              rounded="0"
            >
              <template #prepend>
                <span
                  class="settings-list-icon me-3"
                  :class="`settings-list-icon--tone-${app.iconColor || 'primary'}`"
                  aria-hidden="true"
                >
                  <VIcon :icon="app.icon as string" size="17" />
                </span>
              </template>

              <VListItemTitle class="settings-list-title">
                {{ app.full_title || app.title }}
              </VListItemTitle>

              <VListItemSubtitle v-if="app.description" class="settings-list-subtitle">
                {{ app.description }}
              </VListItemSubtitle>

              <template #append>
                <VIcon class="settings-list-chevron" icon="mdi-chevron-right" size="18" />
              </template>

              <span v-if="appIndex < apps.length - 1" class="settings-list-separator" aria-hidden="true"></span>
            </VListItem>
          </VList>
        </VCard>
      </section>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.app-settings-container {
  inline-size: 100%;
  margin-block: 0;
  margin-inline: auto;
  max-inline-size: 960px;
  overflow-x: hidden;
}

.app-settings-content {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-block: 6px calc(24px + env(safe-area-inset-bottom, 0px));
  padding-inline: 2px;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.settings-section-title {
  margin: 0;
  padding-inline: 4px;
  color: rgba(var(--v-theme-on-surface), 0.48);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.03em;
  line-height: 1.35;
}

.settings-section-card {
  overflow: hidden;
  border: 1px solid var(--mp-border-card);
  border-radius: 12px !important;
  background-color: rgb(var(--v-theme-surface));
  box-shadow: none;
}

.settings-list {
  padding: 0;
  background: transparent;
}

.settings-list-item {
  position: relative;
  min-block-size: 48px;
  min-inline-size: 0;
  padding-block: 9px;
  padding-inline: 12px 10px;
  border-radius: 0 !important;
  transition: background-color 0.14s ease;

  &:hover {
    background-color: rgba(var(--v-theme-on-surface), 0.03);
  }

  &:active {
    background-color: rgba(var(--v-theme-on-surface), 0.06);
  }
}

.settings-list-item :deep(.v-list-item__content) {
  min-inline-size: 0;
  overflow: hidden;
}

.settings-list-separator {
  position: absolute;
  z-index: 2;
  background-color: var(--mp-border-subtle);
  block-size: 1px;
  inset-block-end: 0;
  inset-inline: 56px 0;
  pointer-events: none;
}

.settings-list-icon {
  --app-grouped-list-icon-rgb: var(--v-theme-primary);

  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  block-size: 32px;
  inline-size: 32px;
  border: 1px solid rgba(var(--app-grouped-list-icon-rgb), 0.16);
  border-radius: 8px;
  background: rgba(var(--app-grouped-list-icon-rgb), 0.1);
  color: rgb(var(--app-grouped-list-icon-rgb));
}

.settings-list-icon--tone-info {
  --app-grouped-list-icon-rgb: var(--v-theme-info);
}

.settings-list-icon--tone-success {
  --app-grouped-list-icon-rgb: var(--v-theme-success);
}

.settings-list-icon--tone-warning {
  --app-grouped-list-icon-rgb: var(--v-theme-warning);
}

.settings-list-icon--tone-secondary {
  --app-grouped-list-icon-rgb: var(--v-theme-secondary);
}

.settings-list-title {
  color: rgba(var(--v-theme-on-surface), 0.92);
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.35;
  overflow-wrap: anywhere;
  word-break: normal;
}

.settings-list-subtitle {
  margin-block-start: 2px;
  color: rgba(var(--v-theme-on-surface), 0.54);
  font-size: 11.5px;
  line-height: 1.35;
}

.settings-list-chevron {
  color: rgba(var(--v-theme-on-surface), 0.36);
}

@media (width <= 600px) {
  .app-settings-content {
    gap: 14px;
    padding-block: 4px calc(24px + env(safe-area-inset-bottom, 0px));
    padding-inline: 0;
  }

  .settings-section-card {
    border-radius: 11px !important;
  }

  .settings-list-item {
    min-block-size: 46px;
    padding-block: 8px;
    padding-inline: 12px 10px;
  }
}
</style>
