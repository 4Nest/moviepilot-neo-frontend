import LoggingView from '@/views/system/LoggingView.vue'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen } from '@testing-library/vue'
import { nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 捕获组件注册的 SSE 消息处理器，用假数据驱动日志流
let sseHandler: ((event: MessageEvent) => void) | null = null
let sseStatusHandler: ((status: string) => void) | null = null

vi.mock('@/composables/useBackground', () => ({
  useBackground: () => ({
    useSSE: (_url: string, handler: (event: MessageEvent) => void) => {
      sseHandler = handler

      return {
        manager: {
          removeMessageListener: vi.fn(),
          addMessageListener: vi.fn(),
          addStatusListener: (_id: string, handler: (status: string) => void) => {
            sseStatusHandler = handler
          },
          removeStatusListener: vi.fn(),
        },
        isConnected: ref(false),
      }
    },
  }),
}))

function pushLogs(...lines: string[]) {
  for (const line of lines) sseHandler?.(new MessageEvent('message', { data: line }))
}

async function flushLogs() {
  await vi.advanceTimersByTimeAsync(200)
  await nextTick()
}

function listText(): string {
  return document.querySelector('.logging-list')?.textContent ?? ''
}

describe('LoggingView 倒序显示', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    sseHandler = null
    sseStatusHandler = null
    // jsdom 未实现元素滚动
    Element.prototype.scrollTo = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('默认正序，切换后倒序并持久化选择', async () => {
    await renderWithProviders(LoggingView, { props: { logfile: 'moviepilot.log' } })
    // 等待挂载动画结束
    await vi.advanceTimersByTimeAsync(300)
    await nextTick()

    pushLogs('INFO: [moviepilot] 2026-09-29 10:00:01,000 alpha.py - 甲日志')
    await flushLogs()
    pushLogs('WARNING: [moviepilot] 2026-09-29 10:00:05,000 beta.py - 乙日志')
    await flushLogs()

    expect(listText().indexOf('甲日志')).toBeLessThan(listText().indexOf('乙日志'))
    expect(listText().indexOf('甲日志')).toBeGreaterThanOrEqual(0)

    await fireEvent.click(screen.getByTitle('倒序显示（最新在上）'))

    expect(listText().indexOf('乙日志')).toBeLessThan(listText().indexOf('甲日志'))
    expect(localStorage.getItem('MP_LOG_NEWEST_FIRST')).toBe('1')

    await fireEvent.click(screen.getByTitle('正序显示（最新在下）'))

    expect(listText().indexOf('甲日志')).toBeLessThan(listText().indexOf('乙日志'))
    expect(localStorage.getItem('MP_LOG_NEWEST_FIRST')).toBe('0')
  })

  it('重连后清空旧显示与待写入缓冲，避免历史日志重复', async () => {
    await renderWithProviders(LoggingView, { props: { logfile: 'moviepilot.log' } })
    await vi.advanceTimersByTimeAsync(300)
    pushLogs('INFO: [moviepilot] 2026-09-29 10:00:01,000 alpha.py - 历史日志')
    await flushLogs()
    pushLogs('INFO: [moviepilot] 2026-09-29 10:00:02,000 alpha.py - 过期缓冲')

    expect(sseStatusHandler).not.toBeNull()
    sseStatusHandler?.('error')
    sseStatusHandler?.('open')
    pushLogs('INFO: [moviepilot] 2026-09-29 10:00:01,000 alpha.py - 历史日志')
    await flushLogs()

    expect(listText()).toContain('历史日志')
    expect(listText()).not.toContain('过期缓冲')
    expect(listText()?.match(/历史日志/g)).toHaveLength(1)
  })

  it('暂停期间连接打开时保留现有日志', async () => {
    await renderWithProviders(LoggingView, { props: { logfile: 'moviepilot.log' } })
    await vi.advanceTimersByTimeAsync(300)
    pushLogs('INFO: [moviepilot] 2026-09-29 10:00:01,000 alpha.py - 暂停保留')
    await flushLogs()
    await fireEvent.click(screen.getByTitle('暂停日志流'))

    expect(sseStatusHandler).not.toBeNull()
    sseStatusHandler?.('open')
    await nextTick()
    expect(listText()).toContain('暂停保留')
  })

  it('localStorage 记录倒序时初始即为最新在上', async () => {
    localStorage.setItem('MP_LOG_NEWEST_FIRST', '1')
    await renderWithProviders(LoggingView, { props: { logfile: 'moviepilot.log' } })
    await vi.advanceTimersByTimeAsync(300)
    await nextTick()

    pushLogs('INFO: [moviepilot] 2026-09-29 10:00:01,000 alpha.py - 旧日志')
    await flushLogs()
    pushLogs('INFO: [moviepilot] 2026-09-29 10:00:09,000 beta.py - 新日志')
    await flushLogs()

    expect(listText().indexOf('新日志')).toBeLessThan(listText().indexOf('旧日志'))
  })
})
