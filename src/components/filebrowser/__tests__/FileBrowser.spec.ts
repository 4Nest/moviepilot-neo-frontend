import FileBrowser from '@/components/filebrowser/FileBrowser.vue'
import type { EndPoints } from '@/api/types'
import { createTestingPinia } from '@pinia/testing'
import { mount } from '@vue/test-utils'
import { defineComponent, h, KeepAlive, nextTick, ref } from 'vue'
import type { AxiosInstance } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  openNewFolderDialog: vi.fn(),
}))

const FileToolbarStub = defineComponent({
  name: 'FileToolbar',
  props: ['showNewFolderButton', 'sort', 'defaultPath', 'quickDirectories', 'savingDefaultPath'],
  emits: ['foldercreated', 'pathchanged', 'sortchanged', 'storagechanged', 'save-default-path'],
  setup(_props, { emit, expose }) {
    expose({ openNewFolderDialog: mocks.openNewFolderDialog })
    return () =>
      h('div', [
        h('button', { class: 'emit-sort', onClick: () => emit('sortchanged', 'time') }),
        h('button', { class: 'emit-storage', onClick: () => emit('storagechanged', 'rclone') }),
        h('button', {
          class: 'emit-path',
          onClick: () =>
            emit('pathchanged', {
              name: 'movies',
              path: '/movies/',
              storage: 'local',
              type: 'dir',
            }),
        }),
        h('button', { class: 'emit-folder', onClick: () => emit('foldercreated') }),
        h('button', { class: 'emit-save-default', onClick: () => emit('save-default-path', '/media/Raw/') }),
      ])
  },
})

const FileNavigatorStub = defineComponent({
  name: 'FileNavigator',
  props: ['currentPath', 'items'],
  emits: ['navigate'],
  template: '<div />',
})

const FileListStub = defineComponent({
  name: 'FileList',
  props: ['refreshpending', 'sort', 'showTree'],
  emits: ['items-updated', 'loading', 'pathchanged', 'refreshed', 'switch-tree', 'sortchanged', 'create-folder'],
  template:
    '<div><button class="emit-loading" @click="$emit(`loading`, 1)" /><button class="emit-tree" @click="$emit(`switch-tree`, true)" /><button class="emit-list-sort" @click="$emit(`sortchanged`, `time`)" /><button class="emit-list-create" @click="$emit(`create-folder`)" /></div>',
})

function createBrowserProps() {
  const request = vi.fn()
  const axios = Object.assign(vi.fn(), { request }) as unknown as AxiosInstance
  const endpoint = { method: 'post', url: '/unused' }
  const endpoints: EndPoints = {
    delete: endpoint,
    download: endpoint,
    image: endpoint,
    list: endpoint,
    mkdir: endpoint,
    rename: endpoint,
  }

  return {
    axios,
    endpoints,
    item: { name: '/', path: '/', storage: 'local', type: 'dir' as const },
    itemstack: [],
    storages: [{ name: '本地', type: 'local' }],
  }
}

const browserStubs = {
  FileList: FileListStub,
  FileNavigator: FileNavigatorStub,
  FileToolbar: FileToolbarStub,
  Teleport: true,
  VFab: true,
  VIcon: true,
  VProgressLinear: { template: '<div class="file-browser-progress" />' },
}

function mountBrowser() {
  return mount(FileBrowser, {
    props: createBrowserProps(),
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn })],
      stubs: browserStubs,
    },
  })
}

describe('FileBrowser drag lifecycle', () => {
  beforeEach(() => {
    mocks.openNewFolderDialog.mockReset()
    localStorage.setItem('fileBrowser.showDirTree', 'true')
  })

  it('removes document listeners and global selection styles when unmounted during a drag', async () => {
    const removeEventListener = vi.spyOn(document, 'removeEventListener')
    const wrapper = mountBrowser()
    await wrapper.get('.divider').trigger('mousedown', { clientX: 320 })

    expect(document.body.style.cursor).toBe('col-resize')
    expect(document.body.style.userSelect).toBe('none')
    expect(document.body.style.webkitUserSelect).toBe('none')
    expect((document.body.style as CSSStyleDeclaration & { MozUserSelect: string }).MozUserSelect).toBe('none')

    wrapper.unmount()

    expect(removeEventListener).toHaveBeenCalledWith('mousemove', expect.any(Function))
    expect(removeEventListener).toHaveBeenCalledWith('mouseup', expect.any(Function))
    expect(removeEventListener).toHaveBeenCalledWith('selectstart', expect.any(Function))
    expect(document.body.style.cursor).toBe('')
    expect(document.body.style.userSelect).toBe('')
    expect(document.body.style.webkitUserSelect).toBe('')
    expect((document.body.style as CSSStyleDeclaration & { MozUserSelect: string }).MozUserSelect).toBe('')
  })

  it('cleans document listeners and global selection styles when deactivated during a drag', async () => {
    const removeEventListener = vi.spyOn(document, 'removeEventListener')
    const active = ref(true)
    const Host = defineComponent({
      setup() {
        return () =>
          h(KeepAlive, null, {
            default: () => (active.value ? h(FileBrowser, createBrowserProps()) : h('div', 'inactive')),
          })
      },
    })
    const wrapper = mount(Host, {
      global: {
        plugins: [createTestingPinia({ createSpy: vi.fn })],
        stubs: browserStubs,
      },
    })
    await wrapper.get('.divider').trigger('mousedown', { clientX: 320 })

    expect(document.body.style.cursor).toBe('col-resize')
    expect(document.body.style.userSelect).toBe('none')

    active.value = false
    await nextTick()

    expect(removeEventListener).toHaveBeenCalledWith('mousemove', expect.any(Function))
    expect(removeEventListener).toHaveBeenCalledWith('mouseup', expect.any(Function))
    expect(removeEventListener).toHaveBeenCalledWith('selectstart', expect.any(Function))
    expect(document.body.style.cursor).toBe('')
    expect(document.body.style.userSelect).toBe('')
    expect(document.body.style.webkitUserSelect).toBe('')
    expect((document.body.style as CSSStyleDeclaration & { MozUserSelect: string }).MozUserSelect).toBe('')
  })

  it('clamps drag width, persists it, and cleans up on mouseup', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 })
    const wrapper = mountBrowser()
    await wrapper.get('.divider').trigger('mousedown', { clientX: 300 })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 1200 }))
    await nextTick()

    expect(wrapper.getComponent(FileNavigatorStub).attributes('style')).toContain('width: 600px')
    expect(localStorage.getItem('fileBrowser.navigatorWidth')).toBe('600')

    document.dispatchEvent(new MouseEvent('mouseup'))
    expect(document.body.style.cursor).toBe('')
    expect(document.body.style.userSelect).toBe('')
  })

  it('prevents selection while dragging', async () => {
    const wrapper = mountBrowser()
    await wrapper.get('.divider').trigger('mousedown', { clientX: 300 })
    const selectEvent = new Event('selectstart', { bubbles: true, cancelable: true })

    document.dispatchEvent(selectEvent)

    expect(selectEvent.defaultPrevented).toBe(true)
    document.dispatchEvent(new MouseEvent('mouseup'))
  })
})

describe('FileBrowser state and child contracts', () => {
  beforeEach(() => {
    mocks.openNewFolderDialog.mockReset()
  })

  it('restores sorting and directory tree preferences from localStorage', () => {
    localStorage.setItem('fileBrowser.sort', 'time')
    localStorage.setItem('fileBrowser.showDirTree', 'true')
    localStorage.setItem('fileBrowser.navigatorWidth', '360')

    const wrapper = mountBrowser()

    expect(wrapper.getComponent(FileToolbarStub).props('sort')).toBe('time')
    expect(wrapper.getComponent(FileListStub).props('sort')).toBe('time')
    expect(wrapper.getComponent(FileListStub).props('showTree')).toBe(true)
    expect(wrapper.getComponent(FileNavigatorStub).attributes('style')).toContain('width: 360px')
  })

  it('persists sort and tree changes and requests a refresh after sorting', async () => {
    const wrapper = mountBrowser()

    await wrapper.get('.emit-sort').trigger('click')
    await wrapper.get('.emit-tree').trigger('click')
    await nextTick()

    expect(localStorage.getItem('fileBrowser.sort')).toBe('time')
    expect(localStorage.getItem('fileBrowser.showDirTree')).toBe('true')
    expect(wrapper.getComponent(FileListStub).props('refreshpending')).toBe(true)
    expect(wrapper.findComponent(FileNavigatorStub).exists()).toBe(true)
  })

  it('forwards storage, path and default path save events', async () => {
    const wrapper = mountBrowser()

    await wrapper.get('.emit-storage').trigger('click')
    await wrapper.get('.emit-path').trigger('click')
    await wrapper.get('.emit-save-default').trigger('click')

    expect(wrapper.emitted('storagechanged')).toEqual([['rclone']])
    expect(wrapper.emitted('pathchanged')).toEqual([
      [{ name: 'movies', path: '/movies/', storage: 'local', type: 'dir' }],
    ])
    expect(wrapper.emitted('save-default-path')).toEqual([['/media/Raw/']])
  })

  it('forwards list column sort changes and opens new-folder dialog from empty-state action', async () => {
    const wrapper = mountBrowser()

    await wrapper.get('.emit-list-sort').trigger('click')
    await wrapper.get('.emit-list-create').trigger('click')
    await nextTick()

    expect(localStorage.getItem('fileBrowser.sort')).toBe('time')
    expect(wrapper.getComponent(FileListStub).props('refreshpending')).toBe(true)
    expect(mocks.openNewFolderDialog).toHaveBeenCalledOnce()
  })

  it('tracks child loading and refresh lifecycle without invalid native loading attribute', async () => {
    const wrapper = mountBrowser()

    expect(wrapper.find('.file-browser-progress').exists()).toBe(false)
    expect(wrapper.get('.file-browser-shell').attributes('loading')).toBeUndefined()

    await wrapper.get('.emit-loading').trigger('click')
    expect(wrapper.get('.file-browser-shell').attributes('aria-busy')).toBe('true')
    expect(wrapper.find('.file-browser-progress').exists()).toBe(true)

    await wrapper.get('.emit-folder').trigger('click')
    expect(wrapper.getComponent(FileListStub).props('refreshpending')).toBe(true)
    wrapper.getComponent(FileListStub).vm.$emit('refreshed')
    await nextTick()
    expect(wrapper.getComponent(FileListStub).props('refreshpending')).toBe(false)
  })

  it('forwards the latest file list snapshot to the directory navigator', async () => {
    localStorage.setItem('fileBrowser.showDirTree', 'true')
    const wrapper = mountBrowser()
    const items = [{ name: 'shows', path: '/shows', storage: 'local', type: 'dir' }]

    wrapper.getComponent(FileListStub).vm.$emit('items-updated', items)
    await nextTick()

    expect(wrapper.getComponent(FileNavigatorStub).props('items')).toEqual(items)
  })

  it('always keeps the new-folder entry inline on the toolbar without floating FAB', () => {
    const wrapper = mountBrowser()

    expect(wrapper.getComponent(FileToolbarStub).props('showNewFolderButton')).toBe(true)
    expect(wrapper.findComponent({ name: 'VFab' }).exists()).toBe(false)
  })
})
