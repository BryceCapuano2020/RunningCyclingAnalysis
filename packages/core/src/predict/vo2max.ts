import { VO2MAX_MIN_HR_SHARE, VO2MAX_MIN_RUNS, VO2MAX_MIN_WINDOW_S } from '../constants'
import { quantile } from '../math'
import { metabolicToFlatSpeed } from '../metabolic'
import { METRES_PER_MILE } from '../units'
import type { ActivityDigest, DigestCurvePoint, Sport } from '../types'
import { oxygenCost } from './daniels'

/** The sports whose pace this estimate reads: running's oxygen cost is the one Daniels gives. */
const PACED: Record<Sport, boolean> = { run: true, ride: false }

/** VO2max estimated from heart rate against pace, ml/kg/min, and how many runs it rests on. */
export interface Vo2maxEstimate {
  vo2max: number
  runs: number
  /** Runs left out because their flat-equivalent pace beat the fastest mile as run: see hillCapped. */
  hillCapped: number
}

/** A run's estimate, or that its window was left out by the hill cap. */
type RunEstimate = { vo2max: number } | { capped: true }

/**
 * Swain et al. (1994): percent of maximum heart rate = 0.64 x percent of VO2max + 37, so a window's share
 * of VO2max follows from its share of the reference heart rate.
 */
function vo2maxShare(heartRateShare: number): number {
  return (heartRateShare * 100 - 37) / 64
}

/**
 * One run's estimate: from its longest best window of at least VO2MAX_MIN_WINDOW_S held at or above
 * VO2MAX_MIN_HR_SHARE of the reference heart rate, the oxygen cost of its flat-equivalent pace divided
 * by the share of VO2max that heart rate implies. Null when no window qualifies.
 */
function runEstimate(
  digest: ActivityDigest,
  referenceHr: number,
  metabolicOf: (point: DigestCurvePoint) => number,
  speedCap: number,
): RunEstimate | null {
  let chosen: { durationS: number; estimate: RunEstimate } | null = null
  for (const point of digest.curve) {
    if (point.durationS < VO2MAX_MIN_WINDOW_S || point.startIndex < 0) continue
    if (point.heartRate === null) continue
    const share = point.heartRate / referenceHr
    if (share < VO2MAX_MIN_HR_SHARE) continue
    const speed = metabolicToFlatSpeed(metabolicOf(point))
    if (!(speed > 0)) continue
    // A window of 10 min or more cannot be faster on the flat than the runner's fastest mile as run:
    // when its flat-equivalent pace is, the grade model has inflated it on hills, so it is left out.
    const estimate: RunEstimate =
      speed > speedCap
        ? { capped: true }
        : { vo2max: oxygenCost(speed * 60) / vo2maxShare(Math.min(share, 1)) }
    if (chosen === null || point.durationS > chosen.durationS) {
      chosen = { durationS: point.durationS, estimate }
    }
  }
  return chosen?.estimate ?? null
}

/** The speed of the fastest mile as run, m/s, in the digests; Infinity without one, so nothing is capped. */
export function fastestMileSpeed(digests: readonly ActivityDigest[]): number {
  let fastest = Infinity
  for (const digest of digests) {
    for (const best of digest.distanceBests ?? []) {
      if (best.distanceM === METRES_PER_MILE && best.seconds < fastest) fastest = best.seconds
    }
  }
  return Number.isFinite(fastest) ? METRES_PER_MILE / fastest : Infinity
}

/**
 * VO2max from heart rate against pace, the way a watch estimates it: one estimate from each outdoor run
 * with trusted heart rate and a hard enough window, and their median. Null without a reference heart
 * rate or with fewer than VO2MAX_MIN_RUNS such runs. Treadmill pace is left out, since it can be wrong, and
 * so is a window faster on the flat than speedCap, the fastest mile as run in the digests by default.
 */
export function vo2maxFromHeartRate(
  trusted: readonly ActivityDigest[],
  referenceHr: number | null,
  metabolicOf: (point: DigestCurvePoint) => number,
  speedCap = fastestMileSpeed(trusted),
): Vo2maxEstimate | null {
  if (referenceHr === null || !(referenceHr > 0)) return null
  const found = trusted
    .filter((digest) => PACED[digest.sport] && digest.hasHeartRate && !digest.indoor)
    .map((digest) => runEstimate(digest, referenceHr, metabolicOf, speedCap))
    .filter((value): value is RunEstimate => value !== null)
  const estimates = found.flatMap((e) =>
    'vo2max' in e && Number.isFinite(e.vo2max) ? [e.vo2max] : [],
  )
  if (estimates.length < VO2MAX_MIN_RUNS) return null
  return {
    vo2max: quantile(estimates, 0.5),
    runs: estimates.length,
    hillCapped: found.length - estimates.length,
  }
}
