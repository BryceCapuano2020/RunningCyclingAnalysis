import type { PredictionMethod, RacePrediction } from '@rca/core/predict'

/** One estimate's place along a bar, as a fraction of the bar's width from its left end. */
export interface MethodMark {
  method: PredictionMethod
  at: number
}

/**
 * Where each part of a race's bar sits, as fractions of the bar from 0 (left, the quickest time) to 1. The
 * bar is drawn on a scale that runs a little past what is on it, so nothing sits on its edge, and wider when
 * an estimate falls outside the assumed spread, so it is still drawn where it is and not clamped to an end.
 */
export interface RaceBarGeometry {
  /** The assumed spread's two ends. */
  low: number
  high: number
  /** The predicted time. */
  prediction: number
  /** Each method's own time, in the order the prediction lists them. */
  methods: MethodMark[]
}

/** The share of the scale kept clear either side of what is drawn, so a mark's size does not run off it. */
const MARGIN = 0.04

/**
 * The bar's geometry, linear in seconds as the times are. The spread's ends and every estimate set the
 * scale; the prediction is the geometric mean of the estimates, so it sits between them but not at the
 * middle of the spread, which is part of what the bar shows.
 */
export function raceBar(prediction: RacePrediction): RaceBarGeometry {
  const times = [
    prediction.low,
    prediction.high,
    prediction.seconds,
    ...prediction.methods.map((method) => method.seconds),
  ]
  const lowest = Math.min(...times)
  const highest = Math.max(...times)
  const span = highest - lowest || 1
  const at = (seconds: number) => MARGIN + ((seconds - lowest) / span) * (1 - 2 * MARGIN)
  return {
    low: at(prediction.low),
    high: at(prediction.high),
    prediction: at(prediction.seconds),
    methods: prediction.methods.map((method) => ({
      method: method.method,
      at: at(method.seconds),
    })),
  }
}
