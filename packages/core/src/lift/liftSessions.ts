/**
 * Lifting time per day. Lifts store no duration, so a day's time is the span of its live stamps where they can be read,
 * and is estimated from the sets otherwise (docs/design/lift-time.md).
 */
import { LIFT_TIME_PATTERN } from './limits'
import type { LiftSet } from './types'

/** Seconds a working set takes, rest between sets included. */
export const WORKING_SET_SECONDS = 180
/** Seconds a warm-up set takes, rest included. */
export const WARMUP_SET_SECONDS = 120
/** The shortest span of live stamps read as the session: under it, the sets were entered one after another. */
export const MEASURED_MIN_SECONDS = 5 * 60
/** The longest span of live stamps read as the session: over it, the day held more than one session or a stray set. */
export const MEASURED_MAX_SECONDS = 3 * 60 * 60

/** One lifting day: how many sets, the seconds they took, and whether those seconds were measured. */
export interface LiftSession {
  /** Local date, YYYY-MM-DD. */
  date: string
  sets: number
  seconds: number
  /** True when the seconds are the span of the day's live stamps; false when they are the estimate from the sets. */
  measured: boolean
  /** The earliest time of day a set of the day carries, HH:MM; absent when none carries one. */
  start?: string
}

/** Seconds since midnight of an HH:MM time, or null for anything else. */
function clockSeconds(time: string | undefined): number | null {
  if (time === undefined || !LIFT_TIME_PATTERN.test(time)) return null
  return Number(time.slice(0, 2)) * 3600 + Number(time.slice(3, 5)) * 60
}

function allowanceOf(set: LiftSet): number {
  return set.warmup === true ? WARMUP_SET_SECONDS : WORKING_SET_SECONDS
}

/**
 * The span of a day's live stamps plus one set's allowance (the last stamped set's), or null when the day cannot be
 * read that way: a set with no stamp, one stamped only at the session's start, or a span outside 5 min to 3 h. A stamp
 * is the set's own date: the logger stamps a set only on the day it is logged for, so a set entered later has none.
 */
function measuredSeconds(sets: readonly LiftSet[]): number | null {
  let first = Infinity
  let last = -Infinity
  let lastAllowance = 0
  for (const set of sets) {
    const at = clockSeconds(set.time)
    if (set.timePrecision !== 'set' || at === null) return null
    first = Math.min(first, at)
    // At the same minute, a working set's allowance is taken over a warm-up's.
    if (at > last || (at === last && allowanceOf(set) > lastAllowance))
      lastAllowance = allowanceOf(set)
    last = Math.max(last, at)
  }
  const span = last - first
  return span >= MEASURED_MIN_SECONDS && span <= MEASURED_MAX_SECONDS ? span + lastAllowance : null
}

/** The earliest valid time of day among the sets, HH:MM, or undefined when none has one. */
function startOf(sets: readonly LiftSet[]): string | undefined {
  let start: string | undefined
  for (const { time } of sets) {
    // Times are fixed-width, so text order is clock order.
    if (time === undefined || clockSeconds(time) === null) continue
    if (start === undefined || time < start) start = time
  }
  return start
}

/**
 * One entry per day that has any set, oldest first. The caller passes the live sets, so a deleted
 * row is never counted here.
 */
export function liftSessionsOf(sets: readonly LiftSet[]): LiftSession[] {
  const byDate = new Map<string, LiftSet[]>()
  for (const set of sets) {
    const day = byDate.get(set.date)
    if (day === undefined) byDate.set(set.date, [set])
    else day.push(set)
  }
  const sessions = [...byDate].map(([date, daySets]): LiftSession => {
    const measured = measuredSeconds(daySets)
    const session: LiftSession = {
      date,
      sets: daySets.length,
      seconds: measured ?? daySets.reduce((sum, set) => sum + allowanceOf(set), 0),
      measured: measured !== null,
    }
    const start = startOf(daySets)
    if (start !== undefined) session.start = start
    return session
  })
  return sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}
