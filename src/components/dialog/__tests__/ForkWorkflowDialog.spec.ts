import { readFileSync } from 'node:fs'
import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import type { WorkflowShare } from '@/api/types'
import ForkWorkflowDialog from '@/components/dialog/ForkWorkflowDialog.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  apiPost: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    delete: (...args: unknown[]) => mocks.apiDelete(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
  },
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    success: mocks.toastSuccess,
  }),
}))

const dialogSource = readFileSync('src/components/dialog/ForkWorkflowDialog.vue', 'utf8')

function createWorkflowShare(overrides: Partial<WorkflowShare> = {}): WorkflowShare {
  return {
    id: '91',
    share_comment: '自动刷流并按条件暂停',
    share_title: '测试工作流分享',
    share_uid: 'owner-id',
    share_user: '4Nest',
    timer: '0 */2 * * *',
    trigger_type: 'timer',
    actions: [],
    flows: [],
    ...overrides,
  }
}

async function renderDialog(
  workflow = createWorkflowShare(),
  options: { superUser?: boolean; canManage?: boolean; userUniqueId?: string } = {},
) {
  const events = {
    close: vi.fn(),
    delete: vi.fn(),
    fork: vi.fn(),
  }

  const result = await renderWithProviders(ForkWorkflowDialog, {
    global: {
      components: {
        VDialogCloseBtn: DialogCloseBtn,
      },
    },
    initialState: {
      globalSettings: {
        data: {
          USER_UNIQUE_ID: options.userUniqueId ?? 'owner-id',
          WORKFLOW_SHARE_MANAGE: options.canManage ?? false,
        },
      },
      user: {
        superUser: options.superUser ?? true,
      },
    },
    props: {
      modelValue: true,
      workflow,
      onClose: events.close,
      onDelete: events.delete,
      onFork: events.fork,
    },
  })

  return { ...result, events }
}

describe('ForkWorkflowDialog', () => {
  beforeEach(() => {
    mocks.apiDelete.mockReset()
    mocks.apiPost.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
  })

  it('uses the static summary without loading an interactive VueFlow canvas', () => {
    expect(dialogSource).toContain('WorkflowSummaryPreview')
    expect(dialogSource).not.toContain('@vue-flow/core')
    expect(dialogSource).not.toContain('import.meta.glob')
    expect(dialogSource).not.toContain('<VueFlow')
  })

  it('reserves the close-button safe area on small screens', () => {
    expect(dialogSource).toMatch(
      /@media screen and \(width <= 600px\)[\s\S]*?\.workflow-share-layout\s*\{[\s\S]*?padding-block-start:\s*2rem/,
    )
  })

  it.each([
    {
      label: 'a non-superuser even when share_uid matches instance UUID',
      superUser: false,
      shareUid: 'owner-id',
      canManage: false,
      expectedVisible: false,
    },
    {
      label: 'a non-superuser even when WORKFLOW_SHARE_MANAGE is true',
      superUser: false,
      shareUid: 'other-id',
      canManage: true,
      expectedVisible: false,
    },
    {
      label: 'a superuser viewing another user share without manage permission',
      superUser: true,
      shareUid: 'other-id',
      canManage: false,
      expectedVisible: false,
    },
    {
      label: 'a superuser who owns the instance share',
      superUser: true,
      shareUid: 'owner-id',
      canManage: false,
      expectedVisible: true,
    },
    {
      label: 'a superuser with share management permission',
      superUser: true,
      shareUid: 'other-id',
      canManage: true,
      expectedVisible: true,
    },
  ])('controls delete button visibility for $label', async ({ superUser, shareUid, canManage, expectedVisible }) => {
    await renderDialog(createWorkflowShare({ share_uid: shareUid }), { canManage, superUser })

    expect(await screen.findByText('测试工作流分享')).toBeInTheDocument()
    if (expectedVisible) {
      expect(screen.getByRole('button', { name: '取消分享' })).toBeInTheDocument()
    } else {
      expect(screen.queryByRole('button', { name: '取消分享' })).not.toBeInTheDocument()
    }
  })

  it('deletes the share for a superuser and handles Response[None] without reading data.id', async () => {
    mocks.apiDelete.mockResolvedValue({ data: null, success: true })
    const { events } = await renderDialog(createWorkflowShare(), { canManage: true, superUser: true })

    await fireEvent.click(await screen.findByRole('button', { name: '取消分享' }))

    await waitFor(() => expect(mocks.apiDelete).toHaveBeenCalledWith('workflow/share/91'))
    expect(events.delete).toHaveBeenCalledOnce()
    expect(events.delete).toHaveBeenCalledWith()
    expect(mocks.toastSuccess).toHaveBeenCalledWith('取消分享成功')
  })
})
