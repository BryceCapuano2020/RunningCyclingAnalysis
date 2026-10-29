import { useId, useMemo } from 'react'
import type { AthleteSettings } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { zonesAt } from '@rca/core/zones'
import type { ZoneEstimates, ZoneSet } from '@rca/core/zones'
import { ChartTable } from '../charts/ChartTable'
import { useNow } from '../useNow'
import { NEEDS_WEIGHT, zoneTable } from '../zoneRows'
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
}

/**
 * Today's training zones, a table for each sport and measure. Each says where its reference came from:
 * a setting the athlete entered, or the app's own estimate from their activities.
 */
export function ZoneTables({ athlete, estimates, weightKnown, units }: ZoneTablesProps) {
  const titleId = useId()
  const now = useNow()
  const all = useMemo(() => zonesAt(now, athlete, estimates), [now, athlete, estimates])
  const withheld = (set: ZoneSet) =>
    !weightKnown && set.source === 'estimated' && NEEDS_WEIGHT[set.measure]
  const sets = all.filter((set) => !withheld(set))
  const waitingForWeight = all.some(withheld)
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
            activities. They follow published schemes, named under each table.
          </p>
          <div className="zone-tables__grid">
            {sets.map((set) => {
              const table = zoneTable(set, units)
              return (
                <div key={`${set.sport}.${set.measure}`} className="zone-tables__table">
                  <ChartTable
                    caption={`${table.title}. ${table.detail}.`}
                    columns={table.columns}
                    rows={table.rows}
                    textColumns={[1, 2]}
                  />
                  <p className="zone-tables__citation muted">{table.citation}</p>
                </div>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}
