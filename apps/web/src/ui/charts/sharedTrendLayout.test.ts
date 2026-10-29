import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChartSize } from './chartTypes'
import { PLOT_BOTTOM_WITHOUT_X_TITLE, PLOT_MARGIN, plotBoxOf } from './plotBox'
import { DEFAULT_ROOT_PX, labelSizePx, labelWidthPx } from './rootFont'
import { trendGutter } from './sharedTrendGutter'
import { VALUE_ONLY_WIDTH, endLabelText, sharedTrendLayout } from './sharedTrendLayout'
import { trendRowsOf } from './sharedTrendRows'
import { week } from './sharedTrendFixtures'

const weeks = (n: number, pick: (i: number) => [number | null, number | null]) =>
  Array.from({ length: n }, (_, i) => week(i, ...pick(i)))

function sizeOf(width: number, gutter = 0, height = 280): ChartSize {
  return {
    width,
    height,
    plot: plotBoxOf(width, height, gutter || PLOT_MARGIN.right, PLOT_BOTTOM_WITHOUT_X_TITLE),
    tooltipId: 't',
    hintId: 'h',
    titleId: 'i',
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('sharedTrendLayout', () => {
  it('has no layout for fewer than two rows', () => {
    expect(sharedTrendLayout(trendRowsOf([week(0, 0.6, null)]), sizeOf(600))).toBeNull()
  })

  it('draws each sport as one stretch of line, and bridges a short gap inside it', () => {
    const data = trendRowsOf(weeks(10, (i) => [i === 4 || i === 5 ? null : 0.6 + i / 100, 0.5]))
    const m = sharedTrendLayout(data, sizeOf(600, 90))!
    expect(m.runRuns).toHaveLength(1)
    expect(m.runRuns[0]).toHaveLength(8)
    expect(m.rideRuns).toHaveLength(1)
    // The ride's band pairs with its line, point for point.
    expect(m.lowRuns[0]).toHaveLength(m.rideRuns[0]!.length)
  })

  it('starts a new stretch of line after a gap of eight weeks, so it is not bridged', () => {
    const data = trendRowsOf(weeks(24, (i) => [i >= 6 && i < 14 ? null : 0.6, null]))
    const m = sharedTrendLayout(data, sizeOf(600, 90))!
    expect(m.runRuns.map((run) => run.length)).toEqual([6, 10])
    expect(m.rideRuns).toEqual([])
  })

  it('scales the axis to take in the ride band as well as both lines, with room to spare', () => {
    const data = trendRowsOf(weeks(8, () => [0.6, 0.5]))
    const size = sizeOf(600, 90)
    const m = sharedTrendLayout(data, size)!
    const ys = [...m.runRuns[0]!, ...m.rideRuns[0]!, ...m.lowRuns[0]!, ...m.highRuns[0]!].map(
      (point) => point.y,
    )
    expect(Math.min(...ys)).toBeGreaterThan(size.plot.top)
    expect(Math.max(...ys)).toBeLessThan(size.plot.bottom)
    expect(m.yTicks.length).toBeGreaterThanOrEqual(3)
  })

  it('shows a marker at every row, until the rows are packed too close for one each', () => {
    const few = trendRowsOf(weeks(20, () => [0.6, null]))
    expect(sharedTrendLayout(few, sizeOf(600, 90))!.markers).toBe(true)
    // 1,300 weeks in a 500 px plot is not 9 px each, though the chart is drawn by the month there.
    const dense = { ...few, rows: Array.from({ length: 200 }, (_, i) => week(i, 0.6, null)) }
    expect(sharedTrendLayout(dense, sizeOf(600, 90))!.markers).toBe(false)
  })

  it('draws a long span by the month, so a library of years is a few dozen points', () => {
    const data = trendRowsOf(weeks(570, (i) => [0.5 + (i % 52) / 1000, i > 400 ? 0.45 : null]))
    const m = sharedTrendLayout(data, sizeOf(900, 90))!
    expect(data.monthly).toBe(true)
    expect(m.xs.length).toBeLessThan(140)
    // About 130 months in 750 px: too close for a marker each, so the line carries them.
    expect(m.markers).toBe(false)
    const year = trendRowsOf(
      weeks(52, () => [0.5, 0.45]).map((w, i) => Object.assign(w, { endMs: w.endMs + i })),
    )
    expect(sharedTrendLayout(year, sizeOf(900, 90))!.markers).toBe(true)
  })
})

describe('sharedTrendLayout end labels', () => {
  const em = labelSizePx(DEFAULT_ROOT_PX)

  it('names each line by its sport and value in the gutter, level with its last point', () => {
    const data = trendRowsOf(weeks(10, () => [0.64, 0.5]))
    const size = sizeOf(700, 90)
    const m = sharedTrendLayout(data, size)!
    expect(m.labels.map((label) => label.text)).toEqual(['Run 64%', 'Ride 50%'])
    for (const label of m.labels) {
      expect(label.anchor).toBe('start')
      expect(label.at.x).toBeGreaterThan(size.plot.right)
    }
    const run = m.runRuns[0]!.at(-1)!
    expect(Math.abs(m.labels[0]!.at.y - run.y)).toBeLessThan(em)
  })

  it('keeps the labels apart and inside the plot when both lines end on the same value', () => {
    const data = trendRowsOf(weeks(10, () => [0.6, 0.6]))
    const size = sizeOf(700, 90)
    const m = sharedTrendLayout(data, size)!
    const [a, b] = m.labels
    expect(Math.abs(a!.at.y - b!.at.y)).toBeGreaterThanOrEqual(em)
    for (const label of m.labels) {
      expect(label.at.y).toBeGreaterThanOrEqual(size.plot.top)
      expect(label.at.y).toBeLessThanOrEqual(size.plot.bottom)
    }
  })

  it('leads a narrow chart’s labels with the line’s own mark and leaves the sport out of the text', () => {
    expect(endLabelText('run', 0.64, VALUE_ONLY_WIDTH - 1)).toEqual({
      text: '64%',
      glyph: '●',
    })
    expect(endLabelText('ride', 0.58, 320)).toEqual({ text: '58%', glyph: '○' })
    expect(endLabelText('ride', 0.58, VALUE_ONLY_WIDTH)).toEqual({ text: 'Ride 58%' })
  })

  it('names a line that stops before the right edge beside its own end, not in the gutter', () => {
    const data = trendRowsOf(weeks(12, (i) => [0.6, i < 6 ? 0.5 : null]))
    const size = sizeOf(700, 90)
    const m = sharedTrendLayout(data, size)!
    const ride = m.labels.find((label) => label.kind === 'ride')!
    expect(ride.at.x).toBeLessThan(size.plot.right)
  })

  it('has no label for a sport with no value, nor for a held ride', () => {
    const data = trendRowsOf(weeks(10, () => [0.6, null]))
    expect(sharedTrendLayout(data, sizeOf(700, 90))!.labels.map((l) => l.kind)).toEqual(['run'])
  })
})

describe('trendGutter', () => {
  const data = weeks(10, () => [0.6, 0.55])

  it('is as wide as the widest label and its gap, so none of it is unused', () => {
    const rootPx = DEFAULT_ROOT_PX
    const wide = trendGutter(data)(900)
    expect(wide).toBeGreaterThanOrEqual(Math.ceil(labelWidthPx('Ride 55%', rootPx)) + 8)
    expect(wide).toBeLessThan(labelWidthPx('Ride 55%', rootPx) + 20)
  })

  it('is narrower on a phone, where a label is its value and a mark', () => {
    const gutter = trendGutter(data)
    expect(gutter(360)).toBeLessThan(gutter(900))
  })

  it('leaves the ride out while it is held, and keeps the usual margin with no value at all', () => {
    const held = trendGutter(data, false)(900)
    expect(held).toBeLessThan(trendGutter(data)(900))
    expect(trendGutter(weeks(4, () => [null, null]))(900)).toBe(PLOT_MARGIN.right)
  })
})
