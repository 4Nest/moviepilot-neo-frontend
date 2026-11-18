import AccountSettingRule from '@/views/setting/AccountSettingRule.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  confirm: vi.fn(),
  importSaveHandler: undefined as ((type: string, code: { value: string }) => void) | undefined,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}))

vi.mock('@/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    default: {
      get: mocks.apiGet,
      post: mocks.apiPost,
    },
  }
})

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
  }),
}))

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => mocks.confirm,
}))

vi.mock('@/composables/useSilentSettingRefresh', () => ({
  useSilentSettingRefresh: vi.fn(),
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (
    _comp: unknown,
    _props: unknown,
    listeners?: { save?: (type: string, code: { value: string }) => void },
  ) => {
    if (listeners?.save) mocks.importSaveHandler = listeners.save
    return { close: vi.fn(), updateProps: vi.fn() }
  },
}))

vi.mock('vuedraggable', async () => {
  const { defineComponent } = await import('vue')
  return {
    default: defineComponent({
      props: ['modelValue', 'itemKey'],
      template:
        '<div data-testid="draggable" :data-item-key="typeof itemKey === `function` ? `fn` : itemKey"><slot v-for="element in modelValue" name="item" :element="element" /></div>',
    }),
  }
})

describe('AccountSettingRule', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.confirm.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.toastWarning.mockReset()
    mocks.importSaveHandler = undefined

    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'media/category') return Promise.resolve({})
      if (url === 'system/setting/CustomFilterRules') {
        return Promise.resolve({
          data: { value: [{ id: 'R1', name: '已有规则' }] },
        })
      }
      if (url === 'system/setting/UserFilterRuleGroups') {
        return Promise.resolve({
          data: { value: [{ name: '已有规则组', rule_string: 'R1', media_type: '', category: '' }] },
        })
      }
      if (url === 'system/setting/TorrentsPriority') {
        return Promise.resolve({ data: { value: null } })
      }
      return Promise.resolve({ data: {} })
    })
    mocks.apiPost.mockResolvedValue({ success: true })
  })

  it('requires confirmation before clearing rules, filters duplicate id/name on import, and uses stable Draggable keys', async () => {
    await renderWithProviders(AccountSettingRule)
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('system/setting/CustomFilterRules'))

    const draggables = await screen.findAllByTestId('draggable')
    expect(draggables[0].getAttribute('data-item-key')).toBe('id')
    expect(draggables[1].getAttribute('data-item-key')).toBe('fn')

    // 导入包含冲突 id / name 的自定义规则时过滤冲突项并提示
    const moreBtns = screen.getAllByRole('button', { name: '更多操作' })
    await fireEvent.click(moreBtns[0])
    const importItem = await screen.findByText('导入')
    await fireEvent.click(importItem)

    expect(mocks.importSaveHandler).toBeTypeOf('function')
    mocks.importSaveHandler!('custom', {
      value: JSON.stringify([
        { id: 'R1', name: '冲突ID规则' },
        { id: 'R2', name: '已有规则' },
        { id: 'R3', name: '全新规则' },
      ]),
    })
    expect(mocks.toastWarning).toHaveBeenCalled()

    // 点击清空：取消确认时保留规则，确认后才清空
    mocks.confirm.mockResolvedValueOnce(false)
    await fireEvent.click(moreBtns[0])
    await fireEvent.click(await screen.findByText('清空'))
    expect(mocks.confirm).toHaveBeenCalledOnce()
    expect(screen.getByText('全新规则')).toBeInTheDocument()

    mocks.confirm.mockResolvedValueOnce(true)
    await fireEvent.click(moreBtns[0])
    await fireEvent.click(await screen.findByText('清空'))
    await waitFor(() => {
      expect(screen.queryByText('全新规则')).not.toBeInTheDocument()
    })

    // TorrentsPriority 为 null 时兜底为空数组可正常保存
    const saveBtns = screen.getAllByRole('button', { name: '保存' })
    await fireEvent.click(saveBtns[2])
    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/TorrentsPriority', [])
    })
  })
})
