/**
 * The calibration scenarios of docs/design/e1rm.md section 7: 18 kinds of lifter, each run for many
 * lifters whose curve is drawn from the population. Synthetic only.
 */
import { rng } from './lifters'
import type { LifterSpec, Shape } from './lifters'

const base = {
  weeks: 40,
  sessionsPerWeek: 2,
  workingSets: 3,
  rpeLogged: 1,
  rpeBias: 0.25,
  rpeNoise: 1,
  deloadEvery: 5,
  flagsWarmups: true,
  topSetToFailure: false,
  rirTarget: 2,
  weeklyGain: 0.004,
}

/** SD of reps to failure at 80% of the 1RM between people: Nuzzo 2024. */
const NUZZO_SD_80 = 2.51

/** A curve drawn from the population: reps at 80% are N(centre, 2.51) cut to 4 to 16, in one of two shapes (or a third). */
export function drawShape(seed: number, centre = 8.5, third = false): Shape {
  const r = rng(seed * 7919 + 3)
  const r80 = Math.min(16, Math.max(4, centre + NUZZO_SD_80 * r.normal()))
  if (third) return { kind: 'power', p: Math.log(1.25) / Math.log(r80) }
  return r.next() < 0.5
    ? { kind: 'linear', k: (r80 - 1) / 0.25 }
    : { kind: 'exp', c: Math.log(0.55 / 0.35) / (r80 - 1) }
}

type Template = Omit<LifterSpec, 'seed' | 'shape' | 'name'>

export const SCENARIOS: Record<string, Template> = {
  'strength-1-5': { ...base, start1RM: 150, reps: [5, 3, 1, 5, 2] },
  'hypertrophy-8-12': { ...base, start1RM: 90, reps: [8, 10, 12] },
  'high-reps-12-15': { ...base, start1RM: 70, reps: [12, 15, 12] },
  'mixed-1-15': { ...base, start1RM: 110, reps: [3, 8, 15, 5, 10] },
  'no-rpe': { ...base, start1RM: 120, reps: [5, 6, 8], rpeLogged: 0 },
  'half-rpe-amrap': {
    ...base,
    start1RM: 110,
    reps: [5, 8, 3],
    rpeLogged: 0.5,
    topSetToFailure: true,
  },
  'noisy-rpe': { ...base, start1RM: 100, reps: [4, 6, 8], rpeNoise: 2, rpeBias: 0.4 },
  'deload-and-break': {
    ...base,
    start1RM: 130,
    reps: [5, 5, 3],
    deloadEvery: 4,
    flagsWarmups: false,
    breakWeeks: [18, 24],
  },
  deadlift: { ...base, start1RM: 200, reps: [3, 5, 2], family: 'deadlift', centre: 7 },
  novice: { ...base, start1RM: 60, reps: [5, 8, 5], weeklyGain: 0.015, deloadEvery: 0 },
  'strength-drop': { ...base, start1RM: 140, reps: [5, 3, 5], drop: [20, 0.05] },
  'no-rpe-drop': { ...base, start1RM: 120, reps: [5, 6, 8], rpeLogged: 0, drop: [20, 0.05] },
  'once-a-week-no-rpe': {
    ...base,
    start1RM: 160,
    reps: [5, 3, 5],
    sessionsPerWeek: 1,
    rpeLogged: 0,
    deloadEvery: 4,
  },
  'once-a-week-no-rpe-break': {
    ...base,
    start1RM: 160,
    reps: [5, 3, 5],
    sessionsPerWeek: 1,
    rpeLogged: 0,
    deloadEvery: 4,
    breakWeeks: [18, 24],
  },
  'block-switch': {
    ...base,
    start1RM: 120,
    reps: [3],
    blockReps: [3, 10],
    blockWeeks: 4,
    deloadEvery: 0,
  },
  'return-no-rpe': {
    ...base,
    start1RM: 130,
    reps: [5, 6, 8],
    rpeLogged: 0,
    breakWeeks: [18, 24],
    scoreReturn: true,
  },
  'return-once-a-week-no-rpe': {
    ...base,
    start1RM: 160,
    reps: [5, 3, 5],
    sessionsPerWeek: 1,
    rpeLogged: 0,
    deloadEvery: 4,
    breakWeeks: [18, 24],
    scoreReturn: true,
  },
  misspecified: {
    ...base,
    start1RM: 100,
    reps: [3, 6, 10],
    rpeBias: 0.5,
    dayCv: 0.06,
    thirdShape: true,
  },
}

/**
 * `n` lifters of a scenario. `centre` is the curve centre in reps at 80%; below zero it is drawn per
 * lifter from N(8.5, 1), the spec's prior on where real lifters sit. `offset` 0 is the tuning seeds.
 */
export function population(name: string, n: number, centre = 8.5, offset = 0): LifterSpec[] {
  const t = SCENARIOS[name]
  if (!t) throw new Error(`unknown scenario ${name}`)
  return Array.from({ length: n }, (_, i) => {
    const seed = 1000 * (offset + 1) + i
    const spread = centre < 0 ? rng(seed * 31 + 17).normal() : 0
    const mid = centre < 0 ? 8.5 + spread : centre
    const c = t.centre !== undefined ? t.centre + (mid - 8.5) : mid
    return { ...t, name, seed, shape: drawShape(seed, c, t.thirdShape) }
  })
}
