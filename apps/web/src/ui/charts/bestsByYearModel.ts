import { HALF_MARATHON_M, MARATHON_M } from '@rca/core/constants'
import type { BestEffort, YearBest } from '@rca/core/history'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { METRES_PER_KM, METRES_PER_MILE, PACE_UNIT, formatRecordTime } from '@rca/core/units'
import { effortLabel, paceIsTime } from '../records'
import { formatNative, plottedValue } from './sportAxis'

/** One year's best at one length, ready to draw and to read. */
export interface BestMark {
  year: number
  /** The sport's own number: a speed in m/s for a run, watts for a ride. */
  native: number
  /** The value on the panel's axis: seconds per mile or kilometre for a run (faster is smaller), watts for a ride. */
  plotted: number
  /** The sport's own number as text, with its unit: "6:41 /mi" or "312 W". */
  text: string
  /** A run's time over the distance, "20:46"; null for a ride, and for the mile or kilometre whose pace is its time. */
  time: string | null
  /** Whether heart rate shows the effort was hard; a best that was not is still the year's best, as a floor. */
  hard: boolean
}

/** One length's small chart: its name, and a mark for each year of the axis (null where the year has no best). */
export interface BestPanel {
  length: number
  label: string
  marks: (BestMark | null)[]
  /** The index in `marks` of the all-time best; the earliest year where two tie. */
  best: number
}

export interface BestsModel {
  sport: Sport
  /** Every year from the first with a best to the last, so a year without one is an empty room. */
  years: number[]
  panels: BestPanel[]
  /** Whether any mark is a floor, and whether any is hard: the key names the two when both are there. */
  anyFloor: boolean
  anyHard: boolean
}

/** A run distance's name on its panel. */
const DISTANCE_LABEL = new Map<number, string>([
  [METRES_PER_MILE, 'Mile'],
  [5 * METRES_PER_KM, '5 km'],
  [10 * METRES_PER_KM, '10 km'],
  [HALF_MARATHON_M, 'Half marathon'],
  [MARATHON_M, 'Marathon'],
])

/** What a length is called on its panel: a run's distance, a ride's duration. */
const LENGTH_LABEL: Record<Sport, (length: number) => string> = {
  run: (metres) => DISTANCE_LABEL.get(metres) ?? `${metres / METRES_PER_KM} km`,
  ride: effortLabel,
}

/** A best's value in the sport's own number: a run's time over its distance as a speed, a ride's watts as they are. */
const NATIVE_OF: Record<Sport, (value: number, length: number) => number> = {
  run: (seconds, metres) => metres / seconds,
  ride: (watts) => watts,
}

/** A run's time over its distance as the clock reads it; none for a ride, and none where the pace is the time. */
const TIME_OF: Record<
  Sport,
  (seconds: number, length: number, units: UnitSystem) => string | null
> = {
  run: (seconds, metres, units) => (paceIsTime(metres, units) ? null : formatRecordTime(seconds)),
  ride: () => null,
}

function markOf(
  sport: Sport,
  length: number,
  [year, value, hard]: YearBest,
  units: UnitSystem,
): BestMark {
  const native = NATIVE_OF[sport](value, length)
  return {
    year,
    native,
    plotted: plottedValue(sport, native, units),
    text: formatNative(sport, native, units),
    time: TIME_OF[sport](value, length, units),
    hard,
  }
}

/** The index of the highest native value, the earliest where two tie; -1 with none. */
function bestOf(marks: readonly (BestMark | null)[]): number {
  let best = -1
  marks.forEach((mark, i) => {
    if (mark !== null && (best < 0 || mark.native > marks[best]!.native)) best = i
  })
  return best
}

/**
 * The small charts of a sport's bests by year: one panel for each length that has a best, on a shared run of years.
 * Null where the sport has no best at all.
 */
export function bestsModel(
  sport: Sport,
  efforts: readonly BestEffort[],
  units: UnitSystem,
): BestsModel | null {
  const held = efforts.filter((effort) => effort.years.length > 0)
  const all = held.flatMap((effort) => effort.years.map(([year]) => year))
  if (all.length === 0) return null
  const first = Math.min(...all)
  const years = Array.from({ length: Math.max(...all) - first + 1 }, (_, i) => first + i)
  const panels = held.map((effort): BestPanel => {
    const marks = years.map((year) => {
      const found = effort.years.find(([y]) => y === year)
      return found === undefined ? null : markOf(sport, effort.length, found, units)
    })
    return {
      length: effort.length,
      label: LENGTH_LABEL[sport](effort.length),
      marks,
      best: bestOf(marks),
    }
  })
  const marks = panels.flatMap((panel) => panel.marks).filter((mark) => mark !== null)
  return {
    sport,
    years,
    panels,
    anyFloor: marks.some((mark) => !mark.hard),
    anyHard: marks.some((mark) => mark.hard),
  }
}

/** The line under a bests chart's title: its unit, and which way is better. */
const UNIT_NOTE: Record<Sport, (units: UnitSystem) => string> = {
  run: (units) => `Pace (${PACE_UNIT[units]}), faster up`,
  ride: () => 'Power (W)',
}

export const bestsNote = (sport: Sport, units: UnitSystem): string => UNIT_NOTE[sport](units)

/** What a mark says beside its value: the time, the all-time best, and that it is a floor. */
export function markNote(mark: BestMark, isBest: boolean): string | undefined {
  const parts = [
    mark.time,
    isBest ? 'All-time best' : null,
    mark.hard ? null : 'Not confirmed hard',
  ].filter((part) => part !== null)
  return parts.length === 0 ? undefined : parts.join(', ')
}

/** A mark as a table cell: a floor says so first. */
export const markCell = (mark: BestMark | null): string =>
  mark === null ? 'None' : mark.hard ? mark.text : `At least ${mark.text}`
