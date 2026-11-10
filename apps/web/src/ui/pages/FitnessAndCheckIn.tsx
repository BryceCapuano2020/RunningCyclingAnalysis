import { useMemo, useState } from 'react'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import type { AnalysisController } from '../analysis/controller'
import { checkInWords, firstRowOf } from '../checkInRow'
import { hasFitnessView } from '../fitnessModel'
import { CheckInRow } from './CheckInRow'
import { FitnessSection } from './FitnessSection'

export interface FitnessAndCheckInProps {
  analysis: Pick<AnalysisController, 'state' | 'checkIn' | 'markCheckInSeen' | 'incompleteImport'>
  units: UnitSystem
  library: readonly ActivitySummary[]
  /** The one sport the library holds, which the cards then name once instead of on each. */
  soleSport?: Sport | null
}

/**
 * The fitness cards and, one line under them, "Since your last import" while it has not been seen. The row leads only when
 * there is no card to lead (a library with no steady run); a row that has appeared in this visit stays until it is hidden, so
 * opening it does not take it away. (The owner cut "Your years" from Balance on 10 Nov 2026; the History tab keeps the episodes.)
 */
export function FitnessAndCheckIn({
  analysis,
  units,
  library,
  soleSport = null,
}: FitnessAndCheckInProps) {
  const { fitness, isSample } = analysis.state
  // What the section draws: a card, or for a library of one sport the quiet line that says what would give one.
  const hasCard = useMemo(() => hasFitnessView(fitness) || soleSport !== null, [fitness, soleSport])
  const first = firstRowOf({
    checkIn: analysis.checkIn,
    importIncomplete: analysis.incompleteImport !== null,
    isSample,
  })
  // Set while rendering, from the props alone: a row that has appeared is kept until its subject is gone or it is hidden.
  const [appeared, setAppeared] = useState(false)
  if (first === 'checkIn' && !appeared) setAppeared(true)
  if (first !== 'checkIn' && analysis.checkIn.checkIn === null && appeared) setAppeared(false)
  const words = checkInWords(analysis.checkIn, units)
  const shown = analysis.incompleteImport === null && !isSample
  const row =
    appeared && words !== null && shown ? (
      <CheckInRow words={words} onSeen={analysis.markCheckInSeen} />
    ) : null
  const section = (
    <FitnessSection fitness={fitness} units={units} library={library} soleSport={soleSport} />
  )
  return hasCard ? (
    <>
      {section}
      {row}
    </>
  ) : (
    <>
      {row}
      {section}
    </>
  )
}
