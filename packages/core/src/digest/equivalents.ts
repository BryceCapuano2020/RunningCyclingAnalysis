import type { Curve, Interval } from '../types'

export interface Equivalence {
  durationS: number
  /**
   * Best mechanical power held for durationS, W: the ride's own watts, from the same ride as rideCurve.
   * With dated body masses that ride is the best power-to-weight one.
   */
  ridePowerW: number
  /** Flat running speed with the same gross metabolic power, m/s. */
  runSpeed: Interval
}

/**
 * The running equivalent of the ride's best at each of these durations. `equivalence` is built once for the heart-rate
 * model (`equivalenceFor`), so each power costs one pass over its draws. A ride is priced at the body mass it rode at,
 * which is massKg without dated masses. The analysis and the history both read a ride's equivalent through here.
 */
export function equivalentsOf(
  equivalence: (ridePowerW: number, massKg: number) => Interval,
  rideCurve: Curve,
  bodyKgById: ReadonlyMap<string, number>,
  massKg: number,
  durations: readonly number[],
): Equivalence[] {
  const equivalents: Equivalence[] = []
  for (const durationS of durations) {
    const point = rideCurve.find((p) => p.durationS === durationS)
    if (point && Number.isFinite(point.value)) {
      const rideKg = bodyKgById.get(point.activityId ?? '') ?? massKg
      equivalents.push({
        durationS,
        ridePowerW: point.value,
        runSpeed: equivalence(point.value, rideKg),
      })
    }
  }
  return equivalents
}
