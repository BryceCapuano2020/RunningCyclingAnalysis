import { describe, expect, it } from 'vitest'
import { DURATION_TABLES } from './durationTables'
import { rideThreshold, runThreshold, fitThresholdLine } from './estimate'
import { fuse } from './fusion'
import { backedHour, powerEstimate, powerOver } from './powerEstimate'
import { hourOf, prepareFlat } from './rides'
import type { PreparedRide } from './rides'
import { RIDER, library, rides, tempoRide } from './test/rides'
import type { ThresholdBlock, ThresholdEffort } from './types'

/** A ride whose only effort is `value` for `durationS` (20 min unless said), so its estimate is value / 1.053 at 20 min. */
const ride = (id: string, value: number, over: Partial<ThresholdEffort> = {}): ThresholdEffort => ({
  activityId: id,
  durationS: 1200,
  value,
  heartRate: null,
  ageDays: 0,
  estimated: false,
  ...over,
})
const hour = (id: string, value: number, over: Partial<ThresholdEffort> = {}) =>
  ride(id, value, { durationS: 3600, ...over })
// Six rides whose 20 min bests imply 190.
const others = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ride(id, 190 * 1.053))
/** The 90th percentile of an estimate of 190 at the floor of its error: what a lone hour is judged against. */
const P90 = 190 * fuse(1, 0.025, null).high
/** Rides that held one measured hour each and no best, so they weigh nothing in the mean of the estimates. */
const hourOnly = (...values: number[]): PreparedRide[] =>
  values.map((value, i) => ({
    activityId: `h${i}`,
    best: null,
    hour: { durationS: 3600, value },
    heart: [],
    blocks: [],
  }))
/** `others` (an estimate of 190) and the hours, as one window. */
const windowWith = (...hours: number[]) => {
  const prepared = prepareFlat(others, [], DURATION_TABLES.ride)
  const rides = [...prepared.rides, ...hourOnly(...hours)]
  return { rides, ages: [...prepared.ages, ...hours.map(() => 0)] }
}
const powerWithHours = (...hours: number[]) => {
  const { rides, ages } = windowWith(...hours)
  return powerOver(rides, ages)!
}

describe('an hour done as a floor', () => {
  it('puts the answer at the hour when the mean of the estimates is under it, and names that hour', () => {
    const result = powerEstimate([...others, hour('long', 200)])!
    expect(result.value).toBe(200)
    expect(result.floor).toBe(200)
    expect(result.strongest).toEqual({ activityId: 'long', durationS: 3600, estimated: false })
    // The hour is a ride like the others in the count.
    expect(result.rides).toBe(7)
  })

  it('leaves the mean alone when the hour is under it, and still says what the hour was', () => {
    const result = powerEstimate([...others, hour('long', 150)])!
    expect(result.value).toBeCloseTo(190, 6)
    expect(result.floor).toBe(150)
    expect(result.strongest.durationS).toBe(1200)
  })

  it('has no floor without an effort of an hour or longer', () => {
    expect(powerEstimate(others)!.floor).toBe(0)
  })

  it('takes the best of hours that agree, from any ride and at its own value', () => {
    const result = powerEstimate([...others, hour('x', 198), hour('y', 205), hour('z', 201)])!
    expect(result.value).toBe(205)
    expect(result.strongest.activityId).toBe('y')
  })

  it('reads a longer effort at what was held, not scaled up', () => {
    const result = powerEstimate([...others, ride('long', 200, { durationS: 5400 })])!
    expect(result.floor).toBe(200)
    expect(result.value).toBeCloseTo(200, 6)
    expect(result.strongest).toMatchObject({ activityId: 'long', durationS: 5400 })
  })

  it('counts an hour from an old ride: the window is the limit, not the recency weight', () => {
    const result = powerEstimate([...others, hour('old', 200, { ageDays: 400 })])!
    expect(result.value).toBe(200)
  })

  it('does not count an hour from estimated watts: it is a guess, not an hour done', () => {
    const result = powerEstimate([...others, hour('guess', 200, { estimated: true })])!
    expect(result.floor).toBe(0)
    // The ride still gives the mean its estimate, at the weight of a guess; the floor is not what lifts the answer.
    expect(result.value).toBeLessThan(200)
  })

  it('floors a runner’s answer as well, with the runner’s table for the rest', () => {
    const runs = ['a', 'b', 'c'].map((id) => ride(id, DURATION_TABLES.run.held(14, 1200)))
    const result = powerEstimate([...runs, hour('long', 15)], DURATION_TABLES.run)!
    expect(result.value).toBe(15)
  })
})

describe('an hour nothing backs', () => {
  it('is not believed when it is far over the estimate and no other hour is near it', () => {
    const result = powerEstimate([...others, hour('lone', 260)])!
    expect(result.floor).toBe(0)
    expect(result.value).toBeLessThan(P90)
    expect(result.value).toBeCloseTo(190, 0)
    expect(result.strongest.activityId).not.toBe('lone')
  })

  it('is believed when a second hour is within 4% of it, whatever the estimate says', () => {
    const result = powerEstimate([...others, hour('lone', 260), hour('near', 253)])!
    expect(result.floor).toBe(260)
    expect(result.value).toBe(260)
    expect(result.strongest).toEqual({ activityId: 'lone', durationS: 3600, estimated: false })
  })

  it('is believed when it is no higher than the estimate’s own 90th percentile, and not when over it', () => {
    expect(powerEstimate([...others, hour('lone', 0.99 * P90)])!.floor).toBeCloseTo(0.99 * P90, 8)
    expect(powerEstimate([...others, hour('lone', 1.05 * P90)])!.floor).toBe(0)
  })

  it('leaves the second-best hour as the floor when the best is a lone outlier', () => {
    const result = powerEstimate([...others, hour('lone', 260), hour('second', 195)])!
    expect(result.floor).toBe(195)
    expect(result.value).toBe(195)
    expect(result.strongest.activityId).toBe('second')
  })

  // An hour is also its own ride's best, so two hours far over the rest become the strongest rides and the mean follows them. To
  // test the floor against a mean that stays low, the hours here belong to rides with no best of their own (`hourOnly`).
  it('gives no floor when the two best hours are far over the estimate and no hour agrees with either', () => {
    // 300 and 260 are over the 90th percentile and 13% apart; the third hour is 14% under the second.
    const result = powerWithHours(300, 260, 225)
    expect(result.floor).toBe(0)
    expect(result.value).toBeCloseTo(190, 0)
    expect(result.strongest.durationS).toBe(1200)
  })

  it('floors at the second-best hour when a third is within 4% of it, though the best is a lone outlier', () => {
    const result = powerWithHours(300, 260, 260 * 0.97)
    expect(result.floor).toBe(260)
    expect(result.value).toBe(260)
    expect(result.strongest.durationS).toBe(3600)
  })
})

describe('which hour backs the floor', () => {
  const held = hourOnly
  const backed = (...values: number[]) => {
    const rides = held(...values)
    return backedHour(rides, 0, rides.length, 190, 0.025)?.value ?? null
  }

  it('is the best hour when it is under the 90th percentile, alone or with others far under it', () => {
    expect(backed(200)).toBe(200)
    expect(backed(200, 150, 100)).toBe(200)
  })

  it('is the best hour, over the 90th percentile, when a second is within 4% of it', () => {
    expect(backed(260, 260 * 0.97)).toBe(260)
    expect(backed(260 * 0.97, 260)).toBe(260)
    expect(backed(260, 260)).toBe(260)
    // Over 4% under, the second has to stand on its own: over the 90th percentile it does not, and there is no floor.
    expect(backed(260, 260 * 0.95)).toBeNull()
    expect(backed(260, 0.99 * P90)).toBeCloseTo(0.99 * P90, 10)
  })

  it('is the second-best hour for a lone hour over the 90th percentile, and none without one', () => {
    expect(backed(260, 195, 150)).toBe(195)
    expect(backed(260)).toBeNull()
    expect(backed()).toBeNull()
  })

  it('is none when the best two hours are over the 90th percentile and nothing near either', () => {
    // The third is not within 4% of the second, and the second is over the percentile: the second-best hour is not backed either.
    expect(backed(300, 260, 200)).toBeNull()
    expect(backed(300, 260)).toBeNull()
    expect(backed(300, 260, 260 * 0.95)).toBeNull()
  })

  it('is the second-best hour, over the 90th percentile, when a third is within 4% of it', () => {
    expect(backed(300, 260, 260 * 0.97)).toBe(260)
    expect(backed(260 * 0.97, 300, 260)).toBe(260)
    // The third counts only for the second: the best is not backed by an hour 13% under it.
    expect(backed(300, 260, 260)).toBe(260)
  })

  it('reads only the rides of the window', () => {
    const rides = held(260, 195, 190)
    expect(backedHour(rides, 1, 3, 190, 0.025)!.value).toBe(195)
    expect(backedHour(rides, 0, 1, 190, 0.025)).toBeNull()
  })

  it('is judged against the 90th percentile of the estimate it is given: 235 is over that of 190 and under that of 205', () => {
    expect(backedHour(held(235), 0, 1, 190, 0.025)).toBeNull()
    expect(backedHour(held(235), 0, 1, 205, 0.025)!.value).toBe(235)
  })

  it('leaves out an hour from estimated watts: it is not an hour done', () => {
    expect(hourOf([hour('guess', 200, { estimated: true })])).toBeNull()
    expect(hourOf([hour('guess', 200, { estimated: true }), hour('guess', 190)])).toMatchObject({
      value: 190,
    })
  })
})

describe('the answer and its low under a backed hour', () => {
  /** Eight tempo rides and one hour at `share` of threshold, so the mean of the estimates sits under the hour. */
  const withHour = (share: number, extra: number[] = []) =>
    library(RIDER, [
      ...rides(8, (id, over) => tempoRide(RIDER, id, over), 't'),
      { id: 'hour', hardS: 3600, hardPower: share * RIDER.threshold, ageDays: 3 },
      ...extra.map((x, i) => ({
        id: `again${i}`,
        hardS: 3600,
        hardPower: x * RIDER.threshold,
        ageDays: 4 + i,
      })),
    ])
  const hourPower = (share: number) => share * RIDER.threshold
  const run = (lib: ReturnType<typeof withHour>) => rideThreshold(lib.efforts, lib.blocks, null)!

  it('is never under the best hour, nor is its low', () => {
    const result = run(withHour(0.93))
    expect(result.efforts.value).toBeCloseTo(hourPower(0.93), 8)
    expect(result.value).toBeCloseTo(hourPower(0.93), 8)
    expect(result.low).toBeGreaterThanOrEqual(hourPower(0.93) - 1e-9)
    expect(result.low).toBeLessThanOrEqual(result.value)
    expect(result.high).toBeGreaterThan(result.value)
    expect(result.efforts.strongest).toEqual({
      activityId: 'hour',
      durationS: 3600,
      estimated: false,
    })
  })

  it('is not moved by an hour that is under the mean of the estimates', () => {
    const without = run(
      library(
        RIDER,
        rides(8, (id, over) => tempoRide(RIDER, id, over), 't'),
      ),
    )
    const result = run(withHour(0.5))
    expect(result.value).toBe(without.value)
    expect(result.low).toBe(without.low)
    expect(result.efforts.strongest.activityId).not.toBe('hour')
  })

  it('is not lifted, nor its low, by a lone hour far over the estimate', () => {
    const without = run(
      library(
        RIDER,
        rides(8, (id, over) => tempoRide(RIDER, id, over), 't'),
      ),
    )
    const result = run(withHour(1.4))
    expect(result.efforts.strongest.activityId).not.toBe('hour')
    expect(result.low).toBeLessThan(hourPower(1.4) * 0.8)
    // The lone ride still gives the mean its own estimate, which the robust mean all but ignores.
    expect(result.value).toBeLessThan(without.value * 1.05)
  })

  it('leaves heart rate free to lift the answer above a backed hour, and says it did not where it did not', () => {
    const lib = withHour(0.93)
    const lifted = rideThreshold(lib.efforts, lib.blocks, RIDER.thresholdHr)!
    expect('refused' in lifted.heartRate).toBe(false)
    expect(lifted.efforts.value).toBeCloseTo(hourPower(0.93), 8)
    expect(lifted.value).toBeGreaterThan(lifted.efforts.value)
    expect(lifted.value).toBeGreaterThan(hourPower(0.93))
    expect(lifted.low).toBeGreaterThanOrEqual(hourPower(0.93) - 1e-9)
    // Where heart rate cannot be read the answer is the floor itself, so a screen that asks whether heart rate lifted it, by
    // the answer standing over the power estimate, is told no.
    const alone = run(lib)
    expect(alone.value).toBe(alone.efforts.value)
  })

  it('is lifted to two hours that agree, and its low is not under them', () => {
    const result = run(withHour(1.4, [1.37]))
    expect(result.value).toBeCloseTo(hourPower(1.4), 8)
    expect(result.low).toBeGreaterThanOrEqual(hourPower(1.4) - 1e-9)
  })

  it('floors a runner’s answer in the run curve’s unit, scaled by a runner’s table', () => {
    const run20 = (id: string, level: number) => ride(id, DURATION_TABLES.run.held(level, 1200))
    const efforts = [run20('a', 14), run20('b', 14), run20('c', 14), hour('long', 15)]
    const result = runThreshold(efforts, [], null)!
    expect(result.value).toBe(15)
    expect(result.low).toBe(15)
    expect(runThreshold(efforts.slice(0, 3), [], null)!.value).toBeCloseTo(14, 8)
    // A runner’s lone hour far over the estimate is not believed either.
    expect(runThreshold([...efforts.slice(0, 3), hour('lone', 19)], [], null)!.value).toBeCloseTo(
      14,
      0,
    )
  })
})

describe('the band the heart-rate line is fitted in', () => {
  // Eight rides of a 45 min tempo, each with blocks from 110 to 190 W and five at 230 W; heart rate follows power on a line. The
  // tempo's estimate is about 196 W, so the line reads blocks from 88 W to 206 W: the 230 W blocks count only if a floor lifts the band.
  const heartRate = (power: number, i: number) => 90 + 0.4 * power + ((i * 7) % 5) * 0.3
  const tempo = (id: string): { efforts: ThresholdEffort[]; blocks: ThresholdBlock[] } => ({
    efforts: [ride(id, 200, { durationS: 2700 })],
    blocks: [110, 130, 150, 170, 190, 230, 230, 230, 230, 230].map((value, i) => ({
      activityId: id,
      heartRate: heartRate(value, i),
      value,
    })),
  })
  const base = ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7'].map(tempo)
  const efforts = base.flatMap((each) => each.efforts)
  const blocks = base.flatMap((each) => each.blocks)
  const lineOf = (extra: ThresholdEffort[]) => {
    const { rides: prepared, ages } = prepareFlat(
      [...efforts, ...extra],
      blocks,
      DURATION_TABLES.ride,
    )
    return { line: fitThresholdLine(prepared, ages), power: powerOver(prepared, ages)! }
  }
  const plain = lineOf([])

  it('is the tempo’s own: the 230 W blocks are over the band', () => {
    expect(plain.power.value).toBeLessThan(205)
    expect('refused' in plain.line).toBe(false)
    expect('highest' in plain.line && plain.line.highest).toBeLessThan(heartRate(200, 0))
  })

  it('is not lifted by a lone hour far over the estimate', () => {
    const lone = lineOf([hour('lone', 270)])
    expect(lone.power.floor).toBe(0)
    expect(lone.line).toEqual(plain.line)
  })

  it('is not lifted by two hours far over the estimate that do not agree', () => {
    // Hours whose rides have no best of their own, so the estimate stays the tempo's.
    const { rides: prepared, ages } = prepareFlat(efforts, blocks, DURATION_TABLES.ride)
    const rides = [...prepared, ...hourOnly(300, 265)]
    const all = [...ages, 0, 0]
    expect(powerOver(rides, all)!.floor).toBe(0)
    expect(fitThresholdLine(rides, all)).toEqual(plain.line)
  })

  it('is lifted by a backed hour, to what that hour gives and no further', () => {
    const backed = lineOf([hour('a', 270), hour('b', 262)])
    expect(backed.power.value).toBe(270)
    // The 230 W blocks are in the band now: the line takes its highest heart rate from them.
    expect('highest' in backed.line && backed.line.highest).toBeGreaterThan(heartRate(220, 0))
    expect(backed.line).not.toEqual(plain.line)
  })
})
