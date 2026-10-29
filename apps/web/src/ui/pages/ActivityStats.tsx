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
import { isEstimatedRecord } from '../records'

/**
 * The figures an activity's page leads with. Its moving time is the hero, with the elapsed time under
 * it when the two differ. Two tiles are the key strip, which a phone sets directly under the title: the
 * distance, and the pace over the moving time (a ride's power when it has one, else its speed). The rest are
 * the tiles below the timeline: the climb, heart rate, and the other of a ride's speed and power. An indoor
 * ride has no speed to report.
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
  const hasPower = !isRun && typeof activity.avgPowerW === 'number'
  const hasSpeed = hasDistance && !isRun && !activity.indoor
  const tile = (label: string, value: string, sub?: string) => (
    <StatFigure
      key={label}
      label={label}
      value={value}
      sub={sub}
      className="activity-page__stat"
      labelClassName="eyebrow"
      valueClassName="stat-number"
    />
  )
  const power =
    typeof activity.avgPowerW === 'number'
      ? tile(
          'Average power',
          formatPower(activity.avgPowerW),
          isEstimatedRecord(activity.sport, activity) ? 'Estimated' : undefined,
        )
      : null
  const speed = hasSpeed
    ? tile('Average speed', formatSpeed(activity.distanceM / moving, units))
    : null
  const key = [
    hasDistance && tile('Distance', formatDistance(activity.distanceM, units)),
    hasDistance && isRun && tile('Average pace', formatPace(activity.distanceM / moving, units)),
    // A ride's power leads where it has one; its speed then follows below the timeline.
    hasPower ? power : speed,
  ].filter(Boolean)
  const more = [
    activity.elevationGainM > 0 && tile('Climb', formatElevation(activity.elevationGainM, units)),
    typeof activity.avgHeartRate === 'number' &&
      tile(
        'Average heart rate',
        `${Math.round(activity.avgHeartRate)} bpm`,
        typeof activity.maxHeartRate === 'number'
          ? `Peak heart rate (30 s) ${Math.round(activity.maxHeartRate)} bpm`
          : undefined,
      ),
    hasPower && speed,
  ].filter(Boolean)
  return (
    <div className="activity-page__summary">
      <div className="activity-page__hero">
        <p className="eyebrow">{timeLabelOf(activity)}</p>
        <p className="hero-number">{formatTotalTime(moving)}</p>
        {elapsedDiffers && (
          <p className="secondary">{`Elapsed ${formatTotalTime(activity.durationS)}`}</p>
        )}
      </div>
      {/* Two lists, so a phone can set the first under the title and the second under the timeline. */}
      <div className="activity-page__tiles">
        {key.length > 0 && (
          <dl className="activity-page__stats activity-page__stats--key">{key}</dl>
        )}
        {more.length > 0 && (
          <dl className="activity-page__stats activity-page__stats--more">{more}</dl>
        )}
      </div>
    </div>
  )
}
