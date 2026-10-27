import { describe, expect, it } from 'vitest'
import { DAY_MS, SAME_HEART_RATE } from '../constants'
import { mulberry32 } from '../math'
import { sameHeartRate } from './sameHeartRate'
import {
  BASE,
  MONDAY,
  heartRatesOf,
  revised,
  weeksOf,
  withBlocks,
} from './test/sameHeartRateFixture'

const WEEK_MS = 7 * DAY_MS
const NONE = new Set<string>()
const FROM_START = { fromMs: MONDAY }
/** Output rising 5% over the 7 weeks between the middle of the first window and the middle of the last. */
const rising = (startMs: number) => 1 + (0.05 / 7) * ((startMs - MONDAY) / WEEK_MS)

/** A seeded multiplier near 1 with the given relative spread, uniform. */
function jitter(seed: number, spread: number): () => number {
  const random = mulberry32(seed)
  return () => 1 + (random() * 2 - 1) * spread
}

describe('output at the same heart rate', () => {
  it('reads a 5% rise over 7 weeks as a real change of about 5%', () => {
    const digests = weeksOf('ride', 12, rising, jitter(1, 0.005))
    const { change, referenceHeartRate } = sameHeartRate(digests, NONE, FROM_START).ride
    expect(referenceHeartRate).toBe(145)
    expect(change).not.toBeNull()
    expect(change!.weeksApart).toBe(7)
    expect(change!.relative).toBeGreaterThan(0.04)
    expect(change!.relative).toBeLessThan(0.06)
    expect(change!.real).toBe(true)
  })

  it('reads the same for a run, in the flat speed it covers', () => {
    const digests = weeksOf('run', 12, rising, jitter(2, 0.005))
    const { change } = sameHeartRate(digests, NONE, FROM_START).run
    expect(change!.relative).toBeGreaterThan(0.04)
    expect(change!.relative).toBeLessThan(0.06)
    expect(change!.real).toBe(true)
  })

  it('finds noise alone to be no real change', () => {
    // Of 40 seeds of this noise, one gives a false change: about the 5% that 90% intervals allow.
    const digests = weeksOf('ride', 12, () => 1, jitter(11, 0.03))
    const { change } = sameHeartRate(digests, NONE, FROM_START).ride
    expect(change).not.toBeNull()
    expect(change!.real).toBe(false)
    expect(Math.abs(change!.relative)).toBeLessThan(0.05)
  })

  it('reports each week at the one reference heart rate, with an interval around it', () => {
    const digests = weeksOf('ride', 12, () => 1, jitter(4, 0.02))
    const { weeks, referenceHeartRate } = sameHeartRate(digests, NONE, FROM_START).ride
    const reported = weeks.filter((week) => week.fit !== null)
    // 12 weeks, and the first window that lies inside the period ends in the fifth.
    expect(reported.length).toBe(8)
    for (const { fit } of reported) {
      expect(fit!.output).toBeGreaterThan(BASE.ride(referenceHeartRate!) * 0.97)
      expect(fit!.output).toBeLessThan(BASE.ride(referenceHeartRate!) * 1.03)
      expect(fit!.low).toBeLessThanOrEqual(fit!.output)
      expect(fit!.high).toBeGreaterThanOrEqual(fit!.output)
    }
  })

  it('does not use an activity whose heart rate is set aside', () => {
    const clean = weeksOf('ride', 12, () => 1, jitter(5, 0.01))
    const faulty = withBlocks('ride', 'faulty', MONDAY + 60 * DAY_MS, [
      { heartRate: 100, output: 900 },
      { heartRate: 110, output: 900 },
      { heartRate: 120, output: 900 },
      { heartRate: 130, output: 900 },
    ])
    const without = sameHeartRate(clean, NONE, FROM_START).ride
    const used = sameHeartRate([...clean, faulty], NONE, FROM_START).ride
    const aside = sameHeartRate([...clean, faulty], new Set(['faulty']), FROM_START).ride
    expect(used).not.toEqual(without)
    expect(aside).toEqual(without)
  })

  it('leaves out treadmill runs and virtual-power rides, whose output may be what is wrong', () => {
    const run = weeksOf('run', 12, () => 1, jitter(6, 0.01))
    const ride = weeksOf('ride', 12, () => 1, jitter(6, 0.01))
    const treadmill = revised(
      weeksOf('run', 12, () => 1.4),
      (d) => ({ id: `t-${d.id}`, indoor: true }),
    )
    const virtual = revised(
      weeksOf('ride', 12, () => 1.4),
      (d) => ({
        id: `v-${d.id}`,
        powerSource: 'virtual',
      }),
    )
    const plain = sameHeartRate([...run, ...ride], NONE, FROM_START)
    const mixed = sameHeartRate([...run, ...treadmill, ...ride, ...virtual], NONE, FROM_START)
    expect(mixed).toEqual(plain)
  })

  it('gives the same answer twice, and whatever order the digests come in', () => {
    const digests = weeksOf('ride', 12, rising, jitter(7, 0.02))
    const first = sameHeartRate(digests, NONE, FROM_START)
    expect(sameHeartRate([...digests].reverse(), NONE, FROM_START)).toEqual(first)
    expect(sameHeartRate(digests, NONE, FROM_START)).toEqual(first)
  })

  it('rounds the reference heart rate to 5 bpm', () => {
    const digests = revised(
      weeksOf('ride', 12, () => 1),
      (d) => ({
        hrBlocks: d.hrBlocks.map((b) => ({ ...b, heartRate: b.heartRate + 2 })),
      }),
    )
    const { referenceHeartRate } = sameHeartRate(digests, NONE, FROM_START).ride
    expect(referenceHeartRate! % SAME_HEART_RATE.referenceStepBpm).toBe(0)
  })
})

describe('what a week needs before it reports', () => {
  const rideAt = (id: string, startMs: number, index: number) =>
    withBlocks(
      'ride',
      id,
      startMs,
      heartRatesOf(index).map((heartRate) => ({ heartRate, output: BASE.ride(heartRate) })),
    )

  it('names too few blocks', () => {
    const few = [withBlocks('ride', 'a', MONDAY, [{ heartRate: 140, output: 220 }])]
    expect(sameHeartRate(few, NONE, {}).ride.lacks).toBe('blocks')
  })

  it('names no blocks at all as too few', () => {
    expect(sameHeartRate([], NONE, {}).ride).toEqual({
      referenceHeartRate: null,
      weeks: [],
      change: null,
      lacks: 'blocks',
    })
  })

  it('names too few activities', () => {
    const rides = [0, 1].map((i) => rideAt(`r${i}`, MONDAY + i * 3 * DAY_MS, i))
    expect(sameHeartRate(rides, NONE, {}).ride.lacks).toBe('activities')
  })

  it('names activities all in one week', () => {
    const rides = [0, 1, 2, 3].map((i) => rideAt(`r${i}`, MONDAY + i * 3_600_000, i))
    expect(sameHeartRate(rides, NONE, {}).ride.lacks).toBe('weeks')
  })

  it('names heart rate that hardly varies', () => {
    const steady = revised(
      weeksOf('ride', 12, () => 1),
      (d) => ({
        hrBlocks: d.hrBlocks.map((b, i) => ({ ...b, heartRate: 140 + (i % 2) })),
      }),
    )
    expect(sameHeartRate(steady, NONE, {}).ride.lacks).toBe('spread')
  })

  it('leaves a week out when the reference heart rate is outside what it observed', () => {
    const early = weeksOf('ride', 8, () => 1)
    // One a week for the last four weeks, so the last window holds only these.
    const high = [0, 1, 2, 3].map((i) =>
      withBlocks(
        'ride',
        `late-${i}`,
        MONDAY + (8 + i) * 7 * DAY_MS,
        [150, 160, 170, 180].map((heartRate) => ({ heartRate, output: BASE.ride(heartRate) })),
      ),
    )
    const { weeks } = sameHeartRate([...early, ...high], NONE, FROM_START).ride
    const last = weeks.at(-1)!
    expect(last.fit).toBeNull()
    expect(last.lacks).toBe('range')
  })

  it('has no change from a single reported week, and says what is missing', () => {
    const result = sameHeartRate(
      weeksOf('ride', 4, () => 1),
      NONE,
      FROM_START,
    ).ride
    expect(result.change).toBeNull()
    expect(result.lacks).not.toBeNull()
  })

  it('names stretches that do not reach a window length into the period', () => {
    const result = sameHeartRate(
      weeksOf('ride', 3, () => 1),
      NONE,
      FROM_START,
    ).ride
    expect(result.weeks).toEqual([])
    expect(result.referenceHeartRate).toBe(145)
    expect(result.lacks).toBe('period')
  })

  it('reports every sport apart', () => {
    const result = sameHeartRate(
      weeksOf('ride', 12, () => 1),
      NONE,
      FROM_START,
    )
    expect(result.run.referenceHeartRate).toBeNull()
    expect(result.ride.referenceHeartRate).toBe(145)
  })
})
