import { useEffect, useRef, type Ref } from 'react'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { EarnedRecord } from '@rca/core/records'
import type { UnitSystem } from '@rca/core/units'
import { formatDistance, formatDuration, formatElevation, formatPace } from '@rca/core/units'
import { formatDay } from '../format/date'
import { chipLabels } from '../records'
import { hrefFor } from '../route'
import { SPORT_LABEL } from '../sports'
import { SportIcon, WarningIcon } from './icons'
import { Pager } from './Pager'
import { plural } from './plural'
import { PAGE_SIZE, usePagination } from './usePagination'
import './ActivityList.css'

/** Most record chips a row shows; the rest are counted. The activity page lists them all. */
const CHIPS_PER_ROW = 2

export interface ActivityListProps {
  activities: ActivitySummary[]
  units: UnitSystem
  /** The records each activity holds across the library, keyed by activity id. */
  records: ReadonlyMap<string, readonly EarnedRecord[]>
}

const activityCollectionIds = new WeakMap<ActivitySummary[], number>()
let nextActivityCollectionId = 0

function activityCollectionId(activities: ActivitySummary[]): number {
  let id = activityCollectionIds.get(activities)
  if (id === undefined) {
    id = ++nextActivityCollectionId
    activityCollectionIds.set(activities, id)
  }
  return id
}

interface ActivityRowProps {
  activity: ActivitySummary
  units: UnitSystem
  rowRef?: Ref<HTMLLIElement>
  /** The first row on a page takes focus when the page changes, so it alone is focusable. */
  isFirst: boolean
  records: readonly EarnedRecord[]
}

function ActivityRow({ activity, units, rowRef, isFirst, records }: ActivityRowProps) {
  const isRun = activity.sport === 'run'
  const issueCount = activity.flags.length
  const chips = chipLabels(records)
  return (
    <li ref={rowRef} tabIndex={isFirst ? -1 : undefined} className="activity-list__item">
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
          <span>{formatDay(activity.startMs)}</span>
          {issueCount > 0 && (
            <span className="chip chip--warning">
              <WarningIcon />
              {plural(issueCount, 'data issue')}
            </span>
          )}
        </p>
        <p className="activity-list__stats">
          <span>{formatDuration(activity.durationS)}</span>
          <span>{formatDistance(activity.distanceM, units)}</span>
          {isRun ? (
            <span>{formatPace(activity.distanceM / activity.durationS, units)}</span>
          ) : (
            activity.elevationGainM > 0 && (
              <span>{formatElevation(activity.elevationGainM, units)}</span>
            )
          )}
        </p>
        {chips.length > 0 && (
          <div className="activity-list__records" role="group" aria-label="Records earned">
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
      </div>
    </li>
  )
}

/** Activities as a list, newest first as given, 20 to a page. Each name opens its activity. */
export function ActivityList({ activities, units, records }: ActivityListProps) {
  const collectionId = activityCollectionId(activities)
  const { page, pageCount, visible, firstItemRef, changePage } = usePagination<
    ActivitySummary,
    HTMLLIElement
  >(activities, PAGE_SIZE, collectionId)
  const previousCollectionIdRef = useRef(collectionId)
  const paginationHadFocusRef = useRef(false)

  useEffect(() => {
    if (previousCollectionIdRef.current === collectionId) return
    previousCollectionIdRef.current = collectionId
    // A new list while focus is on the pager would drop focus, so it goes to the first row.
    if (paginationHadFocusRef.current) {
      firstItemRef.current?.focus()
      paginationHadFocusRef.current = false
    }
  }, [collectionId, firstItemRef])

  return (
    <div className="activity-list">
      <ul className="activity-list__items">
        {visible.map((activity, index) => (
          <ActivityRow
            key={activity.id}
            activity={activity}
            units={units}
            isFirst={index === 0}
            rowRef={index === 0 ? firstItemRef : undefined}
            records={records.get(activity.id) ?? []}
          />
        ))}
      </ul>
      <Pager
        page={page}
        pageCount={pageCount}
        pageSize={PAGE_SIZE}
        total={activities.length}
        noun="activities"
        label="Activity pages"
        announce
        onPageChange={changePage}
        onFocusWithinChange={(focused) => {
          paginationHadFocusRef.current = focused
        }}
      />
    </div>
  )
}
