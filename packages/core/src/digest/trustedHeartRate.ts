import type { EffortPoint, MaxHeartRates } from '../effort'
import { referenceMaxHeartRates } from '../effort'
import { lowForPowerSetAside, worstSetAside } from '../hr'
import type { ActivityDigest, CriticalPowerFit, DigestCurvePoint, Sport } from '../types'
import { memoByDigests } from '../digestMemo'
import { newestHeartRateMs, referenceMaxOf } from './referenceMax'
import type { ReferenceMax } from './referenceMax'

/** How many answers the references keep for one first activity: the steps of a set-aside iteration. */
const REFERENCES_KEPT = 16

/** The heart rate an analysis uses, once the activities whose heart rate cannot be right are set aside. */
export interface TrustedHeartRate {
  /** Ids of the activities whose heart rate is set aside. */
  setAside: Set<string>
  /** The digests whose heart rate is used, in the order given. */
  trusted: ActivityDigest[]
  /** The maximum heart rate of the trusted digests (see `referenceMaxOf`), bpm; null without any. */
  maxHr: number | null
  /** Each sport's own maximum, bpm: the highest value reached on several separate days. Null without one. */
  observedMax: Record<Sport, number | null>
  /** What each sport's maximum rests on: how many days reached it, and since when. */
  observedSource: Record<Sport, ReferenceMax | null>
  reference: MaxHeartRates
}

interface References {
  observedMax: Record<Sport, number | null>
  observedSource: Record<Sport, ReferenceMax | null>
  maxHr: number | null
  reference: MaxHeartRates
}

function computeReferences(digests: ActivityDigest[]): References {
  const endMs = newestHeartRateMs(digests)
  const maxOf = (sport: Sport) =>
    referenceMaxOf(
      digests.filter((d) => d.sport === sport),
      endMs,
    )
  const observedSource = { run: maxOf('run'), ride: maxOf('ride') }
  const observedMax = {
    run: observedSource.run?.bpm ?? null,
    ride: observedSource.ride?.bpm ?? null,
  }
  return {
    observedMax,
    observedSource,
    maxHr: referenceMaxOf(digests, endMs)?.bpm ?? null,
    reference: referenceMaxHeartRates(observedMax.run, observedMax.ride),
  }
}

/** A copy a caller may change without changing what is kept. */
function copyOfReferences(found: References): References {
  return {
    observedMax: { ...found.observedMax },
    observedSource: { ...found.observedSource },
    maxHr: found.maxHr,
    reference: { ...found.reference },
  }
}

/**
 * The maxima of the digests: the sports' own, what each rests on, and the references the cross-sport rule makes of
 * them. All are taken over the same trailing window, which ends at the newest heart rate among the digests. They read
 * only the digests, so a change of body mass or settings takes the answer kept for the same activities, as does each
 * step of the set-aside iteration that has been taken before.
 */
const memoReferences = memoByDigests(
  (digests: ActivityDigest[], _input: null) => computeReferences(digests),
  () => true,
  copyOfReferences,
  REFERENCES_KEPT,
)
const referencesOf = (digests: ActivityDigest[]): References => memoReferences(digests, null)

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
 * `combine` replaces them with the judgement's (`CombineOptions.references`), so a period reports the library's.
 *
 * `lowForPower` is the first set-aside when the caller has already judged it, over the digests whose power it
 * trusts; absent, it is judged over `ordered`.
 */
export function trustedHeartRate(
  ordered: ActivityDigest[],
  fits: Record<Sport, CriticalPowerFit | null>,
  valueOf: (digest: ActivityDigest, point: DigestCurvePoint) => number,
  given?: ReadonlySet<string>,
  lowForPower?: ReadonlySet<string>,
): TrustedHeartRate {
  if (given !== undefined) {
    const trusted = ordered.filter((digest) => !given.has(digest.id))
    const setAside = new Set(ordered.filter((d) => given.has(d.id)).map((d) => d.id))
    return { setAside, trusted, ...referencesOf(trusted) }
  }
  const threshold = { run: fits.run?.cp ?? null, ride: fits.ride?.cp ?? null }
  // Heart rate that reads low for the power across a whole activity is set aside first, so the references and the
  // thresholds' share are taken without it.
  const setAside = new Set(lowForPower ?? lowForPowerSetAside(ordered))
  let trusted = ordered.filter((digest) => !setAside.has(digest.id))
  for (;;) {
    const referenceHr = referencesOf(trusted).reference
    const worst = worstSetAside(trusted, { threshold, referenceHr, valueOf })
    if (worst === null) break
    setAside.add(worst)
    trusted = trusted.filter((digest) => digest.id !== worst)
  }
  return { setAside, trusted, ...referencesOf(trusted) }
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
