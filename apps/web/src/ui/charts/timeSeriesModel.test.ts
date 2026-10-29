import { describe, expect, it } from 'vitest'
import {
  areaPath,
  bandPath,
  hasReadingNear,
  linePath,
  meanAround,
  reduceSeries,
  smoothedStream,
  smoothingWindowS,
  stepCursor,
  timeTicks,
} from './timeSeriesModel'

const NAN = Number.NaN
const identity = { x: (t: number) => t, y: (v: number) => v }

describe('smoothedStream', () => {
  it('sums only the readings, so the mean of any window is two lookups', () => {
    const stream = smoothedStream(Float32Array.from([1, 2, NAN, 4]))
    expect([...stream.sum]).toEqual([0, 1, 3, 3, 7])
    expect([...stream.count]).toEqual([0, 1, 2, 2, 3])
  })
})

describe('smoothingWindowS', () => {
  it('is about a hundred and seventy-fifth of the window: two minutes on six hours, 3 s on a lap', () => {
    expect(smoothingWindowS(21_600)).toBe(123)
    expect(smoothingWindowS(3600)).toBe(21)
    expect(smoothingWindowS(600)).toBe(3)
    expect(smoothingWindowS(300)).toBe(3)
  })

  it('grows with the window, and never passes it', () => {
    const spans = [30, 120, 600, 3600, 7200, 21_600]
    const windows = spans.map(smoothingWindowS)
    expect([...windows].sort((a, b) => a - b)).toEqual(windows)
    expect(smoothingWindowS(2)).toBe(2)
    expect(smoothingWindowS(1)).toBe(1)
  })
})

describe('reduceSeries', () => {
  const steady = (seconds: number, value: number) => new Float32Array(seconds).fill(value)

  it('gives at most a column for each pixel, and a column for each second when the window is shorter', () => {
    const stream = smoothedStream(steady(3600, 5))
    expect(reduceSeries(stream, 0, 3600, 600).x).toHaveLength(600)
    expect(reduceSeries(stream, 10, 18, 600).x).toHaveLength(8)
  })

  it('keeps a spike in the band though the rolling mean smooths it away', () => {
    const values = steady(600, 100)
    values[300] = 400
    const columns = reduceSeries(smoothedStream(values), 0, 600, 100)
    const at = columns.x.findIndex((x) => x > 300)
    expect(columns.hi[at]).toBe(400)
    expect(columns.lo[at]).toBe(100)
    // Six seconds to a column and a 12 s mean: the spike is a thirtieth of its window.
    expect(columns.mean[at]).toBeLessThan(140)
  })

  it('leaves a column with no reading empty, and breaks the line there', () => {
    const values = steady(300, 100)
    values.fill(NAN, 100, 200)
    const columns = reduceSeries(smoothedStream(values), 0, 300, 300)
    expect(Number.isNaN(columns.lo[150]!)).toBe(true)
    expect(Number.isNaN(columns.mean[150]!)).toBe(true)
    expect(Number.isFinite(columns.mean[50]!)).toBe(true)
    expect(linePath(columns, identity).match(/M /g)).toHaveLength(2)
  })

  it('reads exactly the mean at a cursor that the line draws there, a column to the second', () => {
    const values = Float32Array.from({ length: 900 }, (_, i) => 100 + (i % 7) + (i % 3) * 5)
    const stream = smoothedStream(values)
    // As many columns as seconds: each column is one second, and the cursor's second is its column.
    const columns = reduceSeries(stream, 0, 900, 900)
    for (const k of [0, 1, 2, 120, 449, 897, 898, 899]) {
      expect(meanAround(stream, k, columns.windowS)).toBe(columns.mean[k])
    }
  })

  it('cuts a window at the ends of the activity, and does not slide it inward', () => {
    // A ramp of one a second: the mean of a window centred on second 0 with only its later half is 2, not 5.
    const stream = smoothedStream(Float32Array.from({ length: 100 }, (_, i) => i))
    expect(meanAround(stream, 0, 5)).toBe(1)
    expect(meanAround(stream, 99, 5)).toBe(98)
    expect(meanAround(stream, 50, 5)).toBe(50)
  })

  it('reads a window given before the start or past the end as the seconds it holds', () => {
    const stream = smoothedStream(Float32Array.from({ length: 60 }, (_, i) => i))
    const columns = reduceSeries(stream, -30, 90, 60)
    expect(columns.x[0]).toBeGreaterThan(0)
    expect(columns.x.at(-1)).toBeLessThan(60)
    expect(columns.x).toHaveLength(60)
    expect(columns.lo[0]).toBe(0)
    expect(columns.hi.at(-1)).toBe(59)
    expect(reduceSeries(stream, 59, 60, 10).x).toHaveLength(1)
    expect(reduceSeries(stream, 0, 1, 10).lo).toEqual([0])
  })

  it('bridges a gap of a second or two, and breaks the line across a longer one', () => {
    const values = new Float32Array(200).fill(100)
    values[40] = Number.NaN
    values.fill(Number.NaN, 100, 102)
    values.fill(Number.NaN, 150, 160)
    const columns = reduceSeries(smoothedStream(values), 0, 200, 200)
    // The one-second and two-second hiccups keep their columns on the line; the ten-second gap has none.
    expect(Number.isFinite(columns.mean[40]!)).toBe(true)
    expect(Number.isFinite(columns.mean[100]!)).toBe(true)
    expect(Number.isFinite(columns.mean[101]!)).toBe(true)
    expect(columns.mean.slice(151, 159).every(Number.isNaN)).toBe(true)
    expect(linePath(columns, identity).match(/M /g)).toHaveLength(2)
    // A third second missing is a gap.
    values.fill(Number.NaN, 100, 103)
    const longer = reduceSeries(smoothedStream(values), 0, 200, 200)
    expect(Number.isNaN(longer.mean[101]!)).toBe(true)
  })

  it('knows a second inside a gap has no reading, and one in a hiccup does', () => {
    const values = new Float32Array(100).fill(1)
    values[10] = Number.NaN
    values.fill(Number.NaN, 50, 60)
    const stream = smoothedStream(values)
    expect(hasReadingNear(stream, 5)).toBe(true)
    expect(hasReadingNear(stream, 10)).toBe(true)
    expect(hasReadingNear(stream, 55)).toBe(false)
    expect(hasReadingNear(stream, 0)).toBe(true)
    expect(hasReadingNear(stream, 99)).toBe(true)
    expect(hasReadingNear(stream, 100)).toBe(false)
  })

  it('reads a window inside a long ride from the same sums, without touching the rest', () => {
    const six = smoothedStream(Float32Array.from({ length: 21_600 }, (_, i) => i % 200))
    const columns = reduceSeries(six, 10_000, 10_600, 600)
    expect(columns.x[0]).toBeGreaterThan(10_000)
    expect(columns.x.at(-1)).toBeLessThan(10_600)
  })
})

describe('paths', () => {
  it('draws a lone reading as a zero-length stroke, which the round cap shows as a dot', () => {
    const columns = {
      x: [1, 2, 3],
      mean: [NAN, 5, NAN],
      lo: [NAN, 5, NAN],
      hi: [NAN, 5, NAN],
      windowS: 3,
    }
    expect(linePath(columns, identity)).toBe('M 2 5 L 2 5')
  })

  it('closes one band for each unbroken stretch, top edge then bottom edge back', () => {
    const columns = {
      x: [1, 2, 3, 4, 5],
      mean: [3, 3, NAN, 3, 3],
      lo: [2, 2, NAN, 1, 1],
      hi: [4, 4, NAN, 5, 5],
      windowS: 3,
    }
    const band = bandPath(columns, identity)
    expect(band.match(/Z/g)).toHaveLength(2)
    expect(band.startsWith('M 1 4 L 2 4 L 2 2 L 1 2 Z')).toBe(true)
  })

  it('closes an area down to the baseline under each stretch', () => {
    const columns = { x: [1, 2], mean: [3, 4], lo: [3, 4], hi: [3, 4], windowS: 3 }
    expect(areaPath(columns, identity, 9)).toBe('M 1 9 L 1 3 L 2 4 L 2 9 Z')
  })
})

describe('timeTicks', () => {
  it('falls on round times no closer than the gap', () => {
    expect(timeTicks(0, 600, 600, 100)).toEqual([0, 120, 240, 360, 480, 600])
    expect(timeTicks(0, 21_600, 300, 64)).toEqual([0, 7200, 14_400, 21_600])
  })

  it('starts at the first round time inside a zoomed window', () => {
    expect(timeTicks(1234, 1294, 600, 100)[0]).toBe(1240)
  })
})

describe('stepCursor', () => {
  it('starts an arrow at the end it moves from, and steps a hundredth of the window', () => {
    expect(stepCursor(null, 'ArrowRight', 0, 1000)).toBe(0)
    expect(stepCursor(null, 'ArrowLeft', 0, 1000)).toBe(999)
    expect(stepCursor(500, 'ArrowRight', 0, 1000)).toBe(510)
    expect(stepCursor(500, 'ArrowLeft', 0, 1000)).toBe(490)
  })

  it('steps a second at least, stays inside the window, and jumps to its ends', () => {
    expect(stepCursor(5, 'ArrowRight', 0, 10)).toBe(6)
    expect(stepCursor(9, 'ArrowRight', 0, 10)).toBe(9)
    expect(stepCursor(2, 'ArrowLeft', 2, 10)).toBe(2)
    expect(stepCursor(5, 'Home', 100, 400)).toBe(100)
    expect(stepCursor(5, 'End', 100, 400)).toBe(399)
    expect(stepCursor(5, 'Escape', 0, 10)).toBeNull()
  })
})
