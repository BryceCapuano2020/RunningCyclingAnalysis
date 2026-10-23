import { useEffect, useId, useRef, useState } from 'react'
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
}

const PAGE_SIZE = 20
const collectionIds = new WeakMap<SavedLibraryActivity[], number>()
let nextCollectionId = 0

function collectionId(activities: SavedLibraryActivity[]): number {
  let id = collectionIds.get(activities)
  if (id === undefined) {
    id = ++nextCollectionId
    collectionIds.set(activities, id)
  }
  return id
}

/** The viewer's local calendar date as YYYY-MM-DD, so evening activities keep their day. */
function localDate(ms: number): string {
  const date = new Date(ms)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function SavedLibrary({ activities, busy, onDelete }: SavedLibraryProps) {
  const baseId = useId()
  const id = collectionId(activities)
  const [pageState, setPageState] = useState({ id, page: 0 })
  const [selected, setSelected] = useState<SavedLibraryActivity | null>(null)
  const firstRowRef = useRef<HTMLTableRowElement>(null)
  const focusPageRef = useRef<number | null>(null)
  const currentPage = Math.min(
    pageState.id === id ? pageState.page : 0,
    Math.max(0, Math.ceil(activities.length / PAGE_SIZE) - 1),
  )
  const pageCount = Math.max(1, Math.ceil(activities.length / PAGE_SIZE))
  const firstIndex = currentPage * PAGE_SIZE
  const visible = activities.slice(firstIndex, firstIndex + PAGE_SIZE)

  useEffect(() => {
    if (focusPageRef.current !== currentPage) return
    firstRowRef.current?.focus()
    focusPageRef.current = null
  }, [currentPage])

  if (activities.length === 0) {
    return <p className="muted">No saved activities</p>
  }

  function changePage(nextPage: number) {
    focusPageRef.current = nextPage
    setPageState({ id, page: nextPage })
  }

  function confirmDelete() {
    if (!selected || busy) return
    onDelete(selected.id)
    setSelected(null)
  }

  return (
    <div className="saved-library">
      {selected && activities.some((activity) => activity.id === selected.id) && (
        <section
          className="saved-library__confirmation"
          role="group"
          aria-labelledby={`${baseId}-confirm-title`}
          aria-describedby={`${baseId}-confirm-description`}
        >
          <h3 id={`${baseId}-confirm-title`}>Delete “{selected.name}”?</h3>
          <p id={`${baseId}-confirm-description`}>
            This permanently deletes the activity’s original FIT file and saved summary. This cannot
            be undone.
          </p>
          <div className="saved-library__confirmation-actions">
            <button type="button" className="btn" onClick={() => setSelected(null)}>
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
        </section>
      )}

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
            {visible.map((activity, index) => (
              <tr
                key={activity.id}
                ref={index === 0 ? firstRowRef : undefined}
                tabIndex={index === 0 ? -1 : undefined}
              >
                <td>{localDate(activity.startMs)}</td>
                <td>
                  <span className="saved-library__name">{activity.name}</span>
                </td>
                <td>{activity.sport === 'run' ? 'Run' : 'Ride'}</td>
                <td>
                  <button
                    type="button"
                    className="btn saved-library__delete"
                    onClick={() => setSelected(activity)}
                    disabled={busy}
                    aria-label={`Delete ${activity.name}`}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
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
          <p role="status" aria-live="polite">
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
    </div>
  )
}
