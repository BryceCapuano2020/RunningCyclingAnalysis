import type { ActivitySummary } from '@rca/core/pipeline'
import type { Curve, Sport } from '@rca/core/types'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { formatDuration } from '@rca/core/units'
import { formatDay } from '../format/date'
import { powerFigure } from '../records'
import { useNow } from '../useNow'
import { SPORT_ACTIVITY, SPORT_DOING } from '../sports'
import { plural } from './plural'

export interface HeldSportFactsProps {
  sport: Sport
  /** The period's activities, of any sport; the sport's own are counted. */
  activities: ActivitySummary[]
  /** The sport's best efforts from power meters alone, given for a sport that has them: a figure that needs no weight. */
  measured?: Curve
  /** The day, for the year of the latest date; today by default. */
  nowMs?: number
}

/**
 * The best 20 minutes in watts from rides with a power meter. Watts a meter reads do not depend on the
 * athlete's weight, so a rider who skipped the weight still sees them; an estimated best is priced at a
 * weight, so it waits for one.
 */
function measuredBest(measured: Curve | undefined): string | null {
  const point = measured?.find((candidate) => candidate.durationS === HEADLINE_DURATION_S)
  if (point === undefined || !Number.isFinite(point.value)) return null
  return `Best ${formatDuration(HEADLINE_DURATION_S)} ${powerFigure(point.value).value} from your power meter.`
}

/**
 * What a ride card can say while its figures wait for a weight: how many there are, how long they ran
 * and when the latest was. None of these use the weight, so a held card is never an empty one.
 */
export function HeldSportFacts({ sport, activities, measured, nowMs }: HeldSportFactsProps) {
  const today = useNow()
  const own = activities.filter((activity) => activity.sport === sport)
  if (own.length === 0) return null
  const seconds = own.reduce((total, activity) => total + activity.durationS, 0)
  const latest = Math.max(...own.map((activity) => activity.startMs))
  // Whole minutes, so a total never ends in stray seconds.
  const time = formatDuration(Math.round(seconds / 60) * 60)
  const best = measuredBest(measured)
  return (
    <p className="secondary">
      {`${plural(own.length, SPORT_ACTIVITY[sport])}, ${time} ${SPORT_DOING[sport]}. Latest ${formatDay(latest, nowMs ?? today)}.`}
      {best === null ? '' : ` ${best}`}
    </p>
  )
}
