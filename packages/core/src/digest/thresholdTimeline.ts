import {
  CP_FIT_MAX_S,
  CP_FIT_MIN_S,
  CP_FIT_REACH_TOLERANCE,
  DAY_MS,
  DURATIONS_S,
  HEADLINE_DURATION_S,
} from '../constants'
import { criticalPowerOutcome, wPrimeFloor } from '../cp'
import { ENVELOPE_TIE_TOLERANCE } from '../curves/monotoneEnvelope'
import { isHardShare } from '../effort'
import type { MaxHeartRates, ReferenceReading } from '../effort'
import type { ActivityDigest, BikeModel, CriticalPowerFit, Curve, Sport } from '../types'
import { memoByDigests } from '../digestMemo'
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
  /** Its best 20 minutes' heart rate over the sport's reference: null without a heart rate, or with it set aside. */
  share: number | null
}

/** What a window's efforts are judged by: the library's reference, what it can certify, and whose heart rate is set aside. */
export interface TimelineEffort {
  referenceHr: MaxHeartRates
  referenceReading: Record<Sport, ReferenceReading | null>
  setAside: ReadonlySet<string>
}

/** The index of the best 20 minutes among the durations. */
const HEADLINE_INDEX = DURATIONS_S.indexOf(HEADLINE_DURATION_S)

/** A digest's points priced in gross metabolic W/kg, as the library's best curves price them. */
function entryOf(
  digest: ActivityDigest,
  price: (digest: ActivityDigest, index: number) => { wkg: number; alone: boolean },
  referenceBpm: number | null,
  setAside: ReadonlySet<string>,
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
  const heartRate = setAside.has(digest.id) ? null : digest.curve[HEADLINE_INDEX]?.heartRate
  const share =
    referenceBpm !== null && referenceBpm > 0 && typeof heartRate === 'number'
      ? heartRate / referenceBpm
      : null
  return {
    weekEnd: weekEndMs(digest.startMs),
    startMs: digest.startMs,
    backed,
    standing,
    effort,
    share,
  }
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

/**
 * Whether a window's best 20 minutes was a hard effort, as the analysis's gate judges its own: the entry of the window
 * with the highest value at 20 minutes, its heart rate over the reference. A window with no heart rate there cannot
 * be judged and is not held back.
 */
function windowHard(
  entries: readonly Entry[],
  lo: number,
  hi: number,
  reading: ReferenceReading | null,
): boolean {
  let best: Entry | null = null
  for (let i = lo; i < hi; i++) {
    const entry = entries[i]!
    if (entry.backed[HEADLINE_INDEX]! > (best?.backed[HEADLINE_INDEX] ?? NONE)) best = entry
  }
  if (best === null || best.share === null || reading === null) return true
  return reading === 'trusted' && isHardShare(best.share)
}

/**
 * The steps of one sport. `fitOf` fits a window's curve the way the analysis reports a fit; a window whose best
 * 20 minutes was not hard (`windowHard`, with the sport's reference `reading`) has none, as the analysis has none.
 */
function stepsOf(
  entries: readonly Entry[],
  fitOf: (values: Float64Array) => CriticalPowerFit | null,
  reading: ReferenceReading | null,
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
    const fit =
      lo < hi && windowHard(entries, lo, hi, reading) ? fitOf(windowCurve(window, alone)) : null
    if (fit !== null) lastFit = steps.length
    let newest = hi - 1
    while (newest >= lo && !entries[newest]!.effort) newest--
    steps.push({ fromMs, fit, asOfMs: newest >= lo ? entries[newest]!.startMs : null, lastFit })
  }
  return steps
}

/** What a window's curve gives as a threshold fit, as the analysis reports a fit. */
const fitterOf = (minWPrime: number) => (values: Float64Array) =>
  criticalPowerOutcome(fitCurve(values), { minWPrime }).fit

/** A run's efforts are priced from its pace alone, and its work-capacity floor does not read mass. */
const priceRun = (digest: ActivityDigest, i: number) => ({
  wkg: runCentralWkg(digest.curve[i]!),
  alone: false,
})
const RUN_FIT = fitterOf(wPrimeFloor('run', 1))

/**
 * A run's steps, kept for the last runs asked for: they read nothing but the runs and what judges their efforts, so a
 * change of body mass, bike model or estimated-ride gate takes the steps already worked out for the same runs.
 */
const runSteps = memoByDigests(
  (runs: ActivityDigest[], effort: RunEffort) =>
    stepsOf(
      runs.map((run) => entryOf(run, priceRun, effort.referenceBpm, effort.setAside)),
      RUN_FIT,
      effort.reading,
    ),
  (a, b) =>
    a.referenceBpm === b.referenceBpm && a.reading === b.reading && sameIds(a.setAside, b.setAside),
  undefined,
  2,
)

/** What judges a run's window: the run reference, what it can certify, and whose heart rate is set aside. */
interface RunEffort {
  referenceBpm: number | null
  reading: ReferenceReading | null
  setAside: ReadonlySet<string>
}

function sameIds(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const id of a) if (!b.has(id)) return false
  return true
}

const NOT_JUDGED: TimelineEffort = {
  referenceHr: { run: null, ride: null },
  referenceReading: { run: null, ride: null },
  setAside: new Set(),
}

/**
 * Each sport's threshold over time: for every week, the fit over the efforts of the trailing
 * `THRESHOLD_WINDOW_WEEKS` weeks that end with it (see `ThresholdStep`). The points are priced as the library's best
 * curves are (the library's bike model and estimated-ride gate, each ride at its own day's body mass), so the
 * fit over a window that holds the whole library is the library's `fit`, to float noise. Each digest is priced once
 * and the window's best moves with it as the weeks pass, so the cost is the library's pricing plus a fit a week.
 * With `effort`, a window whose best 20 minutes was not a hard effort has no fit, as the analysis's has none.
 */
export function thresholdTimeline(
  ordered: readonly ActivityDigest[],
  masses: Masses,
  bikeModel: BikeModel,
  todayKg: number,
  gate: EstimatedRideGate | null,
  effort: TimelineEffort = NOT_JUDGED,
): ThresholdTimeline {
  const standing = estimatedStanding(gate)
  const priceRide = (digest: ActivityDigest, i: number) => {
    const { watts, alone } = ridePriced(digest.curve[i]!, digest, masses, bikeModel, standing)
    return {
      wkg: centralWkgFromWatts(watts, masses.bodyKg(digest)),
      alone: gate !== null && alone,
    }
  }
  const counted = (sport: Sport) =>
    ordered.filter((digest) => digest.sport === sport && effortsCount(digest))
  const { referenceHr, referenceReading, setAside } = effort
  const rides = counted('ride').map((ride) => entryOf(ride, priceRide, referenceHr.ride, setAside))
  return {
    run: runSteps(counted('run'), {
      referenceBpm: referenceHr.run,
      reading: referenceReading.run,
      setAside,
    }),
    ride: stepsOf(rides, fitterOf(wPrimeFloor('ride', todayKg)), referenceReading.ride),
  }
}
