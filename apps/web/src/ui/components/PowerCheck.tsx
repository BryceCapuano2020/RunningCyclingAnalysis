import type { ActivitySummary } from '@rca/core/pipeline'
import { KEEP_POWER_LABEL, SET_POWER_ASIDE_LABEL, powerCheckRows } from '../analysis/powerCheckCopy'
import { useKeptPower } from '../keptPowerStore'
import { PageDetails } from '../pages/PageDetails'

/**
 * What an activity page holds about a ride whose power is set aside or kept: its facts behind Details, label
 * over value, and the one button that changes it. Nothing for any other activity.
 */
export function PowerCheck({ activity }: { activity: ActivitySummary }) {
  const { keep, release } = useKeptPower()
  if (activity.powerCheck === undefined) return null
  const kept = activity.powerCheck === 'kept'
  return (
    <div className="activity-page__power">
      <button
        type="button"
        className="btn"
        onClick={() => (kept ? release(activity.id) : keep(activity.id))}
      >
        {kept ? SET_POWER_ASIDE_LABEL : KEEP_POWER_LABEL}
      </button>
      <PageDetails
        about="power"
        rows={powerCheckRows(activity.powerCheck, activity.estimatedPower, activity.powerHeartRate)}
      />
    </div>
  )
}
