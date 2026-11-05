import type { Sport } from '@rca/core/types'
import { THRESHOLD_HEADING } from '../sports'

/** What the disclosure that opens a threshold's detail says. */
export const DETAIL_TERM = 'How this was worked out'

/**
 * The lines under a threshold's figure: what it rests on (how many runs or rides, and the strongest effort) as the meta
 * line, then the disclosure that opens how it was worked out: its range, the method and, for a ride, what heart rate
 * did. Nothing is drawn where there is neither. Balance has two of them, so each is named for its threshold to a screen
 * reader: "How this was worked out for threshold power".
 */
export function ThresholdBasis({
  sport,
  basis,
  detail,
  className,
}: {
  sport: Sport
  basis: string | null
  detail: string | null
  className: string
}) {
  if (basis === null && detail === null) return null
  return (
    <div className={className}>
      {basis === null ? null : <p className="meta">{basis}</p>}
      {detail === null ? null : (
        <details className="disclosure">
          <summary>
            {DETAIL_TERM}
            <span className="sr-only">{` for ${THRESHOLD_HEADING[sport].toLowerCase()}`}</span>
          </summary>
          <p className="disclosure__body">{detail}</p>
        </details>
      )}
    </div>
  )
}
