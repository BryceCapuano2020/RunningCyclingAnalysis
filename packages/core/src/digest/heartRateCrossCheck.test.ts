import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { crossCheck } from '../hr'
import { sampleDataset } from '../synthetic'
import type { ActivityDigest, DigestHrBlock } from '../types'
import { digestActivity } from './digestActivity'
import { MATCH_SLACK_DAYS, heartRateCrossCheck, matchedSpan } from './heartRateCrossCheck'
import { fixedMasses } from './masses'
import { heartRatePoints } from './rideCurves'
import { FIRST_MONDAY_MS, levelRun } from './test/runLibrary'

const masses = fixedMasses(70, 9)
const bikeModel = { cda: 0.32, crr: 0.005 }
const NO_FITS = { run: null, ride: null }

const RIDE = sampleDataset()
  .activities.map((activity) => digestActivity(activity))
  .find((digest) => digest.sport === 'ride' && !digest.indoor)!

/** Blocks whose heart rate is `intercept + slope * value`, over a spread of values. */
function blocks(values: number[], slope: number, intercept: number): DigestHrBlock[] {
  return values.map((value) => ({ value, heartRate: intercept + slope * value, terms: null }))
}

/** Run blocks are metabolic W/kg; ride blocks are watts, a few times larger for the same effort. */
const RUN_VALUES = [4, 5, 6, 7, 8, 9, 10, 11]
const RIDE_VALUES = [100, 130, 160, 190, 220, 250, 280, 310]

const day = (n: number) => FIRST_MONDAY_MS + n * DAY_MS

function run(id: string, at: number, slope: number): ActivityDigest {
  return { ...levelRun(id, at, 1), hrBlocks: blocks(RUN_VALUES, slope, 90), hasHeartRate: true }
}

function ride(id: string, at: number, slope: number): ActivityDigest {
  return {
    ...RIDE,
    id,
    startMs: day(at),
    indoor: false,
    hrBlocks: blocks(RIDE_VALUES, slope, 60),
    hasHeartRate: true,
  }
}

const kappaOf = (digests: ActivityDigest[]) =>
  heartRateCrossCheck(digests, masses, bikeModel, NO_FITS)

describe('heartRateCrossCheck over a matched window', () => {
  // Runs for four months at one slope, then (after more than the slack) runs and rides together at another.
  const early = [0, 30, 60, 90, 120].map((at) => run(`early-${at}`, at, 2))
  const shared = [210, 230, 250].flatMap((at) => [
    run(`run-${at}`, at, 4),
    ride(`ride-${at}`, at, 0.3),
  ])

  it('reads the ratio from the days both sports were done, not from years of one alone', () => {
    const library = [...early, ...shared]
    const matched = kappaOf(library)
    const together = kappaOf(shared)
    expect(matched.kappa).toBeCloseTo(together.kappa!, 8)
    expect(matched.lnKappaSe).toBeCloseTo(together.lnKappaSe!, 8)
    // Read over the whole library, the early runs' different slope would have moved it.
    const { runPoints, ridePoints } = heartRatePoints(library, masses, bikeModel)
    const whole = crossCheck(runPoints, ridePoints)
    expect(Math.abs(whole.kappa! / matched.kappa! - 1)).toBeGreaterThan(0.1)
  })

  it('keeps every block in the slopes and their points, so the charts show all the evidence', () => {
    const library = [...early, ...shared]
    const { runPoints, ridePoints } = heartRatePoints(library, masses, bikeModel)
    const found = kappaOf(library)
    expect(found.run!.points).toHaveLength(runPoints.length)
    expect(found.ride!.points).toHaveLength(ridePoints.length)
  })

  it('is unchanged when the two sports were done over the same days', () => {
    const library = [...shared, run('run-270', 270, 4), ride('ride-270', 270, 0.3)]
    const { runPoints, ridePoints } = heartRatePoints(library, masses, bikeModel)
    const whole = crossCheck(runPoints, ridePoints)
    expect(kappaOf(library)).toEqual(whole)
  })

  it('gives no ratio for sports that were never done in the same stretch, and keeps the slopes', () => {
    const library = [...early, ride('late-ride', 400, 0.3), ride('late-ride-2', 410, 0.3)]
    const found = kappaOf(library)
    expect(found.run).not.toBeNull()
    expect(found.ride).not.toBeNull()
    expect(found.kappa).toBeNull()
    expect(found.lnKappaSe).toBeNull()
  })

  it('gives no ratio from fewer than three activities of a sport in the shared stretch', () => {
    const runs = [0, 10, 20, 30, 40].map((at) => run(`r-${at}`, at, 4))
    // One ride thirty days after five runs: a ratio from one ride is that day's weather.
    expect(kappaOf([...runs, ride('one', 70, 0.3)]).kappa).toBeNull()
    expect(kappaOf([...runs, ride('one', 70, 0.3), ride('two', 72, 0.3)]).kappa).toBeNull()
    // Exactly three of each is enough, and the same with the runs thinned to three.
    const nearRuns = [50, 52, 54].map((at) => run(`n-${at}`, at, 4))
    const three = [...nearRuns, ...[60, 62, 64].map((at) => ride(`ride-${at}`, at, 0.3))]
    expect(kappaOf(three).kappa).not.toBeNull()
    expect(kappaOf(three).lnKappaSe).not.toBeNull()
    expect(kappaOf(three.slice(1)).kappa).toBeNull()
  })
})

describe('matchedSpan', () => {
  const point = (activityId: string) => ({ metabolicPower: 5, heartRate: 140, activityId })
  const slack = MATCH_SLACK_DAYS * DAY_MS
  const startOf = new Map([
    ['a', 0],
    ['b', 100 * DAY_MS],
    ['c', 60 * DAY_MS],
    ['d', 400 * DAY_MS],
    ['e', 130 * DAY_MS],
  ])

  it('is the stretch the two sports share, each widened by the slack', () => {
    expect(matchedSpan([point('a'), point('b')], [point('c'), point('d')], startOf)).toEqual({
      fromMs: 60 * DAY_MS - slack,
      toMs: 100 * DAY_MS + slack,
    })
  })

  it('counts a sport begun a few weeks after the other stopped as sharing a stretch', () => {
    expect(matchedSpan([point('a'), point('b')], [point('e')], startOf)).not.toBeNull()
  })

  it('is null when the sports are done more than two slacks apart, or one has no points', () => {
    expect(matchedSpan([point('a')], [point('d')], startOf)).toBeNull()
    expect(matchedSpan([], [point('d')], startOf)).toBeNull()
  })
})
