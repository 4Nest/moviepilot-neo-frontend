import { useRangeSelection } from '@/composables/useRangeSelection'
import { describe, expect, it } from 'vitest'

interface Item {
  id: number
}

function createSelection(initialItems: Item[] = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]) {
  let items = initialItems
  let selected = new Set<number>()
  const selection = useRangeSelection<Item>({
    items: () => items,
    getKey: item => item.id,
    isSelected: item => selected.has(item.id),
    setSelected: (range, checked) => {
      const next = new Set(selected)
      for (const item of range) {
        if (checked) next.add(item.id)
        else next.delete(item.id)
      }
      selected = next
    },
  })

  return {
    selection,
    selectedIds: () => [...selected].sort((a, b) => a - b),
    setItems: (next: Item[]) => {
      items = next
    },
  }
}

describe('useRangeSelection', () => {
  it('selects forward and backward ranges in the current display order', () => {
    const { selection, selectedIds } = createSelection()

    selection.select({ id: 2 }, true)
    selection.select({ id: 4 }, true, true)
    expect(selectedIds()).toEqual([2, 3, 4])

    selection.select({ id: 1 }, true)
    selection.select({ id: 3 }, true, true)
    expect(selectedIds()).toEqual([1, 2, 3, 4])
  })

  it('applies the anchor checked state to clear a range', () => {
    const { selection, selectedIds } = createSelection()
    selection.select({ id: 1 }, true)
    selection.select({ id: 4 }, true, true)

    selection.select({ id: 3 }, false)
    selection.select({ id: 1 }, false, true)
    expect(selectedIds()).toEqual([4])
  })

  it('only toggles the current item when the anchor is hidden or reset', () => {
    const { selection, selectedIds, setItems } = createSelection()
    selection.select({ id: 4 }, true)
    setItems([{ id: 1 }, { id: 2 }])
    selection.select({ id: 2 }, true, true)
    expect(selectedIds()).toEqual([2, 4])

    selection.reset()
    selection.select({ id: 1 }, true, true)
    expect(selectedIds()).toEqual([1, 2, 4])
  })

  it('consumes checkbox Shift state once and corrects the native input', () => {
    const { selection, selectedIds } = createSelection()
    selection.selectFromCheckbox({ id: 1 }, true)
    selection.onCheckboxClick({ shiftKey: true } as MouseEvent)
    selection.selectFromCheckbox({ id: 3 }, true)
    expect(selectedIds()).toEqual([1, 2, 3])

    selection.selectFromCheckbox({ id: 4 }, true)
    expect(selectedIds()).toEqual([1, 2, 3, 4])

    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = false
    selection.onCheckboxInput({ id: 1 }, { target: input } as unknown as Event)
    expect(input.checked).toBe(true)
  })
})
