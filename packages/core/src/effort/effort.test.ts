import { describe, expect, it } from 'vitest'
import type { Activity, Sport } from '../types'
import type { EffortPoint, HeartRateSource } from './effort'
import {
  ALL_OUT_FRACTION,
  RIDE_MAX_OFFSET_BPM,
  checkEfforts,
  isSubmaximal,
  maxHeartRate,
  referenceMaxHeartRates,
  windowHeartRate,
} from './effort'

function makeActivity(
  id: string,
  sport: Sport,
  heartRate: Float64Array,
  hasHeartRate = true,
): Activity {
  const n = heartRate.length
  return {
    id,
    name: id,
    sport,
    startMs: 0,
    n,
    speed: new Float64Array(n),
    distance: new Float64Array(n),
    altitude: new Float64Array(n),
    heartRate,
    power: new Float64Array(n).fill(NaN),
    paused: new Uint8Array(n),
    hasPower: false,
    hasHeartRate,
    hasAltitude: false,
    indoor: false,
  }
}

function source(activity: Activity, validHeartRate?: Uint8Array): HeartRateSource {
  return { activity, validHeartRate: validHeartRate ?? new Uint8Array(activity.n).fill(1) }
}

function constant(n: number, value: number): Float64Array {
  return new Float64Array(n).fill(value)
}

/** Heart rate 100, 101, 102, ... so any window mean is easy to check by hand. */
function ramp(n: number): Float64Array {
  return Float64Array.from({ length: n }, (_, i) => 100 + i)
}

describe('maxHeartRate', () => {
  it('returns null for no sources', () => {
    expect(maxHeartRate([])).toBeNull()
  })

  it('returns the level of a steady activity', () => {
    const a = makeActivity('a', 'run', constant(100, 150))
    expect(maxHeartRate([source(a)])).toBe(150)
  })

  it('takes the maximum across activities', () => {
    const a = makeActivity('a', 'run', constant(100, 150))
    const b = makeActivity('b', 'ride', constant(100, 170))
    expect(maxHeartRate([source(a), source(b)])).toBe(170)
  })

  it('a single-sample spike does not set the maximum', () => {
    const hr = constant(100, 140)
    hr[50] = 200
    const result = maxHeartRate([source(makeActivity('a', 'run', hr))])
    // The windows centred on sample 50 are 31 samples, one of them 200 and thirty 140.
    expect(result).toBeCloseTo(4400 / 31, 9)
    expect(result).toBeLessThan(150)
  })

  it('ignores a spike that is marked invalid', () => {
    const hr = constant(100, 150)
    hr[50] = 200
    const valid = new Uint8Array(100).fill(1)
    valid[50] = 0
    expect(maxHeartRate([source(makeActivity('a', 'run', hr), valid)])).toBe(150)
  })

  it('treats a non-finite heart rate on a valid sample as unusable', () => {
    const hr = constant(100, 150)
    hr[50] = NaN
    expect(maxHeartRate([source(makeActivity('a', 'run', hr))])).toBe(150)
  })

  it('accepts a window with exactly 25 of 31 samples usable and rejects 24', () => {
    // Usable samples are the run 40..(40 + length - 1); any window holds at most `length` of them.
    const build = (length: number): HeartRateSource => {
      const hr = constant(100, 200)
      const valid = new Uint8Array(100)
      valid.fill(1, 40, 40 + length)
      return source(makeActivity('a', 'run', hr), valid)
    }
    expect(maxHeartRate([build(25)])).toBe(200)
    expect(maxHeartRate([build(24)])).toBeNull()
  })

  it('returns null when no activity has heart rate', () => {
    const a = makeActivity('a', 'run', constant(100, 150), false)
    expect(maxHeartRate([source(a)])).toBeNull()
  })

  it('returns null for an empty activity', () => {
    const a = makeActivity('a', 'run', new Float64Array(0))
    expect(maxHeartRate([source(a)])).toBeNull()
  })

  it('returns null when no sample is usable', () => {
    const notValid = makeActivity('a', 'run', constant(100, 150))
    expect(maxHeartRate([source(notValid, new Uint8Array(100))])).toBeNull()
    const allNaN = makeActivity('b', 'run', constant(100, NaN))
    expect(maxHeartRate([source(allNaN)])).toBeNull()
  })
})

describe('windowHeartRate', () => {
  const rampSource = source(makeActivity('a', 'run', ramp(100)))

  it('returns the mean of the samples in [startIndex, startIndex + durationS)', () => {
    // 110, 111, 112, 113, 114
    expect(windowHeartRate(rampSource, 10, 5)).toBe(112)
    // 100 through 199, so the mean is 149.5
    expect(windowHeartRate(rampSource, 0, 100)).toBe(149.5)
  })

  it('accepts a window that ends exactly at the last sample', () => {
    // 195 through 199
    expect(windowHeartRate(rampSource, 95, 5)).toBe(197)
  })

  it('returns null when the window runs past the end', () => {
    expect(windowHeartRate(rampSource, 96, 5)).toBeNull()
  })

  it('returns null for a negative start', () => {
    expect(windowHeartRate(rampSource, -1, 5)).toBeNull()
  })

  it('returns null for a non-integer start', () => {
    expect(windowHeartRate(rampSource, 1.5, 5)).toBeNull()
  })

  it('returns null for a duration that is zero, negative or fractional', () => {
    expect(windowHeartRate(rampSource, 10, 0)).toBeNull()
    expect(windowHeartRate(rampSource, 10, -5)).toBeNull()
    expect(windowHeartRate(rampSource, 10, 2.5)).toBeNull()
  })

  it('returns null when the activity has no heart rate', () => {
    const a = makeActivity('a', 'run', ramp(100), false)
    expect(windowHeartRate(source(a), 10, 5)).toBeNull()
  })

  it('accepts a window exactly 80% usable and ignores the unusable samples', () => {
    // Window [10, 20): samples 12 and 15 are invalid, and their heart rate is 999 so a
    // leak would show. Usable values 110, 111, 113, 114, 116, 117, 118, 119 average 114.75.
    const hr = ramp(100)
    hr[12] = 999
    hr[15] = 999
    const valid = new Uint8Array(100).fill(1)
    valid[12] = 0
    valid[15] = 0
    expect(windowHeartRate(source(makeActivity('a', 'run', hr), valid), 10, 10)).toBe(114.75)
  })

  it('returns null when fewer than 80% of the window is usable', () => {
    const hr = ramp(100)
    const valid = new Uint8Array(100).fill(1)
    valid[12] = 0
    valid[15] = 0
    valid[17] = 0
    expect(windowHeartRate(source(makeActivity('a', 'run', hr), valid), 10, 10)).toBeNull()
  })

  it('treats a non-finite heart rate on a valid sample as unusable', () => {
    // Samples 12 and 15 are non-finite, so the usable set is the same as above: average 114.75.
    const hr = ramp(100)
    hr[12] = NaN
    hr[15] = Infinity
    expect(windowHeartRate(source(makeActivity('a', 'run', hr)), 10, 10)).toBe(114.75)
  })
})

describe('checkEfforts', () => {
  const point = (
    durationS: number,
    value: number,
    activityId: string | null,
    heartRate: number | null,
  ): EffortPoint => ({ durationS, value, activityId, startIndex: 0, heartRate })
  const maxHr = { run: 180, ride: 180 }

  // Each point carries the mean heart rate of the window it came from, so the check never
  // re-derives a window. The 300 s run point below is backed by a longer window, so its
  // heart rate is that window's mean, not the mean of the first 300 s.
  const runCurve: EffortPoint[] = [
    point(60, 162, 'run1', 162),
    point(300, 114, 'run1', 110),
    point(600, NaN, null, null),
    point(900, 150, 'run1', null),
    point(1200, 162, 'run1', null),
    point(1800, 160, 'sparse', null),
  ]
  const rideCurve: EffortPoint[] = [
    point(60, 153, 'ride1', 153),
    point(300, 153, 'ride1', 153),
    point(600, 150, null, 150),
    point(1200, 153, 'ride1', 153),
  ]
  const durations = [60, 300, 600, 900, 1200, 1800, 3600]

  it('computes exact fractions of max heart rate with null where data is missing', () => {
    const result = checkEfforts(runCurve, rideCurve, maxHr, durations)
    expect(result).toHaveLength(durations.length)
    expect(result[0]).toEqual({ durationS: 60, runHrFraction: 0.9, rideHrFraction: 153 / 180 })
    expect(result[1]!.durationS).toBe(300)
    expect(result[1]!.runHrFraction).toBeCloseTo(110 / 180, 12)
    expect(result[1]!.rideHrFraction).toBeCloseTo(0.85, 12)
    // Run value NaN; ride point has no activity.
    expect(result[2]).toEqual({ durationS: 600, runHrFraction: null, rideHrFraction: null })
    // Heart rate unknown for the run window; ride point missing.
    expect(result[3]).toEqual({ durationS: 900, runHrFraction: null, rideHrFraction: null })
    expect(result[4]!.runHrFraction).toBeNull()
    expect(result[4]!.rideHrFraction).toBeCloseTo(0.85, 12)
    expect(result[5]).toEqual({ durationS: 1800, runHrFraction: null, rideHrFraction: null })
    // Neither curve has the point.
    expect(result[6]).toEqual({ durationS: 3600, runHrFraction: null, rideHrFraction: null })
  })

  it('ignores a heart rate when the point has no value or no activity', () => {
    const result = checkEfforts(
      [point(600, NaN, 'run1', 150), point(900, 150, null, 150)],
      [],
      maxHr,
      [600, 900],
    )
    expect(result).toEqual([
      { durationS: 600, runHrFraction: null, rideHrFraction: null },
      { durationS: 900, runHrFraction: null, rideHrFraction: null },
    ])
  })

  it('returns one entry per duration in the order requested, even when both are null', () => {
    const result = checkEfforts([], [], maxHr, [1800, 60])
    expect(result).toEqual([
      { durationS: 1800, runHrFraction: null, rideHrFraction: null },
      { durationS: 60, runHrFraction: null, rideHrFraction: null },
    ])
  })

  it('returns null fractions when max heart rate is unknown or not positive', () => {
    for (const bad of [null, 0, -5, NaN]) {
      const result = checkEfforts(runCurve, rideCurve, { run: bad, ride: bad }, [60])
      expect(result).toEqual([{ durationS: 60, runHrFraction: null, rideHrFraction: null }])
    }
  })

  it('divides the cycling fraction by the cycling reference, not the running one', () => {
    // Ride heart rate 153 over a cycling reference of 170 is 0.9; the run side keeps 180.
    const result = checkEfforts(runCurve, rideCurve, { run: 180, ride: 170 }, [60])
    expect(result).toEqual([{ durationS: 60, runHrFraction: 0.9, rideHrFraction: 153 / 170 }])
  })
})

describe('referenceMaxHeartRates', () => {
  it('sets cycling RIDE_MAX_OFFSET_BPM below the run maximum when no ride came close', () => {
    expect(RIDE_MAX_OFFSET_BPM).toBe(6)
    expect(referenceMaxHeartRates(190, null)).toEqual({ run: 190, ride: 190 - 6 })
    expect(referenceMaxHeartRates(190, 150)).toEqual({ run: 190, ride: 190 - 6 })
  })

  it('keeps the cycling maximum when it is within the offset of the run maximum', () => {
    expect(referenceMaxHeartRates(190, 186)).toEqual({ run: 190, ride: 186 })
  })

  it('raises the running reference to a cycling maximum above the running maximum', () => {
    expect(referenceMaxHeartRates(180, 186)).toEqual({ run: 186, ride: 186 })
  })

  it('uses the other sport when one side has no heart rate', () => {
    expect(referenceMaxHeartRates(null, 170)).toEqual({ run: 170, ride: 170 })
  })

  it('is null for both when neither sport has heart rate', () => {
    expect(referenceMaxHeartRates(null, null)).toEqual({ run: null, ride: null })
  })
})

describe('isSubmaximal', () => {
  it('uses a 0.9 threshold', () => {
    expect(ALL_OUT_FRACTION).toBe(0.9)
    expect(isSubmaximal(0.9)).toBe(false)
    expect(isSubmaximal(0.899)).toBe(true)
    expect(isSubmaximal(0.5)).toBe(true)
    expect(isSubmaximal(1)).toBe(false)
  })

  it('is false for unknown or NaN fractions', () => {
    expect(isSubmaximal(null)).toBe(false)
    expect(isSubmaximal(NaN)).toBe(false)
  })
})
