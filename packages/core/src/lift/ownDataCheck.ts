/**
 * The own-data check of docs/design/e1rm.md section 10: does the estimate made before a hard set predict
 * its reps? Every working set at RPE 9.5 or higher is an event. The range is the one the estimate gave
 * before that day, widened by one day's variation, turned from a load range into a range of reps to
 * failure at the set's load. Pass the sets of one lift.
 */
import { exerciseInfo } from './catalog'
import {
  CHECK_MIN_EVENTS,
  CHECK_NARROW_ABOVE,
  CHECK_RPE,
  CHECK_WIDEN_BELOW,
  DAY_SD,
} from './constants'
import { medianEquation } from './equations'
import { estimateLift, rangeOf } from './estimate'
import type { LiftEstimate } from './estimate'
import { repsToFailure } from './setEstimate'
import type { LiftSet } from './types'

export type CheckVerdict = 'too-few' | 'widen' | 'narrow' | 'holds'

export interface OwnDataCheck {
  /** Events that had an estimate from earlier days to be held against. */
  events: number
  inRange: number
  /** inRange / events; NaN with no events. */
  coverage: number
  /** The set's reps to failure above the range: the estimate read low. */
  above: number
  /** The set's reps to failure below the range. */
  below: number
  verdict: CheckVerdict
}

/** The verdict of the spec's rule on counts; the same rule applies to counts pooled over lifters. */
export function checkVerdict(
  events: number,
  inRange: number,
  above: number,
  below: number,
): CheckVerdict {
  if (events < CHECK_MIN_EVENTS) return 'too-few'
  const coverage = inRange / events
  if (coverage < CHECK_WIDEN_BELOW && above > below) return 'widen'
  if (coverage > CHECK_NARROW_ABOVE) return 'narrow'
  return 'holds'
}

const MAX_REPS = 36
const ITERATIONS = 50

/**
 * The reps to failure R at which a set of `loadKg` reads as a one-rep max of `target`: the point equation
 * inverted by bisection. 1 when the target is no more than the load, `MAX_REPS` when it is out of reach.
 */
export function repsForOneRm(loadKg: number, target: number): number {
  if (target <= loadKg) return 1
  if (medianEquation(loadKg, MAX_REPS) <= target) return MAX_REPS
  let lo = 1
  let hi = MAX_REPS
  for (let i = 0; i < ITERATIONS; i++) {
    const mid = (lo + hi) / 2
    if (medianEquation(loadKg, mid) < target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** The range of reps to failure at `loadKg` that the estimate, widened by one day's variation, allows. */
export function repsRangeAt(
  e: LiftEstimate,
  loadKg: number,
  deadlift: boolean,
): { low: number; high: number } {
  const { low, high } = rangeOf(
    e.point0,
    Math.hypot(e.sd, DAY_SD),
    e.floor.loadKg,
    e.point,
    deadlift,
  )
  return { low: repsForOneRm(loadKg, low), high: repsForOneRm(loadKg, high) }
}

export function ownDataCheck(sets: readonly LiftSet[]): OwnDataCheck {
  const sorted = [...sets].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  let events = 0
  let inRange = 0
  let above = 0
  let below = 0
  // The estimate before a day is the same for every event of that day.
  let day = ''
  let before: LiftEstimate | null = null
  let upTo = 0
  sorted.forEach((s) => {
    if (s.date !== day) {
      day = s.date
      while (upTo < sorted.length && (sorted[upTo] as LiftSet).date < day) upTo++
      before = estimateLift(sorted.slice(0, upTo))
    }
    if (!before || s.warmup || s.rpe === undefined || s.rpe < CHECK_RPE) return
    const actual = repsToFailure(s)
    if (actual === null) return
    const range = repsRangeAt(before, s.loadKg, exerciseInfo(s.exercise).deadliftFamily === true)
    events++
    if (actual > range.high) above++
    else if (actual < range.low) below++
    else inRange++
  })
  return {
    events,
    inRange,
    coverage: inRange / events,
    above,
    below,
    verdict: checkVerdict(events, inRange, above, below),
  }
}
