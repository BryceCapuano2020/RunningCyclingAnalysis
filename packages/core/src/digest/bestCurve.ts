import { DURATIONS_S } from '../constants'
import { mergeCurves, monotoneEnvelope } from '../curves'
import type { EffortPoint } from '../effort'
import type { ActivityDigest, Curve, DigestCurvePoint, Sport } from '../types'

/** One activity's curve points, with values already in the units of the combined curve. */
export function candidates(
  digest: ActivityDigest,
  valueOf: (point: DigestCurvePoint) => number,
): EffortPoint[] {
  return digest.curve.map((p) => {
    const value = valueOf(p)
    // A value of NaN is not found. That includes a run point the world-record ceiling dropped: the
    // monotone envelope may still refill its duration from a longer effort of the same activity, which
    // is a demonstrated effort.
    const found = !Number.isNaN(value)
    return {
      durationS: p.durationS,
      value,
      activityId: found ? digest.id : null,
      startIndex: found ? p.startIndex : -1,
      windowS: found ? p.windowS : null,
      heartRate: found ? p.heartRate : null,
    }
  })
}

/** A point as candidates gives it when nothing is found there. */
function unfound(point: EffortPoint): EffortPoint {
  return {
    durationS: point.durationS,
    value: Number.NaN,
    activityId: null,
    startIndex: -1,
    windowS: null,
    heartRate: null,
  }
}

function emptyCurve(): EffortPoint[] {
  return DURATIONS_S.map((durationS) => ({
    durationS,
    value: NaN,
    activityId: null,
    startIndex: -1,
    windowS: null,
    heartRate: null,
  }))
}

/** Pointwise best across activities, then the monotone envelope. Empty when there are none. */
export function bestCurve(curves: EffortPoint[][]): EffortPoint[] {
  return curves.length > 0 ? monotoneEnvelope(mergeCurves(curves)) : emptyCurve()
}

/** Whether a digest's watts came from a power meter, so they are a measurement and not a model's output. */
export const isMeasured = (digest: ActivityDigest): boolean => digest.powerSource === 'measured'

/**
 * One digest's points ready to be merged into a best curve: the points that count at every duration, and, apart from
 * them, the points that stand at their own duration only (see `bestOfEach`). Made once per digest, so many windows over
 * the same digests (the threshold over time) each merge without pricing a point again.
 */
export interface PreparedBest {
  backed: EffortPoint[]
  /** The digest's standing points in place and the rest unfound; null when none stands alone. */
  standing: EffortPoint[] | null
}

/** A digest's points priced by `valueFor`, with any that `aloneFor` says stand alone set apart. */
export function prepareBest(
  digest: ActivityDigest,
  valueFor: (digest: ActivityDigest) => (point: DigestCurvePoint) => number,
  aloneFor?: (digest: ActivityDigest) => (point: DigestCurvePoint) => boolean,
): PreparedBest {
  const points = candidates(digest, valueFor(digest))
  if (aloneFor === undefined) return { backed: points, standing: null }
  const flags = digest.curve.map(aloneFor(digest))
  // Only a digest with a point that stands alone is split, so the common case costs one pass more than none.
  if (!flags.includes(true)) return { backed: points, standing: null }
  return {
    backed: points.map((p, i) => (flags[i] ? unfound(p) : p)),
    standing: points.map((p, i) => (flags[i] ? p : unfound(p))),
  }
}

/**
 * The best curve of prepared digests: the pointwise best of what counts at every duration, then the monotone
 * envelope, and the standing points placed on the finished curve where they beat what is there. Ascending, so a
 * standing point is held to the finished curve at the nearest shorter duration with a value: the curve stays
 * non-increasing, and an estimate never reads higher than a shorter effort. Each candidate is held to it before the
 * best is taken, so a lower one stands when a higher one cannot.
 */
export function bestOfPrepared(prepared: readonly PreparedBest[]): EffortPoint[] {
  const curve = bestCurve(prepared.map((p) => p.backed))
  const standing = prepared.flatMap((p) => (p.standing === null ? [] : [p.standing]))
  if (standing.length === 0) return curve
  let shorter = Number.POSITIVE_INFINITY
  return curve.map((point, i) => {
    let placed = point
    for (const points of standing) {
      const alone = points[i]!
      if (alone.value <= shorter && !(alone.value <= placed.value)) placed = alone
    }
    if (!Number.isNaN(placed.value)) shorter = placed.value
    return placed
  })
}

/**
 * One sport's best curve, read in that sport's own number from the digests of that sport that `keep`
 * allows, which is all of them unless it says otherwise. `valueFor` gives the reading for one digest,
 * so a number that depends on the activity, such as its body mass, is looked up once per activity.
 *
 * `aloneFor` names the points of a digest that stand at their own duration only: they are left out of the
 * monotone envelope, so they never fill a shorter duration, and are placed on the finished curve where they
 * beat what is there. An estimated ride point with no heart rate to back it is one (see ESTIMATED_RIDE).
 */
export function bestOfEach(
  ordered: ActivityDigest[],
  sport: Sport,
  valueFor: (digest: ActivityDigest) => (point: DigestCurvePoint) => number,
  keep: (digest: ActivityDigest) => boolean = () => true,
  aloneFor?: (digest: ActivityDigest) => (point: DigestCurvePoint) => boolean,
): EffortPoint[] {
  const digests = ordered.filter((d) => d.sport === sport && keep(d))
  return bestOfPrepared(digests.map((d) => prepareBest(d, valueFor, aloneFor)))
}

/** bestOf for a reading that is the same for every activity. */
export function bestOf(
  ordered: ActivityDigest[],
  sport: Sport,
  value: (point: DigestCurvePoint) => number,
  keep: (digest: ActivityDigest) => boolean = () => true,
): EffortPoint[] {
  return bestOfEach(ordered, sport, () => value, keep)
}

export function plainCurve(points: EffortPoint[]): Curve {
  return points.map(({ durationS, value, activityId, startIndex, windowS }) => ({
    durationS,
    value,
    activityId,
    startIndex,
    windowS,
  }))
}
