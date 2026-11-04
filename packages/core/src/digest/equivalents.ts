import { EQUIVALENCE_DURATIONS_S, PROFILE_DURATIONS_S } from '../constants'
import { flatSpeedOfWkg } from '../display/conversions'
import type { Sex } from '../grade/ageGrade'
import type { ThresholdEstimate } from '../threshold'
import { endAtFiveNinetyFive } from '../threshold/coverage'
import type { Curve, Interval, Sport } from '../types'
import { equivalenceFor, rideRunSpeed } from './rideAnchor'

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

/** What the profile durations are priced from: the result's own equivalents, its ride curve and the mass on each activity's date. */
export interface ProfilePricing {
  equivalents: readonly Equivalence[]
  rideCurve: Curve
  activities: readonly { id: string; massKg?: number }[]
}

/**
 * The ride's running equivalents at the profile durations a combine does not price (`PROFILE_DURATIONS_S` beyond
 * `EQUIVALENCE_DURATIONS_S`), from the ride curve's best at each, for the grade by duration. They are priced by the equivalence
 * the result's own equivalents were (`equivalenceFor`, anchored at each sport's world class for the athlete's sex), at the body
 * mass the ride was ridden at (`massKg` without dated masses). A duration the result already holds, or the curve has no best at,
 * has none.
 */
export function profileEquivalents(
  result: ProfilePricing,
  massKg: number,
  sex: Sex | null | undefined,
): Equivalence[] {
  const held = new Set(result.equivalents.map((equivalent) => equivalent.durationS))
  const bodyKgById = new Map(
    result.activities.flatMap((activity) =>
      activity.massKg === undefined ? [] : [[activity.id, activity.massKg] as const],
    ),
  )
  const durations = PROFILE_DURATIONS_S.filter(
    (durationS) => !EQUIVALENCE_DURATIONS_S.includes(durationS) && !held.has(durationS),
  )
  return durations.length === 0
    ? []
    : equivalentsOf(equivalenceFor(sex), result.rideCurve, bodyKgById, massKg, durations)
}

/**
 * The ride threshold as a flat running speed, m/s, the pace the same hour of riding costs a runner: the estimate through the
 * anchored ride equivalence (`rideRunSpeed`). `p50` is the estimate's; `p05` and `p95` are its low and high (10th and 90th
 * percentiles, scaled to the 5th and 95th) widened by the anchor's own spread in quadrature on the log scale, so they carry both
 * what the efforts leave open and what the anchor does. The
 * threshold is in gross metabolic W/kg at the prior-mean efficiency, which the anchor factor expects, so body mass does not enter.
 * Null without a threshold.
 */
export function thresholdRunSpeed(
  threshold: ThresholdEstimate | null,
  sex: Sex | null | undefined,
): Interval | null {
  return threshold === null ? null : rideRunSpeed(threshold, sex)
}

/**
 * A run threshold as the flat running speed it stands for, with its range: its pace, and its `low` and `high` (10th and 90th
 * percentiles) moved out to the 5th and 95th on the log scale of energy (`endAtFiveNinetyFive`), so it has the coverage of a
 * ride's, which the anchor's spread makes a 5th to 95th range. Null without a threshold.
 */
export function runThresholdSpeed(threshold: ThresholdEstimate | null): Interval | null {
  if (threshold === null) return null
  return {
    p05: flatSpeedOfWkg(endAtFiveNinetyFive(threshold.value, threshold.low)),
    p50: flatSpeedOfWkg(threshold.value),
    p95: flatSpeedOfWkg(endAtFiveNinetyFive(threshold.value, threshold.high)),
  }
}

/** Each sport's threshold as a flat running speed: a run's own pace, and a ride's anchored running equivalent for the athlete's sex. */
const SPEED_OF_THRESHOLD: Record<
  Sport,
  (threshold: ThresholdEstimate | null, sex: Sex | null | undefined) => Interval | null
> = {
  run: (threshold) => runThresholdSpeed(threshold),
  ride: thresholdRunSpeed,
}

/**
 * The flat running speed a sport's threshold stands for, with its range. The one reading the standing (`sportStanding`) and the
 * years (`standingOfYears`) share, so a year's threshold and a period's are graded from the same speed.
 */
export function thresholdSpeedOf(
  sport: Sport,
  threshold: ThresholdEstimate | null,
  sex: Sex | null | undefined,
): Interval | null {
  return SPEED_OF_THRESHOLD[sport](threshold, sex)
}
