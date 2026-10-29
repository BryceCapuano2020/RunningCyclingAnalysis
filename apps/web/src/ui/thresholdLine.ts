import { PRIORS } from '@rca/core/constants'
import { metabolicToFlatSpeed, metabolicToRidePower } from '@rca/core/metabolic'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import type { ThresholdLine } from './charts/sportCurveModel'
import { fitRestsOnEstimate, thresholdRange } from './thresholdRange'

/** A fit's metabolic W/kg as the sport's own number: flat speed in m/s for running, watts for cycling. */
type Native = (metabolicWkg: number, massKg: number) => number
const NATIVE: Record<Sport, Native> = {
  run: (cp) => metabolicToFlatSpeed(cp),
  ride: (cp, massKg) => metabolicToRidePower(cp, massKg, PRIORS.grossEfficiency.mean),
}

/** Whether a sport's fit rests on estimated values: a ride's, when it draws on virtual power; a run's never does. */
const RESTS_ON_ESTIMATE: Record<Sport, (result: AnalysisResult) => boolean> = {
  run: () => false,
  ride: fitRestsOnEstimate,
}

/**
 * The sport's threshold as the curve chart draws it: the fit's critical power in the curve's own number, the
 * standard-error range as a band, and the range as the page words it. The same fit the answer's figure reads,
 * so the line and the figure agree. Null without a fit. With an uneven fit the range runs to the uneven one,
 * which is not a band round the line, so only its words are given.
 */
export function thresholdLine(
  result: AnalysisResult,
  sport: Sport,
  massKg: number,
  units: UnitSystem,
): ThresholdLine | null {
  const fit = { run: result.runCp, ride: result.rideCp }[sport]
  if (!fit) return null
  const native = NATIVE[sport]
  const detail = thresholdRange(result, sport, massKg, units) ?? undefined
  const uneven = { run: result.runCpUneven, ride: result.rideCpUneven }[sport]
  const banded = detail !== undefined && !uneven
  return {
    value: native(fit.cp, massKg),
    low: banded ? native(fit.cp - fit.cpSe, massKg) : undefined,
    high: banded ? native(fit.cp + fit.cpSe, massKg) : undefined,
    detail,
    estimated: RESTS_ON_ESTIMATE[sport](result),
  }
}
