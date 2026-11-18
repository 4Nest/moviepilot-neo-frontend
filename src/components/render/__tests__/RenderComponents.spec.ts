import FormRender from '@/components/render/FormRender.vue'
import PageRender from '@/components/render/PageRender.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  closeProgress: vi.fn(),
  openSharedDialog: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    delete: (...args: unknown[]) => mocks.apiDelete(...args),
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
    put: (...args: unknown[]) => mocks.apiPut(...args),
  },
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

describe('FormRender & PageRender', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.openSharedDialog.mockReturnValue({
      close: mocks.closeProgress,
      id: 1,
      updateProps: vi.fn(),
    })
  })

  it('keeps static string props intact even when matching model keys, avoids double-nested html, and guards invalid expressions', async () => {
    const model = {
      title: '被模型污染的值',
      dynamicText: '表达式求值结果',
    }

    const { container } = await renderWithProviders(FormRender, {
      props: {
        model,
        config: {
          component: 'div',
          props: {
            'data-static': 'title',
            'data-dynamic': '{{ dynamicText }}',
            'data-broken': '{{ ???invalid_syntax',
            show: '{{ ???broken_show',
          },
          content: [
            {
              component: 'section',
              props: { 'data-testid': 'html-node' },
              html: '<em>富文本内容</em>',
            },
          ],
        },
      },
    })

    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('data-static')).toBe('title')
    expect(root.getAttribute('data-dynamic')).toBe('表达式求值结果')

    const htmlNode = screen.getByTestId('html-node')
    expect(htmlNode.tagName).toBe('SECTION')
    expect(htmlNode.querySelector('section')).toBeNull()
    expect(htmlNode.innerHTML).toBe('<em>富文本内容</em>')
  })

  it('dispatches PageRender actions by HTTP method (GET/POST/PUT/DELETE) and closes ProgressDialog on unmount', async () => {
    mocks.apiGet.mockResolvedValue({})
    mocks.apiPost.mockResolvedValue({})
    mocks.apiPut.mockResolvedValue({})
    let resolveDelete!: (val: unknown) => void
    mocks.apiDelete.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveDelete = resolve
        }),
    )

    const { unmount } = await renderWithProviders(PageRender, {
      props: {
        config: {
          component: 'div',
          content: [
            {
              component: 'button',
              text: '触发PUT',
              events: { click: { api: 'plugin/item', method: 'put', params: { enabled: true } } },
            },
            {
              component: 'button',
              text: '触发DELETE',
              events: { click: { api: 'plugin/item', method: 'DELETE', params: { id: 9 } } },
            },
          ],
        },
      },
    })

    await fireEvent.click(screen.getByRole('button', { name: '触发PUT' }))
    await waitFor(() => expect(mocks.apiPut).toHaveBeenCalledWith('plugin/item', { enabled: true }))
    expect(mocks.apiPost).not.toHaveBeenCalled()
    expect(mocks.closeProgress).toHaveBeenCalledOnce()

    mocks.closeProgress.mockClear()
    void fireEvent.click(screen.getByRole('button', { name: '触发DELETE' }))
    await waitFor(() => expect(mocks.apiDelete).toHaveBeenCalledWith('plugin/item', { params: { id: 9 } }))
    // 请求尚未结束时卸载组件，应主动关闭共享进度弹窗
    unmount()
    expect(mocks.closeProgress).toHaveBeenCalledOnce()
    resolveDelete({})
  })

  it('renders named slots recursively in PageRender and forwards nested slot actions', async () => {
    mocks.apiPost.mockResolvedValue({})
    const onAction = vi.fn()

    await renderWithProviders(PageRender, {
      props: {
        onAction,
        config: {
          component: 'VCard',
          slots: {
            title: [{ component: 'span', text: '插槽标题' }],
            append: {
              component: 'button',
              text: '插槽动作',
              events: { click: { api: 'plugin/slot-action', method: 'POST', params: { ok: 1 } } },
            },
          },
          content: [{ component: 'div', text: '主体内容' }],
        },
      },
    })

    expect(screen.getByText('插槽标题')).toBeInTheDocument()
    expect(screen.getByText('主体内容')).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: '插槽动作' }))
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith('plugin/slot-action', { ok: 1 }))
    expect(onAction).toHaveBeenCalledOnce()
  })
})
