import type { Ref } from 'react'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { EarnedRecord } from '@rca/core/records'
import type { UnitSystem } from '@rca/core/units'
import {
  formatDistance,
  formatElevation,
  formatPace,
  formatPower,
  formatSpeed,
  formatTotalTime,
} from '@rca/core/units'
import { movingTimeOf, skippedCountOf, timeLabelOf } from '../activityFigures'
import { skippedReadingsText } from '../analysis/flagCopy'
import { formatRowDay, formatTimeOfDay } from '../format/date'
import { chipLabels, isEstimatedRecord } from '../records'
import { hrefFor } from '../route'
import { SPORT_LABEL } from '../sports'
import { ActivityDelete } from './ActivityDelete'
import { StatFigure } from './StatFigure'
import { ArrowRightIcon, SportIcon, WarningIcon } from './icons'

/** Most record chips a row shows; the rest are counted. The activity page lists them all. */
const CHIPS_PER_ROW = 2

export interface ActivityRowProps {
  activity: ActivitySummary
  units: UnitSystem
  records: readonly EarnedRecord[]
  /** The first row of a page takes focus when the page changes, so it alone is focusable. */
  isFirst: boolean
  rowRef?: Ref<HTMLLIElement>
  /** The saved copy this activity is kept as, or null when it is not kept, as with the sample. */
  keptId: string | null
  /** False while no body weight is entered: a ride's record chips wait for it, as its page's do. */
  weightKnown: boolean
  busy: boolean
  /** Removes the kept copy. Without it, the row offers no Delete. */
  onDelete?: (savedId: string) => void
}

interface Hero {
  label: string
  value: string
  /** True for watts that no power meter measured, which the row says in words. */
  estimated?: boolean
}

/**
 * The row's headline figure, at the right: a run's pace, a ride's speed, or the average power of an
 * indoor ride with a power meter. A figure with no distance or power has none.
 */
function heroOf(activity: ActivitySummary, units: UnitSystem): Hero | null {
  const moving = movingTimeOf(activity)
  if (activity.distanceM > 0 && activity.sport === 'run') {
    return { label: 'Pace', value: formatPace(activity.distanceM / moving, units) }
  }
  if (activity.distanceM > 0 && !activity.indoor) {
    return { label: 'Speed', value: formatSpeed(activity.distanceM / moving, units) }
  }
  if (typeof activity.avgPowerW === 'number') {
    return {
      label: 'Power',
      value: formatPower(activity.avgPowerW),
      estimated: isEstimatedRecord(activity.sport, activity),
    }
  }
  return null
}

/** One activity in the list: its name opens it, and its figures and chips sit beside the name. */
export function ActivityRow({
  activity,
  units,
  records,
  isFirst,
  rowRef,
  keptId,
  weightKnown,
  busy,
  onDelete,
}: ActivityRowProps) {
  const skipped = skippedCountOf(activity)
  // A ride's record chips are the library's bests, which use the body mass, so they wait for the weight.
  const chips = activity.sport === 'ride' && !weightKnown ? [] : chipLabels(records)
  const hero = heroOf(activity, units)
  return (
    <li ref={rowRef} tabIndex={isFirst ? -1 : undefined} className="activity-list__item">
      <div className="activity-list__main">
        <div className="activity-list__body">
          <a className="activity-list__name" href={hrefFor({ page: 'activity', id: activity.id })}>
            {activity.name}
          </a>
          <p className="activity-list__meta">
            <span className="activity-list__sport">
              <SportIcon
                sport={activity.sport}
                className={`activity-list__icon activity-list__icon--${activity.sport}`}
              />
              {SPORT_LABEL[activity.sport]}
            </span>
            <span>{`${formatRowDay(activity.startMs)}, ${formatTimeOfDay(activity.startMs)}`}</span>
            {activity.indoor && <span className="chip">Indoor</span>}
            {skipped > 0 && (
              <span className="chip chip--warning">
                <WarningIcon />
                {skippedReadingsText(skipped)}
              </span>
            )}
          </p>
          <dl className="activity-list__stats">
            <StatFigure
              label={timeLabelOf(activity)}
              value={formatTotalTime(movingTimeOf(activity))}
              className="activity-list__stat"
            />
            {activity.distanceM > 0 && (
              <StatFigure
                label="Distance"
                value={formatDistance(activity.distanceM, units)}
                className="activity-list__stat"
              />
            )}
            {activity.elevationGainM > 0 && (
              <StatFigure
                label="Climb"
                value={formatElevation(activity.elevationGainM, units)}
                className="activity-list__stat"
              />
            )}
          </dl>
          {chips.length > 0 && (
            <div className="activity-list__records" role="group" aria-label="All-time records">
              {chips.slice(0, CHIPS_PER_ROW).map((label) => (
                <span key={label} className={`chip chip--${activity.sport}`}>
                  {label}
                </span>
              ))}
              {chips.length > CHIPS_PER_ROW && (
                <span className="activity-list__more">{`+${chips.length - CHIPS_PER_ROW} more records`}</span>
              )}
            </div>
          )}
          {keptId !== null && onDelete && (
            <ActivityDelete savedId={keptId} name={activity.name} busy={busy} onDelete={onDelete} />
          )}
        </div>
        {hero && (
          <p className="activity-list__hero">
            <span className="eyebrow">{hero.label}</span>
            <span className="stat-number">{hero.value}</span>
            {hero.estimated && <span className="chip">Estimated</span>}
          </p>
        )}
        <ArrowRightIcon className="activity-list__chevron" />
      </div>
    </li>
  )
}
