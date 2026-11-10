/** Lifting time per day, estimated from the sets: lifts store no duration. */
import type { LiftSet } from './types'

/** Seconds a working set takes, rest between sets included. */
export const WORKING_SET_SECONDS = 180
/** Seconds a warm-up set takes, rest included. */
export const WARMUP_SET_SECONDS = 120

/** One lifting day: how many sets, and the estimated seconds they took. */
export interface LiftSession {
  /** Local date, YYYY-MM-DD. */
  date: string
  sets: number
  seconds: number
}

/**
 * One entry per day that has any set, oldest first. The caller passes the live sets, so a deleted
 * row is never counted here.
 */
export function liftSessionsOf(sets: readonly LiftSet[]): LiftSession[] {
  const byDate = new Map<string, LiftSession>()
  for (const set of sets) {
    let session = byDate.get(set.date)
    if (session === undefined) {
      session = { date: set.date, sets: 0, seconds: 0 }
      byDate.set(set.date, session)
    }
    session.sets += 1
    session.seconds += set.warmup === true ? WARMUP_SET_SECONDS : WORKING_SET_SECONDS
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}
