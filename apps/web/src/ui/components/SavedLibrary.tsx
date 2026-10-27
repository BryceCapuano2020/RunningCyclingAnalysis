import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import './SavedLibrary.css'
import { formatDay } from '../format/date'
import { COMPACT_PHONE_MAX_WIDTH_PX, NARROW_PHONE_MAX_WIDTH_PX } from '../layoutBreakpoints'
import { SPORT_LABEL } from '../sports'
import { useNarrowScreen } from '../useNarrowScreen'
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
  /** Stored activities that could not be read, so they are not listed. */
  unreadable?: number
  scope?: SavedScope
  /** A removal dialog is open beside the list, so no row confirmation stays open with it. */
  removalOpen?: boolean
}

interface DeleteRule {
  note: string
  critical: boolean
}

/**
 * What a delete removes, and how its confirmation reads. Only the account keeps original files, so
 * only its confirmation is the red card; a summary kept in this browser gets the neutral one.
 */
const DELETE_FOR: Record<SavedScope, DeleteRule> = {
  account: {
    note: 'This deletes the activity’s original file, if one is stored, and its saved summary from your account.',
    critical: true,
  },
  device: {
    note: 'This removes the activity’s summary from this browser.',
    critical: false,
  },
}

/** The note on stored activities that could not be read, singular or plural. */
function unreadableNote(count: number): string {
  const one = count === 1
  return `${plural(count, 'saved activity', 'saved activities')} could not be read and ${one ? 'is' : 'are'} hidden. Re-adding ${one ? 'its file' : 'their files'} will restore ${one ? 'it' : 'them'}.`
}

/** What every row of the list shares: its confirmation, its delete, and the focus it takes on a page change. */
interface RowContext {
  busy: boolean
  /** At 560 px and below the sport sits under the name, and the table has no sport column. */
  compact: boolean
  rule: DeleteRule
  confirmingId: string | null
  firstRef: (node: HTMLElement | null) => void
  onOpen: (activity: SavedLibraryActivity, trigger: HTMLButtonElement) => void
  onCancel: () => void
  onConfirm: () => void
}

function SportLabel({ activity }: { activity: SavedLibraryActivity }) {
  return (
    <span className="saved-library__sport">
      <SportIcon sport={activity.sport} />
      {SPORT_LABEL[activity.sport]}
    </span>
  )
}

function DeleteButton({ activity, ctx }: { activity: SavedLibraryActivity; ctx: RowContext }) {
  const date = formatDay(activity.startMs)
  const sport = SPORT_LABEL[activity.sport]
  return (
    <button
      type="button"
      className="btn saved-library__delete"
      onClick={(event) => {
        if (!ctx.busy) ctx.onOpen(activity, event.currentTarget)
      }}
      aria-disabled={ctx.busy}
      aria-label={`Delete ${activity.name}, ${sport}, ${date}`}
    >
      Delete
    </button>
  )
}

function RowConfirmation({ activity, ctx }: { activity: SavedLibraryActivity; ctx: RowContext }) {
  return (
    <DeleteConfirmation
      name={activity.name}
      description={ctx.rule.note}
      critical={ctx.rule.critical}
      busy={ctx.busy}
      onCancel={ctx.onCancel}
      onConfirm={ctx.onConfirm}
    />
  )
}

function TableRow({
  activity,
  first,
  ctx,
}: {
  activity: SavedLibraryActivity
  first: boolean
  ctx: RowContext
}) {
  const date = formatDay(activity.startMs)
  return (
    <Fragment>
      <tr ref={first ? ctx.firstRef : undefined} tabIndex={first ? -1 : undefined}>
        <td className="saved-library__nowrap">{date}</td>
        <td>
          <span className="saved-library__name">{activity.name}</span>
          {ctx.compact && <SportLabel activity={activity} />}
        </td>
        {!ctx.compact && (
          <td className="saved-library__nowrap">
            <SportLabel activity={activity} />
          </td>
        )}
        <td className="saved-library__nowrap">
          <DeleteButton activity={activity} ctx={ctx} />
        </td>
      </tr>
      {ctx.confirmingId === activity.id && (
        // The confirmation opens under its own row, so the page does not jump.
        <tr className="saved-library__confirm-row">
          <td colSpan={ctx.compact ? 3 : 4}>
            <RowConfirmation activity={activity} ctx={ctx} />
          </td>
        </tr>
      )}
    </Fragment>
  )
}

/** At 420 px and below a saved activity is a block: its name, its date and sport, then a full-width Delete. */
function ListItem({
  activity,
  first,
  ctx,
}: {
  activity: SavedLibraryActivity
  first: boolean
  ctx: RowContext
}) {
  const date = formatDay(activity.startMs)
  const sport = SPORT_LABEL[activity.sport]
  return (
    <li
      className="saved-library__item"
      ref={first ? ctx.firstRef : undefined}
      tabIndex={first ? -1 : undefined}
    >
      <span className="saved-library__name">{activity.name}</span>
      <span className="saved-library__meta muted">{`${date} · ${sport}`}</span>
      <DeleteButton activity={activity} ctx={ctx} />
      {ctx.confirmingId === activity.id && <RowConfirmation activity={activity} ctx={ctx} />}
    </li>
  )
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
    HTMLElement
  >(activities, PAGE_SIZE)
  const compact = useNarrowScreen(COMPACT_PHONE_MAX_WIDTH_PX)
  const narrow = useNarrowScreen(NARROW_PHONE_MAX_WIDTH_PX)
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
  function turnPage(next: number, control: HTMLElement) {
    setSelected(null)
    changePage(next, control)
  }

  // The first item takes focus on a page change, whichever representation shows it.
  function attachFirst(node: HTMLElement | null) {
    firstItemRef.current = node
  }

  // A resize across a breakpoint replaces the rows. Focus inside the library is given back to the
  // library then, rather than to the page's body, where the keyboard would be lost.
  const layout = narrow ? 'list' : compact ? 'compact' : 'table'
  const shownLayout = useRef(layout)
  const focusInside = useRef(false)
  useEffect(() => {
    const region = regionRef.current
    if (region === null) return undefined
    const onFocusIn = () => {
      focusInside.current = true
    }
    const onFocusOut = (event: FocusEvent) => {
      focusInside.current =
        event.relatedTarget instanceof Node && region.contains(event.relatedTarget)
    }
    region.addEventListener('focusin', onFocusIn)
    region.addEventListener('focusout', onFocusOut)
    return () => {
      region.removeEventListener('focusin', onFocusIn)
      region.removeEventListener('focusout', onFocusOut)
    }
  }, [])
  useEffect(() => {
    if (shownLayout.current === layout) return
    shownLayout.current = layout
    if (focusInside.current && document.activeElement === document.body) {
      regionRef.current?.focus()
    }
  }, [layout])

  const ctx: RowContext = {
    busy,
    compact,
    rule: DELETE_FOR[scope],
    confirmingId,
    firstRef: attachFirst,
    onOpen: openConfirmation,
    onCancel: closeConfirmation,
    onConfirm: confirmDelete,
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
          {narrow ? (
            <ol className="saved-library__list">
              {visible.map((activity, index) => (
                <ListItem key={activity.id} activity={activity} first={index === 0} ctx={ctx} />
              ))}
            </ol>
          ) : (
            <div className="saved-library__table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Activity</th>
                    {!compact && <th scope="col">Sport</th>}
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((activity, index) => (
                    <TableRow key={activity.id} activity={activity} first={index === 0} ctx={ctx} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

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
