import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { UnitSystem } from '@rca/core/units'
import { formatDay } from '../format/date'
import { PropertyList } from '../components/PropertyList'
import { RowIndex } from '../components/RowList'
import { plural } from '../components/plural'
import { PAGE_HEADING_ID } from '../pages/pageHeading'
import { dayNoonMs, shiftDay } from './liftDay'
import type { EarlierDay, LiftOfDay, LiftStatus } from './liftPageTypes'
import { liftId } from './liftPageTypes'
import { LiftSection } from './LiftSection'
import { useFocusAfterDelete } from './useLiftFocus'
import '../components/RowList.css'
import './LiftPage.css'

export interface LiftPageProps {
  /** The day shown, YYYY-MM-DD in the viewer's zone. */
  day: string
  /** Today, the same way, from the app's clock: it names the day heading and takes away "Later day". */
  today: string
  /** The lifts of the day, in the order the caller sorts them. */
  lifts: readonly LiftOfDay[]
  /** The most recent days with sets before the day shown, newest first, 12 at a time. */
  earlier: readonly EarlierDay[]
  /** Adds 12 more earlier sessions; absent when there are no more. */
  onMore?: () => void
  /** Sets not yet kept, signed in; null when signed out, where sets live in this browser only. */
  status: LiftStatus | null
  units: UnitSystem
  onDay: (day: string) => void
  /** "Log a set": the caller opens its form in `form`. */
  onLog: () => void
  /** A set's "Edit set N" was activated, with the set's key. */
  onEditSet: (key: string) => void
  /** The key of the set being edited, whose row `rowForm` replaces. */
  editingKey: string | null
  rowForm?: ReactNode
  /** The new-set form, under the button. While it or `rowForm` is open the button is not drawn. */
  form?: ReactNode
}

/** The heading of a day: "Today", "Yesterday", or its date. */
function dayHeading(day: string, today: string): string {
  if (day === today) return 'Today'
  if (day === shiftDay(today, -1)) return 'Yesterday'
  return dateText(day, today)
}

/** A day's date with its weekday, and the year when it is not today's. */
function dateText(day: string, today: string): string {
  const ms = dayNoonMs(day)
  return ms === null ? day : formatDay(ms, dayNoonMs(today) ?? ms)
}

/** The rows that tell what is not kept yet, each only when it applies. */
function statusRows(status: LiftStatus) {
  return [
    ...(status.notSent > 0
      ? [{ label: 'Not sent yet', value: plural(status.notSent, 'set') }]
      : []),
    ...(status.refused > 0 ? [{ label: 'Refused', value: plural(status.refused, 'set') }] : []),
    ...(status.full ? [{ label: 'Account full', value: 'Sets wait' }] : []),
  ]
}

/**
 * The Lift page: one day of lifting (docs/design/lift-logger.md, The page). The day with its buttons, the one primary
 * button and the form under it, each lift of the day with its sets, the status rows, and earlier sessions to open. It
 * knows nothing of the store: its caller gives it the day and takes its calls.
 */
export function LiftPage({
  day,
  today,
  lifts,
  earlier,
  onMore,
  status,
  units,
  onDay,
  onLog,
  onEditSet,
  editingKey,
  rowForm = null,
  form = null,
}: LiftPageProps) {
  const root = useRef<HTMLDivElement>(null)
  const dayHeadingRef = useRef<HTMLHeadingElement>(null)
  const laterClicked = useRef(false)
  useFocusAfterDelete(root, lifts, editingKey)
  // "Later day" leaves with today; the focus it held goes to the day's heading, not to the page.
  useEffect(() => {
    if (laterClicked.current && day === today) dayHeadingRef.current?.focus()
    laterClicked.current = false
  }, [day, today])
  const formOpen = form !== null || editingKey !== null
  const notKept = status === null ? [] : statusRows(status)
  return (
    <div ref={root} className="page-stack lift">
      <div className="page-title">
        <h1 id={PAGE_HEADING_ID} tabIndex={-1}>
          Lifting
        </h1>
      </div>
      <section className="section">
        <div className="lift__day">
          <h2 className="lift__day-name" ref={dayHeadingRef} tabIndex={-1}>
            {dayHeading(day, today)}
          </h2>
          <div className="lift__day-nav">
            <button type="button" className="btn" onClick={() => onDay(shiftDay(day, -1))}>
              Earlier day
            </button>
            {day < today && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  laterClicked.current = true
                  onDay(shiftDay(day, 1))
                }}
              >
                Later day
              </button>
            )}
          </div>
        </div>
        <div className="lift__log">
          {!formOpen && (
            <button type="button" className="btn btn-primary" onClick={onLog}>
              Log a set
            </button>
          )}
          {form}
        </div>
        {lifts.length === 0 ? (
          <p className="lift__empty">No sets</p>
        ) : (
          lifts.map((lift) => (
            <LiftSection
              key={liftId(lift)}
              lift={lift}
              units={units}
              editingKey={editingKey}
              rowForm={rowForm}
              onEditSet={onEditSet}
            />
          ))
        )}
        <PropertyList rows={notKept} />
      </section>
      {earlier.length > 0 && (
        <section className="section" aria-labelledby="lift-earlier">
          <div className="section__head">
            <h2 id="lift-earlier">Earlier sessions</h2>
          </div>
          <ol className="rows">
            {earlier.map((session, index) => (
              <li key={session.day} className="row">
                <RowIndex index={index} />
                <div className="row__body">
                  <h3 className="row__title">
                    <button type="button" className="lift__open" onClick={() => onDay(session.day)}>
                      {dateText(session.day, today)}
                    </button>
                  </h3>
                  <p className="meta">{session.lifts.join(', ')}</p>
                </div>
              </li>
            ))}
          </ol>
          {onMore && (
            <button type="button" className="btn lift__more" onClick={onMore}>
              Show more
            </button>
          )}
        </section>
      )}
    </div>
  )
}
