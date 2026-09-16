import SharedDialogHost from '@/components/dialog/SharedDialogHost.vue'
import { closeSharedDialog } from '@/composables/useSharedDialog'
import AccountSettingDirectory from '@/views/setting/AccountSettingDirectory.vue'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: mocks.apiGet,
    post: mocks.apiPost,
  },
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    success: mocks.toastSuccess,
  }),
}))

vi.mock('@/composables/useSilentSettingRefresh', () => ({
  useSilentSettingRefresh: vi.fn(),
}))

vi.mock('@/components/cards/DirectoryCard.vue', async () => {
  const { defineComponent } = await import('vue')
  return { default: defineComponent({ name: 'DirectoryCardStub', template: '<div />' }) }
})

vi.mock('@/components/cards/StorageCard.vue', async () => {
  const { defineComponent } = await import('vue')
  return { default: defineComponent({ name: 'StorageCardStub', template: '<div />' }) }
})

vi.mock('vuedraggable', async () => {
  const { defineComponent, h } = await import('vue')

  return {
    default: defineComponent({
      name: 'DraggableStub',
      setup(_props, { slots }) {
        return () => h('div', slots.default?.())
      },
    }),
  }
})

const AceEditorStub = defineComponent({
  name: 'VAceEditor',
  props: {
    value: { type: String, default: '' },
  },
  template: '<div />',
})

function mockSettings(settingValue: boolean | null) {
  mocks.apiGet.mockImplementation((endpoint: string) => {
    if (endpoint === 'system/setting/public/Directories') return { data: { value: [] } }
    if (endpoint === 'system/setting/public/Storages') return { data: { value: [] } }
    if (endpoint === 'media/category') return {}
    if (endpoint === 'system/env') return { data: {}, success: true }
    if (endpoint === 'system/setting/MountedLocalDiskDeleteEmptyDirs') {
      return { data: { value: settingValue }, success: true }
    }
    throw new Error(`Unexpected GET ${endpoint}`)
  })
  mocks.apiPost.mockResolvedValue({ success: true })
}

async function renderDirectorySettings() {
  return renderWithProviders(AccountSettingDirectory, {
    global: {
      stubs: {
        VAceEditor: AceEditorStub,
      },
    },
  })
}

vi.mock('@/components/dialog/CategoryEditDialog.vue', async () => {
  const { defineComponent, h } = await import('vue')
  // 分类弹窗替身:模拟原文保存(仅 emit save)与可视化保存(emit save + close)两条路径
  // __esModule 确保 defineAsyncComponent 正确解包 default 导出
  return {
    __esModule: true,
    default: defineComponent({
      name: 'CategoryEditDialogStub',
      emits: ['close', 'save'],
      setup(_, { emit }) {
        return () =>
          h('div', { 'data-testid': 'category-edit-dialog-stub' }, [
            h('button', { onClick: () => emit('save') }, '仅保存原文'),
            h(
              'button',
              {
                onClick: () => {
                  emit('save')
                  emit('close')
                },
              },
              '可视化保存',
            ),
          ])
      },
    }),
  }
})

describe('mounted local disk empty directory cleanup setting', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
  })

  it('defaults to enabled when no saved value exists', async () => {
    mockSettings(null)

    await renderDirectorySettings()

    expect(await screen.findByRole('checkbox', { name: '挂载盘删除空目录' })).toBeChecked()
  })

  it('saves the disabled value with the organization settings', async () => {
    mockSettings(true)
    await renderDirectorySettings()
    const cleanupSwitch = await screen.findByRole('checkbox', { name: '挂载盘删除空目录' })
    await fireEvent.click(cleanupSwitch)

    const organizeCard = screen.getByText('整理 & 刮削').closest('.v-card')
    expect(organizeCard).not.toBeNull()
    await fireEvent.click(within(organizeCard as HTMLElement).getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/MountedLocalDiskDeleteEmptyDirs', false)
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('整理选项设置保存成功')
  })

  it('keeps rename changes local until the organize settings are saved', async () => {
    mockSettings(true)
    await renderDirectorySettings()
    await screen.findByRole('button', { name: '重置默认' })
    mocks.apiPost.mockClear()

    await fireEvent.click(screen.getByRole('button', { name: '重置默认' }))

    expect(mocks.apiPost).not.toHaveBeenCalled()

    const organizeCard = screen.getByText('整理 & 刮削').closest('.v-card')
    expect(organizeCard).not.toBeNull()
    await fireEvent.click(within(organizeCard as HTMLElement).getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenCalledWith(
        'system/env',
        expect.objectContaining({
          MOVIE_RENAME_FORMAT: expect.stringContaining('{{title}}'),
          TV_RENAME_FORMAT: null,
        }),
      )
    })
  })
})

describe('分类策略弹窗关闭行为', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
  })

  afterEach(() => {
    closeSharedDialog()
  })

  async function openCategoryDialogStub() {
    mockSettings(null)
    const wrapper = defineComponent({
      components: { AccountSettingDirectory, SharedDialogHost },
      template: '<div><AccountSettingDirectory /><SharedDialogHost /></div>',
    })
    renderWithProviders(wrapper, {
      global: {
        stubs: {
          VAceEditor: AceEditorStub,
        },
      },
    })
    await fireEvent.click(await screen.findByRole('button', { name: '分类策略' }))
    return screen.findByTestId('category-edit-dialog-stub')
  }

  it('原文保存仅触发 save 事件时弹窗保持打开并刷新分类配置', async () => {
    const stub = await openCategoryDialogStub()
    mocks.apiGet.mockClear()

    await fireEvent.click(within(stub).getByRole('button', { name: '仅保存原文' }))

    await waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledWith('media/category')
    })
    expect(screen.getByTestId('category-edit-dialog-stub')).toBeInTheDocument()
  })

  it('可视化保存触发 save + close 事件后弹窗关闭', async () => {
    const stub = await openCategoryDialogStub()

    await fireEvent.click(within(stub).getByRole('button', { name: '可视化保存' }))

    await waitFor(() => {
      expect(screen.queryByTestId('category-edit-dialog-stub')).not.toBeInTheDocument()
    })
    expect(mocks.apiGet).toHaveBeenCalledWith('media/category')
  })
})
