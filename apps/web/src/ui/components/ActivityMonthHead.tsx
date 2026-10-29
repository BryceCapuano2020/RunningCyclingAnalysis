import { formatDistance } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import { formatHoursText, secondsOf } from '../activitiesVolume'
import type { TotalsBySport } from '../activitiesVolume'
import { SPORT_ACTIVITY, SPORT_ORDER, SPORT_PLURAL } from '../sports'
import { plural } from './plural'
import { SportIcon } from './icons'

export interface ActivityMonthHeadProps {
  /** The month and year, such as "Jun 2025". */
  label: string
  /** What every activity in the list holds for the month, not only the rows on this page. */
  totals: TotalsBySport | undefined
  units: UnitSystem
}

/** A month's heading, with its totals beside it: the count and distance of each sport, then the hours. */
export function ActivityMonthHead({ label, totals, units }: ActivityMonthHeadProps) {
  const sports = totals === undefined ? [] : SPORT_ORDER.filter((sport) => totals[sport].count > 0)
  return (
    <div className="activity-list__month-head">
      <h2 className="activity-list__heading">{label}</h2>
      {totals !== undefined && (
        <p className="activity-list__totals">
          {sports.map((sport) => {
            const { count, distanceM } = totals[sport]
            const distance = distanceM > 0 ? `, ${formatDistance(distanceM, units)}` : ''
            return (
              <span key={sport} className="activity-list__total" data-sport={sport}>
                <SportIcon
                  sport={sport}
                  className={`activity-list__icon activity-list__icon--${sport}`}
                />
                {`${plural(count, SPORT_ACTIVITY[sport], SPORT_PLURAL[sport])}${distance}`}
                <span className="sr-only">; </span>
              </span>
            )
          })}
          <span className="activity-list__total activity-list__total--hours">
            {formatHoursText(secondsOf(totals))}
          </span>
        </p>
      )}
    </div>
  )
}
