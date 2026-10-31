import { useMemo, useState } from 'react'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { UnitSystem } from '@rca/core/units'
import type { AnalysisController } from '../analysis/controller'
import { checkInWords, firstRowOf } from '../checkInRow'
import { fitnessViews } from '../fitnessModel'
import { CheckInRow } from './CheckInRow'
import { FitnessSection } from './FitnessSection'

export interface FitnessAndCheckInProps {
  analysis: Pick<AnalysisController, 'state' | 'checkIn' | 'markCheckInSeen' | 'incompleteImport'>
  units: UnitSystem
  library: readonly ActivitySummary[]
}

/**
 * The fitness cards and, one line under them, "Since your last import". The row leads only when there is no card to
 * lead (a library with no steady run). It takes the place while the check-in has not been seen; a row that has
 * appeared in this visit stays until it is hidden, so opening it does not take it away.
 */
export function FitnessAndCheckIn({ analysis, units, library }: FitnessAndCheckInProps) {
  const { fitness, isSample } = analysis.state
  const hasCard = useMemo(() => fitnessViews(fitness, units).length > 0, [fitness, units])
  const eligible =
    firstRowOf({
      checkIn: analysis.checkIn,
      importIncomplete: analysis.incompleteImport !== null,
      isSample,
    }) === 'checkIn'
  // Set while rendering, from the props alone: a row that has appeared is kept until the check-in is gone or hidden.
  const [appeared, setAppeared] = useState(false)
  if (eligible && !appeared) setAppeared(true)
  if (!eligible && analysis.checkIn.checkIn === null && appeared) setAppeared(false)
  const words = checkInWords(analysis.checkIn, units)
  const row =
    appeared && words !== null && analysis.incompleteImport === null && !isSample ? (
      <CheckInRow words={words} onSeen={analysis.markCheckInSeen} />
    ) : null
  const section = <FitnessSection fitness={fitness} units={units} library={library} />
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
