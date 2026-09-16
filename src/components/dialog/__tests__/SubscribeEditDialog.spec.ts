import type { Subscribe, SubscribeVersionRule } from '@/api/types'
import SubscribeEditDialog from '@/components/dialog/SubscribeEditDialog.vue'
import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import {
  createSubscribe,
  createSubscribeDirectory,
  createSubscribeDownloader,
  createSubscribeRuleGroup,
  createSubscribeSite,
} from '@tests/support/factories/subscribe'
import {
  defaultSubscribeConfigHandler,
  deleteSubscribeByIdHandler,
  saveDefaultSubscribeConfigHandler,
  subscribeApiUrls,
  subscribeDetailsHandler,
  subscribeDialogOptionHandlers,
  type SubscribeDialogOptions,
  type SubscribeMediaType,
  updateSubscribeHandler,
} from '@tests/support/msw/handlers/subscribe'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => mocks.confirm,
}))

interface DialogProps {
  default?: boolean
  subid?: number
  type?: SubscribeMediaType
  versionId?: string
  addVersion?: boolean
}

async function renderDialog(props: DialogProps) {
  const events = {
    close: vi.fn(),
    remove: vi.fn(),
    save: vi.fn(),
  }
  const result = await renderWithProviders(SubscribeEditDialog, {
    props: {
      modelValue: true,
      ...props,
      onClose: events.close,
      onRemove: events.remove,
      onSave: events.save,
    },
    global: {
      components: {
        VDialogCloseBtn: DialogCloseBtn,
      },
    },
  })
  return { ...result, events }
}

function useDialogOptions(options: SubscribeDialogOptions = {}) {
  server.use(...subscribeDialogOptionHandlers(options))
}

describe('SubscribeEditDialog', () => {
  beforeEach(() => {
    mocks.confirm.mockResolvedValue(true)
  })

  it('loads a TV subscription, normalizes flags, and exposes episode groups', async () => {
    const record = createSubscribe({
      best_version: 1,
      best_version_full: 1,
      id: 801,
      name: '季度测试剧',
      search_imdbid: 0,
      season: 2,
      tmdbid: 8010,
      type: '电视剧',
    })
    const episodeGroupsRequested = vi.fn()
    server.use(subscribeDetailsHandler(801, record))
    useDialogOptions({
      episodeGroups: [{ episode_count: 24, group_count: 2, id: 99, name: '官方特别排序' }],
      onEpisodeGroups: episodeGroupsRequested,
      tmdbId: 8010,
    })
    const user = userEvent.setup()
    await renderDialog({ subid: 801 })

    expect(await screen.findByText('季度测试剧 S02')).toBeInTheDocument()
    expect(screen.getByLabelText('洗版')).toBeChecked()
    expect(screen.getByLabelText('全集洗版')).toBeChecked()
    expect(screen.getByLabelText('使用 ImdbID 搜索')).not.toBeChecked()
    await waitFor(() => expect(episodeGroupsRequested).toHaveBeenCalledOnce())

    await user.click(screen.getByRole('tab', { name: '进阶' }))
    await user.click(screen.getByLabelText('指定剧集组'))
    expect(await screen.findByText('官方特别排序')).toBeInTheDocument()
    expect(screen.getByText('2 季 • 24 集')).toBeInTheDocument()
  })

  it('binds the release-group field to the active version selected from the versions dialog', async () => {
    const record = createSubscribe({
      id: 812,
      name: '字幕组版本剧',
      season: 1,
      tmdbid: 8120,
      type: '电视剧',
      version_rules: [
        { id: 'v-a', name: '默认版本', enabled: true, release_group: 'VCB-Studio', settings: {} as SubscribeVersionRule['settings'] },
        { id: 'v-b', name: '字幕组B', enabled: true, release_group: 'LoliHouse', settings: {} as SubscribeVersionRule['settings'] },
      ],
    })
    const updated = vi.fn()
    server.use(subscribeDetailsHandler(812, record), updateSubscribeHandler({ success: true }, 200, updated))
    useDialogOptions({ tmdbId: 8120 })
    const user = userEvent.setup()
    await renderDialog({ subid: 812, versionId: 'v-b' })
    await screen.findByText('字幕组版本剧 S01')

    await user.click(screen.getByRole('tab', { name: '进阶' }))
    // 字段跟随 versionId 指定的活动版本
    const releaseGroup = screen.getByLabelText('字幕组')
    expect(releaseGroup).toHaveValue('LoliHouse')

    // 输入直写 activeVersion.release_group,随保存提交且不串扰其他版本
    await user.clear(releaseGroup)
    await user.type(releaseGroup, 'NEST')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(updated).toHaveBeenCalledOnce())
    const payload = updated.mock.calls[0][0] as Subscribe
    expect(payload.version_rules?.find(rule => rule.id === 'v-b')?.release_group).toBe('NEST')
    expect(payload.version_rules?.find(rule => rule.id === 'v-a')?.release_group).toBe('VCB-Studio')
  })

  it('copies the release group into a newly added version', async () => {
    const record = createSubscribe({
      id: 813,
      name: '新增版本字幕组电影',
      tmdbid: 8130,
      type: '电影',
      version_rules: [
        { id: 'v-a', name: '默认版本', enabled: true, release_group: 'VCB-Studio', settings: {} as SubscribeVersionRule['settings'] },
      ],
    })
    const updated = vi.fn()
    server.use(subscribeDetailsHandler(813, record), updateSubscribeHandler({ success: true }, 200, updated))
    useDialogOptions()
    const user = userEvent.setup()
    await renderDialog({ addVersion: true, subid: 813 })
    await screen.findByText('新增版本字幕组电影')

    await user.click(screen.getByRole('tab', { name: '进阶' }))
    // 新版本复制当前版本字幕组,用户可在此基础上修改
    const releaseGroup = screen.getByLabelText('字幕组')
    expect(releaseGroup).toHaveValue('VCB-Studio')
    await user.clear(releaseGroup)
    await user.type(releaseGroup, '桜都')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(updated).toHaveBeenCalledOnce())
    const payload = updated.mock.calls[0][0] as Subscribe
    expect(payload.version_rules).toHaveLength(2)
    expect(payload.version_rules?.find(rule => rule.id === 'v-a')?.release_group).toBe('VCB-Studio')
    expect(payload.version_rules?.find(rule => rule.id !== 'v-a')?.release_group).toBe('桜都')
  })

  it('keeps movie titles free of season suffixes and skips episode groups', async () => {
    const record = createSubscribe({ id: 802, name: '电影测试项', season: undefined, tmdbid: 8020, type: '电影' })
    const episodeGroupsRequested = vi.fn()
    server.use(subscribeDetailsHandler(802, record))
    useDialogOptions({ onEpisodeGroups: episodeGroupsRequested, tmdbId: 8020 })
    await renderDialog({ subid: 802 })

    expect(await screen.findByText('电影测试项')).toBeInTheDocument()
    expect(screen.queryByText(/电影测试项 S\d+/)).not.toBeInTheDocument()
    expect(episodeGroupsRequested).not.toHaveBeenCalled()
  })

  it('skips episode groups for a non-TMDB subscription with an auxiliary TMDB ID', async () => {
    const record = createSubscribe({
      anilistid: 154587,
      id: 810,
      media_id: '154587',
      media_source: 'anilist',
      name: 'AniList 编辑测试剧',
      season: 1,
      tmdbid: 8100,
      type: '电视剧',
    })
    const episodeGroupsRequested = vi.fn()
    server.use(subscribeDetailsHandler(810, record))
    useDialogOptions({ onEpisodeGroups: episodeGroupsRequested, tmdbId: 8100 })

    await renderDialog({ subid: 810 })

    expect(await screen.findByText('AniList 编辑测试剧 S01')).toBeInTheDocument()
    expect(episodeGroupsRequested).not.toHaveBeenCalled()
  })

  it('shows enabled sites and stable downloader, directory, and rule options', async () => {
    const activeSite = createSubscribeSite({ id: 1, is_active: true, name: '启用站点' })
    const inactiveSite = createSubscribeSite({ id: 2, is_active: false, name: '停用站点' })
    const requests = {
      directories: vi.fn(),
      downloaders: vi.fn(),
      rules: vi.fn(),
      sites: vi.fn(),
    }
    server.use(defaultSubscribeConfigHandler('电影', createSubscribe({ id: 0, type: '电影' })))
    useDialogOptions({
      directories: [
        createSubscribeDirectory({ download_path: '/downloads', name: '目录一' }),
        createSubscribeDirectory({ download_path: '/downloads', name: '目录二' }),
        createSubscribeDirectory({ download_path: undefined, name: '空目录' }),
      ],
      downloaders: [createSubscribeDownloader({ name: '下载器 A' })],
      filterRuleGroups: [createSubscribeRuleGroup({ name: '高优先级' })],
      onDirectories: requests.directories,
      onDownloaders: requests.downloaders,
      onFilterRuleGroups: requests.rules,
      onSites: requests.sites,
      sites: [activeSite, inactiveSite],
    })
    const user = userEvent.setup()
    await renderDialog({ default: true, type: '电影' })
    await waitFor(() => expect(requests.sites).toHaveBeenCalledOnce())
    await waitFor(() => expect(requests.downloaders).toHaveBeenCalledOnce())
    await waitFor(() => expect(requests.directories).toHaveBeenCalledOnce())
    await waitFor(() => expect(requests.rules).toHaveBeenCalledOnce())

    await user.click(screen.getByLabelText('订阅站点'))
    expect(await screen.findByText('启用站点')).toBeInTheDocument()
    expect(screen.queryByText('停用站点')).not.toBeInTheDocument()
    await user.keyboard('{Escape}')

    await user.click(screen.getByLabelText('下载器'))
    expect(await screen.findByText('下载器 A')).toBeInTheDocument()
    expect(screen.getAllByText('默认').length).toBeGreaterThanOrEqual(1)
    await user.keyboard('{Escape}')

    await user.click(screen.getByLabelText('保存路径'))
    expect(await screen.findAllByText('/downloads')).toHaveLength(1)
    expect(screen.queryByText('undefined')).not.toBeInTheDocument()
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('tab', { name: '进阶' }))
    await user.click(screen.getByLabelText('优先级规则组'))
    expect(await screen.findByText('高优先级')).toBeInTheDocument()
  })

  it.each(['电影', '电视剧'] as const)('loads and saves %s default configuration', async type => {
    const configRequested = vi.fn()
    const saved = vi.fn()
    server.use(
      defaultSubscribeConfigHandler(
        type,
        createSubscribe({ id: 0, show_edit_dialog: false, type }),
        200,
        configRequested,
      ),
      saveDefaultSubscribeConfigHandler(type, { success: true }, 200, saved),
    )
    useDialogOptions()
    const user = userEvent.setup()
    const { events } = await renderDialog({ default: true, type })
    await waitFor(() => expect(configRequested).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.getByLabelText('订阅时编辑更多规则')).not.toBeChecked())

    await user.click(screen.getByLabelText('订阅时编辑更多规则'))

    await fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(saved).toHaveBeenCalledOnce())
    expect(saved.mock.calls[0][0]).toMatchObject({ show_edit_dialog: true, type })
    expect(events.save).toHaveBeenCalledOnce()
    expect(mocks.toastSuccess).toHaveBeenCalledWith(`${type}订阅默认规则保存成功`)
  })

  it('submits the complete TV editing form and exposes the close action', async () => {
    const record = createSubscribe({
      best_version: 1,
      best_version_full: 0,
      id: 809,
      name: '完整表单测试剧',
      search_imdbid: 0,
      season: 1,
      tmdbid: 8090,
      type: '电视剧',
    })
    const updated = vi.fn()
    server.use(subscribeDetailsHandler(809, record), updateSubscribeHandler({ success: true }, 200, updated))
    useDialogOptions({
      directories: [createSubscribeDirectory({ download_path: '/完整目录' })],
      downloaders: [createSubscribeDownloader({ name: '完整下载器' })],
      episodeGroups: [{ episode_count: 12, group_count: 1, id: 8091, name: '完整剧集组' }],
      filterRuleGroups: [createSubscribeRuleGroup({ name: '完整规则组' })],
      sites: [createSubscribeSite({ id: 8092, name: '完整站点' })],
      tmdbId: 8090,
    })
    const user = userEvent.setup()
    const { events } = await renderDialog({ subid: 809 })
    await screen.findByText('完整表单测试剧 S01')

    const chooseOption = async (label: string, option: string) => {
      await user.click(screen.getByLabelText(label))
      await user.click(await screen.findByText(option, {}, { timeout: 2_000 }))
    }

    await user.type(screen.getByLabelText('总集数'), '24')
    await user.type(screen.getByLabelText('开始集数'), '2')
    await chooseOption('质量', 'Remux')
    await chooseOption('分辨率', '1080p')
    await chooseOption('特效', 'HDR')
    await chooseOption('订阅站点', '完整站点')
    await user.keyboard('{Escape}')
    await chooseOption('下载器', '完整下载器')
    await chooseOption('保存路径', '/完整目录')
    await user.click(screen.getByLabelText('全集洗版'))
    await user.click(screen.getByLabelText('使用 ImdbID 搜索'))

    await user.click(screen.getByRole('tab', { name: '进阶' }))
    await user.type(screen.getByLabelText('包含（关键字、正则式）'), '国语')
    await user.type(screen.getByLabelText('排除（关键字、正则式）'), '预告')
    await chooseOption('优先级规则组', '完整规则组')
    await user.keyboard('{Escape}')
    await chooseOption('指定剧集组', '完整剧集组')
    await chooseOption('指定季', '第 2 季')
    await user.type(screen.getByLabelText('自定义识别词'), '测试词 => 正式词')

    const closeButton = document.querySelector<HTMLButtonElement>('.v-card-item button')
    expect(closeButton).not.toBeNull()
    await user.click(closeButton as HTMLButtonElement)
    expect(events.close).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(updated).toHaveBeenCalledOnce())
    expect(updated.mock.calls[0][0]).toMatchObject({
      best_version_full: true,
      custom_words: '测试词 => 正式词',
      downloader: '完整下载器',
      effect: '[\\s.]+HDR[\\s.]+|HDR10|HDR10\\+',
      episode_group: 8091,
      exclude: '预告',
      filter_groups: ['完整规则组'],
      include: '国语',
      quality: 'Remux',
      resolution: '1080[pi]|x1080',
      save_path: '/完整目录',
      search_imdbid: true,
      season: 2,
      sites: [8092],
      start_episode: '2',
      total_episode: '24',
    })
    expect(events.save).toHaveBeenCalledWith(expect.objectContaining({ season: 2 }))
  })

  it.each([
    ['business failure', 200, { message: 'rejected', success: false }, '电影订阅默认规则保存失败：rejected！'],
    ['HTTP failure', 500, { message: 'server down', success: false }, '电影订阅默认规则保存失败：server down！'],
  ])('keeps a default dialog open after a %s', async (_case, status, response, expectedMessage) => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    server.use(
      defaultSubscribeConfigHandler('电影', createSubscribe({ id: 0, type: '电影' })),
      saveDefaultSubscribeConfigHandler('电影', response, status),
    )
    useDialogOptions()
    const { events } = await renderDialog({ default: true, type: '电影' })
    await screen.findByText('电影')

    await fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(expectedMessage))
    expect(events.save).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
    consoleLog.mockRestore()
  })

  it('updates an edited subscription and clears full-season mode when versioning is disabled', async () => {
    const record = createSubscribe({
      best_version: 1,
      best_version_full: 1,
      id: 803,
      keyword: '旧关键词',
      name: '编辑测试剧',
      season: 1,
      tmdbid: 8030,
      type: '电视剧',
    })
    const updated = vi.fn()
    server.use(subscribeDetailsHandler(803, record), updateSubscribeHandler({ success: true }, 200, updated))
    useDialogOptions({ tmdbId: 8030 })
    const user = userEvent.setup()
    const { events } = await renderDialog({ subid: 803 })
    await screen.findByText('编辑测试剧 S01')

    const keyword = screen.getByLabelText('搜索关键词')
    await user.clear(keyword)
    await user.type(keyword, '新关键词')
    await user.click(screen.getByLabelText('洗版'))
    await waitFor(() => expect(screen.queryByLabelText('全集洗版')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(updated).toHaveBeenCalledOnce())
    expect(updated.mock.calls[0][0]).toMatchObject({
      best_version: false,
      best_version_full: false,
      id: 803,
      keyword: '新关键词',
    })
    expect(events.save).toHaveBeenCalledWith(expect.objectContaining({ id: 803, keyword: '新关键词' }))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('编辑测试剧 S01 更新成功！')
  })

  it.each([
    ['business failure', 200, { message: 'invalid', success: false }, '失败编辑项 更新失败：invalid！'],
    ['HTTP failure', 500, { message: 'server down', success: false }, '失败编辑项 更新失败：server down！'],
  ])('keeps an edit dialog usable after an update %s', async (_case, status, response, expectedMessage) => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    const record = createSubscribe({ id: 804, name: '失败编辑项', tmdbid: 8040 })
    server.use(subscribeDetailsHandler(804, record), updateSubscribeHandler(response, status))
    useDialogOptions({ tmdbId: 8040 })
    const { events } = await renderDialog({ subid: 804 })
    await screen.findByText('失败编辑项')

    await fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(expectedMessage))
    expect(events.save).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
    consoleLog.mockRestore()
  })

  it('does not delete when confirmation is cancelled', async () => {
    const record = createSubscribe({ id: 805, name: '保留订阅', tmdbid: 8050 })
    const deleted = vi.fn()
    server.use(subscribeDetailsHandler(805, record), deleteSubscribeByIdHandler(805, { success: true }, 200, deleted))
    useDialogOptions({ tmdbId: 8050 })
    mocks.confirm.mockResolvedValue(false)
    const { events } = await renderDialog({ subid: 805 })
    await screen.findByText('保留订阅')

    await fireEvent.click(screen.getByRole('button', { name: '取消订阅' }))

    expect(deleted).not.toHaveBeenCalled()
    expect(events.remove).not.toHaveBeenCalled()
  })

  it('emits remove only after a successful deletion', async () => {
    const record = createSubscribe({ id: 806, name: '删除订阅', tmdbid: 8060 })
    const deleted = vi.fn()
    server.use(subscribeDetailsHandler(806, record), deleteSubscribeByIdHandler(806, { success: true }, 200, deleted))
    useDialogOptions({ tmdbId: 8060 })
    const { events } = await renderDialog({ subid: 806 })
    await screen.findByText('删除订阅')

    await fireEvent.click(screen.getByRole('button', { name: '取消订阅' }))

    await waitFor(() => expect(deleted).toHaveBeenCalledOnce())
    expect(events.remove).toHaveBeenCalledOnce()
    expect(mocks.toastSuccess).toHaveBeenCalledWith('删除订阅 已取消订阅！')
  })

  it.each([
    ['business failure', 200, { message: 'not allowed', success: false }, '删除失败项 取消订阅失败：not allowed！'],
    ['HTTP failure', 500, { message: 'server down', success: false }, '删除失败项 取消订阅失败：server down！'],
  ])('keeps the subscription after a delete %s', async (_case, status, response, expectedMessage) => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    const record = createSubscribe({ id: 807, name: '删除失败项', tmdbid: 8070 })
    server.use(subscribeDetailsHandler(807, record), deleteSubscribeByIdHandler(807, response, status))
    useDialogOptions({ tmdbId: 8070 })
    const { events } = await renderDialog({ subid: 807 })
    await screen.findByText('删除失败项')

    await fireEvent.click(screen.getByRole('button', { name: '取消订阅' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(expectedMessage))
    expect(events.remove).not.toHaveBeenCalled()
    expect(screen.getByText('删除失败项')).toBeInTheDocument()
    consoleLog.mockRestore()
  })

  it('remains editable when an auxiliary options request fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const record = createSubscribe({ id: 808, keyword: '仍可编辑', name: '部分失败项', tmdbid: 8080 })
    const updated = vi.fn()
    server.use(subscribeDetailsHandler(808, record), updateSubscribeHandler({ success: true }, 200, updated))
    useDialogOptions({ tmdbId: 8080 })
    server.use(
      http.get(subscribeApiUrls.downloaders, () =>
        HttpResponse.json({ message: 'unavailable', success: false }, { status: 500 }),
      ),
    )
    await renderDialog({ subid: 808 })

    expect(await screen.findByDisplayValue('仍可编辑')).toBeInTheDocument()
    await waitFor(() => expect(consoleError).toHaveBeenCalled())
    await fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(updated).toHaveBeenCalledOnce())
    consoleError.mockRestore()
  })

  it.each([
    ['secure context', true],
    ['insecure context without crypto.randomUUID', false],
  ])('opens in add-version mode with its own title and saves default + new version together (%s)', async (_case, hasRandomUuid) => {
    if (!hasRandomUuid) vi.stubGlobal('crypto', { ...globalThis.crypto, randomUUID: undefined })
    const record = createSubscribe({ id: 820, name: '新增版本测试剧', tmdbid: 8200, version_mode: 'any', version_rules: [] })
    const updated = vi.fn()
    server.use(subscribeDetailsHandler(record.id, record), updateSubscribeHandler({ success: true }, 200, updated))
    useDialogOptions({ tmdbId: 8200 })
    const { events } = await renderDialog({ subid: record.id, addVersion: true })

    // 新增版本模式使用独立标题
    await screen.findByText('新增版本')
    // 等待订阅加载并创建默认版本 + 新版本（副标题显示当前版本名）
    const versionLabel = await screen.findByText('新版本')

    // 副标题版本名点击后就地编辑，改名后失焦生效
    await fireEvent.click(versionLabel)
    const nameInput = await screen.findByLabelText('版本名称')
    await fireEvent.update(nameInput, 'NEST')
    await fireEvent.blur(nameInput)

    await fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(updated).toHaveBeenCalledOnce())
    const payload = updated.mock.calls[0][0] as { version_mode?: string; version_rules?: { name: string; enabled: boolean }[] }
    expect(payload.version_mode).toBe('all')
    expect(payload.version_rules?.map(rule => rule.name)).toEqual(['默认版本', 'NEST'])
    expect(events.save).toHaveBeenCalledOnce()
  })
})
