import type { ActivitySummary } from '@rca/core/pipeline'
import type { UnitSystem } from '@rca/core/units'
import {
  formatDistance,
  formatElevation,
  formatPace,
  formatPower,
  formatSpeed,
  formatTotalTime,
} from '@rca/core/units'
import { movingTimeOf, timeLabelOf } from '../activityFigures'
import { StatFigure } from '../components/StatFigure'

/**
 * The figures an activity's page leads with. Its moving time is the hero, with the elapsed time under
 * it when the two differ, then the distance, pace or speed over the moving time, and the climb. Heart
 * rate and measured power follow when the file recorded them. An indoor ride has no speed to report.
 */
export function ActivityStats({
  activity,
  units,
}: {
  activity: ActivitySummary
  units: UnitSystem
}) {
  const isRun = activity.sport === 'run'
  const moving = movingTimeOf(activity)
  const elapsedDiffers = activity.movingS !== undefined && activity.movingS !== activity.durationS
  const hasDistance = activity.distanceM > 0
  return (
    <div className="activity-page__summary">
      <div className="activity-page__hero">
        <p className="eyebrow">{timeLabelOf(activity)}</p>
        <p className="hero-number">{formatTotalTime(moving)}</p>
        {elapsedDiffers && (
          <p className="secondary">{`Elapsed ${formatTotalTime(activity.durationS)}`}</p>
        )}
      </div>
      <dl className="activity-page__stats">
        {hasDistance && (
          <StatFigure
            label="Distance"
            value={formatDistance(activity.distanceM, units)}
            className="activity-page__stat"
            labelClassName="eyebrow"
            valueClassName="stat-number"
          />
        )}
        {hasDistance && isRun && (
          <StatFigure
            label="Average pace"
            value={formatPace(activity.distanceM / moving, units)}
            className="activity-page__stat"
            labelClassName="eyebrow"
            valueClassName="stat-number"
          />
        )}
        {hasDistance && !isRun && !activity.indoor && (
          <StatFigure
            label="Average speed"
            value={formatSpeed(activity.distanceM / moving, units)}
            className="activity-page__stat"
            labelClassName="eyebrow"
            valueClassName="stat-number"
          />
        )}
        {activity.elevationGainM > 0 && (
          <StatFigure
            label="Climb"
            value={formatElevation(activity.elevationGainM, units)}
            className="activity-page__stat"
            labelClassName="eyebrow"
            valueClassName="stat-number"
          />
        )}
        {typeof activity.avgHeartRate === 'number' && (
          <StatFigure
            label="Average heart rate"
            value={`${Math.round(activity.avgHeartRate)} bpm`}
            sub={
              typeof activity.maxHeartRate === 'number'
                ? `Highest ${Math.round(activity.maxHeartRate)} bpm`
                : undefined
            }
            className="activity-page__stat"
            labelClassName="eyebrow"
            valueClassName="stat-number"
          />
        )}
        {!isRun && typeof activity.avgPowerW === 'number' && (
          <StatFigure
            label="Average power"
            value={formatPower(activity.avgPowerW)}
            className="activity-page__stat"
            labelClassName="eyebrow"
            valueClassName="stat-number"
          />
        )}
      </dl>
    </div>
  )
}
