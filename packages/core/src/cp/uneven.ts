import {
  CP_FIT_MAX_S,
  UNEVEN_MIN_S,
  UNEVEN_NESTED_FRACTION,
  UNEVEN_REST_FRACTION,
} from '../constants'
import type { CriticalPowerFit, Curve, CurvePoint } from '../types'
import { criticalPowerOutcome } from './criticalPower'

/** A best with the window it came from: its value, and the seconds [start, start + length). */
interface Windowed {
  durationS: number
  value: number
  activityId: string
  start: number
  length: number
}

/** The bests that have an activity, a window and a value. Any other best cannot be read, so it is left out. */
function windowed(curve: Curve): Windowed[] {
  return curve.flatMap((p: CurvePoint) => {
    const length = p.windowS ?? 0
    if (p.activityId === null || p.startIndex < 0 || !(length > 0)) return []
    if (!Number.isFinite(p.value)) return []
    return [
      {
        durationS: p.durationS,
        value: p.value,
        activityId: p.activityId,
        start: p.startIndex,
        length,
      },
    ]
  })
}

/**
 * The average over the part of the long window that lies outside the short one. Both values are in the
 * curve's unit, and the window is a time, so the average is in that unit too.
 */
function restOf(long: Windowed, short: Windowed): number {
  return (long.value * long.length - short.value * short.length) / (long.length - short.length)
}

/** Whether a shorter best of the same activity, at least a fraction of the long one, sits inside its window. */
function nestedIn(long: Windowed, short: Windowed): boolean {
  return (
    short.activityId === long.activityId &&
    short.durationS < long.durationS &&
    short.durationS >= UNEVEN_NESTED_FRACTION * long.durationS &&
    short.start >= long.start &&
    short.start + short.length <= long.start + long.length &&
    long.length > short.length
  )
}

/** Whether a long best's rest is under the fraction of some shorter best nested in its window. */
function isUneven(long: Windowed, all: Windowed[]): boolean {
  return all.some(
    (short) => nestedIn(long, short) && restOf(long, short) < UNEVEN_REST_FRACTION * short.value,
  )
}

/**
 * The durations, s, of the uneven bests in the threshold's window: a best of at least UNEVEN_MIN_S that a
 * shorter best of its activity sits inside, while the rest of its window is well below that shorter best.
 * Such a best is a floor, not the threshold, since the rider was not held at it all the way through.
 */
export function unevenDurations(curve: Curve): number[] {
  const all = windowed(curve)
  return all
    .filter((long) => long.durationS >= UNEVEN_MIN_S && long.durationS <= CP_FIT_MAX_S)
    .filter((long) => isUneven(long, all))
    .map((long) => long.durationS)
}

/**
 * The threshold fitted without the uneven bests, the durations left out of it, and their floor: the lowest of
 * the left-out bests in the curve's unit: held, so demonstrated, and the low end of the range when there is no main fit.
 */
export interface UnevenFit {
  fit: CriticalPowerFit
  leftOutS: number[]
  floor: number
}

/**
 * The fit with the uneven bests left out. It passes the same rules as the main fit, with a reach of
 * UNEVEN_MIN_S. Null without uneven bests, when that fit is refused, or when a main fit exists and this one
 * is not above it. A refused main fit does not block this one, since the floor it sets is still a fact.
 */
export function unevenFit(
  curve: Curve,
  minWPrime: number,
  main: CriticalPowerFit | null,
): UnevenFit | null {
  const leftOutS = unevenDurations(curve)
  if (leftOutS.length === 0) return null
  const kept = curve.filter((p) => !leftOutS.includes(p.durationS))
  const { fit } = criticalPowerOutcome(kept, { minWPrime, minLongestS: UNEVEN_MIN_S })
  if (fit === null || (main !== null && fit.cp <= main.cp)) return null
  const floor = Math.min(...curve.filter((p) => leftOutS.includes(p.durationS)).map((p) => p.value))
  return { fit, leftOutS, floor }
}
