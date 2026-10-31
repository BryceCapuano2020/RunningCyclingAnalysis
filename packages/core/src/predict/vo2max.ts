import { effortsCount } from '../digest/effortTrust'
import { VO2MAX_MIN_RUNS, VO2MAX_MIN_WINDOW_S } from '../constants'
import { metabolicToFlatSpeed } from '../metabolic'
import { METRES_PER_MILE } from '../units'
import type { ActivityDigest, DigestCurvePoint, Sport } from '../types'
import { oxygenCost } from './daniels'
import { COUNTED_WEIGHT, shareWeight, weightedMedian } from './vo2maxShare'
import type { Weighted } from './vo2maxShare'

/** The sports whose pace this estimate reads: running's oxygen cost is the one Daniels gives. */
const PACED: Record<Sport, boolean> = { run: true, ride: false }

/** VO2max estimated from heart rate against pace, ml/kg/min, and how many runs it rests on. */
export interface Vo2maxEstimate {
  vo2max: number
  runs: number
  /** Runs left out because their flat-equivalent pace beat the fastest mile as run: see hillCapped. */
  hillCapped: number
}

/** A run's estimate with the weight its window's heart rate share earns, or that its window was left out by the hill cap. */
type RunEstimate = { vo2max: number; weight: number } | { capped: true }

/**
 * Swain et al. (1994): percent of maximum heart rate = 0.64 x percent of VO2max + 37, so a window's share
 * of VO2max follows from its share of the reference heart rate.
 */
function vo2maxShare(heartRateShare: number): number {
  return (heartRateShare * 100 - 37) / 64
}

/**
 * One run's estimate: from its best window of at least VO2MAX_MIN_WINDOW_S that earns the most weight for its share of
 * the reference heart rate (`shareWeight`; the longest of those that tie), the oxygen cost of its flat-equivalent pace
 * divided by the share of VO2max that heart rate implies. Null when no window earns any weight.
 */
function runEstimate(
  digest: ActivityDigest,
  referenceHr: number,
  metabolicOf: (point: DigestCurvePoint) => number,
  speedCap: number,
  weightOf: (share: number) => number,
): RunEstimate | null {
  let chosen: { durationS: number; weight: number; estimate: RunEstimate } | null = null
  for (const point of digest.curve) {
    if (point.durationS < VO2MAX_MIN_WINDOW_S || point.startIndex < 0) continue
    if (point.heartRate === null) continue
    const share = point.heartRate / referenceHr
    const weight = weightOf(share)
    if (weight === 0) continue
    const speed = metabolicToFlatSpeed(metabolicOf(point))
    if (!(speed > 0)) continue
    // A window of 10 min or more cannot be faster on the flat than the runner's fastest mile as run:
    // when its flat-equivalent pace is, the grade model has inflated it on hills, so it is left out.
    const estimate: RunEstimate =
      speed > speedCap
        ? { capped: true }
        : { vo2max: oxygenCost(speed * 60) / vo2maxShare(Math.min(share, 1)), weight }
    if (
      chosen === null ||
      weight > chosen.weight ||
      (weight === chosen.weight && point.durationS > chosen.durationS)
    ) {
      chosen = { durationS: point.durationS, weight, estimate }
    }
  }
  return chosen?.estimate ?? null
}

/**
 * The speed of the fastest mile as run, m/s, in the digests; Infinity without one, so nothing is capped. An
 * indoor run's mile is no best (see effortsCount), so it cannot lift the cap.
 */
export function fastestMileSpeed(digests: readonly ActivityDigest[]): number {
  let fastest = Infinity
  for (const digest of digests.filter(effortsCount)) {
    for (const best of digest.distanceBests ?? []) {
      if (best.distanceM === METRES_PER_MILE && best.seconds < fastest) fastest = best.seconds
    }
  }
  return Number.isFinite(fastest) ? METRES_PER_MILE / fastest : Infinity
}

/**
 * VO2max from heart rate against pace, the way a watch estimates it: one estimate from each outdoor run
 * with trusted heart rate and a hard enough window, and their median weighted by how hard the window was
 * (`shareWeight`: a ramp, so a run drifting across a share does not make the estimate jump). Null without a
 * reference heart rate, or with less than VO2MAX_MIN_RUNS runs' worth of weight.
 * Indoor pace is left out, since it can be wrong, and so is a window faster on the flat than speedCap, the
 * fastest mile as run in the digests by default.
 */
export function vo2maxFromHeartRate(
  trusted: readonly ActivityDigest[],
  referenceHr: number | null,
  metabolicOf: (point: DigestCurvePoint) => number,
  speedCap = fastestMileSpeed(trusted),
  weightOf: (share: number) => number = shareWeight,
): Vo2maxEstimate | null {
  if (referenceHr === null || !(referenceHr > 0)) return null
  const found = trusted
    .filter((digest) => PACED[digest.sport] && digest.hasHeartRate && effortsCount(digest))
    .map((digest) => runEstimate(digest, referenceHr, metabolicOf, speedCap, weightOf))
    .filter((value): value is RunEstimate => value !== null)
  const estimates: Weighted[] = found.flatMap((e) =>
    'vo2max' in e && Number.isFinite(e.vo2max) ? [{ value: e.vo2max, weight: e.weight }] : [],
  )
  const total = estimates.reduce((sum, e) => sum + e.weight, 0)
  // Two runs' worth of weight: two runs in full, or more runs each counting for part.
  if (total < VO2MAX_MIN_RUNS) return null
  return {
    vo2max: weightedMedian(estimates),
    // The runs it rests on, as the note says ("on N hard runs"): those that count for at least half.
    runs: estimates.filter((e) => e.weight >= COUNTED_WEIGHT).length,
    hillCapped: found.length - estimates.length,
  }
}
