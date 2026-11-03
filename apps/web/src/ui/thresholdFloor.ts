import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { EffortGate } from '@rca/core/effort'
import type { UnevenFit } from '@rca/core/cp'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Curve, Sport } from '@rca/core/types'
import { formatDuration } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import { hasThreshold, paceFigure } from './records'
import type { SportNumber } from './records'

/**
 * What a sport shows in place of a refused threshold, or null for a sport that has none. A run's critical-power fit can be
 * refused, and then its best efforts stand in. A ride's threshold is the estimate from all its efforts, which is null only
 * with no effort of 3 min, and then there is no best to show either.
 */
const FLOOR_FOR: Record<
  Sport,
  {
    /** The sport's best-effort curve in the fit's unit (gross metabolic W/kg), which the effort gate's floor is in. */
    curve: (result: AnalysisResult) => Curve
    uneven: (result: AnalysisResult) => UnevenFit | null
    /** A critical power as the sport's figure, the same way the threshold's own figure is made. */
    figure: (cp: number, units: UnitSystem) => SportNumber
  } | null
> = {
  run: {
    curve: (result) => result.runCurve,
    uneven: (result) => result.runCpUneven,
    figure: (cp, units) => ({ ...paceFigure(cp, units), sub: null }),
  },
  ride: null,
}

/**
 * The best a refused threshold stands on: how long it was held, s, and its value in the fit's unit. `atLeast` is
 * whether it was held for 20 min or longer, which a threshold sits at or above; a shorter best is faster than a
 * threshold, so it is a best and not a floor.
 */
export interface ThresholdFloor {
  durationS: number
  value: number
  atLeast: boolean
}

/** The shortest best shown as a number in a threshold's place, s: under 5 min it says too little of a threshold. */
const BEST_MIN_S = 300

/**
 * The longest best a curve holds, which is its lowest since a longer best is never the faster. A best of 20 min or
 * longer is a floor; one of 5 to 19 min is a plain best; null for a curve with none, or none of 5 min.
 */
function longestBest(curve: Curve): ThresholdFloor | null {
  let longest: { durationS: number; value: number } | null = null
  for (const { durationS, value } of curve) {
    if (Number.isFinite(value) && (longest === null || durationS > longest.durationS)) {
      longest = { durationS, value }
    }
  }
  if (longest === null || longest.durationS < BEST_MIN_S) return null
  return { ...longest, atLeast: longest.durationS >= HEADLINE_DURATION_S }
}

/**
 * The floor of a sport whose gate says its best 20 min was not hard, or null otherwise. Such a best can sit above a
 * threshold, so the floor is this one, the best 30 min where the curve has one, and a range starts from it.
 */
export function gatedFloor(result: AnalysisResult, sport: Sport): EffortGate['floor'] {
  const gate = result.effortGate[sport]
  return gate.verdict === 'notHard' ? gate.floor : null
}

/**
 * What a sport's threshold stands on when it has none, so a refusal changes the label and never blanks the number. With
 * an uneven fit and a best 20 min not shown easy, the lowest of the bests it left out. Otherwise the effort gate's floor,
 * the best 30 min where the curve has one, else the best 20: real ability is at least this. A sport with no best of 20 min
 * or longer gives its longest best of 5 min or more, as a best. Null when the threshold is there, the sport holds no
 * best of 5 min, or the sport has no floor (a ride's threshold is not refused for its efforts).
 */
export function floorOf(result: AnalysisResult, sport: Sport): ThresholdFloor | null {
  const source = FLOOR_FOR[sport]
  if (source === null || hasThreshold(result, sport)) return null
  const uneven = source.uneven(result)
  // A floor at or above the fit would leave no range above it, so it is not shown as the threshold.
  if (gatedFloor(result, sport) === null && uneven && uneven.fit.cp > uneven.floor) {
    return { durationS: Math.max(...uneven.leftOutS), value: uneven.floor, atLeast: true }
  }
  const held = result.effortGate[sport].floor
  return held === null ? longestBest(source.curve(result)) : { ...held, atLeast: true }
}

/**
 * The figure a sport shows in place of a refused threshold: a floor, or a best too short to be one. Null when the
 * threshold is there, or when the sport holds no best to show.
 */
export function floorThreshold(
  result: AnalysisResult,
  sport: Sport,
  _massKg: number,
  units: UnitSystem,
): SportNumber | null {
  const floor = floorOf(result, sport)
  const source = FLOOR_FOR[sport]
  return floor === null || source === null ? null : source.figure(floor.value, units)
}

/** The one line under a floor that says what it rests on: "From your best 30 min." Null for a best, and without a figure. */
export function floorBasisLine(result: AnalysisResult, sport: Sport): string | null {
  const floor = floorOf(result, sport)
  return floor === null || !floor.atLeast
    ? null
    : `From your best ${formatDuration(floor.durationS)}.`
}

/**
 * The label over a best too short to be a floor, "Best 12 min", in place of "At least": it is plainly the best, not
 * a bound on the threshold. Null for a floor, and without a figure.
 */
export function bestLabel(result: AnalysisResult, sport: Sport): string | null {
  const floor = floorOf(result, sport)
  return floor === null || floor.atLeast ? null : `Best ${formatDuration(floor.durationS)}`
}
