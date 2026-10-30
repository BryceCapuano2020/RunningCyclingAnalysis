import { DAY_MS } from '../../constants'
import { mulberry32 } from '../../math'
import type { Activity, Sport } from '../../types'
import type { SyntheticAthlete } from '../athlete'
import { generateActivity } from '../generate'
import type { Effort, Terrain } from '../spec'
import { athleteAtLevel, weeklyLevel } from './level'
import { between, studentT5 } from './random'
import type { NoiseModel } from './types'

/** How an activity reaches the app: the file format a device or an export would hold. */
export type FileFormat = 'fit' | 'gpx' | 'tcx'

/** One kind of session in a sport's week. Minutes are drawn between the two ends. */
export interface Session {
  effort: Effort
  terrain: Terrain
  minutes: readonly [number, number]
  /** Relative chance among the sport's sessions. */
  weight: number
}

export interface SportPlan {
  /** Mean sessions a week (Poisson). */
  perWeek: number
  sessions: readonly Session[]
  /** A 3, 6, 12 and 20 minute test block about this often, in weeks. 0 for never. */
  testEveryWeeks: number
  /** A race of exactly this distance about every `everyWeeks`. Runs only. */
  race?: { everyWeeks: number; distanceM: number }
  /** Rides only: the bike has a power meter. Defaults to true. */
  withPower?: boolean
  format: FileFormat
}

/** Everything that makes one synthetic athlete: who they are, what they wear, what they do. */
export interface PersonaSpec {
  athlete: SyntheticAthlete
  noise: NoiseModel
  /** A sport the athlete does not do is absent. */
  plans: Partial<Record<Sport, SportPlan>>
  /** Weeks without training, twice a year: each 1 to 3 weeks. */
  gapsPerYear: number
}

/** One generated activity with the truth behind it. */
export interface LibraryEntry {
  activity: Activity
  format: FileFormat
  effort: Effort
  /** Week of the span, 0 up from the first week. */
  week: number
  /** The weekly level the athlete was at (wander, season, heat, strap), log units. */
  weeklyLevel: number
  /** The run-to-run draw added on top of the weekly level, log units. */
  runDraw: number
}

export interface Library {
  entries: LibraryEntry[]
  /** The weekly level of the whole span, one value per week. */
  levels: Float64Array
}

/** Fixed end of every generated library, so the same seed makes the same dates. A Monday in 2025. */
export const LIBRARY_END_MS = Date.UTC(2025, 5, 16, 0, 0, 0)
const WEEK_DAYS = 7
const WEEKS_PER_YEAR = 52
const MAX_GAP_WEEKS = 3
const RACE_WARMUP_S = 600
/** Slowest speed a race is allowed to run at: sets how much track to generate so the distance is reached. */
const SLOWEST_RACE_MS = 1.8
const RACE_TAIL_S = 300
const SEED_RANGE = 0x100000000

/** A Poisson draw by inversion; the means here are small. */
function poisson(rand: () => number, mean: number): number {
  let k = 0
  let p = Math.exp(-mean)
  let sum = p
  const u = rand()
  while (u > sum && k < 50) {
    k++
    p *= mean / k
    sum += p
  }
  return k
}

function pick(rand: () => number, sessions: readonly Session[]): Session {
  const total = sessions.reduce((s, x) => s + x.weight, 0)
  let u = rand() * total
  for (const session of sessions) {
    u -= session.weight
    if (u < 0) return session
  }
  return sessions[sessions.length - 1]!
}

/** The first `distanceM` of a race, as the device would record it: the warm-up and the cool-down are cut off. */
function raceOfDistance(a: Activity, distanceM: number): Activity {
  const start = Math.min(a.n, RACE_WARMUP_S)
  let end = start
  while (end < a.n && a.distance[end]! - a.distance[start]! < distanceM) end++
  const cut = <T extends Float64Array | Float32Array | Uint8Array>(xs: T): T =>
    xs.slice(start, end) as T
  const distance = cut(a.distance)
  const origin = distance[0] ?? 0
  for (let i = 0; i < distance.length; i++) distance[i] = distance[i]! - origin
  return {
    ...a,
    n: end - start,
    startMs: a.startMs + start * 1000,
    speed: cut(a.speed),
    distance,
    altitude: cut(a.altitude),
    heartRate: cut(a.heartRate),
    power: cut(a.power),
    paused: cut(a.paused),
    ...(a.cadence ? { cadence: cut(a.cadence) } : {}),
  }
}

/** Weeks with no training: `gapsPerYear` a year, each 1 to 3 weeks long. */
function gapWeeks(rand: () => number, weeks: number, gapsPerYear: number): Set<number> {
  const gaps = new Set<number>()
  for (let i = 0; i < Math.round((weeks / WEEKS_PER_YEAR) * gapsPerYear); i++) {
    const length = 1 + Math.floor(rand() * MAX_GAP_WEEKS)
    const from = Math.floor(rand() * Math.max(1, weeks - length))
    for (let k = 0; k < length; k++) gaps.add(from + k)
  }
  return gaps
}

/**
 * A training history for `spec`, `weeks` weeks long ending at LIBRARY_END_MS. The weekly level is
 * the one runSim.ts draws (wander, season, heat, strap); each run adds a Student t draw of the
 * level's `runSd`. Activities carry the sensor noise of the spec. Deterministic in `seed`.
 */
export function buildLibrary(spec: PersonaSpec, seed: number, weeks: number): Library {
  const rand = mulberry32(seed * 7919 + 17)
  const levels = weeklyLevel(spec.noise.level, weeks, mulberry32(seed * 7919 + 13))
  const gaps = gapWeeks(rand, weeks, spec.gapsPerYear)
  const firstMs = LIBRARY_END_MS - weeks * WEEK_DAYS * DAY_MS
  const entries: LibraryEntry[] = []
  const sinceTest: Partial<Record<Sport, number>> = {}
  const sinceRace: Partial<Record<Sport, number>> = {}
  for (let week = 0; week < weeks; week++) {
    if (gaps.has(week)) continue
    for (const sport of Object.keys(spec.plans) as Sport[]) {
      const plan = spec.plans[sport]!
      const count = poisson(rand, plan.perWeek)
      for (let k = 0; k < count; k++) {
        const dueTest =
          plan.testEveryWeeks > 0 && week - (sinceTest[sport] ?? -1) >= plan.testEveryWeeks
        const dueRace =
          plan.race !== undefined && week - (sinceRace[sport] ?? -1) >= plan.race.everyWeeks
        const race = dueRace ? plan.race : undefined
        const session = dueTest ? undefined : pick(rand, plan.sessions)
        const effort: Effort = race ? 'race' : (session?.effort ?? 'test')
        if (race) sinceRace[sport] = week
        else if (!session) sinceTest[sport] = week
        const minutes = session ? between(rand, session.minutes[0], session.minutes[1]) : 110
        const durationS = race
          ? RACE_WARMUP_S + race.distanceM / SLOWEST_RACE_MS + RACE_TAIL_S
          : Math.round(minutes * 60)
        const day = Math.floor(rand() * WEEK_DAYS)
        const hour = Math.floor(between(rand, 6, 19))
        const draw = sport === 'run' ? spec.noise.level.runSd * studentT5(rand) : 0
        const level = levels[week]!
        const id = `${sport}-${String(entries.length + 1).padStart(4, '0')}`
        const raw = generateActivity(
          athleteAtLevel(spec.athlete, level + draw),
          {
            id,
            name: id,
            sport,
            startMs: firstMs + (week * WEEK_DAYS + day) * DAY_MS + hour * 3_600_000,
            durationS: Math.round(durationS),
            effort,
            terrain: race ? 'flat' : (session?.terrain ?? 'flat'),
            withPower: plan.withPower,
          },
          Math.floor(rand() * SEED_RANGE),
          spec.noise,
        )
        const activity = race ? raceOfDistance(raw, race.distanceM) : raw
        entries.push({
          activity,
          format: plan.format,
          effort,
          week,
          weeklyLevel: level,
          runDraw: draw,
        })
      }
    }
  }
  entries.sort((p, q) => p.activity.startMs - q.activity.startMs)
  return { entries, levels }
}
