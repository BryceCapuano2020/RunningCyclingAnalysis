import { useRef, useState } from 'react'
import type { CheckInText } from '@rca/core/lookback'
import type { SeenEvent } from '../../worker/protocol'
import { useSighting } from './useSighting'
import './CheckInRow.css'

export { IMPRESSION_MS } from './useSighting'

export interface CheckInRowProps {
  words: CheckInText
  /** The athlete opened, hid or was shown the row; the worker keeps it. */
  onSeen: (event: SeenEvent) => void
}

/**
 * "Since your last import", one line below the fitness card. The line is what the import added; the disclosure opens
 * what else it told (a new best, a change of fitness, older files). It is a region, not a heading: the page's own
 * title stays first in the outline. It is counted shown after 3 s in view on a visible page, once a page load, and
 * once it has been opened or hidden, or shown on two page loads, it gives up the place. A row that has appeared stays
 * until it is hidden, so opening it does not take it away.
 */
export function CheckInRow({ words, onSeen }: CheckInRowProps) {
  const row = useRef<HTMLElement>(null)
  const [hidden, setHidden] = useState(false)
  const seen = useSighting(row, onSeen, 'checkIn')

  if (hidden) return null
  return (
    <section
      ref={row}
      className="checkin-row"
      aria-label="Since your last import"
      data-testid="checkin-row"
    >
      <details
        className="checkin-row__details"
        onToggle={(event) => {
          if (event.currentTarget.open) seen.current('open')
        }}
      >
        <summary className="checkin-row__summary">
          <span className="checkin-row__line">{words.headline}</span>
          {/* The disclosure's mark is drawn in the stylesheet; the summary is already a button with an open state. */}
          <span className="checkin-row__toggle" aria-hidden="true" />
        </summary>
        <div className="checkin-row__panel">
          <p className="checkin-row__full">{words.headline}</p>
          {words.lines.length === 0 ? null : (
            <ul className="checkin-row__list">
              {words.lines.map((line) => (
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
