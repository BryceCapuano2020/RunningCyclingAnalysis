import { ridePowerOfWkg } from '@rca/core/display'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { paceFigure, powerFigure } from './records'
import type { Figure } from './records'
import { thresholdEstimate } from './thresholdEstimate'

/**
 * What the line calls its two ends: the estimate's own range, its 10th and 90th percentiles, which hold how loosely the
 * efforts pin the threshold down and how far heart rate could lift it. It is said in words, never drawn as a shape beside the
 * figure. It is not called an 80% range: it held the true threshold for more athletes than that in the simulations.
 */
const RANGE = 'Range'

/**
 * The span between two thresholds as a line, in the sport's own unit, read from its faster end for a run.
 * When both ends print the same, "Range A to A" would say nothing, so it is "About A".
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
    ride: (cp) => powerFigure(ridePowerOfWkg(cp, massKg)),
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
  return `${RANGE} ${from} to ${to}`
}

/**
 * The threshold's range as a line, in the sport's own unit, such as "Range 22:58 to 23:49 /km" or "Range 48 to 49 W", or
 * "About 48 W" when both ends print the same. It is the estimate's own low and high, for a run as for a ride. Null without an
 * estimate.
 */
export function thresholdRange(
  result: AnalysisResult,
  sport: Sport,
  massKg: number,
  units: UnitSystem,
): string | null {
  const estimate = thresholdEstimate(result, sport)
  return estimate === null ? null : rangeOf(sport, estimate.low, estimate.high, massKg, units)
}
