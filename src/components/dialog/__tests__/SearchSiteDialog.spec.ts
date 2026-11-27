import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { renderWithProviders } from '@tests/support/render'
import {
  clearStoredSearchSelection,
  encodeSearchRuleGroupsParam,
  loadStoredSearchSelection,
  saveStoredSearchSelection,
} from '@/composables/useSearchSelection'

const apiGetMock = vi.hoisted(() => vi.fn())

vi.mock('@/api', () => ({
  default: {
    get: apiGetMock,
  },
}))

import SearchSiteDialog from '@/components/dialog/SearchSiteDialog.vue'

const DialogCloseBtn = defineComponent({
  name: 'VDialogCloseBtn',
  emits: ['click'],
  setup(_, { emit }) {
    return () => h('button', { type: 'button', onClick: () => emit('click') }, 'close')
  },
})

const mockSites = [
  { id: 1, name: 'AlphaSite', domain: 'a.com', url: 'https://a.com', is_active: true },
  { id: 2, name: 'BetaSite', domain: 'b.com', url: 'https://b.com', is_active: true },
] as unknown as never[]

describe('useSearchSelection & SearchSiteDialog', () => {
  beforeEach(() => {
    clearStoredSearchSelection()
    apiGetMock.mockReset()
    apiGetMock.mockImplementation((url: string) => {
      if (url === 'system/setting/public/UserFilterRuleGroups') {
        return Promise.resolve({
          data: {
            value: [
              { name: '电影优先', rule_string: '4K > 1080P', media_type: '电影' },
              { name: '剧集通用', rule_string: '1080P', media_type: '电视剧' },
            ],
          },
        })
      }
      if (url === 'system/setting/public/CustomFilterRules') {
        return Promise.resolve({
          data: {
            value: [
              { id: 'BDRip', name: '蓝光压制', include: 'BDRip' },
              { id: 'HQ', name: '高质量', include: 'REMUX' },
            ],
          },
        })
      }
      if (url === 'system/setting/public/SearchFilterRuleGroups') {
        return Promise.resolve({
          data: {
            value: ['电影优先'],
          },
        })
      }
      return Promise.resolve({ data: { value: [] } })
    })
  })

  it('encodes default, none, and custom rule group + single rule selections', () => {
    expect(encodeSearchRuleGroupsParam({ ruleMode: 'default', ruleGroups: ['电影优先'], customRules: ['BDRip'] })).toBe(
      undefined,
    )
    expect(encodeSearchRuleGroupsParam({ ruleMode: 'none', ruleGroups: [], customRules: [] })).toBe('__none__')
    expect(encodeSearchRuleGroupsParam({ ruleMode: 'custom', ruleGroups: ['电影优先'], customRules: ['BDRip'] })).toBe(
      '电影优先,rule:BDRip',
    )
    expect(encodeSearchRuleGroupsParam({ ruleMode: 'custom', ruleGroups: [], customRules: [] })).toBe(undefined)
  })

  it('defaults to system rules and persists selected sites, rule groups, and single custom rules to localStorage', async () => {
    const onSearch = vi.fn()
    const { unmount } = await renderWithProviders(SearchSiteDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: {
        modelValue: true,
        sites: mockSites,
        selected: [1],
        onSearch,
      },
    })

    // 切换到「过滤规则」页
    const rulesTab = screen.getByRole('tab', { name: /过滤规则/ })
    await fireEvent.click(rulesTab)

    // 默认态展示系统默认规则组
    await waitFor(() => {
      expect(screen.getByText('电影优先')).toBeInTheDocument()
    })

    // 切换到「自定义」模式，同时勾选一个规则组和一条单条自定义规则
    await fireEvent.click(screen.getByRole('button', { name: '自定义' }))
    await waitFor(() => {
      expect(screen.getByText('蓝光压制')).toBeInTheDocument()
    })
    await fireEvent.click(screen.getByText('剧集通用'))
    await fireEvent.click(screen.getByText('蓝光压制'))

    // 点击搜索，校验 emit 参数及 localStorage 持久化
    await fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    expect(onSearch).toHaveBeenCalledWith([1], '剧集通用,rule:BDRip')
    expect(loadStoredSearchSelection()).toEqual({
      sites: [1],
      ruleMode: 'custom',
      ruleGroups: ['剧集通用'],
      customRules: ['BDRip'],
    })

    unmount()

    // 重新打开弹窗，应自动恢复上次选择的规则与站点
    const onSearchAgain = vi.fn()
    saveStoredSearchSelection({
      sites: [2],
      ruleMode: 'none',
      ruleGroups: [],
      customRules: [],
    })
    await renderWithProviders(SearchSiteDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: {
        modelValue: true,
        sites: mockSites,
        selected: [1],
        onSearch: onSearchAgain,
      },
    })

    await fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    expect(onSearchAgain).toHaveBeenCalledWith([2], '__none__')
  })

  it('restores default sites and default rule mode when clicking restore default', async () => {
    saveStoredSearchSelection({
      sites: [2],
      ruleMode: 'none',
      ruleGroups: [],
      customRules: [],
    })
    const onSearch = vi.fn()
    await renderWithProviders(SearchSiteDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: {
        modelValue: true,
        sites: mockSites,
        selected: [1],
        onSearch,
      },
    })

    await fireEvent.click(screen.getByRole('button', { name: '恢复默认' }))
    await fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    expect(onSearch).toHaveBeenCalledWith([1], undefined)
  })
})
