import { useEffect, useId, useRef, useState } from 'react'
import type { CheckInText } from '@rca/core/lookback'
import type { SeenEvent } from '../../worker/protocol'
import './CheckInRow.css'

/** A row counts as shown when it has been in view, on a visible page, this long. */
export const IMPRESSION_MS = 3_000

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
  const id = useId()
  const row = useRef<HTMLElement>(null)
  const [hidden, setHidden] = useState(false)
  const seen = useRef(onSeen)
  // The latest callback, read when a timer fires or a control is used.
  useEffect(() => {
    seen.current = onSeen
  })

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let counted = false
    let inView = typeof IntersectionObserver === 'undefined'
    const visible = () => document.visibilityState !== 'hidden'
    const arm = () => {
      if (counted || timer !== null || !inView || !visible()) return
      timer = setTimeout(() => {
        timer = null
        counted = true
        seen.current('impression')
      }, IMPRESSION_MS)
    }
    const disarm = () => {
      if (timer !== null) clearTimeout(timer)
      timer = null
    }
    const watch = () => (visible() ? arm() : disarm())
    document.addEventListener('visibilitychange', watch)
    let observer: IntersectionObserver | null = null
    if (typeof IntersectionObserver !== 'undefined' && row.current !== null) {
      observer = new IntersectionObserver((entries) => {
        inView = entries.some((entry) => entry.isIntersecting)
        if (inView) arm()
        else disarm()
      })
      observer.observe(row.current)
    } else arm()
    return () => {
      disarm()
      observer?.disconnect()
      document.removeEventListener('visibilitychange', watch)
    }
  }, [])

  if (hidden) return null
  return (
    <section
      ref={row}
      className="checkin-row"
      aria-labelledby={`${id}-line`}
      data-testid="checkin-row"
    >
      <details
        className="checkin-row__details"
        onToggle={(event) => {
          if (event.currentTarget.open) seen.current('open')
        }}
      >
        <summary className="checkin-row__summary">
          <span id={`${id}-line`} className="checkin-row__line">
            {words.headline}
          </span>
          <span className="checkin-row__toggle">Show what changed</span>
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
