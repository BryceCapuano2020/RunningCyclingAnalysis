import { useEffect, useMemo, useRef } from 'react'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { EarnedRecord } from '@rca/core/records'
import { formatTotalTime } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import { groupByMonth } from '../activitySort'
import { movingTimeOf } from '../activityFigures'
import { firstActivityOf, rowEntries } from '../sessions'
import type { ListEntry } from '../sessions'
import { plural } from './plural'
import { ActivityRow } from './ActivityRow'
import { Pager } from './Pager'
import { PAGE_SIZE, usePagination } from './usePagination'
import './ActivityList.css'

export interface ActivityListProps {
  activities: ActivitySummary[]
  units: UnitSystem
  /** The records each activity holds across the library, keyed by activity id. */
  records: ReadonlyMap<string, readonly EarnedRecord[]>
  /**
   * The list is in date order, so its rows are headed by month and the legs of one upload are grouped
   * as a session. Other sorts list each activity as its own row.
   */
  dateOrder?: boolean
  /** The page to start on, counted from zero, and told each page change, so an address can keep it. */
  initialPage?: number
  onPageChange?: (page: number) => void
  /** The saved copy each activity is kept as. An activity with none cannot be deleted. */
  keptIds?: ReadonlyMap<string, string>
  /** False while no body weight is entered, which holds a ride's record chips. */
  weightKnown?: boolean
  busy?: boolean
  /** Removes a kept activity by its saved copy. Without it, no row offers Delete. */
  onDelete?: (savedId: string) => void
}

const NO_KEPT: ReadonlyMap<string, string> = new Map()

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

/** How many activities a row holds: one, or the legs of a session. */
function activitiesIn(entry: ListEntry): number {
  return entry.kind === 'activity' ? 1 : entry.legs.length
}

/**
 * Activities as a list, in the order given, a page of 20 rows at a time. Each name opens its activity.
 * The page is over rows, so a session is one row and is never split across a page.
 */
export function ActivityList({
  activities,
  units,
  records,
  dateOrder = false,
  initialPage,
  onPageChange,
  keptIds = NO_KEPT,
  weightKnown = true,
  busy = false,
  onDelete,
}: ActivityListProps) {
  const collectionId = activityCollectionId(activities)
  const entries = useMemo(() => rowEntries(activities, dateOrder), [activities, dateOrder])
  const { page, pageCount, visible, firstItemRef, changePage } = usePagination<
    ListEntry,
    HTMLLIElement
  >(entries, PAGE_SIZE, collectionId, { initialPage, onPageChange })
  const previousCollectionIdRef = useRef(collectionId)
  const paginationHadFocusRef = useRef(false)
  const removedRef = useRef(false)

  useEffect(() => {
    if (previousCollectionIdRef.current === collectionId) return
    previousCollectionIdRef.current = collectionId
    // A new list while focus is on the pager, or a removal that took its row away, would drop focus,
    // so it goes to the first row that is left.
    if (paginationHadFocusRef.current || removedRef.current) {
      firstItemRef.current?.focus()
    }
    paginationHadFocusRef.current = false
    removedRef.current = false
  }, [collectionId, firstItemRef])

  const firstEntry = visible[0]
  const firstShownId = firstEntry === undefined ? undefined : firstActivityOf(firstEntry).id
  const remove = onDelete
    ? (savedId: string) => {
        removedRef.current = true
        onDelete(savedId)
      }
    : undefined
  const rowFor = (activity: ActivitySummary) => {
    const isFirst = activity.id === firstShownId
    return (
      <ActivityRow
        key={activity.id}
        activity={activity}
        units={units}
        isFirst={isFirst}
        rowRef={isFirst ? firstItemRef : undefined}
        records={records.get(activity.id) ?? []}
        keptId={keptIds.get(activity.id) ?? null}
        weightKnown={weightKnown}
        busy={busy}
        onDelete={remove}
      />
    )
  }
  const entryRows = (items: ListEntry[]) =>
    items.map((entry) => {
      if (entry.kind === 'activity') return rowFor(entry.activity)
      const total = entry.legs.reduce((sum, leg) => sum + movingTimeOf(leg), 0)
      return (
        <li key={`session-${entry.key}-${entry.legs[0]?.id}`} className="activity-list__session">
          <div role="group" aria-label={`${plural(entry.legs.length, 'leg')} in one session`}>
            <p className="activity-list__session-title">
              <span>{formatTotalTime(total)}</span>
              {' in total'}
            </p>
            <ul className="activity-list__legs">{entry.legs.map(rowFor)}</ul>
          </div>
        </li>
      )
    })

  // The summary counts activities, so a session's legs are counted as the activities they are.
  const before = entries
    .slice(0, page * PAGE_SIZE)
    .reduce((sum, entry) => sum + activitiesIn(entry), 0)
  const onPage = visible.reduce((sum, entry) => sum + activitiesIn(entry), 0)

  return (
    <div className="activity-list">
      {dateOrder ? (
        groupByMonth(visible).map((group) => (
          <section key={group.key} className="activity-list__month">
            <h2 className="activity-list__heading">{group.label}</h2>
            <ul className="activity-list__items">{entryRows(group.items)}</ul>
          </section>
        ))
      ) : (
        <ul className="activity-list__items">{entryRows(visible)}</ul>
      )}
      <Pager
        page={page}
        pageCount={pageCount}
        pageSize={PAGE_SIZE}
        total={activities.length}
        shown={{ from: before + 1, to: before + onPage }}
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
