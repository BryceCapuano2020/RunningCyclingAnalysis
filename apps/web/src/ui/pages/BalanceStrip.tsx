import { Fragment } from 'react'
import type { Sport } from '@rca/core/types'
import { gradeParts, type GradeOutcome } from '../grades'
import { SPORT_LABEL, SPORT_ORDER } from '../sports'
import './BalanceStrip.css'

/** "est." stands for the card's "Estimated", which would not fit beside a range on a 320 px phone. */
const ESTIMATE_ABBREVIATION = 'est.'

export interface BalanceStripProps {
  /** Each sport's grade as the cards show it; null where the card shows none. */
  grades: Record<Sport, GradeOutcome | null>
}

/**
 * On a phone the two cards stack, so the first screen would show one sport. This strip puts both
 * grades under the meter, an estimated one with "est." and its range. The cards say the same, so the strip is hidden from assistive technology,
 * and it is hidden on wider screens, where the cards already sit side by side.
 */
export function BalanceStrip({ grades }: BalanceStripProps) {
  const graded = SPORT_ORDER.flatMap((sport) => {
    const outcome = grades[sport]
    if (outcome?.kind !== 'graded') return []
    const { lead, level, value, range } = gradeParts(sport, outcome.grade)
    // An estimate says so, and gives its range, as the card does, in a short form that fits 320 px.
    const grade = `${SPORT_LABEL[sport]} ${lead === null ? '' : `${ESTIMATE_ABBREVIATION} `}${value}${range === null ? '' : ` (${range})`}`
    return [{ sport, grade, level }]
  })
  if (graded.length === 0) return null
  return (
    <p className="balance-strip" aria-hidden="true">
      {graded.map((part, index) => (
        <Fragment key={part.sport}>
          {index > 0 && ' / '}
          <span className="balance-strip__sport">{part.grade}</span> {part.level}
        </Fragment>
      ))}
    </p>
  )
}
