import { PROFILE_MEASUREMENT_ERROR } from './constants'

/** A matrix whose pivot is this small, against its largest entry, is singular. */
const SINGULAR = 1e-10

/** The inverse of a small square matrix by Gauss-Jordan elimination, or null when it is singular. */
function invert(matrix: readonly (readonly number[])[]): number[][] | null {
  const n = matrix.length
  const a = matrix.map((row, i) => [...row, ...row.map((_, j) => (i === j ? 1 : 0))])
  const scale = Math.max(...matrix.flat().map(Math.abs))
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r
    }
    if (!(Math.abs(a[pivot]![col]!) > SINGULAR * scale)) return null
    ;[a[col], a[pivot]] = [a[pivot]!, a[col]!]
    const lead = a[col]![col]!
    a[col] = a[col]!.map((x) => x / lead)
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const factor = a[r]![col]!
      a[r] = a[r]!.map((x, c) => x - factor * a[col]![c]!)
    }
  }
  return a.map((row) => row.slice(n))
}

export interface PredictionSd {
  /** The standard deviation, on the log scale, of a new best at a duration. */
  at: (durationS: number) => number
  /** Degrees of freedom of the fit's residual: its points less its parameters. */
  df: number
}

/**
 * How far a new best at a duration may sit from a fitted curve, on the log scale: the prediction error of
 * a nonlinear least-squares fit, `s * sqrt(1 + j' (J'J)^-1 j)`. J holds the gradient of the curve's log at
 * each fitted duration, and j is that gradient at the duration asked about, so a duration beyond the fitted
 * ones, or one the curve is sensitive to, has a wider spread than one amid them. s is the fit's own
 * residual spread, but never below the 3% a power meter errs by: a fit through few points can match them
 * closely by chance, and the meter's error is in every best.
 *
 * Null when the fit has no degree of freedom left. A curve whose parameters cannot be told apart has an
 * infinite spread, so nothing is said to stand out against it.
 */
export function predictionSd(
  gradient: (durationS: number) => number[],
  durations: ArrayLike<number>,
  sse: number,
): PredictionSd | null {
  const rows = Array.from(durations, (t) => gradient(t))
  const parameters = rows[0]?.length ?? 0
  const df = durations.length - parameters
  if (df < 1) return null
  const s = Math.max(Math.sqrt(sse / df), PROFILE_MEASUREMENT_ERROR)
  const normal = Array.from({ length: parameters }, (_, i) =>
    Array.from({ length: parameters }, (__, j) =>
      rows.reduce((sum, row) => sum + row[i]! * row[j]!, 0),
    ),
  )
  const inverse = invert(normal)
  if (inverse === null) return { at: () => Infinity, df }
  return {
    at: (durationS) => {
      const g = gradient(durationS)
      const leverage = g.reduce(
        (sum, gi, i) => sum + gi * g.reduce((inner, gj, j) => inner + inverse[i]![j]! * gj, 0),
        0,
      )
      return s * Math.sqrt(1 + Math.max(0, leverage))
    },
    df,
  }
}
