import type { Sport } from '@rca/core/types'
import { THRESHOLD_HEADING } from '../sports'
import { PropertyList } from '../components/PropertyList'
import type { Property } from '../components/property'
import { SECTION_ID } from '../components/methodTopics'

/** What the disclosure that opens a threshold's detail says. */
export const DETAIL_TERM = 'Details'

/**
 * The one disclosure under a threshold's figure, "Details": a detail panel of what the figure rests on,
 * its range and, for a ride, what heart rate did, with a link to the method on Method. Nothing is drawn without rows.
 * Balance has two of them, so each is named for its threshold to a screen reader.
 */
export function ThresholdBasis({
  sport,
  rows,
  className,
}: {
  sport: Sport
  rows: readonly Property[]
  className: string
}) {
  if (rows.length === 0) return null
  return (
    <div className={className}>
      <details className="disclosure">
        <summary>
          {DETAIL_TERM}
          <span className="sr-only">{` for ${THRESHOLD_HEADING[sport].toLowerCase()}`}</span>
        </summary>
        <div className="disclosure__body">
          <PropertyList
            rows={rows}
            method={SECTION_ID.how}
            methodName={`how ${THRESHOLD_HEADING[sport].toLowerCase()} was worked out`}
          />
        </div>
      </details>
    </div>
  )
}
