import type { ActivitySummary } from '@rca/core/pipeline'
import { SPORT_LABEL } from '../sports'
import { hrefFor } from '../route'

/**
 * The activities either side of this one in the library, which is newest first, so Earlier is the
 * next one down the list. Then the links from the activity to what explains its numbers.
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
      {earlier && (
        <a href={hrefFor({ page: 'activity', id: earlier.id })}>{`Earlier: ${earlier.name}`}</a>
      )}
      {later && <a href={hrefFor({ page: 'activity', id: later.id })}>{`Later: ${later.name}`}</a>}
      <a href={hrefFor({ page: activity.sport })}>
        {`Your ${SPORT_LABEL[activity.sport].toLowerCase()} records`}
      </a>
      <a href={hrefFor({ page: 'method' })}>How sure is this?</a>
    </nav>
  )
}
