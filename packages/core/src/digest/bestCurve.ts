import { DURATIONS_S } from '../constants'
import { mergeCurves, monotoneEnvelope } from '../curves'
import type { EffortPoint } from '../effort'
import type { ActivityDigest, Curve, DigestCurvePoint } from '../types'

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

export function plainCurve(points: EffortPoint[]): Curve {
  return points.map(({ durationS, value, activityId, startIndex, windowS }) => ({
    durationS,
    value,
    activityId,
    startIndex,
    windowS,
  }))
}
