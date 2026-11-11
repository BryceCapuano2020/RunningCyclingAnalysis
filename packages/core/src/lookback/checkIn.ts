import { DAY_MS } from '../constants'
import type { Sport } from '../types'
import { SPORTS } from '../types'
import { decodeSeconds } from './snapshot'
import type { CheckInSnapshot, SnapshotBest } from './snapshot'
import type { MilestoneEffort, MilestoneUnit } from './types'

/**
 * "Since your last import": the library as it was before the import against the library as it is. Every line is a
 * fact about what the import added: workouts, new bests and files older than the baseline.
 */

/** A workout is "found in older files" when it starts this long before the newest workout the baseline held. */
export const OLDER_DAYS = 28
/** Most of each list the check-in carries. */
const MOST = { bests: 3 } as const

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

export interface CheckIn {
  /** When the baseline was taken. */
  sinceMs: number
  added: Record<Sport, number>
  /** Of the added workouts, those found in older files, and the stretch they cover; null when there are none. */
  older: Record<Sport, { count: number; fromMs: number; toMs: number } | null>
  bests: NewBest[]
  /** Nothing to tell beyond what was added: no new best and no older files. */
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

/**
 * The check-in between a baseline and the library as it stands now; null without a baseline (a first import). The
 * caller passes only a baseline of the model the live snapshot was taken with (see `usableBaseline`): numbers across
 * model revisions are never compared.
 */
export function checkInBetween(
  baseline: CheckInSnapshot | null,
  live: CheckInSnapshot,
): CheckIn | null {
  if (baseline === null) return null
  const cutoff = baseline.asOfMs - OLDER_DAYS * DAY_MS
  const added = { run: 0, ride: 0 }
  const older: CheckIn['older'] = { run: null, ride: null }
  const olderKeys = new Set<string>()
  for (const sport of SPORTS) {
    const had = new Set(decodeSeconds(baseline.keys[sport]))
    for (const second of decodeSeconds(live.keys[sport])) {
      if (had.has(second)) continue
      added[sport]++
      const ms = second * 1000
      if (ms >= cutoff) continue
      olderKeys.add(`${sport}-${second}`)
      const span = older[sport]
      older[sport] = {
        count: (span?.count ?? 0) + 1,
        fromMs: Math.min(span?.fromMs ?? ms, ms),
        toMs: Math.max(span?.toMs ?? ms, ms),
      }
    }
  }
  const bests = newBests(baseline, live, olderKeys)
  const quiet = bests.length === 0 && older.run === null && older.ride === null
  return { sinceMs: baseline.atMs, added, older, bests, quiet }
}
