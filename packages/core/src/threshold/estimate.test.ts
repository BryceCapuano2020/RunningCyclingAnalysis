import { describe, expect, it } from 'vitest'
import { rideThreshold } from './estimate'
import {
  RIDER,
  allOutRide,
  library,
  ride,
  rides,
  steadyRide,
  tempoRide,
  type Library,
  type Rider,
} from './test/rides'
import type { HeartRateRefusal } from './types'

const THRESHOLD_HR = RIDER.thresholdHr

/** Eight rides that gave everything for 10 min: the power estimate is the rider's threshold. */
const allOutLibrary = (rider: Rider = RIDER) =>
  library(
    rider,
    rides(8, (id, over) => allOutRide(rider, id, over), 'a'),
  )
/** Six steady rides a few percent short of all-out, with heart rate near threshold. */
const steadyLibrary = (rider: Rider = RIDER, count = 6) =>
  library(
    rider,
    rides(count, (id, over) => steadyRide(rider, id, over), 's'),
  )
/** Eight tempo rides and nothing harder: the rider never went all out. */
const tempoLibrary = () =>
  library(
    RIDER,
    rides(8, (id, over) => tempoRide(RIDER, id, over), 't'),
  )

const run = (lib: Library, thresholdHr: number | null = THRESHOLD_HR) =>
  rideThreshold(lib.efforts, lib.blocks, thresholdHr)!

function refusal(result: ReturnType<typeof run>): HeartRateRefusal | null {
  return 'refused' in result.heartRate ? result.heartRate.refused : null
}

describe('the ride threshold', () => {
  it('is null with no effort of 3 min or more', () => {
    expect(rideThreshold([], [], null)).toBeNull()
    const efforts = allOutLibrary().efforts
    const short = efforts.map((e) => ({ ...e, durationS: 179 }))
    expect(rideThreshold(short, [], null)).toBeNull()
    expect(rideThreshold(efforts.slice(0, 1), [], null)).not.toBeNull()
  })

  it('with no heart rate is about 3% over the power estimate, inside its range', () => {
    const result = run(allOutLibrary(), null)
    expect(result.efforts.value).toBeCloseTo(RIDER.threshold, 6)
    expect(result.value / result.efforts.value).toBeGreaterThan(1.02)
    expect(result.value / result.efforts.value).toBeLessThan(1.045)
    expect(result.low).toBeLessThan(result.value)
    expect(result.high).toBeGreaterThan(result.value)
    expect(refusal(result)).toBe('no-heart-rate')
  })

  it('answers for a single ride: its estimate, and about 3% over it, inside its range', () => {
    const lib = library(RIDER, [allOutRide(RIDER, 'only')])
    const result = run(lib, null)
    expect(result.efforts.rides).toBe(1)
    expect(result.efforts.value).toBeCloseTo(RIDER.threshold, 6)
    expect(result.value / RIDER.threshold).toBeGreaterThan(1.02)
    expect(result.value / RIDER.threshold).toBeLessThan(1.045)
    expect(result.low).toBeLessThan(result.value)
    expect(result.high).toBeGreaterThan(result.value)
    // Two blocks of a hard ride and eight easy ones are too few for a line.
    expect(refusal(run(lib))).toBe('few-blocks')
  })

  it('is null when no ride has any weight to give', () => {
    const lib = allOutLibrary()
    const aged = (ageDays: number) => lib.efforts.map((e) => Object.assign({}, e, { ageDays }))
    expect(rideThreshold(aged(NaN), lib.blocks, THRESHOLD_HR)).toBeNull()
    expect(rideThreshold(aged(1e6), [], null)).toBeNull()
    expect(rideThreshold(aged(0), [], null)).not.toBeNull()
  })

  it('names the rides behind the power estimate and its strongest effort', () => {
    const { efforts } = run(allOutLibrary(), null)
    expect(efforts.rides).toBe(8)
    expect(efforts.strongest.durationS).toBe(600)
    expect(efforts.strongest.estimated).toBe(false)
    expect(efforts.strongest.activityId).toMatch(/^a\d$/)
  })

  it('lifts a rider who never went all out well above the power estimate with heart rate', () => {
    const lib = tempoLibrary()
    const without = run(lib, null)
    const withHeartRate = run(lib)
    // Tempo only: the power estimate is a floor 15% under the truth.
    expect(without.efforts.value).toBeLessThan(0.86 * RIDER.threshold)
    expect(withHeartRate.value).toBeGreaterThan(1.1 * withHeartRate.efforts.value)
    expect(Math.abs(withHeartRate.value / RIDER.threshold - 1)).toBeLessThan(0.05)
    expect(withHeartRate.heartRate).toMatchObject({ value: expect.closeTo(RIDER.threshold, 3) })
  })

  it('does not let a strap reading 20 bpm high on every ride pull the answer under the power-only one', () => {
    const lib = library(RIDER, [
      ...rides(4, (id, over) => allOutRide(RIDER, id, { ...over, offsetBpm: 20 }), 'a'),
      ...rides(
        4,
        (id, over) =>
          tempoRide(RIDER, id, { ...over, hardPower: 0.8 * RIDER.threshold, offsetBpm: 20 }),
        't',
      ),
    ])
    const result = run(lib)
    const alone = run(lib, null)
    // Heart rate alone says 20% under the power estimate; it may lift the answer and never lowers it.
    expect(result.heartRate).toMatchObject({ value: expect.closeTo(0.8 * RIDER.threshold, 0) })
    expect(result.value).toBe(alone.value)
    expect(result.value).toBeGreaterThan(result.efforts.value)
  })

  it('is the same in any unit of power', () => {
    const lib = tempoLibrary()
    const scale = 1 / 60
    const scaled = {
      efforts: lib.efforts.map((e) => ({ ...e, value: e.value * scale })),
      blocks: lib.blocks.map((b) => ({ ...b, value: b.value * scale })),
    }
    const a = run(lib)
    const b = run(scaled)
    expect(b.value / scale).toBeCloseTo(a.value, 6)
    expect(b.low / scale).toBeCloseTo(a.low, 6)
    expect(b.heartRate).toMatchObject({ efforts: (a.heartRate as { efforts: number }).efforts })
  })

  it('leaves its inputs alone', () => {
    const lib = steadyLibrary()
    const frozen = lib.efforts.map((e) => Object.freeze({ ...e }))
    const blocks = lib.blocks.map((b) => Object.freeze({ ...b }))
    expect(() =>
      rideThreshold(Object.freeze(frozen), Object.freeze(blocks), THRESHOLD_HR),
    ).not.toThrow()
  })
})

describe('what the heart-rate estimate leaves out', () => {
  const base = run(steadyLibrary())
  const used = (r: ReturnType<typeof run>) => (r.heartRate as { efforts: number }).efforts

  it('uses the steady rides when all is well', () => {
    expect(refusal(base)).toBeNull()
    expect(used(base)).toBeGreaterThan(20)
    expect(base.heartRate).toMatchObject({ value: expect.closeTo(RIDER.threshold, 3) })
  })

  it('leaves out a stuck ride and its efforts', () => {
    const lib = steadyLibrary()
    const stuck = ride(RIDER, { ...steadyRide(RIDER, 'stuck'), stuckAt: 150 })
    const result = run({
      efforts: [...lib.efforts, ...stuck.efforts],
      blocks: [...lib.blocks, ...stuck.blocks],
    })
    expect(used(result)).toBe(used(base))
    expect(result.heartRate).toEqual(base.heartRate)
  })

  it('leaves out a ride whose strap reads 20 bpm high and its efforts', () => {
    const lib = steadyLibrary()
    const high = ride(RIDER, steadyRide(RIDER, 'high', { offsetBpm: 20 }))
    const result = run({
      efforts: [...lib.efforts, ...high.efforts],
      blocks: [...lib.blocks, ...high.blocks],
    })
    expect(used(result)).toBe(used(base))
    expect(result.heartRate).toEqual(base.heartRate)
  })

  it('leaves out a ride with 20 bpm low as well', () => {
    const lib = steadyLibrary()
    const low = ride(RIDER, steadyRide(RIDER, 'low', { offsetBpm: -20 }))
    const result = run({
      efforts: [...lib.efforts, ...low.efforts],
      blocks: [...lib.blocks, ...low.blocks],
    })
    expect(used(result)).toBe(used(base))
  })

  it('uses only efforts of 8 to 30 min', () => {
    const lib = steadyLibrary()
    const inRange = (s: number) => s >= 480 && s <= 1800
    const outside = lib.efforts.map((e) => (inRange(e.durationS) ? { ...e, heartRate: null } : e))
    expect(refusal(run({ efforts: outside, blocks: lib.blocks }))).toBe('no-efforts')
    const inside = lib.efforts.map((e) => (inRange(e.durationS) ? e : { ...e, heartRate: null }))
    expect(used(run({ efforts: inside, blocks: lib.blocks }))).toBe(used(base))
  })

  it('leaves out estimated watts', () => {
    const lib = steadyLibrary()
    const guessed = lib.efforts.map((e) => ({ ...e, estimated: true }))
    expect(refusal(run({ efforts: guessed, blocks: lib.blocks }))).toBe('no-efforts')
  })
})

describe('every reason the heart-rate estimate can be refused', () => {
  const steady = steadyLibrary()
  const cases: [HeartRateRefusal, () => ReturnType<typeof run>][] = [
    ['no-heart-rate', () => run(steady, null)],
    ['no-heart-rate', () => run({ efforts: steady.efforts, blocks: [] })],
    ['few-blocks', () => run({ efforts: steady.efforts, blocks: steady.blocks.slice(0, 12) })],
    [
      'stuck',
      () => {
        const stuck = library(
          RIDER,
          rides(3, (id, over) => steadyRide(RIDER, id, { ...over, stuckAt: 150 }), 'x'),
        )
        return run({ efforts: steady.efforts, blocks: stuck.blocks })
      },
    ],
    ['flat', () => run(steadyLibrary({ ...RIDER, slope: 0.1 }))],
    ['steep', () => run(steadyLibrary({ ...RIDER, slope: 0.7 }))],
    [
      'no-efforts',
      () =>
        run({
          efforts: steady.efforts.map((e) => ({ ...e, heartRate: null })),
          blocks: steady.blocks,
        }),
    ],
  ]
  it.each(cases)('%s', (reason, make) => {
    expect(refusal(make())).toBe(reason)
  })

  it('still gives the power-only answer when heart rate is refused', () => {
    const refused = run(steadyLibrary({ ...RIDER, slope: 0.1 }))
    const without = run(steadyLibrary({ ...RIDER, slope: 0.1 }), null)
    expect(refused.value).toBe(without.value)
  })
})
