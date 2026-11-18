import ContentToggleSettingsDialog from '@/components/dialog/ContentToggleSettingsDialog.vue'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'

const dialogSource = readFileSync(resolve(cwd(), 'src/components/dialog/ContentToggleSettingsDialog.vue'), 'utf8')

const DialogCloseButtonStub = defineComponent({
  name: 'VDialogCloseBtn',
  props: {
    modelValue: { type: Boolean, default: true },
  },
  emits: ['update:modelValue'],
  setup(_props, { emit }) {
    return () => h('button', { onClick: () => emit('update:modelValue', false), type: 'button' }, '关闭')
  },
})

async function renderDialog(overrides: Record<string, unknown> = {}) {
  const close = vi.fn()
  const save = vi.fn()
  const updateModelValue = vi.fn()
  const result = await renderWithProviders(ContentToggleSettingsDialog, {
    props: {
      colors: { bgm: '#7c3aed', tmdb_tv: '#10b981' },
      enabled: { bgm: true, tmdb_tv: false, anilist: true },
      hint: '选择要显示的推荐栏目',
      items: [
        { id: 'bgm', title: 'Bangumi每日放送' },
        { id: 'tmdb_tv', title: 'TMDB热门电视剧' },
        { id: 'anilist', title: 'AniList 当前趋势' },
      ],
      modelValue: true,
      onClose: close,
      onSave: save,
      'onUpdate:modelValue': updateModelValue,
      selectAllText: '全选',
      selectNoneText: '全不选',
      showBulkActions: true,
      title: '自定义推荐',
      ...overrides,
    },
    global: {
      components: {
        VDialogCloseBtn: DialogCloseButtonStub,
      },
    },
  })

  return { ...result, close, save, updateModelValue }
}

describe('ContentToggleSettingsDialog', () => {
  it('removes left accent bar and traffic-light bulk button colors while widening dialog to 44rem', () => {
    expect(dialogSource).not.toContain('.setting-item::before')
    expect(dialogSource).toContain('max-width="44rem"')
    expect(dialogSource).not.toContain('color="success"')
    expect(dialogSource).not.toContain('color="warning"')
  })

  it('toggles items cleanly, supports neutral bulk actions, and emits cancel/save properly', async () => {
    const user = userEvent.setup()
    const { close, save, updateModelValue } = await renderDialog()

    const bgmBtn = screen.getByRole('button', { name: 'Bangumi每日放送' })
    const tmdbBtn = screen.getByRole('button', { name: 'TMDB热门电视剧' })
    expect(bgmBtn).toHaveAttribute('aria-pressed', 'true')
    expect(tmdbBtn).toHaveAttribute('aria-pressed', 'false')

    await user.click(tmdbBtn)
    expect(tmdbBtn).toHaveAttribute('aria-pressed', 'true')

    const selectNoneBtn = screen.getByRole('button', { name: '全不选' })
    const selectAllBtn = screen.getByRole('button', { name: '全选' })
    const cancelBtn = screen.getByRole('button', { name: '取消' })
    expect(selectNoneBtn).not.toHaveClass('text-warning')
    expect(selectNoneBtn).not.toHaveClass('text-primary')
    expect(selectAllBtn).not.toHaveClass('text-success')
    expect(selectAllBtn).not.toHaveClass('text-primary')
    expect(cancelBtn).not.toHaveClass('text-primary')

    await user.click(selectNoneBtn)
    expect(bgmBtn).toHaveAttribute('aria-pressed', 'false')
    expect(tmdbBtn).toHaveAttribute('aria-pressed', 'false')

    await user.click(selectAllBtn)
    expect(bgmBtn).toHaveAttribute('aria-pressed', 'true')
    expect(tmdbBtn).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(save).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledWith({
      elevated: false,
      enabled: { bgm: true, tmdb_tv: true, anilist: true },
    })

    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(updateModelValue).toHaveBeenCalledWith(false)
    expect(close).toHaveBeenCalledOnce()
  })
})
