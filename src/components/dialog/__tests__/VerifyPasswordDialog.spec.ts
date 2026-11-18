import VerifyPasswordDialog from '@/components/dialog/VerifyPasswordDialog.vue'
import { fireEvent, screen } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { describe, expect, it } from 'vitest'

describe('VerifyPasswordDialog', () => {
  it('renders buttons in VCardActions, disables confirm when password is blank, and guards enter submit', async () => {
    const { emitted } = await renderWithProviders(VerifyPasswordDialog, {
      props: {
        modelValue: true,
        title: '账号安全',
        text: '请输入当前登录密码',
      },
      global: {
        stubs: {
          VDialogCloseBtn: { template: '<button type="button" aria-label="关闭" />' },
        },
      },
    })

    const dialog = await screen.findByRole('dialog')
    expect(dialog.querySelector('.v-card-actions')).not.toBeNull()

    const confirmBtn = screen.getByRole('button', { name: '确认' })
    expect(confirmBtn).toBeDisabled()

    const input = screen.getByLabelText('密码')
    await fireEvent.update(input, '   ')
    expect(confirmBtn).toBeDisabled()

    // 空白密码时表单提交不触发 confirm
    const form = dialog.querySelector('form')
    if (form) await fireEvent.submit(form)
    expect(emitted().confirm).toBeUndefined()

    await fireEvent.update(input, 'MyCurrentSecret123')
    expect(confirmBtn).not.toBeDisabled()

    await fireEvent.click(confirmBtn)
    expect(emitted().confirm?.[0]).toEqual(['MyCurrentSecret123'])
  })
})
