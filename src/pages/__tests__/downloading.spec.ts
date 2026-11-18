import DownloadingPage from '@/pages/downloading.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { computed, defineComponent, h, KeepAlive, ref, unref, type ComputedRef } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  appMode: false,
  apiGet: vi.fn(),
  fetchData: vi.fn(),
  openSharedDialog: vi.fn(),
  registerHeaderTab: vi.fn(),
  useDynamicButton: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
  },
}))

vi.mock('@/composables/useDynamicHeaderTab', () => ({
  useDynamicHeaderTab: () => ({ registerHeaderTab: mocks.registerHeaderTab }),
}))

vi.mock('@/composables/useDynamicButton', () => ({
  useDynamicButton: (options: unknown) => mocks.useDynamicButton(options),
}))

vi.mock('@/composables/usePWA', () => ({
  usePWA: () => ({ appMode: computed(() => mocks.appMode) }),
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

async function renderPage(appMode: boolean) {
  mocks.appMode = appMode
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

function getDynamicButtonConfig() {
  const config = mocks.useDynamicButton.mock.calls.at(-1)?.[0]
  if (!config) throw new Error('Dynamic button was not registered')
  return config as {
    icon: string
    color?: string
    onClick: () => void
    menuItems: Array<{ title: string; icon: string; action: () => void }>
    show: ComputedRef<boolean>
  }
}

describe('Downloading page download actions', () => {
  beforeEach(() => {
    mocks.appMode = false
    mocks.apiGet.mockReset()
    mocks.fetchData.mockReset().mockResolvedValue(undefined)
    mocks.openSharedDialog.mockReset()
    mocks.registerHeaderTab.mockReset()
    mocks.useDynamicButton.mockReset()
  })

  it('renders inline add and history toolbar buttons on desktop and passes the active downloader', async () => {
    await renderPage(false)

    await waitFor(() => expect(document.querySelector('[data-testid="downloading-add-btn"]')).not.toBeNull())
    const addButton = document.querySelector('[data-testid="downloading-add-btn"]') as HTMLButtonElement
    const historyButton = document.querySelector('[data-testid="downloading-history-btn"]') as HTMLButtonElement
    expect(addButton).toBeInTheDocument()
    expect(historyButton).toBeInTheDocument()

    await fireEvent.click(addButton)
    expect(mocks.openSharedDialog).toHaveBeenCalledWith(
      expect.any(Object),
      { downloader: 'qb-main' },
      { done: expect.any(Function) },
      { closeOn: ['close', 'done'] },
    )

    const done = mocks.openSharedDialog.mock.calls[0][2].done
    await done()
    expect(mocks.fetchData).toHaveBeenCalledOnce()

    await fireEvent.click(historyButton)
    expect(mocks.openSharedDialog).toHaveBeenLastCalledWith(expect.any(Object), {}, {}, { closeOn: ['close'] })
  })

  it('uses the mobile add action with add and history menu items', async () => {
    await renderPage(true)
    const dynamicButton = getDynamicButtonConfig()

    expect(document.querySelector('[data-testid="downloading-add-btn"]')).not.toBeInTheDocument()
    expect(dynamicButton.icon).toBe('mdi-plus')
    expect(dynamicButton.color).toBeUndefined()
    expect(unref(dynamicButton.show)).toBe(true)
    expect(dynamicButton.menuItems.map(item => [item.title, item.icon])).toEqual([
      ['添加种子', 'mdi-plus'],
      ['下载历史', 'mdi-history'],
    ])

    dynamicButton.onClick()
    expect(mocks.openSharedDialog).toHaveBeenCalledWith(
      expect.any(Object),
      { downloader: 'qb-main' },
      { done: expect.any(Function) },
      { closeOn: ['close', 'done'] },
    )

    dynamicButton.menuItems[1].action()
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
