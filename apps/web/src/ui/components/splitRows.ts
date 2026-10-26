import type { DigestSplit, DigestSplits } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import {
  METRES_PER_KM,
  METRES_PER_MILE,
  formatElevation,
  formatPace,
  formatPartialDistance,
} from '@rca/core/units'

/** What the page knows about one run's splits: still loading, not loaded, or loaded. */
export type SplitsLoad =
  | { status: 'loading' }
  | { status: 'failed' }
  /** `splits` is null when the run's digest was made before splits were kept. */
  | { status: 'loaded'; splits: DigestSplits | null }

/** One row, as both representations show it. A null field is a value the digest could not give. */
export interface SplitCells {
  label: string
  fastest: boolean
  pace: string | null
  /** Width of the pace bar, from zero to the fastest known pace, as a percentage. */
  barPercent: number | null
  gradeAdjustedPace: string | null
  elevation: string | null
  heartRate: string | null
}

/** The optional figures that earn a column: each is left out when it would say nothing new. */
export interface Columns {
  flat: boolean
  elevation: boolean
}

/**
 * The rows in display form. A split whose time is unknown has no pace, so it is not marked fastest
 * and does not set the bar scale. Whether a column shows is columnsOf's decision, not this one's.
 */
export function cellsOf(rows: DigestSplit[], units: UnitSystem): SplitCells[] {
  const unitMetres = units === 'imperial' ? METRES_PER_MILE : METRES_PER_KM
  const speeds = rows.map((split) =>
    split.seconds === null ? null : split.distanceM / split.seconds,
  )
  const known = speeds.filter((speed): speed is number => speed !== null)
  const fastest = known.length > 0 ? Math.max(...known) : null
  // Only the first split at the fastest pace is marked, so a tie does not mark two rows.
  const fastestIndex = fastest === null ? -1 : speeds.indexOf(fastest)
  return rows.map((split, index) => {
    const speed = speeds[index]!
    const gradeAdjusted = split.gradeAdjustedSeconds
    return {
      label:
        split.distanceM < unitMetres
          ? formatPartialDistance(split.distanceM, units)
          : `${index + 1}`,
      fastest: index === fastestIndex,
      pace: speed === null ? null : formatPace(speed, units),
      barPercent: speed === null || fastest === null ? null : (speed / fastest) * 100,
      gradeAdjustedPace:
        gradeAdjusted === null ? null : formatPace(split.distanceM / gradeAdjusted, units),
      elevation:
        split.elevationGainM === null ? null : formatElevation(split.elevationGainM, units),
      heartRate: split.avgHeartRate === null ? null : `${Math.round(split.avgHeartRate)} bpm`,
    }
  })
}

/**
 * Elevation gain has a column when some split climbs. Flat pace has one when some split has a flat pace
 * that differs from its pace, so a column never repeats the one beside it, and never holds only dashes.
 */
export function columnsOf(rows: DigestSplit[], cells: SplitCells[]): Columns {
  return {
    elevation: rows.some((split) => (split.elevationGainM ?? 0) > 0),
    flat: cells.some(
      (cell) => cell.gradeAdjustedPace !== null && cell.gradeAdjustedPace !== cell.pace,
    ),
  }
}

/** The splits in the unit the athlete reads: miles in imperial, kilometres in metric. */
export function rowsOf(splits: DigestSplits, units: UnitSystem): DigestSplit[] {
  return units === 'imperial' ? splits.mile : splits.km
}

/**
 * Whether the splits show the flat pace note, which they do with their flat pace column: they have rows,
 * and some split's flat pace differs from its pace. Otherwise the note belongs under the best efforts.
 */
export function splitsShowFlatNote(load: SplitsLoad, units: UnitSystem): boolean {
  if (load.status !== 'loaded' || load.splits === null) return false
  const rows = rowsOf(load.splits, units)
  return rows.length > 0 && columnsOf(rows, cellsOf(rows, units)).flat
}
