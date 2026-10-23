import { Fragment, useEffect, useId, useRef, useState } from 'react'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { UnitSystem } from '@rca/core/units'
import { formatDistance, formatDuration, formatElevation } from '@rca/core/units'
import { keyByContent } from '../contentKeys'
import { plural } from './plural'
import './ActivitiesTable.css'

export interface ActivitiesTableProps {
  activities: ActivitySummary[]
  units: UnitSystem
}

const PAGE_SIZE = 20
const COLUMN_COUNT = 9
const NO_OPEN_ISSUES: ReadonlySet<string> = new Set()
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

const POWER_LABEL: Record<ActivitySummary['powerSource'], string> = {
  measured: 'Measured',
  virtual: 'Estimated on climbs',
  none: '—',
}

/** The viewer's local calendar date as YYYY-MM-DD, so an evening ride keeps its day. */
function localDate(ms: number): string {
  const date = new Date(ms)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function ActivitiesTable({ activities, units }: ActivitiesTableProps) {
  const baseId = useId()
  const collectionId = activityCollectionId(activities)
  const [issuesState, setIssuesState] = useState({
    collectionId,
    openIssues: new Set<string>(),
  })
  const [pageState, setPageState] = useState({ collectionId, page: 0 })
  const openIssues =
    issuesState.collectionId === collectionId ? issuesState.openIssues : NO_OPEN_ISSUES
  const page = pageState.collectionId === collectionId ? pageState.page : 0
  const firstVisibleRef = useRef<HTMLTableRowElement>(null)
  const previousCollectionIdRef = useRef(collectionId)
  const paginationHadFocusRef = useRef(false)
  const focusTargetPageRef = useRef<number | null>(null)

  useEffect(() => {
    if (previousCollectionIdRef.current === collectionId) return
    previousCollectionIdRef.current = collectionId
    if (paginationHadFocusRef.current) {
      firstVisibleRef.current?.focus()
      paginationHadFocusRef.current = false
    }
  }, [collectionId])

  const pageCount = Math.max(1, Math.ceil(activities.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const firstIndex = currentPage * PAGE_SIZE
  const visible = activities.slice(firstIndex, firstIndex + PAGE_SIZE)

  useEffect(() => {
    if (focusTargetPageRef.current !== currentPage) return
    firstVisibleRef.current?.focus()
    focusTargetPageRef.current = null
  }, [currentPage])

  if (activities.length === 0) {
    return <p className="muted">No activities yet</p>
  }

  function toggleIssues(id: string) {
    const next = new Set(openIssues)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setIssuesState({ collectionId, openIssues: next })
  }

  function changePage(nextPage: number) {
    focusTargetPageRef.current = nextPage
    setPageState({ collectionId, page: nextPage })
  }

  return (
    <div className="activities-table">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Activity</th>
              <th scope="col">Sport</th>
              <th scope="col" className="num">
                Time
              </th>
              <th scope="col" className="num">
                Distance
              </th>
              <th scope="col" className="num activities-table__optional">
                Climb
              </th>
              <th scope="col" className="activities-table__optional">
                Power
              </th>
              <th scope="col" className="activities-table__optional">
                Heart rate
              </th>
              <th scope="col">Data issues</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((activity, index) => {
              const panelId = `${baseId}-issues-${encodeURIComponent(activity.id)}`
              const open = openIssues.has(activity.id)
              const issueCount = activity.flags.length
              const isFirstVisible = index === 0
              return (
                <Fragment key={activity.id}>
                  <tr
                    ref={isFirstVisible ? firstVisibleRef : undefined}
                    tabIndex={isFirstVisible ? -1 : undefined}
                  >
                    <td>{localDate(activity.startMs)}</td>
                    <td>
                      <span className="activities-table__name">{activity.name}</span>
                    </td>
                    <td>
                      <span className={`swatch swatch-${activity.sport}`} aria-hidden="true" />
                      {activity.sport === 'run' ? 'Run' : 'Ride'}
                    </td>
                    <td className="num">{formatDuration(activity.durationS)}</td>
                    <td className="num">{formatDistance(activity.distanceM, units)}</td>
                    <td className="num activities-table__optional">
                      {formatElevation(activity.elevationGainM, units)}
                    </td>
                    <td className="activities-table__optional">
                      {POWER_LABEL[activity.powerSource]}
                    </td>
                    <td className="activities-table__optional">
                      {activity.hasHeartRate ? 'Yes' : 'No'}
                    </td>
                    <td>
                      {issueCount === 0 ? (
                        'None'
                      ) : (
                        <button
                          type="button"
                          className="btn"
                          aria-expanded={open}
                          aria-controls={panelId}
                          onClick={() => toggleIssues(activity.id)}
                        >
                          {plural(issueCount, 'issue')}
                        </button>
                      )}
                    </td>
                  </tr>
                  {/* Stays mounted so that aria-controls always names a real element. */}
                  <tr id={panelId} hidden={!open}>
                    <td colSpan={COLUMN_COUNT} className="activities-table__issues">
                      <ul className="activities-table__flags">
                        {keyByContent(
                          activity.flags,
                          (flag) => `${flag.kind}:${flag.start}-${flag.end}`,
                        ).map(({ key, item: flag }) => (
                          <li key={key}>
                            {`${flag.message} (${formatDuration(flag.start)} to ${formatDuration(flag.end)})`}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {/* Always mounted, so the page status is announced when a second page appears. Empty on one page. */}
      <nav
        className="activities-table__pagination"
        aria-label={pageCount > 1 ? 'Activity pages' : undefined}
        onFocusCapture={() => {
          paginationHadFocusRef.current = true
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            paginationHadFocusRef.current = false
          }
        }}
      >
        {pageCount > 1 && (
          <button
            type="button"
            className="btn"
            onClick={() => changePage(currentPage - 1)}
            disabled={currentPage === 0}
          >
            Previous page
          </button>
        )}
        <p role="status" aria-live="polite">
          {pageCount > 1
            ? `Showing ${firstIndex + 1}–${Math.min(firstIndex + PAGE_SIZE, activities.length)} of ${activities.length} activities. Page ${currentPage + 1} of ${pageCount}.`
            : ''}
        </p>
        {pageCount > 1 && (
          <button
            type="button"
            className="btn"
            onClick={() => changePage(currentPage + 1)}
            disabled={currentPage >= pageCount - 1}
          >
            Next page
          </button>
        )}
      </nav>
    </div>
  )
}
