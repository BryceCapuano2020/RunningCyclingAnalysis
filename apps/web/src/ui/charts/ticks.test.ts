// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AxisTick } from './chartTypes'
import { axisFontRem, axisFontSize, durationTicks, fitTicks, labelWidth, rootScale } from './ticks'

function ticksAt(positions: number[], label: string): AxisTick[] {
  return positions.map((position) => ({ position, label }))
}

describe('fitTicks', () => {
  it('drops every other tick while neighbouring labels would overlap', () => {
    const ticks = ticksAt([0, 20, 40, 60, 80, 100], '20 min')
    const kept = fitTicks(ticks, { axis: 'x', width: 1000 })
    expect(kept.map((tick) => tick.position)).toEqual([0, 80])
  })

  it('caps x ticks at four and uses 12 px text on a narrow chart', () => {
    const ticks = ticksAt([0, 100, 200, 300, 400, 500], '1 h')
    const kept = fitTicks(ticks, { axis: 'x', width: 390 })
    expect(kept.length).toBeLessThanOrEqual(4)
    expect(kept.map((tick) => tick.position)).toEqual([0, 200, 400])
    expect(axisFontSize(390)).toBe(12)
    expect(axisFontSize(1200)).toBe(13)
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
      { position: 60, label: '10 min' },
      { position: 120, label: '20 min' },
      { position: 180, label: '30 min' },
      { position: 360, label: '1 h' },
    ])
  })

  it('returns nothing when no candidate falls inside the span', () => {
    expect(durationTicks(4000, 5000, (durationS) => durationS)).toEqual([])
  })
})

describe('labelWidth', () => {
  it('estimates a label as 0.6 em a character', () => {
    expect(labelWidth('Jun 2025', 12, 1)).toBeCloseTo(8 * 12 * 0.6, 9)
    expect(labelWidth('', 12, 1)).toBe(0)
  })
})

describe('axisFontRem', () => {
  it('expresses an axis text size in rem, so it follows the reader’s text size', () => {
    expect(axisFontRem(13)).toBe('0.8125rem')
    expect(axisFontRem(12)).toBe('0.75rem')
  })

  describe('fitTicks keeps a named tick', () => {
    it('keeps the zero tick the caller names, even where the others are thinned away', () => {
      const ticks = Array.from({ length: 9 }, (_, i) => ({
        position: i * 40,
        label: i === 4 ? 'Even' : `${i}%`,
      }))
      const fitted = fitTicks(ticks, {
        axis: 'y',
        width: 600,
        maxCount: 3,
        keep: (tick) => tick.label === 'Even',
      })
      expect(fitted.map((tick) => tick.label)).toContain('Even')
    })
  })

  describe('tick labels at a larger root text size', () => {
    afterEach(() => {
      document.documentElement.style.fontSize = ''
    })

    it('widens a label as the root text size grows, so the collision maths follows the rem text', () => {
      expect(labelWidth('20 min', 13, rootScale())).toBeCloseTo(46.8)
      document.documentElement.style.fontSize = '20px'
      expect(labelWidth('20 min', 13, rootScale())).toBeCloseTo(58.5)
    })

    it('reads the root text size once for a whole fit, however many labels it checks', () => {
      const spy = vi.spyOn(globalThis, 'getComputedStyle')
      const ticks = [0, 60, 120, 180].map((position) => ({ position, label: '20 min' }))
      document.documentElement.style.fontSize = '20px'
      fitTicks(ticks, { axis: 'x', width: 600 })
      expect(spy.mock.calls.length).toBeLessThanOrEqual(1)
      spy.mockRestore()
    })

    it('thins a row of labels further at a 20 px root, where the same labels no longer fit', () => {
      const ticks = [0, 60, 120, 180].map((position) => ({ position, label: '20 min' }))
      expect(fitTicks(ticks, { axis: 'x', width: 600 })).toHaveLength(4)
      document.documentElement.style.fontSize = '20px'
      expect(fitTicks(ticks, { axis: 'x', width: 600 })).toHaveLength(2)
    })
  })
})
