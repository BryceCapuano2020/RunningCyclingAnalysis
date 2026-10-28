import type { Curve, CurvePoint } from '@rca/core/types'

/** Efforts shorter than a minute are too short to chart as a curve. */
export const MIN_DURATION_S = 60

export interface DurationRow {
  durationS: number
  /** The point of each curve at this duration, in the order the curves were given; undefined where a curve has none. */
  points: (CurvePoint | undefined)[]
}

/**
 * One row per duration of at least a minute that any of the curves has, shortest first. Each row
 * carries every curve's point at that duration, so one chart can read several curves together.
 */
export function durationRows(curves: Curve[]): DurationRow[] {
  const indexes = curves.map(
    (curve) => new Map(curve.map((point) => [point.durationS, point] as const)),
  )
  const durations = new Set(indexes.flatMap((index) => [...index.keys()]))
  return [...durations]
    .filter((durationS) => durationS >= MIN_DURATION_S)
    .sort((a, b) => a - b)
    .map((durationS) => ({
      durationS,
      points: indexes.map((index) => index.get(durationS)),
    }))
}
