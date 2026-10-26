import type { Sport } from '@rca/core/types'
import type { GradeOutcome } from '../grades'
import { formatGrade } from '../gradeFormat'
import { SPORT_LABEL, SPORT_ORDER } from '../sports'
import './BalanceStrip.css'

export interface BalanceStripProps {
  /** Each sport's grade as the cards show it; null where the card shows none. */
  grades: Record<Sport, GradeOutcome | null>
}

/**
 * On a phone the two cards stack, so the first screen would show one sport. This strip puts both
 * grades under the meter. The cards say the same, so the strip is hidden from assistive technology,
 * and it is hidden on wider screens, where the cards already sit side by side.
 */
export function BalanceStrip({ grades }: BalanceStripProps) {
  const graded = SPORT_ORDER.flatMap((sport) => {
    const outcome = grades[sport]
    return outcome?.kind === 'graded'
      ? [
          `${SPORT_LABEL[sport]} ${formatGrade(outcome.grade.centre.grade)} ${outcome.grade.centre.level}`,
        ]
      : []
  })
  if (graded.length === 0) return null
  return (
    <p className="balance-strip" aria-hidden="true">
      {graded.join(' / ')}
    </p>
  )
}
