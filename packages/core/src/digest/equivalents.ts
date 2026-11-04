import { PRIORS } from '../constants'
import { metabolicToRidePower } from '../metabolic'
import type { ThresholdEstimate } from '../threshold'
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

/**
 * The ride threshold as a flat running speed, m/s, the pace the same hour of riding costs a runner: the estimate through the
 * ride equivalence (`equivalence`, the one `equivalentsOf` reads, so the heart-rate weights are the same). `p50` is the
 * estimate's, `p05` its low through the equivalence's 5th percentile and `p95` its high through the 95th, so the ends carry both
 * what the efforts leave open and what the efficiency priors leave open. The threshold is in gross metabolic W/kg at the prior-mean
 * efficiency; it is priced at massKg, today's, which cancels in the equivalence. Null without a threshold.
 */
export function thresholdRunSpeed(
  equivalence: (ridePowerW: number, massKg: number) => Interval,
  threshold: ThresholdEstimate | null,
  massKg: number,
): Interval | null {
  if (threshold === null) return null
  const through = (wkg: number) =>
    equivalence(metabolicToRidePower(wkg, massKg, PRIORS.grossEfficiency.mean), massKg)
  return {
    p05: through(threshold.low).p05,
    p50: through(threshold.value).p50,
    p95: through(threshold.high).p95,
  }
}
