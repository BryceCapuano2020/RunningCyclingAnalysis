import { useEffect, useRef } from 'react'
import './RouteOffer.css'

export interface RouteOfferProps {
  status: 'ready' | 'reading' | 'failed' | 'empty'
  /** Reads the kept original file and draws the route. */
  onShow: () => void
}

/** The words under the offer for each state. Empty while the offer waits to be taken up. */
const STATUS_TEXT: Record<RouteOfferProps['status'], string> = {
  ready: '',
  reading: 'Reading the route from your original file.',
  failed: 'The route could not be read. Try again later.',
  empty: 'This file has no route to show.',
}

/**
 * The offer to draw a route from the kept original file. Reading that file costs a download, so it
 * happens only when the visitor clicks. While it reads, the button is busy and ignores clicks.
 */
export function RouteOffer({ status, onShow }: RouteOfferProps) {
  const reading = status === 'reading'
  const statusRef = useRef<HTMLParagraphElement>(null)
  // A read that finds no route keeps the offer mounted, so focus moves to its line instead of falling away.
  useEffect(() => {
    if (status === 'empty') statusRef.current?.focus()
  }, [status])
  return (
    <div className="route-offer">
      {status !== 'empty' && (
        <button
          type="button"
          className="btn"
          aria-disabled={reading}
          onClick={() => {
            if (!reading) onShow()
          }}
        >
          Show route
        </button>
      )}
      <p ref={statusRef} tabIndex={-1} className="route-offer__status secondary" role="status">
        {STATUS_TEXT[status]}
      </p>
    </div>
  )
}
