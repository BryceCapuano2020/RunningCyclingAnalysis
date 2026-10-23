import type { ActivitySummary } from '@rca/core/pipeline'
import type { UnitSystem } from '@rca/core/units'
import { ActivityList } from '../components/ActivityList'
import { plural } from '../components/plural'
import { countSport } from '../records'
import { PAGE_HEADING_ID } from './pageHeading'

export interface ActivitiesPageProps {
  activities: ActivitySummary[]
  units: UnitSystem
}

/** Every activity in the period, newest first, counted by sport. */
export function ActivitiesPage({ activities, units }: ActivitiesPageProps) {
  const runs = countSport(activities, 'run')
  const rides = countSport(activities, 'ride')
  return (
    <div className="page-stack">
      <div className="page-title">
        <h1 id={PAGE_HEADING_ID} tabIndex={-1}>
          Activities
        </h1>
        <p className="secondary">
          {activities.length === 0
            ? 'No activities yet'
            : `${plural(activities.length, 'activity', 'activities')}: ${plural(runs, 'run')}, ${plural(rides, 'ride')}`}
        </p>
      </div>
      {activities.length > 0 && <ActivityList activities={activities} units={units} />}
    </div>
  )
}
