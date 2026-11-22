import DiscoverTabOrderDialog, {
  type DiscoverTabOrderSavePayload,
} from '@/components/dialog/DiscoverTabOrderDialog.vue'
import type { DiscoverSource } from '@/api/types'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { defineComponent, h, type PropType } from 'vue'
import { describe, expect, it, vi } from 'vitest'

const dialogSource = readFileSync(resolve(cwd(), 'src/components/dialog/DiscoverTabOrderDialog.vue'), 'utf8')

vi.mock('vuedraggable', async () => {
  const { defineComponent, h } = await import('vue')

  return {
    default: defineComponent({
      name: 'DraggableStub',
      props: {
        modelValue: { type: Array as PropType<DiscoverSource[]>, required: true },
      },
      emits: ['update:modelValue'],
      setup(props, { emit, slots }) {
        return () =>
          h('div', [
            h(
              'button',
              {
                onClick: () => emit('update:modelValue', [...props.modelValue].reverse()),
                type: 'button',
              },
              '反转顺序',
            ),
            ...props.modelValue.map((element, index) => slots.item?.({ element, index })),
          ])
      },
    }),
  }
})

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

function createSource(name: string, prefix: string): DiscoverSource {
  return {
    api_path: `discover/${prefix}`,
    filter_params: { type: prefix },
    filter_ui: [],
    mediaid_prefix: prefix,
    name,
  }
}

async function renderDialog(tabs: DiscoverSource[], enabled?: Record<string, boolean>, defaultTabs?: DiscoverSource[]) {
  const close = vi.fn()
  const save = vi.fn()
  const updateModelValue = vi.fn()
  const result = await renderWithProviders(DiscoverTabOrderDialog, {
    props: {
      defaultTabs,
      enabled,
      modelValue: true,
      onClose: close,
      onSave: save,
      'onUpdate:modelValue': updateModelValue,
      tabs,
    },
    global: {
      components: {
        VDialogCloseBtn: DialogCloseButtonStub,
      },
    },
  })

  return { ...result, close, save, updateModelValue }
}

describe('DiscoverTabOrderDialog', () => {
  it('reorders a shallow local copy and emits tabs with enabled map without mutating parent tabs', async () => {
    const tabs = [createSource('来源甲', 'source-a'), createSource('来源乙', 'source-b')]
    const originalOrder = [...tabs]
    const user = userEvent.setup()
    const { save } = await renderDialog(tabs)

    await user.click(screen.getByRole('button', { name: '反转顺序' }))
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(tabs).toEqual(originalOrder)
    expect(save).toHaveBeenCalledOnce()
    const payload = save.mock.calls[0][0] as DiscoverTabOrderSavePayload
    expect(payload.tabs.map(item => item.mediaid_prefix)).toEqual(['source-b', 'source-a'])
    expect(payload.enabled).toEqual({ 'source-a': true, 'source-b': true })
    expect(payload.tabs[0]).not.toBe(tabs[1])
    expect(payload.tabs[0].filter_params).toStrictEqual(tabs[1].filter_params)
  })

  it('toggles visibility switches, hides badge on disabled items, prevents saving zero enabled tabs, and resets both order and switches', async () => {
    const tabs = [createSource('来源甲', 'source-a'), createSource('来源乙', 'source-b')]
    const user = userEvent.setup()
    const { save } = await renderDialog(tabs, { 'source-a': true, 'source-b': false })

    const switchA = screen.getByRole('checkbox', { name: '来源甲' }) as HTMLInputElement
    const switchB = screen.getByRole('checkbox', { name: '来源乙' }) as HTMLInputElement
    expect(switchA.checked).toBe(true)
    expect(switchB.checked).toBe(false)
    expect(screen.getByTestId('discover-enabled-count')).toHaveTextContent('已启用 1 / 共 2 个')
    expect(document.querySelectorAll('.setting-order-badge')).toHaveLength(1)

    await user.click(switchA)
    await user.click(screen.getByRole('button', { name: '反转顺序' }))
    expect(switchA.checked).toBe(false)
    expect(document.querySelectorAll('.setting-order-badge')).toHaveLength(0)
    expect(screen.getByTestId('discover-keep-one-warning')).toHaveTextContent('请至少保留 1 个启用的探索源')
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '重置' }))
    expect(switchA.checked).toBe(true)
    expect(switchB.checked).toBe(false)

    await user.click(switchB)
    await user.click(screen.getByRole('button', { name: '保存' }))

    const payload = save.mock.calls[0][0] as DiscoverTabOrderSavePayload
    expect(payload.tabs.map(item => item.mediaid_prefix)).toEqual(['source-a', 'source-b'])
    expect(payload.enabled).toEqual({ 'source-a': true, 'source-b': true })
  })

  it('distinguishes built-in vs plugin badges and supports enable-all and restore-default actions', async () => {
    const defaultTabs = [
      createSource('TheMovieDb', 'themoviedb'),
      createSource('哔哩哔哩', 'bilibili'),
      createSource('第三方榜单', 'ext-plugin'),
    ]
    const reorderedTabs = [defaultTabs[2], defaultTabs[0], defaultTabs[1]]
    const user = userEvent.setup()
    const { save } = await renderDialog(
      reorderedTabs,
      { themoviedb: true, bilibili: false, 'ext-plugin': false },
      defaultTabs,
    )

    expect(screen.getByTestId('discover-enabled-count')).toHaveTextContent('已启用 1 / 共 3 个')
    expect(screen.getAllByText('内置')).toHaveLength(2)
    expect(screen.getAllByText('扩展插件')).toHaveLength(1)

    // 点击「全部开启」开启所有开关，保持当前顺序
    await user.click(screen.getByRole('button', { name: '全部开启' }))
    expect(screen.getByTestId('discover-enabled-count')).toHaveTextContent('已启用 3 / 共 3 个')

    // 点击「恢复默认」恢复默认排序且全部开启
    await user.click(screen.getByRole('checkbox', { name: '哔哩哔哩' }))
    await user.click(screen.getByRole('button', { name: '恢复默认' }))
    expect(screen.getByTestId('discover-enabled-count')).toHaveTextContent('已启用 3 / 共 3 个')

    await user.click(screen.getByRole('button', { name: '保存' }))
    const payload = save.mock.calls[0][0] as DiscoverTabOrderSavePayload
    expect(payload.tabs.map(item => item.mediaid_prefix)).toEqual(['themoviedb', 'bilibili', 'ext-plugin'])
    expect(payload.enabled).toEqual({ themoviedb: true, bilibili: true, 'ext-plugin': true })
  })

  it('resets the local order when the tabs prop changes', async () => {
    const user = userEvent.setup()
    const { rerender, save } = await renderDialog([
      createSource('来源甲', 'source-a'),
      createSource('来源乙', 'source-b'),
    ])
    await user.click(screen.getByRole('button', { name: '反转顺序' }))

    await rerender({
      modelValue: true,
      tabs: [createSource('来源丙', 'source-c'), createSource('来源丁', 'source-d')],
    })
    await user.click(screen.getByRole('button', { name: '保存' }))

    const payload = save.mock.calls[0][0] as DiscoverTabOrderSavePayload
    expect(payload.tabs.map(item => item.mediaid_prefix)).toEqual(['source-c', 'source-d'])
    expect(payload.enabled).toEqual({ 'source-c': true, 'source-d': true })
  })

  it('emits both model closure and close from the close control', async () => {
    const user = userEvent.setup()
    const { close, updateModelValue } = await renderDialog([createSource('来源甲', 'source-a')])

    await user.click(screen.getByRole('button', { name: '关闭' }))

    expect(updateModelValue).toHaveBeenCalledOnce()
    expect(updateModelValue).toHaveBeenCalledWith(false)
    expect(close).toHaveBeenCalledOnce()
  })

  it('emits only save payload when saving', async () => {
    const user = userEvent.setup()
    const { close, save, updateModelValue } = await renderDialog([createSource('来源甲', 'source-a')])

    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(save).toHaveBeenCalledOnce()
    expect(close).not.toHaveBeenCalled()
    expect(updateModelValue).not.toHaveBeenCalled()
  })

  it('removes left accent bar, widens dialog to 44rem, and supports cancel action', async () => {
    expect(dialogSource).not.toContain('.setting-item::before')
    expect(dialogSource).toContain('max-width="44rem"')

    const user = userEvent.setup()
    const { close, updateModelValue } = await renderDialog([
      createSource('Bangumi每日放送', 'bgm'),
      createSource('TMDB热门电视剧', 'tmdb_tv'),
    ])

    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(updateModelValue).toHaveBeenCalledWith(false)
    expect(close).toHaveBeenCalledOnce()
  })
})
