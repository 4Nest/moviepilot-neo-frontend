import type { MediaInfo, TorrentInfo, TransferDirectoryConf } from '@/api/types'
import AddDownloadDialog from '@/components/dialog/AddDownloadDialog.vue'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { HttpResponse, http, type JsonBodyType } from 'msw'
import { defineComponent, h, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const API_BASE_URL = 'http://localhost/api/v1/'

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  doneNProgress: vi.fn(),
  startNProgress: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api/nprogress', () => ({
  configureNProgress: vi.fn(),
  doneNProgress: mocks.doneNProgress,
  startNProgress: mocks.startNProgress,
}))

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => mocks.confirm,
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

type SelectItem = string | { title: string; value: string }

const SelectStub = defineComponent({
  name: 'NativeSelectStub',
  props: {
    items: { type: Array as PropType<SelectItem[]>, default: () => [] },
    label: String,
    modelValue: { type: String, default: '' },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const itemLabel = (item: SelectItem) => (typeof item === 'string' ? item : item.title)
    const itemValue = (item: SelectItem) => (typeof item === 'string' ? item : item.value)

    return () =>
      h('label', [
        props.label,
        h(
          'select',
          {
            'aria-label': props.label,
            'value': props.modelValue ?? '',
            'onChange': (event: Event) => emit('update:modelValue', (event.target as HTMLSelectElement).value),
          },
          [
            h('option', { value: '' }, '默认'),
            ...props.items.map(item => h('option', { key: itemValue(item), value: itemValue(item) }, itemLabel(item))),
          ],
        ),
      ])
  },
})

interface DirectoryOption {
  title: string
  value: string
  label: string
}

// 模拟 VCombobox：选中列表项回传选项对象（与 return-object 行为一致），自由输入回传字符串。
const DirectoryComboboxStub = defineComponent({
  name: 'NativeDirectoryComboboxStub',
  props: {
    items: { type: Array as PropType<DirectoryOption[]>, default: () => [] },
    label: String,
    modelValue: { type: [String, Object] as PropType<string | DirectoryOption | null>, default: null },
  },
  emits: ['update:modelValue'],
  setup(props, { emit, slots }) {
    return () =>
      h('div', [
        h('label', [
          props.label,
          h('input', {
            'aria-label': props.label,
            'value': typeof props.modelValue === 'string' ? props.modelValue : '',
            'onInput': (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
          }),
        ]),
        h(
          'ul',
          props.items.map(item =>
            h('li', { key: item.value }, [
              slots.item?.({
                item: { raw: item, title: item.title, value: item.value },
                props: { onClick: () => emit('update:modelValue', item) },
              }),
            ]),
          ),
        ),
      ])
  },
})

const TextFieldStub = defineComponent({
  name: 'NativeTextFieldStub',
  props: {
    disabled: Boolean,
    label: String,
    modelValue: { type: String, default: '' },
  },
  emits: ['click:append-inner', 'update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('label', [
        props.label,
        h('input', {
          'aria-label': props.label,
          'disabled': props.disabled,
          'value': props.modelValue ?? '',
          'onInput': (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
        }),
        h('button', { onClick: () => emit('click:append-inner'), type: 'button' }, '查询媒体编号'),
      ])
  },
})

const TextareaStub = defineComponent({
  name: 'NativeTextareaStub',
  props: {
    disabled: Boolean,
    label: String,
    modelValue: { type: String, default: '' },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('label', [
        props.label,
        h('textarea', {
          'aria-label': props.label,
          'disabled': props.disabled,
          'value': props.modelValue ?? '',
          'onInput': (event: Event) => emit('update:modelValue', (event.target as HTMLTextAreaElement).value),
        }),
      ])
  },
})

const MediaIdSelectorStub = defineComponent({
  name: 'MediaIdSelector',
  emits: ['close', 'update:modelValue'],
  setup(_props, { emit }) {
    return () =>
      h(
        'button',
        {
          onClick: () => {
            emit('update:modelValue', '1295644')
            emit('close')
          },
          type: 'button',
        },
        '选择媒体编号',
      )
  },
})

const DialogStub = defineComponent({
  name: 'VDialog',
  props: {
    modelValue: { type: Boolean, default: true },
  },
  setup(props, { slots }) {
    return () => (props.modelValue ? h('div', { role: 'dialog' }, slots.default?.()) : null)
  },
})

const DialogCloseButtonStub = defineComponent({
  name: 'VDialogCloseBtn',
  emits: ['click'],
  setup(_props, { emit }) {
    return () => h('button', { onClick: () => emit('click'), type: 'button' }, '关闭')
  },
})

function createDirectory(overrides: Partial<TransferDirectoryConf> = {}): TransferDirectoryConf {
  return {
    download_path: '/downloads/default',
    name: '下载目录',
    priority: 0,
    storage: 'local',
    transfer_type: 'link',
    ...overrides,
  }
}

function createTorrent(overrides: Partial<TorrentInfo> = {}): TorrentInfo {
  return {
    category: 'movie',
    downloadvolumefactor: 1,
    enclosure: 'https://tracker.example/download/goal-6d.torrent',
    freedate: '',
    freedate_diff: '',
    grabs: 3,
    hit_and_run: false,
    imdbid: 'tt0060001',
    labels: [],
    peers: 2,
    pri_order: 0,
    seeders: 10,
    site_name: '测试站',
    site_order: 0,
    site_proxy: false,
    size: 1024,
    title: '测试种子',
    uploadvolumefactor: 1,
    volume_factor: '1x',
    ...overrides,
  }
}

function createMedia(overrides: Partial<MediaInfo> = {}): MediaInfo {
  return {
    episode_run_time: [],
    origin_country: [],
    source: 'themoviedb',
    title: '测试电影',
    tmdb_id: 6001,
    type: '电影',
    ...overrides,
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

function directoriesHandler(directories: TransferDirectoryConf[]) {
  return http.get(new URL('system/setting/public/Directories', API_BASE_URL).href, () =>
    HttpResponse.json({ data: { value: directories }, success: true }),
  )
}

function downloadersHandler(downloaders: Array<{ name: string; type: string }> = []) {
  return http.get(new URL('download/clients', API_BASE_URL).href, () => HttpResponse.json(downloaders))
}

function downloadHandler(
  endpoint: 'download/' | 'download/add',
  response: JsonBodyType | Promise<JsonBodyType>,
  status = 200,
  onRequest: (body: unknown) => void | Promise<void> = () => {},
) {
  return http.post(new URL(endpoint, API_BASE_URL).href, async ({ request }) => {
    await onRequest(await request.json())
    return HttpResponse.json(await response, { status })
  })
}

async function renderDialog({
  directories = [],
  downloader,
  downloaders = [],
  manual = false,
  media,
  recognizeSource = 'themoviedb',
  torrent = createTorrent(),
  torrents,
}: {
  directories?: TransferDirectoryConf[]
  downloader?: string
  downloaders?: Array<{ name: string; type: string }>
  manual?: boolean
  media?: MediaInfo
  recognizeSource?: string
  torrent?: TorrentInfo
  torrents?: TorrentInfo[]
} = {}) {
  const events = {
    close: vi.fn(),
    done: vi.fn(),
    error: vi.fn(),
  }
  server.use(directoriesHandler(directories), downloadersHandler(downloaders))
  const result = await renderWithProviders(AddDownloadDialog, {
    global: {
      stubs: {
        AppCombobox: DirectoryComboboxStub,
        AppSelect: SelectStub,
        AppTextField: TextFieldStub,
        MediaIdSelector: MediaIdSelectorStub,
        VCombobox: DirectoryComboboxStub,
        VDialog: DialogStub,
        VDialogCloseBtn: DialogCloseButtonStub,
        VSelect: SelectStub,
        VTextarea: TextareaStub,
        VTextField: TextFieldStub,
      },
    },
    initialState: {
      globalSettings: {
        data: {
          RECOGNIZE_SOURCE: recognizeSource,
        },
      },
    },
    props: {
      downloader,
      media,
      modelValue: true,
      onClose: events.close,
      onDone: events.done,
      onError: events.error,
      title: media?.title,
      torrent: manual || torrents ? undefined : torrent,
      torrents,
    },
  })

  return { ...result, events, torrent }
}

describe('AddDownloadDialog directories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('normalizes local, remote, missing-storage, and duplicate directories while loading downloaders', async () => {
    const missingStorage = createDirectory({
      download_path: '/downloads/legacy',
      name: '兼容目录',
      storage: undefined as unknown as string,
    })
    const nullStorage = createDirectory({ download_path: '/downloads/null-storage', name: '空存储目录' })
    nullStorage.storage = null as unknown as string

    await renderDialog({
      directories: [
        createDirectory({ download_path: '/downloads/local' }),
        createDirectory({ download_path: '/downloads/remote', name: '远程目录', storage: 'rclone' }),
        missingStorage,
        nullStorage,
        createDirectory({ download_path: '/downloads/empty-storage', name: '空字符串存储', storage: '' }),
        createDirectory({ download_path: '/downloads/remote', name: '重复目录', storage: 'rclone' }),
        createDirectory({ download_path: undefined, name: '无下载路径' }),
      ],
      downloaders: [{ name: '下载器 A', type: 'qbittorrent' }],
    })

    expect(await screen.findByRole('option', { name: '下载目录 (/downloads/local)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '兼容目录 (/downloads/legacy)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '空存储目录 (/downloads/null-storage)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '空字符串存储 (:/downloads/empty-storage)' })).toBeInTheDocument()
    expect(screen.getAllByRole('option', { name: /rclone:\/downloads\/remote/ })).toHaveLength(1)
    expect(screen.getByRole('option', { name: '远程目录 / 重复目录 (rclone:/downloads/remote)' })).toBeInTheDocument()
    expect(screen.queryByText(/undefined:\/downloads\/legacy/)).not.toBeInTheDocument()
    expect(screen.queryByText(/null:\/downloads\/null-storage/)).not.toBeInTheDocument()
    expect(await screen.findByRole('option', { name: '下载器 A' })).toBeInTheDocument()
    expect(screen.getByLabelText('保存目录（自动）')).toHaveValue('')
    expect(screen.getByLabelText('下载器（默认）')).toHaveValue('')
  })
})

describe('AddDownloadDialog submissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.confirm.mockReset().mockResolvedValue(true)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('emits close from the dialog close button', async () => {
    const user = userEvent.setup()
    const { events } = await renderDialog()

    await user.click(screen.getByRole('button', { name: '关闭' }))

    expect(events.close).toHaveBeenCalledOnce()
  })

  it('submits a directly entered media ID through v-model', async () => {
    const submitted = vi.fn()
    server.use(downloadHandler('download/add', { data: null, success: true }, 200, submitted))
    const user = userEvent.setup()

    await renderDialog({ recognizeSource: 'bangumi' })

    await user.click(screen.getByRole('button', { name: '显示高级选项' }))
    await user.type(screen.getByLabelText('Bangumi编号'), '24680')
    await user.click(screen.getByRole('button', { name: '开始下载' }))

    await waitFor(() => expect(submitted).toHaveBeenCalledOnce())
    expect(submitted.mock.calls[0][0]).toMatchObject({
      media_id: '24680',
      media_source: 'bangumi',
    })
  })

  it('submits download/add with advanced media ID once and clears pending state on success', async () => {
    const deferred = createDeferred<JsonBodyType>()
    const submitted = vi.fn()
    server.use(downloadHandler('download/add', deferred.promise, 200, submitted))
    const torrent = createTorrent()
    const user = userEvent.setup()
    const { events } = await renderDialog({
      directories: [createDirectory({ download_path: '/downloads/remote', storage: 'rclone' })],
      downloaders: [{ name: '下载器 A', type: 'qbittorrent' }],
      recognizeSource: 'douban',
      torrent,
    })

    await screen.findByRole('option', { name: '下载器 A' })
    await user.selectOptions(screen.getByLabelText('下载器（默认）'), '下载器 A')
    await user.click(await screen.findByRole('option', { name: '下载目录 (rclone:/downloads/remote)' }))
    await user.click(screen.getByRole('button', { name: '显示高级选项' }))
    await user.click(screen.getByRole('button', { name: '查询媒体编号' }))
    await user.click(screen.getByRole('button', { name: '选择媒体编号' }))
    const submitButton = screen.getByRole('button', { name: '开始下载' })
    await user.click(submitButton)

    await waitFor(() => expect(submitted).toHaveBeenCalledOnce())
    expect(submitted.mock.calls[0][0]).toEqual({
      downloader: '下载器 A',
      media_id: '1295644',
      media_source: 'douban',
      save_path: 'rclone:/downloads/remote',
      torrent_in: torrent,
    })
    expect(submitButton).toBeDisabled()
    expect(submitButton).toHaveTextContent('下载中...')
    await user.click(submitButton)
    expect(submitted).toHaveBeenCalledOnce()
    expect(mocks.startNProgress).toHaveBeenCalledOnce()

    deferred.resolve({ data: null, success: true })
    await waitFor(() => expect(events.done).toHaveBeenCalledWith(torrent.enclosure))

    expect(mocks.toastSuccess).toHaveBeenCalledWith('测试站 测试种子 下载成功！')
    expect(mocks.doneNProgress).toHaveBeenCalledOnce()
    expect(submitButton).not.toBeDisabled()
  })

  it('uses download/ for an existing media without locking unrelated optional fields', async () => {
    const submitted = vi.fn()
    server.use(downloadHandler('download/', { data: null, success: true }, 200, submitted))
    const media = createMedia()
    const torrent = createTorrent()
    const user = userEvent.setup()
    const { events } = await renderDialog({ media, torrent })

    await user.click(screen.getByRole('button', { name: '开始下载' }))

    await waitFor(() => expect(submitted).toHaveBeenCalledOnce())
    expect(submitted.mock.calls[0][0]).toMatchObject({
      downloader: null,
      media_in: media,
      save_path: null,
      torrent_in: torrent,
    })
    expect(events.done).toHaveBeenCalledWith(torrent.enclosure)
    expect(mocks.doneNProgress).toHaveBeenCalledOnce()
  })

  it('treats success:false at HTTP 200 as a business failure', async () => {
    server.use(downloadHandler('download/add', { data: null, message: '下载器拒绝任务', success: false }))
    const user = userEvent.setup()
    const { events } = await renderDialog()

    await user.click(screen.getByRole('button', { name: '开始下载' }))

    await waitFor(() => expect(events.error).toHaveBeenCalledWith('下载器拒绝任务'))
    expect(events.done).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith('测试站 测试种子 下载失败：下载器拒绝任务！')
    expect(mocks.startNProgress).toHaveBeenCalledOnce()
    expect(mocks.doneNProgress).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '开始下载' })).not.toBeDisabled()
  })

  it('clears loading and progress after an HTTP failure without emitting done', async () => {
    server.use(downloadHandler('download/add', { message: '服务异常', success: false }, 500))
    const user = userEvent.setup()
    const { events } = await renderDialog()

    await user.click(screen.getByRole('button', { name: '开始下载' }))

    await waitFor(() => expect(mocks.doneNProgress).toHaveBeenCalledOnce())
    expect(mocks.startNProgress).toHaveBeenCalledOnce()
    expect(events.done).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '开始下载' })).not.toBeDisabled()
  })

  it('shows alias labels, keeps the path-only option, and submits only the path', async () => {
    const submitted = vi.fn()
    server.use(downloadHandler('download/add', { data: null, success: true }, 200, submitted))
    const user = userEvent.setup()
    await renderDialog({
      directories: [
        createDirectory({ download_path: '/downloads/movies', name: '电影库' }),
        createDirectory({ download_path: '/downloads/blank', name: '  ' }),
      ],
    })

    expect(await screen.findByRole('option', { name: '/downloads/blank' })).toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: '电影库 (/downloads/movies)' }))
    expect(screen.getByLabelText('保存目录（自动）')).toHaveValue('/downloads/movies')
    await user.click(screen.getByRole('button', { name: '开始下载' }))

    await waitFor(() => expect(submitted).toHaveBeenCalledOnce())
    expect(submitted.mock.calls[0][0]).toMatchObject({ save_path: '/downloads/movies' })
  })

  it('submits a freely typed sub-path appended to a selected directory without the alias', async () => {
    const submitted = vi.fn()
    server.use(downloadHandler('download/add', { data: null, success: true }, 200, submitted))
    const user = userEvent.setup()
    await renderDialog({ directories: [createDirectory({ download_path: '/downloads/movies', name: '电影库' })] })

    await user.click(await screen.findByRole('option', { name: '电影库 (/downloads/movies)' }))
    await user.type(screen.getByLabelText('保存目录（自动）'), '/2026')
    await user.click(screen.getByRole('button', { name: '开始下载' }))

    await waitFor(() => expect(submitted).toHaveBeenCalledOnce())
    expect(submitted.mock.calls[0][0]).toMatchObject({ save_path: '/downloads/movies/2026' })
  })

  it('submits null save_path after the directory input is cleared', async () => {
    const submitted = vi.fn()
    server.use(downloadHandler('download/add', { data: null, success: true }, 200, submitted))
    const user = userEvent.setup()
    await renderDialog({ directories: [createDirectory({ download_path: '/downloads/movies', name: '电影库' })] })

    await user.click(await screen.findByRole('option', { name: '电影库 (/downloads/movies)' }))
    await user.clear(screen.getByLabelText('保存目录（自动）'))
    await user.click(screen.getByRole('button', { name: '开始下载' }))

    await waitFor(() => expect(submitted).toHaveBeenCalledOnce())
    expect(submitted.mock.calls[0][0]).toMatchObject({ save_path: null })
  })
})

describe('AddDownloadDialog manual torrent input', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.confirm.mockReset().mockResolvedValue(true)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('submits a magnet link with the active downloader and manual success feedback', async () => {
    const submitted = vi.fn()
    server.use(downloadHandler('download/add', { data: { download_id: 'abc' }, success: true }, 200, submitted))
    const user = userEvent.setup()
    const { events } = await renderDialog({
      downloader: 'qb-main',
      downloaders: [{ name: 'qb-main', type: 'qbittorrent' }],
      manual: true,
    })
    const magnet = 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Frieren.S01E01'

    expect(screen.getByText('添加种子任务')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '选择种子文件（可多选）' })).toBeInTheDocument()
    await screen.findByRole('option', { name: 'qb-main' })
    expect(screen.getByLabelText('下载器（默认）')).toHaveValue('qb-main')
    await user.type(screen.getByLabelText('磁力或种子链接（每行一个）'), magnet)
    await user.click(screen.getByRole('button', { name: '开始下载' }))

    await waitFor(() => expect(submitted).toHaveBeenCalledOnce())
    expect(submitted.mock.calls[0][0]).toEqual({
      downloader: 'qb-main',
      save_path: null,
      torrent_in: { enclosure: magnet },
    })
    expect(events.done).toHaveBeenCalledWith(magnet)
    expect(mocks.toastSuccess).toHaveBeenCalledWith('种子下载任务添加成功！')
  })

  it('reads a selected torrent file as Base64 and defaults its recognition title', async () => {
    const submitted = vi.fn()
    server.use(downloadHandler('download/add', { data: { download_id: 'abc' }, success: true }, 200, submitted))
    const user = userEvent.setup()
    const { container } = await renderDialog({ manual: true })
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['torrent-bytes'], 'Frieren.S01E01.torrent', { type: 'application/x-bittorrent' })

    await user.upload(fileInput, file)
    await waitFor(() => expect(screen.getByLabelText('自定义识别标题（可选）')).toHaveValue('Frieren.S01E01'))
    expect(screen.getByRole('button', { name: `已选文件：${file.name}` })).toHaveAttribute('title', file.name)
    expect(screen.getByLabelText('磁力或种子链接（每行一个）')).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '开始下载' }))

    await waitFor(() => expect(submitted).toHaveBeenCalledOnce())
    expect(submitted.mock.calls[0][0]).toMatchObject({
      torrent_in: {
        title: 'Frieren.S01E01',
        torrent_content: btoa('torrent-bytes'),
      },
    })
    expect(submitted.mock.calls[0][0].torrent_in).not.toHaveProperty('enclosure')
  })

  it('submits each line as an independent download task', async () => {
    const submitted = vi.fn()
    server.use(downloadHandler('download/add', { data: { download_id: 'abc' }, success: true }, 200, submitted))
    const user = userEvent.setup()
    const { events } = await renderDialog({ manual: true })
    const first = 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Show.S01E01'
    const second = 'https://tracker.example/Show.S01E02.torrent'

    await user.type(screen.getByLabelText('磁力或种子链接（每行一个）'), `${first}{enter}${second}`)
    await user.click(screen.getByRole('button', { name: '批量下载（2）' }))

    await waitFor(() => expect(submitted).toHaveBeenCalledTimes(2))
    expect(submitted.mock.calls.map(call => call[0].torrent_in.enclosure)).toEqual([first, second])
    expect(submitted.mock.calls.every(call => call[0].media_id === undefined)).toBe(true)
    expect(events.done).toHaveBeenCalledOnce()
    expect(mocks.toastSuccess).toHaveBeenCalledWith('批量添加完成：成功 2 个，未添加 0 个')
  })

  it('reads multiple torrent files and submits their Base64 content independently', async () => {
    const submitted = vi.fn()
    server.use(downloadHandler('download/add', { data: { download_id: 'abc' }, success: true }, 200, submitted))
    const user = userEvent.setup()
    const { container, events } = await renderDialog({ manual: true })
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const files = [
      new File(['first'], 'Show.S01E01.torrent', { type: 'application/x-bittorrent' }),
      new File(['second'], 'Show.S01E02.torrent', { type: 'application/x-bittorrent' }),
    ]

    await user.upload(fileInput, files)
    expect(await screen.findByRole('button', { name: '已选 2 个种子文件' })).toBeInTheDocument()
    expect(screen.queryByLabelText('自定义识别标题（可选）')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '批量下载（2）' }))

    await waitFor(() => expect(submitted).toHaveBeenCalledTimes(2))
    expect(submitted.mock.calls.map(call => call[0].torrent_in.torrent_content)).toEqual([
      btoa('first'),
      btoa('second'),
    ])
    expect(events.done).toHaveBeenCalledOnce()
  })

  it('rejects an empty manual submission before calling the API', async () => {
    const submitted = vi.fn()
    server.use(downloadHandler('download/add', { success: true }, 200, submitted))
    const user = userEvent.setup()
    await renderDialog({ manual: true })

    await user.click(screen.getByRole('button', { name: '开始下载' }))

    expect(mocks.toastError).toHaveBeenCalledWith('请填写磁力/种子链接或选择 .torrent 文件')
    expect(submitted).not.toHaveBeenCalled()
    expect(mocks.startNProgress).not.toHaveBeenCalled()
  })
})

describe('AddDownloadDialog preset batch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.confirm.mockReset().mockResolvedValue(true)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('starts all initial requests before waiting for earlier responses', async () => {
    const firstGate = Promise.withResolvers<void>()
    const secondGate = Promise.withResolvers<void>()
    let calls = 0
    server.use(
      http.post(new URL('download/add', API_BASE_URL).href, async () => {
        calls += 1
        await (calls === 1 ? firstGate.promise : secondGate.promise)
        return HttpResponse.json({ data: { download_id: `id-${calls}` }, success: true })
      }),
    )
    const user = userEvent.setup()
    const { events } = await renderDialog({
      torrents: [createTorrent({ title: '并发资源一' }), createTorrent({ title: '并发资源二' })],
    })

    await user.click(screen.getByRole('button', { name: '批量下载（2）' }))
    await waitFor(() => expect(calls).toBe(2))

    firstGate.resolve()
    secondGate.resolve()
    await waitFor(() => expect(events.done).toHaveBeenCalledOnce())
  })

  it('handles unrecognized confirmation after all initial requests finish', async () => {
    const bodies: Array<{ allow_unrecognized?: boolean; torrent_in: TorrentInfo }> = []
    server.use(
      http.post(new URL('download/add', API_BASE_URL).href, async ({ request }) => {
        const body = (await request.json()) as { allow_unrecognized?: boolean; torrent_in: TorrentInfo }
        bodies.push(body)
        if (body.torrent_in.title === '未识别资源' && !body.allow_unrecognized)
          return HttpResponse.json({
            data: { requires_confirmation: true },
            message: '无法识别媒体信息',
            success: false,
          })
        return HttpResponse.json({ data: { download_id: 'abc' }, success: true })
      }),
    )
    const first = createTorrent({ title: '未识别资源' })
    const second = createTorrent({ title: '已识别资源' })
    const user = userEvent.setup()
    const { events } = await renderDialog({ torrents: [first, second] })

    await user.click(screen.getByRole('button', { name: '批量下载（2）' }))

    await waitFor(() => expect(events.done).toHaveBeenCalledWith([first, second]))
    expect(mocks.confirm).toHaveBeenCalledOnce()
    expect(bodies).toHaveLength(3)
    expect(bodies.slice(0, 2).every(body => !body.allow_unrecognized)).toBe(true)
    expect(bodies[2]).toMatchObject({ allow_unrecognized: true, torrent_in: { title: '未识别资源' } })
  })

  it('continues after an item failure and returns only successful torrents', async () => {
    const bodies: Array<{ torrent_in: TorrentInfo }> = []
    server.use(
      http.post(new URL('download/add', API_BASE_URL).href, async ({ request }) => {
        const body = (await request.json()) as { torrent_in: TorrentInfo }
        bodies.push(body)
        return HttpResponse.json(
          body.torrent_in.title === '失败资源'
            ? { data: null, message: '任务添加失败', success: false }
            : { data: { download_id: 'abc' }, success: true },
        )
      }),
    )
    const first = createTorrent({ title: '成功资源' })
    const second = createTorrent({ title: '失败资源' })
    const user = userEvent.setup()
    const { events } = await renderDialog({ torrents: [first, second] })

    expect(screen.getByText('批量添加下载')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '批量下载（2）' }))

    await waitFor(() => expect(bodies).toHaveLength(2))
    expect(bodies.map(body => body.torrent_in.title)).toEqual(['成功资源', '失败资源'])
    expect(events.done).toHaveBeenCalledWith([first])
    expect(mocks.toastError).toHaveBeenCalledWith('批量添加完成：成功 1 个，未添加 1 个 任务添加失败')
  })
})

describe('AddDownloadDialog unrecognized confirmation', () => {
  const confirmationResponse = { data: { requires_confirmation: true }, message: '无法识别媒体信息', success: false }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.confirm.mockReset().mockResolvedValue(true)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('retries the same request with allow_unrecognized after the user confirms', async () => {
    const bodies: unknown[] = []
    let calls = 0
    server.use(
      http.post(new URL('download/add', API_BASE_URL).href, async ({ request }) => {
        bodies.push(await request.json())
        calls += 1
        return HttpResponse.json(calls === 1 ? confirmationResponse : { data: { download_id: 'abc' }, success: true })
      }),
    )
    const torrent = createTorrent()
    const user = userEvent.setup()
    const { events } = await renderDialog({
      directories: [createDirectory({ download_path: '/downloads/movies', name: '电影库' })],
      downloaders: [{ name: '下载器 A', type: 'qbittorrent' }],
      torrent,
    })

    await screen.findByRole('option', { name: '下载器 A' })
    await user.selectOptions(screen.getByLabelText('下载器（默认）'), '下载器 A')
    await user.click(screen.getByRole('option', { name: '电影库 (/downloads/movies)' }))
    await user.click(screen.getByRole('button', { name: '开始下载' }))

    await waitFor(() => expect(events.done).toHaveBeenCalledWith(torrent.enclosure))
    expect(mocks.confirm).toHaveBeenCalledOnce()
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ type: 'warn' }))
    expect(bodies).toHaveLength(2)
    expect(bodies[0]).not.toHaveProperty('allow_unrecognized')
    expect(bodies[1]).toEqual({ ...(bodies[0] as object), allow_unrecognized: true })
    expect(bodies[1]).toMatchObject({
      downloader: '下载器 A',
      save_path: '/downloads/movies',
      torrent_in: torrent,
    })
    expect(events.error).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(mocks.toastSuccess).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '开始下载' })).not.toBeDisabled()
  })

  it('keeps the dialog open and restores the button when the user cancels', async () => {
    const submitted = vi.fn()
    server.use(downloadHandler('download/add', confirmationResponse, 200, submitted))
    mocks.confirm.mockResolvedValue(false)
    const user = userEvent.setup()
    const { events } = await renderDialog()

    await user.click(screen.getByRole('button', { name: '开始下载' }))

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce())
    await waitFor(() => expect(mocks.doneNProgress).toHaveBeenCalled())
    expect(submitted).toHaveBeenCalledOnce()
    expect(events.done).not.toHaveBeenCalled()
    expect(events.error).not.toHaveBeenCalled()
    expect(events.close).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '开始下载' })).not.toBeDisabled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('also confirms for download/ when media is provided', async () => {
    const bodies: unknown[] = []
    let calls = 0
    server.use(
      http.post(new URL('download/', API_BASE_URL).href, async ({ request }) => {
        bodies.push(await request.json())
        calls += 1
        return HttpResponse.json(calls === 1 ? confirmationResponse : { data: null, success: true })
      }),
    )
    const user = userEvent.setup()
    const { events, torrent } = await renderDialog({ media: createMedia() })

    await user.click(screen.getByRole('button', { name: '开始下载' }))

    await waitFor(() => expect(events.done).toHaveBeenCalledWith(torrent.enclosure))
    expect(bodies[1]).toMatchObject({ allow_unrecognized: true })
  })

  it('retries a manual magnet download with allow_unrecognized after confirmation', async () => {
    const bodies: unknown[] = []
    let calls = 0
    server.use(
      http.post(new URL('download/add', API_BASE_URL).href, async ({ request }) => {
        bodies.push(await request.json())
        calls += 1
        return HttpResponse.json(calls === 1 ? confirmationResponse : { data: { download_id: 'abc' }, success: true })
      }),
    )
    const user = userEvent.setup()
    const { events } = await renderDialog({ manual: true })
    const magnet = 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Unknown.Show.S01E01'

    await user.type(screen.getByLabelText('磁力或种子链接（每行一个）'), magnet)
    await user.click(screen.getByRole('button', { name: '开始下载' }))

    await waitFor(() => expect(events.done).toHaveBeenCalledWith(magnet))
    expect(mocks.confirm).toHaveBeenCalledOnce()
    expect(bodies).toHaveLength(2)
    expect(bodies[0]).toMatchObject({ torrent_in: { enclosure: magnet } })
    expect(bodies[0]).not.toHaveProperty('allow_unrecognized')
    expect(bodies[1]).toEqual({ ...(bodies[0] as object), allow_unrecognized: true })
  })

  it('does not ask for confirmation on an ordinary business failure', async () => {
    server.use(downloadHandler('download/add', { data: null, message: '下载器拒绝任务', success: false }))
    const user = userEvent.setup()
    const { events } = await renderDialog()

    await user.click(screen.getByRole('button', { name: '开始下载' }))

    await waitFor(() => expect(events.error).toHaveBeenCalledWith('下载器拒绝任务'))
    expect(mocks.confirm).not.toHaveBeenCalled()
  })

  it('surfaces a failure of the confirmed retry as an ordinary error without asking again', async () => {
    let calls = 0
    server.use(
      http.post(new URL('download/add', API_BASE_URL).href, () => {
        calls += 1
        return HttpResponse.json(
          calls === 1 ? confirmationResponse : { data: null, message: '任务添加失败', success: false },
        )
      }),
    )
    const user = userEvent.setup()
    const { events } = await renderDialog()

    await user.click(screen.getByRole('button', { name: '开始下载' }))

    await waitFor(() => expect(events.error).toHaveBeenCalledWith('任务添加失败'))
    expect(mocks.confirm).toHaveBeenCalledOnce()
    expect(calls).toBe(2)
    expect(screen.getByRole('button', { name: '开始下载' })).not.toBeDisabled()
  })
})
