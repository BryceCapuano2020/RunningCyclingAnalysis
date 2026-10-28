import { useId, useMemo } from 'react'
import type { AthleteSettings } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { zonesAt } from '@rca/core/zones'
import type { ZoneEstimates } from '@rca/core/zones'
import { ChartTable } from '../charts/ChartTable'
import { useNow } from '../useNow'
import { zoneTable } from '../zoneRows'
import './ZoneTables.css'

export interface ZoneTablesProps {
  /** The settings the analysis runs on, dated ones included. */
  athlete: AthleteSettings
  /** The analysis on screen, which supplies a reference the athlete has not entered. Null without one. */
  result: ZoneEstimates | null
  units: UnitSystem
}

/**
 * Today's training zones, a table for each sport and measure. Each says where its reference came from:
 * a setting the athlete entered, or the app's own estimate from their activities.
 */
export function ZoneTables({ athlete, result, units }: ZoneTablesProps) {
  const titleId = useId()
  const now = useNow()
  const sets = useMemo(() => zonesAt(now, athlete, result), [now, athlete, result])
  return (
    <section className="section zone-tables" aria-labelledby={titleId}>
      <h2 id={titleId}>Training zones</h2>
      {sets.length === 0 ? (
        <p className="secondary">
          Zones appear once you add files, or enter a max heart rate or a threshold above.
        </p>
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
