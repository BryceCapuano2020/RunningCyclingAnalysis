import { DAY_MS } from '../constants'
import type { FitnessState } from '../fitness/types'
import type { Sport } from '../types'
import { decodeSeconds } from './snapshot'
import type { CheckInSnapshot, SnapshotBest, SnapshotEpisode } from './snapshot'
import type { EpisodeKind, MilestoneEffort, MilestoneUnit } from './types'

/**
 * "Since your last import": the library as it was before the import against the library as it is. Every line is a
 * fact about what the import added or what the fitness card's own rules changed; the check-in makes no level
 * contrast of its own, so it can never say a different thing from the card.
 */

const SPORTS: readonly Sport[] = ['run', 'ride']

/** A workout is "found in older files" when it starts this long before the newest workout the baseline held. */
export const OLDER_DAYS = 28
/** Most of each list the check-in carries. */
const MOST = { bests: 3, episodes: 3 } as const

/** A best set since the baseline, by a workout that is new. */
export interface NewBest {
  sport: Sport
  effort: MilestoneEffort
  unit: MilestoneUnit
  value: number
  /** The best at this effort in the baseline. */
  previous: number
  atMs: number
  /** Set by a workout found in older files, not a recent one. */
  older: boolean
}

export type FitnessLine =
  /** The card's state is not what it was at the baseline. */
  | { sport: Sport; kind: 'moved'; from: FitnessState; to: FitnessState }
  /** The same state, begun again since the baseline. */
  | { sport: Sport; kind: 'began'; state: FitnessState; sinceMs: number }
  /** The same state with no event: quoted as the card has it, `within` set while holding. */
  | { sport: Sport; kind: 'same'; state: FitnessState; within: number | null }

export interface NewEpisode {
  sport: Sport
  kind: EpisodeKind
  fromMs: number
  toMs: number | null
}

export interface CheckIn {
  /** When the baseline was taken. */
  sinceMs: number
  added: Record<Sport, number>
  /** Of the added workouts, those found in older files, and the stretch they cover; null when there are none. */
  older: Record<Sport, { count: number; fromMs: number; toMs: number } | null>
  bests: NewBest[]
  fitness: FitnessLine[]
  episodes: NewEpisode[]
  /** The model changed since the baseline, so only the workouts added are told. */
  modelChanged: boolean
  /** Nothing to tell beyond what was added: no new best, no change of fitness, no new episode, no older files. */
  quiet: boolean
}

const effortId = (e: MilestoneEffort) =>
  e.kind === 'duration' ? `d${e.durationS}` : `m${e.distanceM}`

/** What a value is, as the page writes it, in whole units, higher meaning better: a pace in whole seconds a kilometre, a power in whole watts. */
function shown(unit: MilestoneUnit, value: number): number {
  switch (unit) {
    case 'm/s':
      return -Math.round(1000 / value)
    case 's':
      return -Math.round(value)
    case 'W':
      return Math.round(value)
    case 'W/kg':
      return Math.round(value * 100)
  }
}

/** Whether `value` beats `previous` by a whole unit of the page's own. */
export const beatsShown = (unit: MilestoneUnit, value: number, previous: number): boolean =>
  shown(unit, value) > shown(unit, previous)

/** How much better, as a fraction of the previous best, for ordering. */
const gain = (b: SnapshotBest, previous: number): number => Math.abs(b.value / previous - 1)

function newBests(base: CheckInSnapshot, live: CheckInSnapshot, olderKeys: Set<string>): NewBest[] {
  const kept = new Set(SPORTS.flatMap((s) => decodeSeconds(base.keys[s]).map((t) => `${s}-${t}`)))
  return SPORTS.flatMap((sport) =>
    live.bests[sport].flatMap((best) => {
      const was = base.bests[sport].find((b) => effortId(b.effort) === effortId(best.effort))
      if (was === undefined || kept.has(best.key)) return []
      if (!beatsShown(best.unit, best.value, was.value)) return []
      return [{ sport, best, was, older: olderKeys.has(best.key) }]
    }),
  )
    .sort((a, b) => gain(b.best, b.was.value) - gain(a.best, a.was.value))
    .slice(0, MOST.bests)
    .map(({ sport, best, was, older }) => ({
      sport,
      effort: best.effort,
      unit: best.unit,
      value: best.value,
      previous: was.value,
      atMs: best.atMs,
      older,
    }))
}

function fitnessLines(base: CheckInSnapshot, live: CheckInSnapshot): FitnessLine[] {
  return SPORTS.flatMap((sport): FitnessLine[] => {
    const [was, now] = [base.fitness[sport], live.fitness[sport]]
    if (was === null || now === null) return []
    if (was.state === 'not-enough-evidence' || now.state === 'not-enough-evidence') return []
    if (was.state !== now.state) return [{ sport, kind: 'moved', from: was.state, to: now.state }]
    // An event is a state that began since the baseline, not one the baseline already showed.
    if (now.enteredMs !== null && now.enteredMs !== was.enteredMs && now.enteredMs > base.atMs) {
      return [{ sport, kind: 'began', state: now.state, sinceMs: now.enteredMs }]
    }
    return [{ sport, kind: 'same', state: now.state, within: now.within }]
  })
}

/** Share of `a` that `b` covers, by time. */
function covered(a: SnapshotEpisode, b: SnapshotEpisode, endMs: number): number {
  const [aTo, bTo] = [a.toMs ?? endMs, b.toMs ?? endMs]
  const length = Math.max(aTo - a.fromMs, 7 * DAY_MS)
  return Math.max(0, Math.min(aTo, bTo) - Math.max(a.fromMs, b.fromMs)) / length
}

/**
 * Episodes the hindsight now lists that the baseline's did not, that began before the baseline's newest workout and
 * hold a workout found in older files: the backfilled data is what produced them.
 */
function newEpisodes(
  base: CheckInSnapshot,
  live: CheckInSnapshot,
  olderMs: Record<Sport, number[]>,
): NewEpisode[] {
  const cutoff = base.asOfMs - OLDER_DAYS * DAY_MS
  return SPORTS.flatMap((sport) =>
    live.episodes[sport]
      .filter((e) => e.fromMs < cutoff)
      .filter((e) => olderMs[sport].some((t) => t >= e.fromMs && t <= (e.toMs ?? live.asOfMs)))
      .filter(
        (e) =>
          !base.episodes[sport].some((b) => b.kind === e.kind && covered(e, b, live.asOfMs) >= 0.5),
      )
      .map((e) => ({ sport, kind: e.kind, fromMs: e.fromMs, toMs: e.toMs })),
  )
    .sort((a, b) => b.fromMs - a.fromMs)
    .slice(0, MOST.episodes)
}

/**
 * The check-in between a baseline and the library as it stands now; null without a baseline (a first import). When the
 * model changed in between only the workouts added are told, because a best or a fitness state from another model is
 * not comparable.
 */
export function checkInBetween(
  baseline: CheckInSnapshot | null,
  live: CheckInSnapshot,
): CheckIn | null {
  if (baseline === null) return null
  const cutoff = baseline.asOfMs - OLDER_DAYS * DAY_MS
  const added = { run: 0, ride: 0 }
  const older: CheckIn['older'] = { run: null, ride: null }
  const olderMs: Record<Sport, number[]> = { run: [], ride: [] }
  const olderKeys = new Set<string>()
  for (const sport of SPORTS) {
    const had = new Set(decodeSeconds(baseline.keys[sport]))
    for (const second of decodeSeconds(live.keys[sport])) {
      if (had.has(second)) continue
      added[sport]++
      const ms = second * 1000
      if (ms >= cutoff) continue
      olderKeys.add(`${sport}-${second}`)
      olderMs[sport].push(ms)
      const span = older[sport]
      older[sport] = {
        count: (span?.count ?? 0) + 1,
        fromMs: Math.min(span?.fromMs ?? ms, ms),
        toMs: Math.max(span?.toMs ?? ms, ms),
      }
    }
  }
  const modelChanged = baseline.revision !== live.revision
  const counted = { sinceMs: baseline.atMs, added, older, modelChanged }
  if (modelChanged) {
    return { ...counted, bests: [], fitness: [], episodes: [], quiet: false }
  }
  const bests = newBests(baseline, live, olderKeys)
  const fitness = fitnessLines(baseline, live)
  const episodes = newEpisodes(baseline, live, olderMs)
  const quiet =
    bests.length === 0 &&
    episodes.length === 0 &&
    older.run === null &&
    older.ride === null &&
    fitness.every((l) => l.kind === 'same')
  return { ...counted, bests, fitness, episodes, quiet }
}
