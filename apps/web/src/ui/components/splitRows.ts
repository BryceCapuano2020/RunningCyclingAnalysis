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

/** Which view of the splits is open: the whole kilometres or miles, or the laps the device recorded. */
export type SplitsViewName = 'units' | 'laps'

/** One row, as both representations show it. A null field is a value the digest could not give. */
export interface SplitCells {
  label: string
  fastest: boolean
  pace: string | null
  /** Width of the pace bar, from zero to the fastest known pace, as a percentage. */
  barPercent: number | null
  gradeAdjustedPace: string | null
  /** The flat pace was left out because a steep descent makes it far slower than the pace run. */
  flatWithheld: boolean
  elevation: string | null
  heartRate: string | null
  /** The extent of a recorded lap, which laps differ in and the whole units of splits do not. */
  lap?: { time: string | null; distance: string | null }
}

/** The optional figures that earn a column: each is left out when it would say nothing new. */
export interface Columns {
  flat: boolean
  elevation: boolean
  /** Some flat pace in the column is left out for a steep descent, which the page says once. */
  steepDescent: boolean
  /** Laps show the time and distance of each lap, because laps are not all one length. */
  lap: boolean
}

/**
 * A flat pace is left out when its time is more than this many times the pace run. Downhill running
 * costs less energy than level running, so the level pace of the same effort is slower than the pace
 * run: 1.16 times at a 3% descent and 1.34 times at 6%, by the energy model's cost of running. Past 1.5,
 * about an 8.5% descent, the steepness is where the model is least sure and braking is much of the
 * effort, so the figure says little.
 */
export const FLAT_PACE_MAX_RATIO = 1.5

/** Whether the flat time is so far past the time run that the flat pace is left out. */
function flatWithheldFor(split: DigestSplit): boolean {
  const { seconds, gradeAdjustedSeconds } = split
  return (
    seconds !== null &&
    gradeAdjustedSeconds !== null &&
    seconds > 0 &&
    gradeAdjustedSeconds > seconds * FLAT_PACE_MAX_RATIO
  )
}

/**
 * The fastest speed among the known ones, and the index of the row to mark with it. Only the first row
 * at that speed is marked, so a tie does not mark two, and none is marked unless two rows have a speed:
 * a lone row is not the fastest of anything.
 */
export function fastestOf(speeds: (number | null)[]): {
  fastest: number | null
  fastestIndex: number
} {
  const known = speeds.filter((speed): speed is number => speed !== null)
  const fastest = known.length > 0 ? Math.max(...known) : null
  return {
    fastest,
    fastestIndex: fastest === null || known.length < 2 ? -1 : speeds.indexOf(fastest),
  }
}

/**
 * The rows in display form. A split whose time is unknown has no pace, so it is not marked fastest
 * and does not set the bar scale; nor is a lone split, which has nothing to be fastest among. Nor is the
 * partial last split, which is shorter than a unit: a few metres' pace is too noisy to be the best, and
 * it lands there in a quarter of runs. Its bar is capped at the full width, and a lone partial split, on
 * a run shorter than one unit, is its own scale at the full width. Whether a column shows is
 * columnsOf's decision, not this one's.
 */
export function cellsOf(rows: DigestSplit[], units: UnitSystem): SplitCells[] {
  const unitMetres = units === 'imperial' ? METRES_PER_MILE : METRES_PER_KM
  const speeds = rows.map((split) =>
    split.seconds === null ? null : split.distanceM / split.seconds,
  )
  const { fastest, fastestIndex } = fastestOf(
    speeds.map((speed, index) => (rows[index]!.distanceM < unitMetres ? null : speed)),
  )
  // With no whole unit to scale by, as on a run shorter than one, the partial split sets its own scale.
  const known = speeds.filter((speed): speed is number => speed !== null)
  const scale = fastest ?? (known.length > 0 ? Math.max(...known) : null)
  return rows.map((split, index) => {
    const speed = speeds[index]!
    const withheld = flatWithheldFor(split)
    const gradeAdjusted = withheld ? null : split.gradeAdjustedSeconds
    return {
      label:
        split.distanceM < unitMetres
          ? formatPartialDistance(split.distanceM, units)
          : `${index + 1}`,
      fastest: index === fastestIndex,
      pace: speed === null ? null : formatPace(speed, units),
      barPercent: speed === null || scale === null ? null : Math.min(100, (speed / scale) * 100),
      gradeAdjustedPace:
        gradeAdjusted === null ? null : formatPace(split.distanceM / gradeAdjusted, units),
      flatWithheld: withheld,
      elevation:
        split.elevationGainM === null ? null : formatElevation(split.elevationGainM, units),
      heartRate: split.avgHeartRate === null ? null : `${Math.round(split.avgHeartRate)} bpm`,
    }
  })
}

/**
 * Elevation gain has a column when some split climbs. Flat pace has one when some split has a flat pace
 * that differs from its pace, so a column never repeats the one beside it, and never holds only dashes.
 * The steep descent note shows with that column, when some split in it has its flat pace left out.
 */
export function columnsOf(rows: DigestSplit[], cells: SplitCells[]): Columns {
  const flat = cells.some(
    (cell) => cell.gradeAdjustedPace !== null && cell.gradeAdjustedPace !== cell.pace,
  )
  return {
    elevation: rows.some((split) => (split.elevationGainM ?? 0) > 0),
    flat,
    steepDescent: flat && cells.some((cell) => cell.flatWithheld),
    lap: cells.some((cell) => cell.lap !== undefined),
  }
}

/** The splits in the unit the athlete reads: miles in imperial, kilometres in metric. */
export function rowsOf(splits: DigestSplits, units: UnitSystem): DigestSplit[] {
  return units === 'imperial' ? splits.mile : splits.km
}

/** Whether the page lists splits for the run: they loaded and have a row in the athlete's unit. */
export function splitsListed(load: SplitsLoad, units: UnitSystem): boolean {
  return load.status === 'loaded' && load.splits !== null && rowsOf(load.splits, units).length > 0
}
