import type { CurvePoint } from '../types'

/**
 * How much lower than the best value at longer durations a point must be to count as lower, as a share of
 * that value. Two efforts that are the same to float noise (a steady ERG or treadmill effort, whose window
 * means differ in the last bit) are a tie, not a drop, so the point keeps its own window.
 */
export const ENVELOPE_TIE_TOLERANCE = 1e-9

/**
 * Enforces a curve that is non-increasing within ENVELOPE_TIE_TOLERANCE: a point lower than a longer one by no more than that share is a tie and keeps its own window. Walking from the longest duration to the shortest, a point
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
    if (
      best !== null &&
      (Number.isNaN(p.value) ||
        p.value < best.value - Math.abs(best.value) * ENVELOPE_TIE_TOLERANCE)
    ) {
      out[i] = { ...best, durationS: p.durationS }
    }
    const q: P = out[i]!
    if (!Number.isNaN(q.value) && (best === null || q.value > best.value)) best = q
  }
  return out
}
