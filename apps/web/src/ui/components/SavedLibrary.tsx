import { useCallback, useEffect, useId, useRef, useState } from 'react'
import './SavedLibrary.css'

export interface SavedLibraryActivity {
  id: string
  name: string
  startMs: number
  sport: 'run' | 'ride'
}

export interface SavedLibraryProps {
  activities: SavedLibraryActivity[]
  busy: boolean
  onDelete: (id: string) => void
  /** A polite outcome message, such as "Deleted Morning Run (2026-10-01)." */
  status: string | null
  /** A library action failure message. */
  error: string | null
  /** Stored activities the server could not read, so they are not listed. */
  unreadable?: number
}

const PAGE_SIZE = 20

/** The viewer's local calendar date as YYYY-MM-DD, so evening activities keep their day. */
function localDate(ms: number): string {
  const date = new Date(ms)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function SavedLibrary({
  activities,
  busy,
  onDelete,
  status,
  error,
  unreadable = 0,
}: SavedLibraryProps) {
  const baseId = useId()
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<SavedLibraryActivity | null>(null)
  const regionRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const confirmHeadingRef = useRef<HTMLHeadingElement>(null)
  const firstRowRef = useRef<HTMLTableRowElement>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const lastConfirmingIdRef = useRef<string | null>(null)
  const focusPageRef = useRef<number | null>(null)
  const pageCount = Math.max(1, Math.ceil(activities.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const firstIndex = currentPage * PAGE_SIZE
  const visible = activities.slice(firstIndex, firstIndex + PAGE_SIZE)
  const confirming =
    selected !== null && activities.some((activity) => activity.id === selected.id)
      ? selected
      : null
  const confirmingId = confirming?.id ?? null

  useEffect(() => {
    if (focusPageRef.current !== currentPage) return
    firstRowRef.current?.focus()
    focusPageRef.current = null
  }, [currentPage])

  // Store the clamped page, so a list that shrinks and grows again does not jump to the old page.
  if (page !== currentPage) setPage(currentPage)
  // The confirmed activity was removed elsewhere while confirming: drop the confirmation.
  if (selected !== null && confirming === null) setSelected(null)

  useEffect(() => {
    const previousId = lastConfirmingIdRef.current
    lastConfirmingIdRef.current = confirmingId
    if (confirmingId !== null) {
      confirmHeadingRef.current?.focus()
    } else if (previousId !== null && document.activeElement === document.body) {
      // The open confirmation was removed while it held focus: keep focus in the library.
      regionRef.current?.focus()
    }
  }, [confirmingId])

  const closeConfirmation = useCallback(() => {
    const trigger = triggerRef.current
    const target = trigger?.isConnected && !trigger.disabled ? trigger : regionRef.current
    setSelected(null)
    target?.focus()
  }, [])

  useEffect(() => {
    if (confirmingId === null) return
    // The dialog is modal in behaviour: Escape closes it from anywhere, and Tab cycles inside it.
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeConfirmation()
        return
      }
      const dialog = dialogRef.current
      if (event.key !== 'Tab' || !dialog) return
      const cycle = Array.from(dialog.querySelectorAll<HTMLElement>('h3, button:not(:disabled)'))
      const first = cycle[0]
      const last = cycle[cycle.length - 1]
      if (first === undefined || last === undefined) return
      const active = document.activeElement
      const outside = !dialog.contains(active)
      if (event.shiftKey && (outside || active === first)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (outside || active === last)) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [confirmingId, closeConfirmation])

  function changePage(nextPage: number) {
    focusPageRef.current = nextPage
    setPage(nextPage)
  }

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

      {confirming && (
        <div
          className="saved-library__confirmation"
          role="alertdialog"
          aria-labelledby={`${baseId}-confirm-title`}
          aria-describedby={`${baseId}-confirm-description`}
          ref={dialogRef}
        >
          <h3 id={`${baseId}-confirm-title`} tabIndex={-1} ref={confirmHeadingRef}>
            Delete “{confirming.name}”?
          </h3>
          <p id={`${baseId}-confirm-description`}>
            This permanently deletes the activity’s original file and saved summary. This cannot be
            undone.
          </p>
          <div className="saved-library__confirmation-actions">
            <button type="button" className="btn" onClick={closeConfirmation}>
              Cancel
            </button>
            <button
              type="button"
              className="btn saved-library__delete-confirm"
              onClick={confirmDelete}
              disabled={busy}
            >
              Delete permanently
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="saved-library__error">
          {error}
        </p>
      )}

      {unreadable > 0 && (
        <p className="saved-library__unreadable muted">
          {unreadable === 1
            ? '1 saved activity could not be read and is hidden. Re-adding its file will restore it.'
            : `${unreadable} saved activities could not be read and are hidden. Re-adding their files will restore them.`}
        </p>
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
                  const date = localDate(activity.startMs)
                  return (
                    <tr
                      key={activity.id}
                      ref={index === 0 ? firstRowRef : undefined}
                      tabIndex={index === 0 ? -1 : undefined}
                    >
                      <td>{date}</td>
                      <td>
                        <span className="saved-library__name">{activity.name}</span>
                      </td>
                      <td>{activity.sport === 'run' ? 'Run' : 'Ride'}</td>
                      <td>
                        <button
                          type="button"
                          className="btn saved-library__delete"
                          onClick={(event) => openConfirmation(activity, event.currentTarget)}
                          disabled={busy}
                          aria-label={`Delete ${activity.name}, ${activity.sport}, ${date}`}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <nav className="saved-library__pagination" aria-label="Saved activity pages">
              <button
                type="button"
                className="btn"
                onClick={() => changePage(currentPage - 1)}
                disabled={busy || currentPage === 0}
              >
                Previous page
              </button>
              <p>
                {`Showing ${firstIndex + 1}–${Math.min(firstIndex + PAGE_SIZE, activities.length)} of ${activities.length} saved activities. Page ${currentPage + 1} of ${pageCount}.`}
              </p>
              <button
                type="button"
                className="btn"
                onClick={() => changePage(currentPage + 1)}
                disabled={busy || currentPage >= pageCount - 1}
              >
                Next page
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  )
}
