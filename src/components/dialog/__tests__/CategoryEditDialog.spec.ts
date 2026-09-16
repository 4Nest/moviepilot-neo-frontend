import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import CategoryEditDialog from '@/components/dialog/CategoryEditDialog.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { HttpResponse, http } from 'msw'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => mocks.confirm,
}))

const API_BASE_URL = 'http://localhost/api/v1/'
const categoryApiUrls = {
  config: new URL('media/category/config', API_BASE_URL).href,
  raw: new URL('media/category/config/raw', API_BASE_URL).href,
  template: new URL('media/category/config/raw/template', API_BASE_URL).href,
}

const RAW_CONTENT = 'movie:\n  国产电影:\n    original_language: zh\n# 保留这条注释\ntv: {}\n'
const TEMPLATE_CONTENT = '# 默认模板注释\nmovie: {}\ntv: {}\n'

// 测试环境不加载真实 Ace,用 textarea 模拟 v-model:value 行为
const AceEditorStub = defineComponent({
  name: 'VAceEditor',
  props: {
    value: { type: String, default: '' },
  },
  emits: ['init', 'update:value'],
  setup(props, { emit }) {
    return () =>
      h('textarea', {
        'data-testid': 'raw-yaml-editor',
        value: props.value,
        onInput: (event: Event) => emit('update:value', (event.target as HTMLTextAreaElement).value),
      })
  },
})

function useRawGetHandler(content = RAW_CONTENT, onRequest: () => void = () => {}) {
  server.use(
    http.get(categoryApiUrls.raw, () => {
      onRequest()
      return HttpResponse.json({ success: true, data: { content } })
    }),
  )
}

async function renderDialog() {
  const events = {
    close: vi.fn(),
    save: vi.fn(),
  }
  const result = await renderWithProviders(CategoryEditDialog, {
    props: {
      modelValue: true,
      onClose: events.close,
      onSave: events.save,
    },
    global: {
      components: {
        VDialogCloseBtn: DialogCloseBtn,
      },
      stubs: {
        VAceEditor: AceEditorStub,
      },
    },
  })
  // 等可视化配置加载完成
  await screen.findByRole('tab', { name: /电影/ })
  return { ...result, events }
}

async function switchToAdvanced() {
  await fireEvent.click(screen.getByRole('tab', { name: /进阶/ }))
  const editor = await screen.findByTestId('raw-yaml-editor')
  await waitFor(() => expect(editor).toHaveValue(RAW_CONTENT))
  return editor
}

describe('CategoryEditDialog 进阶(YAML 原文)页签', () => {
  beforeEach(() => {
    mocks.confirm.mockResolvedValue(true)
    server.use(
      http.get(categoryApiUrls.config, () => HttpResponse.json({ success: true, data: { movie: {}, tv: {} } })),
    )
  })

  it('提供进阶页签', async () => {
    await renderDialog()

    expect(screen.getByRole('tab', { name: /进阶/ })).toBeInTheDocument()
  })

  it('首次切换到进阶页签时拉取原文并填入编辑器', async () => {
    let rawRequests = 0
    useRawGetHandler(RAW_CONTENT, () => {
      rawRequests += 1
    })
    await renderDialog()
    expect(rawRequests).toBe(0)

    const editor = await switchToAdvanced()

    expect(editor).toHaveValue(RAW_CONTENT)
    expect(rawRequests).toBe(1)
  })

  it('进阶页保存发送原文 PUT,成功后不关闭对话框', async () => {
    let putBody: unknown = null
    useRawGetHandler()
    server.use(
      http.put(categoryApiUrls.raw, async ({ request }) => {
        putBody = await request.json()
        return HttpResponse.json({ success: true, message: '保存成功' })
      }),
    )
    const { events } = await renderDialog()
    const editor = await switchToAdvanced()
    const edited = 'movie:\n  新分类: {}\n'
    await fireEvent.update(editor, edited)

    await fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(putBody).toEqual({ content: edited }))
    expect(mocks.toastSuccess).toHaveBeenCalled()
    expect(events.save).toHaveBeenCalled()
    expect(events.close).not.toHaveBeenCalled()
  })

  it('进阶页保存失败时展示错误详情且不关闭对话框', async () => {
    useRawGetHandler()
    server.use(
      http.put(categoryApiUrls.raw, () => HttpResponse.json({ success: false, message: 'YAML 语法错误: 第 2 行' })),
    )
    const { events } = await renderDialog()
    await switchToAdvanced()

    await fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await screen.findByText('YAML 语法错误: 第 2 行')
    expect(mocks.toastError).toHaveBeenCalled()
    expect(events.save).not.toHaveBeenCalled()
    expect(events.close).not.toHaveBeenCalled()
  })

  it('可视化页保存后再次进入进阶页会重新拉取原文', async () => {
    let rawRequests = 0
    let postRequests = 0
    useRawGetHandler(RAW_CONTENT, () => {
      rawRequests += 1
    })
    server.use(
      http.post(categoryApiUrls.config, () => {
        postRequests += 1
        return HttpResponse.json({ success: true, message: '保存成功' })
      }),
    )
    await renderDialog()
    await switchToAdvanced()
    expect(rawRequests).toBe(1)

    // 回到可视化页保存
    await fireEvent.click(screen.getByRole('tab', { name: /电影/ }))
    await fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(postRequests).toBe(1))

    // 再次进入进阶页应重新拉取
    await fireEvent.click(screen.getByRole('tab', { name: /进阶/ }))
    await waitFor(() => expect(rawRequests).toBe(2))
  })

  it('恢复默认模板经确认后仅填充编辑器,不落盘', async () => {
    let putRequests = 0
    useRawGetHandler()
    server.use(
      http.get(categoryApiUrls.template, () =>
        HttpResponse.json({ success: true, data: { content: TEMPLATE_CONTENT } }),
      ),
      http.put(categoryApiUrls.raw, () => {
        putRequests += 1
        return HttpResponse.json({ success: true })
      }),
    )
    await renderDialog()
    const editor = await switchToAdvanced()

    await fireEvent.click(screen.getByRole('button', { name: /恢复默认模板/ }))

    expect(mocks.confirm).toHaveBeenCalled()
    // 拉取模板期间编辑器保持挂载(遮罩加载),元素引用不变
    expect(screen.getByTestId('raw-yaml-editor')).toBe(editor)
    await waitFor(() => expect(editor).toHaveValue(TEMPLATE_CONTENT))
    // 仅填充编辑器,未触发保存
    expect(putRequests).toBe(0)
    // 填入模板后标记为未保存修改
    await waitFor(() => expect(screen.getByRole('tab', { name: /●/ })).toBeInTheDocument())
  })

  it('恢复默认模板拉取期间编辑器保持挂载不丢撤销栈', async () => {
    useRawGetHandler()
    server.use(
      http.get(categoryApiUrls.template, async () => {
        const { promise, resolve } = Promise.withResolvers<void>()
        setTimeout(resolve, 50)
        await promise
        return HttpResponse.json({ success: true, data: { content: TEMPLATE_CONTENT } })
      }),
    )
    await renderDialog()
    const editor = await switchToAdvanced()

    await fireEvent.click(screen.getByRole('button', { name: /恢复默认模板/ }))

    // 模板请求在途期间:恢复按钮禁用,但编辑器不被卸载
    await waitFor(() => expect(screen.getByRole('button', { name: /恢复默认模板/ })).toBeDisabled())
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
    expect(screen.getByTestId('raw-yaml-editor')).toBe(editor)
    await waitFor(() => expect(editor).toHaveValue(TEMPLATE_CONTENT))
    expect(screen.getByTestId('raw-yaml-editor')).toBe(editor)
  })

  it('原文保存后可视化刷新失败会在下次切入时重试', async () => {
    let configRequests = 0
    useRawGetHandler()
    server.use(
      http.get(categoryApiUrls.config, () => {
        configRequests += 1
        if (configRequests === 2) return HttpResponse.json({ detail: 'temporary' }, { status: 500 })
        return HttpResponse.json({ success: true, data: { movie: {}, tv: {} } })
      }),
      http.put(categoryApiUrls.raw, () => HttpResponse.json({ success: true, message: '保存成功' })),
    )
    await renderDialog()
    await switchToAdvanced()
    await fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled())

    await fireEvent.click(screen.getByRole('tab', { name: /电影/ }))
    await waitFor(() => expect(configRequests).toBe(2))
    await fireEvent.click(screen.getByRole('tab', { name: /进阶/ }))
    await fireEvent.click(screen.getByRole('tab', { name: /电视剧/ }))

    await waitFor(() => expect(configRequests).toBe(3))
  })

  it('原文未成功加载时进阶页保存按钮禁用', async () => {
    server.use(http.get(categoryApiUrls.raw, () => HttpResponse.json({ success: false, message: '读取失败' })))
    await renderDialog()

    await fireEvent.click(screen.getByRole('tab', { name: /进阶/ }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })

  it('原文过期且有未保存修改时,取消确认保留当前内容并清除过期标记', async () => {
    let rawRequests = 0
    useRawGetHandler(RAW_CONTENT, () => {
      rawRequests += 1
    })
    server.use(http.post(categoryApiUrls.config, () => HttpResponse.json({ success: true, message: '保存成功' })))
    await renderDialog()
    const editor = await switchToAdvanced()
    const edited = 'movie:\n  未保存修改: {}\n'
    await fireEvent.update(editor, edited)

    // 可视化页保存使原文过期
    await fireEvent.click(screen.getByRole('tab', { name: /电影/ }))
    await fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled())

    mocks.confirm.mockResolvedValue(false)
    await fireEvent.click(screen.getByRole('tab', { name: /进阶/ }))

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled())
    // 取消:不重新拉取,保留未保存内容
    expect(rawRequests).toBe(1)
    await waitFor(() => expect(screen.getByTestId('raw-yaml-editor')).toHaveValue(edited))
    // 过期标记已清除:再次切换页签不再拉取也不再确认
    mocks.confirm.mockClear()
    await fireEvent.click(screen.getByRole('tab', { name: /电影/ }))
    await fireEvent.click(screen.getByRole('tab', { name: /进阶/ }))
    expect(rawRequests).toBe(1)
    expect(mocks.confirm).not.toHaveBeenCalled()
  })

  it('原文过期且有未保存修改时,确认后重新拉取原文覆盖编辑器', async () => {
    let rawRequests = 0
    useRawGetHandler(RAW_CONTENT, () => {
      rawRequests += 1
    })
    server.use(http.post(categoryApiUrls.config, () => HttpResponse.json({ success: true, message: '保存成功' })))
    await renderDialog()
    const editor = await switchToAdvanced()
    await fireEvent.update(editor, 'movie:\n  未保存修改: {}\n')

    // 可视化页保存使原文过期
    await fireEvent.click(screen.getByRole('tab', { name: /电影/ }))
    await fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled())

    mocks.confirm.mockResolvedValue(true)
    await fireEvent.click(screen.getByRole('tab', { name: /进阶/ }))

    await waitFor(() => expect(rawRequests).toBe(2))
    expect(mocks.confirm).toHaveBeenCalled()
    await waitFor(() => expect(screen.getByTestId('raw-yaml-editor')).toHaveValue(RAW_CONTENT))
  })

  it('取消确认时不恢复默认模板', async () => {
    mocks.confirm.mockResolvedValue(false)
    let templateRequests = 0
    useRawGetHandler()
    server.use(
      http.get(categoryApiUrls.template, () => {
        templateRequests += 1
        return HttpResponse.json({ success: true, data: { content: TEMPLATE_CONTENT } })
      }),
    )
    await renderDialog()
    const editor = await switchToAdvanced()

    await fireEvent.click(screen.getByRole('button', { name: /恢复默认模板/ }))

    expect(mocks.confirm).toHaveBeenCalled()
    expect(templateRequests).toBe(0)
    expect(editor).toHaveValue(RAW_CONTENT)
  })
})
