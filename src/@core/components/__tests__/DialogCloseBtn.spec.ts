import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { describe, expect, it } from 'vitest'

describe('DialogCloseBtn', () => {
  it('keeps its visual and event contracts while exposing a localized name', async () => {
    const user = userEvent.setup()
    const { container, emitted, rerender } = await renderWithProviders(DialogCloseBtn)
    const button = screen.getByRole('button', { name: '关闭' })

    expect(button).toHaveClass('absolute', 'right-3', 'top-3', 'z-10')
    // 图标内容来自 iconify 异步数据集，仅断言图标元素存在且对辅助技术隐藏
    const icon = container.querySelector('svg.v-icon')
    expect(icon).not.toBeNull()
    expect(icon).toHaveAttribute('aria-hidden', 'true')

    await waitFor(() => expect(screen.getByRole('button', { name: '关闭' })).toBe(button))

    await user.click(button)
    expect(emitted()['update:modelValue']).toEqual([[false]])
    expect(emitted().click).toEqual([[]])

    await rerender({ innerClass: 'dialog-close-custom' })
    expect(button).toHaveClass('dialog-close-custom')
    expect(button).not.toHaveClass('absolute', 'right-3', 'top-3', 'z-10')
  })
})
