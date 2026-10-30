import { PRIORS } from '../constants'
import { mulberry32, truncatedNormal } from '../math'
import type { HrCalibration } from '../types'

/** The draws kept: the default count and seed an analysis uses, and a few others. */
const DRAWS_KEPT = 4
const kept = new Map<string, { ge: Float64Array; s: Float64Array }>()

/**
 * Shared draws keep comparison and equivalent pace on the same assumptions and seed. They are a function of the count
 * and seed alone, so the last few are kept and shared: callers read them and never change them.
 */
export function drawPriors(draws: number, seed: number) {
  if (!Number.isInteger(draws) || draws < 1) throw new Error('draws must be a positive integer')
  const key = `${draws}|${seed}`
  const found = kept.get(key)
  if (found !== undefined) return found
  const made = newDraws(draws, seed)
  kept.set(key, made)
  if (kept.size > DRAWS_KEPT) kept.delete(kept.keys().next().value!)
  return made
}

function newDraws(draws: number, seed: number) {
  const rand = mulberry32(seed)
  const ge = new Float64Array(draws)
  const s = new Float64Array(draws)
  const efficiency = PRIORS.grossEfficiency
  const economy = PRIORS.runEconomyScale
  for (let i = 0; i < draws; i++) {
    ge[i] = truncatedNormal(rand, efficiency.mean, efficiency.sd, efficiency.min, efficiency.max)
    s[i] = truncatedNormal(rand, economy.mean, economy.sd, economy.min, economy.max)
  }
  return { ge, s }
}

/**
 * Stabilise in log space, then reject a cross-check supported by too few prior draws. ESS is a
 * numerical diagnostic, not evidence that the physiological assumptions are correct.
 */
export function calibrationWeights(ge: Float64Array, s: Float64Array, hr: HrCalibration | null) {
  if (hr?.kappa == null || hr.lnKappaSe === null) return null
  const { kappa, lnKappaSe } = hr
  const weights = new Float64Array(ge.length)
  if (!(kappa > 0 && Number.isFinite(kappa) && lnKappaSe > 0 && Number.isFinite(lnKappaSe))) {
    return { weights, effectiveSamples: 0, draws: ge.length, accepted: false }
  }
  let maxLogWeight = -Infinity
  for (let i = 0; i < ge.length; i++) {
    const kappaDraw = PRIORS.grossEfficiency.mean / ge[i]! / (s[i]! / PRIORS.runEconomyScale.mean)
    const z = (Math.log(kappa) - Math.log(kappaDraw)) / lnKappaSe
    weights[i] = -0.5 * z * z
    maxLogWeight = Math.max(maxLogWeight, weights[i]!)
  }
  let sum = 0
  let sumSquares = 0
  for (let i = 0; i < weights.length; i++) {
    const weight = Number.isFinite(maxLogWeight) ? Math.exp(weights[i]! - maxLogWeight) : 0
    weights[i] = weight
    sum += weight
    sumSquares += weight * weight
  }
  const effectiveSamples = sumSquares > 0 ? (sum * sum) / sumSquares : 0
  // At least 20 draws and 1% of the simulation must support an adjusted interval.
  const accepted = effectiveSamples >= Math.max(20, 0.01 * ge.length)
  return { weights, effectiveSamples, draws: ge.length, accepted }
}
