import FileToolbar from '@/components/filebrowser/FileToolbar.vue'
import type { EndPoints, FileItem } from '@/api/types'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import type { AxiosInstance } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  mdAndUp: { value: true },
  openSharedDialog: vi.fn(),
  toastError: vi.fn(),
  updateProps: vi.fn(),
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError }),
}))

vi.mock('vuetify', async importOriginal => {
  const actual = await importOriginal<typeof import('vuetify')>()
  return {
    ...actual,
    useDisplay: () => ({ mdAndUp: mocks.mdAndUp }),
  }
})

const IconBtnStub = defineComponent({
  name: 'IconBtn',
  emits: ['click'],
  setup(_props, { emit, slots }) {
    return () => h('button', { class: 'icon-btn', type: 'button', onClick: () => emit('click') }, slots.default?.())
  },
})

function mountToolbar(
  request: ReturnType<typeof vi.fn>,
  sort = 'name',
  item: FileItem = { name: 'downloads', path: '/downloads/', storage: 'local', type: 'dir' },
  itemstack: FileItem[] = [
    { name: '/', path: '/', storage: 'local', type: 'dir' },
    { name: 'downloads', path: '/downloads/', storage: 'local', type: 'dir' },
  ],
  options: {
    mkdirMethod?: string
    showNewFolderButton?: boolean
    storages?: Array<{ icon: string; title: string; value: string }>
  } = {},
) {
  const axios = Object.assign(vi.fn(), { request }) as unknown as AxiosInstance
  const endpoint = { method: 'post', url: '/unused' }
  const endpoints: EndPoints = {
    delete: endpoint,
    download: endpoint,
    image: endpoint,
    list: endpoint,
    mkdir: {
      method: options.mkdirMethod ?? 'post',
      url: '/storage/mkdir?name={name}',
    },
    rename: endpoint,
  }

  return mount(FileToolbar, {
    props: {
      axios,
      endpoints,
      item,
      itemstack,
      showNewFolderButton: options.showNewFolderButton ?? true,
      sort,
      storages: options.storages ?? [
        { icon: 'mdi-harddisk', title: '本地', value: 'local' },
        { icon: 'mdi-cloud', title: '网盘', value: 'rclone' },
      ],
    },
    global: {
      stubs: {
        IconBtn: IconBtnStub,
        VBtn: {
          emits: ['click'],
          template: '<button class="toolbar-button" type="button" @click="$emit(`click`)"><slot /></button>',
        },
        VIcon: true,
        VList: { template: '<div><slot /></div>' },
        VListItem: {
          emits: ['click'],
          props: ['disabled'],
          template: '<button class="storage-item" type="button" @click="$emit(`click`)"><slot /></button>',
        },
        VListItemTitle: true,
        VMenu: { template: '<div><slot name="activator" :props="{}" /><slot /></div>' },
        VToolbar: { template: '<div><slot /></div>' },
        VToolbarItems: { template: '<div><slot /></div>' },
      },
    },
  })
}

function openDialogAndCreate(wrapper: ReturnType<typeof mountToolbar>, name = 'new-folder') {
  ;(wrapper.vm as unknown as { openNewFolderDialog: () => void }).openNewFolderDialog()
  const events = mocks.openSharedDialog.mock.calls[0][2] as {
    create: () => Promise<void>
    'update:name': (value: string) => void
  }
  events['update:name'](name)
  return events.create()
}

describe('FileToolbar mkdir', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mdAndUp.value = true
    mocks.openSharedDialog.mockReturnValue({
      close: mocks.close,
      id: 1,
      updateProps: mocks.updateProps,
    })
  })

  it('does not report creation when the API returns a business failure and always finishes loading', async () => {
    const request = vi.fn().mockResolvedValue({ message: '目录已存在', success: false })
    const wrapper = mountToolbar(request)

    await openDialogAndCreate(wrapper)
    await flushPromises()

    expect(wrapper.emitted('loading')).toEqual([[true], [false]])
    expect(wrapper.emitted('foldercreated')).toBeUndefined()
    expect(mocks.toastError).toHaveBeenCalledWith('目录已存在')
    expect(mocks.close).not.toHaveBeenCalled()
  })

  it('does not report creation when the request rejects and always finishes loading with error toast', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const request = vi.fn().mockRejectedValue(new Error('network failed'))
    const wrapper = mountToolbar(request)

    await expect(openDialogAndCreate(wrapper)).resolves.toBeUndefined()
    await flushPromises()

    expect(wrapper.emitted('loading')).toEqual([[true], [false]])
    expect(wrapper.emitted('foldercreated')).toBeUndefined()
    expect(mocks.toastError).toHaveBeenCalledWith('network failed')
    expect(mocks.close).not.toHaveBeenCalled()
  })

  it('prevents duplicate mkdir requests while creatingFolder lock is active', async () => {
    let resolveRequest!: (value: { success: boolean }) => void
    const request = vi.fn(
      () =>
        new Promise<{ success: boolean }>(resolve => {
          resolveRequest = resolve
        }),
    )
    const wrapper = mountToolbar(request)
    ;(wrapper.vm as unknown as { openNewFolderDialog: () => void }).openNewFolderDialog()
    const events = mocks.openSharedDialog.mock.calls[0][2] as {
      create: () => Promise<void>
      'update:name': (value: string) => void
    }
    events['update:name']('locked-folder')

    const firstCall = events.create()
    const secondCall = events.create()
    expect(request).toHaveBeenCalledOnce()

    resolveRequest({ success: true })
    await Promise.all([firstCall, secondCall])
    await flushPromises()
    expect(wrapper.emitted('foldercreated')).toEqual([[]])
  })

  it('submits the current directory and closes only after a successful creation', async () => {
    const request = vi.fn().mockResolvedValue({ success: true })
    const wrapper = mountToolbar(request)

    await openDialogAndCreate(wrapper, 'Season 01')
    await flushPromises()

    expect(request).toHaveBeenCalledWith({
      data: { name: 'downloads', path: '/downloads/', storage: 'local', type: 'dir' },
      method: 'post',
      url: '/storage/mkdir?name=Season 01',
    })
    expect(wrapper.emitted('loading')).toEqual([[true], [false]])
    expect(wrapper.emitted('foldercreated')).toEqual([[]])
    expect(mocks.close).toHaveBeenCalledOnce()
    expect(mocks.updateProps).toHaveBeenCalledWith({ name: 'Season 01' })
  })

  it('closes an open shared dialog when unmounted', () => {
    const wrapper = mountToolbar(vi.fn())
    ;(wrapper.vm as unknown as { openNewFolderDialog: () => void }).openNewFolderDialog()

    wrapper.unmount()

    expect(mocks.close).toHaveBeenCalledOnce()
  })
})

describe('FileToolbar navigation and sorting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mdAndUp.value = true
    mocks.openSharedDialog.mockReturnValue({
      close: mocks.close,
      id: 1,
      updateProps: mocks.updateProps,
    })
  })

  it('emits the opposite sort mode from the first toolbar action', async () => {
    const wrapper = mountToolbar(vi.fn())

    await wrapper.findAll('.icon-btn')[0].trigger('click')

    expect(wrapper.emitted('sortchanged')).toEqual([['time']])
  })

  it('switches time sorting back to name sorting', async () => {
    const wrapper = mountToolbar(vi.fn(), 'time')

    await wrapper.findAll('.icon-btn')[0].trigger('click')

    expect(wrapper.emitted('sortchanged')).toEqual([['name']])
  })

  it('emits only a changed storage selection', async () => {
    const wrapper = mountToolbar(vi.fn())

    await wrapper.findAll('.storage-item')[0].trigger('click')
    await wrapper.findAll('.storage-item')[1].trigger('click')

    expect(wrapper.emitted('storagechanged')).toEqual([['rclone']])
  })

  it('navigates to the parent breadcrumb from the up action', async () => {
    const wrapper = mountToolbar(vi.fn())

    await wrapper.findAll('.icon-btn')[1].trigger('click')

    expect(wrapper.emitted('pathchanged')).toEqual([[{ name: '/', path: '/', storage: 'local', type: 'dir' }]])
  })

  it('navigates directly through root and path breadcrumb actions', async () => {
    const wrapper = mountToolbar(vi.fn())
    const navigationButtons = wrapper.findAll('.toolbar-button')

    await navigationButtons[1].trigger('click')
    await navigationButtons[2].trigger('click')

    expect(wrapper.emitted('pathchanged')).toEqual([
      [{ name: '/', path: '/', storage: 'local', type: 'dir' }],
      [{ name: 'downloads', path: '/downloads/', storage: 'local', type: 'dir' }],
    ])
  })

  it('omits the parent action at storage root and keeps root navigation stable', async () => {
    const root = { name: '/', path: '/', storage: 'local', type: 'dir' }
    const wrapper = mountToolbar(vi.fn(), 'name', root, [root])

    expect(wrapper.findAll('.icon-btn')).toHaveLength(2)
    await wrapper.findAll('.toolbar-button')[1].trigger('click')

    expect(wrapper.emitted('pathchanged')).toEqual([[root]])
  })

  it('falls back to synthesized parent and intermediate breadcrumbs when itemstack is incomplete', async () => {
    const deepItem: FileItem = { name: 'Season 01', path: '/downloads/tv/Season 01/', storage: 'local', type: 'dir' }
    const incompleteStack: FileItem[] = [{ name: '/', path: '/', storage: 'local', type: 'dir' }, deepItem]
    const wrapper = mountToolbar(vi.fn(), 'name', deepItem, incompleteStack)

    // 点击返回上级按钮：应回退到 /downloads/tv/ 而不是传出 undefined
    await wrapper.findAll('.icon-btn')[1].trigger('click')
    // 点击中间面包屑 downloads（toolbar-button[2]）
    await wrapper.findAll('.toolbar-button')[2].trigger('click')

    expect(wrapper.emitted('pathchanged')).toEqual([
      [{ name: 'tv', path: '/downloads/tv/', storage: 'local', type: 'dir' }],
      [{ name: 'downloads', path: '/downloads/', storage: 'local', type: 'dir' }],
    ])
  })

  it('falls back to default error messages and default post method when mkdir omits message or rejects non-Error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const request = vi.fn().mockResolvedValueOnce({ success: false }).mockRejectedValueOnce('plain-failure')
    const wrapper = mountToolbar(request, 'name', undefined, undefined, { mkdirMethod: '' })

    await wrapper.findAll('.icon-btn')[2].trigger('click')
    const events = mocks.openSharedDialog.mock.calls[0][2] as {
      create: () => Promise<void>
      'update:name': (value: string) => void
    }
    events['update:name']('fallback-dir')

    await events.create()
    await flushPromises()
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: 'post' }))
    expect(mocks.toastError).toHaveBeenCalledTimes(1)

    await events.create()
    await flushPromises()
    expect(mocks.toastError).toHaveBeenCalledTimes(2)
  })

  it('renders static storage pill with fallback icon/name for single or unmatched storage and respects showNewFolderButton=false', () => {
    const unmatchedItem: FileItem = { name: 'downloads', path: '/downloads/', storage: 'custom-s3', type: 'dir' }
    const wrapper = mountToolbar(vi.fn(), 'name', unmatchedItem, undefined, {
      showNewFolderButton: false,
      storages: [{ icon: '', title: '', value: 'other' }],
    })

    expect(wrapper.find('.file-toolbar__storage-pill--static').exists()).toBe(true)
    expect(wrapper.find('.file-toolbar__storage-name').text()).toBe('custom-s3')
    expect(wrapper.findAll('.icon-btn')).toHaveLength(2)
    wrapper.unmount()
  })

  it('renders full scrollable breadcrumbs on small screens and synthesizes file and empty-stack root breadcrumbs', async () => {
    mocks.mdAndUp.value = false
    const fileItem: FileItem = {
      name: 'episode01.mkv',
      path: '/downloads/tv/episode01.mkv',
      storage: 'unmatched',
      type: 'file',
    }
    const wrapper = mountToolbar(vi.fn(), 'name', fileItem, [], {
      storages: [
        { icon: '', title: '', value: 'local' },
        { icon: 'mdi-cloud', title: '网盘', value: 'rclone' },
      ],
    })

    const navButtons = wrapper.findAll('.toolbar-button')
    // [0] storage activator, [1] root crumb, [2] downloads, [3] tv, [4] leaf crumb
    expect(navButtons).toHaveLength(5)
    expect(navButtons[4].text()).toBe('episode01.mkv')

    await navButtons[1].trigger('click')
    await navButtons[4].trigger('click')
    await wrapper.findAll('.icon-btn')[1].trigger('click')

    expect(wrapper.emitted('pathchanged')).toEqual([
      [{ fileid: 'root', name: '/', path: '/', storage: 'unmatched', type: 'dir' }],
      [{ name: 'episode01.mkv', path: '/downloads/tv/episode01.mkv', storage: 'unmatched', type: 'file' }],
      [{ name: 'tv', path: '/downloads/tv/', storage: 'unmatched', type: 'dir' }],
    ])
  })
})
