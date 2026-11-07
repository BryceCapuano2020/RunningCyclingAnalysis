import type { ActivitySummary } from '@rca/core/pipeline'
import { ATHLETE_LABEL_CHIP, WALKING_PACE_CHIP } from '../analysis/walkingPaceCopy'
import { formatDay, formatTimeOfDay } from '../format/date'
import { SPORT_LABEL } from '../sports'
import type { Property } from '../components/property'
import { PageDetails } from './PageDetails'
import './ActivityFacts.css'

/**
 * What the title leaves out, behind one Details as a detail panel's rows: the sport, the day and time, and where the
 * activity is indoor, at walking pace, labelled another type, or has a power reading to check.
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
  const rows: Property[] = [
    { label: 'Sport', value: SPORT_LABEL[activity.sport] },
    {
      label: 'Started',
      value: `${formatDay(activity.startMs)}, ${formatTimeOfDay(activity.startMs)}`,
    },
    ...(activity.indoor ? [{ label: 'Setting', value: 'Indoor' }] : []),
    ...(type === null ? [] : [{ label: 'Type', value: type }]),
    ...(power === null ? [] : [{ label: 'Power', value: power }]),
  ]
  return <PageDetails rows={rows} />
}
