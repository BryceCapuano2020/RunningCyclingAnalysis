import { useRef, useState } from 'react'
import type { SeenEvent } from '../../worker/protocol'
import type { YearsWords } from '../yearsRow'
import { focusPageHeading } from './pageHeading'
import { useSighting } from './useSighting'
import './CheckInRow.css'

/**
 * The lead the row was hidden for in this page load. A session that stores nothing cannot keep the flag, so the row, which
 * comes and goes with the page it is on, must not come back after Hide on the next visit to Balance.
 */
let hiddenThisLoad: string | null = null

export interface YearsRowProps {
  words: YearsWords
  /** The athlete opened, hid or was shown the row; the worker keeps it. */
  onSeen: (event: SeenEvent) => void
}

/**
 * "History": the look-back's lead in one line under the fitness card, and behind the disclosure the other episodes.
 * It is a region, not a heading, and it is built like the check-in row (the family of one-line rows under the card):
 * the line is cut after two lines and the panel gives it whole. Opening or hiding it, or being shown it on two page
 * loads, is seeing its lead, and a seen lead gives up the place until the look-back has a new one; its content stays on
 * the Run and Ride pages.
 */
export function YearsRow({ words, onSeen }: YearsRowProps) {
  const row = useRef<HTMLElement>(null)
  const [hidden, setHidden] = useState(hiddenThisLoad)
  const seen = useSighting(row, onSeen, 'lookBack')

  if (hidden === words.key || hiddenThisLoad === words.key) return null
  return (
    <section
      ref={row}
      className="checkin-row years-row"
      aria-label="History"
      data-testid="years-row"
    >
      <details
        className="checkin-row__details"
        onToggle={(event) => {
          if (event.currentTarget.open) seen.current('open')
        }}
      >
        <summary className="checkin-row__summary">
          <span className="sr-only">Show history. </span>
          <span className="checkin-row__line">{words.lead}</span>
          <span className="checkin-row__toggle" aria-hidden="true" />
        </summary>
        <div className="checkin-row__panel">
          <p className="checkin-row__full">{words.lead}</p>
          {words.rows.length === 0 ? null : (
            <ul className="checkin-row__list">
              {words.rows.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="checkin-row__hide"
            onClick={() => {
              hiddenThisLoad = words.key
              setHidden(words.key)
              seen.current('hide')
              // The button that had focus goes with the row: focus goes to the page's heading.
              focusPageHeading()
            }}
          >
            Hide
          </button>
        </div>
      </details>
    </section>
  )
}
