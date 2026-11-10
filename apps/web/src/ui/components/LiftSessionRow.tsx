import type { Ref } from 'react'
import { formatTotalTime } from '@rca/core/units'
import type { LiftRow } from '../activitiesLift'
import { formatDay, formatRowDay, formatTimeOfDay } from '../format/date'
import { hrefFor } from '../route'
import { VOLUME_LABEL } from '../volumeKinds'
import type { VolumeKind } from '../volumeKinds'
import { Stat } from './ActivityRow'
import { plural } from './plural'
import { RowIndex } from './RowList'

const KIND: VolumeKind = 'lift'

export interface LiftSessionRowProps {
  lift: LiftRow
  /** The first row of a page takes focus when the page changes, so it alone is focusable. */
  isFirst: boolean
  /** The row's place in the list, counted from zero, shown as its mono index. */
  index: number
  rowRef?: Ref<HTMLLIElement>
  /** In date order the month heading names the month, so the row gives only its weekday and day. */
  dateOrder?: boolean
}

/**
 * A lifting day in the Activities list, a row like an activity's: its main lifts as the name, which opens the Lift page at
 * that day, when it started, and its time and sets. A time estimated from the sets is written "~" and says so in words.
 * A lifting day holds no record and has no file to delete, so the row offers neither.
 */
export function LiftSessionRow({
  lift,
  isFirst,
  index,
  rowRef,
  dateOrder = false,
}: LiftSessionRowProps) {
  const day = dateOrder ? formatRowDay(lift.startMs) : formatDay(lift.startMs)
  return (
    <li
      ref={rowRef}
      tabIndex={isFirst ? -1 : undefined}
      className="row activity-list__item"
      data-sport={KIND}
    >
      <RowIndex index={index} />
      <span className="sr-only">{VOLUME_LABEL[KIND]}</span>
      <div className="row__body activity-list__body">
        <div className="activity-list__head">
          <a
            className="row__title activity-list__name"
            href={`${hrefFor({ page: 'lift' })}?day=${lift.date}`}
          >
            {lift.name}
          </a>
        </div>
        <p className="meta activity-list__sub">
          <span>{lift.timed ? `${day}, ${formatTimeOfDay(lift.startMs)}` : day}</span>
          {!lift.measured && <span>Estimated time</span>}
        </p>
      </div>
      <dl className="num activity-list__stats">
        <Stat
          label="Time"
          value={`${lift.measured ? '' : '~'}${formatTotalTime(lift.seconds)}`}
          column="time"
        />
        <Stat label="Sets" value={plural(lift.sets, 'set')} column="distance" />
      </dl>
    </li>
  )
}
