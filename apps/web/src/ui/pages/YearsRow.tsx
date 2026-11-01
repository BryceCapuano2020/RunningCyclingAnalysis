import { useRef, useState } from 'react'
import type { SeenEvent } from '../../worker/protocol'
import type { YearsWords } from '../yearsRow'
import { focusPageHeading } from './pageHeading'
import { useSighting } from './useSighting'
import './CheckInRow.css'

/**
 * Whether the row was hidden in this page load. A session that stores nothing cannot keep the flag, so the row, which
 * comes and goes with the page it is on, must not come back after Hide on the next visit to Balance.
 */
let hiddenThisLoad = false

export interface YearsRowProps {
  words: YearsWords
  /** The athlete opened, hid or was shown the row; the worker keeps it. */
  onSeen: (event: SeenEvent) => void
}

/**
 * "Your years": the look-back's lead in one line under the fitness card, and behind the disclosure the other episodes.
 * It is a region, not a heading, and it is built like the check-in row (the family of one-line rows under the card):
 * the line is cut after two lines and the panel gives it whole. It stays under the card while the look-back has a lead
 * to tell; hiding it gives up the place for good, and its content stays on the Run and Ride pages.
 */
export function YearsRow({ words, onSeen }: YearsRowProps) {
  const row = useRef<HTMLElement>(null)
  const [hidden, setHidden] = useState(hiddenThisLoad)
  const seen = useSighting(row, onSeen, 'lookBack')

  if (hidden || hiddenThisLoad) return null
  return (
    <section
      ref={row}
      className="checkin-row years-row"
      aria-label="Your years"
      data-testid="years-row"
    >
      <details
        className="checkin-row__details"
        onToggle={(event) => {
          if (event.currentTarget.open) seen.current('open')
        }}
      >
        <summary className="checkin-row__summary">
          <span className="sr-only">Show your years. </span>
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
              hiddenThisLoad = true
              setHidden(true)
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
