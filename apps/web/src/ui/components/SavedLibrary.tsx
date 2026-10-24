import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import './SavedLibrary.css'
import { formatDay } from '../format/date'
import { SPORT_LABEL } from '../sports'
import { DeleteConfirmation } from './DeleteConfirmation'
import { SportIcon } from './icons'
import { Pager } from './Pager'
import { plural } from './plural'
import { PAGE_SIZE, usePagination } from './usePagination'

export interface SavedLibraryActivity {
  id: string
  name: string
  startMs: number
  sport: 'run' | 'ride'
}

/** The signed-in account's library, or the activities kept in this browser when signed out. */
export type SavedScope = 'account' | 'device'

export interface SavedLibraryProps {
  activities: SavedLibraryActivity[]
  busy: boolean
  onDelete: (id: string) => void
  /** A polite outcome message, such as "Deleted Morning Run (Thu 1 Jan)." */
  status: string | null
  /** A library action failure message. */
  error: string | null
  /** Stored activities the server could not read, so they are not listed. */
  unreadable?: number
  scope?: SavedScope
  /** A removal dialog is open beside the list, so no row confirmation stays open with it. */
  removalOpen?: boolean
}

/**
 * What a delete removes, and how its confirmation reads. Only the account keeps original files, so
 * only its confirmation is the red card; a summary kept in this browser gets the neutral one.
 */
const DELETE_FOR: Record<SavedScope, { note: string; critical: boolean }> = {
  account: {
    note: 'This deletes the activity’s original file, if one is stored, and its saved summary from your account.',
    critical: true,
  },
  device: {
    note: 'This removes the activity’s summary from this browser.',
    critical: false,
  },
}

/** The note on stored activities the server could not read, singular or plural. */
function unreadableNote(count: number): string {
  const one = count === 1
  return `${plural(count, 'saved activity', 'saved activities')} could not be read and ${one ? 'is' : 'are'} hidden. Re-adding ${one ? 'its file' : 'their files'} will restore ${one ? 'it' : 'them'}.`
}

export function SavedLibrary({
  activities,
  busy,
  onDelete,
  status,
  error,
  unreadable = 0,
  scope = 'account',
  removalOpen = false,
}: SavedLibraryProps) {
  const [selected, setSelected] = useState<SavedLibraryActivity | null>(null)
  const regionRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const lastConfirmingIdRef = useRef<string | null>(null)
  const { page, pageCount, visible, firstItemRef, changePage } = usePagination<
    SavedLibraryActivity,
    HTMLTableRowElement
  >(activities, PAGE_SIZE)
  const confirming =
    selected !== null && activities.some((activity) => activity.id === selected.id)
      ? selected
      : null
  const confirmingId = confirming?.id ?? null

  // The confirmed activity was removed elsewhere, or a removal dialog opened over the list: either
  // way the confirmation goes.
  if (selected !== null && (confirming === null || removalOpen)) setSelected(null)

  useEffect(() => {
    const previousId = lastConfirmingIdRef.current
    lastConfirmingIdRef.current = confirmingId
    // The open confirmation was removed while it held focus: keep focus in the library.
    if (confirmingId === null && previousId !== null && document.activeElement === document.body) {
      regionRef.current?.focus()
    }
  }, [confirmingId])

  const closeConfirmation = useCallback(() => {
    const trigger = triggerRef.current
    const target = trigger?.isConnected ? trigger : regionRef.current
    setSelected(null)
    target?.focus()
  }, [])

  function openConfirmation(activity: SavedLibraryActivity, trigger: HTMLButtonElement) {
    triggerRef.current = trigger
    setSelected(activity)
  }

  function confirmDelete() {
    if (!selected || busy) return
    // Focus the stable region first: the confirmation and the row are about to disappear.
    regionRef.current?.focus()
    onDelete(selected.id)
    setSelected(null)
  }

  // Moving pages ends a confirmation, because its row may not be on the new page.
  function turnPage(next: number) {
    setSelected(null)
    changePage(next)
  }

  const rule = DELETE_FOR[scope]

  return (
    <div
      className="saved-library"
      role="region"
      aria-label="Saved activities"
      tabIndex={-1}
      ref={regionRef}
    >
      <p role="status" aria-live="polite" className="saved-library__status">
        {status ?? ''}
      </p>

      {error && (
        <p role="alert" className="saved-library__error">
          {error}
        </p>
      )}

      {unreadable > 0 && (
        <p className="saved-library__unreadable muted">{unreadableNote(unreadable)}</p>
      )}

      {activities.length === 0 ? (
        <p className="muted">No saved activities</p>
      ) : (
        <>
          <div className="saved-library__table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Activity</th>
                  <th scope="col">Sport</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((activity, index) => {
                  const date = formatDay(activity.startMs)
                  const sport = SPORT_LABEL[activity.sport]
                  return (
                    <Fragment key={activity.id}>
                      <tr
                        ref={index === 0 ? firstItemRef : undefined}
                        tabIndex={index === 0 ? -1 : undefined}
                      >
                        <td className="saved-library__nowrap">{date}</td>
                        <td>
                          <span className="saved-library__name">{activity.name}</span>
                        </td>
                        <td className="saved-library__nowrap">
                          <span className="saved-library__sport">
                            <SportIcon sport={activity.sport} />
                            {sport}
                          </span>
                        </td>
                        <td className="saved-library__nowrap">
                          <button
                            type="button"
                            className="btn saved-library__delete"
                            onClick={(event) => {
                              if (!busy) openConfirmation(activity, event.currentTarget)
                            }}
                            aria-disabled={busy}
                            aria-label={`Delete ${activity.name}, ${sport}, ${date}`}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                      {confirmingId === activity.id && (
                        // The confirmation opens under its own row, so the page does not jump.
                        <tr className="saved-library__confirm-row">
                          <td colSpan={4}>
                            <DeleteConfirmation
                              key={activity.id}
                              name={activity.name}
                              description={rule.note}
                              critical={rule.critical}
                              busy={busy}
                              onCancel={closeConfirmation}
                              onConfirm={confirmDelete}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <Pager
              page={page}
              pageCount={pageCount}
              pageSize={PAGE_SIZE}
              total={activities.length}
              noun="saved activities"
              label="Saved activity pages"
              busy={busy}
              onPageChange={turnPage}
            />
          )}
        </>
      )}
    </div>
  )
}
