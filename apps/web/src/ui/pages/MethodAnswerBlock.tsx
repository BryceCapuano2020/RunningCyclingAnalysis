import type { Period } from '@rca/core/period'
import type { BalanceReading } from '../components/balanceScale'
import { NumText } from '../components/NumText'
import { PropertyList } from '../components/PropertyList'
import type { Property } from '../components/property'
import { periodDates } from '../components/rangeOptions'
import { SECTION_ID } from '../components/methodTopics'
import { SECTION_NAME, focusSection } from './methodContents'
import { answerRows, answerVerdict, estimatesOf } from './methodAnswer'

/**
 * The short answer under the Method heading: one line, the balance verdict (or what is estimated while there is none),
 * and behind Details the rows that back it, label over value: the range against level, what is estimated and how
 * many runs and rides it rests on, what is recorded, where the checks are, and the period counted.
 */
export function MethodAnswer({
  balance,
  hasResult,
  waitsForWeight,
  runs,
  rides,
  weightKnown,
  period,
}: {
  balance: BalanceReading | null
  hasResult: boolean
  waitsForWeight: boolean
  runs: number
  rides: number
  weightKnown: boolean
  period: Period | null
}) {
  const verdict = answerVerdict(balance, waitsForWeight)
  const line =
    verdict !== null
      ? verdict
      : hasResult
        ? estimatesOf(runs, rides, weightKnown)
        : 'Thresholds, ride levels and the balance are estimates.'
  const rows: Property[] = [
    ...(hasResult ? answerRows(balance, runs, rides, weightKnown) : []),
    {
      label: 'Recorded',
      value: 'Running efforts, ride power from a meter',
      action: {
        name: `Recorded: see ${SECTION_NAME.grades}`,
        onActivate: () => focusSection(SECTION_ID.grades),
      },
    },
    {
      label: 'Checks below',
      value: 'How far to trust them',
      action: {
        name: `Checks below: see ${SECTION_NAME.heart}`,
        onActivate: () => focusSection(SECTION_ID.heart),
      },
    },
    ...(period ? [{ label: 'Counted over', value: periodDates(period) }] : []),
  ]
  return (
    <div className="panel method__answer" role="group" aria-label="The short answer">
      <div className="eyebrow method__answer-title" aria-hidden="true">
        Your result
      </div>
      <p className="method__answer-text">
        <NumText text={line} />
      </p>
      <details className="method__details">
        <summary>Details</summary>
        <PropertyList rows={rows} />
      </details>
    </div>
  )
}
