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

/** A range's two ends in reading order, the last with its unit, or one figure when both ends print the same. */
type Ends = { from: string; to: string } | { only: string }

/** The span between two thresholds in the sport's own unit, read from its faster end for a run. */
function endsOf(
  sport: Sport,
  lowCp: number,
  highCp: number,
  massKg: number,
  units: UnitSystem,
): Ends {
  const figureOf: Record<Sport, (cp: number) => Figure> = {
    run: (cp) => paceFigure(cp, units),
    ride: (cp) => powerFigure(ridePowerOfWkg(cp, massKg)),
  }
  const low = figureOf[sport](lowCp)
  const high = figureOf[sport](highCp)
  if (low.number === high.number) return { only: low.value }
  // A faster pace is the higher work rate, so a running range reads from its faster end.
  return sport === 'run'
    ? { from: high.number, to: low.value }
    : { from: low.number, to: high.value }
}

/** The ends of a sport's estimate, or null without one. */
function estimateEnds(
  result: AnalysisResult,
  sport: Sport,
  massKg: number,
  units: UnitSystem,
): Ends | null {
  const estimate = thresholdEstimate(result, sport)
  return estimate === null ? null : endsOf(sport, estimate.low, estimate.high, massKg, units)
}

/** The span alone, as a detail panel's value: "291–343 W", or the one figure. Null without an estimate. */
export function thresholdSpan(
  result: AnalysisResult,
  sport: Sport,
  massKg: number,
  units: UnitSystem,
): string | null {
  const ends = estimateEnds(result, sport, massKg, units)
  if (ends === null) return null
  return 'only' in ends ? ends.only : `${ends.from}\u2013${ends.to}`
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
  const ends = estimateEnds(result, sport, massKg, units)
  if (ends === null) return null
  return 'only' in ends ? `About ${ends.only}` : `${RANGE} ${ends.from} to ${ends.to}`
}
