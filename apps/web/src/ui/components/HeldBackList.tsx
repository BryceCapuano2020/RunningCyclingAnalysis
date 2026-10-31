import type { HeldOutActivity } from '@rca/core/session'
import { SPORT_LABEL } from '../sports'
import { formatDayMonth } from '../format/date'
import { groupThousands } from '@rca/core/units'
import { plural } from './plural'

const SHOWN = 20

/** What each status means for the athlete, in the list's words. */
const MARKER: Record<HeldOutActivity['status'], string> = {
  stale: 'Waiting for update',
  newer: 'Needs a newer app',
}

export interface HeldBackListProps {
  activities: readonly HeldOutActivity[]
}

/**
 * The saved activities held out of the analysis, by name and day with a marker of why, so a library
 * that is being updated or is waiting for a newer app still lists everything it holds. Nothing here
 * is analysed; there are no numbers to show. The first twenty are listed, newest first.
 */
export function HeldBackList({ activities }: HeldBackListProps) {
  if (activities.length === 0) return null
  const more = activities.length - SHOWN
  return (
    <section className="held-out" aria-label="Activities held out of the analysis">
      <h2>{plural(activities.length, 'activity', 'activities')} held out</h2>
      <ul>
        {activities.slice(0, SHOWN).map((activity) => (
          <li key={`${activity.sport}-${activity.startMs}`}>
            {activity.name}, {SPORT_LABEL[activity.sport]}, {formatDayMonth(activity.startMs)}.{' '}
            <span>{MARKER[activity.status]}</span>
          </li>
        ))}
      </ul>
      {more > 0 && <p>And {groupThousands(String(more))} more.</p>}
    </section>
  )
}
