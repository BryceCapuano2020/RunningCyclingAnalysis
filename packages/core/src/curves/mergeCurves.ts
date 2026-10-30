import { ENVELOPE_TIE_TOLERANCE } from './monotoneEnvelope'
import type { CurvePoint } from '../types'

/** Whether a point's value is a longer window's, copied down by an activity's own envelope. */
function isCarried(point: CurvePoint): boolean {
  return !Number.isNaN(point.value) && point.windowS != null && point.windowS > point.durationS
}

/**
 * Whether a candidate displaces the best so far; neither value is NaN. A higher value does, except that where
 * the two are the same to float noise the one measured over its own length beats one carried down from a longer
 * window, and a tie otherwise keeps the earlier. `mergeCurves` and the best of many digests (`bestOfEach`) both
 * decide by this, so a curve built point by point is the one the merge of whole curves makes.
 */
export function displaces(
  value: number,
  carried: boolean,
  bestValue: number,
  bestCarried: boolean,
): boolean {
  if (tied(value, bestValue) && carried !== bestCarried) return bestCarried
  return value > bestValue
}

/** Whether two values are the same to float noise, by the envelope's own tolerance. */
function tied(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * ENVELOPE_TIE_TOLERANCE
}

/**
 * Pointwise best across curves that share the same durations in the same order. A NaN value
 * loses to any non-NaN value; ties keep the earlier curve, except that where two values are the same to
 * float noise, the one measured over its own length (`windowS` equal to `durationS`) beats one carried
 * down from a longer window, so a measured effort is never replaced by a copy of another's. The winning
 * point is copied whole, so extra fields it carries come along.
 */
export function mergeCurves<P extends CurvePoint>(curves: P[][]): P[] {
  const [first, ...rest] = curves
  if (first === undefined) return []
  const durations = first.map((p) => p.durationS)
  for (const curve of rest) {
    if (curve.length !== durations.length || curve.some((p, i) => p.durationS !== durations[i])) {
      throw new Error('mergeCurves: all curves must have the same durations in the same order')
    }
  }
  return first.map((point, i) => {
    let best = point
    for (const curve of rest) {
      const candidate = curve[i]!
      if (Number.isNaN(candidate.value)) continue
      if (Number.isNaN(best.value)) best = candidate
      else if (displaces(candidate.value, isCarried(candidate), best.value, isCarried(best))) {
        best = candidate
      }
    }
    return Object.assign({}, best)
  })
}
