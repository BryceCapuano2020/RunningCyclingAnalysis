import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChartSize } from './chartTypes'
import { PLOT_BOTTOM_WITHOUT_X_TITLE, PLOT_MARGIN, plotBoxOf } from './plotBox'
import { smallWidth } from './annotationTypes'
import { layoutAnnotations } from './annotations'
import { DEFAULT_ROOT_PX } from './rootFont'
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
  /** Where the annotation layout puts the layout's end labels at this size, as the chart draws them. */
  const placedAt = (m: NonNullable<ReturnType<typeof sharedTrendLayout>>, size: ChartSize) =>
    layoutAnnotations(m.annotations, {
      plot: size.plot,
      width: size.width,
      rootPx: DEFAULT_ROOT_PX,
      obstacles: m.obstacles,
    })

  it('gives each line one end label at its last point, named by its sport and value', () => {
    const data = trendRowsOf(weeks(10, () => [0.64, 0.5]))
    const size = sizeOf(700, 90)
    const m = sharedTrendLayout(data, size)!
    expect(m.annotations).toMatchObject([
      { id: 'end-run', kind: 'end', tone: 'run', text: 'Run 64%' },
      { id: 'end-ride', kind: 'end', tone: 'ride', text: 'Ride 50%' },
    ])
    expect(m.annotations[0]).toMatchObject({ at: m.runRuns[0]!.at(-1) })
  })

  it('sets the labels in the gutter right of the plot, level with their lines', () => {
    const data = trendRowsOf(weeks(10, () => [0.64, 0.5]))
    const size = sizeOf(700, trendGutter(weeks(10, () => [0.64, 0.5]))(700))
    const m = sharedTrendLayout(data, size)!
    const placed = placedAt(m, size)
    expect(placed).toHaveLength(2)
    for (const label of placed) {
      expect(label.box.left).toBeGreaterThan(size.plot.right)
      expect(label.box.right).toBeLessThanOrEqual(size.width)
    }
  })

  it('keeps the two labels apart where both lines end on the same value', () => {
    const data = trendRowsOf(weeks(10, () => [0.6, 0.6]))
    const size = sizeOf(700, trendGutter(weeks(10, () => [0.6, 0.6]))(700))
    const [a, b] = placedAt(sharedTrendLayout(data, size)!, size)
    expect(a!.box.bottom <= b!.box.top || b!.box.bottom <= a!.box.top).toBe(true)
  })

  it('leads a narrow chart’s labels with the line’s own mark and leaves the sport out of the text', () => {
    expect(endLabelText('run', 0.64, VALUE_ONLY_WIDTH - 1)).toEqual({
      text: '64%',
      glyph: '●',
    })
    expect(endLabelText('ride', 0.58, 320)).toEqual({ text: '58%', glyph: '○' })
    expect(endLabelText('ride', 0.58, VALUE_ONLY_WIDTH)).toEqual({ text: 'Ride 58%' })
    // A line that reaches the gutter carries its mark; the label of a line that stops early needs none.
    const data = trendRowsOf(weeks(12, (i) => [0.6, i < 6 ? 0.5 : null]))
    const size = sizeOf(340, 60)
    const m = sharedTrendLayout(data, size)!
    expect(m.annotations.map((a) => (a.kind === 'end' ? a.glyph : 'x'))).toEqual(['●', undefined])
  })

  it('names a line that stops before the right edge beside its own end, not in the gutter', () => {
    const data = trendRowsOf(weeks(12, (i) => [0.6, i < 6 ? 0.5 : null]))
    const size = sizeOf(700, trendGutter(weeks(12, () => [0.6, 0.5]))(700))
    const placed = placedAt(sharedTrendLayout(data, size)!, size)
    const ride = placed.find((label) => label.id === 'end-ride')!
    expect(ride.box.left).toBeLessThan(size.plot.right)
  })

  it('has no label for a sport with no value, nor for a held ride', () => {
    const data = trendRowsOf(weeks(10, () => [0.6, null]))
    expect(sharedTrendLayout(data, sizeOf(700, 90))!.annotations.map((a) => a.id)).toEqual([
      'end-run',
    ])
  })
})

describe('trendGutter', () => {
  const data = weeks(10, () => [0.6, 0.55])

  it('is as wide as the widest label and its gap, so none of it is unused', () => {
    const wide = trendGutter(data)(900)
    const text = smallWidth('Ride 55%', DEFAULT_ROOT_PX)
    // 10 px between the plot and the text, and 4 px between the text and the chart's edge.
    expect(wide).toBe(Math.ceil(text) + 14)
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
