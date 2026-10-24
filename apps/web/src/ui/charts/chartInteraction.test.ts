import { describe, expect, it, vi } from 'vitest'
import type { ChartSize, TooltipContent } from './chartTypes'
import { sizedOnce, tooltipAt } from './chartInteraction'

const SIZE: ChartSize = {
  width: 400,
  height: 300,
  plot: { left: 40, right: 380, top: 20, bottom: 260 },
  tooltipId: 'tip',
}

const CONTENT: TooltipContent = { x: 0, y: 0, title: 'x', rows: [] }

describe('tooltipAt', () => {
  it('anchors the active point at its x and the middle of the plot', () => {
    const contentFor = vi.fn(() => CONTENT)
    tooltipAt(SIZE, [100, 200, 300], 1, contentFor)
    expect(contentFor).toHaveBeenCalledWith(1, 200, 140)
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
