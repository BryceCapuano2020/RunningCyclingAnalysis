import { useEffect, useMemo, useRef, useState } from 'react'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { EarnedRecord } from '@rca/core/records'
import { startedWithin, windowEnding } from '@rca/core/period'
import type { PeriodChoice } from '@rca/core/period'
import type { UnitSystem } from '@rca/core/units'
import { ACTIVITY_SORTS, SORT_LABELS, sortActivities } from '../activitySort'
import { bucketInPhrase, bucketSpan, inBucket } from '../activitiesVolume'
import { DEFAULT_VIEW, hasRemovedMark, queryFromView, viewFromQuery } from '../activitiesView'
import type { ActivitiesView, SportFilter } from '../activitiesView'
import { ActivityList } from '../components/ActivityList'
import { LIBRARY_RANGE_OPTIONS } from '../components/rangeOptions'
import { listEmptyText, periodClause } from '../periodCopy'
import { SPORT_PLURAL } from '../sports'
import { RangePicker } from '../components/RangePicker'
import { VolumeStrip } from '../components/VolumeStrip'
import { SegmentedControl } from '../components/SegmentedControl'
import type { SegmentedControlOption } from '../components/SegmentedControl'
import { countSport } from '../records'
import { useDeleteOutcome } from '../useDeleteOutcome'
import { hashQuery, hrefFor } from '../route'
import { PAGE_HEADING_ID } from './pageHeading'
import './ActivitiesPage.css'

export interface ActivitiesPageProps {
  /** Every activity in the library, newest first. The page narrows it; it never drops one. */
  activities: ActivitySummary[]
  units: UnitSystem
  /** The records each activity holds across the library, keyed by activity id. */
  records: ReadonlyMap<string, readonly EarnedRecord[]>
  /** The saved copy each activity is kept as. Only a kept activity can be deleted. */
  keptIds?: ReadonlyMap<string, string>
  /** False while no body weight is entered, which holds a ride's record chips. */
  weightKnown?: boolean
  busy?: boolean
  /** The activities this browser holds detailed readings for; null while that is not known. */
  detailIds?: ReadonlySet<string> | null
  /** Whether the visitor is signed in, which says where a removal takes the activity from. */
  signedIn: boolean
  onDelete?: (savedId: string) => void
  /** The library's notice and error, which say how a removal from this page ended. */
  libraryNotice?: string | null
  libraryError?: string | null
}

const SPORT_OPTIONS: SegmentedControlOption<SportFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'run', label: 'Runs' },
  { value: 'ride', label: 'Rides' },
]

/** The period a picker choice names: a number of days, or the whole library. */
function periodFromChoice(choice: PeriodChoice): ActivitiesView['period'] {
  return typeof choice === 'number' ? choice : 'all'
}

/**
 * Every activity in the library, counted by sport. The page has its own period and sport filters,
 * which start with the whole library and only narrow what is listed, and a sort. Its view is kept in
 * the address, so Back returns to the same page of it.
 */
export function ActivitiesPage({
  activities,
  units,
  records,
  keptIds,
  weightKnown = true,
  busy = false,
  detailIds = null,
  signedIn,
  onDelete,
  libraryNotice = null,
  libraryError = null,
}: ActivitiesPageProps) {
  // A page that removed an activity sends the list here marked, so the list announces the outcome.
  const [arrivedAfterRemoval] = useState(() => hasRemovedMark(window.location.hash))
  const removal = useDeleteOutcome(libraryNotice, libraryError, arrivedAfterRemoval)
  // Set by a removal from this list, so a list it empties takes focus: the row that had it is gone.
  const removedRef = useRef(false)
  const emptyRef = useRef<HTMLDivElement>(null)
  const removeHere =
    onDelete &&
    ((savedId: string) => {
      removedRef.current = true
      removal.begin()
      onDelete(savedId)
    })

  // The view starts where the address says it is, so a list opened again is the list it was.
  const [view, setView] = useState<ActivitiesView>(() =>
    viewFromQuery(hashQuery(window.location.hash)),
  )
  const { sport, sort, period, bucket, page } = view

  // The view follows the address, so a link to the list, which changes only the hash, resets it.
  useEffect(() => {
    const follow = () => {
      removedRef.current = false
      setView(viewFromQuery(hashQuery(window.location.hash)))
    }
    window.addEventListener('hashchange', follow)
    return () => window.removeEventListener('hashchange', follow)
  }, [])
  const days = typeof period === 'number' ? period : null
  // What the period and sport leave, before a week or month is picked: the volume strip draws this set.
  const inPeriod = useMemo(
    () =>
      startedWithin(activities, days).filter(
        (activity) => sport === 'all' || activity.sport === sport,
      ),
    [activities, days, sport],
  )
  // Memoised, so a re-render with the same activities keeps the pager on the page it is on.
  const shown = useMemo(
    () => sortActivities(inBucket(inPeriod, bucket), sort),
    [inPeriod, bucket, sort],
  )
  // Written without a new history entry, so Back still leaves the page the visitor came from.
  useEffect(() => {
    const query = queryFromView(view)
    const hash = `${hrefFor({ page: 'activities' })}${query ? `?${query}` : ''}`
    if (window.location.hash !== hash) window.history.replaceState(window.history.state, '', hash)
  }, [view])

  const newestMs = activities.reduce(
    (high, activity) => Math.max(high, activity.startMs),
    -Infinity,
  )
  // The period counts the library, or the one sport the list is narrowed to, in that sport's own words.
  const counted = sport === 'all' ? activities.length : countSport(activities, sport)
  // A new filter or sort is a new list, so it starts on its first page.
  const narrow = (patch: Partial<ActivitiesView>) => {
    removedRef.current = false
    removal.clear()
    setView((current) => ({ ...current, ...patch, page: 0 }))
  }
  useEffect(() => {
    if (shown.length > 0 || !removedRef.current) {
      // A list that still has rows, after a removal, kept its focus where it was; the flag is spent.
      if (shown.length > 0) removedRef.current = false
      return
    }
    removedRef.current = false
    // The last activity gone leaves no empty state to focus, so focus goes to the page heading.
    ;(emptyRef.current ?? document.getElementById(PAGE_HEADING_ID))?.focus()
  }, [shown.length])
  const span = bucket === null ? null : bucketSpan(bucket)
  // A week or month with nothing in it, beside a period that has something: the bucket is why the list is empty.
  const emptiedByBucket = span !== null && inPeriod.length > 0
  const showAll = () =>
    narrow({ period: DEFAULT_VIEW.period, sport: DEFAULT_VIEW.sport, bucket: DEFAULT_VIEW.bucket })
  return (
    <div className="page-stack activities">
      <div className="page-title">
        <h1 id={PAGE_HEADING_ID} tabIndex={-1}>
          Activities
        </h1>
        {activities.length === 0 && <p className="secondary">No activities yet</p>}
      </div>
      {inPeriod.length > 0 && (
        <VolumeStrip
          activities={inPeriod}
          periodText={periodClause(days, newestMs)}
          selected={bucket}
          onSelect={(next) => narrow({ bucket: next })}
        />
      )}
      {activities.length > 0 && (
        <div className="activities__controls">
          <RangePicker
            choice={period}
            options={LIBRARY_RANGE_OPTIONS}
            shown={shown.length}
            total={counted}
            noun={sport === 'all' ? 'activity' : sport}
            onChange={(next, answered) => {
              narrow({ period: periodFromChoice(next), bucket: null })
              answered(null)
            }}
          />
          <div className="activities__filters">
            <SegmentedControl
              legend="Sport"
              options={SPORT_OPTIONS}
              selected={sport}
              onSelect={(next) => narrow({ sport: next, bucket: null })}
            />
            <label className="activities__sort">
              <span>Sort by</span>
              <select
                value={sort}
                onChange={(event) => {
                  const next = ACTIVITY_SORTS.find((option) => option === event.target.value)
                  if (next !== undefined) narrow({ sort: next })
                }}
              >
                {ACTIVITY_SORTS.map((option) => (
                  <option key={option} value={option}>
                    {SORT_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}
      {removal.outcome !== null &&
        (removal.outcome.failed ? (
          <p role="alert" className="activities__outcome">
            {removal.outcome.text}
          </p>
        ) : (
          <p role="status" className="activities__outcome">
            {removal.outcome.text}
          </p>
        ))}
      {shown.length > 0 ? (
        <ActivityList
          activities={shown}
          units={units}
          records={records}
          dateOrder={sort === 'newest' || sort === 'oldest'}
          climbFirst={sort === 'climb'}
          initialPage={page}
          onPageChange={(next) => {
            removal.clear()
            setView((current) => ({ ...current, page: next }))
          }}
          keptIds={keptIds}
          weightKnown={weightKnown}
          busy={busy}
          detailIds={detailIds}
          signedIn={signedIn}
          onDelete={removeHere}
        />
      ) : (
        activities.length > 0 && (
          <div className="activities__empty" ref={emptyRef} tabIndex={-1}>
            {emptiedByBucket ? (
              <>
                <p className="secondary">
                  {`No ${sport === 'all' ? 'activities' : SPORT_PLURAL[sport]} in ${bucketInPhrase(span)}.`}
                </p>
                <p>
                  <button type="button" className="btn" onClick={() => narrow({ bucket: null })}>
                    {`Clear ${span.kind}`}
                  </button>
                </p>
              </>
            ) : (
              <>
                <p className="secondary">
                  {listEmptyText(sport, days === null ? null : windowEnding(newestMs, days))}
                </p>
                <p>
                  <button type="button" className="btn" onClick={showAll}>
                    Show all activities
                  </button>
                </p>
              </>
            )}
          </div>
        )
      )}
    </div>
  )
}
