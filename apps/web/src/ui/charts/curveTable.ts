import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatDuration, formatWkg } from '@rca/core/units'
import { SPORT_FORMAT } from '../sports'
import { activityCell, sourceNote } from './activityText'
import { nativeLabel, formatNative, paceUnitName } from './sportAxis'

/** The table's caption for each sport: what its values are, in the sport's unit. */
const CAPTION: Record<Sport, (units: UnitSystem) => string> = {
  run: (units) => `Best flat pace at each duration, ${paceUnitName(units)}.`,
  ride: () => 'Best power at each duration, in watts, with W/kg at your body mass.',
}

/** One duration's values, in each period, with the activity its current value is from. */
export interface CurveRow {
  durationS: number
  /** NaN where the sport has no effort of this duration. */
  value: number
  /** NaN where the period before has none. */
  previous: number
  activityId: string | null
}

/** What the tooltips and the table need, bundled so that they are passed together. */
export interface View {
  sport: Sport
  units: UnitSystem
  massKg: number
  previous: { label: string } | null
  names: Record<string, string> | undefined
  /** The activity every value is from, which the caption names instead of a column, or null. */
  shared: string | null
}

/** The table's caption, saying what its values are, and which activity they all come from, if one did. */
export function captionOf(view: View): string {
  const base = CAPTION[view.sport](view.units)
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

export function tableRow(row: CurveRow, view: View): string[] {
  return [
    formatDuration(row.durationS),
    formatNative(view.sport, row.value, view.units),
    ...(SPORT_FORMAT[view.sport].showsWkg ? [formatWkg(row.value / view.massKg)] : []),
    ...(view.previous ? [formatNative(view.sport, row.previous, view.units)] : []),
    ...(view.shared === null ? [activityCell(row.activityId, view.names)] : []),
  ]
}
