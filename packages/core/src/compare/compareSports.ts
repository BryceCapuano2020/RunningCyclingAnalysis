import { PRIORS, RESTING_W_PER_KG } from '../constants'
import { requirePositiveFinite } from '../math'
import type { Comparison, ComparisonPoint, Curve, HrCrossCheck } from '../types'
import { calibrationWeights, drawPriors } from './sampling'
import { weightedInterval } from './weightedQuantile'

export interface CompareOptions {
  draws?: number
  seed?: number
}

const S_PRIOR = PRIORS.runEconomyScale

/**
 * Converts run and ride duration curves to gross metabolic W/kg and compares them. Efficiency and
 * running economy are drawn from their priors. When a heart-rate cross-check is available, the
 * draws are reweighted to agree with it.
 */
export function compareSports(
  runCurve: Curve,
  rideCurve: Curve,
  massKg: number,
  hr: HrCrossCheck | null,
  opts: CompareOptions = {},
): Comparison {
  requirePositiveFinite('massKg', massKg)
  if (runCurve.length !== rideCurve.length) {
    throw new Error('compareSports: run and ride curves have different lengths')
  }
  for (let i = 0; i < runCurve.length; i++) {
    if (runCurve[i]!.durationS !== rideCurve[i]!.durationS) {
      throw new Error(`compareSports: run and ride durations differ at index ${i}`)
    }
  }

  const { ge, s } = drawPriors(opts.draws ?? 4000, opts.seed ?? 1)
  const draws = ge.length
  const equal = new Float64Array(draws).fill(1)
  const calibration = calibrationWeights(ge, s, hr)
  const weights = calibration?.accepted ? calibration.weights : null

  const runM = new Float64Array(draws)
  const rideM = new Float64Array(draws)
  const ratio = new Float64Array(draws)
  const prior: ComparisonPoint[] = []
  const calibrated: ComparisonPoint[] = []

  for (let i = 0; i < runCurve.length; i++) {
    const runPoint = runCurve[i]!
    const ridePoint = rideCurve[i]!
    if (!Number.isFinite(runPoint.value) || !Number.isFinite(ridePoint.value)) continue
    for (let d = 0; d < draws; d++) {
      runM[d] = RESTING_W_PER_KG + (s[d]! / S_PRIOR.mean) * (runPoint.value - RESTING_W_PER_KG)
      rideM[d] = ridePoint.value / (ge[d]! * massKg)
      ratio[d] = runM[d]! / rideM[d]!
    }
    const summarise = (w: Float64Array): ComparisonPoint => ({
      durationS: runPoint.durationS,
      ratio: weightedInterval(ratio, w),
      runMetabolic: weightedInterval(runM, w),
      rideMetabolic: weightedInterval(rideM, w),
    })
    prior.push(summarise(equal))
    if (weights !== null) calibrated.push(summarise(weights))
  }

  return {
    prior,
    calibrated: weights === null ? null : calibrated,
    ...(calibration === null
      ? {}
      : {
          calibration: {
            effectiveSamples: calibration.effectiveSamples,
            draws: calibration.draws,
            accepted: calibration.accepted,
          },
        }),
  }
}
