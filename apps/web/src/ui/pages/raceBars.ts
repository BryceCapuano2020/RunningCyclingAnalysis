import type { PredictionMethod, RacePrediction } from '@rca/core/predict'

/** One estimate's place along a bar, as a fraction of the bar's width from its left end. */
export interface MethodMark {
  method: PredictionMethod
  at: number
}

/**
 * Where each part of a race's bar sits, as fractions of the bar from 0 (left, the quickest time) to 1. The
 * bar is drawn on the scale of the whole list, which runs a little past what is on any bar, so nothing sits on an
 * edge and an estimate outside the assumed spread is still drawn where it is and not clamped to an end.
 */
export interface RaceBarGeometry {
  /** The assumed spread's two ends. */
  low: number
  high: number
  /** The predicted time. */
  prediction: number
  /** Each method's own time, in the order the prediction lists them. */
  methods: MethodMark[]
  /** A recorded best faster than the prediction, or null: it sets the scale too, so it is drawn where it is. */
  ran: number | null
}

/** The share of the scale kept clear either side of what is drawn, so a mark's size does not run off it. */
const MARGIN = 0.04

/**
 * The scale every bar of a list is drawn on: how far, as a fraction of its own prediction, anything on any bar falls
 * below and above it. One scale for all the races makes a bar's width the race's own uncertainty, so a marathon's
 * wider band is wider on the page, and every prediction stands at one place along its bar.
 */
export interface RaceScale {
  /** The most any time on any bar is faster than its prediction, as a fraction of the prediction. */
  below: number
  /** The most any time is slower than its prediction. */
  above: number
}

/** The times drawn on one bar. */
function timesOf(prediction: RacePrediction, ranSeconds: number | null): number[] {
  return [
    prediction.low,
    prediction.high,
    prediction.seconds,
    ...prediction.methods.map((method) => method.seconds),
    ...(ranSeconds === null ? [] : [ranSeconds]),
  ]
}

/**
 * The common scale of some races, from every time drawn on them, the spread's ends, each estimate and a recorded best
 * (`rans`, by distance, for the races that have one). It runs a little past the most extreme, so nothing sits on an edge.
 */
export function raceScale(
  predictions: readonly RacePrediction[],
  rans: ReadonlyMap<number, number> = new Map(),
): RaceScale {
  let below = 0
  let above = 0
  for (const prediction of predictions) {
    for (const seconds of timesOf(prediction, rans.get(prediction.distanceM) ?? null)) {
      below = Math.max(below, 1 - seconds / prediction.seconds)
      above = Math.max(above, seconds / prediction.seconds - 1)
    }
  }
  return { below, above }
}

/**
 * The bar's geometry on a scale, linear in seconds as the times are. The prediction is the geometric mean of the
 * estimates, so it sits between them but not at the middle of the spread, which is part of what the bar shows.
 */
export function raceBar(
  prediction: RacePrediction,
  scale: RaceScale,
  ranSeconds: number | null = null,
): RaceBarGeometry {
  const span = scale.below + scale.above || 1
  const at = (seconds: number) =>
    MARGIN + ((seconds / prediction.seconds - 1 + scale.below) / span) * (1 - 2 * MARGIN)
  return {
    low: at(prediction.low),
    high: at(prediction.high),
    prediction: at(prediction.seconds),
    methods: prediction.methods.map((method) => ({
      method: method.method,
      at: at(method.seconds),
    })),
    ran: ranSeconds === null ? null : at(ranSeconds),
  }
}
