import { DAY_MS } from '@rca/core/constants'
import { describe, expect, it } from 'vitest'
import type { VolumeWeek } from '../weeklyVolume'
import type { ChartSize } from './chartTypes'
import { PLOT_BOTTOM_WITHOUT_X_TITLE, plotBoxOf } from './plotBox'
import { MAX_BAR_PX, STACK_GAP_PX, weeklyVolumeLayout } from './weeklyVolumeLayout'

const FIRST_END = Date.UTC(2025, 0, 12, 23, 59, 59, 999)
const HOUR = 3600

function sizeOf(width: number, height = 200): ChartSize {
  return {
    width,
    height,
    plot: plotBoxOf(width, height, undefined, PLOT_BOTTOM_WITHOUT_X_TITLE),
    tooltipId: 't',
    hintId: 'h',
    titleId: 't',
  }
}

/** Weeks of [run hours, ride hours] ending on consecutive Sundays. */
function weeksOf(...hours: [number, number][]): VolumeWeek[] {
  return hours.map(([run, ride], i) => ({
    endMs: FIRST_END + i * 7 * DAY_MS,
    seconds: { run: run * HOUR, ride: ride * HOUR },
  }))
}

describe('weeklyVolumeLayout over months with a partial final month', () => {
  /** Month rows dated at the last Sunday of each, then a final row one week after the last. */
  const monthly = (): VolumeWeek[] => {
    const ends = [0, 4, 8, 13, 17, 21, 26, 30, 34, 39, 43, 47, 48]
    return ends.map((week) => ({
      endMs: FIRST_END + week * 7 * DAY_MS,
      seconds: { run: 3 * HOUR, ride: HOUR },
    }))
  }

  it('sizes bars by the usual spacing, the median, and not by the closest pair', () => {
    const size = sizeOf(640)
    const layout = weeklyVolumeLayout(monthly(), size)
    const gaps = layout!.xs.slice(1).map((x, i) => x - layout!.xs[i]!)
    const usual = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]!
    const widest = Math.max(...layout!.bars.map((bar) => bar.width))
    expect(widest).toBeCloseTo(Math.min(MAX_BAR_PX, usual * 0.7), 5)
    // The closest pair, the partial month, is a quarter of the usual space: sized by it every bar would be a sliver.
    expect(Math.min(...gaps)).toBeLessThan(usual / 2)
  })

  it('keeps the partial month’s bar and its neighbour from overlapping', () => {
    const layout = weeklyVolumeLayout(monthly(), sizeOf(640))!
    const bars = layout.bars
    for (let i = 1; i < bars.length; i++) {
      const before = bars[i - 1]!
      expect(before.left + before.width).toBeLessThanOrEqual(bars[i]!.left + 1e-9)
    }
    // The final bar is narrower than the others, for the room it has.
    expect(bars.at(-1)!.width).toBeLessThan(bars[0]!.width)
  })
})

describe('weeklyVolumeLayout', () => {
  it('stacks the sports from the bottom in their order, each as tall as its hours', () => {
    const size = sizeOf(640)
    const layout = weeklyVolumeLayout(weeksOf([2, 4], [1, 0]), size)
    const [stacked, plain] = layout?.bars ?? []
    expect(stacked?.segments.map((segment) => segment.sport)).toEqual(['run', 'ride'])
    const [run, ride] = stacked?.segments ?? []
    expect(run?.y).toBeCloseTo(size.plot.bottom - (run?.height ?? 0))
    // The ride stops STACK_GAP_PX short of the run, and the bar still reaches the height of its hours.
    expect((run?.y ?? 0) - ((ride?.y ?? 0) + (ride?.height ?? 0))).toBeCloseTo(STACK_GAP_PX)
    expect(((ride?.height ?? 0) + STACK_GAP_PX) / (run?.height ?? 1)).toBeCloseTo(2)
    expect(plain?.segments.map((segment) => segment.sport)).toEqual(['run'])
  })

  it('draws a week with no training as no bar, with its tooltip anchor on the axis', () => {
    const size = sizeOf(640)
    const layout = weeklyVolumeLayout(weeksOf([2, 0], [0, 0], [3, 0]), size)
    expect(layout?.bars[1]?.segments).toEqual([])
    expect(layout?.ys[1]).toBe(size.plot.bottom)
    expect(layout?.ys[0]).toBeLessThan(size.plot.bottom)
  })

  it('draws a tallest week to the top tick and starts the axis at zero', () => {
    const layout = weeklyVolumeLayout(weeksOf([4, 3], [2, 0], [1, 0]), sizeOf(640))
    expect(layout?.yTicks[0]?.label).toBe('0')
    const top = layout?.bars[0]?.segments.at(-1)
    expect(top?.y).toBeGreaterThanOrEqual(28)
  })

  it('keeps a bar inside the margin beside the plot, however few weeks there are', () => {
    const layout = weeklyVolumeLayout(weeksOf([1, 0], [1, 0], [1, 0]), sizeOf(1000))
    const widths = layout?.bars.map((bar) => bar.width)
    expect(Math.max(...(widths ?? []))).toBe(MAX_BAR_PX)
  })

  it('keeps a bar for every week of a long period, however narrow the room', () => {
    const many = Array.from({ length: 200 }, (): [number, number] => [3, 1])
    const layout = weeklyVolumeLayout(weeksOf(...many), sizeOf(320))
    expect(layout?.bars.every((bar) => bar.width >= 1)).toBe(true)
  })

  it('keeps the first and last bar inside the plot, clear of the axis labels, at short and long ranges', () => {
    for (const [count, width] of [
      [3, 1000],
      [3, 320],
      [12, 320],
      [260, 320],
    ] as const) {
      const size = sizeOf(width)
      const weeks = weeksOf(...Array.from({ length: count }, (): [number, number] => [2, 1]))
      const layout = weeklyVolumeLayout(weeks, size)
      for (const bar of [layout?.bars[0], layout?.bars.at(-1)]) {
        expect(bar?.left).toBeGreaterThanOrEqual(size.plot.left)
        expect((bar?.left ?? 0) + (bar?.width ?? 0)).toBeLessThanOrEqual(size.plot.right + 1e-9)
      }
    }
  })

  it('rounds the top of a bar and no other corner, however many sports it stacks', () => {
    const layout = weeklyVolumeLayout(weeksOf([4, 4], [4, 0], [1, 0]), sizeOf(640))
    const [stacked, single] = layout?.bars ?? []
    const [run, ride] = stacked?.segments ?? []
    expect(run?.path).not.toContain('A')
    expect(ride?.path).toContain('A')
    expect(single?.segments[0]?.path).toContain('A')
  })

  it('keeps a sliver of a sport as a flat piece, with no gap taken from it', () => {
    const layout = weeklyVolumeLayout(weeksOf([4, 0.01], [4, 0], [1, 0]), sizeOf(640))
    const [run, ride] = layout?.bars[0]?.segments ?? []
    expect(ride?.height).toBeLessThan(STACK_GAP_PX)
    expect(ride?.height).toBeGreaterThan(0)
    expect((run?.y ?? 0) - ((ride?.y ?? 0) + (ride?.height ?? 0))).toBeCloseTo(0)
  })

  it('labels the tallest bar with its hours, centred over it', () => {
    const size = sizeOf(640)
    const layout = weeklyVolumeLayout(weeksOf([2, 0], [3, 1.84], [1, 0], [2, 0]), size)
    expect(layout?.peak).toMatchObject({ text: '4.8 h', anchor: 'middle', index: 1 })
    expect(layout?.peak?.x).toBe(layout?.xs[1])
    expect(layout?.peak?.y).toBeLessThan(layout?.ys[1] ?? 0)
  })

  it('keeps the peak label inside the plot, under the axis title, wherever the peak is', () => {
    for (const hours of [
      [4, 0],
      [10, 6],
      [0.5, 0.2],
    ] as [number, number][]) {
      for (const peakAt of [0, 1, 2]) {
        const rows: [number, number][] = [
          [1, 0],
          [1, 0],
          [1, 0],
        ]
        rows[peakAt] = hours
        const size = sizeOf(390, 260)
        const peak = weeklyVolumeLayout(weeksOf(...rows), size)?.peak
        // The label's line is a root font size tall: its top is the plot's, or below.
        expect(peak!.y - 16, `${hours} at ${peakAt}`).toBeGreaterThanOrEqual(size.plot.top)
      }
    }
  })

  it('keeps the peak label inside the chart when the peak is the first or the last bar', () => {
    const size = sizeOf(320)
    const first = weeklyVolumeLayout(weeksOf([9, 0], [1, 0], [1, 0]), size)
    expect(first?.peak?.anchor).toBe('start')
    expect(first?.peak?.x).toBeGreaterThanOrEqual(size.plot.left)
    const last = weeklyVolumeLayout(weeksOf([1, 0], [1, 0], [9, 0]), size)
    expect(last?.peak?.anchor).toBe('end')
    expect(last?.peak?.x).toBeLessThanOrEqual(size.width)
  })

  it('has no peak label where no week trained', () => {
    expect(weeklyVolumeLayout(weeksOf([0, 0], [0, 0], [0, 0]), sizeOf(640))?.peak).toBeNull()
  })

  it('has no layout with fewer than two weeks', () => {
    expect(weeklyVolumeLayout(weeksOf([1, 0]), sizeOf(640))).toBeNull()
  })
})
