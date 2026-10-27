import { PRIORS } from '@rca/core/constants'
import { metabolicToRidePower } from '@rca/core/metabolic'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { formatWkg } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import { paceFigure, powerFigure, threshold } from './records'
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
 * The figure a sport shows in place of a refused threshold, when its uneven fit set a floor: the lowest of the
 * bests left out, a demonstrated effort the threshold is not shown below. Null when the threshold is there, or when
 * no uneven fit set one.
 */
export function floorThreshold(
  result: AnalysisResult,
  sport: Sport,
  massKg: number,
  units: UnitSystem,
): SportNumber | null {
  const uneven = { run: result.runCpUneven, ride: result.rideCpUneven }[sport]
  if (!uneven || threshold(result, sport, massKg, units) !== null) return null
  return FIGURE_AT[sport](uneven.floor, massKg, units)
}
