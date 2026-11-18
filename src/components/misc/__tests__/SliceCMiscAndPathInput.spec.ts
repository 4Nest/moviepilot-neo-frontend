import DashboardRetryButton from '@/components/misc/DashboardRetryButton.vue'
import PathInput from '@/components/input/PathInput.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { readFileSync } from 'node:fs'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    post: (...args: unknown[]) => mocks.apiPost(...args),
  },
}))

describe('DashboardRetryButton, PathInput, and VersionHistory', () => {
  beforeEach(() => {
    mocks.apiPost.mockReset()
  })

  it('DashboardRetryButton avoids :global(...), stays visible on touch media query, and toggles interactive class on host card hover', async () => {
    const source = readFileSync('src/components/misc/DashboardRetryButton.vue', 'utf8')
    expect(source).not.toContain(':global(')
    expect(source).not.toContain('display: none')
    expect(source).toContain('@media (hover: none), (pointer: coarse)')

    const CardHost = defineComponent({
      components: { DashboardRetryButton },
      emits: ['retry'],
      template: `
        <div class="v-card" data-testid="host-card">
          <DashboardRetryButton deferred label="刷新失败重试" @retry="$emit('retry')" />
        </div>
      `,
    })

    const { emitted } = await renderWithProviders(CardHost)
    const button = screen.getByRole('button', { name: '刷新失败重试' })
    const hostCard = screen.getByTestId('host-card')

    expect(button).toHaveClass('dashboard-retry-button--deferred')
    expect(button).not.toHaveClass('dashboard-retry-button--interactive')

    await fireEvent.mouseEnter(hostCard)
    expect(button).toHaveClass('dashboard-retry-button--interactive')

    await fireEvent.mouseLeave(hostCard)
    expect(button).not.toHaveClass('dashboard-retry-button--interactive')

    await fireEvent.click(button)
    expect(emitted().retry).toHaveLength(1)
  })

  it('PathInput overwrites children without duplicates and expands relative to props.root', async () => {
    mocks.apiPost.mockImplementation((_url: string, item: { path: string }) => {
      if (item.path === '/media/') {
        return Promise.resolve([
          { name: 'movies', path: '/media/movies/', type: 'dir', storage: 'local' },
          { name: 'ignore.txt', path: '/media/ignore.txt', type: 'file', storage: 'local' },
        ])
      }
      if (item.path === '/media/movies/') {
        return Promise.resolve([{ name: '2026', path: '/media/movies/2026/', type: 'dir', storage: 'local' }])
      }
      return Promise.resolve([])
    })

    let capturedItems: Array<{ path: string; children?: unknown[] }> = []
    let loadChildrenFn: ((item: unknown) => Promise<void>) | undefined
    const VTreeviewStub = defineComponent({
      name: 'VTreeview',
      props: ['items', 'loadChildren'],
      setup(props) {
        return () => {
          capturedItems = props.items
          loadChildrenFn = props.loadChildren
          return h('div', { 'data-testid': 'treeview-stub' })
        }
      },
    })

    const VMenuStub = defineComponent({
      name: 'VMenu',
      props: ['modelValue'],
      emits: ['update:modelValue'],
      setup(props, { emit, slots }) {
        return () =>
          h('div', [
            slots.activator?.({ props: { onClick: () => emit('update:modelValue', !props.modelValue) } }),
            props.modelValue ? slots.default?.() : null,
          ])
      },
    })

    const Host = defineComponent({
      components: { PathInput },
      template: `
        <PathInput model-value="/media/movies/" root="/media" storage="local">
          <template #activator="{ menuprops }">
            <button type="button" v-bind="menuprops">打开路径树</button>
          </template>
        </PathInput>
      `,
    })

    await renderWithProviders(Host, {
      global: { stubs: { VMenu: VMenuStub, VTreeview: VTreeviewStub } },
    })

    await fireEvent.click(screen.getByRole('button', { name: '打开路径树' }))
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledTimes(2))

    expect(capturedItems[0].path).toBe('/media/')
    expect(capturedItems[0].children).toHaveLength(1)

    // 再次对根节点调用 fetchDirs 不会重复追加子节点
    await loadChildrenFn?.(capturedItems[0])
    expect(capturedItems[0].children).toHaveLength(1)
  })

  it('VersionHistory uses theme CSS variables instead of hardcoded RGB colors', () => {
    const source = readFileSync('src/components/misc/VersionHistory.vue', 'utf8')
    expect(source).not.toContain('rgb(99 102 241)')
    expect(source).not.toContain('rgba(127, 127, 127')
    expect(source).toContain('var(--v-theme-primary)')
    expect(source).toContain('var(--v-theme-on-surface)')
  })
})
