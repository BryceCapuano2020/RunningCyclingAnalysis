import { DAY_MS } from '../constants'
import type { MaxHeartRates } from '../effort'
import { estimateOver, thresholdBasis } from '../threshold'
import type { ThresholdBasis } from '../threshold'
import type { ActivityDigest, BikeModel, Sport } from '../types'
import type { EstimatedRideGate } from './estimatedRide'
import type { Masses } from './masses'
import { agesOf, thresholdHeartRate } from './thresholdEfforts'
import type { ActivityEfforts, ThresholdLibrary } from './thresholdEfforts'
import { eachSport, librariesOf, thresholdReferenceOf } from './thresholdLibraries'
import { THRESHOLD_WINDOW_WEEKS } from './thresholdTimelineTypes'
import type { ThresholdFit, ThresholdStep, ThresholdTimeline } from './thresholdTimelineTypes'
import { weekEndFor } from '../calendar'

const WEEK_MS = 7 * DAY_MS

/** Where an activity falls in the weeks, and whether it has an effort that dates the threshold of its window. */
interface Placed {
  weekEnd: number
  startMs: number
  effort: boolean
}

/** What a window's efforts are judged by: the library's reference heart rates, and whose heart rate is set aside. */
export interface TimelineEffort {
  referenceHr: MaxHeartRates
  setAside: ReadonlySet<string>
}

/**
 * The weeks a sport's threshold can change in: the end of each week an activity falls in, where it enters the
 * window, and the end of the week it leaves it. Ascending and without repeats.
 */
function changeWeeks(entries: readonly Placed[]): number[] {
  const weeks = new Set<number>()
  for (const { weekEnd } of entries) {
    weeks.add(weekEnd)
    weeks.add(weekEnd + THRESHOLD_WINDOW_WEEKS * WEEK_MS)
  }
  return [...weeks].sort((a, b) => a - b)
}

/**
 * How a sport reads a window of its entries. `fit` is asked for every week the threshold can change in, in order, with the
 * window's first and one-past-last entry (both only move forward) and the end of the week it ends with.
 */
interface WindowReader {
  fit(lo: number, hi: number, untilMs: number): ThresholdFit | null
}

/**
 * The steps of one sport. A window with no fit of its own leaves the older fit to stand in for it (`lastFit`); `asOfMs` is the
 * start of the newest activity of the window with an effort.
 */
function stepsOf(entries: readonly Placed[], reader: WindowReader): ThresholdStep[] {
  const steps: ThresholdStep[] = []
  const windowMs = THRESHOLD_WINDOW_WEEKS * WEEK_MS
  // The window's first and one-past-last entry: both only move forward as the weeks do.
  let lo = 0
  let hi = 0
  let lastFit = -1
  for (const fromMs of changeWeeks(entries)) {
    while (hi < entries.length && entries[hi]!.weekEnd <= fromMs) hi++
    while (lo < hi && entries[lo]!.weekEnd <= fromMs - windowMs) lo++
    const fit = reader.fit(lo, hi, fromMs)
    if (fit !== null) lastFit = steps.length
    let newest = hi - 1
    while (newest >= lo && !entries[newest]!.effort) newest--
    steps.push({ fromMs, fit, asOfMs: newest >= lo ? entries[newest]!.startMs : null, lastFit })
  }
  return steps
}

/**
 * The reader of a sport: its threshold over the window's activities, read against the library's line (fitted once, not per
 * window) as the analysis reads a period: each activity's efforts, aged from the newest activity of any sport up to the
 * window's end. Its standard error is the power estimate's own relative error times the value: the uncertainty of one window
 * against another. The 10th to 90th range is not that, since it allows for an athlete above their best and is one-sided.
 */
function windowReader(
  activities: readonly ActivityEfforts[],
  all: readonly ActivityDigest[],
  basis: ThresholdBasis,
): WindowReader {
  const ends = all.map((digest) => weekEndFor(digest))
  const ages = new Float64Array(activities.length)
  let seen = 0
  return {
    fit(lo, hi, untilMs) {
      while (seen < all.length && ends[seen]! <= untilMs) seen++
      if (lo >= hi || seen === 0) return null
      agesOf(activities, all[seen - 1]!.startMs, ages, lo, hi)
      const estimate = estimateOver(basis, ages, lo, hi)
      return estimate === null
        ? null
        : { cp: estimate.value, cpSe: estimate.value * estimate.efforts.relativeError }
    },
  }
}

const NOT_JUDGED: TimelineEffort = {
  referenceHr: { run: null, ride: null },
  setAside: new Set(),
}

/**
 * Each sport's threshold over time: for every week, the threshold over the efforts of the trailing `THRESHOLD_WINDOW_WEEKS`
 * weeks that end with it (see `ThresholdStep`). It is the sport's threshold (`rideThreshold`, `runThreshold`) over the window's
 * activities, read as the analysis reads them: priced as the library's best curves are (a ride by its bike model and
 * estimated-ride gate and its day's body mass, a run by its pace), with the heart rate of those not set aside in `effort` and
 * the threshold heart rate of the sport's reference. Each activity is read once, each sport's heart-rate line is fitted once over
 * the library's (`libraries`, which the caller may have made already), and a week costs one estimate against it.
 */
export function thresholdTimeline(
  ordered: readonly ActivityDigest[],
  masses: Masses,
  bikeModel: BikeModel,
  gate: EstimatedRideGate | null,
  effort: TimelineEffort = NOT_JUDGED,
  libraries?: Record<Sport, ThresholdLibrary>,
): ThresholdTimeline {
  const all = [...ordered]
  const own =
    libraries ??
    librariesOf(
      all,
      { masses, bikeModel, gate, heartSetAside: effort.setAside },
      effort.referenceHr,
    )
  return eachSport((sport) => {
    const { activities, line } = own[sport]
    const placed = activities.map((each): Placed => ({
      weekEnd: weekEndFor(each),
      startMs: each.startMs,
      effort: each.prepared.best !== null,
    }))
    const basis = thresholdBasis(
      activities.map((each) => each.prepared),
      line,
      thresholdHeartRate(thresholdReferenceOf(sport, effort.referenceHr)),
    )
    return stepsOf(placed, windowReader(activities, all, basis))
  })
}
