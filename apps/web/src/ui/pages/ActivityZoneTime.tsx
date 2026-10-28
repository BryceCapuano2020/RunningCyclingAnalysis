import { useMemo } from 'react'
import type { ActivityTrace } from '@rca/core/workbench'
import type { ZoneMeasure, ZoneSet } from '@rca/core/zones'
import { traceTimeInZones } from '@rca/core/zones'
import type { TraceZoneTime } from '@rca/core/zones'
import type { UnitSystem } from '@rca/core/units'
import { ZoneTimeChart } from '../charts/ZoneTimeChart'
import { hrefFor } from '../route'
import { sourceText, zoneRange } from '../zoneRows'
import { ROW_LABEL, activityLede, percentText, zoneTimeText } from '../zoneTimeCopy'
import { barSummary } from '../zoneTimeRows'
import { readableTrace } from './workbenchData'

/**
 * The measures in the order the page leads with them: power and pace are the effort itself, heart
 * rate follows it. The first with a reading in the interval gives the lede.
 */
const LEAD_ORDER: readonly ZoneMeasure[] = ['power', 'pace', 'heartRate']

interface Row {
  set: ZoneSet
  time: TraceZoneTime
}

function rowsOf(
  trace: ActivityTrace,
  sets: readonly ZoneSet[],
  startS: number,
  endS: number,
): Row[] {
  const readable = readableTrace(trace)
  return LEAD_ORDER.flatMap((measure) => {
    const set = sets.find((each) => each.measure === measure)
    if (set === undefined) return []
    const time = traceTimeInZones(readable, measure, set.zones, startS, endS)
    return time.total > 0 ? [{ set, time }] : []
  })
}

const lowerFirst = (text: string) => `${text.charAt(0).toLowerCase()}${text.slice(1)}`

function ZoneNeed() {
  return (
    <p className="muted">
      Time in zones needs zones. Enter a max heart rate or a threshold on{' '}
      <a href={hrefFor({ page: 'profile' })}>Profile</a>, or add more activities for the app to
      estimate them.
    </p>
  )
}

/**
 * How the selected interval's moving time was spread across the zones in effect on the activity's date,
 * a bar and a row of the table for each of heart rate, measured power (rides) and pace (runs) that the
 * interval has readings for. It counts each recorded second in the zone of its reading, so it follows
 * the interval the athlete selects.
 */
export function ActivityZoneTime({
  trace,
  sets,
  startS,
  endS,
  units,
}: {
  trace: ActivityTrace
  sets: readonly ZoneSet[]
  startS: number
  endS: number
  units: UnitSystem
}) {
  const rows = useMemo(() => rowsOf(trace, sets, startS, endS), [trace, sets, startS, endS])
  if (sets.length === 0) return <ZoneNeed />
  const [lead] = rows
  if (lead === undefined) {
    return (
      <p className="muted">
        No heart rate, power or pace readings in this interval to place in zones.
      </p>
    )
  }
  const lede = activityLede(trace.sport, lead.set.measure, {
    seconds: lead.time.seconds,
    totalSeconds: lead.time.total,
  })
  return (
    <div className="activity-workbench__zones" data-sport={trace.sport}>
      <h3>Time in zones</h3>
      <ZoneTimeChart
        title="Share of the interval in each zone"
        lede={lede ?? ''}
        rows={rows.map(({ set, time }) => ({
          label: ROW_LABEL[set.measure],
          seconds: time.seconds,
          summary: barSummary({ seconds: time.seconds, totalSeconds: time.total }),
        }))}
        table={{
          caption: `Moving time in each zone in the selected interval. ${rows
            .map(({ set }) => `${ROW_LABEL[set.measure]} zones: ${lowerFirst(sourceText(set))}.`)
            .join(' ')}`,
          columns: ['Measure', 'Zone', 'Name', 'Range', 'Time', 'Share'],
          textColumns: [2, 3],
          rows: rows.flatMap(({ set, time }) =>
            set.zones.map((zone, i) => [
              ROW_LABEL[set.measure],
              String(zone.level),
              zone.name,
              zoneRange(set.measure, zone, units),
              zoneTimeText(time.seconds[i] ?? 0),
              percentText((time.seconds[i] ?? 0) / time.total),
            ]),
          ),
        }}
      />
    </div>
  )
}
