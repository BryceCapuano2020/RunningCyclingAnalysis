import { describe, expect, it, vi } from 'vitest'
import type { ChartSize, TooltipContent } from './chartTypes'
import { endLabelAt, pointBefore, sizedOnce, spreadApart, tooltipAt } from './chartInteraction'

const SIZE: ChartSize = {
  width: 400,
  height: 300,
  plot: { left: 40, right: 380, top: 20, bottom: 260 },
  tooltipId: 'tip',
  titleId: 'chart-title',
  hintId: 'chart-hint',
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

describe('endLabelAt', () => {
  const point = { x: 100, y: 100 }

  it('sits down and to the left of the point when the line comes in from above, or has none', () => {
    expect(endLabelAt(point, { x: 80, y: 60 })).toEqual({ x: 92, y: 118 })
    expect(endLabelAt(point, null)).toEqual({ x: 92, y: 118 })
  })

  it('sits up and to the left when the line comes in from below, so the line runs under it', () => {
    expect(endLabelAt(point, { x: 80, y: 140 })).toEqual({ x: 92, y: 90 })
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

describe('pointBefore', () => {
  it('gives the nearest point before an index that has a value, skipping gaps', () => {
    const points = [{ x: 0, y: 0 }, null, { x: 20, y: 5 }, null, { x: 40, y: 9 }]
    expect(pointBefore(points, 4)).toEqual({ x: 20, y: 5 })
    expect(pointBefore(points, 1)).toEqual({ x: 0, y: 0 })
    expect(pointBefore(points, 0)).toBeNull()
  })
})
