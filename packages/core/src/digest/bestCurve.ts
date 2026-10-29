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
  if (aloneFor === undefined) return bestCurve(digests.map((d) => candidates(d, valueFor(d))))
  const split = digests.map((d) => {
    const found = candidates(d, valueFor(d))
    const alone = aloneFor(d)
    const flags = d.curve.map(alone)
    return {
      backed: found.map((p, i) => (flags[i] ? unfound(p) : p)),
      standing: found.map((p, i) => (flags[i] ? p : unfound(p))),
    }
  })
  const curve = bestCurve(split.map((d) => d.backed))
  // Ascending, so a standing point is held to the finished curve at the nearest shorter duration with a value: the
  // curve stays non-increasing, and an estimate never reads higher than a shorter effort. Each candidate is held to it
  // before the best is taken, so a lower one stands when a higher one cannot.
  let shorter = Number.POSITIVE_INFINITY
  return curve.map((point, i) => {
    let placed = point
    for (const { standing } of split) {
      const alone = standing[i]!
      if (alone.value <= shorter && !(alone.value <= placed.value)) placed = alone
    }
    if (!Number.isNaN(placed.value)) shorter = placed.value
    return placed
  })
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
