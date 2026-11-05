import type { ActivitySummary } from '@rca/core/pipeline'
import { ATHLETE_LABEL_CHIP, WALKING_PACE_CHIP } from '../analysis/walkingPaceCopy'
import { formatDay, formatTimeOfDay } from '../format/date'
import { SPORT_LABEL } from '../sports'
import './ActivityFacts.css'

/**
 * What the title leaves out, behind one Details: the sport, the day and time, and in words where the activity is
 * indoor, at walking pace, labelled another type, or has a power reading to check. One mono line, no caption beside the title.
 */
export function ActivityFacts({
  activity,
  power,
}: {
  activity: ActivitySummary
  power: string | null
}) {
  const facts = [
    SPORT_LABEL[activity.sport],
    `${formatDay(activity.startMs)}, ${formatTimeOfDay(activity.startMs)}`,
    activity.indoor ? 'Indoor' : null,
    activity.athleteType !== undefined
      ? ATHLETE_LABEL_CHIP[activity.athleteType]
      : activity.walkingPace
        ? WALKING_PACE_CHIP
        : null,
    power,
  ].filter((fact): fact is string => fact !== null)
  return (
    <details className="disclosure" data-sport={activity.sport}>
      <summary>Details</summary>
      <p className="meta disclosure__body activity-page__facts">
        {facts.map((fact) => (
          <span key={fact}>{fact}</span>
        ))}
      </p>
    </details>
  )
}
