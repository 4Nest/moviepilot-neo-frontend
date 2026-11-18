import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { render, waitFor } from '@testing-library/vue'
import { h, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('ProgressiveCardGrid scroll target lifecycle', () => {
  afterEach(() => {
    document.documentElement.classList.remove('v-overlay-scroll-blocked')
  })

  it('recomputes the scroll target after an overlay unlocks', async () => {
    const scrollParent = document.createElement('div')
    const addScrollListener = vi.spyOn(scrollParent, 'addEventListener')
    scrollParent.style.overflowY = 'hidden'
    document.body.append(scrollParent)
    document.documentElement.classList.add('v-overlay-scroll-blocked')

    render(ProgressiveCardGrid, {
      container: scrollParent,
      props: {
        items: [{ id: 1 }],
        getItemKey: (item: { id: number }) => item.id,
      },
      slots: {
        default: '<div>item</div>',
      },
    })

    expect(addScrollListener).not.toHaveBeenCalledWith('scroll', expect.any(Function), expect.anything())

    scrollParent.style.overflowY = 'auto'
    document.documentElement.classList.remove('v-overlay-scroll-blocked')

    await waitFor(() => {
      expect(addScrollListener).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true })
    })
  })

  it('exposes the complete virtual track as a layout size source', () => {
    const { container } = render(ProgressiveCardGrid, {
      props: {
        items: [{ id: 1 }],
        getItemKey: (item: { id: number }) => item.id,
      },
      slots: {
        default: '<div>item</div>',
      },
    })

    expect(container.querySelector('.progressive-card-grid__track')).toHaveAttribute('data-layout-size-source')
  })

  it('clamps a frozen window when the original filter shrinks or empties the list', async () => {
    const items = Array.from({ length: 4 }, (_, id) => ({ id, title: `resource-${id}` }))
    const { container, rerender } = render(ProgressiveCardGrid, {
      props: { items, columns: 1, getItemKey: (item: { id: number }) => item.id },
      slots: { default: ({ item }: { item: { title: string } }) => h('span', item.title) },
    })
    await waitFor(() => expect(container.querySelectorAll('[data-progressive-grid-index]')).toHaveLength(4))
    document.documentElement.classList.add('v-overlay-scroll-blocked')
    // MutationObserver 先消费锁滚动事件，再模拟弹窗内筛选缩短原列表。
    await new Promise(resolve => setTimeout(resolve, 0))
    await rerender({ items: items.slice(0, 2) })
    expect(container.querySelectorAll('[data-progressive-grid-index]')).toHaveLength(2)
    expect(container.textContent).toBe('resource-0resource-1')
    await rerender({ items: [] })
    expect(container.querySelectorAll('[data-progressive-grid-index]')).toHaveLength(0)
    await rerender({ items })
    expect(container.querySelectorAll('[data-progressive-grid-index]')).toHaveLength(4)
    document.documentElement.classList.remove('v-overlay-scroll-blocked')
    await waitFor(() => expect(container.querySelectorAll('[data-progressive-grid-index]')).toHaveLength(4))
  })
})

describe('ProgressiveCardGrid mount scheduling', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('mounts an appended visible range in frame-bounded batches', async () => {
    const callbacks = new Map<number, FrameRequestCallback>()
    let frameId = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frameId += 1
      callbacks.set(frameId, callback)

      return frameId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {
      callbacks.delete(id)
    })
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(100)

    const initialItems = Array.from({ length: 8 }, (_, id) => ({ id }))
    const { container, rerender } = render(ProgressiveCardGrid, {
      props: {
        batchSize: 4,
        columns: 4,
        estimatedItemHeight: 100,
        gap: 0,
        initialCount: 4,
        items: initialItems,
        getItemKey: (item: { id: number }) => item.id,
      },
      slots: {
        default: '<div>item</div>',
      },
    })

    const flushFrame = async () => {
      const frameCallbacks = [...callbacks.values()]
      callbacks.clear()
      frameCallbacks.forEach(callback => callback(performance.now()))
      await nextTick()
    }

    expect(container.querySelectorAll('[data-progressive-grid-index]')).toHaveLength(4)
    expect(container.querySelector('.progressive-card-grid__spacer')).toHaveStyle({ blockSize: '100px' })
    await flushFrame()
    expect(container.querySelectorAll('[data-progressive-grid-index]')).toHaveLength(8)

    await rerender({
      batchSize: 4,
      columns: 4,
      estimatedItemHeight: 100,
      gap: 0,
      initialCount: 4,
      items: Array.from({ length: 20 }, (_, id) => ({ id })),
      getItemKey: (item: { id: number }) => item.id,
    })

    expect(container.querySelectorAll('[data-progressive-grid-index]')).toHaveLength(8)
    expect(container.querySelector('.progressive-card-grid__spacer')).toHaveStyle({ blockSize: '300px' })
    await flushFrame()
    expect(container.querySelectorAll('[data-progressive-grid-index]')).toHaveLength(12)
    await flushFrame()
    expect(container.querySelectorAll('[data-progressive-grid-index]')).toHaveLength(16)
  })

  it('resets the staged window around the viewport after forward and reverse jumps', async () => {
    const callbacks = new Map<number, FrameRequestCallback>()
    let frameId = 0
    let scrollOffset = 0
    const getBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frameId += 1
      callbacks.set(frameId, callback)

      return frameId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {
      callbacks.delete(id)
    })
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(100)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (!this.classList.contains('progressive-card-grid__track')) {
        return getBoundingClientRect.call(this)
      }

      return {
        bottom: 2500 - scrollOffset,
        height: 2500,
        left: 0,
        right: 400,
        toJSON: () => ({}),
        top: -scrollOffset,
        width: 400,
        x: 0,
        y: -scrollOffset,
      }
    })

    const { container } = render(ProgressiveCardGrid, {
      props: {
        batchSize: 4,
        columns: 4,
        estimatedItemHeight: 100,
        gap: 0,
        initialCount: 4,
        items: Array.from({ length: 100 }, (_, id) => ({ id })),
        getItemKey: (item: { id: number }) => item.id,
      },
      slots: {
        default: '<div>item</div>',
      },
    })

    const flushFrame = async () => {
      const frameCallbacks = [...callbacks.values()]
      callbacks.clear()
      frameCallbacks.forEach(callback => callback(performance.now()))
      await nextTick()
    }
    const renderedIndices = () =>
      Array.from(container.querySelectorAll('[data-progressive-grid-index]'), element =>
        Number(element.getAttribute('data-progressive-grid-index')),
      )

    await flushFrame()
    scrollOffset = 2000
    window.dispatchEvent(new Event('scroll'))
    await flushFrame()
    expect(renderedIndices().length).toBeLessThanOrEqual(12)
    expect(renderedIndices()).toEqual(expect.arrayContaining([80, 81, 82, 83]))

    scrollOffset = 0
    window.dispatchEvent(new Event('scroll'))
    await flushFrame()
    expect(renderedIndices().length).toBeLessThanOrEqual(12)
    expect(renderedIndices()).toEqual(expect.arrayContaining([0, 1, 2, 3]))
  })

  it('mounts one complete overscan row when the column count exceeds the batch size', async () => {
    const callbacks = new Map<number, FrameRequestCallback>()
    let frameId = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frameId += 1
      callbacks.set(frameId, callback)

      return frameId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {
      callbacks.delete(id)
    })
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(99)

    const { container } = render(ProgressiveCardGrid, {
      props: {
        batchSize: 6,
        columns: 9,
        estimatedItemHeight: 100,
        gap: 0,
        initialCount: 6,
        items: Array.from({ length: 100 }, (_, id) => ({ id })),
        getItemKey: (item: { id: number }) => item.id,
      },
      slots: {
        default: '<div>item</div>',
      },
    })

    expect(container.querySelectorAll('[data-progressive-grid-index]')).toHaveLength(9)
    const frameCallbacks = [...callbacks.values()]
    callbacks.clear()
    frameCallbacks.forEach(callback => callback(performance.now()))
    await nextTick()

    expect(container.querySelectorAll('[data-progressive-grid-index]')).toHaveLength(18)
  })

  it('preserves measured item heights and staged window when deleting a card instead of resetting to zero', async () => {
    const resizeCallbacks: ResizeObserverCallback[] = []
    class MockResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallbacks.push(callback)
      }
      disconnect() {}
      observe() {}
      unobserve() {}
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(200)
    const getBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('progressive-card-grid__track')) {
        return {
          bottom: 2400,
          height: 2400,
          left: 0,
          right: 400,
          toJSON: () => ({}),
          top: 0,
          width: 400,
          x: 0,
          y: 0,
        }
      }
      return getBoundingClientRect.call(this)
    })

    const items = Array.from({ length: 12 }, (_, id) => ({ id, title: `card-${id}` }))
    const { container, rerender } = render(ProgressiveCardGrid, {
      props: {
        batchSize: 2,
        columns: 2,
        estimatedItemHeight: 400,
        gap: 0,
        initialCount: 2,
        items,
        getItemKey: (item: { id: number }) => item.id,
      },
      slots: {
        default: ({ item }: { item: { title: string } }) => h('div', item.title),
      },
    })

    await waitFor(() =>
      expect(container.querySelectorAll('[data-progressive-grid-index]').length).toBeGreaterThanOrEqual(4),
    )

    // 为当前挂载的所有卡片写入真实测量高度 150px（远小于失真的 estimatedItemHeight 400px）
    const notifyResize = (elements: HTMLElement[]) => {
      const entries = elements.map(
        target =>
          ({
            borderBoxSize: [{ blockSize: 150, inlineSize: 200 }],
            contentRect: { height: 150, width: 200 } as DOMRectReadOnly,
            target,
          }) as unknown as ResizeObserverEntry,
      )
      resizeCallbacks.forEach(cb => cb(entries, {} as ResizeObserver))
    }

    notifyResize(Array.from(container.querySelectorAll<HTMLElement>('[data-progressive-grid-index]')))
    await nextTick()

    // 删除前两张卡片后，存活卡片 #2~#5 应保留 150px 实测高度，底部占位高度反映 150px 而非全部回退为 400px
    const mountedCountBeforeDelete = container.querySelectorAll('[data-progressive-grid-index]').length
    await rerender({
      batchSize: 2,
      columns: 2,
      estimatedItemHeight: 400,
      gap: 0,
      initialCount: 2,
      items: items.slice(2),
      getItemKey: (item: { id: number }) => item.id,
    })
    await nextTick()

    // 200px 视口在行高 150px 下可见 2 行（4 项），且渐进挂载窗口未被归零卸载重挂
    expect(container.querySelectorAll('[data-progressive-grid-index]').length).toBeGreaterThanOrEqual(
      Math.min(mountedCountBeforeDelete - 2, 4),
    )
    expect(container.querySelectorAll('[data-progressive-grid-index]').length).toBeGreaterThanOrEqual(4)
  })

  it('refreshes frozenVisibleRange immediately when items are deleted during overlay close transition', async () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(200)
    const items = Array.from({ length: 12 }, (_, id) => ({ id, title: `item-${id}` }))
    const { container, rerender } = render(ProgressiveCardGrid, {
      props: {
        batchSize: 2,
        columns: 2,
        estimatedItemHeight: 100,
        gap: 0,
        initialCount: 4,
        overscanRows: 1,
        items,
        getItemKey: (item: { id: number }) => item.id,
      },
      slots: {
        default: ({ item }: { item: { title: string } }) => h('span', item.title),
      },
    })

    await waitFor(() => expect(container.querySelectorAll('[data-progressive-grid-index]')).toHaveLength(6))

    // 模拟 ConfirmDialog 打开并处于关闭退场动画中（v-overlay-scroll-blocked 仍存在）
    document.documentElement.classList.add('v-overlay-scroll-blocked')
    await new Promise(resolve => setTimeout(resolve, 0))

    // 删除前两张卡片，后续卡片 item-6、item-7 必须立即补进可见窗口，不能冻结卡顿
    await rerender({
      batchSize: 2,
      columns: 2,
      estimatedItemHeight: 100,
      gap: 0,
      initialCount: 4,
      overscanRows: 1,
      items: items.slice(2),
      getItemKey: (item: { id: number }) => item.id,
    })

    expect(container.querySelectorAll('[data-progressive-grid-index]')).toHaveLength(6)
    expect(container.textContent).toContain('item-6')
    expect(container.textContent).toContain('item-7')
    document.documentElement.classList.remove('v-overlay-scroll-blocked')
  })

  it('plays GPU FLIP translate3d animation on deletion/reorder but never on pure append', async () => {
    const positions = new Map<string, { left: number; top: number }>()
    const getBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const indexAttr = this.getAttribute('data-progressive-grid-index')
      if (indexAttr !== null) {
        const idx = Number(indexAttr)
        const pos = positions.get(this.textContent || '') ?? { left: (idx % 2) * 200, top: Math.floor(idx / 2) * 160 }
        return {
          bottom: pos.top + 150,
          height: 150,
          left: pos.left,
          right: pos.left + 190,
          toJSON: () => ({}),
          top: pos.top,
          width: 190,
          x: pos.left,
          y: pos.top,
        }
      }
      return getBoundingClientRect.call(this)
    })

    const animateSpy = vi.fn().mockReturnValue({
      cancel: vi.fn(),
      oncancel: null,
      onfinish: null,
    })
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: animateSpy,
      writable: true,
    })

    const items = [
      { id: 'a', label: 'card-a' },
      { id: 'b', label: 'card-b' },
      { id: 'c', label: 'card-c' },
    ]
    const { rerender } = render(ProgressiveCardGrid, {
      props: {
        columns: 2,
        estimatedItemHeight: 150,
        items,
        getItemKey: (item: { id: string }) => item.id,
      },
      slots: {
        default: ({ item }: { item: { label: string } }) => h('div', item.label),
      },
    })
    await nextTick()
    expect(animateSpy).not.toHaveBeenCalled()

    // 纯末尾分页追加：严禁触发 FLIP 动画
    const appendedItems = [...items, { id: 'd', label: 'card-d' }]
    await rerender({
      columns: 2,
      estimatedItemHeight: 150,
      items: appendedItems,
      getItemKey: (item: { id: string }) => item.id,
    })
    await nextTick()
    expect(animateSpy).not.toHaveBeenCalled()

    // 删除首张卡片 card-a：card-b 从 (200, 0) 移到 (0, 0)，dx = 200, dy = 0，应触发平滑补位动画
    await rerender({
      columns: 2,
      estimatedItemHeight: 150,
      items: appendedItems.slice(1),
      getItemKey: (item: { id: string }) => item.id,
    })
    await nextTick()

    expect(animateSpy).toHaveBeenCalled()
    expect(animateSpy).toHaveBeenCalledWith(
      [{ transform: 'translate3d(200px, 0px, 0)' }, { transform: 'translate3d(0, 0, 0)' }],
      { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    )

    // 清理原型属性
    delete (HTMLElement.prototype as { animate?: unknown }).animate
  })
})
