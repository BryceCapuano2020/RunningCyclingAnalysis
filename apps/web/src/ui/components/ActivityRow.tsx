import type { Ref } from 'react'
import type { ActivitySummary } from '@rca/core/pipeline'
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
import { isEstimatedRecord } from '../records'
import { hrefFor } from '../route'
import { SPORT_LABEL } from '../sports'
import { ActivityDelete } from './ActivityDelete'
import { RowIndex } from './RowList'
import { UnitFigure } from './UnitFigure'

export interface ActivityRowProps {
  activity: ActivitySummary
  units: UnitSystem
  /** The first row of a page takes focus when the page changes, so it alone is focusable. */
  isFirst: boolean
  /** The activity holds an all-time record, which the meta line says in one word. */
  holdsRecord?: boolean
  /** The row's place in the list, counted from zero, shown as its mono index. */
  index: number
  rowRef?: Ref<HTMLLIElement>
  /**
   * In date order the month heading names the month, so a row gives only its weekday and day. Any
   * other order gives the month and year too.
   */
  dateOrder?: boolean
  /** The saved copy this activity is kept as, or null when it is not kept, as with the sample. */
  keptId: string | null
  busy: boolean
  /**
   * This browser holds no detailed readings for the activity, which its page then cannot draw. Only such a row offers
   * Delete; any other is removed from its activity page.
   */
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

/** One labelled figure, in its own column: the label is for screen readers, the unit says the rest. */
export function Stat({ label, value, column }: { label: string; value: string; column: string }) {
  return (
    <div className={`activity-list__stat activity-list__stat--${column}`}>
      <dt className="sr-only">{label}</dt>
      <dd>
        <UnitFigure value={value} />
      </dd>
    </div>
  )
}

/**
 * One activity in the list, a numbered row: the index in its sport's ink, the name (which opens it) in serif, one mono
 * line of when it started and, in words, what the figures do not say, and the figures right-aligned in columns that line
 * up from row to row.
 */
export function ActivityRow({
  activity,
  units,
  isFirst,
  holdsRecord = false,
  index,
  rowRef,
  dateOrder = false,
  keptId,
  busy,
  noDetail = false,
  signedIn,
  onDelete,
}: ActivityRowProps) {
  const skipped = materialSkippedCountOf(activity)
  const day = dateOrder ? formatRowDay(activity.startMs) : formatDay(activity.startMs)
  const power = powerCheckChip(activity.powerCheck)
  const hero = heroOf(activity, units)
  // Each word has a fixed name, so a row's words are keyed by what they say and never by their place.
  const words: [string, string | null][] = [
    ['record', holdsRecord ? 'Record' : null],
    ['estimated', hero?.estimated ? 'Estimated power' : null],
    ['indoor', activity.indoor ? 'Indoor' : null],
    [
      'type',
      activity.athleteType !== undefined
        ? ATHLETE_LABEL_CHIP[activity.athleteType]
        : activity.walkingPace
          ? WALKING_PACE_CHIP
          : null,
    ],
    ['power', power],
    ['detail', noDetail ? 'No detail' : null],
    ['skipped', skipped > 0 ? skippedReadingsText(skipped) : null],
  ]
  return (
    <li
      ref={rowRef}
      tabIndex={isFirst ? -1 : undefined}
      className="row activity-list__item"
      data-sport={activity.sport}
    >
      <RowIndex index={index} />
      <span className="sr-only">{SPORT_LABEL[activity.sport]}</span>
      <div className="row__body activity-list__body">
        <div className="activity-list__head">
          <a
            className="row__title activity-list__name"
            href={hrefFor({ page: 'activity', id: activity.id })}
          >
            {activity.name}
          </a>
          {noDetail && keptId !== null && onDelete && (
            <ActivityDelete
              savedId={keptId}
              name={activity.name}
              busy={busy}
              signedIn={signedIn}
              onDelete={onDelete}
            />
          )}
        </div>
        <p className="meta activity-list__sub">
          <span>{`${day}, ${formatTimeOfDay(activity.startMs)}`}</span>
          {words.map(([key, word]) => word !== null && <span key={key}>{word}</span>)}
        </p>
      </div>
      <dl className="num activity-list__stats">
        <Stat
          label={timeLabelOf(activity)}
          value={formatTotalTime(movingTimeOf(activity))}
          column="time"
        />
        {activity.distanceM > 0 && (
          <Stat
            label="Distance"
            value={formatDistance(activity.distanceM, units)}
            column="distance"
          />
        )}
        {activity.elevationGainM > 0 && (
          <Stat
            label="Climb"
            value={formatElevation(activity.elevationGainM, units)}
            column="climb"
          />
        )}
        {hero && <Stat label={hero.label} value={hero.value} column="hero" />}
      </dl>
    </li>
  )
}
