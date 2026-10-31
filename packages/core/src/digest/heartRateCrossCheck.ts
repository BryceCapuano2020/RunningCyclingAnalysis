import { DAY_MS } from '../constants'
import { crossCheck } from '../hr'
import type {
  ActivityDigest,
  BikeModel,
  CriticalPowerFit,
  HrCrossCheck,
  HrPoint,
  Sport,
} from '../types'
import type { Masses } from './masses'
import { heartRatePoints } from './rideCurves'

/**
 * Heart-rate points at or below critical power. Heart rate is only regressed where it still rises
 * with power. Without a fit, every point is kept.
 */
export function atOrBelowCriticalPower(points: HrPoint[], cp: CriticalPowerFit | null): HrPoint[] {
  if (cp === null) return points
  return points.filter((p) => p.metabolicPower <= cp.cp)
}

/**
 * Days either side of the days both sports were done that a sport's blocks still count: eight weeks, a training block,
 * so that one sport starting a few days after the other does not cut the other's first runs, but a sport done for years
 * before the other began is compared only over the stretch the two share.
 */
export const MATCH_SLACK_DAYS = 56

/** Activities of each sport the shared stretch has to hold before a ratio is read from it: fewer is one day's weather. */
export const MIN_MATCHED_ACTIVITIES = 3

/**
 * The days both sports were done in: each sport's first to last day (by the activity each point is from, and only the
 * points the caller passes, which are those at or below the sport's critical power), widened by MATCH_SLACK_DAYS each
 * side, and the stretch the two share. Null when the sports were done too far apart to share one.
 */
export function matchedSpan(
  run: readonly HrPoint[],
  ride: readonly HrPoint[],
  startOf: ReadonlyMap<string, number>,
): { fromMs: number; toMs: number } | null {
  const slack = MATCH_SLACK_DAYS * DAY_MS
  const span = (points: readonly HrPoint[]) => {
    let from = Number.POSITIVE_INFINITY
    let to = Number.NEGATIVE_INFINITY
    for (const { activityId } of points) {
      const at = startOf.get(activityId)
      if (at === undefined) continue
      if (at < from) from = at
      if (at > to) to = at
    }
    return { from: from - slack, to: to + slack }
  }
  const a = span(run)
  const b = span(ride)
  const fromMs = Math.max(a.from, b.from)
  const toMs = Math.min(a.to, b.to)
  return fromMs <= toMs ? { fromMs, toMs } : null
}

/**
 * The run-versus-ride heart-rate check of these trusted digests: the heart rate of each sport's blocks
 * against its metabolic power, kept to the blocks at or below that sport's critical power (the unchecked
 * fit, so a threshold refused for display leaves the check as it was). The analysis of a period takes it
 * over the period's digests; the library's judgement takes it over every visible one, which is the
 * calibration every period's equivalents and comparison read.
 *
 * The slopes and their points are every block, but the ratio of the two (`kappa`) and its error are read from the
 * blocks of the days both sports were done in (`matchedSpan`): a sport trained for years before the other
 * began would otherwise be compared with its own different state, not with the other sport. With no day in
 * common, or fewer than MIN_MATCHED_ACTIVITIES activities of either sport in it, there is no ratio.
 */
export function heartRateCrossCheck(
  trusted: ActivityDigest[],
  masses: Masses,
  bikeModel: BikeModel,
  fits: Record<Sport, CriticalPowerFit | null>,
): HrCrossCheck {
  const { runPoints, ridePoints } = heartRatePoints(trusted, masses, bikeModel)
  const run = atOrBelowCriticalPower(runPoints, fits.run)
  const ride = atOrBelowCriticalPower(ridePoints, fits.ride)
  const whole = crossCheck(run, ride)
  if (whole.kappa === null) return whole
  const startOf = new Map(trusted.map((digest) => [digest.id, digest.startMs]))
  const span = matchedSpan(run, ride, startOf)
  if (span === null) return { ...whole, kappa: null, lnKappaSe: null }
  const inSpan = (point: HrPoint) => {
    const at = startOf.get(point.activityId)
    return at !== undefined && at >= span.fromMs && at <= span.toMs
  }
  const runMatched = run.filter(inSpan)
  const rideMatched = ride.filter(inSpan)
  const activities = (points: HrPoint[]) => new Set(points.map((point) => point.activityId)).size
  if (
    activities(runMatched) < MIN_MATCHED_ACTIVITIES ||
    activities(rideMatched) < MIN_MATCHED_ACTIVITIES
  ) {
    return { ...whole, kappa: null, lnKappaSe: null }
  }
  if (runMatched.length === run.length && rideMatched.length === ride.length) return whole
  const matched = crossCheck(runMatched, rideMatched)
  return { ...whole, kappa: matched.kappa, lnKappaSe: matched.lnKappaSe }
}
