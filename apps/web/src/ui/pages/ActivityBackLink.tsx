import { hrefFor } from '../route'
import { SPORT_LABEL } from '../sports'
import { backToOrigin } from './activityBack'

/** The link back at the top of an activity: to the list, or to the Run or Ride page it was opened from. */
export function BackLink({ origin }: { origin: 'activities' | 'run' | 'ride' | null }) {
  const label =
    origin === 'run' || origin === 'ride' ? `Back to ${SPORT_LABEL[origin]}` : 'Back to activities'
  return (
    <a
      className="activity-page__back"
      href={hrefFor({ page: origin ?? 'activities' })}
      onClick={backToOrigin}
    >
      {label}
    </a>
  )
}
