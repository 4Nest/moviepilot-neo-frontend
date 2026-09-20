import type { TextTranslator } from '@/composables/useChineseText'
import type { NavMenu } from '@/@layouts/types'
import type { PluginSidebarNavItem } from '@/api/types'
import { pluginSidebarSectionToHeaderKey } from '@/router/i18n-menu'

export type PluginNavMenuEntry = {
  navMenu: NavMenu
  section: string
}

/**
 * 将后端 sidebar_nav 单项转为侧栏 / 应用中心 共用的 NavMenu
 */
export function navMenuFromPluginSidebarItem(item: PluginSidebarNavItem, t: TextTranslator): NavMenu {
  const section = item.section || 'system'
  const header = pluginSidebarSectionToHeaderKey(section, t)
  return {
    title: item.title,
    icon: item.icon,
    iconColor: 'primary',
    to: {
      name: 'plugin-app',
      params: {
        pluginId: item.plugin_id,
        navKey: item.nav_key,
      },
    },
    header,
  }
}

/**
 * 转换插件导航项，并保留 section 供 DefaultLayout 分栏插入
 */
export function filterPluginSidebarNavEntries(items: PluginSidebarNavItem[], t: TextTranslator): PluginNavMenuEntry[] {
  const out: PluginNavMenuEntry[] = []
  for (const item of items) {
    const section = item.section || 'system'
    const navMenu = navMenuFromPluginSidebarItem(item, t)
    out.push({ navMenu, section })
  }
  return out
}
