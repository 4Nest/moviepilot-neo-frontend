import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useInfiniteScroll } from '@/composables/useInfiniteScroll'

describe('useInfiniteScroll', () => {
  it('calls done("empty") when remainingDataList becomes empty or has no items to move', () => {
    const sourceData = ref([1, 2, 3, 4, 5])
    const { displayDataList, remainingDataList, loadMore } = useInfiniteScroll(sourceData, 2)

    expect(displayDataList.value).toEqual([1, 2])
    expect(remainingDataList.value).toEqual([3, 4, 5])

    const doneFirst = vi.fn()
    loadMore({ done: doneFirst })
    expect(displayDataList.value).toEqual([1, 2, 3, 4])
    expect(remainingDataList.value).toEqual([5])
    expect(doneFirst).toHaveBeenCalledWith('ok')

    // 取完最后一条后，remaining 为空，应调用 done('empty') 防止无限触底循环
    const doneSecond = vi.fn()
    loadMore({ done: doneSecond })
    expect(displayDataList.value).toEqual([1, 2, 3, 4, 5])
    expect(remainingDataList.value).toEqual([])
    expect(doneSecond).toHaveBeenCalledWith('empty')

    // 再次调用无数据移动时也应调用 done('empty')
    const doneThird = vi.fn()
    loadMore({ done: doneThird })
    expect(doneThird).toHaveBeenCalledWith('empty')
  })
})
