/**
 * Synthetic lifters with a known true one-rep max (docs/design/e1rm.md, section 7). Each lifter's true
 * reps-to-failure curve is drawn from a shape that is none of the estimator's three equations, so the
 * estimator never sees its own model. Seeded: the same spec gives the same sets. Synthetic only.
 */
import { civilOfDay, dayOfCivil } from '../../calendar'
import type { LiftSet } from '../types'

export function rng(seed: number): { next: () => number; normal: () => number } {
  let s = seed >>> 0
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const normal = (): number => {
    const u = Math.max(next(), 1e-12)
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next())
  }
  return { next, normal }
}

export const DAY_CV = 0.042
/** The lifter's idea of their max lags the truth by this many days and is off by this share (SD). */
const BELIEF_LAG_DAYS = 14
const BELIEF_SD = 0.02
export type Shape =
  { kind: 'linear'; k: number } | { kind: 'exp'; c: number } | { kind: 'power'; p: number }

/** Where the exponential shape levels off, as a share of the 1RM (Mayhew and Wathen's asymptote). */
const EXP_FLOOR = 0.45

/** Reps to failure at fraction f of the 1RM (continuous; f = 1 gives 1). */
export function repsAt(shape: Shape, f: number): number {
  if (f >= 1) return 1
  if (shape.kind === 'linear') return 1 + shape.k * (1 / f - 1)
  if (shape.kind === 'power') return Math.pow(f, -1 / shape.p)
  if (f <= EXP_FLOOR) return 60
  return 1 - Math.log((f - EXP_FLOOR) / (1 - EXP_FLOOR)) / shape.c
}

/** Fraction of the 1RM at which the lifter can do exactly `reps` reps. */
export function fractionFor(shape: Shape, reps: number): number {
  if (reps <= 1) return 1
  if (shape.kind === 'linear') return 1 / (1 + (reps - 1) / shape.k)
  if (shape.kind === 'power') return Math.pow(reps, -shape.p)
  return EXP_FLOOR + (1 - EXP_FLOOR) * Math.exp(-shape.c * (reps - 1))
}

export interface LifterSpec {
  name: string
  seed: number
  start1RM: number
  /** Fraction per week of training. */
  weeklyGain: number
  shape: Shape
  /** Rep targets the program cycles through. */
  reps: number[]
  /** True reps in reserve of the first working set. */
  rirTarget: number
  sessionsPerWeek: number
  workingSets: number
  /** Probability a set has an RPE. */
  rpeLogged: number
  /** Reported RIR is the true RIR times (1 - bias), plus noise. */
  rpeBias: number
  /** Multiplier on the noise SD. */
  rpeNoise: number
  /** Weeks between deloads; 0 is never. */
  deloadEvery: number
  /** Weeks with no training; the lifter detrains 1.5% a week. */
  breakWeeks?: [number, number]
  flagsWarmups: boolean
  /** The last set of each session goes to failure. */
  topSetToFailure: boolean
  family?: 'deadlift'
  weeks: number
  dayCv?: number
  /** Week it starts, and the fraction lost over two weeks. */
  drop?: [number, number]
  thirdShape?: boolean
  /** Curve centre in reps at 80%, for the generator that draws the shape. */
  centre?: number
  /** Rep targets by block instead of by session: the block is this many weeks (default 4). */
  blockReps?: number[]
  blockWeeks?: number
  /** Scored only 2 to 4 weeks after the break ends. */
  scoreReturn?: boolean
  /** Weekly drift of the lifter's belief over their true max: a programme that adds plates. */
  beliefDrift?: number
}

export interface Lifter {
  spec: LifterSpec
  sets: LiftSet[]
  /** The true 1RM on a date. */
  truth: (date: string) => number
  /** Session dates, ascending. */
  sessionDates: string[]
  /** Days from the lifter's first day to each session. */
  sessionDays: number[]
}

/** The lifter's day zero: a Monday. */
export const ORIGIN_DAY = dayOfCivil(2024, 0, 1)

export function dateOfOffset(offset: number): string {
  const { year, month, date } = civilOfDay(ORIGIN_DAY + offset)
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`
}

function truthByWeek(spec: LifterSpec): number[] {
  const out: number[] = []
  let oneRm = spec.start1RM
  for (let w = 0; w < spec.weeks; w++) {
    out.push(oneRm)
    const onBreak = spec.breakWeeks && w >= spec.breakWeeks[0] && w < spec.breakWeeks[1]
    const deload = spec.deloadEvery > 0 && (w + 1) % spec.deloadEvery === 0
    if (spec.drop && (w === spec.drop[0] || w === spec.drop[0] + 1)) oneRm *= 1 - spec.drop[1] / 2
    else if (onBreak) oneRm *= 0.985
    else if (!deload) oneRm *= 1 + spec.weeklyGain
  }
  return out
}

const SESSION_DAYS: Record<number, number[]> = { 3: [0, 2, 4], 2: [1, 4] }

export function simulate(spec: LifterSpec): Lifter {
  const r = rng(spec.seed)
  const weekly = truthByWeek(spec)
  const truthAt = (day: number): number => {
    const w = Math.min(spec.weeks - 1, Math.floor(day / 7))
    const frac = (day - w * 7) / 7
    const here = weekly[w] as number
    const next = w + 1 < spec.weeks ? (weekly[w + 1] as number) : here
    return here + (next - here) * frac
  }
  const exercise = spec.family === 'deadlift' ? 'deadlift' : 'back-squat'
  const sets: LiftSet[] = []
  const sessionDays: number[] = []
  const offsets = SESSION_DAYS[spec.sessionsPerWeek] ?? [2]
  let session = 0
  for (let w = 0; w < spec.weeks; w++) {
    if (spec.breakWeeks && w >= spec.breakWeeks[0] && w < spec.breakWeeks[1]) continue
    const deload = spec.deloadEvery > 0 && (w + 1) % spec.deloadEvery === 0
    for (const off of offsets) {
      const day = w * 7 + off
      sessionDays.push(day)
      const date = dateOfOffset(day)
      let setOrder = 0
      const push = (reps: number, loadKg: number, rpe?: number, warmup?: true): void => {
        const set: LiftSet = {
          date,
          exercise,
          equipment: 'barbell',
          setOrder: ++setOrder,
          reps,
          loadKg,
        }
        if (rpe !== undefined) set.rpe = rpe
        if (warmup) set.warmup = true
        sets.push(set)
      }
      const target = (
        spec.blockReps
          ? spec.blockReps[Math.floor(w / (spec.blockWeeks ?? 4)) % spec.blockReps.length]
          : spec.reps[session % spec.reps.length]
      ) as number
      session++
      // Today's max varies around the underlying one.
      const today = truthAt(day) * (1 + (spec.dayCv ?? DAY_CV) * r.normal())
      const plannedRir = spec.rirTarget + (deload ? 3 : 0)
      // The lifter picks the load from a belief about their max, rounded to 2.5 kg: it lags two weeks and
      // is off by a normal 2%, so no set is a copy of the true max.
      const f = fractionFor(spec.shape, target + plannedRir)
      const belief =
        truthAt(Math.max(0, day - BELIEF_LAG_DAYS)) *
        (1 + BELIEF_SD * r.normal()) *
        Math.pow(1 + (spec.beliefDrift ?? 0), w)
      const load = Math.max(2.5, Math.round((belief * f * (deload ? 0.9 : 1)) / 2.5) * 2.5)
      for (const p of [0.5, 0.7, 0.85]) {
        const wl = Math.round((load * p) / 2.5) * 2.5
        if (spec.flagsWarmups) push(p < 0.8 ? 5 : 3, wl, undefined, true)
        // Unflagged warm-ups carry no RPE, as in a CSV from an app with no set type.
        else push(p < 0.8 ? 5 : 3, wl)
      }
      for (let i = 0; i < spec.workingSets; i++) {
        // Each earlier set costs about 0.7 of a rep to failure at the same load.
        const failReps = repsAt(spec.shape, load / today) - 0.7 * i
        const last = i === spec.workingSets - 1
        const toFailure = last && spec.topSetToFailure && !deload
        const reps = Math.max(
          1,
          toFailure ? Math.floor(failReps) : Math.min(target, Math.floor(failReps)),
        )
        const trueRir = Math.max(0, failReps - reps)
        let rpe: number | undefined
        if (r.next() < spec.rpeLogged) {
          const sd = spec.rpeNoise * (0.5 + 0.25 * trueRir)
          const reported = Math.max(0, trueRir * (1 - spec.rpeBias) + sd * r.normal())
          rpe = Math.min(10, Math.max(5, Math.round((10 - reported) * 2) / 2))
        }
        push(reps, load, rpe)
      }
    }
  }
  const sessionDates = sessionDays.map(dateOfOffset)
  return {
    spec,
    sets,
    truth: (date) =>
      truthAt(
        dayOfCivil(
          Number(date.slice(0, 4)),
          Number(date.slice(5, 7)) - 1,
          Number(date.slice(8, 10)),
        ) - ORIGIN_DAY,
      ),
    sessionDates,
    sessionDays,
  }
}
