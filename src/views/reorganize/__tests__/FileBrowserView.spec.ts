import FileBrowserView from '@/views/reorganize/FileBrowserView.vue'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: mocks.apiGet,
    post: mocks.apiPost,
  },
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    success: mocks.toastSuccess,
  }),
}))

const FileBrowserStub = defineComponent({
  name: 'FileBrowser',
  emits: ['pathchanged', 'storagechanged', 'save-default-path'],
  props: ['item', 'itemstack', 'storages', 'defaultPath', 'quickDirectories', 'savingDefaultPath'],
  template: '<div data-testid="file-browser" />',
})

interface MockDirectory {
  download_path?: string
  library_path?: string
  library_storage?: string
  name?: string
  storage: string
}

function mockSettings(
  storages: Array<{ name: string; type: string }> | null,
  directories: MockDirectory[] | null,
  defaultPathsResponse: { data?: { value?: Record<string, string> | null }; success: boolean } | Error = {
    data: { value: null },
    success: true,
  },
) {
  mocks.apiGet.mockImplementation((endpoint: string) => {
    if (endpoint === 'system/setting/public/Storages') {
      return Promise.resolve({ data: { value: storages }, success: true })
    }
    if (endpoint === 'system/setting/public/Directories') {
      return Promise.resolve({ data: { value: directories }, success: true })
    }
    if (endpoint === '/user/config/FileManagerDefaultPaths') {
      if (defaultPathsResponse instanceof Error) {
        return Promise.reject(defaultPathsResponse)
      }
      return Promise.resolve(defaultPathsResponse)
    }
    throw new Error(`Unexpected GET ${endpoint}`)
  })
}

async function mountView() {
  const wrapper = mount(FileBrowserView, {
    global: {
      stubs: {
        FileBrowser: FileBrowserStub,
      },
    },
  })
  await flushPromises()
  return wrapper
}

describe('FileBrowserView initialization', () => {
  beforeEach(() => {
    localStorage.clear()
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
  })

  it('falls back to the storage root when Directories is null', async () => {
    mockSettings([{ name: '本地', type: 'local' }], null)
    const wrapper = await mountView()

    const browser = wrapper.getComponent(FileBrowserStub)
    expect(browser.props('item')).toMatchObject({
      name: '/',
      path: '/',
      storage: 'local',
      type: 'dir',
    })
    expect(browser.props('itemstack')).toEqual([
      {
        fileid: 'root',
        name: '/',
        path: '/',
        storage: 'local',
        type: 'dir',
      },
    ])
  })

  it('falls back to local root when Storages and Directories are null', async () => {
    mockSettings(null, null)
    const browser = (await mountView()).getComponent(FileBrowserStub)

    expect(browser.props('storages')).toEqual([])
    expect(browser.props('item')).toMatchObject({
      name: '/',
      path: '/',
      storage: 'local',
      type: 'dir',
    })
  })

  it('uses the cached available storage and the common configured path', async () => {
    localStorage.setItem('fileBrowserView.activeStorage', 'rclone')
    mockSettings(
      [
        { name: '本地', type: 'local' },
        { name: '网盘', type: 'rclone' },
      ],
      [
        { download_path: '/media/movies', storage: 'rclone' },
        { download_path: '/media/tv', storage: 'rclone' },
        { download_path: '/downloads', storage: 'local' },
      ],
    )

    const browser = (await mountView()).getComponent(FileBrowserStub)

    expect(browser.props('item')).toMatchObject({
      name: 'media',
      path: '/media/',
      storage: 'rclone',
    })
    expect(browser.props('itemstack')).toHaveLength(2)
  })

  it('filters unavailable storage entries and selects the most populated available storage', async () => {
    mockSettings(
      [
        { name: '本地', type: 'local' },
        { name: '115', type: 'u115' },
      ],
      [
        { download_path: '/ignored', storage: 'missing' },
        { download_path: '/one', storage: 'local' },
        { download_path: '/shows/a', storage: 'u115' },
        { download_path: '/shows/b', storage: 'u115' },
        { storage: 'u115' },
      ],
    )

    const browser = (await mountView()).getComponent(FileBrowserStub)

    expect(browser.props('item')).toMatchObject({
      name: 'shows',
      path: '/shows/',
      storage: 'u115',
    })
  })

  it('updates storage persistence and rebuilds the root breadcrumb on navigation', async () => {
    mockSettings(
      [
        { name: '本地', type: 'local' },
        { name: '网盘', type: 'rclone' },
      ],
      [{ download_path: '/downloads/tv', storage: 'local' }],
    )
    const browser = (await mountView()).getComponent(FileBrowserStub)

    browser.vm.$emit('pathchanged', {
      fileid: 'remote-root',
      name: '/',
      path: '/',
      storage: 'rclone',
      type: 'dir',
    })
    await flushPromises()

    expect(localStorage.getItem('fileBrowserView.activeStorage')).toBe('rclone')
    expect(browser.props('item')).toMatchObject({ path: '/', storage: 'rclone' })
    expect(browser.props('itemstack')).toEqual([
      {
        fileid: 'remote-root',
        name: '/',
        path: '/',
        storage: 'rclone',
        type: 'dir',
      },
    ])
  })

  it('truncates the breadcrumb stack when navigating to an existing ancestor', async () => {
    mockSettings([{ name: '本地', type: 'local' }], [{ download_path: '/downloads/tv', storage: 'local' }])
    const browser = (await mountView()).getComponent(FileBrowserStub)

    browser.vm.$emit('pathchanged', {
      name: 'downloads',
      path: '/downloads/',
      storage: 'local',
      type: 'dir',
    })
    await flushPromises()

    expect(browser.props('itemstack').map((item: { path: string }) => item.path)).toEqual(['/', '/downloads/'])
  })

  it('rebuilds the full ancestor breadcrumb stack when jumping directly to a deep directory', async () => {
    mockSettings([{ name: '本地', type: 'local' }], null)
    const browser = (await mountView()).getComponent(FileBrowserStub)

    browser.vm.$emit('pathchanged', {
      name: 'Season 01',
      path: '/downloads/tv/Season 01/',
      storage: 'local',
      type: 'dir',
    })
    await flushPromises()

    expect(browser.props('itemstack')).toEqual([
      { fileid: 'root', name: '/', path: '/', storage: 'local', type: 'dir' },
      { name: 'downloads', path: '/downloads/', storage: 'local', type: 'dir' },
      { name: 'tv', path: '/downloads/tv/', storage: 'local', type: 'dir' },
      { name: 'Season 01', path: '/downloads/tv/Season 01/', storage: 'local', type: 'dir' },
    ])
  })

  it('prefers server default path over local cache and configured download directories, and syncs back to localStorage', async () => {
    localStorage.setItem('MP_FILE_MANAGER_DEFAULT_PATHS', JSON.stringify({ local: '/stale/local/' }))
    mockSettings(
      [{ name: '本地', type: 'local' }],
      [{ download_path: '/downloads/anime', name: '动漫下载', storage: 'local' }],
      { data: { value: { local: '/media/Raw' } }, success: true },
    )

    const browser = (await mountView()).getComponent(FileBrowserStub)

    expect(browser.props('item')).toMatchObject({
      name: 'Raw',
      path: '/media/Raw/',
      storage: 'local',
      type: 'dir',
    })
    expect(browser.props('defaultPath')).toBe('/media/Raw/')
    expect(JSON.parse(localStorage.getItem('MP_FILE_MANAGER_DEFAULT_PATHS') || '{}')).toEqual({
      local: '/media/Raw/',
    })
  })

  it('falls back to localStorage default paths when server config fails or is empty', async () => {
    localStorage.setItem('MP_FILE_MANAGER_DEFAULT_PATHS', JSON.stringify({ local: '/cached/raw/' }))
    mockSettings(
      [{ name: '本地', type: 'local' }],
      [{ download_path: '/downloads/tv', storage: 'local' }],
      new Error('config service unavailable'),
    )

    const browser = (await mountView()).getComponent(FileBrowserStub)

    expect(browser.props('item')).toMatchObject({
      name: 'raw',
      path: '/cached/raw/',
      storage: 'local',
    })
    expect(browser.props('defaultPath')).toBe('/cached/raw/')
  })

  it('navigates to target storage default path, configured common path, or root when switching storages', async () => {
    mockSettings(
      [
        { name: '本地', type: 'local' },
        { name: '115', type: 'u115' },
        { name: '网盘', type: 'rclone' },
      ],
      [
        { download_path: '/downloads/local', name: '本地下载', storage: 'local' },
        { download_path: '/cloud/movies', name: '电影', storage: 'rclone' },
        { download_path: '/cloud/tv', name: '剧集', storage: 'rclone' },
      ],
      { data: { value: { u115: '/115/Anime/' } }, success: true },
    )

    const browser = (await mountView()).getComponent(FileBrowserStub)

    // 切到已配置默认打开路径的 u115
    browser.vm.$emit('storagechanged', 'u115')
    await flushPromises()
    expect(browser.props('item')).toMatchObject({
      name: 'Anime',
      path: '/115/Anime/',
      storage: 'u115',
    })
    expect(browser.props('defaultPath')).toBe('/115/Anime/')

    // 切到未配置默认路径但有多个下载目录的 rclone -> 回退公共路径 /cloud/
    browser.vm.$emit('storagechanged', 'rclone')
    await flushPromises()
    expect(browser.props('item')).toMatchObject({
      name: 'cloud',
      path: '/cloud/',
      storage: 'rclone',
    })
    expect(browser.props('defaultPath')).toBe('')

    // 切到既无默认路径又无目录配置的存储 -> 回退根目录 /
    browser.vm.$emit('storagechanged', 'smb')
    await flushPromises()
    expect(browser.props('item')).toMatchObject({
      name: '/',
      path: '/',
      storage: 'smb',
    })
  })

  it('deduplicates configured download and library paths into quickDirectories for the active storage', async () => {
    mockSettings(
      [
        { name: '本地', type: 'local' },
        { name: '网盘', type: 'rclone' },
      ],
      [
        {
          download_path: '/media/downloads',
          library_path: '/media/library/movies',
          name: '电影',
          storage: 'local',
        },
        {
          download_path: '/media/downloads/',
          library_path: '/remote/library',
          library_storage: 'rclone',
          name: '跨盘电影',
          storage: 'local',
        },
      ],
    )

    const browser = (await mountView()).getComponent(FileBrowserStub)

    expect(browser.props('quickDirectories')).toEqual([
      { kind: 'download', name: '电影', path: '/media/downloads/' },
      { kind: 'library', name: '电影（媒体库）', path: '/media/library/movies/' },
    ])
  })

  it('saves and clears default path with server authority, localStorage sync and error handling', async () => {
    mockSettings([{ name: '本地', type: 'local' }], [{ download_path: '/downloads', storage: 'local' }])
    const browser = (await mountView()).getComponent(FileBrowserStub)

    // 业务失败不更新状态与本地缓存
    mocks.apiPost.mockResolvedValueOnce({ message: '无权限保存', success: false })
    browser.vm.$emit('save-default-path', '/media/Raw')
    await flushPromises()
    expect(mocks.toastError).toHaveBeenCalledWith('无权限保存')
    expect(browser.props('defaultPath')).toBe('')
    expect(localStorage.getItem('MP_FILE_MANAGER_DEFAULT_PATHS')).toBeNull()

    // 保存成功更新状态、本地缓存并弹成功提示
    mocks.apiPost.mockResolvedValueOnce({ success: true })
    browser.vm.$emit('save-default-path', '/media/Raw')
    await flushPromises()
    expect(mocks.apiPost).toHaveBeenCalledWith('/user/config/FileManagerDefaultPaths', {
      local: '/media/Raw/',
    })
    expect(browser.props('defaultPath')).toBe('/media/Raw/')
    expect(JSON.parse(localStorage.getItem('MP_FILE_MANAGER_DEFAULT_PATHS') || '{}')).toEqual({
      local: '/media/Raw/',
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('已保存默认打开路径')

    // 清除默认路径成功
    mocks.apiPost.mockResolvedValueOnce({ success: true })
    browser.vm.$emit('save-default-path', '')
    await flushPromises()
    expect(mocks.apiPost).toHaveBeenLastCalledWith('/user/config/FileManagerDefaultPaths', {})
    expect(browser.props('defaultPath')).toBe('')
    expect(JSON.parse(localStorage.getItem('MP_FILE_MANAGER_DEFAULT_PATHS') || '{}')).toEqual({})
    expect(mocks.toastSuccess).toHaveBeenCalledWith('已清除默认打开路径')

    // 网络异常弹出错误提示
    mocks.apiPost.mockRejectedValueOnce(new Error('network error'))
    browser.vm.$emit('save-default-path', '/media/TV')
    await flushPromises()
    expect(mocks.toastError).toHaveBeenCalledWith('network error')
    expect(browser.props('defaultPath')).toBe('')
  })

  it('does not clip outer surface shadows on .file-browser-view', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync('src/views/reorganize/FileBrowserView.vue', 'utf8')
    const styleBlock = source.match(/\.file-browser-view\s*\{[\s\S]*?\}/)?.[0] ?? ''
    expect(styleBlock).not.toContain('overflow: hidden')
  })
})
