import ShortcutLogDialog from '@/components/dialog/ShortcutLogDialog.vue'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ShortcutLogDialog', () => {
  it('opens the system log and download URLs from accessible wrappable header action buttons', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const user = userEvent.setup()
    await renderWithProviders(ShortcutLogDialog, {
      props: { modelValue: true },
      global: { stubs: { LoggingView: true, VDialogCloseBtn: true } },
    })

    // 网页模式使用共用可换行标题容器承载全部操作按钮，避免窄屏溢出裁切。
    const header = document.querySelector('.logging-dialog-header')
    expect(header?.querySelector('.logging-dialog-title')).not.toBeNull()
    expect(header?.querySelectorAll('.logging-dialog-title__actions > button.logging-dialog-action')).toHaveLength(2)

    await user.click(await screen.findByRole('button', { name: '下载' }))
    await user.click(screen.getByRole('button', { name: '在新窗口中打开' }))

    expect(open.mock.calls).toEqual([
      [expect.stringMatching(/system\/logging\/download\/moviepilot$/), '_blank'],
      [expect.stringMatching(/system\/logging\?length=-1$/), '_blank'],
    ])
  })
})
