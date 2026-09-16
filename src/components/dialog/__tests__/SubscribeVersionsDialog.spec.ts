import type { Subscribe, SubscribeVersionProgress, SubscribeVersionRule } from '@/api/types'
import SubscribeVersionsDialog from '@/components/dialog/SubscribeVersionsDialog.vue'
import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { createSubscribe } from '@tests/support/factories/subscribe'
import { updateSubscribeHandler } from '@tests/support/msw/handlers/subscribe'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
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

function makeRule(
  id: string,
  name: string,
  enabled = true,
  settings: Partial<SubscribeVersionRule['settings']> = {},
): SubscribeVersionRule {
  return { id, name, enabled, settings: { ...settings } as SubscribeVersionRule['settings'] }
}

function makeProgress(overrides: Partial<SubscribeVersionProgress> = {}): SubscribeVersionProgress {
  return { completed: false, episode_priority: {}, ...overrides }
}

async function renderDialog(versionRules: SubscribeVersionRule[], mediaOverrides: Partial<Subscribe> = {}) {
  const events = {
    add: vi.fn(),
    close: vi.fn(),
    save: vi.fn(),
    select: vi.fn(),
  }
  const subscribe = createSubscribe({
    id: 900,
    name: '多版本测试剧',
    version_mode: 'all',
    version_rules: versionRules,
    ...mediaOverrides,
  })
  const result = await renderWithProviders(SubscribeVersionsDialog, {
    props: {
      modelValue: true,
      subscribe,
      onAdd: events.add,
      onClose: events.close,
      onSave: events.save,
      onSelect: events.select,
    },
    global: {
      components: {
        VDialogCloseBtn: DialogCloseBtn,
      },
    },
  })
  return { ...result, events, subscribe }
}

describe('SubscribeVersionsDialog', () => {
  beforeEach(() => {
    mocks.confirm.mockResolvedValue(true)
  })

  it('shows the loading banner until the subscribe payload arrives', async () => {
    await renderWithProviders(SubscribeVersionsDialog, {
      props: { modelValue: true, subscribe: undefined },
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
    })

    // VDialog 内容 teleport 到 body,查询需落在 document 上
    expect(document.querySelector('.initial-loading-container')).toBeTruthy()
    expect(document.querySelector('.v-list-item')).toBeNull()
  })

  it('emits select with the version id when a version row is clicked', async () => {
    const { events } = await renderDialog([makeRule('v-a', '桜都'), makeRule('v-b', 'NEST')])

    await fireEvent.click(await screen.findByText('NEST'))

    expect(events.select).toHaveBeenCalledWith('v-b')
  })

  it('emits select when Enter is pressed on a focused row', async () => {
    const { events } = await renderDialog([makeRule('v-a', '桜都'), makeRule('v-b', 'NEST')])

    const row = (await screen.findByText('NEST')).closest('.v-list-item') as HTMLElement
    await fireEvent.keyDown(row, { key: 'Enter' })

    // VListItem 内部已将 Enter 合成为 click:只应触发一次 select,弹窗不得叠开
    expect(events.select).toHaveBeenCalledOnce()
    expect(events.select).toHaveBeenCalledWith('v-b')
  })

  it('renders the two-line row: name, status chip, progress text and progress bar', async () => {
    await renderDialog(
      [
        makeRule('v-a', '桜都', true, { total_episode: 12 }),
        makeRule('v-b', 'NEST', true, { total_episode: 10 }),
        makeRule('v-c', '暂停组', false, { total_episode: 8 }),
      ],
      {
        version_progress: {
          'v-a': makeProgress({ lack_episode: 4 }),
          'v-b': makeProgress({ completed: true, lack_episode: 0 }),
          'v-c': makeProgress({ lack_episode: 5 }),
        },
      },
    )

    // 第 1 行:版本名 + 状态 Chip(仅完成/停用展示)
    const nameA = await screen.findByText('桜都')
    expect(nameA).toHaveAttribute('title', '桜都')
    expect(screen.getByText('已完成')).toBeTruthy()
    expect(screen.getByText('已停用')).toBeTruthy()

    // 运行中的版本不出状态 Chip:除完成/停用外没有第三个 chip
    const chips = document.querySelectorAll('.v-list-item .v-chip')
    expect(chips).toHaveLength(2)

    // 第 2 行:进度文案(复用 subscribeProgressTooltip 语义)+ 进度条
    expect(screen.getByText('已下载 8 · 共 12 集')).toBeTruthy()
    expect(screen.getByText('已下载 3 · 共 8 集')).toBeTruthy()
    const bars = screen.getAllByRole('progressbar')
    expect(bars).toHaveLength(3)
    expect(bars[0]).toHaveAttribute('aria-valuenow', '67')
    expect(bars[2]).toHaveAttribute('aria-valuenow', '38')
  })

  it('maps running / completed / disabled states to distinct indicator icons', async () => {
    await renderDialog(
      [makeRule('v-a', '运行组'), makeRule('v-b', '完成组'), makeRule('v-c', '暂停组', false)],
      { version_progress: { 'v-b': makeProgress({ completed: true }) } },
    )
    // 图标经 iconify 渲染为 svg,按 SubscribeCard 约定用 data 属性断言状态图标映射
    const stateIcons = Array.from(
      document.querySelectorAll('.v-list-item__prepend [data-version-state-icon]'),
    ).map(icon => icon.getAttribute('data-version-state-icon'))
    expect(stateIcons).toEqual(['mdi-rss', 'mdi-check-circle', 'mdi-pause-circle-outline'])

  })

  it('colors progress bars success for running and secondary for disabled versions', async () => {
    await renderDialog(
      [makeRule('v-a', '运行组', true, { total_episode: 12 }), makeRule('v-b', '暂停组', false, { total_episode: 12 })],
      { version_progress: { 'v-a': makeProgress({ lack_episode: 4 }), 'v-b': makeProgress({ lack_episode: 4 }) } },
    )

    const bars = document.querySelectorAll('.v-progress-linear__determinate')
    expect(bars[0].className).toContain('bg-success')
    expect(bars[1].className).toContain('bg-secondary')
  })

  it('shows the completed / total summary in the footer', async () => {
    await renderDialog([makeRule('v-a', '桜都'), makeRule('v-b', 'NEST')], {
      version_progress: { 'v-a': makeProgress({ completed: true }) },
    })

    expect(await screen.findByText('已完成 1 / 2')).toBeTruthy()
  })

  it('hides the progress line for versions without a server progress entry', async () => {
    await renderDialog(
      [makeRule('v-a', '有进度', true, { total_episode: 12 }), makeRule('v-new', '新版本', true, { total_episode: 12 })],
      { version_progress: { 'v-a': makeProgress({ lack_episode: 4 }) } },
    )

    expect(await screen.findByText('已下载 8 · 共 12 集')).toBeTruthy()
    // 新版本没有 version_progress 条目:不渲染第二行,避免满格「已下载 Y·共 Y」与运行态图标矛盾
    expect(screen.queryByText('已下载 12 · 共 12 集')).toBeNull()
    expect(document.querySelectorAll('.v-list-item')).toHaveLength(2)
    expect(screen.getAllByRole('progressbar')).toHaveLength(1)
  })

  it('clamps downloaded episodes when lack_episode is out of range', async () => {
    await renderDialog(
      [
        makeRule('v-under', '负数缺失', true, { total_episode: 12 }),
        makeRule('v-over', '超额缺失', true, { total_episode: 12 }),
      ],
      {
        version_progress: {
          'v-under': makeProgress({ lack_episode: -3 }),
          'v-over': makeProgress({ lack_episode: 20 }),
        },
      },
    )

    // lack<0 按满格、lack>total 按零格收敛,不越过 [0,total] 边界
    expect(await screen.findByText('已下载 12 · 共 12 集')).toBeTruthy()
    expect(screen.getByText('已下载 0 · 共 12 集')).toBeTruthy()
    const bars = screen.getAllByRole('progressbar')
    expect(bars[0]).toHaveAttribute('aria-valuenow', '100')
    expect(bars[1]).toHaveAttribute('aria-valuenow', '0')
  })

  it('offers an inline add-version button in the empty state', async () => {
    const { events } = await renderDialog([])

    expect(await screen.findByText('暂无订阅版本')).toBeTruthy()
    const buttons = screen.getAllByRole('button', { name: '新增版本' })
    expect(buttons.length).toBeGreaterThanOrEqual(2)

    await fireEvent.click(buttons[0])

    expect(events.add).toHaveBeenCalledOnce()
  })

  it('renders a passive chevron that selects the row like any other row area', async () => {
    const { events } = await renderDialog([makeRule('v-a', '桜都')])

    const chevron = document.querySelector('.v-list-item__append .text-disabled svg')
    expect(chevron).toBeTruthy()

    await fireEvent.click(chevron as Element)

    expect(events.select).toHaveBeenCalledWith('v-a')
  })

  it('emits add from the add-version action', async () => {
    const { events } = await renderDialog([makeRule('v-a', '默认版本')])

    await fireEvent.click(screen.getByRole('button', { name: '新增版本' }))

    expect(events.add).toHaveBeenCalledOnce()
  })

  it('persists a disabled version immediately and notifies the parent', async () => {
    const updated = vi.fn()
    server.use(updateSubscribeHandler({ success: true }, 200, updated))
    const { events } = await renderDialog([makeRule('v-a', '桜都'), makeRule('v-b', 'NEST')])

    // 启停是行尾图标按钮；停用第二个版本（NEST）
    const toggles = await screen.findAllByRole('button', { name: '暂停' })
    await fireEvent.click(toggles[1])

    await waitFor(() => expect(updated).toHaveBeenCalledOnce())
    const payload = updated.mock.calls[0][0] as { version_rules: SubscribeVersionRule[]; version_mode: string }
    expect(payload.version_mode).toBe('all')
    expect(payload.version_rules.map(rule => [rule.id, rule.enabled])).toEqual([
      ['v-a', true],
      ['v-b', false],
    ])
    await waitFor(() => expect(events.save).toHaveBeenCalledOnce())
  })

  it('does not emit select when the toggle or delete buttons are clicked', async () => {
    const updated = vi.fn()
    server.use(updateSubscribeHandler({ success: true }, 200, updated))
    const { events } = await renderDialog([makeRule('v-a', '桜都'), makeRule('v-b', 'NEST')])

    await fireEvent.click((await screen.findAllByRole('button', { name: '暂停' }))[0])
    await waitFor(() => expect(updated).toHaveBeenCalledOnce())
    expect(events.select).not.toHaveBeenCalled()

    await fireEvent.click((await screen.findAllByRole('button', { name: '删除版本' }))[0])
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled())
    expect(events.select).not.toHaveBeenCalled()
  })

  it('disables every action while a toggle is being persisted', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    server.use(
      updateSubscribeHandler({ success: true }, 200, async () => {
        await gate
      }),
    )
    const { events } = await renderDialog([makeRule('v-a', '桜都'), makeRule('v-b', 'NEST')])

    await fireEvent.click((await screen.findAllByRole('button', { name: '暂停' }))[0])

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '新增版本' })).toBeDisabled()
    })
    for (const button of screen.getAllByRole('button', { name: '暂停' })) expect(button).toBeDisabled()
    for (const button of screen.getAllByRole('button', { name: '删除版本' })) expect(button).toBeDisabled()
    expect(document.querySelector('.v-card > .v-progress-linear.v-progress-linear--absolute')).toBeTruthy()

    // pointer-events 挡不住键盘 Enter:saving 期间 select/add 由守卫拦截
    const row = (await screen.findByText('NEST')).closest('.v-list-item') as HTMLElement
    await fireEvent.keyDown(row, { key: 'Enter' })
    expect(events.select).not.toHaveBeenCalled()
    expect(events.add).not.toHaveBeenCalled()

    release()
  })

  it('keeps versions unchanged and reports the error when persisting fails', async () => {
    const updated = vi.fn()
    server.use(updateSubscribeHandler({ message: '后端拒绝', success: false }, 200, updated))
    const { events } = await renderDialog([makeRule('v-a', '桜都'), makeRule('v-b', 'NEST')])

    await fireEvent.click((await screen.findAllByRole('button', { name: '暂停' }))[0])

    await waitFor(() => expect(updated).toHaveBeenCalledOnce())
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('后端拒绝'))
    // 失败时本地版本数组不回写、不通知父级刷新:两行仍在且保持启用态
    expect(events.save).not.toHaveBeenCalled()
    expect(document.querySelectorAll('.v-list-item')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: '暂停' })).toHaveLength(2)
  })

  it('blocks deleting the last remaining version', async () => {
    const updated = vi.fn()
    server.use(updateSubscribeHandler({ success: true }, 200, updated))
    await renderDialog([makeRule('v-a', '默认版本')])

    await fireEvent.click(screen.getByRole('button', { name: '删除版本' }))

    expect(mocks.toastError).toHaveBeenCalledWith('至少保留一个版本')
    expect(mocks.confirm).not.toHaveBeenCalled()
    expect(updated).not.toHaveBeenCalled()
  })

  it('deletes a version after confirmation without touching download data', async () => {
    const updated = vi.fn()
    server.use(updateSubscribeHandler({ success: true }, 200, updated))
    const { events } = await renderDialog([makeRule('v-a', '桜都'), makeRule('v-b', 'NEST')])

    await fireEvent.click((await screen.findAllByRole('button', { name: '删除版本' }))[0])

    expect(mocks.confirm).toHaveBeenCalledOnce()
    await waitFor(() => expect(updated).toHaveBeenCalledOnce())
    const payload = updated.mock.calls[0][0] as { version_rules: SubscribeVersionRule[] }
    expect(payload.version_rules.map(rule => rule.id)).toEqual(['v-b'])
    await waitFor(() => expect(events.save).toHaveBeenCalledOnce())
  })

  it('does not persist when the delete confirmation is cancelled', async () => {
    mocks.confirm.mockResolvedValue(false)
    const updated = vi.fn()
    server.use(updateSubscribeHandler({ success: true }, 200, updated))
    await renderDialog([makeRule('v-a', '桜都'), makeRule('v-b', 'NEST')])

    await fireEvent.click((await screen.findAllByRole('button', { name: '删除版本' }))[0])

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled())
    expect(updated).not.toHaveBeenCalled()
  })
})
