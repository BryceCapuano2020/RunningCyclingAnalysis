import { PRIORS } from '@rca/core/constants'
import { cpBand } from '@rca/core/cp'
import { metabolicToFlatSpeed, metabolicToRidePower } from '@rca/core/metabolic'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import type { ThresholdLine } from './charts/sportCurveModel'
import { runBandShare, thresholdRange } from './thresholdRange'

/** A threshold's metabolic W/kg as the sport's own number: flat speed in m/s for running, watts for cycling. */
type Native = (metabolicWkg: number, massKg: number) => number
const NATIVE: Record<Sport, Native> = {
  run: (cp) => metabolicToFlatSpeed(cp),
  ride: (cp, massKg) => metabolicToRidePower(cp, massKg, PRIORS.grossEfficiency.mean),
}

type LineOf = (result: AnalysisResult, massKg: number, units: UnitSystem) => ThresholdLine | null

/**
 * A run's threshold as the curve chart draws it: the fit's critical power in the curve's own number, the fit's range
 * (down by the regression error, up by an allowance for the effort's hardness) as a band, and the range as the page words
 * it. With an uneven fit the range runs to the uneven one, which is not a band round the line, so only its words are given.
 */
const runLine: LineOf = (result, massKg, units) => {
  const fit = result.runCp
  if (!fit) return null
  const native = NATIVE.run
  const detail = thresholdRange(result, 'run', massKg, units) ?? undefined
  const banded = detail !== undefined && !result.runCpUneven
  const band = cpBand(fit, runBandShare(result))
  return {
    value: native(fit.cp, massKg),
    low: banded ? native(band.low, massKg) : undefined,
    high: banded ? native(band.high, massKg) : undefined,
    detail,
  }
}

/**
 * A ride's threshold as the chart draws it: the estimate and its 10th to 90th percentile as the band. The line is named as
 * an estimate where the strongest effort behind it is from estimated watts.
 */
const rideLine: LineOf = (result, massKg, units) => {
  const estimate = result.rideThreshold
  if (!estimate) return null
  const native = NATIVE.ride
  return {
    value: native(estimate.value, massKg),
    low: native(estimate.low, massKg),
    high: native(estimate.high, massKg),
    detail: thresholdRange(result, 'ride', massKg, units) ?? undefined,
    estimated: estimate.efforts.strongest.estimated,
  }
}

const LINE_OF: Record<Sport, LineOf> = { run: runLine, ride: rideLine }

/**
 * The sport's threshold as the curve chart draws it, from the same number the answer's figure reads, so the line and
 * the figure agree. Null without a threshold.
 */
export function thresholdLine(
  result: AnalysisResult,
  sport: Sport,
  massKg: number,
  units: UnitSystem,
): ThresholdLine | null {
  return LINE_OF[sport](result, massKg, units)
}
