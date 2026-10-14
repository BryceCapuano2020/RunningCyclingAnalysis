import type { Curve, CurvePoint } from '../types'

/**
 * Enforces a non-increasing curve. Walking from the longest duration to the shortest, a point
 * whose value is NaN or below the best value seen at longer durations takes that longer point's
 * value, activityId and startIndex (its own durationS is kept). Returns a new array.
 */
export function monotoneEnvelope(curve: Curve): Curve {
  const out: Curve = curve.map((p) => ({ ...p }))
  const longestFirst = out.map((_, i) => i).sort((a, b) => out[b]!.durationS - out[a]!.durationS)
  let best: CurvePoint | null = null
  for (const i of longestFirst) {
    const p = out[i]!
    if (best !== null && (Number.isNaN(p.value) || p.value < best.value)) {
      out[i] = { ...p, value: best.value, activityId: best.activityId, startIndex: best.startIndex }
    }
    const q: CurvePoint = out[i]!
    if (!Number.isNaN(q.value) && (best === null || q.value > best.value)) best = q
  }
  return out
}
