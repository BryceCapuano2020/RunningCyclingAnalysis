import type { EffortPoint, MaxHeartRates } from '../effort'
import { referenceMaxHeartRates } from '../effort'
import { heartRateSetAside } from '../hr'
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

/** The most rounds of setting aside and retaking the references before the judgement is kept. */
const MAX_ROUNDS = 4

/**
 * Sets aside the heart rate of activities whose best efforts show readings a working sensor would
 * not, judged against each sport's threshold (its unchecked fit) and its reference heart rate.
 * A set-aside activity's own readings could have raised a reference and so the floor others are
 * judged by, so the references are retaken from the trusted digests and the judgement repeated
 * until it settles. valueOf prices a curve point in the fit's unit.
 */
export function trustedHeartRate(
  ordered: ActivityDigest[],
  fits: Record<Sport, CriticalPowerFit | null>,
  valueOf: (digest: ActivityDigest, point: DigestCurvePoint) => number,
): TrustedHeartRate {
  const threshold = { run: fits.run?.cp ?? null, ride: fits.ride?.cp ?? null }
  let trusted = ordered
  let setAside = new Set<string>()
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const next = heartRateSetAside(ordered, {
      threshold,
      referenceHr: referencesOf(trusted).reference,
      valueOf,
    })
    const settled = next.size === setAside.size && [...next].every((id) => setAside.has(id))
    setAside = next
    trusted = ordered.filter((digest) => !setAside.has(digest.id))
    if (settled) break
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
