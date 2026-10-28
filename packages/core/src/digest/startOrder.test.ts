import { describe, expect, it } from 'vitest'
import { firstStartingAfter } from './startOrder'

const items = [1, 3, 3, 3, 7, 9].map((startMs) => ({ startMs }))

describe('firstStartingAfter', () => {
  it('is the index of the first item that starts after the time, equal starts included before it', () => {
    expect(firstStartingAfter(items, 0)).toBe(0)
    expect(firstStartingAfter(items, 1)).toBe(1)
    expect(firstStartingAfter(items, 2)).toBe(1)
    expect(firstStartingAfter(items, 3)).toBe(4)
    expect(firstStartingAfter(items, 8)).toBe(5)
  })

  it('is the count when none starts after the time, and zero for no items', () => {
    expect(firstStartingAfter(items, 9)).toBe(items.length)
    expect(firstStartingAfter(items, 1e15)).toBe(items.length)
    expect(firstStartingAfter([], 5)).toBe(0)
  })

  it('selects what a filter on the window selects, in the same order', () => {
    for (let windowStart = 0; windowStart <= 10; windowStart++) {
      for (let end = windowStart; end <= 10; end++) {
        const found = items.slice(
          firstStartingAfter(items, windowStart),
          firstStartingAfter(items, end),
        )
        expect(found).toEqual(items.filter((i) => i.startMs > windowStart && i.startMs <= end))
      }
    }
  })
})
