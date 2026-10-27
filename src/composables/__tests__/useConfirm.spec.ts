import { useConfirm } from '@/composables/useConfirm'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'

// 等待独立挂载的弹窗子应用及 Vuetify stack watchEffect 完成渲染与聚焦栈更新
async function flushMount(): Promise<void> {
  await nextTick()
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
    expect(dialog).toHaveAttribute('data-native-confirm-dialog')
    expect(dialog).toHaveAttribute('data-native-confirm-kind', 'info')
    expect(dialog?.querySelector('[data-native-confirm-title]')?.textContent).toBe('确认')
    expect(dialog?.querySelector('[data-native-confirm-message]')?.textContent).toBe('删除该项？')
    expect(dialog?.querySelector('[data-native-confirm-cancel]')).toBeTruthy()
    expect(dialog?.querySelector('[data-native-confirm-accept]')).toBeTruthy()
    expect(document.body.textContent).toContain('删除该项？')

    // VDialogCloseBtn 也在对话框内，确认按钮取操作区最后一个
    const confirmBtn = [...document.body.querySelectorAll<HTMLButtonElement>('.v-dialog .v-card-actions .v-btn')].at(
      -1,
    )!
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

  it('settles nested confirm dialogs independently without overwriting resolvers', async () => {
    const createConfirm = useConfirm()

    const outerPromise = createConfirm({ type: 'warn', title: '外层确认', content: '外层内容' })
    await flushMount()

    const innerPromise = createConfirm({ type: 'error', title: '内层确认', content: '内层内容' })
    await flushMount()

    const dialogs = [...document.body.querySelectorAll<HTMLElement>('.v-dialog[data-native-confirm-dialog]')]
    expect(dialogs).toHaveLength(2)
    expect(dialogs[0]).toHaveAttribute('data-native-confirm-kind', 'warn')
    expect(dialogs[1]).toHaveAttribute('data-native-confirm-kind', 'error')

    dialogs[1].querySelector<HTMLButtonElement>('[data-native-confirm-cancel]')!.click()
    await expect(innerPromise).resolves.toBe(false)

    dialogs[0].querySelector<HTMLButtonElement>('[data-native-confirm-accept]')!.click()
    await expect(outerPromise).resolves.toBe(true)
    expect(document.body.querySelector('.v-dialog')).toBeNull()
  })
})
