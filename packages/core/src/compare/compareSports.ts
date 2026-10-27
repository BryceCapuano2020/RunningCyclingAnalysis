import { PRIORS, RESTING_W_PER_KG } from '../constants'
import { requirePositiveFinite } from '../math'
import type { Comparison, ComparisonPoint, Curve, HrCrossCheck } from '../types'
import { calibrationWeights, drawPriors } from './sampling'
import { confirmedOrder, sortedOrder, weightedIntervalAlong } from './weightedQuantile'

export interface CompareOptions {
  draws?: number
  seed?: number
}

const S_PRIOR = PRIORS.runEconomyScale

/** The order of one prior's draws, each direction sorted the first time it is asked for. */
class DrawOrders {
  private readonly draws: Float64Array
  private rising: number[] | null = null
  private falling: number[] | null = null

  constructor(draws: Float64Array) {
    this.draws = draws
  }

  /** Lowest draw first, equal draws in index order. */
  ascending(): number[] {
    return (this.rising ??= sortedOrder(this.draws))
  }

  /** Highest draw first, equal draws in index order. */
  descending(): number[] {
    return (this.falling ??= sortedOrder(this.draws, true))
  }
}

/** The draws of one duration: run and ride metabolic power in W/kg, and their ratio. */
interface Quantities {
  runM: Float64Array
  rideM: Float64Array
  ratio: Float64Array
}

/**
 * The ascending order of each quantity of one duration. Run and ride metabolic power move with one
 * prior's draws, so the order of those draws serves them: running power rises with the economy
 * scale above resting power and falls with it below, and riding power falls with efficiency while
 * the ride value is positive. The ratio moves with both priors, so it is sorted. A tie or a
 * reversal the guess misses is caught by confirmedOrder, which sorts instead.
 */
function ordersAt(
  runValue: number,
  rideValue: number,
  quantities: Quantities,
  priors: { economy: DrawOrders; efficiency: DrawOrders },
) {
  const { runM, rideM, ratio } = quantities
  const { economy, efficiency } = priors
  return {
    run: confirmedOrder(
      runM,
      runValue >= RESTING_W_PER_KG ? economy.ascending() : economy.descending(),
    ),
    ride: confirmedOrder(rideM, rideValue > 0 ? efficiency.descending() : efficiency.ascending()),
    ratio: sortedOrder(ratio),
  }
}

/** Throws unless both curves have the same durations. */
function checkSameDurations(runCurve: Curve, rideCurve: Curve): void {
  if (runCurve.length !== rideCurve.length) {
    throw new Error('compareSports: run and ride curves have different lengths')
  }
  for (let i = 0; i < runCurve.length; i++) {
    if (runCurve[i]!.durationS !== rideCurve[i]!.durationS) {
      throw new Error(`compareSports: run and ride durations differ at index ${i}`)
    }
  }
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
  requirePositiveFinite('massKg', massKg)
  checkSameDurations(runCurve, rideCurve)

  const { ge, s } = drawPriors(opts.draws ?? 4000, opts.seed ?? 1)
  const draws = ge.length
  const priorOrders = { economy: new DrawOrders(s), efficiency: new DrawOrders(ge) }
  const equal = new Float64Array(draws).fill(1)
  const calibration = calibrationWeights(ge, s, hr)
  const weights = calibration?.accepted ? calibration.weights : null

  const runM = new Float64Array(draws)
  const rideM = new Float64Array(draws)
  const ratio = new Float64Array(draws)
  const quantities = { runM, rideM, ratio }
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
    // Both weightings read the same orders, so each quantity is sorted once for the duration.
    const order = ordersAt(runPoint.value, ridePoint.value, quantities, priorOrders)
    const summarise = (w: Float64Array): ComparisonPoint => ({
      durationS: runPoint.durationS,
      ratio: weightedIntervalAlong(ratio, w, order.ratio),
      runMetabolic: weightedIntervalAlong(runM, w, order.run),
      rideMetabolic: weightedIntervalAlong(rideM, w, order.ride),
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
