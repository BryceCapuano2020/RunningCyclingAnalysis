import type { ActivitySummary } from '@rca/core/pipeline'
import { hrefFor } from '../route'
import { BackLink } from './ActivityBackLink'
import { originOf } from './activityBack'

/**
 * One row of links around the activity: back to where it was opened from, then the activities either side of it in the
 * library, which is newest first, so Earlier is the next one down the list.
 */
export function ActivityNav({
  activity,
  library,
}: {
  activity: ActivitySummary
  library: readonly ActivitySummary[]
}) {
  const index = library.findIndex((candidate) => candidate.id === activity.id)
  const later = index > 0 ? library[index - 1] : undefined
  const earlier = index >= 0 ? library[index + 1] : undefined
  return (
    <nav className="activity-page__nav" aria-label="Around this activity">
      <BackLink origin={originOf()} />
      {earlier && (
        <a href={hrefFor({ page: 'activity', id: earlier.id })}>{`Earlier: ${earlier.name}`}</a>
      )}
      {later && <a href={hrefFor({ page: 'activity', id: later.id })}>{`Later: ${later.name}`}</a>}
    </nav>
  )
}
