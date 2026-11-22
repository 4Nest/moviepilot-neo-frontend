import type { Context, MediaServerConf, Person, StorageConf } from '@/api/types'
import FilterRuleCard from '@/components/cards/FilterRuleCard.vue'
import MediaInfoCard from '@/components/cards/MediaInfoCard.vue'
import MediaServerCard from '@/components/cards/MediaServerCard.vue'
import PersonCard from '@/components/cards/PersonCard.vue'
import PluginMixedSortCard from '@/components/cards/PluginMixedSortCard.vue'
import StorageCard from '@/components/cards/StorageCard.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  openSharedDialog: vi.fn(),
  routerPush: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
  },
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

vi.mock('@/router', () => ({
  default: { push: (...args: unknown[]) => mocks.routerPush(...args) },
}))

vi.mock('@/@core/utils/image', () => ({
  getDominantColor: vi.fn().mockResolvedValue('#3b82f6'),
  imageLoadHandler: vi.fn(),
  calculateImageUrl: vi.fn((url: string) => url),
}))

describe('Slice C card components', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.openSharedDialog.mockReset()
    mocks.routerPush.mockReset()
  })

  it('MediaInfoCard renders safely when context.meta_info is undefined', async () => {
    const partialContext = {} as Context
    await renderWithProviders(MediaInfoCard, { props: { context: partialContext } })

    expect(screen.getByText('识别失败，无法识别到有效信息！')).toBeInTheDocument()
  })

  it('FilterRuleCard binds rules via :model-value instead of mutating readonly props with v-model', async () => {
    const source = readFileSync('src/components/cards/FilterRuleCard.vue', 'utf8')
    expect(source).not.toContain('v-model="props.rules"')
    expect(source).toContain(':model-value="props.rules"')

    const { emitted } = await renderWithProviders(FilterRuleCard, {
      props: { pri: '1', rules: [], custom_rules: [{ id: 'r1', name: '中字' } as never] },
    })
    await fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(emitted().close).toHaveLength(1)
  })

  it('PluginMixedSortCard exposes accessible remove-from-folder button with touch visibility and non-top-right placement', async () => {
    const source = readFileSync('src/components/cards/PluginMixedSortCard.vue', 'utf8')
    expect(source).toContain('@media (hover: none), (pointer: coarse)')
    expect(source).not.toContain(':global(')
    expect(source).toContain('inset-block-end:')

    const { emitted } = await renderWithProviders(PluginMixedSortCard, {
      props: {
        item: {
          type: 'plugin',
          id: 'DemoPlugin',
          order: 0,
          data: { id: 'DemoPlugin', plugin_name: '测试插件', plugin_version: '1.0' },
        },
        showRemoveButton: true,
        sortable: false,
      },
      global: {
        stubs: {
          PluginCard: { template: '<div data-testid="plugin-card" />' },
        },
      },
    })

    const btn = screen.getByRole('button', { name: '移出文件夹' })
    expect(btn).toHaveAttribute('title', '移出文件夹')
    await fireEvent.click(btn)
    expect(emitted().removeFromFolder).toEqual([['DemoPlugin']])
  })

  it('PersonCard reactively updates displayed name and route query when props.person changes', async () => {
    const personA: Person = { id: 101, name: '演员甲', character: '主角', source: 'themoviedb' }
    const personB: Person = { id: 202, name: '演员乙', character: '配角', source: 'douban' }

    const { container, rerender } = await renderWithProviders(PersonCard, {
      props: { person: personA },
      initialState: { globalSettings: { data: { GLOBAL_IMAGE_CACHE: false, TMDB_IMAGE_DOMAIN: 'image.tmdb.org' } } },
    })
    expect(screen.getByText('演员甲')).toBeInTheDocument()

    await rerender({ person: personB })
    expect(screen.getByText('演员乙')).toBeInTheDocument()
    expect(screen.getByText('配角')).toBeInTheDocument()

    await fireEvent.click(container.querySelector('.v-card')!)
    expect(mocks.routerPush).toHaveBeenCalledWith({
      path: '/person',
      query: { personid: 202, source: 'douban' },
    })
  })

  it('MediaServerCard reloads server statistics when configuration changes', async () => {
    mocks.apiGet.mockResolvedValue({ movie_count: 120, tv_count: 45, user_count: 3 })
    const serverDisabled: MediaServerConf = { name: 'EmbyHome', type: 'emby', enabled: false, config: {} }
    const serverEnabled: MediaServerConf = {
      name: 'EmbyHome',
      type: 'emby',
      enabled: true,
      config: { host: 'http://emby:8096' },
    }

    const { rerender } = await renderWithProviders(MediaServerCard, {
      props: { mediaserver: serverDisabled, mediaservers: [serverDisabled] },
    })
    expect(mocks.apiGet).not.toHaveBeenCalled()

    await rerender({ mediaserver: serverEnabled, mediaservers: [serverEnabled] })
    await waitFor(() =>
      expect(mocks.apiGet).toHaveBeenCalledWith('dashboard/statistic', { params: { name: 'EmbyHome' } }),
    )
    expect(await screen.findByText('120')).toBeInTheDocument()
  })

  it('StorageCard reloads storage usage when configuration becomes ready', async () => {
    mocks.apiGet.mockResolvedValue({ total: 1000, available: 400 })
    const unconfigured: StorageConf = { name: '阿里云盘', type: 'alipan', config: {} }
    const configured: StorageConf = { name: '阿里云盘', type: 'alipan', config: { refreshToken: 'token-1' } }

    const { rerender } = await renderWithProviders(StorageCard, {
      props: { storage: unconfigured },
    })
    expect(mocks.apiGet).not.toHaveBeenCalled()

    await rerender({ storage: configured })
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('storage/usage/alipan'))
    expect(await screen.findByText('60%')).toBeInTheDocument()
  })
})
