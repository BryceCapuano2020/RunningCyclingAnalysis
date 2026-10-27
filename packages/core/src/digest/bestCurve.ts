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
 * allows, which is all of them unless it says otherwise.
 */
export function bestOf(
  ordered: ActivityDigest[],
  sport: Sport,
  value: (point: DigestCurvePoint) => number,
  keep: (digest: ActivityDigest) => boolean = () => true,
): EffortPoint[] {
  const digests = ordered.filter((d) => d.sport === sport && keep(d))
  return bestCurve(digests.map((d) => candidates(d, value)))
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
