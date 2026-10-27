import { CP_FIT_MAX_S, CP_FIT_MIN_S, PRIORS, RESTING_W_PER_KG } from '@rca/core/constants'
import { metabolicToRidePower } from '@rca/core/metabolic'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { isEstimatedRecord, paceFigure, powerFigure } from './records'
import type { Figure } from './records'

/** Whether a ride's fit draws on an effort in its window whose watts are estimated, from virtual power. */
function fitRestsOnEstimate(result: AnalysisResult): boolean {
  const byId = new Map(result.activities.map((activity) => [activity.id, activity]))
  return result.rideCurve.some((point) => {
    if (point.durationS < CP_FIT_MIN_S || point.durationS > CP_FIT_MAX_S) return false
    const activity = point.activityId === null ? null : (byId.get(point.activityId) ?? null)
    return isEstimatedRecord('ride', activity)
  })
}

/**
 * The threshold's likely range: the standard error of its critical-power fit either side of the critical power,
 * in the sport's own unit, such as "22:58 to 23:49 /km" or "48 to 49 W". Null without a fit; when the low end is
 * not above resting metabolic rate, since a work rate that low is no estimate of a threshold; and for a ride
 * whose fit draws on an effort with estimated watts.
 */
export function thresholdRange(
  result: AnalysisResult,
  sport: Sport,
  massKg: number,
  units: UnitSystem,
): string | null {
  const fit = sport === 'run' ? result.runCp : result.rideCp
  if (!fit || (sport === 'ride' && fitRestsOnEstimate(result))) return null
  if (!(fit.cp - fit.cpSe > RESTING_W_PER_KG)) return null
  const at = (cp: number): Figure =>
    sport === 'run'
      ? paceFigure(cp, units)
      : powerFigure(metabolicToRidePower(cp, massKg, PRIORS.grossEfficiency.mean))
  const low = at(fit.cp - fit.cpSe)
  const high = at(fit.cp + fit.cpSe)
  // A faster pace is the higher work rate, so a running range reads from its faster end.
  return sport === 'run' ? `${high.number} to ${low.value}` : `${low.number} to ${high.value}`
}
