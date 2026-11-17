import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import WorkflowActionsDialog from '@/components/dialog/WorkflowActionsDialog.vue'
import WorkflowAddEditDialog from '@/components/dialog/WorkflowAddEditDialog.vue'
import WorkflowExecutionDialog from '@/components/dialog/WorkflowExecutionDialog.vue'
import WorkflowTemplateDialog from '@/components/dialog/WorkflowTemplateDialog.vue'
import WorkflowSidebar from '@/components/workflow/WorkflowSidebar.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  confirm: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
    put: (...args: unknown[]) => mocks.apiPut(...args),
  },
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
  }),
}))

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => mocks.confirm,
}))

vi.mock('nprogress', () => ({
  default: {
    done: vi.fn(),
    remove: vi.fn(),
    start: vi.fn(),
  },
}))

describe('WorkflowExecutionDialog & WorkflowAddEditDialog & WorkflowActionsDialog', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.apiPut.mockReset()
    mocks.confirm.mockReset()
    mocks.toastError.mockReset()
    mocks.toastInfo.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.toastWarning.mockReset()
  })

  it('loads and displays node execution diagnostics, retries, and artifact chips in WorkflowExecutionDialog', async () => {
    mocks.apiGet.mockResolvedValue({
      success: true,
      data: {
        id: 12,
        name: 'RSS 自动追剧',
        state: 'F',
        result: '下载器连接超时',
        run_count: 8,
        last_time: '2026-11-17 12:00:00',
        progress: 66,
        nodes: [
          {
            id: 'n1',
            name: '获取RSS资源',
            type: 'FetchRssAction',
            state: 'success',
            duration_ms: 420,
            attempt: 1,
            outputs_summary: { torrents: 5, medias: 2 },
            message: '抓取到 5 条资源',
          },
          {
            id: 'n2',
            name: '添加下载',
            type: 'AddDownloadAction',
            state: 'failed',
            duration_ms: 2300,
            attempt: 3,
            error: 'qBittorrent 无响应',
          },
        ],
        execute_history: [{ action: '获取RSS资源', result: true, message: 'OK' }],
      },
    })
    mocks.apiPost.mockResolvedValue({ success: true })

    const openFlowSpy = vi.fn()
    const refreshSpy = vi.fn()

    await renderWithProviders(WorkflowExecutionDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: {
        modelValue: true,
        workflow: { id: '12', name: 'RSS 自动追剧', state: 'F' },
        onOpenFlow: openFlowSpy,
        onRefresh: refreshSpy,
      },
    })

    expect(await screen.findByText(/下载器连接超时/)).toBeInTheDocument()
    expect(screen.getByText('420ms')).toBeInTheDocument()
    expect(screen.getByText('2.3s')).toBeInTheDocument()
    expect(screen.getByText('重试 3 次')).toBeInTheDocument()
    expect(screen.getByText('资源 5')).toBeInTheDocument()
    expect(screen.getByText('媒体 2')).toBeInTheDocument()
    expect(screen.getByText('qBittorrent 无响应')).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: '打开流程画布' }))
    expect(openFlowSpy).toHaveBeenCalledOnce()

    await fireEvent.click(screen.getByRole('button', { name: '重新执行' }))
    await waitFor(() =>
      expect(mocks.apiPost).toHaveBeenCalledWith('workflow/12/run?from_begin=true', { from_begin: true }),
    )
    expect(refreshSpy).toHaveBeenCalledOnce()
  })

  it('parses legacy and structured event_conditions and submits preset actions in WorkflowAddEditDialog', async () => {
    mocks.apiGet.mockResolvedValue([{ title: '入库完成', value: 'transfer.complete' }])
    mocks.apiPost.mockResolvedValue({ success: true, data: { id: 99 } })

    const saveSpy = vi.fn()
    await renderWithProviders(WorkflowAddEditDialog, {
      global: {
        components: { VDialogCloseBtn: DialogCloseBtn },
        stubs: { VCronField: true },
      },
      props: {
        modelValue: true,
        initialTemplate: {
          name: '入库通知联动',
          trigger_type: 'event',
          event_type: 'transfer.complete',
          event_conditions: { type: '电影', title: { contains: '2160p' } },
          actions: [{ id: 'act_1', type: 'SendMessageAction', name: '发送消息' }],
          flows: [],
        },
        onSave: saveSpy,
      },
    })

    expect(await screen.findByText(/已载入预设流程：1 个节点/)).toBeInTheDocument()
    expect(screen.getByDisplayValue('电影')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2160p')).toBeInTheDocument()

    // 新增一行自定义条件但留空（测试空行被自动忽略）并提交
    await fireEvent.click(screen.getByRole('button', { name: '添加条件' }))
    await fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledOnce())
    const [url, payload] = mocks.apiPost.mock.calls[0]
    expect(url).toBe('workflow/')
    expect(payload.event_conditions).toEqual({
      type: { equals: '电影' },
      title: { contains: '2160p' },
    })
    expect(payload.actions).toHaveLength(1)
    expect(saveSpy).toHaveBeenCalledWith(99)
  })

  it('preserves node runtime policies and runs zero-side-effect simulation in WorkflowActionsDialog', async () => {
    mocks.apiGet.mockResolvedValue([])
    mocks.apiPut.mockResolvedValue({ success: true })
    mocks.apiPost.mockResolvedValue({
      success: true,
      data: {
        success: true,
        scenario: 'normal',
        summary: '模拟完成：共执行 2 个动作，0 个跳过',
        execution_order: ['n1', 'n2'],
        nodes: {
          n1: {
            id: 'n1',
            name: '获取RSS资源',
            type: 'FetchRssAction',
            state: 'success',
            message: '模拟产出 3 条种子',
            outputs_summary: { torrents: 3 },
            step: 1,
          },
          n2: {
            id: 'n2',
            name: '添加下载',
            type: 'AddDownloadAction',
            state: 'success',
            message: '模拟添加 3 个下载任务',
            outputs_summary: { downloads: 3 },
            step: 2,
          },
        },
        edges: {
          e1: { id: 'e1', source: 'n1', target: 'n2', state: 'matched' },
        },
        diagnostics: [{ level: 'warning', node_id: 'n1', message: 'RSS 地址尚未填写' }],
      },
    })

    const VueFlowStub = defineComponent({
      props: ['nodes', 'edges'],
      setup(_props, { slots }) {
        return () => h('div', { 'data-testid': 'vue-flow-stub' }, slots.default?.())
      },
    })

    await renderWithProviders(WorkflowActionsDialog, {
      global: {
        stubs: {
          VueFlow: VueFlowStub,
          Controls: true,
          MiniMap: true,
          DropzoneBackground: true,
          WorkflowSidebar: true,
        },
      },
      props: {
        modelValue: true,
        workflow: {
          id: '7',
          name: '测试画布',
          actions: [
            {
              id: 'n1',
              type: 'FetchRssAction',
              name: '获取RSS资源',
              position: { x: 100, y: 100 },
              data: { timeout: 15 },
              fail_policy: 'continue',
              join_policy: 'any_success',
              retry: { max_attempts: 3, interval: 5 },
              timeout: 120,
              contract: { shouldBeStripped: true },
            },
            {
              id: 'n2',
              type: 'AddDownloadAction',
              name: '添加下载',
              position: { x: 420, y: 100 },
              data: {},
            },
          ],
          flows: [{ id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'edge_out', targetHandle: 'edge_in' }],
        },
      },
    })

    // 触发模拟试跑
    await fireEvent.click(await screen.findByText('模拟试跑'))
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledOnce())

    const [simUrl, simBody] = mocks.apiPost.mock.calls[0]
    expect(simUrl).toBe('workflow/simulate')
    expect(simBody.scenario).toBe('normal')
    // 确认高级策略字段完整保留，且 contract 纯展示字段已剔除，FetchRssAction 的 data.timeout 也未被误删
    expect(simBody.actions[0].fail_policy).toBe('continue')
    expect(simBody.actions[0].join_policy).toBe('any_success')
    expect(simBody.actions[0].retry).toEqual({ max_attempts: 3, interval: 5 })
    expect(simBody.actions[0].timeout).toBe(120)
    expect(simBody.actions[0].data.timeout).toBe(15)
    expect(simBody.actions[0].contract).toBeUndefined()

    // 验证模拟报告面板渲染
    expect(await screen.findByText('模拟完成：共执行 2 个动作，0 个跳过')).toBeInTheDocument()
    expect(screen.getByText('仅模拟流程走向与条件校验，未触发真实下载/订阅/通知')).toBeInTheDocument()
    expect(screen.getByText('RSS 地址尚未填写')).toBeInTheDocument()
    expect(screen.getByText('资源 3')).toBeInTheDocument()
    expect(screen.getByText('下载 3')).toBeInTheDocument()

    // 切换场景重跑
    await fireEvent.click(screen.getByText('源数据为空'))
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledTimes(2))
    expect(mocks.apiPost.mock.calls[1][1].scenario).toBe('empty_source')

    // Ctrl+S 保存验证高级字段依然完整写回后端且不污染模拟样式类
    await fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    await waitFor(() => expect(mocks.apiPut).toHaveBeenCalledOnce())
    const savedWorkflow = mocks.apiPut.mock.calls[0][1]
    expect(savedWorkflow.actions[0].fail_policy).toBe('continue')
    expect(savedWorkflow.actions[0].class).toBeUndefined()
  })

  it('groups, searches, and quick-adds actions in WorkflowSidebar and selects template in WorkflowTemplateDialog', async () => {
    mocks.apiGet.mockResolvedValue([
      { type: 'FetchRssAction', name: '获取RSS资源', description: '订阅RSS源' },
      { type: 'FilterTorrentsAction', name: '过滤资源', description: '按规则筛选' },
      { type: 'AddDownloadAction', name: '添加下载', description: '推送至下载器' },
      { type: 'CustomExtAction', name: '扩展动作', description: '第三方动作' },
    ])

    const quickAddSpy = vi.fn()
    await renderWithProviders(WorkflowSidebar, {
      props: {
        onComponentClick: quickAddSpy,
      },
    })

    expect(await screen.findByText('数据获取')).toBeInTheDocument()
    expect(screen.getByText('过滤筛选')).toBeInTheDocument()
    expect(screen.getByText('执行操作')).toBeInTheDocument()
    expect(screen.getByText('通知与扩展')).toBeInTheDocument()

    const searchBox = screen.getByPlaceholderText('搜索动作组件...')
    await fireEvent.update(searchBox, 'RSS')
    expect(screen.getByText('获取RSS资源')).toBeInTheDocument()
    expect(screen.queryByText('过滤筛选')).not.toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: '添加到画布 获取RSS资源' }))
    expect(quickAddSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'FetchRssAction' }))

    // 测试 WorkflowTemplateDialog 渲染与选择
    const selectTemplateSpy = vi.fn()
    await renderWithProviders(WorkflowTemplateDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: {
        modelValue: true,
        eventTypes: [{ title: '媒体文件整理完成', value: 'transfer.complete' }],
        onSelect: selectTemplateSpy,
      },
    })

    expect(await screen.findByText('RSS 订阅过滤自动下载')).toBeInTheDocument()
    expect(screen.getByText('媒体文件整理完成')).toBeInTheDocument()
    await fireEvent.click(screen.getAllByRole('button', { name: '使用此模板' })[0])
    expect(selectTemplateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'RSS 订阅过滤自动下载',
        trigger_type: 'timer',
      }),
    )
  })
})
