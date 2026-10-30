import { DURATIONS_S } from '@rca/core/constants'
import { describe, expect, it } from 'vitest'
import { ActivityDigestSchema, StoredActivityDigestSchema } from './index.ts'
import { MEASUREMENT_LIMITS, MeasurementSchema } from './measurements.ts'

/*
 * The bounds below are written as literals on purpose. A test that reads a limit from the module it
 * checks passes when the limit is loosened, which is the change these tests exist to catch.
 */
const curve = DURATIONS_S.map((durationS) => ({
  durationS,
  value: null,
  startIndex: -1,
  windowS: durationS,
  heartRate: null,
  terms: null,
}))

const base = {
  version: 1,
  modelRevision: 1,
  id: 'a',
  name: 'Ride',
  sport: 'ride',
  startMs: 1_700_000_000_000,
  durationS: 3600,
  distanceM: 1000,
  elevationGainM: 0,
  hasHeartRate: false,
  indoor: true,
  powerSource: 'none',
  flags: [],
  flagCounts: {},
  maxHeartRate: null,
  curve,
  hrBlocks: [],
  calibration: null,
  climbSections: [],
}

const hrBlock = { heartRate: 150, value: 210, terms: null }
const flag = { kind: 'power-spike', start: 1, end: 2, message: 'Spike' }
const terms = { gravityAccel: 1, rolling: 1, aero: 1 }
const climb = { start: 0, end: 130, measuredW: 200, terms }
const times = <T>(n: number, item: T): T[] => Array.from({ length: n }, () => item)
const accepts = (
  schema: { safeParse: (input: unknown) => { success: boolean } },
  digest: unknown,
) => schema.safeParse(digest).success

describe('HR blocks follow the duration of the activity', () => {
  // The first block starts after a 600 s warm-up and each lasts 300 s. The existing over-the-top case is
  // refused by the absolute cap, so only these edges reach the per-duration rule.
  it.each([
    [600, 0, true],
    [600, 1, false],
    [1200, 2, true],
    [1200, 3, false],
    [3600, 10, true],
    [3600, 11, false],
  ])('a %i s digest with %i blocks is accepted: %s', (durationS, count, ok) => {
    expect(
      accepts(ActivityDigestSchema, { ...base, durationS, hrBlocks: times(count, hrBlock) }),
    ).toBe(ok)
  })
})

describe('climb sections cannot outnumber the seconds of the activity', () => {
  const inside = { ...climb, end: 1 }

  it('accepts one section a second and refuses one more', () => {
    expect(
      accepts(ActivityDigestSchema, { ...base, durationS: 3, climbSections: times(3, inside) }),
    ).toBe(true)
    expect(
      accepts(ActivityDigestSchema, { ...base, durationS: 3, climbSections: times(4, inside) }),
    ).toBe(false)
  })
})

describe('the curve sits on the duration grid', () => {
  it('refuses a point whose duration is off the grid, at the position it is in', () => {
    const off = curve.map((point, index) => (index === 2 ? { ...point, durationS: 7 } : point))
    const result = ActivityDigestSchema.safeParse({ ...base, curve: off })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['curve', 2, 'durationS'])
  })
})

describe('array bounds', () => {
  it('holds a create to 50 flags', () => {
    expect(accepts(ActivityDigestSchema, { ...base, flags: times(50, flag) })).toBe(true)
    expect(accepts(ActivityDigestSchema, { ...base, flags: times(51, flag) })).toBe(false)
  })

  // A stored row is read, not refused: a list past its cap is cut to it, so the activity stays listed.
  it('cuts a stored row to 4 times the create bound for flags, HR blocks, climb sections and the curve', () => {
    const kept = (field: string, item: unknown, count: number) =>
      (
        StoredActivityDigestSchema.parse({
          ...base,
          [field]: times(count, item),
        }) as unknown as Record<string, unknown[]>
      )[field]!.length
    expect(kept('flags', flag, 200)).toBe(200)
    expect(kept('flags', flag, 201)).toBe(200)
    // 7 days less the 600 s warm-up, in 300 s blocks: 2014 on a create. One section per 120 s: 5040.
    expect(kept('hrBlocks', hrBlock, 8056)).toBe(8056)
    expect(kept('hrBlocks', hrBlock, 8057)).toBe(8056)
    expect(kept('climbSections', climb, 20_160)).toBe(20_160)
    expect(kept('climbSections', climb, 20_161)).toBe(20_160)
    const grid = DURATIONS_S.length * 4
    expect(kept('curve', curve[0], grid)).toBe(grid)
    expect(kept('curve', curve[0], grid + 1)).toBe(grid)
  })

  it('keeps counts whole on a create: moving time and each flag count are integers', () => {
    expect(accepts(ActivityDigestSchema, { ...base, movingS: 3000 })).toBe(true)
    expect(accepts(ActivityDigestSchema, { ...base, movingS: 3000.5 })).toBe(false)
    expect(accepts(ActivityDigestSchema, { ...base, flagCounts: { 'power-spike': 1.5 } })).toBe(
      false,
    )
  })
})

describe('the dated-setting bounds', () => {
  it('pins each kind to its reviewed range, in kg, bpm, W and m/s', () => {
    expect(MEASUREMENT_LIMITS).toEqual({
      massKg: { min: 30, max: 200 },
      maxHeartRate: { min: 100, max: 230 },
      thresholdPower: { min: 50, max: 700 },
      thresholdPace: { min: 1.5, max: 7.5 },
    })
  })

  it.each([
    ['maxHeartRate', 'run', 100, 230],
    ['thresholdPower', 'ride', 50, 700],
    ['thresholdPace', 'run', 1.5, 7.5],
  ] as const)(
    '%s takes its limits exactly and refuses just outside them',
    (kind, sport, min, max) => {
      const entry = (value: number) =>
        MeasurementSchema.safeParse({ kind, sport, value, from: '2026-01-05' }).success
      expect([entry(min), entry(max)]).toEqual([true, true])
      expect([entry(min - 0.01), entry(max + 0.01)]).toEqual([false, false])
    },
  )
})
