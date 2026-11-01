import { describe, expect, it, vi } from 'vitest'
import type { ChartSize, TooltipContent } from './chartTypes'
import { sizedOnce, spreadApart, spreadWithin, tooltipAt } from './chartInteraction'

const SIZE: ChartSize = {
  width: 400,
  height: 300,
  plot: { left: 40, right: 380, top: 20, bottom: 260 },
  tooltipId: 'tip',
  hintId: 'chart-hint',
  titleId: 'chart-title',
}

const CONTENT: TooltipContent = { x: 0, y: 0, title: 'x', rows: [] }

describe('tooltipAt', () => {
  it('anchors the active point at its x and the middle of the plot', () => {
    const contentFor = vi.fn(() => CONTENT)
    tooltipAt(SIZE, [100, 200, 300], 1, contentFor)
    expect(contentFor).toHaveBeenCalledWith(1, 200, 140)
  })

  it('anchors beside the active point when its own height is given, not the plot middle', () => {
    const contentFor = vi.fn(() => CONTENT)
    tooltipAt(SIZE, [100, 200, 300], 1, contentFor, [90, 40, null])
    expect(contentFor).toHaveBeenCalledWith(1, 200, 40)
    tooltipAt(SIZE, [100, 200, 300], 2, contentFor, [90, 40, null])
    expect(contentFor).toHaveBeenLastCalledWith(2, 300, 140)
  })

  it('gives nothing without an active point or positions to anchor it to', () => {
    const contentFor = vi.fn(() => CONTENT)
    expect(tooltipAt(SIZE, [100], null, contentFor)).toBeNull()
    expect(tooltipAt(SIZE, null, 0, contentFor)).toBeNull()
    expect(tooltipAt(SIZE, [100], 3, contentFor)).toBeNull()
    expect(contentFor).not.toHaveBeenCalled()
  })
})

describe('sizedOnce', () => {
  it('computes once for the same size object, and again for a new one', () => {
    const compute = vi.fn((size: ChartSize) => size.width)
    const once = sizedOnce(compute)
    expect(once(SIZE)).toBe(400)
    expect(once(SIZE)).toBe(400)
    expect(compute).toHaveBeenCalledTimes(1)
    expect(once({ ...SIZE })).toBe(400)
    expect(compute).toHaveBeenCalledTimes(2)
  })
})

describe('spreadApart', () => {
  it('moves a value down only as far as it must, to keep the gap from the one above', () => {
    expect(spreadApart([100, 104, 200], 14)).toEqual([100, 114, 200])
  })

  it('keeps the input order, whatever the order of the values', () => {
    expect(spreadApart([104, 100], 14)).toEqual([114, 100])
    expect(spreadApart([], 14)).toEqual([])
  })
})

describe('spreadWithin', () => {
  it('spreads as spreadApart does where the values fit', () => {
    expect(spreadWithin([100, 104, 200], 14, 0, 300)).toEqual([100, 114, 200])
  })

  it('moves a crowd at the bottom up, so the last stays inside and the gap holds', () => {
    // Three values at the floor: spreadApart would push two of them past it.
    expect(spreadWithin([300, 300, 300], 14, 0, 300)).toEqual([272, 286, 300])
  })

  it('moves a value at the top down to the least bound', () => {
    expect(spreadWithin([-5, 0, 20], 14, 0, 300)).toEqual([0, 14, 28])
  })

  it('keeps the input order, whatever the order of the values', () => {
    expect(spreadWithin([300, 10, 300], 14, 0, 300)).toEqual([286, 10, 300])
    expect(spreadWithin([], 14, 0, 300)).toEqual([])
  })
})
