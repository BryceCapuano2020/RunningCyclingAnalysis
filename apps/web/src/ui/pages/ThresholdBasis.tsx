import type { Sport } from '@rca/core/types'
import { Definition } from '../components/Definition'
import { THRESHOLD_HEADING } from '../sports'

/** What the term that opens a threshold's detail says. */
export const DETAIL_TERM = 'How this was worked out'

/**
 * The line under a threshold's figure: what it rests on (a ride's rides and strongest effort), then the one tap that opens
 * how it was worked out, its range and what heart rate did. Nothing is drawn where there is neither. Balance has two of the
 * terms, so each is named for its threshold to a screen reader: "How this was worked out for threshold power".
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
    <p className={className}>
      {basis}
      {basis !== null && detail !== null ? ' ' : null}
      {detail === null ? null : (
        <Definition meaning={detail}>
          {`${DETAIL_TERM} `}
          <span className="sr-only">{`for ${THRESHOLD_HEADING[sport].toLowerCase()}`}</span>
        </Definition>
      )}
    </p>
  )
}
