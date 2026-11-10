import { formatDistance } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import { formatHoursText, totalHoursText } from '../activitiesVolume'
import type { TotalsBySport } from '../activitiesVolume'
import { VOLUME_KINDS, VOLUME_NOUN, VOLUME_PLURAL, VOLUME_ESTIMATED } from '../volumeKinds'
import { plural } from './plural'

export interface ActivityMonthHeadProps {
  /** The month and year, such as "Jun 2025". */
  label: string
  /** What every activity in the list holds for the month, not only the rows on this page. */
  totals: TotalsBySport | undefined
  units: UnitSystem
}

/**
 * A month's heading, with its totals beside it: "9 runs · 55.6 mi" for each sport, "4 lifts · ~4.9 h" for lifting (its time
 * estimated from its sets), then "31 h total", written "~36 h total" when it includes lifting's estimate.
 */
export function ActivityMonthHead({ label, totals, units }: ActivityMonthHeadProps) {
  const kinds = totals === undefined ? [] : VOLUME_KINDS.filter((kind) => totals[kind].count > 0)
  return (
    <div className="activity-list__month-head">
      <h2 className="activity-list__heading">{label}</h2>
      {totals !== undefined && (
        <p className="num activity-list__totals">
          {kinds.map((kind) => {
            const { count, distanceM, seconds } = totals[kind]
            // A recorded sport gives its distance; lifting, which has none, gives its estimated time.
            const distance =
              distanceM > 0
                ? ` · ${formatDistance(distanceM, units)}`
                : VOLUME_ESTIMATED[kind]
                  ? ` · ~${formatHoursText(seconds)}`
                  : ''
            return (
              <span key={kind} className="activity-list__total" data-sport={kind}>
                {`${plural(count, VOLUME_NOUN[kind], VOLUME_PLURAL[kind])}${distance}`}
                <span className="sr-only">; </span>
              </span>
            )
          })}
          <span className="activity-list__total activity-list__total--hours">
            {`${totalHoursText(totals)} total`}
          </span>
        </p>
      )}
    </div>
  )
}
