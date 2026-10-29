import { DAY_MS } from '../../constants'
import { DAYS, MONDAY } from '../../digest/test/sameHeartRateFixture'
import { mulberry32, normal } from '../../math'
import type { ActivityDigest, Sport } from '../../types'
import type { FindingSource } from '../input'
import { seedFrom } from '../stats'
import type { ZoneTables } from '../types'
import { BASELINE, plantedActivity } from './plantedActivity'
import type { Conditions, SessionKind } from './plantedActivity'
import { zonesFromDigests } from './zonesFixture'

const WEEK_MS = 7 * DAY_MS

/**
 * What can be planted in a library, with `size` read as:
 * - efficiency-shift: relative change in output at the same heart rate (0.05 is 5% more), from the week on.
 *   For a detector that reads heart rate at a pace, bpmForEfficiency converts: 1.34 bpm per 1% on
 *   an easy run and 0.74 bpm per 1% on an easy ride.
 * - efficiency-ramp: the same, growing by `size` more each week from the week on. Ramps add, so a ramp
 *   up and a steeper ramp down make a tent, a reversal.
 * - hr-coverage: the share of activities, from the week on, with no heart rate at all (0.5 is half).
 * - volume-step: relative change in every session's time (0.4 is 40% longer).
 * - sport-share-shift: the change in the share of sessions that go to `sport` (the first sport when not
 *   given), from the week on (0.3 is 30 points). Works at any number of sessions a week.
 * - break: weeks with no activity from the week on.
 * - easy-hr-creep: beats per minute the easy sessions are run harder, at the same fitness.
 * - decoupling-change: change in the share of output per heart rate lost between halves of a long
 *   effort (0.03 is 3 points).
 * - late-retention-change: change in the share of fresh output kept after hours on the move (-0.06 is
 *   6 points less).
 */
export type EffectType =
  | 'efficiency-shift'
  | 'efficiency-ramp'
  | 'hr-coverage'
  | 'volume-step'
  | 'sport-share-shift'
  | 'break'
  | 'easy-hr-creep'
  | 'decoupling-change'
  | 'late-retention-change'

export interface Effect {
  type: EffectType
  /** The week (0 up) it starts in. */
  atWeek: number
  size: number
  /** The sport it applies to; every sport when not given. */
  sport?: Sport
}

/**
 * Things that are not changes in the athlete and should not read as one: a new heart-rate strap (+6 bpm
 * from mid-library), a new power meter (+4% from mid-library), zones reset to a lower reference
 * (mid-library), 5% of activities with a heart-rate spike, 5% duplicated, a yearly swing in fitness and
 * volume, and 30% of activities without heart rate.
 */
export type Nuisance =
  | 'strap-change'
  | 'meter-change'
  | 'zone-change'
  | 'hr-spikes'
  | 'duplicates'
  | 'seasonal'
  | 'missing-hr'

/**
 * How the athlete varies beyond the independent noise of a day. `autocorrelation` makes fitness wander
 * from week to week as an AR(1) series of that coefficient (0.8 is a slow wander) with the spec's noise
 * as its spread; `heavyTails` makes a day's spread t-distributed on 3 degrees of freedom, so now and then
 * a day is far off.
 */
export interface NoiseModel {
  autocorrelation?: number
  heavyTails?: boolean
}

export interface PlantedSpec {
  seed: number
  weeks: number
  /** Activities a week, across sports: 1, 2, 3, 4 or 8. */
  perWeek: number
  /** Relative spread of a day against another and of a block against another. 0.02 is what the false-alarm tests use. */
  noise: number
  noiseModel?: NoiseModel
  effects: Effect[]
  /** Both sports share the week's activities, alternating. Just a run when not given. */
  sports?: Sport[]
  nuisances?: Nuisance[]
}

/** What was planted, and the activities it reaches. */
export interface Truth {
  effect: Effect
  /** When it starts (a break: when it ends). */
  onsetMs: number
  /** Ids of the activities from onset on, in the effect's sport. */
  plantedIds: string[]
  /**
   * The size as the library carries it, in the unit of the effect's size. Exact for the effects that
   * apply a number (a shift, a ramp's final height, a creep, a volume step); measured from the
   * activities for those that draw (the share without heart rate, the change in a sport's share of
   * sessions), where it differs from the nominal by what chance and rounding gave.
   */
  realised: number
}

export interface PlantedLibrary extends FindingSource {
  spec: PlantedSpec
  truths: Truth[]
  zones: ZoneTables
  firstMs: number
  lastMs: number
}

/**
 * The kinds of session a sport rotates through, whatever the number of sessions a week, so that a
 * library with one a week still has long and hard days, and a change in a sport's share of sessions
 * does not change what kind of sessions it gets.
 */
const KIND_ROTATION: SessionKind[] = ['easy', 'hard', 'easy', 'long']

const SEASON_WEEKS = 52

function has(spec: PlantedSpec, nuisance: Nuisance): boolean {
  return spec.nuisances?.includes(nuisance) ?? false
}

/** The effects of one type that apply to the sport and have begun by the week. */
function begun(spec: PlantedSpec, type: EffectType, sport: Sport, week: number): Effect[] {
  return spec.effects.filter(
    (e) => e.type === type && (e.sport ?? sport) === sport && week >= e.atWeek,
  )
}

const sum = (effects: Effect[]) => effects.reduce((total, e) => total + e.size, 0)

/** The wandering of fitness from week to week, as an AR(1) series with the spec's noise as its spread. */
function wanderOf(spec: PlantedSpec): number[] {
  const rho = spec.noiseModel?.autocorrelation ?? 0
  if (!(rho > 0)) return Array.from({ length: spec.weeks }, () => 0)
  const random = mulberry32(seedFrom('wander', spec.seed))
  const out: number[] = []
  let last = 0
  for (let week = 0; week < spec.weeks; week++) {
    last = rho * last + Math.sqrt(1 - rho * rho) * normal(random)
    out.push(spec.noise * last)
  }
  return out
}

/** The athlete's state in one sport in one week: the baseline, the planted effects that have begun, the nuisances. */
export function conditionsAt(
  spec: PlantedSpec,
  sport: Sport,
  week: number,
  wander = 0,
): Conditions {
  const mid = week >= spec.weeks / 2
  const seasonal = has(spec, 'seasonal')
  const season = seasonal ? Math.sin((2 * Math.PI * week) / SEASON_WEEKS) : 0
  // Volume swings a quarter of a year behind fitness, as it does when a season builds.
  const seasonalVolume = seasonal ? Math.sin((2 * Math.PI * (week - 6)) / SEASON_WEEKS) : 0
  const ramp = begun(spec, 'efficiency-ramp', sport, week).reduce(
    (total, e) => total + e.size * (week - e.atWeek + 1),
    0,
  )
  const lost = has(spec, 'missing-hr') ? 0.3 : 0
  return {
    ...BASELINE,
    noise: spec.noise,
    heavyTails: spec.noiseModel?.heavyTails ?? false,
    efficiency:
      begun(spec, 'efficiency-shift', sport, week).reduce((p, e) => p * (1 + e.size), 1) *
      (1 + ramp) *
      (1 + 0.03 * season) *
      (1 + wander),
    reading: has(spec, 'meter-change') && mid ? 1.04 : 1,
    volume:
      begun(spec, 'volume-step', sport, week).reduce((p, e) => p * (1 + e.size), 1) *
      (1 + 0.15 * seasonalVolume),
    hrLost: Math.max(lost, ...begun(spec, 'hr-coverage', sport, week).map((e) => e.size)),
    spikeRate: has(spec, 'hr-spikes') ? 0.05 : 0,
    easyCreepBpm: sum(begun(spec, 'easy-hr-creep', sport, week)),
    decouplingShift: sum(begun(spec, 'decoupling-change', sport, week)),
    retentionShift: sum(begun(spec, 'late-retention-change', sport, week)),
    hrOffsetBpm: has(spec, 'strap-change') && mid ? 6 : 0,
  }
}

/** The weeks with no activity. */
function inBreak(spec: PlantedSpec, week: number): boolean {
  return spec.effects.some(
    (e) => e.type === 'break' && week >= e.atWeek && week < e.atWeek + e.size,
  )
}

/**
 * The sport of every session, week by week. One sport throughout, or two sharing the sessions by a
 * running quota (so one session a week still alternates, and a shift in the share is a shift in how
 * many of all sessions go to the sport, whatever the number a week).
 */
function sportsByWeek(spec: PlantedSpec): Sport[][] {
  const sports = spec.sports ?? ['run']
  const [first, second] = sports
  let owed = 0
  return Array.from({ length: spec.weeks }, (_, week) => {
    if (inBreak(spec, week)) return []
    if (second === undefined) return Array.from({ length: spec.perWeek }, () => first!)
    const shift = spec.effects
      .filter((e) => e.type === 'sport-share-shift' && week >= e.atWeek)
      .reduce((total, e) => total + (e.sport === second ? -e.size : e.size), 0)
    const share = Math.min(1, Math.max(0, 0.5 + shift))
    return Array.from({ length: spec.perWeek }, () => {
      owed += share
      if (owed < 1 - 1e-9) return second
      owed -= 1
      return first!
    })
  })
}

function randomFor(spec: PlantedSpec, week: number, slot: number): () => number {
  const random = mulberry32(spec.seed * 1_000_003 + week * 7_919 + slot * 104_729)
  random()
  random()
  return random
}

function truthOf(effect: Effect, digests: ActivityDigest[], spec: PlantedSpec): Truth {
  const onsetWeek = effect.type === 'break' ? effect.atWeek + effect.size : effect.atWeek
  const onsetMs = MONDAY + onsetWeek * WEEK_MS
  const after = digests.filter((d) => (effect.sport ?? d.sport) === d.sport && d.startMs >= onsetMs)
  return {
    effect,
    onsetMs,
    plantedIds: after.map((d) => d.id),
    realised: realisedSize(effect, digests, after, spec),
  }
}

function realisedSize(
  effect: Effect,
  all: ActivityDigest[],
  after: ActivityDigest[],
  spec: PlantedSpec,
): number {
  const onsetMs = MONDAY + effect.atWeek * WEEK_MS
  if (effect.type === 'hr-coverage') {
    return after.filter((d) => !d.hasHeartRate).length / Math.max(1, after.length)
  }
  if (effect.type === 'sport-share-shift') {
    const lead = effect.sport ?? spec.sports?.[0] ?? 'run'
    const share = (list: ActivityDigest[]) =>
      list.filter((d) => d.sport === lead).length / Math.max(1, list.length)
    return (
      share(all.filter((d) => d.startMs >= onsetMs)) - share(all.filter((d) => d.startMs < onsetMs))
    )
  }
  if (effect.type === 'efficiency-ramp') return effect.size * (spec.weeks - effect.atWeek)
  return effect.size
}

/**
 * A library at the digest level, built to carry known effects: `weeks` weeks from Monday 6 January 2025,
 * `perWeek` activities each, with the planted `effects` and the `nuisances`. Every activity draws its noise
 * from its own seed (seed, week, slot), so planting an effect or dropping a week never moves another
 * activity's noise: two libraries differing in an effect differ in what it touches only, and the same
 * seed without effects is the effect's paired null. Ids are `${sport}-${week}-${slot}`; a duplicate's
 * ends in -dup; the name says the kind of session ("easy run"). Zones are those of a fixed reference
 * heart rate (reset mid-library by the zone-change nuisance).
 */
export function plantedLibrary(spec: PlantedSpec): PlantedLibrary {
  const days = DAYS[spec.perWeek]
  if (days === undefined) throw new Error(`No weekly plan for ${spec.perWeek}`)
  const digests: ActivityDigest[] = []
  const wander = wanderOf(spec)
  const counts: Record<string, number> = {}
  for (const [week, sports] of sportsByWeek(spec).entries()) {
    for (const [slot, sport] of sports.entries()) {
      const random = randomFor(spec, week, slot)
      const id = `${sport}-${week}-${slot}`
      const startMs = MONDAY + (week * 7 + days[slot]!) * DAY_MS
      const count = counts[sport] ?? 0
      counts[sport] = count + 1
      const digest = plantedActivity({
        sport,
        id,
        startMs,
        kind: KIND_ROTATION[count % KIND_ROTATION.length]!,
        index: week * spec.perWeek + slot,
        cond: conditionsAt(spec, sport, week, wander[week]),
        random,
      })
      digests.push(digest)
      if (has(spec, 'duplicates') && random() < 0.05) {
        digests.push({ ...digest, id: `${id}-dup`, startMs: startMs + 90_000 })
      }
    }
  }
  const sorted = digests.sort((a, b) => a.startMs - b.startMs || (a.id < b.id ? -1 : 1))
  return {
    spec,
    digests: sorted,
    setAside: new Set<string>(),
    truths: spec.effects.map((effect) => truthOf(effect, sorted, spec)),
    zones: zonesFromDigests(sorted, has(spec, 'zone-change') ? spec.weeks / 2 : null),
    firstMs: sorted[0]?.startMs ?? MONDAY,
    lastMs: sorted.at(-1)?.startMs ?? MONDAY,
  }
}

export interface NullSpec {
  seed: number
  weeks: number
  perWeek: number
  nuisances?: Nuisance[]
  sports?: Sport[]
  noise?: number
  noiseModel?: NoiseModel
}

/** A library in which nothing changes, optionally with nuisances and a noise model. */
export function nullLibrary(spec: NullSpec): PlantedLibrary {
  return plantedLibrary({ noise: 0.02, ...spec, effects: [] })
}

/** The sizes the engine is held to being silent on: 1, 2 and 4 a week, 26, 52 and 104 weeks. */
export const NULL_GRID = { perWeek: [1, 2, 4], weeks: [26, 52, 104] } as const

export interface NullGridOptions {
  /** Libraries at each size of NULL_GRID. */
  perCell: number
  /** Moves every seed, to draw a different sweep. */
  base?: number
  nuisances?: Nuisance[]
  sports?: Sport[]
  noise?: number
  noiseModel?: NoiseModel
}

/** The athlete-years in a grid of null libraries, for stating how much silence was tested. */
export function gridAthleteYears(perCell: number): number {
  const weeks = NULL_GRID.weeks.reduce((total, w) => total + w, 0)
  return (perCell * NULL_GRID.perWeek.length * weeks) / 52
}

/**
 * Null libraries at every size of NULL_GRID, `perCell` at each. Each library has its own seed, derived
 * from its size and index, so no two share an activity's noise and a short library is not the start of
 * a long one.
 */
export function nullLibraries(options: NullGridOptions): PlantedLibrary[] {
  const { perCell, base = 0, ...rest } = options
  return NULL_GRID.perWeek.flatMap((perWeek) =>
    NULL_GRID.weeks.flatMap((weeks) =>
      Array.from({ length: perCell }, (_, k) =>
        nullLibrary({
          seed: seedFrom('null', base, perWeek, weeks, k) % 1_000_000,
          perWeek,
          weeks,
          ...rest,
        }),
      ),
    ),
  )
}
