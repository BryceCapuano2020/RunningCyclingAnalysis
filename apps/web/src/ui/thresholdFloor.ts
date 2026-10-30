import { PRIORS } from '@rca/core/constants'
import { metabolicToRidePower } from '@rca/core/metabolic'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { formatWkg } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import { paceFigure, powerFigure, refusalOf, threshold } from './records'
import type { SportNumber } from './records'

/** A critical power as the sport's figure, the same way the threshold's own figure is made. */
const FIGURE_AT: Record<Sport, (cp: number, massKg: number, units: UnitSystem) => SportNumber> = {
  run: (cp, _massKg, units) => ({ ...paceFigure(cp, units), sub: null }),
  ride: (cp, massKg) => {
    const watts = metabolicToRidePower(cp, massKg, PRIORS.grossEfficiency.mean)
    return { ...powerFigure(watts), sub: formatWkg(watts / massKg) }
  },
}

/**
 * The figure a sport shows in place of a refused threshold, as a floor: a demonstrated effort the threshold is not
 * shown below. With the effort gate's refusal, the best 20 minutes (not a hard effort, so not an estimate). With
 * an uneven fit, the lowest of the bests it left out. Null when the threshold is there, or when neither sets one.
 */
export function floorThreshold(
  result: AnalysisResult,
  sport: Sport,
  massKg: number,
  units: UnitSystem,
): SportNumber | null {
  if (threshold(result, sport, massKg, units) !== null) return null
  const held = result.effortGate[sport].floor
  if (refusalOf(result, sport) === 'effort' && held !== null) {
    return FIGURE_AT[sport](held, massKg, units)
  }
  const uneven = { run: result.runCpUneven, ride: result.rideCpUneven }[sport]
  if (!uneven) return null
  // A floor at or above the fit would leave no range above it, so it is not shown as the threshold.
  if (!(uneven.fit.cp > uneven.floor)) return null
  return FIGURE_AT[sport](uneven.floor, massKg, units)
}
