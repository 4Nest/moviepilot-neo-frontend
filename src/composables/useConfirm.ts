import { createApp } from 'vue'
import { translate } from '@/composables/useChineseText'
import ConfirmDialog from '@/@core/components/ConfirmDialog.vue'
import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'

interface ConfirmOptions {
  type?: 'info' | 'warn' | 'error'
  title?: string
  content?: string
  confirmText?: string
  cancelText?: string
  width?: string | number
}

let resolvePromise: ((value: boolean) => void) | null = null

// 创建确认对话框实例
async function createConfirmDialog(options: ConfirmOptions = {}) {
  return new Promise<boolean>(resolve => {
    resolvePromise = resolve

    // 创建容器
    const container = document.createElement('div')
    document.body.appendChild(container)

    const dialogOptions = {
      ...options,
      title: options.title || translate('common.confirm'),
      confirmText: options.confirmText || translate('common.confirm'),
      cancelText: options.cancelText || translate('common.cancel'),
    }

    // 创建应用实例
    const app = createApp(ConfirmDialog, {
      modelValue: true,
      ...dialogOptions,
      'onUpdate:modelValue': (val: boolean) => {
        if (!val) {
          cleanup()
        }
      },
      onConfirm: () => {
        resolvePromise?.(true)
        cleanup()
      },
      onCancel: () => {
        resolvePromise?.(false)
        cleanup()
      },
    })

    // 注册必要的组件
    app.component('VDialogCloseBtn', DialogCloseBtn)


    // 挂载应用
    app.mount(container)

    // 清理函数
    const cleanup = () => {
      app.unmount()
      document.body.removeChild(container)
    }
  })
}

// 创建一个函数对象，同时支持直接调用和解构
const confirmFunction = Object.assign(createConfirmDialog, {
  createConfirm: createConfirmDialog,
})

// 导出 useConfirm 函数
export function useConfirm() {
  return confirmFunction
}

// 插件
export default {
  install: (app: any) => {
    app.provide('confirm', { createConfirm: createConfirmDialog })
  },
}
