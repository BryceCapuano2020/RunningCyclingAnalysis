import { CP_FIT_MAX_S, CP_FIT_MIN_S, PRIORS, RESTING_W_PER_KG } from '@rca/core/constants'
import { metabolicToRidePower } from '@rca/core/metabolic'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { isEstimatedRecord, paceFigure, powerFigure } from './records'
import type { Figure } from './records'

/** Whether a ride's fit draws on an effort in its window whose watts are estimated, from virtual power. */
export function fitRestsOnEstimate(result: AnalysisResult): boolean {
  const byId = new Map(result.activities.map((activity) => [activity.id, activity]))
  return result.rideCurve.some((point) => {
    if (point.durationS < CP_FIT_MIN_S || point.durationS > CP_FIT_MAX_S) return false
    const activity = point.activityId === null ? null : (byId.get(point.activityId) ?? null)
    return isEstimatedRecord('ride', activity)
  })
}

/**
 * The range between two critical powers as a line, in the sport's own unit, read from its faster end for a run.
 * When both ends print the same, "Likely A to A" would say nothing, so it is "About A".
 */
function rangeOf(
  sport: Sport,
  lowCp: number,
  highCp: number,
  massKg: number,
  units: UnitSystem,
): string {
  const figureOf: Record<Sport, (cp: number) => Figure> = {
    run: (cp) => paceFigure(cp, units),
    ride: (cp) => powerFigure(metabolicToRidePower(cp, massKg, PRIORS.grossEfficiency.mean)),
  }
  const low = figureOf[sport](lowCp)
  const high = figureOf[sport](highCp)
  // A faster pace is the higher work rate, so a running range reads from its faster end.
  const ends: Record<Sport, [from: string, to: string]> = {
    run: [high.number, low.value],
    ride: [low.number, high.value],
  }
  if (low.number === high.number) return `About ${low.value}`
  const [from, to] = ends[sport]
  return `Likely ${from} to ${to}`
}

/**
 * The threshold's likely range as a line, in the sport's own unit, such as "Likely 22:58 to 23:49 /km" or
 * "Likely 48 to 49 W", or "About 48 W" when both ends print the same. When the
 * sport has an uneven fit, the range runs from the main threshold to the uneven one, since the bests that were
 * left out only set a floor. With the main threshold refused, its low end is that floor, the lowest bests left
 * out. Otherwise it is the standard error of the critical-power fit either side of the critical power, a rough
 * spread of the fit rather than a confidence interval. Null without a fit or a floor; when the low end is not
 * above resting metabolic rate, since a work rate that low is no estimate of a threshold; and, for a ride's
 * standard-error range only, when its fit draws on an effort whose watts are estimated.
 */
export function thresholdRange(
  result: AnalysisResult,
  sport: Sport,
  massKg: number,
  units: UnitSystem,
): string | null {
  const fit = { run: result.runCp, ride: result.rideCp }[sport]
  const uneven = { run: result.runCpUneven, ride: result.rideCpUneven }[sport]
  if (uneven) {
    const low = fit ? fit.cp : uneven.floor
    if (!(low > RESTING_W_PER_KG) || !(uneven.fit.cp > low)) return null
    return rangeOf(sport, low, uneven.fit.cp, massKg, units)
  }
  if (!fit || (sport === 'ride' && fitRestsOnEstimate(result))) return null
  if (!(fit.cp - fit.cpSe > RESTING_W_PER_KG)) return null
  return rangeOf(sport, fit.cp - fit.cpSe, fit.cp + fit.cpSe, massKg, units)
}
