import { DAY_MS } from '@rca/core/constants'
import { describe, expect, it } from 'vitest'
import type { VolumeWeek } from '../weeklyVolume'
import type { ChartSize } from './chartTypes'
import type { SharedWeek } from './gradeTrend'
import { PLOT_BOTTOM_WITHOUT_X_TITLE, plotBoxOf } from './plotBox'
import { sharedTrendLayout } from './sharedTrendLayout'
import {
  MAX_BAR_PX,
  MIN_EDGED_BAR_PX,
  MIN_EDGED_PART_PX,
  weeklyVolumeLayout,
} from './weeklyVolumeLayout'

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

describe('weeklyVolumeLayout', () => {
  it('stands each bar at the x the trend gives the same week, at any width', () => {
    const volume = weeksOf([3, 0], [0, 0], [2, 4], [5, 1], [0, 6])
    const trend: SharedWeek[] = volume.map((week) => ({
      endMs: week.endMs,
      run: 0.6,
      ride: null,
      rideLow: null,
      rideHigh: null,
      runCount: 1,
      rideCount: 0,
    }))
    for (const width of [320, 640, 1000]) {
      // The strip is shorter than the trend; only the plot's left and right edges must agree.
      const bars = weeklyVolumeLayout(volume, sizeOf(width, 200))
      const line = sharedTrendLayout(trend, 'grade', sizeOf(width, 320))
      expect(bars?.xs).toEqual(line?.xs)
      expect(bars?.xTicks).toEqual(line?.xTicks)
    }
  })

  it('stacks the sports from the bottom in their order, each as tall as its hours', () => {
    const size = sizeOf(640)
    const layout = weeklyVolumeLayout(weeksOf([2, 4], [1, 0]), size)
    const [stacked, plain] = layout?.bars ?? []
    expect(stacked?.segments.map((segment) => segment.sport)).toEqual(['run', 'ride'])
    const [run, ride] = stacked?.segments ?? []
    expect(run?.y).toBeCloseTo(size.plot.bottom - (run?.height ?? 0))
    expect(ride?.y).toBeCloseTo((run?.y ?? 0) - (ride?.height ?? 0))
    expect((ride?.height ?? 0) / (run?.height ?? 1)).toBeCloseTo(2)
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

  it('edges a part only when it is wide and tall enough to keep its fill', () => {
    const wide = weeklyVolumeLayout(weeksOf([4, 4], [4, 0.01], [1, 0]), sizeOf(640))
    expect(wide?.bars[0]?.segments.map((segment) => segment.edged)).toEqual([true, true])
    const thin = wide?.bars[1]?.segments.find((segment) => segment.sport === 'ride')
    expect(thin?.height).toBeLessThan(MIN_EDGED_PART_PX)
    expect(thin?.edged).toBe(false)
    const many = Array.from({ length: 260 }, (): [number, number] => [3, 1])
    const narrow = weeklyVolumeLayout(weeksOf(...many), sizeOf(320))
    expect(narrow?.bars[0]?.width).toBeLessThan(MIN_EDGED_BAR_PX)
    expect(narrow?.bars.every((bar) => bar.segments.every((segment) => !segment.edged))).toBe(true)
  })

  it('has no layout with fewer than two weeks', () => {
    expect(weeklyVolumeLayout(weeksOf([1, 0]), sizeOf(640))).toBeNull()
  })
})
