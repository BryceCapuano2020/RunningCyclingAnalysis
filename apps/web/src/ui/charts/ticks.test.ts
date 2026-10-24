// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { AxisTick } from './chartTypes'
import { axisFontSize, durationTicks, fitTicks, labelWidth } from './ticks'

function ticksAt(positions: number[], label: string): AxisTick[] {
  return positions.map((position) => ({ position, label }))
}

describe('fitTicks', () => {
  it('drops every other tick while neighbouring labels would overlap', () => {
    const ticks = ticksAt([0, 20, 40, 60, 80, 100], '20 min')
    const kept = fitTicks(ticks, { axis: 'x', width: 1000 })
    expect(kept.map((tick) => tick.position)).toEqual([0, 80])
  })

  it('caps x ticks at four and uses 11 px text on a narrow chart', () => {
    const ticks = ticksAt([0, 100, 200, 300, 400, 500], '1 h')
    const kept = fitTicks(ticks, { axis: 'x', width: 390 })
    expect(kept.length).toBeLessThanOrEqual(4)
    expect(kept.map((tick) => tick.position)).toEqual([0, 200, 400])
    expect(axisFontSize(390)).toBe(11)
    expect(axisFontSize(1200)).toBe(12)
  })

  it('caps the count on request, spaced evenly', () => {
    const ticks = ticksAt([0, 30, 60, 90, 120, 150, 180], '')
    const kept = fitTicks(ticks, { axis: 'y', width: 1000, maxCount: 5 })
    expect(kept.length).toBeLessThanOrEqual(5)
    expect(kept.map((tick) => tick.position)).toEqual([0, 60, 120, 180])
  })

  it('leaves ticks alone when they fit', () => {
    const ticks = ticksAt([0, 200, 400], '1 min')
    expect(fitTicks(ticks, { axis: 'x', width: 1000 })).toEqual(ticks)
  })
})

describe('durationTicks', () => {
  it('labels each candidate duration inside the span, at its x position', () => {
    const ticks = durationTicks(60, 3600, (durationS) => durationS / 10)
    expect(ticks).toEqual([
      { position: 6, label: '1 min' },
      { position: 30, label: '5 min' },
      { position: 120, label: '20 min' },
      { position: 360, label: '1 h' },
    ])
  })

  it('returns nothing when no candidate falls inside the span', () => {
    expect(durationTicks(4000, 5000, (durationS) => durationS)).toEqual([])
  })
})

describe('labelWidth', () => {
  it('estimates a label as 0.6 em a character', () => {
    expect(labelWidth('Jun 2025', 12)).toBeCloseTo(8 * 12 * 0.6, 9)
    expect(labelWidth('', 12)).toBe(0)
  })
})
