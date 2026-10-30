import { useMemo } from 'react'
import type { Sport } from '@rca/core/types'
import type { ActivityTrace } from '@rca/core/workbench'
import type { ZoneMeasure, ZoneSet } from '@rca/core/zones'
import { traceTimeInZones } from '@rca/core/zones'
import type { TraceZoneTime } from '@rca/core/zones'
import type { UnitSystem } from '@rca/core/units'
import { ZoneTimeChart } from '../charts/ZoneTimeChart'
import { hrefFor } from '../route'
import { sourceText, zoneRange } from '../zoneRows'
import {
  ROW_LABEL,
  THRESHOLD_NEEDS,
  activityLede,
  percentText,
  zoneTimeText,
} from '../zoneTimeCopy'
import { zoneBar } from '../zoneTimeRows'

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
  return LEAD_ORDER.flatMap((measure) => {
    const set = sets.find((each) => each.measure === measure && each.sport === trace.sport)
    if (set === undefined) return []
    // The trace as recorded, not as the plots read it: a run's slow seconds count in the lowest pace zone, as
    // they do in the digests behind the sport page, so a whole-activity interval matches the page.
    const time = traceTimeInZones(trace, measure, set.zones, startS, endS)
    return time.total > 0 ? [{ set, time }] : []
  })
}

/** No pace or power is missing: one array, so the default does not change between renders. */
const NO_MISSING: readonly ZoneMeasure[] = []

const lowerFirst = (text: string) => `${text.charAt(0).toLowerCase()}${text.slice(1)}`

/** Why heart rate is not read into zones: the reason in a line, and the activity's issues give it in full. */
function SetAsideNote() {
  return (
    <p className="muted">
      Heart rate is set aside for this activity: it read too low for the effort, as a working sensor
      would not, so it is left out of zones.
    </p>
  )
}

/** What a sport's zones other than heart rate are cut from, for the line that says they are missing. */
const OTHER_ZONES: Record<Sport, { zones: string; threshold: string }> = {
  run: { zones: 'Pace zones', threshold: 'threshold pace' },
  ride: { zones: 'Power zones', threshold: 'threshold power' },
}

/** Why a pace or power has no zones on the activity's date, and what would give them. */
function MissingNote({ sport, measures }: { sport: Sport; measures: readonly ZoneMeasure[] }) {
  return (
    <>
      {measures.map((measure) => (
        <p key={measure} className="muted">
          {`No ${measure} zones for this ${sport}. ${THRESHOLD_NEEDS[measure]}`}
        </p>
      ))}
    </>
  )
}

/**
 * What the zones need. With heart rate set aside, the zones that are left are the sport's own, from a
 * threshold, so it names that; otherwise a max heart rate does as well.
 */
function ZoneNeed({ sport, heartRateSetAside }: { sport: Sport; heartRateSetAside: boolean }) {
  const profile = <a href={hrefFor({ page: 'profile' })}>Profile</a>
  if (heartRateSetAside) {
    const { zones, threshold } = OTHER_ZONES[sport]
    return (
      <p className="muted">
        {zones} use a {threshold} from {profile}. Enter one there, or add more activities for the
        app to estimate it.
      </p>
    )
  }
  return (
    <p className="muted">
      Time in zones needs zones. Enter a max heart rate or a threshold on {profile}, or add more
      activities for the app to estimate them.
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
  heartRateSetAside = false,
  missing = NO_MISSING,
}: {
  trace: ActivityTrace
  sets: readonly ZoneSet[]
  /** The pace or power with efforts to fit but no zones on the activity's date. */
  missing?: readonly ZoneMeasure[]
  /** Whether the analysis set this activity's heart rate aside, so `sets` leaves heart rate out. */
  heartRateSetAside?: boolean
  startS: number
  endS: number
  units: UnitSystem
}) {
  const rows = useMemo(() => rowsOf(trace, sets, startS, endS), [trace, sets, startS, endS])
  const [lead] = rows
  if (lead === undefined) {
    if (sets.length === 0) {
      return (
        <>
          {heartRateSetAside && <SetAsideNote />}
          <ZoneNeed sport={trace.sport} heartRateSetAside={heartRateSetAside} />
          <MissingNote sport={trace.sport} measures={missing} />
        </>
      )
    }
    return (
      <>
        <p className="muted">
          No heart rate, power or pace readings in this interval to place in zones.
        </p>
        {heartRateSetAside && <SetAsideNote />}
        <MissingNote sport={trace.sport} measures={missing} />
      </>
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
        rows={rows.map(({ set, time }) =>
          zoneBar(
            set.measure,
            { seconds: time.seconds, totalSeconds: time.total },
            set.zones.map((zone) => zone.name),
          ),
        )}
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
      {heartRateSetAside && <SetAsideNote />}
      <MissingNote sport={trace.sport} measures={missing} />
    </div>
  )
}
