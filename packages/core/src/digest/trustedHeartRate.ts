import type { EffortPoint, MaxHeartRates } from '../effort'
import { referenceMaxHeartRates } from '../effort'
import { worstSetAside } from '../hr'
import type { ActivityDigest, CriticalPowerFit, DigestCurvePoint, Sport } from '../types'

/** The heart rate an analysis uses, once the activities whose heart rate cannot be right are set aside. */
export interface TrustedHeartRate {
  /** Ids of the activities whose heart rate is set aside. */
  setAside: Set<string>
  /** The digests whose heart rate is used, in the order given. */
  trusted: ActivityDigest[]
  /** Highest sustained heart rate of the trusted digests, bpm; null without any. */
  maxHr: number | null
  observedMax: Record<Sport, number | null>
  reference: MaxHeartRates
}

/** Highest sustained heart rate of the digests, bpm; null when none recorded heart rate. */
export function maxHeartRateOf(digests: ActivityDigest[]): number | null {
  let best: number | null = null
  for (const digest of digests) {
    const value = digest.maxHeartRate
    if (value !== null && (best === null || value > best)) best = value
  }
  return best
}

function referencesOf(digests: ActivityDigest[]) {
  const maxOf = (sport: Sport) => maxHeartRateOf(digests.filter((d) => d.sport === sport))
  const observedMax = { run: maxOf('run'), ride: maxOf('ride') }
  return { observedMax, reference: referenceMaxHeartRates(observedMax.run, observedMax.ride) }
}

/**
 * Sets aside the heart rate of activities whose best efforts show readings a working sensor would
 * not, judged against each sport's threshold (its unchecked fit) and its reference heart rate. A
 * set-aside activity's own readings could have raised a reference and so the floor others are judged
 * by, so the worst is set aside first and the references are retaken from the rest before the next
 * is judged. The set only grows, so it settles, and the references reported are those it was judged
 * by last. valueOf prices a curve point in the fit's unit.
 *
 * With `given`, the set-aside was judged elsewhere, over a larger set of activities, and is used as it is
 * for those of `ordered` it names. The references reported are then these activities' own, taken from the
 * ones not named, and are not the references the set-aside was judged by (`HeartRateJudgement` has those).
 */
export function trustedHeartRate(
  ordered: ActivityDigest[],
  fits: Record<Sport, CriticalPowerFit | null>,
  valueOf: (digest: ActivityDigest, point: DigestCurvePoint) => number,
  given?: ReadonlySet<string>,
): TrustedHeartRate {
  if (given !== undefined) {
    const trusted = ordered.filter((digest) => !given.has(digest.id))
    const setAside = new Set(ordered.filter((d) => given.has(d.id)).map((d) => d.id))
    return { setAside, trusted, maxHr: maxHeartRateOf(trusted), ...referencesOf(trusted) }
  }
  const threshold = { run: fits.run?.cp ?? null, ride: fits.ride?.cp ?? null }
  const setAside = new Set<string>()
  let trusted = ordered
  for (;;) {
    const referenceHr = referencesOf(trusted).reference
    const worst = worstSetAside(trusted, { threshold, referenceHr, valueOf })
    if (worst === null) break
    setAside.add(worst)
    trusted = trusted.filter((digest) => digest.id !== worst)
  }
  return { setAside, trusted, maxHr: maxHeartRateOf(trusted), ...referencesOf(trusted) }
}

/** A best curve with no heart rate on the points of activities whose heart rate is set aside. */
export function withoutSetAside(curve: EffortPoint[], setAside: Set<string>): EffortPoint[] {
  if (setAside.size === 0) return curve
  return curve.map((point) =>
    point.activityId !== null && setAside.has(point.activityId)
      ? { ...point, heartRate: null }
      : point,
  )
}
