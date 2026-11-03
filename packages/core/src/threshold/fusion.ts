import { FUSION_GRID, GAP_PRIOR } from './constants'

export interface Fused {
  value: number
  low: number
  high: number
}

/** A Gaussian density without its constant. */
const bell = (distance: number, sd: number) => Math.exp(-0.5 * (distance / sd) ** 2)

/** The prior of the gap g: mostly small (most riders' strongest rides are near all-out), sometimes large. */
function gapPrior(g: number): number {
  const { smallMean, largeShare, largeMax } = GAP_PRIOR
  return ((1 - largeShare) * Math.exp(-g / smallMean)) / smallMean + largeShare / largeMax
}

const GAPS = Array.from(
  { length: Math.round(GAP_PRIOR.largeMax / FUSION_GRID.gapStep) },
  (_, k) => {
    const g = k * FUSION_GRID.gapStep
    return { g, prior: gapPrior(g) }
  },
)
const STEPS = Math.round((FUSION_GRID.to - FUSION_GRID.from) / FUSION_GRID.step)

/**
 * The gap prior smeared by the power estimate's noise `powerError`, at each grid point. It depends on that error and on
 * nothing else, not the power or the heart rate, and costs about 30,000 exponentials; a few errors are kept, since the
 * floor of 2.5% is the error of most windows. Callers must not change the array.
 */
const smearedPriors = new Map<number, Float64Array>()
const SMEARED_KEPT = 16

function smearedPrior(powerError: number): Float64Array {
  const kept = smearedPriors.get(powerError)
  if (kept !== undefined) return kept
  const prior = new Float64Array(STEPS)
  for (let i = 0; i < STEPS; i++) {
    const x = FUSION_GRID.from + i * FUSION_GRID.step
    prior[i] = GAPS.reduce((total, q) => total + q.prior * bell(x - q.g, powerError), 0)
  }
  if (smearedPriors.size >= SMEARED_KEPT) smearedPriors.delete(smearedPriors.keys().next().value!)
  smearedPriors.set(powerError, prior)
  return prior
}

/** The posterior of power * (1 + x) on the grid, and its median and 10th and 90th percentiles. */
function posterior(
  power: number,
  powerError: number,
  heartRate: { value: number; relativeError: number } | null,
): Fused {
  const prior = smearedPrior(powerError)
  const grid: { value: number; weight: number }[] = []
  for (let i = 0; i < STEPS; i++) {
    const x = FUSION_GRID.from + i * FUSION_GRID.step
    const value = power * (1 + x)
    const like =
      heartRate === null
        ? 1
        : bell(value - heartRate.value, heartRate.relativeError * heartRate.value)
    grid.push({ value, weight: prior[i]! * like })
  }
  const total = grid.reduce((sum, q) => sum + q.weight, 0)
  const at = (share: number) => {
    let seen = 0
    for (const q of grid) if ((seen += q.weight) >= share * total) return q.value
    return grid[grid.length - 1]!.value
  }
  return { value: at(0.5), low: at(0.1), high: at(0.9) }
}

/**
 * The power estimate is a floor: a best is at most what the rider can do, and usually a few percent under. So the threshold is
 * the power estimate times (1 + g) with g at least 0, smeared by the power estimate's own relative error `powerError`. On a
 * grid of -15% to +45% around the power estimate that gives a posterior from power alone. Heart rate, where there is an
 * estimate, makes a second: a Gaussian likelihood around it with its own relative error. Heart rate may raise the answer and
 * never lowers it: the answer is the higher of the two medians, and the range the higher of each pair of 10th and 90th
 * percentiles, so the upper end that power alone allows stays (heart rate reads under the truth often enough that a range
 * narrowed round it missed the rider who never went all out). With no heart rate the answer is the power estimate plus about 3%.
 */
export function fuse(
  power: number,
  powerError: number,
  heartRate: { value: number; relativeError: number } | null,
): Fused {
  const alone = posterior(power, powerError, null)
  if (heartRate === null) return alone
  const lifted = posterior(power, powerError, heartRate)
  return {
    value: Math.max(alone.value, lifted.value),
    low: Math.max(alone.low, lifted.low),
    high: Math.max(alone.high, lifted.high),
  }
}
