import { describe, expect, it } from 'vitest'
import { DAY_MS, DEFAULT_BIKE_MODEL, PRIORS } from '../constants'
import { sampleDataset } from '../synthetic'
import type { ActivityDigest, AthleteSettings } from '../types'
import { combine } from './combine'
import { digestActivity } from './digestActivity'
import { estimatedStanding } from './estimatedRide'
import { fixedMasses } from './masses'
import {
  agesOf,
  rideEffortsOf,
  rideLibraryOf,
  rideThresholdOf,
  thresholdHeartRate,
} from './thresholdEfforts'
import { syntheticActivity } from './test/syntheticActivity'

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
    expect(rideThresholdOf([], masses, DEFAULT_BIKE_MODEL, null, reference, 190)).toBeNull()
  })

  it('reads every ride, and names its heart rate refusal where it has too little', () => {
    const result = rideThresholdOf(rides, masses, DEFAULT_BIKE_MODEL, null, reference, 190)!
    expect(result.efforts.rides).toBe(6)
    expect(result.value).toBeGreaterThan(result.efforts.value)
    expect(result.low).toBeLessThan(result.value)
    expect(result.high).toBeGreaterThan(result.value)
  })

  it('leaves heart rate out where the rides’ heart rate is set aside', () => {
    const result = rideThresholdOf(
      rides,
      masses,
      DEFAULT_BIKE_MODEL,
      null,
      new Set(rides.map((r) => r.id)),
      190,
    )!
    expect(result.heartRate).toEqual({ refused: 'no-heart-rate' })
  })

  it('reads the line it is given, not one of its own', () => {
    const own = rideThresholdOf(rides, masses, DEFAULT_BIKE_MODEL, null, reference, 190)!
    const library = rideLibraryOf(rides, masses, DEFAULT_BIKE_MODEL, null, reference, 190)
    // The library's line over these same rides is the line a set of them fits for itself.
    expect(
      rideThresholdOf(rides, masses, DEFAULT_BIKE_MODEL, null, reference, 190, library.line),
    ).toEqual(own)
    // A line that is refused is read as refused, whatever these rides' blocks would have said.
    const refused = rideThresholdOf(rides, masses, DEFAULT_BIKE_MODEL, null, reference, 190, {
      refused: 'stuck',
    })!
    expect(refused.heartRate).toEqual({ refused: 'stuck' })
    expect(refused.efforts).toEqual(own.efforts)
  })

  it('fits no line where there is no ride reference to read it against', () => {
    const library = rideLibraryOf(rides, masses, DEFAULT_BIKE_MODEL, null, reference, null)
    expect(library.line).toEqual({ refused: 'no-heart-rate' })
    expect(library.rides).toHaveLength(6)
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
