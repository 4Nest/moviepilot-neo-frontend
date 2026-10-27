import { createApp } from 'vue'
import { translate } from '@/composables/useChineseText'
import vuetify from '@/plugins/vuetify'
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

// 创建确认对话框实例
async function createConfirmDialog(options: ConfirmOptions = {}) {
  const { promise, resolve } = Promise.withResolvers<boolean>()

  // 创建容器
  const container = document.createElement('div')
  document.body.appendChild(container)
  let settled = false

  const dialogOptions = {
    ...options,
    title: options.title || translate('common.confirm'),
    confirmText: options.confirmText || translate('common.confirm'),
    cancelText: options.cancelText || translate('common.cancel'),
  }

  // 遮罩、Esc、关闭按钮和取消都属于同一种否定结果，且每个弹窗只能结算一次。
  const settle = (value: boolean) => {
    if (settled) return
    settled = true
    resolve(value)
    cleanup()
  }

  // 创建应用实例
  const app = createApp(ConfirmDialog, {
    modelValue: true,
    ...dialogOptions,
    'onUpdate:modelValue': (val: boolean) => {
      if (!val) settle(false)
    },
    onConfirm: () => {
      settle(true)
    },
    onCancel: () => {
      settle(false)
    },
  })

  // 清理函数
  function cleanup() {
    app.unmount()
    container.remove()
  }

  // 注册必要的组件
  app.component('VDialogCloseBtn', DialogCloseBtn)

  // 独立挂载的应用必须注册 Vuetify，否则 VDialog 等组件无法解析、弹窗不渲染
  app.use(vuetify)
  // 挂载应用
  app.mount(container)

  return promise
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
