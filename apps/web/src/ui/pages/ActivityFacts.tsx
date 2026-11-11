import type { ActivitySummary } from '@rca/core/pipeline'
import { ATHLETE_LABEL_CHIP, WALKING_PACE_CHIP } from '../analysis/walkingPaceCopy'
import { activityDayLine } from '../activityDayLine'
import type { Property } from '../components/property'
import { PageDetails } from './PageDetails'

/**
 * What the title leaves out: the sport, day and time as the one line under it, then behind one Details the rows that
 * hold only for some activities: indoor, at walking pace or labelled another type, a power reading to check, and a
 * power worked out with no meter. Details is left out when there is no such row.
 */
export function ActivityFacts({
  activity,
  power,
}: {
  activity: ActivitySummary
  power: string | null
}) {
  const type =
    activity.athleteType !== undefined
      ? ATHLETE_LABEL_CHIP[activity.athleteType]
      : activity.walkingPace
        ? WALKING_PACE_CHIP
        : null
  const virtualPower = activity.powerSource === 'virtual' && typeof activity.avgPowerW === 'number'
  const rows: Property[] = [
    ...(activity.indoor ? [{ label: 'Setting', value: 'Indoor' }] : []),
    ...(type === null ? [] : [{ label: 'Type', value: type }]),
    ...(power === null ? [] : [{ label: 'Power', value: power }]),
    ...(virtualPower
      ? [{ label: 'Power source', value: 'Estimated from speed and climbs, no meter' }]
      : []),
  ]
  return (
    <>
      <p className="secondary activity-page__day">{activityDayLine(activity)}</p>
      <PageDetails rows={rows} />
    </>
  )
}
