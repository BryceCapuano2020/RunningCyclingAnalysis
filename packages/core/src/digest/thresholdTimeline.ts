import {
  CP_FIT_MAX_S,
  CP_FIT_MIN_S,
  CP_FIT_REACH_TOLERANCE,
  DAY_MS,
  DURATIONS_S,
} from '../constants'
import { criticalPowerOutcome, wPrimeFloor } from '../cp'
import { ENVELOPE_TIE_TOLERANCE } from '../curves/monotoneEnvelope'
import type { ActivityDigest, BikeModel, CriticalPowerFit, Curve, Sport } from '../types'
import { effortsCount } from './effortTrust'
import { estimatedStanding } from './estimatedRide'
import type { EstimatedRideGate } from './estimatedRide'
import type { Masses } from './masses'
import { centralWkgFromWatts, ridePriced, runCentralWkg } from './rideCurves'
import { THRESHOLD_WINDOW_WEEKS } from './thresholdTimelineTypes'
import type { ThresholdStep, ThresholdTimeline } from './thresholdTimelineTypes'
import { weekEndMs } from './trendPoints'

const WEEK_MS = 7 * DAY_MS
const DURATIONS = DURATIONS_S.length
/** A duration with no value, in the arrays below, so that a maximum over them ignores it. */
const NONE = Number.NEGATIVE_INFINITY

/**
 * One digest of a sport: the end of its week and its start; its points priced in the sport's fit unit, by duration
 * (`backed` counts at every duration, `standing` at its own only, as `bestOfEach` has it); and whether it has an effort as
 * long as a fit reaches. A duration with no value holds `NONE`.
 */
interface Entry {
  weekEnd: number
  startMs: number
  backed: Float64Array
  standing: Float64Array | null
  effort: boolean
}

/** A digest's points priced in gross metabolic W/kg, as the library's best curves price them. */
function entryOf(
  digest: ActivityDigest,
  price: (digest: ActivityDigest, index: number) => { wkg: number; alone: boolean },
): Entry {
  const backed = new Float64Array(DURATIONS).fill(NONE)
  let standing: Float64Array | null = null
  const reach = CP_FIT_MAX_S * (1 - CP_FIT_REACH_TOLERANCE)
  let effort = false
  digest.curve.forEach((point, i) => {
    const { wkg, alone } = price(digest, i)
    if (Number.isNaN(wkg)) return
    if (point.durationS >= reach) effort = true
    if (alone) (standing ??= new Float64Array(DURATIONS).fill(NONE))[i] = wkg
    else backed[i] = wkg
  })
  return { weekEnd: weekEndMs(digest.startMs), startMs: digest.startMs, backed, standing, effort }
}

/**
 * The pointwise maximum over a window of entries that moves forward, one entry in and one out at a time: two stacks,
 * as a queue with an aggregate. Each entry is pushed and popped once and a query costs one duration's worth, so a
 * library's weeks cost its size, not its size times the weeks' window.
 */
class WindowMax {
  /** Suffix maxima of the entries [lo, mid): entry i's row holds the maximum over i to mid - 1. */
  private readonly front: Float64Array
  private readonly back = new Float64Array(DURATIONS).fill(NONE)
  private lo = 0
  private mid = 0
  private hi = 0

  private readonly rows: readonly Float64Array[]

  constructor(rows: readonly Float64Array[]) {
    this.rows = rows
    this.front = new Float64Array(rows.length * DURATIONS)
  }

  /** Brings entries up to `end` into the window. */
  pushTo(end: number): void {
    for (; this.hi < end; this.hi++) {
      const row = this.rows[this.hi]!
      for (let d = 0; d < DURATIONS; d++) if (row[d]! > this.back[d]!) this.back[d] = row[d]!
    }
  }

  /** Lets entries before `start` go. */
  popTo(start: number): void {
    for (; this.lo < start; this.lo++) {
      if (this.lo < this.mid) continue
      // The front is spent: the back becomes it, with the maxima from each entry to the newest.
      for (let i = this.hi - 1; i >= this.lo; i--) {
        const row = this.rows[i]!
        for (let d = 0; d < DURATIONS; d++) {
          const later = i + 1 < this.hi ? this.front[(i + 1) * DURATIONS + d]! : NONE
          this.front[i * DURATIONS + d] = Math.max(row[d]!, later)
        }
      }
      this.mid = this.hi
      this.back.fill(NONE)
    }
  }

  /** The maximum at duration `d` over the window. */
  at(d: number): number {
    const front = this.lo < this.mid ? this.front[this.lo * DURATIONS + d]! : NONE
    return Math.max(front, this.back[d]!)
  }
}

/**
 * The curve of a window as `bestOfEach` makes it, in values only: the best of the points that count at every
 * duration, held non-increasing by the monotone envelope, then the points that stand at their own duration alone
 * placed where they beat what is there, without rising above the nearest shorter duration with a value.
 */
function windowCurve(best: WindowMax, standing: readonly Float64Array[]): Float64Array {
  const values = new Float64Array(DURATIONS)
  let ceiling = NONE
  let seen = false
  for (let d = DURATIONS - 1; d >= 0; d--) {
    let value = best.at(d)
    if (seen && value < ceiling - Math.abs(ceiling) * ENVELOPE_TIE_TOLERANCE) value = ceiling
    values[d] = value
    if (value > NONE && (!seen || value > ceiling)) {
      ceiling = value
      seen = true
    }
  }
  if (standing.length === 0) return values
  let shorter = Number.POSITIVE_INFINITY
  for (let d = 0; d < DURATIONS; d++) {
    let placed = values[d]!
    for (const alone of standing) {
      const value = alone[d]!
      if (value <= shorter && value > placed) placed = value
    }
    values[d] = placed
    if (placed > NONE) shorter = placed
  }
  return values
}

/** The curve in the shape the fit reads, from the durations it uses. */
function fitCurve(values: Float64Array): Curve {
  const points: Curve = []
  DURATIONS_S.forEach((durationS, d) => {
    if (durationS < CP_FIT_MIN_S || durationS > CP_FIT_MAX_S) return
    const value = values[d]!
    points.push({
      durationS,
      value: value === NONE ? Number.NaN : value,
      activityId: null,
      startIndex: -1,
      windowS: null,
    })
  })
  return points
}

/**
 * The weeks a sport's threshold can change in: the end of each week an activity falls in, where it enters the
 * window, and the end of the week it leaves it. Ascending and without repeats.
 */
function changeWeeks(entries: readonly Entry[]): number[] {
  const weeks = new Set<number>()
  for (const { weekEnd } of entries) {
    weeks.add(weekEnd)
    weeks.add(weekEnd + THRESHOLD_WINDOW_WEEKS * WEEK_MS)
  }
  return [...weeks].sort((a, b) => a - b)
}

/** The steps of one sport. `fitOf` fits a window's curve the way the analysis reports a fit. */
function stepsOf(
  entries: readonly Entry[],
  fitOf: (values: Float64Array) => CriticalPowerFit | null,
): ThresholdStep[] {
  const steps: ThresholdStep[] = []
  const window = new WindowMax(entries.map((entry) => entry.backed))
  const standingAt = entries.flatMap((entry, i) => (entry.standing === null ? [] : [i]))
  const windowMs = THRESHOLD_WINDOW_WEEKS * WEEK_MS
  // The window's first and one-past-last entry: both only move forward as the weeks do.
  let lo = 0
  let hi = 0
  let lastFit = -1
  for (const fromMs of changeWeeks(entries)) {
    while (hi < entries.length && entries[hi]!.weekEnd <= fromMs) hi++
    while (lo < hi && entries[lo]!.weekEnd <= fromMs - windowMs) lo++
    window.pushTo(hi)
    window.popTo(lo)
    const alone = standingAt.filter((i) => i >= lo && i < hi).map((i) => entries[i]!.standing!)
    const fit = lo < hi ? fitOf(windowCurve(window, alone)) : null
    if (fit !== null) lastFit = steps.length
    let newest = hi - 1
    while (newest >= lo && !entries[newest]!.effort) newest--
    steps.push({ fromMs, fit, asOfMs: newest >= lo ? entries[newest]!.startMs : null, lastFit })
  }
  return steps
}

/**
 * Each sport's threshold over time: for every week, the fit over the efforts of the trailing
 * `THRESHOLD_WINDOW_WEEKS` weeks that end with it (see `ThresholdStep`). The points are priced as the library's
 * best curves are (the library's bike model and estimated-ride gate, each ride at its own day's body mass), so the
 * fit over a window that holds the whole library is the library's `fit`, to float noise. Each digest is priced once
 * and the window's best moves with it as the weeks pass, so the cost is the library's pricing plus a fit a week.
 */
export function thresholdTimeline(
  ordered: readonly ActivityDigest[],
  masses: Masses,
  bikeModel: BikeModel,
  todayKg: number,
  gate: EstimatedRideGate | null,
): ThresholdTimeline {
  const standing = estimatedStanding(gate)
  const pricers: Record<
    Sport,
    (digest: ActivityDigest, index: number) => { wkg: number; alone: boolean }
  > = {
    run: (digest, i) => ({ wkg: runCentralWkg(digest.curve[i]!), alone: false }),
    ride: (digest, i) => {
      const { watts, alone } = ridePriced(digest.curve[i]!, digest, masses, bikeModel, standing)
      return {
        wkg: centralWkgFromWatts(watts, masses.bodyKg(digest)),
        alone: gate !== null && alone,
      }
    },
  }
  const timelineOf = (sport: Sport): ThresholdStep[] => {
    const entries = ordered
      .filter((digest) => digest.sport === sport && effortsCount(digest))
      .map((digest) => entryOf(digest, pricers[sport]))
    const minWPrime = wPrimeFloor(sport, todayKg)
    return stepsOf(entries, (values) => criticalPowerOutcome(fitCurve(values), { minWPrime }).fit)
  }
  return { run: timelineOf('run'), ride: timelineOf('ride') }
}
