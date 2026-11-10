import { useState } from 'react'
import type { UnitSystem } from '@rca/core/units'
import type { AnalysisController } from '../analysis/controller'
import { checkInWords, firstRowOf } from '../checkInRow'
import { CheckInRow } from './CheckInRow'

export interface CheckInLineProps {
  analysis: Pick<AnalysisController, 'state' | 'checkIn' | 'markCheckInSeen' | 'incompleteImport'>
  units: UnitSystem
}

/**
 * Balance's one line "Since your last import", while it has not been seen. A row that has appeared in this visit stays until
 * it is hidden, so opening it does not take it away. The fitness cards are on the Run and Ride pages, where their chart gives
 * the level its meaning; Balance leads with the balance and the headline figures (owner, 10 Nov 2026).
 */
export function CheckInLine({ analysis, units }: CheckInLineProps) {
  const { isSample } = analysis.state
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
  return appeared && words !== null && shown ? (
    <CheckInRow words={words} onSeen={analysis.markCheckInSeen} />
  ) : null
}
