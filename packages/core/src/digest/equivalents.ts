import type { Sex } from '../grade/ageGrade'
import type { ThresholdEstimate } from '../threshold'
import type { Curve, Interval } from '../types'
import { rideRunSpeed } from './rideAnchor'

export interface Equivalence {
  durationS: number
  /**
   * Best mechanical power held for durationS, W: the ride's own watts, from the same ride as rideCurve.
   * With dated body masses that ride is the best power-to-weight one.
   */
  ridePowerW: number
  /** Flat running speed of the run that is the same share of the running world-class hour, m/s (`rideRunSpeed`). */
  runSpeed: Interval
}

/**
 * The running equivalent of the ride's best at each of these durations (`equivalenceFor`, anchored at each sport's world
 * class). A ride is priced at the body mass it rode at, which is massKg without dated masses. The analysis and the history
 * both read a ride's equivalent through here.
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

/**
 * The ride threshold as a flat running speed, m/s, the pace the same hour of riding costs a runner: the estimate through the
 * anchored ride equivalence (`rideRunSpeed`). `p50` is the estimate's; `p05` and `p95` are its low and high widened by the anchor's
 * own spread in quadrature on the log scale, so they carry both what the efforts leave open and what the anchor does. The
 * threshold is in gross metabolic W/kg at the prior-mean efficiency, which the anchor factor expects, so body mass does not enter.
 * Null without a threshold.
 */
export function thresholdRunSpeed(
  threshold: ThresholdEstimate | null,
  sex: Sex | null | undefined,
): Interval | null {
  return threshold === null ? null : rideRunSpeed(threshold, sex)
}
