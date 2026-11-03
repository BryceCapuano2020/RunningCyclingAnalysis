import { PRIORS, RESTING_W_PER_KG } from '@rca/core/constants'
import { cpBand } from '@rca/core/cp'
import { metabolicToRidePower } from '@rca/core/metabolic'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { paceFigure, powerFigure } from './records'
import type { Figure } from './records'
import { gatedFloor } from './thresholdFloor'

/**
 * The share of the reference that sets the allowance of a run fit's band: the judged effort's, where the gate judged it hard.
 * Where it could not judge (no heart rate, too few days) the share it worked out, if any, says nothing of how hard the effort
 * was, so the band takes the allowance of an effort at the hard line. A ride's range is its estimate's own and has none.
 */
export function runBandShare(result: AnalysisResult): number | null {
  const gate = result.effortGate.run
  return gate.verdict === 'hard' ? gate.share : null
}

/**
 * What the line calls its two ends: a range, whether it is a ride estimate's own, a run fit's standard error (how loosely
 * the fit was pinned down) or the uneven case, where the ends are two thresholds, the main one (or, with that refused, the
 * floor the held bests set) and a second fitted without the uneven bests. The page tells them apart by how a run's range is
 * drawn (the fit's is the lighter track), not by a second word.
 */
const RANGE = 'Range'

/**
 * The span between two critical powers as a line, in the sport's own unit, read from its faster end for a run.
 * When both ends print the same, "Range A to A" would say nothing, so it is "About A".
 */
function rangeOf(
  sport: Sport,
  lowCp: number,
  highCp: number,
  massKg: number,
  units: UnitSystem,
  label: string,
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
  return `${label} ${from} to ${to}`
}

/** A run threshold's range as numbers: the critical power at each end and at the centre, for a drawing. */
interface RangeCps {
  low: number
  centre: number
  high: number
  /** True for the fit's standard-error spread either side of the threshold; false for the run to an uneven fit. */
  spread: boolean
}

/**
 * The critical powers a run's threshold range spans, or null where it has none. When the run has an uneven
 * fit, the range runs from the main threshold to the uneven one, since the bests that were left out only
 * set a floor. With the main threshold refused, its low end is that floor, the lowest bests left out, or the gate's
 * floor where the gate says the best 20 min was not hard.
 * Otherwise it is the fit's band (`cpBand`): down by the regression error, up by an allowance for how hard the effort
 * behind the fit was, a rough spread of the fit rather than a confidence interval. Null without a fit or a floor, and
 * when the low end is not above resting metabolic rate, since a work rate that low is no estimate of a threshold.
 */
function runRange(result: AnalysisResult): RangeCps | null {
  const fit = result.runCp
  const uneven = result.runCpUneven
  if (uneven) {
    const low = fit ? fit.cp : (gatedFloor(result, 'run')?.value ?? uneven.floor)
    if (!(low > RESTING_W_PER_KG) || !(uneven.fit.cp > low)) return null
    return { low, centre: low, high: uneven.fit.cp, spread: false }
  }
  if (!fit) return null
  const { low, high } = cpBand(fit, runBandShare(result))
  if (!(low > RESTING_W_PER_KG)) return null
  return { low, centre: fit.cp, high, spread: true }
}

/** The two ends a sport's range is said between, in the fit's unit. */
interface Ends {
  low: number
  high: number
}

/**
 * A ride's range is its estimate's own low and high, which already hold how loosely the efforts pin the threshold down and how
 * far heart rate could lift it. It is said in words, never drawn as a fit's spread. Null without an estimate.
 */
function rideEnds(result: AnalysisResult): Ends | null {
  const estimate = result.rideThreshold
  return estimate ? { low: estimate.low, high: estimate.high } : null
}

const ENDS_OF: Record<Sport, (result: AnalysisResult) => Ends | null> = {
  run: runRange,
  ride: rideEnds,
}

/**
 * The range a sport draws as a track beside its figure. A run's fit does. A ride's is said in words one tap down, so its
 * figure stands alone.
 */
const SPAN_OF: Record<Sport, (result: AnalysisResult) => RangeCps | null> = {
  run: runRange,
  ride: () => null,
}

/**
 * The threshold's range as a line, in the sport's own unit, such as "Range 22:58 to 23:49 /km" or
 * "Range 48 to 49 W", or "About 48 W" when both ends print the same. What the range is, and when it is left
 * out, is `runRange` for a run and the estimate's own for a ride.
 */
export function thresholdRange(
  result: AnalysisResult,
  sport: Sport,
  massKg: number,
  units: UnitSystem,
): string | null {
  const ends = ENDS_OF[sport](result)
  return ends === null ? null : rangeOf(sport, ends.low, ends.high, massKg, units, RANGE)
}

/**
 * A run threshold's range as a track to draw: its two ends in reading order, each with the figure printed
 * there and the critical power it sits at, and where the threshold itself sits between them. A running
 * range reads from its faster end, so its first end is the higher critical power. Null where the range is, and for a ride.
 */
export interface ThresholdSpan {
  ends: [first: { text: string; cp: number }, second: { text: string; cp: number }]
  /** The threshold's critical power, between the two ends. */
  centreCp: number
  /**
   * Whether the range is the fit's standard-error spread, a rough spread of the fit and not a confidence
   * interval, so a drawing keeps it lighter than a 90% range.
   */
  spread: boolean
}

export function thresholdSpan(
  result: AnalysisResult,
  sport: Sport,
  massKg: number,
  units: UnitSystem,
): ThresholdSpan | null {
  const cps = SPAN_OF[sport](result)
  if (cps === null) return null
  const figure = (cp: number) =>
    ({
      run: paceFigure(cp, units),
      ride: powerFigure(metabolicToRidePower(cp, massKg, PRIORS.grossEfficiency.mean)),
    })[sport]
  const low = { text: figure(cps.low).number, cp: cps.low }
  const high = { text: figure(cps.high).number, cp: cps.high }
  // A faster pace is the higher work rate, so a running range reads from its faster end.
  const ends = { run: [high, low], ride: [low, high] } as const
  return { ends: [...ends[sport]], centreCp: cps.centre, spread: cps.spread }
}
