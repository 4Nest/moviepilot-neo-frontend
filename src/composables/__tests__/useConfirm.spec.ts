import { useConfirm } from '@/composables/useConfirm'
import { describe, expect, it } from 'vitest'

// 等待独立挂载的弹窗子应用完成渲染
function flushMount(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve)
  return promise
}

describe('useConfirm', () => {
  it('mounts a rendered vuetify dialog and resolves on confirm/cancel', async () => {
    const createConfirm = useConfirm()

    // 确认分支：弹窗必须真实渲染 Vuetify 组件（曾因子应用未注册 vuetify 导致不渲染）
    const confirmPromise = createConfirm({ title: '确认', content: '删除该项？' })
    await flushMount()
    const dialog = document.body.querySelector('.v-dialog')
    expect(dialog).toBeTruthy()
    expect(document.body.textContent).toContain('删除该项？')

    // VDialogCloseBtn 也在对话框内，确认按钮取操作区最后一个
    const confirmBtn = [...document.body.querySelectorAll<HTMLButtonElement>('.v-dialog .v-card-actions .v-btn')].at(-1)!
    confirmBtn.click()
    await expect(confirmPromise).resolves.toBe(true)
    expect(document.body.querySelector('.v-dialog')).toBeNull()

    // 取消分支
    const cancelPromise = createConfirm({ content: '再试一次' })
    await flushMount()
    const cancelBtn = document.body.querySelector<HTMLButtonElement>('.v-dialog .v-btn')!
    cancelBtn.click()
    await expect(cancelPromise).resolves.toBe(false)
    expect(document.body.querySelector('.v-dialog')).toBeNull()
  })
})
