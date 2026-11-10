import {
  EXERCISE_CATALOG,
  MAX_HEVY_FILE_BYTES,
  MAX_LIFT_SETS_PER_USER,
  liftSetKey,
  readHevyCsv,
} from '@rca/core/lift'
import type { LiftSet } from '@rca/core/lift'
import type { UnitSystem } from '@rca/core/units'

/** What a Hevy file holds, said before anything is written. */
export interface HevyPreview {
  sets: LiftSet[]
  days: number
  /** Lifts the catalog names, and the lift names kept as typed. */
  catalogLifts: number
  customLifts: string[]
  /** Sets the log holds under the same key with the same values: nothing to write. */
  identical: number
  /** Sets the log holds under the same key with other values: kept unless the athlete chooses to replace. */
  different: LiftSet[]
  /** Sets with no key in the log yet. */
  fresh: LiftSet[]
  /** Sets the log has room for before it holds the most an account keeps. */
  room: number
  /** Rows left out, a reason each; rows kept with a value set aside. */
  skipped: { row: number; reason: string }[]
  adjusted: { row: number; reason: string }[]
}

/** A plain sentence for a file that cannot be read, or null when it may be. */
export function fileProblem(file: { name: string; size: number }): string | null {
  if (!/\.csv$/i.test(file.name)) return 'Choose a .csv file: the workouts export from Hevy.'
  if (file.size === 0) return 'That file is empty.'
  if (file.size > MAX_HEVY_FILE_BYTES)
    return `That file is over ${MAX_HEVY_FILE_BYTES / (1024 * 1024)} MB, too large to read.`
  return null
}

/** Whether two sets with one key say the same thing. */
function sameSet(a: LiftSet, b: LiftSet): boolean {
  return (
    a.reps === b.reps &&
    a.loadKg === b.loadKg &&
    a.rpe === b.rpe &&
    a.time === b.time &&
    a.timePrecision === b.timePrecision &&
    (a.warmup ?? false) === (b.warmup ?? false)
  )
}

/**
 * What an import writes and what it leaves out. New sets are written up to the room the log has; sets that
 * differ from a stored one are written only when `replace` is true, and replacing adds no set.
 */
export function hevyWrites(
  preview: HevyPreview,
  replace: boolean,
): { sets: LiftSet[]; notKept: number } {
  const sets = [...preview.fresh.slice(0, preview.room), ...(replace ? preview.different : [])]
  return { sets, notKept: preview.fresh.length - Math.min(preview.fresh.length, preview.room) }
}

/**
 * Reads a Hevy CSV and sets it against the sets the log holds. A weight column that names no unit is read in the
 * athlete's own. Resolves a refusal as a sentence.
 */
export function previewHevy(
  text: string,
  existing: readonly LiftSet[],
  units: UnitSystem,
): { preview: HevyPreview } | { refused: string } {
  const read = readHevyCsv(text, { units: units === 'imperial' ? 'lb' : 'kg' })
  if ('refused' in read) return { refused: read.refused }
  const held = new Map(existing.map((set) => [liftSetKey(set), set]))
  const fresh: LiftSet[] = []
  const different: LiftSet[] = []
  let identical = 0
  for (const set of read.sets) {
    const stored = held.get(liftSetKey(set))
    if (stored === undefined) fresh.push(set)
    else if (sameSet(stored, set)) identical++
    else different.push(set)
  }
  const lifts = new Set(read.sets.map((set) => set.exercise))
  const inCatalog = [...lifts].filter((slug) => Object.hasOwn(EXERCISE_CATALOG, slug))
  return {
    preview: {
      sets: read.sets,
      days: new Set(read.sets.map((set) => set.date)).size,
      catalogLifts: inCatalog.length,
      customLifts: read.customExercises,
      identical,
      different,
      fresh,
      room: Math.max(0, MAX_LIFT_SETS_PER_USER - held.size),
      skipped: read.skipped,
      adjusted: read.adjusted,
    },
  }
}
