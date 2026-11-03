import { describe, expect, it, vi } from 'vitest'
import { DAY_MS, DEFAULT_BIKE_MODEL, PRIORS } from '../constants'
import { sampleDataset } from '../synthetic'
import type { ActivityDigest, AthleteSettings } from '../types'
import { combine } from './combine'
import { runEffortsOf, runsOf } from './runEfforts'
import { runCentralWkg } from './rideCurves'
import { digestActivity } from './digestActivity'
import { estimatedStanding } from './estimatedRide'
import { fixedMasses } from './masses'
import { agesOf, rideEffortsOf, thresholdHeartRate } from './thresholdEfforts'
import { librariesOf, thresholdsOf } from './thresholdLibraries'
import * as thresholdModule from '../threshold'
import { DURATION_TABLES } from '../threshold'
import type { ThresholdLine } from '../threshold'
import { syntheticActivity } from './test/syntheticActivity'

vi.mock('../threshold', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../threshold')>()
  return { ...actual, fitThresholdLine: vi.fn(actual.fitThresholdLine) }
})
const fitted = vi.mocked(thresholdModule.fitThresholdLine)

const SETTINGS: AthleteSettings = { massKg: 70, bikeMassKg: 9 }
const masses = fixedMasses(SETTINGS.massKg, SETTINGS.bikeMassKg)
const everyPointHolds = estimatedStanding(null)

/** A ride of an hour: `hardW` for `hardS` seconds, then easy riding; heart rate follows power on a line. */
function ride(id: string, day: number, hardW: number, hardS: number): ActivityDigest {
  const n = 3600
  const power = Float64Array.from({ length: n }, (_, i) => (i < hardS ? hardW : 140))
  const heartRate = Float64Array.from(power, (p) => 90 + 0.35 * p)
  return digestActivity(
    syntheticActivity({
      id,
      sport: 'ride',
      n,
      startMs: Date.UTC(2024, 5, 1) + day * DAY_MS,
      speed: new Float64Array(n).fill(8),
      heartRate,
      power,
    }),
  )
}

const rideOf = (digest: ActivityDigest, aside = false) =>
  rideEffortsOf(digest, masses, DEFAULT_BIKE_MODEL, everyPointHolds, aside)

const inputsOf = (heartSetAside: ReadonlySet<string>) => ({
  masses,
  bikeModel: DEFAULT_BIKE_MODEL,
  gate: null,
  heartSetAside,
})
const NO_LINE: ThresholdLine = { refused: 'no-heart-rate' }

/** The ride threshold of the digests, read as the analysis reads it, against the ride reference heart rate. */
const rideThresholdOf = (
  ordered: ActivityDigest[],
  heartSetAside: ReadonlySet<string>,
  referenceMax: number | null,
  line?: ThresholdLine,
) =>
  thresholdsOf(
    ordered,
    inputsOf(heartSetAside),
    { run: null, ride: referenceMax },
    line === undefined ? undefined : { run: NO_LINE, ride: line },
  ).ride

describe('what a ride gives the ride threshold', () => {
  const hard = ride('hard', 0, 280, 600)

  it('gives each best from 3 to 60 min in gross metabolic W/kg at the ride’s body mass', () => {
    const { efforts } = rideOf(hard)
    expect(efforts.map((e) => e.durationS)).toEqual([
      180, 240, 300, 420, 600, 900, 1200, 1800, 2700, 3600,
    ])
    const ten = efforts.find((e) => e.durationS === 600)!
    // 280 W for 10 min at 70 kg and the prior-mean efficiency.
    expect(ten.value).toBeCloseTo(280 / (PRIORS.grossEfficiency.mean * 70), 1)
    expect(ten.estimated).toBe(false)
    expect(ten.heartRate).toBeGreaterThan(150)
  })

  it('gives the 5 min heart-rate blocks of a power-meter ride', () => {
    const { blocks } = rideOf(hard)
    expect(blocks.length).toBeGreaterThan(5)
    expect(blocks.every((b) => b.activityId === 'hard')).toBe(true)
    // The easy blocks are 140 W.
    expect(Math.min(...blocks.map((b) => b.value))).toBeCloseTo(
      140 / (PRIORS.grossEfficiency.mean * 70),
      1,
    )
  })

  it('has no heart rate and no blocks where the ride’s heart rate is set aside', () => {
    const { efforts, blocks } = rideOf(hard, true)
    expect(efforts.length).toBeGreaterThan(0)
    expect(efforts.every((e) => e.heartRate === null)).toBe(true)
    expect(blocks).toEqual([])
  })

  it('marks a ride without a power meter estimated and gives no blocks for it', () => {
    // The sample dataset's one ride without a power meter.
    const virtual = sampleDataset()
      .activities.filter((a) => a.sport === 'ride' && !a.hasPower)
      .map((a) => digestActivity(a))[0]!
    const { efforts, blocks } = rideOf(virtual)
    expect(efforts.length).toBeGreaterThan(0)
    expect(efforts.every((e) => e.estimated)).toBe(true)
    expect(blocks).toEqual([])
  })

  it('ages each ride from the newest activity in the set, never under 0', () => {
    const old = rideOf(ride('old', 0, 280, 600))
    const recent = rideOf(ride('recent', 10, 280, 600))
    expect([...agesOf([old, recent], recent.startMs)]).toEqual([10, 0])
    // An activity newer than the anchor, as a window ending before it reads one, is not given a negative age.
    expect([...agesOf([old, recent], old.startMs)]).toEqual([0, 0])
  })

  it('ages only the rides of a window, into the array it is given', () => {
    const rides = [0, 5, 10].map((day) => rideOf(ride(`d${day}`, day, 280, 600)))
    const into = new Float64Array(3).fill(-1)
    agesOf(rides, rides[2]!.startMs, into, 1, 3)
    expect([...into]).toEqual([-1, 5, 0])
  })

  it('takes threshold heart rate as 90% of the reference maximum, null without one', () => {
    expect(thresholdHeartRate(190)).toBeCloseTo(171, 10)
    expect(thresholdHeartRate(null)).toBeNull()
    expect(thresholdHeartRate(0)).toBeNull()
  })
})

describe('the ride threshold of a set of digests', () => {
  const rides = [0, 3, 6, 9, 12, 15].map((day, i) => ride(`r${i}`, day, 270 + i, 900))
  const reference = new Set<string>()

  it('is null with no ride', () => {
    expect(rideThresholdOf([], reference, 190)).toBeNull()
  })

  it('reads every ride, and names its heart rate refusal where it has too little', () => {
    const result = rideThresholdOf(rides, reference, 190)!
    expect(result.efforts.rides).toBe(6)
    expect(result.value).toBe(result.efforts.value)
    expect(result.low).toBeLessThan(result.value)
    expect(result.high).toBeGreaterThan(result.value)
  })

  it('leaves heart rate out where the rides’ heart rate is set aside', () => {
    const result = rideThresholdOf(rides, new Set(rides.map((r) => r.id)), 190)!
    expect(result.heartRate).toEqual({ refused: 'no-heart-rate' })
  })

  it('reads the line it is given, not one of its own', () => {
    const own = rideThresholdOf(rides, reference, 190)!
    const library = librariesOf(rides, inputsOf(reference), { run: null, ride: 190 }).ride
    // The library's line over these same rides is the line a set of them fits for itself.
    expect(rideThresholdOf(rides, reference, 190, library.line)).toEqual(own)
    // A line that is refused is read as refused, whatever these rides' blocks would have said.
    const refused = rideThresholdOf(rides, reference, 190, { refused: 'stuck' })!
    expect(refused.heartRate).toEqual({ refused: 'stuck' })
    expect(refused.efforts).toEqual(own.efforts)
  })

  it('fits no line where there is no ride reference to read it against', () => {
    const library = librariesOf(rides, inputsOf(reference), { run: null, ride: null }).ride
    expect(library.line).toEqual({ refused: 'no-heart-rate' })
    expect(library.activities).toHaveLength(6)
  })

  it('is the analysis’s ride threshold', () => {
    const analysed = combine(rides, SETTINGS)
    expect(analysed.rideThreshold).not.toBeNull()
    expect(analysed.rideThreshold!.efforts.rides).toBe(6)
    expect(analysed.rideCp).toBeDefined()
  })

  it('is null for a library of runs', () => {
    const runs = [syntheticActivity({ id: 'run', n: 1800 })].map((a) => digestActivity(a))
    expect(combine(runs, SETTINGS).rideThreshold).toBeNull()
  })
})

/** A run of an hour at `fast` m/s for the first `fastS` seconds and 3 m/s after; heart rate follows speed on a line. */
function runOf(id: string, day: number, fast: number, fastS: number, over = {}): ActivityDigest {
  const n = 3600
  const speed = Float64Array.from({ length: n }, (_, i) => (i < fastS ? fast : 3))
  const heartRate = Float64Array.from(speed, (v) => 90 + 20 * v)
  return digestActivity(
    syntheticActivity({
      id,
      sport: 'run',
      n,
      startMs: Date.UTC(2024, 5, 1) + day * DAY_MS,
      speed,
      heartRate,
      ...over,
    }),
  )
}

describe('what a run gives the run threshold', () => {
  const hard = runOf('hard', 0, 4.2, 900)

  it('gives each best from 8 to 60 min in the run curve’s own unit, gross metabolic W/kg', () => {
    const { efforts } = runEffortsOf(hard, false)
    // The curve has points at 7 and 10 min: the run table’s 8 min is the 10 min point on a real library.
    expect(efforts.map((e) => e.durationS)).toEqual([600, 900, 1200, 1800, 2700, 3600])
    const fifteen = efforts.find((e) => e.durationS === 900)!
    const point = hard.curve.find((p) => p.durationS === 900)!
    expect(fifteen.value).toBe(runCentralWkg(point))
    expect(fifteen.estimated).toBe(false)
    expect(fifteen.heartRate).toBeGreaterThan(160)
  })

  it('gives the 5 min heart-rate blocks, in the same unit, and none for a run whose heart rate is set aside', () => {
    const { blocks } = runEffortsOf(hard, false)
    expect(blocks.length).toBeGreaterThan(5)
    expect(blocks.every((b) => b.activityId === 'hard' && b.value > 0)).toBe(true)
    // The hard blocks are the 4.2 m/s of the first 15 min; every block is a whole run's mean metabolic W/kg.
    expect(Math.max(...blocks.map((b) => b.value))).toBeGreaterThan(
      Math.min(...blocks.map((b) => b.value)),
    )
    const aside = runEffortsOf(hard, true)
    expect(aside.blocks).toEqual([])
    expect(aside.efforts.length).toBeGreaterThan(0)
    expect(aside.efforts.every((e) => e.heartRate === null)).toBe(true)
  })

  it('drops a point faster than a person can run, as the run best curve does', () => {
    const fast = {
      ...hard,
      curve: hard.curve.map((p) => (p.durationS === 900 ? { ...p, value: 200 } : p)),
    }
    const durations = runEffortsOf(fast, false).efforts.map((e) => e.durationS)
    expect(durations).not.toContain(900)
    expect(durations).toContain(600)
  })

  it('gives nothing from the short bests of a run, which a ride’s threshold reads from 3 min', () => {
    // A hard 5 min and nothing sustained: strides, a hill repeat. The same bests are a ride’s efforts.
    const burst = runOf('burst', 2, 5, 300)
    const shortest = Math.min(...burst.curve.map((p) => p.durationS))
    expect(shortest).toBeLessThan(DURATION_TABLES.run.shortestS)
    expect(runEffortsOf(burst, false).efforts.every((e) => e.durationS >= 480)).toBe(true)
    const sprint = ride('sprint', 2, 400, 300)
    expect(rideOf(sprint).efforts[0]!.durationS).toBe(DURATION_TABLES.ride.shortestS)
  })

  it('leaves out a treadmill run, whose pace is not a distance covered', () => {
    const belt = runOf('belt', 1, 4.2, 900, { indoor: true })
    const runs = runsOf([hard, belt], new Set())
    expect(runs).toHaveLength(1)
    expect(runs[0]!.prepared.activityId).toBe('hard')
  })

  it('reads only the runs of a mixed library, each with its own heart rate set aside', () => {
    const rides = [0, 1].map((day) => ride(`r${day}`, day, 280, 600))
    const runs = runsOf([hard, ...rides], new Set(['hard']))
    expect(runs).toHaveLength(1)
    expect(runs[0]!.efforts.every((e) => e.heartRate === null)).toBe(true)
  })
})

describe('the run threshold of a set of digests', () => {
  const runs = [0, 3, 6, 9, 12, 15].map((day, i) => runOf(`u${i}`, day, 4 + i * 0.01, 1200))
  const none = new Set<string>()
  const runThresholdOf = (ordered: ActivityDigest[], referenceMax: number | null) =>
    thresholdsOf(ordered, inputsOf(none), { run: referenceMax, ride: null }).run

  it('is null with no run, and for a library of rides', () => {
    expect(runThresholdOf([], 190)).toBeNull()
    const rides = [0, 3].map((day) => ride(`r${day}`, day, 270, 900))
    expect(runThresholdOf(rides, 190)).toBeNull()
    expect(thresholdsOf(rides, inputsOf(none), { run: 190, ride: 190 }).ride).not.toBeNull()
  })

  it('reads every run, as a runner would hold the pace for an hour', () => {
    const result = runThresholdOf(runs, 190)!
    expect(result.efforts.rides).toBe(6)
    expect(result.value).toBe(result.efforts.value)
    expect(result.low).toBeLessThan(result.value)
    expect(result.high).toBeGreaterThan(result.value)
  })

  it('reads pace alone: heart rate is refused for a run whatever its reference maximum, so the answer is the power estimate', () => {
    const result = runThresholdOf(runs, 190)!
    expect(result.heartRate).toEqual({ refused: 'no-heart-rate' })
    expect(result.value).toBe(result.efforts.value)
    // The same runs with no reference maximum at all read the same.
    expect(runThresholdOf(runs, null)).toEqual(result)
  })

  it('fits a heart-rate line over the rides’ blocks and none over the runs’, with both references given', () => {
    const rides = [0, 3, 6, 9, 12, 15].map((day, i) => ride(`r${i}`, day, 270 + i, 900))
    const both = librariesOf([...runs, ...rides], inputsOf(none), { run: 190, ride: 190 })
    expect(both.run.activities).toHaveLength(6)
    expect(both.run.line).toEqual({ refused: 'no-heart-rate' })
    expect(both.ride.line).not.toEqual({ refused: 'no-heart-rate' })
    // Rides are still read against their line: a reference lets their heart rate be asked of.
    const thresholds = thresholdsOf([...runs, ...rides], inputsOf(none), { run: 190, ride: 190 })
    expect(thresholds.run!.heartRate).toEqual({ refused: 'no-heart-rate' })
    expect(thresholds.ride!.heartRate).not.toEqual({ refused: 'no-heart-rate' })
    // A run's threshold ignores the rides' blocks and a ride's the runs'.
    expect(thresholds.run!.efforts.rides).toBe(6)
    expect(thresholds.run!.efforts.value).toBeCloseTo(runThresholdOf(runs, 190)!.efforts.value, 8)
  })

  it('fits no run line at all, whether the library’s lines are given or left to be fitted over the set', () => {
    const rides = [0, 3, 6, 9, 12, 15].map((day, i) => ride(`r${i}`, day, 270 + i, 900))
    const mixed = [...runs, ...rides]
    const fittedOver = () =>
      fitted.mock.calls.map(([prepared]) => prepared.map((r) => r.activityId))
    // Lines absent: each sport's is fitted over the set, and a sport that reads no heart rate has none to fit.
    fitted.mockClear()
    thresholdsOf(mixed, inputsOf(none), { run: 190, ride: 190 })
    expect(fittedOver()).toHaveLength(1)
    expect(fittedOver()[0]!.every((id) => id.startsWith('r'))).toBe(true)
    fitted.mockClear()
    thresholdsOf(runs, inputsOf(none), { run: 190, ride: null })
    expect(fitted).not.toHaveBeenCalled()
    // The library's lines: the same one fit, over the rides.
    fitted.mockClear()
    librariesOf(mixed, inputsOf(none), { run: 190, ride: 190 })
    expect(fittedOver()).toHaveLength(1)
    expect(fittedOver()[0]!.every((id) => id.startsWith('r'))).toBe(true)
  })

  it('is the analysis’s run threshold, with the fit still reported for the curve chart', () => {
    const analysed = combine(runs, SETTINGS)
    expect(analysed.runThreshold).not.toBeNull()
    expect(analysed.runThreshold!.efforts.rides).toBe(6)
    expect(analysed.runThreshold!.heartRate).toEqual({ refused: 'no-heart-rate' })
    expect(analysed.runCp).toBeDefined()
    expect(analysed.rideThreshold).toBeNull()
  })

  it('is above no run’s hour: the hour a run held is a floor', () => {
    // 1 hour of 4 m/s with no harder stretch: the hour is its hardest effort.
    const steady = runOf('steady', 20, 4, 3600)
    const result = runThresholdOf([...runs, steady], 190)!
    const hour = runEffortsOf(steady, false).efforts.find((e) => e.durationS === 3600)!
    expect(result.value).toBeGreaterThanOrEqual(hour.value)
    expect(result.low).toBeGreaterThanOrEqual(hour.value)
  })
})
