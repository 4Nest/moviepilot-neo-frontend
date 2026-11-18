import { useShortcutTools } from '@/composables/useShortcutTools'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'

async function probeShortcutGroups() {
  let groups:
    | {
        allIcons: string[]
        menu: string[]
        pinned: string[]
      }
    | undefined
  const Probe = defineComponent({
    setup() {
      const { menuShortcuts, pinnedShortcuts, visibleShortcuts } = useShortcutTools()
      groups = {
        allIcons: visibleShortcuts.value.map(item => item.icon),
        menu: menuShortcuts.value.map(item => item.dialog),
        pinned: pinnedShortcuts.value.map(item => item.dialog),
      }
      return () => null
    },
  })
  await renderWithProviders(Probe)
  return groups
}

describe('useShortcutTools', () => {
  it('识别、词表、日志固定为独立按钮且不出现在捷径菜单，且图标统一为线性风格', async () => {
    const groups = await probeShortcutGroups()

    expect(groups?.pinned).toEqual(['nameTest', 'words', 'logging'])
    expect(groups?.menu).not.toContain('nameTest')
    expect(groups?.menu).not.toContain('words')
    expect(groups?.menu).not.toContain('logging')
    // 其余工具仍保留在菜单中
    expect(groups?.menu).toContain('ruleTest')
    expect(groups?.menu).toContain('cache')

    // 不再出现实心厚重块状图标
    expect(groups?.allIcons).not.toContain('mdi-file-word-box')
    expect(groups?.allIcons).not.toContain('mdi-file-document')
    expect(groups?.allIcons).not.toContain('mdi-database')
    expect(groups?.allIcons).not.toContain('mdi-list-box')
  })
})
