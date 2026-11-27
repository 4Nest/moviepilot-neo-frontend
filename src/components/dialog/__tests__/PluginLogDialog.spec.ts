import type { Plugin } from '@/api/types'
import PluginLogDialog from '@/components/dialog/PluginLogDialog.vue'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { afterEach, describe, expect, it, vi } from 'vitest'

const plugin: Plugin = {
  id: 'MyPlugin',
  plugin_name: '示例插件',
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PluginLogDialog', () => {
  it('opens the plugin log and download URLs from accessible title action buttons', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const user = userEvent.setup()
    await renderWithProviders(PluginLogDialog, {
      props: { plugin },
      global: { stubs: { LoggingView: true, VDialogCloseBtn: true } },
    })

    const header = document.querySelector('.logging-dialog-header')
    expect(header?.querySelector('.logging-dialog-title')).not.toBeNull()
    expect(header?.querySelectorAll('.logging-dialog-title__actions > button.logging-dialog-action')).toHaveLength(2)

    await user.click(await screen.findByRole('button', { name: '下载' }))
    await user.click(screen.getByRole('button', { name: '在新窗口中打开' }))

    expect(open.mock.calls).toEqual([
      [expect.stringMatching(/system\/logging\/download\/myplugin$/), '_blank'],
      [expect.stringMatching(/system\/logging\?length=-1&logfile=plugins\/myplugin\.log$/), '_blank'],
    ])
  })
})
