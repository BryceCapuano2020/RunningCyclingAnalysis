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
 * "Since your last import", one line below the fitness card: what the import added, as a label over its figure. The
 * disclosure opens what else it told, as label and figure rows (a new best, a change of fitness, older files). It is a region, not a heading: the page's own
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
          <span className="checkin-row__line">
            <span className="checkin-row__label">{words.headline.label}</span>
            <span className="checkin-row__value">{words.headline.value}</span>
          </span>
          {/* The disclosure's mark is drawn in the stylesheet; the summary is already a button with an open state. */}
        </summary>
        <div className="checkin-row__panel">
          {words.rows.length === 0 ? null : (
            <dl className="checkin-row__list">
              {words.rows.map((figure) => (
                <div key={`${figure.label}-${figure.value}`} className="checkin-row__item">
                  <dt>{figure.label}</dt>
                  <dd>
                    {figure.value}
                    {figure.detail === undefined ? null : (
                      <span className="checkin-row__detail">{figure.detail}</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <button
            type="button"
            className="btn checkin-row__hide"
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
