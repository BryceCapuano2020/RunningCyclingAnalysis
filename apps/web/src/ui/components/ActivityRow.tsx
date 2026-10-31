import type { Ref } from 'react'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { EarnedRecord } from '@rca/core/records'
import { formatCount } from '../format/count'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import {
  formatDistance,
  formatElevation,
  formatPace,
  formatPower,
  formatSpeed,
  formatTotalTime,
} from '@rca/core/units'
import { materialSkippedCountOf, movingTimeOf, timeLabelOf } from '../activityFigures'
import { skippedReadingsText } from '../analysis/flagCopy'
import { powerCheckChip } from '../analysis/powerCheckCopy'
import { ATHLETE_LABEL_CHIP, WALKING_PACE_CHIP } from '../analysis/walkingPaceCopy'
import { formatDay, formatRowDay, formatTimeOfDay } from '../format/date'
import { chipLabels, isEstimatedRecord } from '../records'
import { hrefFor } from '../route'
import { SPORT_LABEL, SPORT_NEEDS_WEIGHT } from '../sports'
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
  /**
   * In date order the month heading names the month, so a row gives only its weekday and day. Any
   * other order gives the month and year too.
   */
  dateOrder?: boolean
  /** The saved copy this activity is kept as, or null when it is not kept, as with the sample. */
  keptId: string | null
  /** False while no body weight is entered: a ride's record chips wait for it, as its page's do. */
  weightKnown: boolean
  busy: boolean
  /** This browser holds no detailed readings for the activity, which its page then cannot draw. */
  noDetail?: boolean
  /** Whether the visitor is signed in, which says where a removal takes the activity from. */
  signedIn: boolean
  /** Removes the kept copy. Without it, the row offers no Delete. */
  onDelete?: (savedId: string) => void
}

interface Hero {
  label: string
  value: string
  /** True for watts that no power meter measured, which the row says in words. */
  estimated?: boolean
}

/** How a sport's distance becomes the row's headline figure: a run's pace, a ride's speed. */
interface DistanceFigure {
  label: string
  format: (speedMs: number, units: UnitSystem) => string
  /** Whether an indoor activity with a distance gets it too: a treadmill run has a pace, a trainer ride no speed. */
  indoor: boolean
}

const DISTANCE_FIGURE: Record<Sport, DistanceFigure> = {
  run: { label: 'Pace', format: formatPace, indoor: true },
  ride: { label: 'Speed', format: formatSpeed, indoor: false },
}

/**
 * The row's headline figure, at the right: a run's pace, a ride's speed, or the average power of an
 * indoor ride with a power meter. A figure with no distance or power has none.
 */
function heroOf(activity: ActivitySummary, units: UnitSystem): Hero | null {
  const figure = DISTANCE_FIGURE[activity.sport]
  if (activity.distanceM > 0 && (figure.indoor || !activity.indoor)) {
    return {
      label: figure.label,
      value: figure.format(activity.distanceM / movingTimeOf(activity), units),
    }
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

/**
 * One activity in the list: its name opens it. The sport's glyph leads; the name, when it started and the
 * chips follow; the figures sit in columns at the right on a wide screen and in a line under the name on a phone.
 */
export function ActivityRow({
  activity,
  units,
  records,
  isFirst,
  rowRef,
  dateOrder = false,
  keptId,
  weightKnown,
  busy,
  noDetail = false,
  signedIn,
  onDelete,
}: ActivityRowProps) {
  const skipped = materialSkippedCountOf(activity)
  const day = dateOrder ? formatRowDay(activity.startMs) : formatDay(activity.startMs)
  const chips = SPORT_NEEDS_WEIGHT[activity.sport] && !weightKnown ? [] : chipLabels(records)
  const power = powerCheckChip(activity.powerCheck)
  const hero = heroOf(activity, units)
  return (
    <li
      ref={rowRef}
      tabIndex={isFirst ? -1 : undefined}
      className="activity-list__item"
      data-sport={activity.sport}
    >
      <div className="activity-list__main">
        <span className="activity-list__glyph">
          <SportIcon
            sport={activity.sport}
            className={`activity-list__icon activity-list__icon--${activity.sport}`}
          />
          <span className="sr-only">{SPORT_LABEL[activity.sport]}</span>
        </span>
        <div className="activity-list__head">
          <a className="activity-list__name" href={hrefFor({ page: 'activity', id: activity.id })}>
            {activity.name}
          </a>
          {keptId !== null && onDelete && (
            <ActivityDelete
              savedId={keptId}
              name={activity.name}
              busy={busy}
              signedIn={signedIn}
              onDelete={onDelete}
            />
          )}
        </div>
        <div className="activity-list__sub">
          <span className="activity-list__when">{`${day}, ${formatTimeOfDay(activity.startMs)}`}</span>
          <div className="activity-list__tags">
            {hero?.estimated && <span className="chip">Estimated power</span>}
            {activity.indoor && <span className="chip">Indoor</span>}
            {activity.athleteType !== undefined ? (
              <span className="chip">{ATHLETE_LABEL_CHIP[activity.athleteType]}</span>
            ) : (
              activity.walkingPace && <span className="chip">{WALKING_PACE_CHIP}</span>
            )}
            {power !== null && <span className="chip chip--warning">{power}</span>}
            {noDetail && <span className="chip">No detail</span>}
            {skipped > 0 && (
              <span className="chip chip--warning">
                <WarningIcon />
                {skippedReadingsText(skipped)}
              </span>
            )}
            {chips.length > 0 && (
              <span className="activity-list__records" role="group" aria-label="All-time records">
                {chips.slice(0, CHIPS_PER_ROW).map((label) => (
                  <span key={label} className="chip" data-sport={activity.sport}>
                    {label}
                  </span>
                ))}
                {chips.length > CHIPS_PER_ROW && (
                  <span className="activity-list__more">{`+${formatCount(chips.length - CHIPS_PER_ROW)} more records`}</span>
                )}
              </span>
            )}
          </div>
        </div>
        <dl className="activity-list__stats">
          <StatFigure
            label={timeLabelOf(activity)}
            value={formatTotalTime(movingTimeOf(activity))}
            className="activity-list__stat activity-list__stat--time"
            labelClassName="activity-list__label"
            valueClassName="activity-list__value"
          />
          {activity.distanceM > 0 && (
            <StatFigure
              label="Distance"
              value={formatDistance(activity.distanceM, units)}
              className="activity-list__stat activity-list__stat--distance"
              labelClassName="activity-list__label"
              valueClassName="activity-list__value"
            />
          )}
          {activity.elevationGainM > 0 && (
            <StatFigure
              label="Climb"
              value={formatElevation(activity.elevationGainM, units)}
              className="activity-list__stat activity-list__stat--climb"
              labelClassName="activity-list__label"
              valueClassName="activity-list__value"
            />
          )}
          {hero && (
            <StatFigure
              label={hero.label}
              value={hero.value}
              className="activity-list__stat activity-list__stat--hero"
              labelClassName="activity-list__label"
              valueClassName="activity-list__value activity-list__value--hero"
            />
          )}
        </dl>
        <ArrowRightIcon className="activity-list__chevron" />
      </div>
    </li>
  )
}
