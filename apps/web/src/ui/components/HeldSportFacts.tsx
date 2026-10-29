import type { ActivitySummary } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { formatDuration } from '@rca/core/units'
import { formatDay } from '../format/date'
import { useNow } from '../useNow'
import { SPORT_ACTIVITY, SPORT_DOING } from '../sports'
import { plural } from './plural'

export interface HeldSportFactsProps {
  sport: Sport
  /** The period's activities, of any sport; the sport's own are counted. */
  activities: ActivitySummary[]
  /** The day, for the year of the latest date; today by default. */
  nowMs?: number
}

/**
 * What a ride card can say while its figures wait for a weight: how many there are, how long they ran
 * and when the latest was. None of these use the weight, so a held card is never an empty one.
 */
export function HeldSportFacts({ sport, activities, nowMs }: HeldSportFactsProps) {
  const today = useNow()
  const own = activities.filter((activity) => activity.sport === sport)
  if (own.length === 0) return null
  const seconds = own.reduce((total, activity) => total + activity.durationS, 0)
  const latest = Math.max(...own.map((activity) => activity.startMs))
  // Whole minutes, so a total never ends in stray seconds.
  const time = formatDuration(Math.round(seconds / 60) * 60)
  return (
    <p className="secondary">
      {`${plural(own.length, SPORT_ACTIVITY[sport])}, ${time} ${SPORT_DOING[sport]}. Latest ${formatDay(latest, nowMs ?? today)}.`}
    </p>
  )
}
