import { DAY_MS } from '@rca/core/constants'
import { describe, expect, it } from 'vitest'
import type { VolumeWeek } from '../weeklyVolume'
import type { ChartSize } from './chartTypes'
import { monthBarLabel } from './monthBarTicks'
import { volumeRowsOf } from './monthlyVolume'
import { PLOT_BOTTOM_WITHOUT_X_TITLE, plotBoxOf } from './plotBox'
import { axisFontSize, labelWidth, rootScale } from './ticks'
import { labelExtent } from './trendTicks'
import { weeklyVolumeLayout } from './weeklyVolumeLayout'

const sizeOf = (width: number): ChartSize => ({
  width,
  height: 200,
  plot: plotBoxOf(width, 200, undefined, PLOT_BOTTOM_WITHOUT_X_TITLE, width < 480),
  tooltipId: 't',
  hintId: 'h',
  titleId: 't',
})

/** Weekly volume on consecutive Sundays from 5 Oct 2025 to 25 Oct 2026: thirteen months, the last a partial one. */
const FIRST_END = Date.UTC(2025, 9, 5, 23, 59, 59, 999)
const weeks = (count: number, first = FIRST_END): VolumeWeek[] =>
  Array.from({ length: count }, (_, i) => ({
    endMs: first + i * 7 * DAY_MS,
    seconds: { run: 3 * 3600, ride: 3600 },
  }))

const layoutAt = (width: number, given = weeks(56)) => {
  const data = volumeRowsOf(given)
  const layout = weeklyVolumeLayout(data.rows, sizeOf(width), data.axis?.gaps, data.monthly)!
  return { data, layout, size: sizeOf(width) }
}

/** The index of the bar each tick stands at, and what it says. */
const placed = (width: number, given?: VolumeWeek[]) => {
  const { data, layout, size } = layoutAt(width, given)
  return {
    size,
    ...layout,
    rows: data.rows,
    at: layout.xTicks.map((tick) => ({
      index: layout.xs.findIndex((x) => Math.abs(x - tick.position) < 1e-6),
      label: tick.label,
    })),
  }
}

describe('the x ticks of bars that are months', () => {
  it('has thirteen month bars for the span, the last one partial', () => {
    const { rows } = placed(1100)
    expect(rows).toHaveLength(13)
    expect(monthBarLabel(rows[0]!.endMs)).toBe('Oct 2025')
    expect(monthBarLabel(rows.at(-1)!.endMs)).toBe('Oct 2026')
  })

  it.each([1100, 1280, 390, 342, 320])(
    'puts every label under a bar and names that bar’s month, at %i px',
    (width) => {
      const { at, rows } = placed(width)
      expect(at.length).toBeGreaterThan(1)
      for (const { index, label } of at) {
        expect(index).toBeGreaterThanOrEqual(0)
        expect(label).toBe(monthBarLabel(rows[index]!.endMs))
      }
    },
  )

  it.each([1100, 1280, 390, 342, 320])(
    'spaces the labels evenly by bar, and names the last month, at %i px',
    (width) => {
      const { at, rows } = placed(width)
      const indices = at.map((tick) => tick.index)
      const steps = indices.slice(1).map((index, i) => index - indices[i]!)
      expect(new Set(steps).size).toBe(1)
      expect(indices.at(-1)).toBe(rows.length - 1)
      expect(at.at(-1)?.label).toBe('Oct 2026')
    },
  )

  it.each([1100, 1280, 390, 342, 320])('leaves no two labels touching, at %i px', (width) => {
    const { xTicks, size } = placed(width)
    const extents = xTicks.map((tick) =>
      labelExtent(tick, size.plot, axisFontSize(width), rootScale()),
    )
    extents.slice(1).forEach((extent, i) => expect(extent[0]).toBeGreaterThan(extents[i]![1]))
    // And each label's own width is the estimate the extent used.
    expect(labelWidth(xTicks[0]!.label, axisFontSize(width), rootScale())).toBeGreaterThan(0)
  })

  it('labels every bar when the room allows, so none is left to guess', () => {
    const { at } = placed(2400)
    expect(at.map((tick) => tick.index)).toEqual(Array.from({ length: 13 }, (_, i) => i))
  })

  it('names a partial month that sits close to the one before it, and thins the one before', () => {
    // 3 weeks into October: the partial month's bar is one week after September's, a quarter of the usual room.
    const { at, rows } = placed(1100, weeks(52))
    expect(monthBarLabel(rows.at(-1)!.endMs)).toBe('Sep 2026')
    const closer = placed(1100, weeks(53))
    expect(closer.at.at(-1)?.label).toBe('Oct 2026')
    expect(closer.at.some((tick) => tick.label === 'Sep 2026')).toBe(false)
    expect(at.at(-1)?.label).toBe('Sep 2026')
  })
})
