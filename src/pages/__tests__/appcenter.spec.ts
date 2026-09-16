import AppCenter from '@/pages/appcenter.vue'
import type { PluginSidebarNavItem } from '@/api/types'
import { usePluginSidebarNavStore } from '@/stores/pluginSidebarNav'
import { screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { server } from '@tests/support/msw/server'
import { http, HttpResponse } from 'msw'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'

const SIDEBAR_NAV_URL = 'http://localhost/api/v1/plugin/sidebar_nav'

const ListItemStub = defineComponent({
  name: 'VListItem',
  setup(_, { slots }) {
    return () => h('div', [slots.prepend?.(), slots.default?.(), slots.append?.()])
  },
})

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

function sidebarNavHandler(items: PluginSidebarNavItem[]) {
  return http.get(SIDEBAR_NAV_URL, () => HttpResponse.json(items))
}

async function renderAppCenter(items: PluginSidebarNavItem[]) {
  server.use(sidebarNavHandler(items))
  return renderWithProviders(AppCenter, {
    global: {
      stubs: {
        VListItem: ListItemStub,
      },
    },
    initialRoute: '/apps',
    stubActions: false,
  })
}

describe('app center plugin navigation', () => {
  it('renders every plugin nav entry from the shared snapshot', async () => {
    await renderAppCenter([
      createNavItem({ plugin_id: 'open', title: 'Open plugin' }),
      createNavItem({ plugin_id: 'another', title: 'Another plugin' }),
    ])

    expect(await screen.findByText('Open plugin')).toBeInTheDocument()
    expect(screen.getByText('Another plugin')).toBeInTheDocument()
  })

  it('updates an already mounted consumer after the shared snapshot is force-refreshed', async () => {
    await renderAppCenter([createNavItem({ plugin_id: 'old', title: 'Old plugin' })])
    expect(await screen.findByText('Old plugin')).toBeInTheDocument()

    server.use(sidebarNavHandler([createNavItem({ plugin_id: 'new', title: 'New plugin' })]))
    await usePluginSidebarNavStore().ensureSidebarNav(true)

    await waitFor(() => {
      expect(screen.getByText('New plugin')).toBeInTheDocument()
      expect(screen.queryByText('Old plugin')).not.toBeInTheDocument()
    })
  })
})
