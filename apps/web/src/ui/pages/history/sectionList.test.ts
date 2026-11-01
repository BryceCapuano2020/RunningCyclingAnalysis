import { describe, expect, it } from 'vitest'
import { listedSections } from './sectionList'
import type { HistorySection } from './types'

const section = (id: string, order: number): HistorySection => ({ id, order, render: () => null })

describe('listedSections', () => {
  it('puts the sections in the order they ask for, and breaks a tie by id', () => {
    const listed = listedSections({ c: section('c', 30), b: section('b', 10), a: section('a', 10) })
    expect(listed.map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('lists the sections of sections.ts, each with an id and an order of its own', () => {
    const listed = listedSections()
    expect(listed.length).toBeGreaterThan(0)
    expect(new Set(listed.map((s) => s.id)).size).toBe(listed.length)
    expect(new Set(listed.map((s) => s.order)).size).toBe(listed.length)
  })
})
