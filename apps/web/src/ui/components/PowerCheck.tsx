import type { ActivitySummary } from '@rca/core/pipeline'
import {
  KEEP_POWER_LABEL,
  POWER_KEPT_NOTE,
  POWER_SET_ASIDE_NOTE,
  estimatedPowerNote,
  powerHeartRateNote,
  SET_POWER_ASIDE_LABEL,
} from '../analysis/powerCheckCopy'
import { useKeptPower } from '../keptPowerStore'

/**
 * What an activity page says about a ride whose power is set aside or kept, with the one button that changes it.
 * Nothing for any other activity.
 */
export function PowerCheck({ activity }: { activity: ActivitySummary }) {
  const { keep, release } = useKeptPower()
  if (activity.powerCheck === undefined) return null
  const kept = activity.powerCheck === 'kept'
  return (
    <div className="activity-page__power">
      <p className="secondary">
        {kept
          ? POWER_KEPT_NOTE
          : activity.estimatedPower === undefined
            ? POWER_SET_ASIDE_NOTE
            : estimatedPowerNote(activity.estimatedPower)}
      </p>
      {activity.powerHeartRate !== undefined && (
        <p className="secondary">{powerHeartRateNote(activity.powerHeartRate)}</p>
      )}
      <button
        type="button"
        className="btn"
        onClick={() => (kept ? release(activity.id) : keep(activity.id))}
      >
        {kept ? SET_POWER_ASIDE_LABEL : KEEP_POWER_LABEL}
      </button>
    </div>
  )
}
