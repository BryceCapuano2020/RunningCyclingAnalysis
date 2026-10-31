import { useId, useMemo } from 'react'
import type { AthleteSettings, Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { missingThresholdZones, zonesAt } from '@rca/core/zones'
import type { ZoneEstimates, ZoneSet } from '@rca/core/zones'
import { useNow } from '../useNow'
import { SPORT_LABEL } from '../sports'
import { NEEDS_WEIGHT, zoneTable } from '../zoneRows'
import { THRESHOLD_NEEDS } from '../zoneTimeCopy'
import './ZoneTables.css'

export interface ZoneTablesProps {
  /** The settings the analysis runs on, dated ones included. */
  athlete: AthleteSettings
  /**
   * The library's references, which supply any the athlete has not entered. Null without an analysis,
   * and while the sample is loaded, since the sample is not the athlete's own activities.
   */
  estimates: ZoneEstimates | null
  /** Whether a body weight is entered. Without one a ride's estimated power zones have no watts to show. */
  weightKnown: boolean
  units: UnitSystem
  /**
   * Offers the way to correct an estimated max heart rate: the Set control beside the figure calls this with
   * the sport and the figure, and the page opens its dated-settings form to that setting. Without it the figure
   * is stated and not offered for correction.
   */
  onSetMaxHeartRate?: (sport: Sport, bpm: number) => void
}

/**
 * One zone set's rows, with the title above the table rather than inside it, so the table is as wide as
 * its rows need. It wraps its cells instead of scrolling, so a narrow page shows every range.
 */
function ZoneTable({ id, columns, rows }: { id: string; columns: string[]; rows: string[][] }) {
  return (
    <table className="zone-tables__rows" aria-labelledby={`${id} ${id}-detail`}>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.join('|')}>
            {row.map((cell, i) =>
              i === 0 ? (
                <th key={columns[i]} scope="row">
                  {cell}
                </th>
              ) : (
                <td key={columns[i]}>{cell}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * Today's training zones, a table for each sport and measure. Each says where its reference came from:
 * a setting the athlete entered, or the app's own estimate from their activities.
 */
export function ZoneTables({
  athlete,
  estimates,
  weightKnown,
  units,
  onSetMaxHeartRate,
}: ZoneTablesProps) {
  const titleId = useId()
  const now = useNow()
  const all = useMemo(() => zonesAt(now, athlete, estimates), [now, athlete, estimates])
  const withheld = (set: ZoneSet) =>
    !weightKnown && set.source === 'estimated' && NEEDS_WEIGHT[set.measure]
  const sets = all.filter((set) => !withheld(set))
  const waitingForWeight = all.some(withheld)
  // Pace and power the library has efforts for but cannot give zones today, with what would give them.
  const missing = useMemo(
    () => missingThresholdZones(now, athlete, estimates),
    [now, athlete, estimates],
  )
  return (
    <section className="section zone-tables" aria-labelledby={titleId}>
      <h2 id={titleId}>Training zones</h2>
      {waitingForWeight && (
        <p className="secondary">
          Add your body weight to see ride power zones estimated from your rides, or enter a
          threshold power above.
        </p>
      )}
      {sets.length === 0 ? (
        !waitingForWeight && (
          <p className="secondary">
            Zones appear once you add files, or enter a max heart rate or a threshold above.
          </p>
        )
      ) : (
        <>
          <p className="secondary">
            Zones in effect today, from your entered settings or, without one, estimated from your
            activities: heart rate from your maximum, pace and power from your best efforts, held
            steady until a real change. They follow published schemes, named under each table.
          </p>
          <div className="zone-tables__grid">
            {sets.map((set) => {
              const table = zoneTable(set, units)
              const id = `${titleId}-${set.sport}-${set.measure}`
              return (
                <div key={`${set.sport}.${set.measure}`} className="zone-tables__table">
                  <h3 id={id}>{table.title}</h3>
                  <p
                    id={`${id}-detail`}
                    className="secondary zone-tables__detail"
                  >{`${table.detail}.`}</p>
                  {table.askable && onSetMaxHeartRate !== undefined && (
                    <p className="secondary zone-tables__detail">
                      {'Is that right? '}
                      <button
                        type="button"
                        className="btn zone-tables__set"
                        aria-label={`Set it for your ${SPORT_LABEL[set.sport].toLowerCase()} max heart rate`}
                        onClick={() => onSetMaxHeartRate(set.sport, Math.round(set.reference))}
                      >
                        Set it
                      </button>
                    </p>
                  )}
                  <ZoneTable id={id} columns={table.columns} rows={table.rows} />
                  <p className="zone-tables__citation muted">{table.citation}</p>
                </div>
              )
            })}
          </div>
        </>
      )}
      {missing.map(({ sport, measure }) => (
        <p key={`${sport}.${measure}`} className="secondary zone-tables__missing">
          {`No ${SPORT_LABEL[sport].toLowerCase()} ${measure} zones today. ${THRESHOLD_NEEDS[measure]}`}
        </p>
      ))}
    </section>
  )
}
