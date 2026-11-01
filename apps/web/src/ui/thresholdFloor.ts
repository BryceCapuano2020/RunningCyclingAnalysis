import { PRIORS } from '@rca/core/constants'
import { metabolicToRidePower } from '@rca/core/metabolic'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Curve, Sport } from '@rca/core/types'
import { formatDuration, formatWkg } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import { hasThreshold, paceFigure, powerFigure } from './records'
import type { SportNumber } from './records'

/** A critical power as the sport's figure, the same way the threshold's own figure is made. */
const FIGURE_AT: Record<Sport, (cp: number, massKg: number, units: UnitSystem) => SportNumber> = {
  run: (cp, _massKg, units) => ({ ...paceFigure(cp, units), sub: null }),
  ride: (cp, massKg) => {
    const watts = metabolicToRidePower(cp, massKg, PRIORS.grossEfficiency.mean)
    return { ...powerFigure(watts), sub: formatWkg(watts / massKg) }
  },
}

/** A sport's best-effort curve in the fit's unit (gross metabolic W/kg), which the effort gate's floor is in. */
const FIT_CURVE: Record<Sport, (result: AnalysisResult) => Curve> = {
  run: (result) => result.runCurve,
  ride: (result) => result.rideMetabolicCurve,
}

/** The best a refused threshold stands on: how long it was held, s, and its value in the fit's unit. */
export interface ThresholdFloor {
  durationS: number
  value: number
}

/** The longest best a curve holds, or null for a curve with none. A longer best is never the faster, so it is the lowest. */
function longestBest(curve: Curve): ThresholdFloor | null {
  let longest: ThresholdFloor | null = null
  for (const { durationS, value } of curve) {
    if (Number.isFinite(value) && (longest === null || durationS > longest.durationS)) {
      longest = { durationS, value }
    }
  }
  return longest
}

/**
 * What a sport's threshold stands on when it has none: a demonstrated best, so real ability is at least this. Every
 * refusal has one (the gate protects a number by changing its label, never by blanking it). With an uneven fit, the lowest
 * of the bests it left out. Otherwise the effort gate's floor, the best 30 min where the curve has one, else the best 20.
 * A sport with no best of 20 min or longer gives its longest best. Null when the threshold is there, or the sport holds
 * no best at all.
 */
export function floorOf(result: AnalysisResult, sport: Sport): ThresholdFloor | null {
  if (hasThreshold(result, sport)) return null
  const uneven = { run: result.runCpUneven, ride: result.rideCpUneven }[sport]
  // A floor at or above the fit would leave no range above it, so it is not shown as the threshold.
  if (uneven && uneven.fit.cp > uneven.floor) {
    return { durationS: Math.max(...uneven.leftOutS), value: uneven.floor }
  }
  return result.effortGate[sport].floor ?? longestBest(FIT_CURVE[sport](result))
}

/**
 * The figure a sport shows in place of a refused threshold, as a floor: a demonstrated effort the threshold is not
 * shown below. Null when the threshold is there, or when the sport holds no best.
 */
export function floorThreshold(
  result: AnalysisResult,
  sport: Sport,
  massKg: number,
  units: UnitSystem,
): SportNumber | null {
  const floor = floorOf(result, sport)
  return floor === null ? null : FIGURE_AT[sport](floor.value, massKg, units)
}

/** The one line under a floor that says what it rests on: "From your best 30 min." Null without a floor. */
export function floorBasisLine(result: AnalysisResult, sport: Sport): string | null {
  const floor = floorOf(result, sport)
  return floor === null ? null : `From your best ${formatDuration(floor.durationS)}.`
}
