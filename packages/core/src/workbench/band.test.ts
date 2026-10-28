import { describe, expect, it } from 'vitest'
import { readingBand } from './band'
import { distributionOf } from './selection'
import type { ActivityTrace } from './types'

/** A run of n seconds whose speed is the given function of the second. */
function runOf(n: number, speed: (i: number) => number): ActivityTrace {
  return {
    version: 1,
    activityId: 'band',
    sport: 'run',
    durationS: n,
    distance: Float64Array.from({ length: n }, (_, i) => i * 3),
    paused: new Uint8Array(n),
    unrecorded: new Uint8Array(n),
    streams: { speed: Float32Array.from({ length: n }, (_, i) => speed(i)) },
    laps: [],
  }
}

/**
 * A steady ramp from 2.5 to 3.5 m/s with a slow start of three seconds and a fast burst of three at the end,
 * each burst second a little faster than the last.
 */
const rampWithArtifacts = (i: number) =>
  i < 3 ? 0.5 : i >= 497 ? 9 + i / 1000 : 2.5 + (i - 3) / 494

describe('readingBand', () => {
  it('cuts two percent of the slow end and half a percent of the fast end, and counts the seconds it cut', () => {
    const band = readingBand(runOf(500, rampWithArtifacts), 'speed', 0, 500)
    expect(band).not.toBeNull()
    expect(band!.below).toBe(10)
    expect(band!.above).toBe(2)
    expect(band!.low).toBeGreaterThan(2.5)
    // The two fastest of the burst are past the band; the third is its edge, since a stride is not an artifact.
    expect(band!.high).toBeGreaterThan(9)
  })

  it('does not cut a stretch of strides from the fast end of a short run', () => {
    // 150 s with ten fast seconds, under two hundred readings: half a percent of them is none.
    const item = runOf(150, (i) => (i >= 140 ? 5 + (i - 140) / 10 : 3 + i / 1000))
    expect(readingBand(item, 'speed', 0, 150)).toMatchObject({ above: 0 })
  })

  it('keeps the whole span when cutting would leave a single value', () => {
    const item = runOf(200, (i) => (i < 3 ? 0.5 : i >= 199 ? 9 : 3))
    expect(readingBand(item, 'speed', 0, 200)).toEqual({ low: 0.5, high: 9, below: 0, above: 0 })
  })

  it('leaves a short selection whole, since two percent of fewer than fifty readings is none', () => {
    const item = runOf(40, (i) => (i === 0 ? 0.5 : 3 + i / 64))
    expect(readingBand(item, 'speed', 0, 40)).toMatchObject({ low: 0.5, below: 0, above: 0 })
  })

  it('counts only moving seconds with a reading, and is null with none', () => {
    const item = runOf(100, () => 3)
    expect(readingBand(item, 'heartRate', 0, 100)).toBeNull()
    item.paused.fill(1)
    expect(readingBand(item, 'speed', 0, 100)).toBeNull()
  })
})

describe('readingBand at the edges of what a cut can remove', () => {
  /** n distinct readings, each a little faster than the one before, so every cut is counted exactly. */
  const distinct = (n: number) => runOf(n, (i) => 1 + i / 128)

  it('cuts the first slow reading at fifty readings, and none at forty-nine', () => {
    expect(readingBand(distinct(49), 'speed', 0, 49)).toMatchObject({ below: 0 })
    expect(readingBand(distinct(50), 'speed', 0, 50)).toMatchObject({ below: 1 })
  })

  it('cuts the first fast reading at two hundred readings, and none at 199', () => {
    expect(readingBand(distinct(199), 'speed', 0, 199)).toMatchObject({ above: 0 })
    expect(readingBand(distinct(200), 'speed', 0, 200)).toMatchObject({ above: 1 })
  })

  it('cuts two percent slow and half a percent fast of a thousand readings', () => {
    expect(readingBand(distinct(1000), 'speed', 0, 1000)).toMatchObject({ below: 20, above: 5 })
  })
})

describe('distributionOf within a band', () => {
  it('spans only the band, so a stray reading leaves no empty bins', () => {
    const item = runOf(500, (i) => (i < 3 ? 0.5 : 2.5 + (i - 3) / 494))
    const whole = distributionOf(item, 'speed', 0, 500)
    expect(whole[0]!.from).toBe(0.5)
    const band = readingBand(item, 'speed', 0, 500)!
    const trimmed = distributionOf(item, 'speed', 0, 500, band)
    expect(trimmed[0]!.from).toBeCloseTo(band.low, 5)
    expect(trimmed.every((bin) => bin.seconds > 0)).toBe(true)
    expect(trimmed.reduce((sum, bin) => sum + bin.seconds, 0)).toBe(500 - band.below - band.above)
  })
})
