import type { PluginSidebarNavItem } from '@/api/types'
import { filterPluginSidebarNavEntries, navMenuFromPluginSidebarItem } from '@/utils/pluginSidebarNav'
import type { Composer } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

const t = ((key: string) => key) as Composer['t']

function createNavItem(overrides: Partial<PluginSidebarNavItem> = {}): PluginSidebarNavItem {
  return {
    icon: 'mdi-puzzle-outline',
    nav_key: 'main',
    order: 1,
    plugin_id: 'demo',
    section: 'system',
    title: 'Demo',
    ...overrides,
  }
}

describe('plugin sidebar navigation utilities', () => {
  it('projects stable route params into a shared menu entry', () => {
    const menu = navMenuFromPluginSidebarItem(createNavItem({ nav_key: 'settings', plugin_id: 'workflow' }), t)

    expect(menu).toMatchObject({
      header: 'menu.system',
      to: {
        name: 'plugin-app',
        params: { navKey: 'settings', pluginId: 'workflow' },
      },
    })
  })

  it('defaults an omitted section to system', () => {
    const item = {
      icon: 'mdi-puzzle-outline',
      nav_key: 'main',
      order: 1,
      plugin_id: 'demo',
      title: 'Demo',
    } satisfies Omit<PluginSidebarNavItem, 'section'>

    const [entry] = filterPluginSidebarNavEntries([item as PluginSidebarNavItem], t)

    expect(entry.section).toBe('system')
    expect(entry.navMenu.header).toBe('menu.system')
  })

  it('keeps the declared section for layout placement independently of its translated header', () => {
    const [entry] = filterPluginSidebarNavEntries([createNavItem({ plugin_id: 'discover-demo', section: 'discovery' })], t)

    expect(entry.section).toBe('discovery')
    expect(entry.navMenu.header).toBe('menu.discovery')
  })
})
