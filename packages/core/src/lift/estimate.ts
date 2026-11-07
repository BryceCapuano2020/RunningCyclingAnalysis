/**
 * Sessions to one lift's estimated one-rep max, with its range, floor and rep bests
 * (docs/design/e1rm.md, sections 2 and 3). Pass the sets of one lift (one exercise and equipment).
 */
import { dayOfCivil } from '../calendar'
import {
  DEADLIFT_EXTRA_HIGH,
  HALF_LIFE_DAYS,
  NEAR_TOP_SHARE,
  NEAR_TOP_WIDTH,
  REP_BEST_MAX,
  TOP_DAYS,
  WINDOW_DAYS,
  Z_HIGH,
  Z_LOW,
} from './constants'
import { repsToFailure, setEstimate } from './setEstimate'
import type { SetEstimate } from './setEstimate'
import type { LiftSet } from './types'

/** A load actually lifted, with when. Demonstrated, so it has no range. */
export interface LiftBest {
  loadKg: number
  reps: number
  /** Local date, YYYY-MM-DD. */
  date: string
}

export interface LiftEstimate {
  /** Date of the newest session read, YYYY-MM-DD. */
  date: string
  /** Estimated one-rep max, kg. floor <= low <= point <= high. */
  point: number
  /** The weighted mean before the floor lifts it: what the range is cut from (see `rangeOf`). */
  point0: number
  low: number
  high: number
  /** The heaviest working set in the window. */
  floor: LiftBest
  /** Sessions read. */
  sessions: number
  /** Combined error in log units; the range is point times exp(-1.1 sd) to exp(1.5 sd). */
  sd: number
}

/**
 * The 80% range of a figure with centre `point0` and error `sd` (log units): z 1.1 below, 1.5 above, never under
 * the floor, the top 5% wider for a deadlift. `point` is the figure's reported value, which the top never falls below.
 * Used for the estimate and, divided by a body mass, for relative strength.
 */
export function rangeOf(
  point0: number,
  sd: number,
  floor: number,
  point: number,
  deadlift: boolean,
): { low: number; high: number } {
  return {
    low: Math.max(point0 * Math.exp(-Z_LOW * sd), floor),
    high: Math.max(
      point0 * Math.exp(Z_HIGH * sd) * (deadlift ? 1 + DEADLIFT_EXTRA_HIGH : 1),
      point,
    ),
  }
}

const dayCache = new Map<string, number>()

/** The day number of a YYYY-MM-DD date, through the core calendar. NaN for text that is not a date. */
export function dayOfLiftDate(date: string): number {
  const cached = dayCache.get(date)
  if (cached !== undefined) return cached
  const day = dayOfCivil(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  )
  if (dayCache.size > 20_000) dayCache.clear()
  dayCache.set(date, day)
  return day
}

interface Windowed {
  sets: LiftSet[]
  days: number[]
}

function windowEndingAt(sets: readonly LiftSet[], days: readonly number[], end: number): Windowed {
  const kept: LiftSet[] = []
  const keptDays: number[] = []
  sets.forEach((s, i) => {
    const d = days[i] as number
    if (d <= end && d > end - WINDOW_DAYS) {
      kept.push(s)
      keptDays.push(d)
    }
  })
  return { sets: kept, days: keptDays }
}

/** The heaviest working set and the heaviest at each rep count from 1 to 15, within the 56 days up to `asOf` (default: the newest set). */
export function liftBests(
  sets: readonly LiftSet[],
  asOf?: string,
): { floor: LiftBest | null; repBests: LiftBest[] } {
  const days = sets.map((s) => dayOfLiftDate(s.date))
  const end = asOf === undefined ? Math.max(-Infinity, ...days) : dayOfLiftDate(asOf)
  return bestsOf(windowEndingAt(sets, days, end).sets)
}

/** A better best: heavier, then more reps, then newer. */
function beats(a: LiftBest, b: LiftBest | undefined): boolean {
  if (!b) return true
  if (a.loadKg !== b.loadKg) return a.loadKg > b.loadKg
  if (a.reps !== b.reps) return a.reps > b.reps
  return a.date > b.date
}

function bestsOf(windowed: readonly LiftSet[]): { floor: LiftBest | null; repBests: LiftBest[] } {
  const win = windowed.filter((s) => !s.warmup && s.reps >= 1 && s.loadKg > 0)
  let floor: LiftBest | null = null
  const byReps = new Map<number, LiftBest>()
  for (const s of win) {
    const b: LiftBest = { loadKg: s.loadKg, reps: s.reps, date: s.date }
    if (beats(b, floor ?? undefined)) floor = b
    if (s.reps > REP_BEST_MAX || !Number.isInteger(s.reps)) continue
    if (beats(b, byReps.get(s.reps))) byReps.set(s.reps, b)
  }
  const repBests = [...byReps.values()].sort((a, b) => a.reps - b.reps)
  return { floor, repBests }
}

interface Session {
  day: number
  date: string
  reps: number
  est: SetEstimate
}

/** Each session's estimate is its eligible set with the highest point: later sets carry fatigue and read low. */
function sessionsOf(sets: readonly LiftSet[], days: readonly number[]): Session[] {
  const byDay = new Map<number, Session>()
  sets.forEach((s, i) => {
    const est = setEstimate(s)
    if (!est) return
    const day = days[i] as number
    const prev = byDay.get(day)
    // Highest point; a tie goes to more reps, then the newer date.
    const better =
      !prev ||
      est.point > prev.est.point ||
      (est.point === prev.est.point &&
        (s.reps > prev.reps || (s.reps === prev.reps && s.date > prev.date)))
    if (better) byDay.set(day, { day, date: s.date, reps: s.reps, est })
  })
  return [...byDay.values()]
}

/**
 * The estimate on the date `t` of the lift's newest eligible session on or before `asOf` (default: no
 * limit), from the sessions in the 56 days up to `t`; null when no session is eligible. A lift not trained
 * for months still has an answer, dated; a trailing day of ineligible sets does not move the window.
 */
export function estimateLift(sets: readonly LiftSet[], asOf?: string): LiftEstimate | null {
  const allDays = sets.map((s) => dayOfLiftDate(s.date))
  const bound = asOf === undefined ? Infinity : dayOfLiftDate(asOf)
  let end = -Infinity
  sets.forEach((s, i) => {
    const d = allDays[i] as number
    if (d <= bound && d > end && repsToFailure(s) !== null) end = d
  })
  if (end === -Infinity) return null
  const win = windowEndingAt(sets, allDays, end)
  const sessions = sessionsOf(win.sets, win.days)
  if (sessions.length === 0) return null
  const { floor } = bestsOf(win.sets)
  if (!floor) return null
  const newest = sessions.reduce((a, s) => (s.day > a.day ? s : a))
  const recent = sessions
    .filter((s) => s.day > newest.day - TOP_DAYS)
    .map((s) => s.est.point)
    .sort((a, b) => b - a)
  const top = recent.length > 1 ? (recent[1] as number) : (recent[0] as number)
  const weights = sessions.map((s) => {
    const recency = Math.pow(0.5, (newest.day - s.day) / HALF_LIFE_DAYS)
    const near = s.est.hasRpe
      ? 1
      : 1 / (1 + Math.exp(-((s.est.point / top - NEAR_TOP_SHARE) / NEAR_TOP_WIDTH)))
    return (recency * near) / (s.est.sys ** 2 + s.est.ind ** 2)
  })
  const total = weights.reduce((a, b) => a + b, 0)
  let point0 = 0
  let sys = 0
  let ind2 = 0
  sessions.forEach((s, i) => {
    const q = (weights[i] as number) / total
    point0 += q * s.est.point
    sys += q * s.est.sys
    ind2 += q * q * s.est.ind * s.est.ind
  })
  const sd = Math.hypot(sys, Math.sqrt(ind2))
  const deadlift = sessions.some((s) => s.est.deadlift)
  const point = Math.max(point0, floor.loadKg)
  return {
    date: newest.date,
    point,
    point0,
    ...rangeOf(point0, sd, floor.loadKg, point, deadlift),
    floor,
    sessions: sessions.length,
    sd,
  }
}
