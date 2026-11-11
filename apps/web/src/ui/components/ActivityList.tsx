import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { EarnedRecord } from '@rca/core/records'
import { formatTotalTime } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import { monthTotals } from '../activitiesVolume'
import type { LiftRow } from '../activitiesLift'
import { groupByMonth } from '../activitySort'
import type { ActivitySort } from '../activitySort'
import { movingTimeOf } from '../activityFigures'
import { rowEntries } from '../sessions'
import { rowKeyOf, withLiftRows } from '../listRows'
import type { ListRow } from '../listRows'
import { chipLabels } from '../records'
import { SPORT_NEEDS_WEIGHT } from '../sports'
import { plural } from './plural'
import { ActivityMonthHead } from './ActivityMonthHead'
import { ActivityRow } from './ActivityRow'
import { LiftSessionRow } from './LiftSessionRow'
import { Pager } from './Pager'
import { PAGE_SIZE, usePagination } from './usePagination'
import './ActivityList.css'
import './ActivityListSessions.css'

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
  /** False while no body weight is entered, which holds a ride's record, as its page's records are. */
  weightKnown?: boolean
  /** The list is sorted by climb, so a phone's row shows its climb, which it leaves out of its line otherwise. */
  climbFirst?: boolean
  /** The page to start on, counted from zero, and told each page change, so an address can keep it. */
  initialPage?: number
  onPageChange?: (page: number) => void
  /** The saved copy each activity is kept as. An activity with none cannot be deleted. */
  keptIds?: ReadonlyMap<string, string>
  busy?: boolean
  /**
   * The activities this browser holds detailed readings for. An activity outside it is tagged. Null while
   * that is not known, so no activity is called detail-less early.
   */
  detailIds?: ReadonlySet<string> | null
  /** Whether the visitor is signed in, which says where a removal takes the activity from. */
  signedIn: boolean
  /** The days with lifting that fall in what is listed: each is a row, and adds to its month's heading. */
  lifts?: readonly LiftRow[]
  /** The sort the activities are in, which places the lifting days among them. */
  sort?: ActivitySort
  /** Removes a kept activity by its saved copy. Without it, no row offers Delete. */
  onDelete?: (savedId: string) => void
}

const NO_KEPT: ReadonlyMap<string, string> = new Map()
const NO_LIFTS: readonly LiftRow[] = []

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

/** How many activities a row holds: one, or the legs of a session; a lifting day is one. */
function activitiesIn(entry: ListRow): number {
  return entry.kind === 'session' ? entry.legs.length : 1
}

/**
 * Activities as a list, in the order given with the lifting days placed among them by the sort, a page of 20 rows at a
 * time. Each name opens its activity, or the Lift page at its day.
 * The page is over rows, so a session is one row and is never split across a page.
 */
export function ActivityList({
  activities,
  units,
  records,
  weightKnown = true,
  dateOrder = false,
  climbFirst = false,
  initialPage,
  onPageChange,
  keptIds = NO_KEPT,
  busy = false,
  detailIds = null,
  signedIn,
  lifts = NO_LIFTS,
  sort = 'newest',
  onDelete,
}: ActivityListProps) {
  const collectionId = activityCollectionId(activities)
  // Each month's totals count every activity listed, not only the rows of this page.
  const months = useMemo(
    () => (dateOrder ? monthTotals(activities, lifts) : null),
    [activities, dateOrder, lifts],
  )
  const entries = useMemo(
    () => withLiftRows(rowEntries(activities, dateOrder), lifts, sort),
    [activities, dateOrder, lifts, sort],
  )
  const { page, pageCount, visible, firstItemRef, changePage } = usePagination<
    ListRow,
    HTMLLIElement
  >(entries, PAGE_SIZE, collectionId, { initialPage, onPageChange })
  const previousCollectionIdRef = useRef(collectionId)
  const paginationHadFocusRef = useRef(false)
  const removedRef = useRef(false)
  const listRef = useRef<HTMLDivElement>(null)
  // The page a click asked for, so only a page turned by a click scrolls the list.
  const turnedRef = useRef<number | null>(null)

  // A page turned by a click starts at the top of the list, so its first row is on screen. The focus
  // effect in usePagination runs after this one, and keeps focus on the control only while it is there.
  useLayoutEffect(() => {
    if (turnedRef.current !== page) return
    turnedRef.current = null
    listRef.current?.scrollIntoView({ block: 'start' })
  }, [page])
  const turnPage = (next: number, control: HTMLElement) => {
    turnedRef.current = next
    changePage(next, control)
  }

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

  // The summary counts activities, so a session's legs are counted as the activities they are.
  const before = entries
    .slice(0, page * PAGE_SIZE)
    .reduce((sum, entry) => sum + activitiesIn(entry), 0)
  const firstEntry = visible[0]
  const firstShownId = firstEntry === undefined ? undefined : rowKeyOf(firstEntry)
  const remove = onDelete
    ? (savedId: string) => {
        removedRef.current = true
        onDelete(savedId)
      }
    : undefined
  // Each row's number runs on from the pages before it, a session's legs numbered as the activities they are.
  const placeOf = new Map<string, number>()
  let placed = 0
  for (const entry of visible) {
    const keys = entry.kind === 'session' ? entry.legs.map((leg) => leg.id) : [rowKeyOf(entry)]
    for (const key of keys) {
      placeOf.set(key, before + placed)
      placed += 1
    }
  }
  const rowFor = (activity: ActivitySummary) => {
    const isFirst = activity.id === firstShownId
    return (
      <ActivityRow
        key={activity.id}
        activity={activity}
        units={units}
        isFirst={isFirst}
        holdsRecord={
          !(SPORT_NEEDS_WEIGHT[activity.sport] && !weightKnown) &&
          chipLabels(records.get(activity.id) ?? []).length > 0
        }
        index={placeOf.get(activity.id) ?? 0}
        rowRef={isFirst ? firstItemRef : undefined}
        dateOrder={dateOrder}
        keptId={keptIds.get(activity.id) ?? null}
        busy={busy}
        noDetail={detailIds !== null && !detailIds.has(activity.id)}
        signedIn={signedIn}
        onDelete={remove}
      />
    )
  }
  const entryRows = (items: ListRow[]) =>
    items.map((entry) => {
      if (entry.kind === 'activity') return rowFor(entry.activity)
      if (entry.kind === 'lift') {
        const key = rowKeyOf(entry)
        const isFirst = key === firstShownId
        return (
          <LiftSessionRow
            key={key}
            lift={entry.lift}
            isFirst={isFirst}
            index={placeOf.get(key) ?? 0}
            rowRef={isFirst ? firstItemRef : undefined}
            dateOrder={dateOrder}
          />
        )
      }
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

  const onPage = visible.reduce((sum, entry) => sum + activitiesIn(entry), 0)

  return (
    <div
      className={climbFirst ? 'activity-list activity-list--climb-first' : 'activity-list'}
      ref={listRef}
    >
      {dateOrder ? (
        groupByMonth(visible).map((group) => (
          <section key={group.key} className="activity-list__month">
            <ActivityMonthHead label={group.label} totals={months?.get(group.key)} units={units} />
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
        total={activities.length + lifts.length}
        shown={{ from: before + 1, to: before + onPage }}
        noun={activities.length === 0 ? 'lifts' : 'activities'}
        label="Activity pages"
        announce
        onPageChange={turnPage}
        onFocusWithinChange={(focused) => {
          paginationHadFocusRef.current = focused
        }}
      />
    </div>
  )
}
