import type { CurvePoint } from '../types'

/**
 * Enforces a non-increasing curve. Walking from the longest duration to the shortest, a point
 * whose value is NaN or below the best value seen at longer durations takes every field of that
 * longer point (value, activityId, startIndex and any window fields), keeping its own durationS.
 * Returns a new array.
 */
export function monotoneEnvelope<P extends CurvePoint>(curve: P[]): P[] {
  const out: P[] = curve.map((p) => ({ ...p }))
  const longestFirst = out.map((_, i) => i).sort((a, b) => out[b]!.durationS - out[a]!.durationS)
  let best: P | null = null
  for (const i of longestFirst) {
    const p = out[i]!
    if (best !== null && (Number.isNaN(p.value) || p.value < best.value)) {
      out[i] = { ...best, durationS: p.durationS }
    }
    const q: P = out[i]!
    if (!Number.isNaN(q.value) && (best === null || q.value > best.value)) best = q
  }
  return out
}
