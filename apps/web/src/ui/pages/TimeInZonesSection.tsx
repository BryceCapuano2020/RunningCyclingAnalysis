import type { MeasureTime, ZoneWindow } from '@rca/core/zones'
import type { Sport } from '@rca/core/types'
import { ZoneTimeChart } from '../charts/ZoneTimeChart'
import {
  TIME_IN_ZONES_NAME,
  ZONE_WINDOW_VALUE,
  describable,
  leftOutRows,
  zoneSourceRow,
  zonesChangedRows,
} from '../zoneTimeCopy'
import { periodBars, periodTables } from '../zoneTimeRows'
import { PageDetails } from './PageDetails'

export interface TimeInZonesSectionProps {
  sport: Sport
  /** The sport's measures over the period. Those with too little time are left out of the bars. */
  rows: readonly MeasureTime[]
  /** The same over the period before, cut by the same zones, or null for all time. */
  previous: readonly MeasureTime[] | null
  /** The label of that period, such as "Previous 6 weeks". */
  previousLabel: string | null
  /** The stretch the rows are of when the period held too little: the last 12 months, or all time. Absent: the period. */
  zoneWindow?: ZoneWindow
  /** Whatever the library holds is described, since no wider window is left: the period is all time, or the rows are. */
  relaxed?: boolean
}

/**
 * How the period's time was spread across training zones, a bar for each measure with enough of it, each bar saying its
 * easy and hard shares. Where the period held too little, the bars are of the last 12 months or all time and a line says
 * which, in the Details under the bars, with the activities a measure left out and where the zones came from.
 * The page asks timeInZonesLack first, so this is drawn only when some measure has enough time.
 */
export function TimeInZonesSection({
  sport,
  rows,
  previous,
  previousLabel,
  zoneWindow,
  relaxed = false,
}: TimeInZonesSectionProps) {
  const shown = describable(rows, relaxed)
  if (shown.length === 0) return null
  const { table, summary } = periodTables(shown, previous, previousLabel)
  const details = [
    ...(zoneWindow === undefined
      ? []
      : [{ label: 'Window', value: ZONE_WINDOW_VALUE[zoneWindow] }]),
    ...leftOutRows(sport, shown),
    ...zonesChangedRows(shown, previous),
    zoneSourceRow(shown),
  ]
  return (
    <section className="section" data-sport={sport} aria-labelledby={`${sport}-time-in-zones`}>
      <h2 id={`${sport}-time-in-zones`}>{TIME_IN_ZONES_NAME}</h2>
      {/* The section's heading names the chart, and its window, the activities left out and where the zones came from
          are one ▸ Details under the bars (docs/design/system.md, No subtitle lines). */}
      <ZoneTimeChart
        title="Share of time in each zone"
        titleHidden
        rows={periodBars(shown)}
        table={table}
        summary={summary}
      />
      <PageDetails about="time in zones" rows={details} />
    </section>
  )
}
