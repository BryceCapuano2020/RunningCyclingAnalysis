import { describe, expect, it } from 'vitest'
import { sortAndDedupe } from './points'
import type { Point } from './points'

describe('sortAndDedupe', () => {
  it('collapses points that differ only in cadence or temperature', () => {
    const base: Point = { tMs: 1000, distance: 5, heartRate: 140 }
    const points = sortAndDedupe([
      { ...base, runCadence: 85, temperature: 10 },
      { ...base, runCadence: 86, temperature: 11 },
      { ...base, cadence: 90 },
    ])
    expect(points).toHaveLength(1)
    expect(points[0]!.runCadence).toBe(85)
  })

  it('keeps points that share a time but differ in a core value', () => {
    const points = sortAndDedupe([
      { tMs: 1000, distance: 5 },
      { tMs: 1000, distance: 6 },
      { tMs: 500, distance: 1 },
    ])
    expect(points.map((p) => p.distance)).toEqual([1, 5, 6])
  })
})
