import SubscribeAutoFillSetting from '@/views/setting/SubscribeAutoFillSetting.vue'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  confirm: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
  },
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ success: mocks.toastSuccess, error: mocks.toastError }),
}))

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => mocks.confirm,
}))

const storedRules = [
  {
    id: 'r1',
    enabled: true,
    type: '电视剧',
    categories: ['日番'],
    include: 'ADWeb',
    sites: [3],
    resolution: '1080[pi]|x1080',
  },
]

function mockApi(rules: unknown[] = storedRules, backfill: string[] = ['include']) {
  mocks.apiGet.mockImplementation((url: string) => {
    const responses: Record<string, unknown> = {
      'system/setting/SubscribeCategoryRules': { success: true, data: { value: rules } },
      'system/setting/SubscribeDownloadBackfill': { success: true, data: { value: backfill } },
      'media/category/config': { success: true, data: { movie: { 动画电影: {} }, tv: { 日番: {}, 国漫: {} } } },
      'site/rss': [
        { id: 3, name: '观众', is_active: true },
        { id: 4, name: '停用站点', is_active: false },
      ],
      'system/setting/UserFilterRuleGroups': { success: true, data: { value: [{ name: '日番规则' }] } },
      'download/clients': [{ name: 'qb' }],
    }
    return Promise.resolve(responses[url])
  })
  mocks.apiPost.mockResolvedValue({ success: true })
}

function postedRules() {
  const call = mocks.apiPost.mock.calls.filter(([url]) => url === 'system/setting/SubscribeCategoryRules').at(-1)
  return call?.[1]
}

describe('SubscribeAutoFillSetting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows each rule as a card with its override tags', async () => {
    mockApi()
    await renderWithProviders(SubscribeAutoFillSetting)

    const card = await screen.findByTestId('category-rule')
    expect(card.textContent).toContain('日番')
    expect(card.textContent).toContain('1080p')
    expect(card.textContent).toContain('包含 ADWeb')
    expect(card.textContent).toContain('观众')
  })

  it('saves immediately when a rule is edited in the dialog and confirmed', async () => {
    mockApi([{ ...storedRules[0], exclude: '', filter_groups: [] }])
    await renderWithProviders(SubscribeAutoFillSetting)

    await fireEvent.click(await screen.findByTestId('category-rule'))
    await fireEvent.update(await screen.findByLabelText('排除'), 'Dub')
    await fireEvent.click(screen.getByRole('button', { name: /确认/ }))

    await waitFor(() => expect(postedRules()).toBeDefined())
    expect(postedRules()).toEqual([{ ...storedRules[0], exclude: 'Dub' }])
  })

  it('saves backfill fields as soon as they are toggled', async () => {
    mockApi()
    await renderWithProviders(SubscribeAutoFillSetting)
    await screen.findByTestId('category-rule')

    await fireEvent.click(screen.getByText('站点'))

    await waitFor(() =>
      expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/SubscribeDownloadBackfill', ['include', 'sites']),
    )
  })

  it('requires at least one category before adding a rule', async () => {
    mockApi([])
    await renderWithProviders(SubscribeAutoFillSetting)

    await fireEvent.click(await screen.findByRole('button', { name: /添加规则/ }))
    await fireEvent.click(await screen.findByRole('button', { name: /确认/ }))

    expect(mocks.toastError).toHaveBeenCalledWith('启用的规则需要至少选择一个二级分类')
    expect(mocks.apiPost).not.toHaveBeenCalled()
  })

  it('deletes a rule after confirmation', async () => {
    mockApi()
    mocks.confirm.mockResolvedValue(true)
    await renderWithProviders(SubscribeAutoFillSetting)

    await fireEvent.click(await screen.findByTestId('category-rule'))
    await fireEvent.click(await screen.findByRole('button', { name: '删除' }))

    await waitFor(() => expect(postedRules()).toEqual([]))
    expect(mocks.confirm).toHaveBeenCalled()
  })
})
