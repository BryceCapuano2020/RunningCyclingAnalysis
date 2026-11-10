import { FUSION_GRID, GAP_PRIOR, HR_WRONG } from './constants'

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
/** The grid of the threshold over the power estimate: the shares `x` above it, and the multiples `1 + x` the posterior is read at. */
const SHARES = Float64Array.from(
  { length: STEPS },
  (_, i) => FUSION_GRID.from + i * FUSION_GRID.step,
)
const MULTIPLES = SHARES.map((x) => 1 + x)

/**
 * The power estimate's relative error is read to this step, 0.05 percentage points, for the two things worked out from it:
 * the gap prior smeared by it, and the quantiles of the posterior from power alone. A window's error is `max(1 / sqrt(sum
 * of weights), 2.5%)`, so most windows sit at the floor and the rest within a few tenths of a point of each other. What the
 * rounding costs is at most half of that step in the error, which moves a quantile by under one grid step (0.2% of the
 * power estimate) and usually by none: fusion.test.ts measures it over errors from 2.5% to 25%.
 */
export const ERROR_STEP = 0.0005
const SPREADS_KEPT = 64

interface Spread {
  /** The gap prior smeared by the error, at each grid point. It costs about 30,000 exponentials. */
  prior: Float64Array
  /** The prior's sum over the grid, so a likelihood's mean over it is a sum over this. */
  mass: number
  /** The multiples of the power estimate at the quantiles of the posterior from power alone: they depend on nothing else. */
  alone: Fused
}

const spreads = new Map<number, Spread>()

/** The quantiles of weights over the grid, as multiples of the power estimate. */
function quantiles(weights: Float64Array): Fused {
  let total = 0
  for (let i = 0; i < STEPS; i++) total += weights[i]!
  const at = (share: number) => {
    let seen = 0
    for (let i = 0; i < STEPS; i++) if ((seen += weights[i]!) >= share * total) return MULTIPLES[i]!
    return MULTIPLES[STEPS - 1]!
  }
  return { value: at(0.5), low: at(0.1), high: at(0.9) }
}

function spreadAt(step: number): Spread {
  const kept = spreads.get(step)
  if (kept !== undefined) {
    // Newest use last, so the oldest is what makes room.
    spreads.delete(step)
    spreads.set(step, kept)
    return kept
  }
  const powerError = step * ERROR_STEP
  const prior = new Float64Array(STEPS)
  for (let i = 0; i < STEPS; i++) {
    const x = SHARES[i]!
    prior[i] = GAPS.reduce((total, q) => total + q.prior * bell(x - q.g, powerError), 0)
  }
  const made = { prior, mass: prior.reduce((total, p) => total + p, 0), alone: quantiles(prior) }
  if (spreads.size >= SPREADS_KEPT) spreads.delete(spreads.keys().next().value!)
  spreads.set(step, made)
  return made
}

/**
 * The power estimate is a floor: a best is at most what the rider can do, and usually a few percent under. So the threshold is
 * the power estimate times (1 + g) with g at least 0, smeared by the power estimate's own relative error `powerError`. On a
 * grid of -15% to +45% around the power estimate that gives a posterior from power alone, whose 10th and 90th percentiles are
 * the range. Its median, about 3% over the power estimate, is an allowance for bests short of all-out that nothing in the
 * rides confirms, so the answer is the power estimate itself.
 *
 * Heart rate, where there is an estimate, is what can confirm a rise: a Gaussian likelihood around it with its own relative
 * error. The answer is the median of that posterior, never above what heart rate reads (heart rate that agrees with the power
 * estimate confirms no rise) and never under the power estimate: heart rate may raise the answer and never lowers it. The range
 * is the higher of each pair of 10th and 90th percentiles, so the upper end that power alone allows stays (heart rate reads
 * under the truth often enough that a range narrowed round it missed the rider who never went all out).
 *
 * Then all three move from where power alone puts them toward where heart rate does by heart rate's weight: the `weight` given
 * (the line's, under 1 near the flat floor of its climb) times the chance the estimate is sound (`soundShare`), so a weight
 * of 0 gives the answer from power alone exactly.
 *
 * The quantiles from power alone are fixed multiples of the power estimate for a given error, so they are worked out once per
 * error (to `ERROR_STEP`) and a window with no heart rate costs a multiplication. With heart rate only the likelihood pass over
 * the grid is a window's own.
 */
export function fuse(
  power: number,
  powerError: number,
  heartRate: { value: number; relativeError: number; weight?: number } | null,
): Fused {
  const { prior, mass, alone } = spreadAt(Math.max(1, Math.round(powerError / ERROR_STEP)))
  const floor = { value: power, low: power * alone.low, high: power * alone.high }
  const given = heartRate === null ? 0 : Math.min(1, Math.max(0, heartRate.weight ?? 1))
  if (heartRate === null || !(given > 0)) return floor
  const sd = heartRate.relativeError * heartRate.value
  const weights = new Float64Array(STEPS)
  let evidence = 0
  for (let i = 0; i < STEPS; i++) {
    weights[i] = prior[i]! * bell(power * MULTIPLES[i]! - heartRate.value, sd)
    evidence += weights[i]!
  }
  const lifted = quantiles(weights)
  const weight = given * soundShare(evidence / mass, sd / power)
  // Each of the three moves from where power alone puts it toward where heart rate does, by heart rate's weight.
  const toward = (from: number, to: number) => from + weight * (to - from)
  const value = toward(power, Math.max(power, Math.min(heartRate.value, power * lifted.value)))
  return {
    value,
    low: Math.min(value, toward(floor.low, Math.max(floor.low, power * lifted.low))),
    high: Math.max(value, toward(floor.high, Math.max(floor.high, power * lifted.high))),
  }
}

/**
 * The chance that heart rate's estimate is sound rather than wrong (HR_WRONG), given how well the bests account for it:
 * `meanBell` is the likelihood's mean over the prior from power alone, and `sdShare` its sd as a share of the power estimate, so
 * `meanBell / (sqrt(2 pi) * sdShare)` is its density there, per unit of share. A wrong estimate's is flat, 1 / HR_WRONG.width.
 * Where heart rate sits among the gaps the prior allows it is near 1; past them (more than GAP_PRIOR.largeMax over the bests) it
 * falls, since a rider that far short of all-out in every ride is less likely than a reference maximum or a line that is off.
 */
function soundShare(meanBell: number, sdShare: number): number {
  const sound = ((1 - HR_WRONG.share) * meanBell) / (Math.sqrt(2 * Math.PI) * sdShare)
  const wrong = HR_WRONG.share / HR_WRONG.width
  return sound / (sound + wrong)
}
