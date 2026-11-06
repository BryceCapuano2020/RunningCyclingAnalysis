import { DAY_MS } from '@rca/core/constants'
import { describe, expect, it } from 'vitest'
import type { VolumeWeek } from '../weeklyVolume'
import type { ChartSize } from './chartTypes'
import { PLOT_BOTTOM_WITHOUT_X_TITLE, plotBoxOf } from './plotBox'
import { STACK_GAP_PX, barOf, peakOf } from './weeklyVolumeLayout'
import type { VolumeBar } from './weeklyVolumeLayout'

const FIRST_END = Date.UTC(2025, 0, 12, 23, 59, 59, 999)
const HOUR = 3600
const WIDTH = 28

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

/** Bars for the weeks at evenly spaced xs, on a scale where an hour is 10 px up from the plot's bottom. */
function barsOf(weeks: VolumeWeek[], size: ChartSize) {
  const y = (hours: number) => size.plot.bottom - hours * 10
  const xs = weeks.map((_, i) => size.plot.left + 40 + i * 60)
  const bars = weeks.map((week, i) => barOf(week, xs[i]!, WIDTH, y, size.plot))
  return { bars, xs }
}

describe('barOf', () => {
  it('stacks the sports from the bottom in their order, each as tall as its hours', () => {
    const size = sizeOf(640)
    const { bars } = barsOf(weeksOf([2, 4], [1, 0]), size)
    const [stacked, plain] = bars
    expect(stacked?.segments.map((segment) => segment.sport)).toEqual(['run', 'ride'])
    const [run, ride] = stacked?.segments ?? []
    expect(run?.y).toBeCloseTo(size.plot.bottom - (run?.height ?? 0))
    // The ride stops STACK_GAP_PX short of the run, and the bar still reaches the height of its hours.
    expect((run?.y ?? 0) - ((ride?.y ?? 0) + (ride?.height ?? 0))).toBeCloseTo(STACK_GAP_PX)
    expect(((ride?.height ?? 0) + STACK_GAP_PX) / (run?.height ?? 1)).toBeCloseTo(2)
    expect(plain?.segments.map((segment) => segment.sport)).toEqual(['run'])
  })

  it('draws a week with no training as no bar', () => {
    const { bars } = barsOf(weeksOf([0, 0]), sizeOf(640))
    expect(bars[0]?.segments).toEqual([])
  })

  it('keeps a bar inside the plot where its centre is near either edge', () => {
    const size = sizeOf(320)
    const week = weeksOf([2, 1])[0]!
    const y = (hours: number) => size.plot.bottom - hours * 10
    const left = barOf(week, size.plot.left - 5, WIDTH, y, size.plot)
    const right = barOf(week, size.plot.right + 5, WIDTH, y, size.plot)
    expect(left.left).toBeGreaterThanOrEqual(size.plot.left)
    expect(right.left + right.width).toBeLessThanOrEqual(size.plot.right + 1e-9)
  })

  it('rounds the top of a bar and no other corner, however many sports it stacks', () => {
    const { bars } = barsOf(weeksOf([4, 4], [4, 0]), sizeOf(640))
    const [run, ride] = bars[0]?.segments ?? []
    expect(run?.path).not.toContain('A')
    expect(ride?.path).toContain('A')
    expect(bars[1]?.segments[0]?.path).toContain('A')
  })

  it('keeps a sliver of a sport as a flat piece, with no gap taken from it', () => {
    const { bars } = barsOf(weeksOf([4, 0.01]), sizeOf(640))
    const [run, ride] = bars[0]?.segments ?? []
    expect(ride?.height).toBeLessThan(STACK_GAP_PX)
    expect(ride?.height).toBeGreaterThan(0)
    expect((run?.y ?? 0) - ((ride?.y ?? 0) + (ride?.height ?? 0))).toBeCloseTo(0)
  })
})

describe('peakOf', () => {
  const peakFor = (weeks: VolumeWeek[], size: ChartSize) => {
    const { bars, xs } = barsOf(weeks, size)
    return { peak: peakOf(weeks, bars, xs, size), bars, xs }
  }

  it('labels the tallest bar with its hours, centred over it', () => {
    const { peak, bars, xs } = peakFor(weeksOf([2, 0], [3, 1.84], [1, 0]), sizeOf(640))
    expect(peak).toMatchObject({ text: '4.8 h', anchor: 'middle', index: 1 })
    expect(peak?.x).toBe(xs[1])
    expect(peak?.y).toBeLessThan((bars[1] as VolumeBar).segments.at(-1)!.y)
  })

  it('keeps the label inside the chart when the peak is the first or the last bar', () => {
    const size = sizeOf(320)
    const edge = barsOf(weeksOf([9, 0], [1, 0]), size)
    edge.xs[0] = size.plot.left + 2
    const first = peakOf(weeksOf([9, 0], [1, 0]), edge.bars, edge.xs, size)
    expect(first?.anchor).toBe('start')
    expect(first?.x).toBeGreaterThanOrEqual(size.plot.left)
    const { bars, xs } = barsOf(weeksOf([1, 0], [9, 0]), size)
    xs[1] = size.width - 4
    const last = peakOf(weeksOf([1, 0], [9, 0]), bars, xs, size)
    expect(last?.anchor).toBe('end')
  })

  it('has no label where no week trained', () => {
    expect(peakFor(weeksOf([0, 0], [0, 0]), sizeOf(640)).peak).toBeNull()
  })
})
