import { orderedFor } from '../digest/consumers'
import { workoutKey } from '../duplicates'
import type { FitnessBySport, FitnessState } from '../fitness/types'
import type { ActivityDigest, Sport } from '../types'
import type { LookBack } from './compute'
import type { EpisodeKind, MilestoneEffort, MilestoneUnit } from './types'

/**
 * What a library looked like at one import, kept to compare the next library with ("since your last import"). Small
 * whatever the library's size: the workouts are kept as one delta-encoded string a sport, the rest as a handful of
 * words and figures. No route, name, heart rate or file is in it.
 */

const SPORTS: readonly Sport[] = ['run', 'ride']

/** A best effort as the snapshot kept it: what it was, how good, when, and the workout that set it. */
export interface SnapshotBest {
  effort: MilestoneEffort
  unit: MilestoneUnit
  value: number
  atMs: number
  /** The workout key (sport and start second) of the activity that set it. */
  key: string
}

/** A sport's fitness status as the card showed it: the state word and what the check-in may quote of it. */
export interface SnapshotFitness {
  state: FitnessState
  referenceHr: number | null
  /** When the state began (the end of the week it was first shown); null for one that was never interrupted. */
  enteredMs: number | null
  /** How far from level the runs allow the athlete to be, in log units; null unless holding. */
  within: number | null
}

export interface SnapshotEpisode {
  kind: EpisodeKind
  fromMs: number
  toMs: number | null
}

export interface CheckInSnapshot {
  v: 1
  /** MODEL_REVISION when taken: numbers across revisions are not comparable. */
  revision: number
  /** The exact wall-clock millisecond it was taken, never cut to the day. */
  atMs: number
  /** The newest activity's start. */
  asOfMs: number
  /** Start seconds of each sport's workouts, sorted, as differences in base 36 (see `encodeSeconds`). */
  keys: Record<Sport, string>
  counts: Record<Sport, number>
  bests: Record<Sport, SnapshotBest[]>
  fitness: Record<Sport, SnapshotFitness | null>
  episodes: Record<Sport, SnapshotEpisode[]>
}

export interface SnapshotInputs {
  /** The library as the analysis reads it: duplicates hidden, walking-pace runs left out. */
  digests: ActivityDigest[]
  fitness: FitnessBySport
  lookBack: LookBack
  revision: number
}

/** Sorted whole seconds as the first value and then each difference, in base 36, comma separated. */
export function encodeSeconds(sorted: readonly number[]): string {
  let previous = 0
  return sorted
    .map((s, i) => {
      const part = (i === 0 ? s : s - previous).toString(36)
      previous = s
      return part
    })
    .join(',')
}

export function decodeSeconds(encoded: string): number[] {
  if (encoded === '') return []
  let total = 0
  return encoded.split(',').map((part) => (total += Number.parseInt(part, 36)))
}

/** The seconds of a sport's workouts, each once, oldest first; the same workouts `workoutKey` tells apart. */
const secondsOf = (digests: readonly ActivityDigest[], sport: Sport): number[] =>
  [
    ...new Set(digests.filter((d) => d.sport === sport).map((d) => Math.round(d.startMs / 1000))),
  ].sort((a, b) => a - b)

/** The snapshot of the library as it stands, taken at `nowMs`. Pure: the same library and clock give the same snapshot. */
export function snapshotOf(inputs: SnapshotInputs, nowMs: number): CheckInSnapshot {
  const digests = orderedFor('listing', inputs.digests)
  const keyOfId = new Map(digests.map((d) => [d.id, workoutKey(d.sport, d.startMs)]))
  const seconds = Object.fromEntries(SPORTS.map((s) => [s, secondsOf(digests, s)])) as Record<
    Sport,
    number[]
  >
  const per = <T>(f: (sport: Sport) => T) =>
    Object.fromEntries(SPORTS.map((s) => [s, f(s)])) as Record<Sport, T>
  return {
    v: 1,
    revision: inputs.revision,
    atMs: nowMs,
    asOfMs: digests.reduce((newest, d) => Math.max(newest, d.startMs), 0),
    keys: per((s) => encodeSeconds(seconds[s])),
    counts: per((s) => seconds[s].length),
    bests: per((s) =>
      inputs.lookBack.sports[s].milestones.flatMap((m) => {
        const key = keyOfId.get(m.best.id)
        return key === undefined
          ? []
          : [{ effort: m.effort, unit: m.unit, value: m.best.value, atMs: m.best.atMs, key }]
      }),
    ),
    fitness: per((s) => {
      const status = inputs.fitness[s]
      if (status.shortfall?.kind === 'unavailable') return null
      return {
        state: status.state,
        referenceHr: status.referenceHr,
        enteredMs: status.entered?.atMs ?? null,
        within: status.within,
      }
    }),
    episodes: per((s) => {
      const years = inputs.lookBack.sports[s].fitness
      return years.kind === 'ok'
        ? years.episodes.map((e) => ({ kind: e.kind, fromMs: e.fromMs, toMs: e.toMs }))
        : []
    }),
  }
}
