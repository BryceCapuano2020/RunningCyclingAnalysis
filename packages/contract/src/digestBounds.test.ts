import { describe, expect, it } from 'vitest'
import { parseDigest } from '@rca/core/digest'
import {
  EARLIEST_ACTIVITY_START_MS,
  LATEST_ACTIVITY_START_MS,
  MAX_ACTIVITY_CLIMB_M,
  MAX_ACTIVITY_DISTANCE_M,
  MAX_ACTIVITY_S,
  MAX_DIGEST_HEART_RATE,
  MAX_DIGEST_REVISION,
} from '@rca/core/digest/limits'
import { ActivityDigestSchema, StoredActivityDigestSchema } from './digest.ts'
import { pick } from './test/corpus.ts'

/** The readers a digest passes through: a create, a stored row and the device library. */
const READERS: Array<[string, (wire: unknown) => boolean]> = [
  ['create', (wire) => ActivityDigestSchema.safeParse(wire).success],
  ['stored', (wire) => StoredActivityDigestSchema.safeParse(wire).success],
  [
    'device',
    (wire) => {
      try {
        parseDigest(JSON.stringify(wire))
        return true
      } catch {
        return false
      }
    },
  ],
]

/** A long ride with a measured meter: a duration, distance and climb that leave room on both sides. */
const base = pick(
  (w) => w.sport === 'ride' && w.powerSource === 'measured' && w.calibration !== null,
)

/** Each number with a bound: the field, the lowest and highest value it may have. */
const BOUNDS: Array<[string, number, number]> = [
  ['distanceM', 0, MAX_ACTIVITY_DISTANCE_M],
  ['elevationGainM', 0, MAX_ACTIVITY_CLIMB_M],
  ['maxHeartRate', 0, MAX_DIGEST_HEART_RATE],
]

/** The bounds on what names the activity: no reader takes a value past them as unknown. */
const IDENTITY_BOUNDS: Array<[string, number, number]> = [
  ['startMs', EARLIEST_ACTIVITY_START_MS, LATEST_ACTIVITY_START_MS],
  ['modelRevision', 1, MAX_DIGEST_REVISION],
]

describe('the bounds on a digest', () => {
  it.each(READERS)('%s: keeps the number that names the activity inside its bound', (_n, ok) => {
    for (const [field, low, high] of IDENTITY_BOUNDS) {
      for (const value of [low, high])
        expect(ok({ ...base, [field]: value }), `${field}=${value}`).toBe(true)
      for (const value of [low - 1, high + 1]) {
        expect(ok({ ...base, [field]: value }), `${field}=${value}`).toBe(false)
      }
    }
  })

  it('refuses a number past its bound on a create', () => {
    for (const [field, low, high] of BOUNDS) {
      for (const value of [low, high]) {
        expect(ActivityDigestSchema.safeParse({ ...base, [field]: value }).success, field).toBe(
          true,
        )
      }
      for (const value of [low - 1, high + 1]) {
        expect(ActivityDigestSchema.safeParse({ ...base, [field]: value }).success, field).toBe(
          false,
        )
      }
    }
  })

  it.each(READERS.slice(1))(
    '%s: reads a number past its bound as unknown, and lists the activity',
    (_n, ok) => {
      for (const [field, , high] of BOUNDS)
        expect(ok({ ...base, [field]: high + 1 }), field).toBe(true)
      const stored = StoredActivityDigestSchema.parse({
        ...base,
        distanceM: MAX_ACTIVITY_DISTANCE_M + 1,
        elevationGainM: -5,
        maxHeartRate: 999,
        avgPowerW: 1e9,
        avgHeartRate: 999,
      })
      expect(stored.distanceM).toBeNaN()
      expect(stored.elevationGainM).toBeNaN()
      expect(stored.maxHeartRate).toBeNull()
      expect(stored.avgPowerW).toBeNull()
      expect(stored.avgHeartRate).toBeNull()
    },
  )

  it.each(READERS)('%s: refuses a start the date formatters cannot show', (_n, ok) => {
    // Each of these made the signed-in app fail to load, on every load, before the bound.
    for (const startMs of [1e300, -1e300, 8.64e15, 8.64e15 + 1000, -8.64e15, -8.64e15 - 1000]) {
      expect(ok({ ...base, startMs }), String(startMs)).toBe(false)
    }
  })

  it.each(READERS)('%s: bounds the duration at the longest activity', (_n, ok) => {
    expect(ok({ ...base, durationS: MAX_ACTIVITY_S + 1 })).toBe(false)
    expect(ok({ ...base, durationS: -1 })).toBe(false)
  })
})
