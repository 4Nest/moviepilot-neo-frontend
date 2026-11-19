import DownloadingPage from '@/pages/downloading.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h, KeepAlive, ref, unref, type ComputedRef, type Ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface HeaderButtonConfig {
  action?: () => void
  color?: string | ComputedRef<string>
  icon: string
  label?: string | ComputedRef<string>
  show?: boolean | ComputedRef<boolean>
  testId?: string
  variant?: string
}

interface HeaderTabConfig {
  appendButtons?: HeaderButtonConfig[]
  modelValue: Ref<string>
}

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  fetchData: vi.fn(),
  openSharedDialog: vi.fn(),
  registerHeaderTab: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
  },
}))

vi.mock('@/composables/useDynamicHeaderTab', () => ({
  useDynamicHeaderTab: () => ({ registerHeaderTab: mocks.registerHeaderTab }),
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

vi.mock('@/composables/useKeepAliveRefresh', () => ({
  useKeepAliveRefresh: vi.fn(),
}))

const DownloadingListViewStub = defineComponent({
  name: 'DownloadingListView',
  props: {
    active: Boolean,
    name: String,
  },
  setup(props, { expose }) {
    expose({ fetchData: mocks.fetchData })
    return () => h('div', `${props.name}:${props.active}`)
  },
})

async function renderPage() {
  mocks.apiGet.mockResolvedValue([{ name: 'qb-main' }])
  return renderWithProviders(DownloadingPage, {
    initialRoute: '/downloading',
    global: {
      stubs: {
        DownloadingListView: DownloadingListViewStub,
        NoDataFound: true,
      },
    },
  })
}

describe('Downloading page download actions', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.fetchData.mockReset().mockResolvedValue(undefined)
    mocks.openSharedDialog.mockReset()
    mocks.registerHeaderTab.mockReset()
  })

  it('registers add and history buttons in HeaderTab without rendering an extra action bar row', async () => {
    const { container } = await renderPage()

    await waitFor(() => expect(mocks.registerHeaderTab).toHaveBeenCalled())
    await screen.findByText('qb-main:true')
    expect(container.querySelector('.mp-page-action-bar')).toBeNull()

    const headerConfig = mocks.registerHeaderTab.mock.calls.at(-1)?.[0] as HeaderTabConfig
    const historyButton = headerConfig.appendButtons?.find(btn => btn.testId === 'downloading-history-btn')
    const addButton = headerConfig.appendButtons?.find(btn => btn.testId === 'downloading-add-btn')
    expect(historyButton).toBeDefined()
    expect(addButton).toBeDefined()
    expect(unref(historyButton?.show)).toBe(true)
    expect(unref(addButton?.show)).toBe(true)
    expect(addButton?.color).toBe('primary')
    expect(addButton?.variant).toBe('flat')

    addButton?.action?.()
    expect(mocks.openSharedDialog).toHaveBeenCalledWith(
      expect.any(Object),
      { downloader: 'qb-main' },
      { done: expect.any(Function) },
      { closeOn: ['close', 'done'] },
    )

    const done = mocks.openSharedDialog.mock.calls[0][2].done
    await done()
    expect(mocks.fetchData).toHaveBeenCalledOnce()

    historyButton?.action?.()
    expect(mocks.openSharedDialog).toHaveBeenLastCalledWith(expect.any(Object), {}, {}, { closeOn: ['close'] })
  })

  it('passes active=false to DownloadingListView when deactivated under KeepAlive and restores active=true on reactivation', async () => {
    mocks.apiGet.mockResolvedValue([{ name: 'qb-main' }])
    const hostActive = ref(true)
    const KeepAliveHost = defineComponent({
      setup() {
        return () =>
          h('div', [
            h('button', { type: 'button', onClick: () => (hostActive.value = !hostActive.value) }, '切换页面激活'),
            h(KeepAlive, null, {
              default: () => (hostActive.value ? h(DownloadingPage) : h('div', 'away')),
            }),
          ])
      },
    })

    await renderWithProviders(KeepAliveHost, {
      initialRoute: '/downloading',
      global: {
        stubs: {
          DownloadingListView: DownloadingListViewStub,
          NoDataFound: true,
        },
      },
    })

    expect(await screen.findByText('qb-main:true')).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: '切换页面激活' }))
    expect(await screen.findByText('away')).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: '切换页面激活' }))
    expect(await screen.findByText('qb-main:true')).toBeInTheDocument()
  })
})
