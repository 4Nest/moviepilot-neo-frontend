import DownloadingPage from '@/pages/downloading.vue'
import { fireEvent, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { computed, defineComponent, h, unref, type ComputedRef } from 'vue'
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

  it('renders add and history desktop FABs and passes the active downloader', async () => {
    await renderPage(false)

    await waitFor(() => expect(document.querySelectorAll('.compact-fab button')).toHaveLength(2))
    const addButton = document.querySelector('.compact-fab--primary button') as HTMLButtonElement
    const historyButton = document.querySelector('.compact-fab--secondary button') as HTMLButtonElement
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

    expect(document.querySelector('.compact-fab')).not.toBeInTheDocument()
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
})
