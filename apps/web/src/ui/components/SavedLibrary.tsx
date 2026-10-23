import { useCallback, useEffect, useRef, useState } from 'react'
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

  // The confirmed activity was removed elsewhere while confirming: drop the confirmation.
  if (selected !== null && confirming === null) setSelected(null)

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
        <DeleteConfirmation
          key={confirming.id}
          name={confirming.name}
          busy={busy}
          onCancel={closeConfirmation}
          onConfirm={confirmDelete}
        />
      )}

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
                    <tr
                      key={activity.id}
                      ref={index === 0 ? firstItemRef : undefined}
                      tabIndex={index === 0 ? -1 : undefined}
                    >
                      <td>{date}</td>
                      <td>
                        <span className="saved-library__name">{activity.name}</span>
                      </td>
                      <td>
                        <span className="saved-library__sport">
                          <SportIcon sport={activity.sport} />
                          {sport}
                        </span>
                      </td>
                      <td>
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
              onPageChange={changePage}
            />
          )}
        </>
      )}
    </div>
  )
}
