import DownloaderInfoDialog from '@/components/dialog/DownloaderInfoDialog.vue'
import type { DownloaderConf } from '@/api/types'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, info: mocks.toastInfo, success: mocks.toastSuccess }),
}))

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

function createDownloader(name: string, overrides: Partial<DownloaderConf> = {}): DownloaderConf {
  return {
    name,
    type: 'qbittorrent',
    default: false,
    bt_default: false,
    enabled: true,
    config: {},
    path_mapping: [],
    ...overrides,
  }
}

async function renderDialog(downloader: DownloaderConf, downloaders: DownloaderConf[]) {
  const change = vi.fn()
  const result = await renderWithProviders(DownloaderInfoDialog, {
    props: {
      modelValue: true,
      downloader,
      downloaders,
      onChange: change,
    },
    global: {
      components: {
        VDialogCloseBtn: DialogCloseButtonStub,
      },
    },
  })
  return { ...result, change }
}

describe('DownloaderInfoDialog', () => {
  it('渲染 BT 站点默认开关', async () => {
    const downloader = createDownloader('BT下载器')
    await renderDialog(downloader, [downloader])

    expect(await screen.findByText('BT 站点默认')).toBeInTheDocument()
    expect(screen.getByText('从 BT(公开)站点下载时优先使用该下载器')).toBeInTheDocument()
  })

  it('勾选 BT 站点默认时清除其它下载器的同名标记并回传结果', async () => {
    const existing = createDownloader('PT下载器', { bt_default: true })
    const editing = createDownloader('BT下载器')
    const downloaders = [existing, editing]
    const { change } = await renderDialog(editing, downloaders)
    const switches = document.querySelectorAll('.v-switch input[type="checkbox"]')
    expect(switches.length).toBeGreaterThanOrEqual(3)
    await fireEvent.click(switches[2])
    await fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))

    await waitFor(() => expect(change).toHaveBeenCalledOnce())
    expect(change.mock.calls[0][0].bt_default).toBe(true)
    expect(existing.bt_default).toBe(false)
    expect(mocks.toastInfo).toHaveBeenCalledWith('存在 BT 站点默认下载器，已替换')
  })

  it('未勾选 BT 站点默认时不清除其它下载器标记', async () => {
    const existing = createDownloader('PT下载器', { bt_default: true })
    const editing = createDownloader('普通下载器')
    const downloaders = [existing, editing]
    const { change } = await renderDialog(editing, downloaders)

    await fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))

    await waitFor(() => expect(change).toHaveBeenCalledOnce())
    expect(change.mock.calls[0][0].bt_default).toBe(false)
    expect(existing.bt_default).toBe(true)
    expect(mocks.toastInfo).not.toHaveBeenCalled()
  })
})
