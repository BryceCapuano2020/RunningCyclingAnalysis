import type { Sport } from '@rca/core/types'
import { THRESHOLD_HEADING } from '../sports'

/** What the disclosure that opens a threshold's detail says. */
export const DETAIL_TERM = 'How this was worked out'

/**
 * The one disclosure under a threshold's figure, "How this was worked out": what the figure rests on (how many runs or
 * rides, and the strongest effort) as its first line, then its range, the method and, for a ride, what heart rate did.
 * No line sits under the figure itself (docs/design/system.md, No subtitle lines). Nothing is drawn where there is
 * neither. Balance has two of them, so each is named for its threshold to a screen reader: "How this was worked out for
 * threshold power".
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
      <details className="disclosure">
        <summary>
          {DETAIL_TERM}
          <span className="sr-only">{` for ${THRESHOLD_HEADING[sport].toLowerCase()}`}</span>
        </summary>
        <div className="disclosure__body disclosure__lines" role="note">
          {basis === null ? null : <p className="meta">{basis}</p>}
          {detail === null ? null : <p>{detail}</p>}
        </div>
      </details>
    </div>
  )
}
