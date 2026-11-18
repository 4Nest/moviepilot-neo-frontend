import AccountSettingSystem from '@/views/setting/AccountSettingSystem.vue'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { computed } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
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
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
  }),
}))

vi.mock('@/composables/useSilentSettingRefresh', () => ({
  useSilentSettingRefresh: vi.fn(),
}))

vi.mock('vuetify', async importOriginal => {
  const actual = await importOriginal<typeof import('vuetify')>()
  return {
    ...actual,
    useDisplay: () => ({
      mdAndUp: computed(() => true),
      smAndDown: computed(() => false),
    }),
  }
})

vi.mock('vuedraggable', async () => {
  const { defineComponent } = await import('vue')
  return {
    default: defineComponent({
      props: ['modelValue'],
      template: '<div><slot v-for="element in modelValue" name="item" :element="element" /></div>',
    }),
  }
})

describe('AccountSettingSystem 高级设置双栏面板', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()

    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint === 'system/setting/Downloaders') return Promise.resolve({ data: { value: [] } })
      if (endpoint === 'system/setting/MediaServers') return Promise.resolve({ data: { value: [] } })
      if (endpoint === 'system/setting/ScrapingSwitchs') return Promise.resolve({ success: true, data: { value: {} } })
      if (endpoint === 'system/env') {
        return Promise.resolve({
          success: true,
          data: {
            DB_TYPE: 'sqlite',
            GLOBAL_IMAGE_CACHE: false,
            RUST_ACCEL_AVAILABLE: true,
            RUST_ACCEL: false,
          },
        })
      }
      return Promise.resolve({ success: true, data: {} })
    })
    mocks.apiPost.mockResolvedValue({ success: true })
  })

  it('打开双栏高级设置弹窗，支持切换分类、修改分组开关行并保存或取消', async () => {
    await renderWithProviders(AccountSettingSystem, {
      global: {
        stubs: {
          VDialogCloseBtn: {
            emits: ['click'],
            template: '<button type="button" aria-label="关闭" @click="$emit(`click`)" />',
          },
        },
      },
    })

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('system/env'))
    await fireEvent.click(screen.getByRole('button', { name: /高级设置/ }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog.querySelector('.advanced-settings-nav')).not.toBeNull()
    expect(dialog.querySelector('.setting-group-card')).not.toBeNull()

    const cacheSwitch = within(dialog).getByRole('checkbox', { name: '全局图片缓存' })
    expect(cacheSwitch).not.toBeChecked()
    await fireEvent.click(cacheSwitch)
    expect(cacheSwitch).toBeChecked()

    await fireEvent.click(within(dialog).getByRole('tab', { name: /媒体/ }))
    await fireEvent.click(within(dialog).getByText('刮削开关设置'))
    expect(dialog.querySelector('.v-btn-toggle')).toBeNull()
    const movieNfoGroup = await within(dialog).findByRole('radiogroup', { name: '电影 - NFO' })
    await fireEvent.click(within(movieNfoGroup).getByRole('radio', { name: /覆盖/ }))

    await fireEvent.click(within(dialog).getByRole('tab', { name: /实验室/ }))
    const rustSwitch = within(dialog).getByRole('checkbox', { name: /Rust/i })
    await fireEvent.click(rustSwitch)

    await fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenCalledWith(
        'system/env',
        expect.objectContaining({
          GLOBAL_IMAGE_CACHE: true,
          RUST_ACCEL: true,
        }),
      )
    })
    expect(mocks.apiPost).toHaveBeenCalledWith(
      'system/setting/ScrapingSwitchs',
      expect.objectContaining({
        movie_nfo: 'overwrite',
      }),
    )
  })

  it('API_TOKEN 为 null 时基础设置表单校验拦截不抛空指针，跨 Tab 高级设置校验失败弹错误提示，空列表显示 .mp-empty-hint', async () => {
    const { container } = await renderWithProviders(AccountSettingSystem, {
      global: {
        stubs: {
          VDialogCloseBtn: {
            emits: ['click'],
            template: '<button type="button" aria-label="关闭" @click="$emit(`click`)" />',
          },
        },
      },
    })

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('system/env'))
    expect(container.querySelectorAll('.mp-empty-hint').length).toBeGreaterThanOrEqual(2)

    // API_TOKEN 为 null 时点击基础设置保存应被 VForm.validate() 拦截，不发送请求也不崩溃
    const basicSaveBtn = screen.getAllByRole('button', { name: '保存' })[0]
    await fireEvent.click(basicSaveBtn)
    expect(mocks.apiPost).not.toHaveBeenCalledWith('system/env', expect.anything())

    // 打开高级设置，在日志 Tab 填入非法大小 0，切回系统 Tab 点击保存应跨 Tab 拦截并弹 toast.error
    await fireEvent.click(screen.getByRole('button', { name: /高级设置/ }))
    const dialog = await screen.findByRole('dialog')
    await fireEvent.click(within(dialog).getByRole('tab', { name: /日志/ }))
    const maxFileSizeInput = within(dialog).getByLabelText('日志文件最大容量(MB)')
    await fireEvent.update(maxFileSizeInput, '0')
    await fireEvent.click(within(dialog).getByRole('tab', { name: /系统/ }))
    await fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalled()
    })
    expect(mocks.apiPost).not.toHaveBeenCalledWith('system/env', expect.anything())
  })
})
