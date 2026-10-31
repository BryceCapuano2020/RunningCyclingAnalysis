import { useRef, useState } from 'react'
import type { SeenEvent } from '../../worker/protocol'
import type { YearsWords } from '../yearsRow'
import { useSighting } from './useSighting'
import './CheckInRow.css'

export interface YearsRowProps {
  words: YearsWords
  /** The athlete opened, hid or was shown the row; the worker keeps it. */
  onSeen: (event: SeenEvent) => void
}

/**
 * "Your years": the look-back's lead in one line under the fitness card, and behind the disclosure the other episodes.
 * It is a region, not a heading, and it is built like the check-in row (the family of one-line rows under the card):
 * the line is cut after two lines and the panel gives it whole. Opening or hiding it, or being shown it on two page
 * loads, is seen, and a seen row gives up the place; its content stays on the Run and Ride pages.
 */
export function YearsRow({ words, onSeen }: YearsRowProps) {
  const row = useRef<HTMLElement>(null)
  const [hidden, setHidden] = useState(false)
  const seen = useSighting(row, onSeen, 'lookBack')

  if (hidden) return null
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
              setHidden(true)
              seen.current('hide')
            }}
          >
            Hide
          </button>
        </div>
      </details>
    </section>
  )
}
