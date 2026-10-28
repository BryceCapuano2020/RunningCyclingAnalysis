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

/** A steady ramp from 2.5 to 3.5 m/s with a slow start of three seconds and a spike of three at the end. */
const rampWithArtifacts = (i: number) => (i < 3 ? 0.5 : i >= 497 ? 9 : 2.5 + (i - 3) / 494)

describe('readingBand', () => {
  it('cuts the two percent at each end, and counts the seconds it cut', () => {
    const band = readingBand(runOf(500, rampWithArtifacts), 'speed', 0, 500)
    expect(band).not.toBeNull()
    expect(band!.below).toBe(10)
    expect(band!.above).toBe(10)
    expect(band!.low).toBeGreaterThan(2.5)
    expect(band!.high).toBeLessThan(3.5)
  })

  it('keeps the whole span when cutting would leave a single value', () => {
    const item = runOf(200, (i) => (i < 3 ? 0.5 : i >= 197 ? 9 : 3))
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

describe('distributionOf within a band', () => {
  it('spans only the band, so a stray reading leaves no empty bins', () => {
    const item = runOf(500, rampWithArtifacts)
    const whole = distributionOf(item, 'speed', 0, 500)
    expect(whole[0]!.from).toBe(0.5)
    const band = readingBand(item, 'speed', 0, 500)!
    const trimmed = distributionOf(item, 'speed', 0, 500, band)
    expect(trimmed[0]!.from).toBeCloseTo(band.low, 5)
    expect(trimmed.every((bin) => bin.seconds > 0)).toBe(true)
    expect(trimmed.reduce((sum, bin) => sum + bin.seconds, 0)).toBe(500 - band.below - band.above)
  })
})
