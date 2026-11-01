import { RUN_RECORD_DISTANCES_M } from '../constants'
import { effortsCount } from '../digest/effortTrust'
import { ofSport } from '../digest/ordered'
import { EFFORT_LENGTHS_S } from '../digest/trendPoints'
import { METRES_PER_KM } from '../units/convert'
import type { ActivityDigest, Sport } from '../types'
import { shownHard } from './hardness'
import { perSport } from './sports'
import type { HistoryInput, HistoryPart } from './types'
import { yearOfDigest } from './yearOf'
import { curvesByYear, pointShownHard, sameHardness, sameRidePricing } from './yearlyCurves'

/**
 * A calendar year's best at one length: the year, the value (a run's time over a distance, s; a ride's power, W), and
 * whether heart rate shows the effort was hard. One that is not shown hard is still the year's best, as a floor.
 */
export type YearBest = readonly [year: number, value: number, hard: boolean]

/** A sport's best at one length, in each year that has one, oldest year first. */
export interface BestEffort {
  /** Metres for a run's distance, seconds for a ride's duration. */
  length: number
  years: YearBest[]
}

export type YearBests = Record<Sport, BestEffort[]>

/** The distances a runner measures a year by: the mile, 5 km, 10 km, the half marathon and the marathon. */
const RUN_DISTANCES_M = RUN_RECORD_DISTANCES_M.filter((distanceM) => distanceM !== METRES_PER_KM)

/** The efforts of each sport that are charted by year: a run's distances, a ride's 5, 20 and 60 minutes. */
const LENGTHS: Record<Sport, readonly number[]> = { run: RUN_DISTANCES_M, ride: EFFORT_LENGTHS_S }

const empty: YearBests = perSport(() => [])

/** The year's fastest time over each distance, from the runs whose efforts count (an indoor run holds none). */
function runBests(digests: ActivityDigest[], input: HistoryInput): BestEffort[] {
  const runs = ofSport(digests, 'run').filter(effortsCount)
  return LENGTHS.run.flatMap((distanceM) => {
    const best = new Map<number, { seconds: number; digest: ActivityDigest }>()
    for (const digest of runs) {
      const seconds = digest.distanceBests?.find((b) => b.distanceM === distanceM)?.seconds
      if (seconds === undefined || !Number.isFinite(seconds)) continue
      const year = yearOfDigest(digest)
      // Digests are in canonical order, so a tie goes to the earlier activity.
      if (seconds < (best.get(year)?.seconds ?? Number.POSITIVE_INFINITY)) {
        best.set(year, { seconds, digest })
      }
    }
    const years = [...best]
      .sort(([a], [b]) => a - b)
      .map(([year, { seconds, digest }]): YearBest => [
        year,
        seconds,
        shownHard(digest, seconds, input),
      ])
    return years.length === 0 ? [] : [{ length: distanceM, years }]
  })
}

/** The year's best power at each length, from the year's best curve: the same bests the Ride page shows. */
function rideBests(digests: ActivityDigest[], input: HistoryInput): BestEffort[] {
  const inYear = curvesByYear(digests, input)
  return LENGTHS.ride.flatMap((durationS) => {
    const years = inYear.flatMap((year): YearBest[] => {
      const point = year.curves.rideCurve.find((p) => p.durationS === durationS)
      if (point === undefined || !(point.value > 0) || !Number.isFinite(point.value)) return []
      return [[year.year, Math.round(point.value), pointShownHard(year, point, input)]]
    })
    return years.length === 0 ? [] : [{ length: durationS, years }]
  })
}

const BUILD: Record<Sport, (digests: ActivityDigest[], input: HistoryInput) => BestEffort[]> = {
  run: runBests,
  ride: rideBests,
}

/**
 * Each sport's best at each length in each calendar year, for the small multiples of bests by year. The runs' come from
 * their distance bests and the rides' from the year's best curve, so no second best-effort logic stands beside the sport
 * pages'. An indoor run, a ride whose power is set aside and an activity left out of the analysis hold no best.
 */
export const bests: HistoryPart<YearBests> = {
  empty,
  build: (digests, input) => perSport((sport) => BUILD[sport](digests, input)),
  same: (a, b) => sameRidePricing(a, b) && sameHardness(a, b),
}
