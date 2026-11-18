import AddSubscribeAction from '@/components/workflow/AddSubscribeAction.vue'
import DropzoneBackground from '@/components/workflow/DropzoneBackground.vue'
import FetchMediasAction from '@/components/workflow/FetchMediasAction.vue'
import FetchRssAction from '@/components/workflow/FetchRssAction.vue'
import FetchTorrentsAction from '@/components/workflow/FetchTorrentsAction.vue'
import FilterMediasAction from '@/components/workflow/FilterMediasAction.vue'
import InvokePluginAction from '@/components/workflow/InvokePluginAction.vue'
import NoteAction from '@/components/workflow/NoteAction.vue'
import ScanFileAction from '@/components/workflow/ScanFileAction.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { flushPromises } from '@vue/test-utils'
import { defineComponent, h, reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  isDark: false,
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
  },
}))

vi.mock('@vue-flow/core', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    Handle: defineComponent({ name: 'Handle', render: () => h('span') }),
    Position: { Left: 'left', Right: 'right' },
  }
})

vi.mock('@vue-flow/background', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    Background: defineComponent({
      name: 'Background',
      props: ['patternColor', 'size', 'gap'],
      setup(props) {
        return () => h('div', { 'data-testid': 'flow-bg', 'data-pattern-color': props.patternColor })
      },
    }),
  }
})

vi.mock('vuetify', async importOriginal => {
  const actual = await importOriginal<typeof import('vuetify')>()
  const { computed } = await import('vue')
  return {
    ...actual,
    useTheme: () => ({
      current: computed(() => ({ dark: mocks.isDark })),
    }),
  }
})

describe('Workflow Action Components', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.isDark = false
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('reactively appends extra recommend sources into FetchMediasAction sourceOptions', async () => {
    const VSelectStub = defineComponent({
      name: 'VSelect',
      props: ['items', 'label', 'modelValue'],
      setup(props) {
        return () =>
          h(
            'div',
            { 'data-label': props.label },
            (props.items ?? []).map((it: { title: string }) => it.title).join('|'),
          )
      },
    })

    let resolveExtra!: (val: unknown) => void
    mocks.apiGet.mockReturnValue(
      new Promise(resolve => {
        resolveExtra = resolve
      }),
    )

    const data = reactive({ source_type: 'ranking', sources: [] })
    const { container } = await renderWithProviders(FetchMediasAction, {
      props: { id: 'node-1', data },
      global: { stubs: { VSelect: VSelectStub } },
    })

    resolveExtra([{ api_path: 'plugin/custom_rank', name: '自定义插件榜单' }])
    await flushPromises()

    await waitFor(() => {
      expect(container.textContent).toContain('自定义插件榜单')
    })
  })

  it('clears stale action_id on plugin switch and formats InvokePluginAction JSON only on blur', async () => {
    mocks.apiGet.mockResolvedValue([
      { plugin_id: 'PluginA', plugin_name: '插件A', actions: [{ id: 'act1', name: '动作1' }] },
      { plugin_id: 'PluginB', plugin_name: '插件B', actions: [{ id: 'act2', name: '动作2' }] },
    ])

    const data = reactive<{
      plugin_id: string
      action_id: string
      action_params: Record<string, unknown> | string
    }>({
      plugin_id: 'PluginA',
      action_id: 'act1',
      action_params: { foo: 1 },
    })

    const { container } = await renderWithProviders(InvokePluginAction, {
      props: { id: 'node-2', data },
    })
    await flushPromises()

    // 切换 plugin_id 应自动清空旧 action_id
    data.plugin_id = 'PluginB'
    await waitFor(() => expect(data.action_id).toBe(''))

    // 输入未压缩的合法 JSON 草稿期间保持用户当前输入文本，失焦后再格式化
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    await fireEvent.update(textarea, '{"bar":2}')
    expect(textarea.value).toBe('{"bar":2}')
    expect(data.action_params).toEqual({ bar: 2 })

    await fireEvent.blur(textarea)
    expect(textarea.value).toBe('{\n  "bar": 2\n}')
  })

  it('catches ScanFileAction storage request errors and adapts DropzoneBackground pattern color to theme', async () => {
    mocks.apiGet.mockRejectedValueOnce(new Error('storage error'))
    await renderWithProviders(ScanFileAction, {
      props: { id: 'node-3', data: reactive({ storage: 'local', directory: '' }) },
      global: { stubs: { VPathField: true } },
    })
    await flushPromises()

    mocks.isDark = false
    const lightRender = await renderWithProviders(DropzoneBackground)
    const lightColor = screen.getByTestId('flow-bg').getAttribute('data-pattern-color')
    lightRender.unmount()

    mocks.isDark = true
    await renderWithProviders(DropzoneBackground)
    const darkColor = screen.getByTestId('flow-bg').getAttribute('data-pattern-color')
    expect(darkColor).not.toBe(lightColor)
  })

  it('standardizes compact tonal node headers, single-row form grids, and switch cards without unused media/category requests', async () => {
    mocks.apiGet.mockResolvedValue([])

    const filterView = await renderWithProviders(FilterMediasAction, {
      props: { id: 'node-filter', data: reactive({ type: '电影', year: '', vote: '' }) },
    })
    await flushPromises()
    expect(mocks.apiGet).not.toHaveBeenCalledWith('media/category')
    expect(filterView.container.querySelector('form')).not.toBeNull()
    expect(filterView.container.querySelector('.v-avatar.v-avatar--variant-tonal')).not.toBeNull()
    filterView.unmount()

    const subView = await renderWithProviders(AddSubscribeAction, {
      props: { id: 'node-sub', data: reactive({}) },
    })
    const subCard = subView.container.querySelector('.v-card') as HTMLElement
    expect(subCard?.style.maxWidth).toBe('20rem')
    subView.unmount()

    const rssView = await renderWithProviders(FetchRssAction, {
      props: { id: 'node-rss', data: reactive({ match_media: false, proxy: false, only_new: true }) },
    })
    expect(rssView.container.querySelectorAll('.v-row')).toHaveLength(1)
    expect(rssView.container.querySelectorAll('.mp-switch-card')).toHaveLength(3)
    rssView.unmount()

    const torrentView = await renderWithProviders(FetchTorrentsAction, {
      props: { id: 'node-torrents', data: reactive({ search_type: 'keyword', sites: [], only_new: true }) },
    })
    await flushPromises()
    expect(torrentView.container.querySelectorAll('.v-row')).toHaveLength(1)
    expect(torrentView.container.querySelectorAll('.mp-switch-card')).toHaveLength(2)
    torrentView.unmount()

    const noteView = await renderWithProviders(NoteAction, {
      props: { id: 'node-note', data: reactive({ content: '测试备注' }) },
    })
    expect(noteView.container.querySelector('form')).not.toBeNull()
    expect(noteView.container.querySelector('.v-avatar.v-avatar--variant-tonal')).not.toBeNull()
    noteView.unmount()
  })
})
