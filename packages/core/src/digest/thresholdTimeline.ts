import {
  CP_FIT_MAX_S,
  CP_FIT_REACH_TOLERANCE,
  DAY_MS,
  DURATIONS_S,
  HEADLINE_DURATION_S,
} from '../constants'
import { criticalPowerOutcome, predictCritical, wPrimeFloor } from '../cp'
import type { MaxHeartRates } from '../effort'
import { rideThreshold } from '../threshold'
import type { ActivityDigest, BikeModel, CriticalPowerFit } from '../types'
import { memoByDigests } from '../digestMemo'
import { effortsCount } from './effortTrust'
import { estimatedStanding } from './estimatedRide'
import type { EstimatedRideGate } from './estimatedRide'
import type { Masses } from './masses'
import { ofSport } from './ordered'
import { runCentralWkg } from './rideCurves'
import { rideEffortsOf, thresholdHeartRate, thresholdInputs } from './thresholdEfforts'
import type { RideEfforts } from './thresholdEfforts'
import { NONE, WindowMax, fitCurve, windowCurve } from './thresholdWindow'
import { THRESHOLD_WINDOW_WEEKS } from './thresholdTimelineTypes'
import type { ThresholdFit, ThresholdStep, ThresholdTimeline } from './thresholdTimelineTypes'
import { weekEndFor } from '../calendar'

const WEEK_MS = 7 * DAY_MS
const DURATIONS = DURATIONS_S.length

/** Where a digest falls in the weeks, and whether it has an effort that dates the threshold of its window. */
interface Placed {
  weekEnd: number
  startMs: number
  effort: boolean
}

/**
 * One run: its points priced in gross metabolic W/kg, by duration, as the library's best curve prices them; and whether it has
 * an effort as long as a fit reaches. A duration with no value holds `NONE`.
 */
interface RunEntry extends Placed {
  values: Float64Array
}

/** One ride: what it gives the ride threshold. It has an effort when it gives any. */
interface RideEntry extends Placed {
  efforts: RideEfforts
}

/** What a window's efforts are judged by: the library's reference heart rates, and whose heart rate is set aside. */
export interface TimelineEffort {
  referenceHr: MaxHeartRates
  setAside: ReadonlySet<string>
}

/** The index of the best 20 minutes among the durations. */
const HEADLINE_INDEX = DURATIONS_S.indexOf(HEADLINE_DURATION_S)

/** A run's points priced in gross metabolic W/kg; a run is priced from its pace alone. */
function runEntryOf(digest: ActivityDigest): RunEntry {
  const values = new Float64Array(DURATIONS).fill(NONE)
  const reach = CP_FIT_MAX_S * (1 - CP_FIT_REACH_TOLERANCE)
  let effort = false
  digest.curve.forEach((point, i) => {
    const wkg = runCentralWkg(point)
    if (Number.isNaN(wkg)) return
    if (point.durationS >= reach) effort = true
    values[i] = wkg
  })
  return { weekEnd: weekEndFor(digest), startMs: digest.startMs, values, effort }
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
 * How far above what an older fit predicts for 20 minutes a window's best 20 minutes may be before that fit is outgrown:
 * 10%, twice the reach tolerance, so a point's scatter about the line never decides it.
 */
const OUTGROWN_BY = 0.1

/**
 * Whether the window's best 20 minutes is so far above what `held` predicts for 20 minutes that `held` no longer says where
 * the athlete is. A steady effort has a flat curve and no fit of its own, so without this the zones of the very activity
 * that raised the athlete's level would be cut from the older, lower fit.
 */
function outgrown(held: CriticalPowerFit, curve: Float64Array): boolean {
  const best = curve[HEADLINE_INDEX]!
  return best > NONE && best > predictCritical(held, HEADLINE_DURATION_S) * (1 + OUTGROWN_BY)
}

/**
 * How a sport reads a window of its entries. `fit` is asked for every week the threshold can change in, in order, with the
 * window's first and one-past-last entry (both only move forward) and the end of the week it ends with; `outgrown` only
 * right after a `fit` of a window with entries that gave none.
 */
interface WindowReader {
  fit(lo: number, hi: number, untilMs: number): ThresholdFit | null
  /** Whether the window's efforts have outgrown the newest earlier fit, which then stands for no window after it. */
  outgrown(): boolean
}

/**
 * The steps of one sport. A window with no fit of its own leaves the older fit to stand in for it, unless its efforts have
 * outgrown that fit (`lastFit`); `asOfMs` is the start of the newest activity of the window with an effort.
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
    else if (lo < hi && lastFit >= 0 && reader.outgrown()) lastFit = -1
    let newest = hi - 1
    while (newest >= lo && !entries[newest]!.effort) newest--
    steps.push({ fromMs, fit, asOfMs: newest >= lo ? entries[newest]!.startMs : null, lastFit })
  }
  return steps
}

/** The work-capacity floor of a run's fit does not read mass. */
const RUN_MIN_W_PRIME = wPrimeFloor('run', 1)

/**
 * The reader of the runs: the fit of the window's best curve, as the analysis reports a fit. The best of the window moves
 * with the weeks (`WindowMax`), so the cost is the pricing plus a fit a week.
 */
function runReader(entries: readonly RunEntry[]): WindowReader {
  const window = new WindowMax(entries.map((entry) => entry.values))
  let curve: Float64Array = new Float64Array(DURATIONS)
  let held: CriticalPowerFit | null = null
  return {
    fit(lo, hi) {
      window.pushTo(hi)
      window.popTo(lo)
      if (lo >= hi) return null
      curve = windowCurve(window, [])
      const fit = criticalPowerOutcome(fitCurve(curve), { minWPrime: RUN_MIN_W_PRIME }).fit
      if (fit !== null) held = fit
      return fit
    },
    outgrown() {
      const out = held !== null && outgrown(held, curve)
      if (out) held = null
      return out
    },
  }
}

/** How many standard errors a 10th to 90th percentile range spans, for a normal: 2 x 1.2816. */
const RANGE_SPAN_SE = 2.5631

/**
 * The reader of the rides: the ride threshold over the window's rides, with the same inputs the analysis gives it (each ride's
 * efforts and blocks, aged from the newest activity of any sport up to the window's end). Its standard error is the width of its
 * range read as a normal's.
 */
function rideReader(
  rides: readonly RideEntry[],
  all: readonly ActivityDigest[],
  thresholdHr: number | null,
): WindowReader {
  const ends = all.map((digest) => weekEndFor(digest))
  let seen = 0
  return {
    fit(lo, hi, untilMs) {
      while (seen < all.length && ends[seen]! <= untilMs) seen++
      if (lo >= hi || seen === 0) return null
      const { efforts, blocks } = thresholdInputs(
        rides.slice(lo, hi).map((ride) => ride.efforts),
        all[seen - 1]!.startMs,
      )
      const estimate = rideThreshold(efforts, blocks, thresholdHr)
      return estimate === null
        ? null
        : { cp: estimate.value, cpSe: (estimate.high - estimate.low) / RANGE_SPAN_SE }
    },
    // A window with rides has an estimate, so no older one is left standing for it.
    outgrown: () => false,
  }
}

/**
 * A run's steps, kept for the last runs asked for: they read nothing but the runs, so a change of body mass, bike model,
 * estimated-ride gate or heart-rate judgement takes the steps already worked out for the same runs.
 */
const runSteps = memoByDigests(
  (runs: ActivityDigest[], _input: null) => {
    const entries = runs.map(runEntryOf)
    return stepsOf(entries, runReader(entries))
  },
  () => true,
  undefined,
  2,
)

const NOT_JUDGED: TimelineEffort = {
  referenceHr: { run: null, ride: null },
  setAside: new Set(),
}

/**
 * Each sport's threshold over time: for every week, the threshold over the efforts of the trailing `THRESHOLD_WINDOW_WEEKS`
 * weeks that end with it (see `ThresholdStep`). A run's is the critical-power fit, as the analysis reports it. A ride's is the
 * ride threshold (`rideThreshold`) over the window's rides, read as the analysis reads them: priced as the library's best curves
 * are (its bike model and estimated-ride gate, each ride at its own day's body mass), with the heart rate of the rides not set
 * aside in `effort` and the threshold heart rate of its ride reference. Each ride is read once, and a week costs one estimate.
 */
export function thresholdTimeline(
  ordered: readonly ActivityDigest[],
  masses: Masses,
  bikeModel: BikeModel,
  gate: EstimatedRideGate | null,
  effort: TimelineEffort = NOT_JUDGED,
): ThresholdTimeline {
  const standing = estimatedStanding(gate)
  const all = [...ordered]
  const rides = ofSport(all, 'ride')
    .filter(effortsCount)
    .map((ride): RideEntry => {
      const efforts = rideEffortsOf(ride, masses, bikeModel, standing, effort.setAside.has(ride.id))
      return {
        weekEnd: weekEndFor(ride),
        startMs: ride.startMs,
        efforts,
        effort: efforts.efforts.length > 0,
      }
    })
  const thresholdHr = thresholdHeartRate(effort.referenceHr.ride)
  return {
    run: runSteps(ofSport(all, 'run').filter(effortsCount), null),
    ride: stepsOf(rides, rideReader(rides, all, thresholdHr)),
  }
}
