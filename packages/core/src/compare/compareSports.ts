import { PRIORS, RESTING_W_PER_KG } from '../constants'
import { mulberry32, truncatedNormal } from '../math'
import type { Comparison, ComparisonPoint, Curve, HrCrossCheck } from '../types'
import { weightedInterval } from './weightedQuantile'

export interface CompareOptions {
  draws?: number
  seed?: number
}

const GE_PRIOR = PRIORS.grossEfficiency
const S_PRIOR = PRIORS.runEconomyScale

function drawPriors(draws: number, seed: number): { ge: Float64Array; s: Float64Array } {
  const rand = mulberry32(seed)
  const ge = new Float64Array(draws)
  const s = new Float64Array(draws)
  for (let d = 0; d < draws; d++) {
    ge[d] = truncatedNormal(rand, GE_PRIOR.mean, GE_PRIOR.sd, GE_PRIOR.min, GE_PRIOR.max)
    s[d] = truncatedNormal(rand, S_PRIOR.mean, S_PRIOR.sd, S_PRIOR.min, S_PRIOR.max)
  }
  return { ge, s }
}

/** Importance weight of each prior draw given the heart-rate estimate of kappa. */
function importanceWeights(
  ge: Float64Array,
  s: Float64Array,
  kappa: number,
  lnKappaSe: number,
): Float64Array {
  const w = new Float64Array(ge.length)
  const lnKappa = Math.log(kappa)
  for (let d = 0; d < ge.length; d++) {
    const kappaDraw = GE_PRIOR.mean / ge[d]! / (s[d]! / S_PRIOR.mean)
    const z = (lnKappa - Math.log(kappaDraw)) / lnKappaSe
    w[d] = Math.exp(-0.5 * z * z)
  }
  return w
}

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
  const kappa = hr?.kappa ?? null
  const lnKappaSe = hr?.lnKappaSe ?? null
  const weights =
    kappa === null || lnKappaSe === null ? null : importanceWeights(ge, s, kappa, lnKappaSe)

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

  return { prior, calibrated: weights === null ? null : calibrated }
}
