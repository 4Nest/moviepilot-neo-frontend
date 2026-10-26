import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import AboutDialog from '@/components/dialog/AboutDialog.vue'
import { renderWithProviders } from '@tests/support/render'
import { screen } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: { get: mocks.apiGet },
}))

async function renderDialog() {
  return renderWithProviders(AboutDialog, {
    props: { modelValue: true },
    global: { components: { VDialogCloseBtn: DialogCloseBtn } },
  })
}

describe('AboutDialog', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset().mockImplementation((url: string) => {
      if (url === 'system/env') {
        return Promise.resolve({ data: { VERSION: 'neo-v2.15.6', FRONTEND_VERSION: 'v2.15.6' } })
      }
      return Promise.reject(new Error(`unexpected url: ${url}`))
    })
  })

  it('展示版本信息且不请求或展示更新日志', async () => {
    await renderDialog()

    expect(await screen.findByText('neo-v2.15.6')).toBeInTheDocument()
    expect(screen.getByText('v2.15.6')).toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenCalledTimes(1)
    expect(mocks.apiGet).toHaveBeenCalledWith('system/env')
    expect(screen.queryByText('更新日志')).not.toBeInTheDocument()
  })
})
