import type { CurvePoint } from '../types'

/**
 * Pointwise best across curves that share the same durations in the same order. A NaN value
 * loses to any non-NaN value; ties keep the earlier curve. The winning point is copied whole, so
 * extra fields it carries come along.
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
      if (
        !Number.isNaN(candidate.value) &&
        (Number.isNaN(best.value) || candidate.value > best.value)
      ) {
        best = candidate
      }
    }
    return { ...best }
  })
}
