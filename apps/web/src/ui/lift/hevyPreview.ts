import { EXERCISE_CATALOG, MAX_HEVY_FILE_BYTES, liftSetKey, readHevyCsv } from '@rca/core/lift'
import type { LiftSet } from '@rca/core/lift'
import type { UnitSystem } from '@rca/core/units'

/** What a Hevy file holds, said before anything is written. */
export interface HevyPreview {
  sets: LiftSet[]
  days: number
  /** Lifts the catalog names, and the lift names kept as typed. */
  catalogLifts: number
  customLifts: string[]
  /** Sets whose key the log already holds: they are replaced. */
  replaced: number
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
  const held = new Set(existing.map(liftSetKey))
  const lifts = new Set(read.sets.map((set) => set.exercise))
  const inCatalog = [...lifts].filter((slug) => Object.hasOwn(EXERCISE_CATALOG, slug))
  return {
    preview: {
      sets: read.sets,
      days: new Set(read.sets.map((set) => set.date)).size,
      catalogLifts: inCatalog.length,
      customLifts: read.customExercises,
      replaced: read.sets.filter((set) => held.has(liftSetKey(set))).length,
      skipped: read.skipped,
      adjusted: read.adjusted,
    },
  }
}
