import { mulberry32, normal } from '../../math'
import { weeklyLevel } from '../../synthetic/noise/level'
import { NOISE_PRESETS } from '../../synthetic/noise/presets'
import type { LevelNoise } from '../../synthetic/noise/types'
import { monitor } from '../machine'
import type { WeekRecord } from '../machine'
import type { RunPoint } from '../windows'

/**
 * A run-level generator for the monitor: the weekly level (planted steps and ramps, a slow wander,
 * a season, heat weeks, a strap step) plus the spread of one run (Student t on 5 degrees of freedom),
 * a few bad runs, and runs arriving at a Poisson rate of steady runs a week. The level and its spreads
 * are the synthetic tier's shared `NOISE_PRESETS.measured.level` (3.8% a run, 2% of wander with a weekly
 * correlation of 0.9, measured on a real library's steady runs), with `level` laid over it field by field.
 */
export interface SimSpec {
  weeks: number
  /** Steady runs a week. */
  perWeek: number
  /** Planted: a step of `size` (negative is slower) at `week`, or a ramp reaching `size` over `weeks`. */
  planted?: { type: 'step' | 'ramp'; week: number; size: number; weeks?: number }[]
  /** Fields of the level noise (run spread, wander, season, heat, strap step) that differ from the measured preset. */
  level?: Partial<LevelNoise>
  /** Share of runs read 5 to 12% slow or 4 to 10% fast by the sensor. */
  bad?: number
  /** Share of runs 2% slow with 5% more spread (hills). */
  hilly?: number
}

function student5(random: () => number): number {
  const z = normal(random)
  let chi = 0
  for (let i = 0; i < 5; i++) chi += normal(random) ** 2
  return z / Math.sqrt(chi / 5) / Math.sqrt(5 / 3)
}

function poisson(random: () => number, mean: number): number {
  let k = 0
  let p = Math.exp(-mean)
  let sum = p
  const u = random()
  while (u > sum && k < 50) {
    k++
    p *= mean / k
    sum += p
  }
  return k
}

/** The planted level at a week, as a log-change. */
export function plantedAt(spec: SimSpec, week: number): number {
  let level = 0
  for (const p of spec.planted ?? []) {
    if (p.type === 'step') level += week >= p.week ? p.size : 0
    else level += p.size * Math.min(1, Math.max(0, (week - p.week) / (p.weeks ?? 1)))
  }
  return level
}

export function simulate(spec: SimSpec, seed: number): RunPoint[] {
  const random = mulberry32(seed * 7919 + 13)
  const noise = { ...NOISE_PRESETS.measured.level, ...spec.level }
  const level = weeklyLevel(noise, spec.weeks, random)
  const points: RunPoint[] = []
  for (let w = 0; w < spec.weeks; w++) {
    const base = plantedAt(spec, w) + level[w]!
    for (let i = 0, n = poisson(random, spec.perWeek); i < n; i++) {
      let x = base + noise.runSd * student5(random)
      if (spec.hilly && random() < spec.hilly) x += -0.02 + 0.05 * normal(random)
      if (spec.bad && random() < spec.bad) {
        x += random() < 0.6 ? -(0.05 + 0.07 * random()) : 0.04 + 0.06 * random()
      }
      points.push({ id: `s${seed}-${w}-${i}`, t: (w + random()) * 7, x })
    }
  }
  return points.sort((p, q) => p.t - q.t)
}

/** The monitor over a whole simulated library. */
export function replaySim(points: RunPoint[], weeks: number): WeekRecord[] {
  return monitor(points, 0, weeks - 1)
}

/** Weeks (0 up) at which a slip is declared. */
export const slipWeeks = (records: readonly WeekRecord[]): number[] =>
  records.filter((r) => r.state === 'slipping' && r.fresh).map((r) => r.w)

export const firstWeekOf = (
  records: readonly WeekRecord[],
  from: number,
  state: WeekRecord['state'],
): number | null => records.find((r) => r.w >= from && r.state === state && r.fresh)?.w ?? null

export function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((x, y) => x - y)
  return s.length === 0 ? Number.NaN : s[Math.min(s.length - 1, Math.floor(q * s.length))]!
}
