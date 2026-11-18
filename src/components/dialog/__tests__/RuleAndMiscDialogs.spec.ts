import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import CustomRuleInfoDialog from '@/components/dialog/CustomRuleInfoDialog.vue'
import FileNewFolderDialog from '@/components/dialog/FileNewFolderDialog.vue'
import FilterRuleGroupInfoDialog from '@/components/dialog/FilterRuleGroupInfoDialog.vue'
import OTPAuthDialog from '@/components/dialog/OTPAuthDialog.vue'
import PluginCloneDialog from '@/components/dialog/PluginCloneDialog.vue'
import PluginFolderCreateDialog from '@/components/dialog/PluginFolderCreateDialog.vue'
import PluginFolderRenameDialog from '@/components/dialog/PluginFolderRenameDialog.vue'
import PluginLogDialog from '@/components/dialog/PluginLogDialog.vue'
import PluginSearchDialog from '@/components/dialog/PluginSearchDialog.vue'
import SearchSiteDialog from '@/components/dialog/SearchSiteDialog.vue'
import TransferHistoryDeleteDialog from '@/components/dialog/TransferHistoryDeleteDialog.vue'
import UserAuthDialog from '@/components/dialog/UserAuthDialog.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  openSharedDialog: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
  },
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
  }),
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

describe('Rule, Plugin, File & Auth Dialogs Fixes', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.openSharedDialog.mockReset()
    mocks.toastError.mockReset()
    mocks.toastInfo.mockReset()
    mocks.toastSuccess.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('CustomRuleInfoDialog shows error toast when either id or name is missing', async () => {
    const onChange = vi.fn()
    await renderWithProviders(CustomRuleInfoDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: {
        modelValue: true,
        rule: { id: 'myrule', name: '' },
        rules: [],
        onChange,
      },
    })

    await fireEvent.click(screen.getByRole('button', { name: '确定' }))
    expect(mocks.toastError).toHaveBeenCalledOnce()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('FilterRuleGroupInfoDialog preserves custom rule IDs without padding spaces and clears mismatched category on media_type switch', async () => {
    let capturedSaveHandler: ((type: string, code: { value: string }) => void) | undefined
    mocks.openSharedDialog.mockImplementation(
      (
        _comp: unknown,
        _props: unknown,
        listeners?: Record<string, (type: string, code: { value: string }) => void>,
      ) => {
        capturedSaveHandler = listeners?.save
        return { close: vi.fn(), updateProps: vi.fn() }
      },
    )

    const onChange = vi.fn()
    await renderWithProviders(FilterRuleGroupInfoDialog, {
      global: {
        components: { VDialogCloseBtn: DialogCloseBtn },
        stubs: {
          Draggable: {
            props: ['modelValue'],
            template: '<div><div v-for="el in modelValue" :key="el.pri">{{ JSON.stringify(el.rules) }}</div></div>',
          },
        },
      },
      props: {
        modelValue: true,
        group: { name: '动漫组', rule_string: '', media_type: '电影', category: '华语电影' },
        groups: [],
        categories: {
          电影: [{ title: '华语电影', value: '华语电影' }],
          电视剧: [{ title: '日番', value: '日番' }],
        },
        custom_rules: [{ id: 'customA', name: '自定义A' }],
        onChange,
      },
    })

    // 导入包含内置规则与自定义规则的混合规则串
    const importButtons = document.querySelectorAll('.app-dialog-actions__icon-btn')
    await fireEvent.click(importButtons[1])
    expect(capturedSaveHandler).toBeTypeOf('function')
    capturedSaveHandler!('priority', { value: 'SPECSUB&customA>!720P&customB' })
    await flushPromises()

    // 切换媒体类型到电视剧，原「华语电影」不属于电视剧分类，应自动清空
    const user = userEvent.setup()
    await user.click(screen.getByLabelText('媒体类型'))
    await user.click(await screen.findByRole('option', { name: '电视剧' }))
    await flushPromises()

    await fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(onChange).toHaveBeenCalledOnce()
    const savedGroup = onChange.mock.calls[0][0]
    expect(savedGroup.rule_string).toBe(' SPECSUB &customA> !720P &customB')
    expect(savedGroup.category).toBe('')
  })

  it('PluginCloneDialog validates form rules and blocks invalid suffix formats', async () => {
    const onClone = vi.fn()
    await renderWithProviders(PluginCloneDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: {
        modelValue: true,
        plugin: { id: 'Demo', plugin_name: '演示插件', plugin_version: '1.0' },
        onClone,
      },
    })

    const suffixInput = screen.getByLabelText(/分身后缀|suffix/i)
    await fireEvent.update(suffixInput, 'bad-suffix!')
    await fireEvent.click(screen.getByRole('button', { name: /创建分身/ }))
    await flushPromises()
    expect(onClone).not.toHaveBeenCalled()

    await fireEvent.update(suffixInput, 'clone2')
    await fireEvent.click(screen.getByRole('button', { name: /创建分身/ }))
    await waitFor(() => expect(onClone).toHaveBeenCalledOnce())
  })

  it('TransferHistoryDeleteDialog applies semantic danger hierarchy across delete buttons', async () => {
    await renderWithProviders(TransferHistoryDeleteDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: { modelValue: true, title: '确认删除整理记录' },
    })

    const recordOnlyBtn = screen.getByRole('button', { name: '仅删除转移记录' })
    const srcOnlyBtn = screen.getByRole('button', { name: '删除转移记录和源文件' })
    const destOnlyBtn = screen.getByRole('button', { name: '删除转移记录和媒体库文件' })
    const allBtn = screen.getByRole('button', { name: '删除转移记录、源文件和媒体库文件' })

    expect(recordOnlyBtn.className).toContain('v-btn--variant-outlined')
    expect(srcOnlyBtn.className).toContain('text-warning')
    expect(srcOnlyBtn.className).toContain('v-btn--variant-tonal')
    expect(destOnlyBtn.className).toContain('text-warning')
    expect(destOnlyBtn.className).toContain('v-btn--variant-tonal')
    expect(allBtn.className).toContain('bg-error')
    expect(allBtn.className).toContain('v-btn--variant-flat')
  })

  it('PluginFolderCreateDialog, PluginFolderRenameDialog, and FileNewFolderDialog guard blank names and loading state', async () => {
    const onCreatePluginFolder = vi.fn()
    const { unmount: u1 } = await renderWithProviders(PluginFolderCreateDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: { modelValue: true, name: '   ', onCreate: onCreatePluginFolder },
    })
    expect(screen.getByRole('button', { name: '创建' })).toBeDisabled()
    u1()

    const onRenamePluginFolder = vi.fn()
    const { unmount: u2 } = await renderWithProviders(PluginFolderRenameDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: { modelValue: true, folderName: '   ', onRename: onRenamePluginFolder },
    })
    expect(screen.getByRole('button', { name: '确认' })).toBeDisabled()
    u2()

    const onCreateFileFolder = vi.fn()
    await renderWithProviders(FileNewFolderDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: { modelValue: true, name: '   ', loading: false, onCreate: onCreateFileFolder },
    })
    const input = screen.getByLabelText('名称')
    await fireEvent.keyUp(input, { key: 'Enter' })
    expect(mocks.toastError).toHaveBeenCalledWith('请输入名称')
    expect(onCreateFileFolder).not.toHaveBeenCalled()
  })

  it('SearchSiteDialog renders siteFilter input and uses retry label on empty site state', async () => {
    const onReload = vi.fn()
    const { rerender } = await renderWithProviders(SearchSiteDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: { modelValue: true, sites: [], selected: [], onReload },
    })

    const retryBtn = screen.getByRole('button', { name: '重试' })
    await fireEvent.click(retryBtn)
    expect(onReload).toHaveBeenCalledOnce()

    await rerender({
      modelValue: true,
      sites: [
        { id: 1, name: 'AlphaSite', domain: 'a.com', url: 'https://a.com' } as unknown as never,
        { id: 2, name: 'BetaSite', domain: 'b.com', url: 'https://b.com' } as unknown as never,
      ],
      selected: [1],
    })
    const filterInput = screen.getByPlaceholderText('筛选')
    await fireEvent.update(filterInput, 'Beta')
    expect(screen.queryByText('AlphaSite')).not.toBeInTheDocument()
    expect(screen.getByText('BetaSite')).toBeInTheDocument()
  })

  it('PluginSearchDialog shows empty hint when no plugins match and PluginLogDialog keys LoggingView by plugin id', async () => {
    const { unmount } = await renderWithProviders(PluginSearchDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: { modelValue: true, keyword: 'none', plugins: [] },
    })
    expect(screen.getByText('没有符合条件的数据')).toBeInTheDocument()
    unmount()

    let mountCount = 0
    const LoggingViewStub = defineComponent({
      name: 'LoggingView',
      props: { logfile: String },
      setup(props) {
        mountCount += 1
        return () => h('div', { 'data-testid': 'logging-view' }, `${mountCount}:${props.logfile}`)
      },
    })

    const { rerender } = await renderWithProviders(PluginLogDialog, {
      global: {
        components: { VDialogCloseBtn: DialogCloseBtn },
        stubs: { LoggingView: LoggingViewStub },
      },
      props: { modelValue: true, plugin: { id: 'PluginOne', plugin_name: '插件一' } },
    })
    expect(await screen.findByTestId('logging-view')).toHaveTextContent('1:plugins/pluginone.log')

    await rerender({ modelValue: true, plugin: { id: 'PluginTwo', plugin_name: '插件二' } })
    expect(await screen.findByTestId('logging-view')).toHaveTextContent('2:plugins/plugintwo.log')
  })

  it('UserAuthDialog and OTPAuthDialog render standard VCardActions with cancel and loading state', async () => {
    mocks.apiGet.mockResolvedValue({})
    const onAuthClose = vi.fn()
    const { unmount } = await renderWithProviders(UserAuthDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: { modelValue: true, onClose: onAuthClose },
    })
    await fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onAuthClose).toHaveBeenCalledOnce()
    unmount()

    mocks.apiPost.mockResolvedValue({ success: true, data: { uri: 'otpauth://totp/mp?secret=ABC', secret: 'ABC' } })
    await renderWithProviders(OTPAuthDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: { modelValue: true, isOtp: false },
    })
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith('mfa/otp/generate'))
    expect(document.querySelector('.v-card-actions')).not.toBeNull()
  })
})
