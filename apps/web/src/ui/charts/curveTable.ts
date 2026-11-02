import type { ChangeEvidence } from '@rca/core/change/types'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatDuration, formatWkg } from '@rca/core/units'
import { SPORT_FORMAT } from '../sports'
import { activityCell, sourceNote } from './activityText'
import { carriedNote } from './carriedStretches'
import { nativeLabel, formatNative, paceUnitName } from './sportAxis'

/** The table's caption for each sport: what its values are, in the sport's unit. */
const CAPTION: Record<Sport, (units: UnitSystem, dated: boolean) => string> = {
  run: (units) => `Best GAP at each duration, ${paceUnitName(units)}.`,
  ride: (_units, dated) =>
    `Best power at each duration, in watts, with W/kg at your body mass${dated ? ' on the day of each ride' : ''}.`,
}

/** One duration's values, in each period, with the activity its current value is from. */
export interface CurveRow {
  durationS: number
  /** NaN where the sport has no effort of this duration. */
  value: number
  /** NaN where the period before has none. */
  previous: number
  activityId: string | null
  /** Whether the value is a longer effort's, carried down the curve by the envelope. */
  carried?: boolean
  /** Whether the previous period's value is carried the same way. */
  previousCarried?: boolean
  /** The length, s, of the effort a carried value belongs to. */
  carriedFromS?: number
}

/** What the tooltips and the table need, bundled so that they are passed together. */
export interface View {
  sport: Sport
  units: UnitSystem
  massKg: number
  /** The body mass on each activity's date, by id, when masses are dated; otherwise massKg stands. */
  masses: Record<string, number> | undefined
  previous: { label: string } | null
  /** The change test for that period, which the finding and its marked effort read. */
  change: ChangeEvidence | null
  names: Record<string, string> | undefined
  /** The activity every value is from, which the caption names instead of a column, or null. */
  shared: string | null
}

/** A row's mechanical W/kg, at the body mass on the date of the activity the value is from. */
export function wkgOf(row: CurveRow, view: View): number {
  const dated = row.activityId === null ? undefined : view.masses?.[row.activityId]
  return row.value / (dated ?? view.massKg)
}

/** The table's caption, saying what its values are, and which activity they all come from, if one did. */
export function captionOf(view: View): string {
  const base = CAPTION[view.sport](view.units, Object.keys(view.masses ?? {}).length > 0)
  const from = view.shared === null ? undefined : sourceNote(view.shared, view.names)
  return from === undefined ? base : `${base} Every value is ${from}.`
}

/** The From column is kept only when the values come from more than one activity. */
export function columnsOf(view: View): string[] {
  return [
    'Duration',
    nativeLabel(view.sport),
    ...(SPORT_FORMAT[view.sport].showsWkg ? ['W/kg'] : []),
    ...(view.previous ? [view.previous.label] : []),
    ...(view.shared === null ? ['From'] : []),
  ]
}

/** A row's duration, with the effort a carried value belongs to: "30 min, from your 60 min effort". */
function carriedCell(row: CurveRow): string {
  const duration = formatDuration(row.durationS)
  return row.carried === true && row.carriedFromS !== undefined
    ? `${duration}, ${carriedNote(row.carriedFromS)}`
    : duration
}

export function tableRow(row: CurveRow, view: View): string[] {
  return [
    carriedCell(row),
    formatNative(view.sport, row.value, view.units),
    ...(SPORT_FORMAT[view.sport].showsWkg ? [formatWkg(wkgOf(row, view))] : []),
    ...(view.previous ? [formatNative(view.sport, row.previous, view.units)] : []),
    ...(view.shared === null ? [activityCell(row.activityId, view.names)] : []),
  ]
}
