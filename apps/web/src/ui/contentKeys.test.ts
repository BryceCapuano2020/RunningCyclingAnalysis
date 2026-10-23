import { describe, expect, it } from 'vitest'
import { keyByContent } from './contentKeys'

describe('keyByContent', () => {
  it('keeps an item key when the list is reordered', () => {
    const before = keyByContent(['a', 'b', 'c'], (item) => item)
    const after = keyByContent(['c', 'a', 'b'], (item) => item)
    const keyOf = (rows: typeof before, item: string) => rows.find((row) => row.item === item)?.key
    expect(keyOf(after, 'a')).toBe(keyOf(before, 'a'))
    expect(keyOf(after, 'c')).toBe(keyOf(before, 'c'))
  })

  it('gives equal items distinct keys', () => {
    const rows = keyByContent(['x', 'x', 'y'], (item) => item)
    const keys = rows.map((row) => row.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('reports each item index in the original list', () => {
    const rows = keyByContent(['p', 'q'], (item) => item)
    expect(rows.map((row) => row.index)).toEqual([0, 1])
  })
})
