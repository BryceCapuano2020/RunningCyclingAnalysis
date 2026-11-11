import { useMemo } from 'react'
import type { ActivityTrace } from '@rca/core/workbench'
import type { ZoneMeasure, ZoneSet } from '@rca/core/zones'
import { traceTimeInZones } from '@rca/core/zones'
import type { TraceZoneTime } from '@rca/core/zones'
import type { UnitSystem } from '@rca/core/units'
import { INTERVAL_ZONES_TITLE, ZoneTimeChart } from '../charts/ZoneTimeChart'
import { lowerFirst } from '../format/firstLetter'
import { hrefFor } from '../route'
import { sourceText, zoneRange } from '../zoneRows'
import { ROW_LABEL, TIME_IN_ZONES_NAME, percentText, zoneTimeText } from '../zoneTimeCopy'
import { zoneBar } from '../zoneTimeRows'

/** The measures in the order the bars stand: power and pace are the effort itself, heart rate follows it. */
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

/** A pace or power with no zones on the activity's date. */
export interface MissingMeasure {
  measure: ZoneMeasure
}

/** No pace or power is missing: one array, so the default does not change between renders. */
const NO_MISSING: readonly MissingMeasure[] = []

/** Heart rate the analysis set aside has no zones here; the activity's notes say why. */
const SET_ASIDE_LINE = 'Heart rate set aside'

/** The one way to the zones a measure lacks, as on the Run and Ride pages. */
function ProfileLink() {
  return (
    <p>
      <a className="link-arrow" href={hrefFor({ page: 'profile' })}>
        Set your zones on Profile
      </a>
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
  missing?: readonly MissingMeasure[]
  /** Whether the analysis set this activity's heart rate aside, so `sets` leaves heart rate out. */
  heartRateSetAside?: boolean
  startS: number
  endS: number
  units: UnitSystem
}) {
  const rows = useMemo(() => rowsOf(trace, sets, startS, endS), [trace, sets, startS, endS])
  const setAside = heartRateSetAside ? <p className="secondary">{SET_ASIDE_LINE}</p> : null
  // Zones exist but the interval has no reading to place in them: the readout row already says so per measure.
  if (rows.length === 0 && sets.length > 0) return setAside
  return (
    <div className="activity-workbench__zones" data-sport={trace.sport}>
      <h3>{TIME_IN_ZONES_NAME}</h3>
      {rows.length > 0 && (
        <ZoneTimeChart
          title={INTERVAL_ZONES_TITLE}
          titleHidden
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
      )}
      {setAside}
      {(sets.length === 0 || missing.length > 0) && <ProfileLink />}
    </div>
  )
}
