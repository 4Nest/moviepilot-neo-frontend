import { useShortcutTools } from '@/composables/useShortcutTools'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'

async function probeShortcutGroups() {
  let groups: { menu: string[]; pinned: string[] } | undefined
  const Probe = defineComponent({
    setup() {
      const { menuShortcuts, pinnedShortcuts } = useShortcutTools()
      groups = {
        menu: menuShortcuts.value.map(item => item.dialog),
        pinned: pinnedShortcuts.value.map(item => item.dialog),
      }
      return () => null
    },
  })
  await renderWithProviders(Probe, {
    initialState: {
      user: {
        superUser: true,
        permissions: {},
      },
    },
  })
  return groups
}

describe('useShortcutTools', () => {
  it('识别、词表、日志固定为独立按钮且不出现在捷径菜单', async () => {
    const groups = await probeShortcutGroups()

    expect(groups?.pinned).toEqual(['nameTest', 'words', 'logging'])
    expect(groups?.menu).not.toContain('nameTest')
    expect(groups?.menu).not.toContain('words')
    expect(groups?.menu).not.toContain('logging')
    // 其余工具仍保留在菜单中
    expect(groups?.menu).toContain('ruleTest')
    expect(groups?.menu).toContain('cache')
  })
})
