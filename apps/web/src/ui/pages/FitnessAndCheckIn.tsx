import { useMemo, useState } from 'react'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import type { AnalysisController } from '../analysis/controller'
import { checkInWords, firstRowOf } from '../checkInRow'
import { yearsWords } from '../yearsRow'
import { fitnessViews } from '../fitnessModel'
import { CheckInRow } from './CheckInRow'
import { YearsRow } from './YearsRow'
import { FitnessSection } from './FitnessSection'

export interface FitnessAndCheckInProps {
  analysis: Pick<
    AnalysisController,
    'state' | 'checkIn' | 'markCheckInSeen' | 'markLookBackSeen' | 'incompleteImport'
  >
  units: UnitSystem
  library: readonly ActivitySummary[]
  /** The one sport the library holds, which the cards then name once instead of on each. */
  soleSport?: Sport | null
}

/**
 * The fitness cards and, one line under them, "Since your last import" or, when that has nothing new or has been seen,
 * "Your years". The row leads only when there is no card to lead (a library with no steady run). It takes the place
 * while it has not been seen; a row that has appeared in this visit stays until it is hidden, so opening it does not take
 * it away.
 */
export function FitnessAndCheckIn({
  analysis,
  units,
  library,
  soleSport = null,
}: FitnessAndCheckInProps) {
  const { fitness, isSample, lookBack } = analysis.state
  // What the section draws: a card, or for a library of one sport the quiet line that says what would give one.
  const hasCard = useMemo(
    () => fitnessViews(fitness, units).length > 0 || soleSport !== null,
    [fitness, units, soleSport],
  )
  const years = useMemo(() => yearsWords(lookBack, fitness, units), [lookBack, fitness, units])
  const first = firstRowOf({
    checkIn: analysis.checkIn,
    hasYears: years !== null,
    importIncomplete: analysis.incompleteImport !== null,
    isSample,
  })
  // Set while rendering, from the props alone: a row that has appeared is kept until its subject is gone or it is hidden.
  const [appeared, setAppeared] = useState(false)
  if (first === 'checkIn' && !appeared) setAppeared(true)
  if (first !== 'checkIn' && analysis.checkIn.checkIn === null && appeared) setAppeared(false)
  const [yearsAppeared, setYearsAppeared] = useState(false)
  if (first === 'lookBack' && !yearsAppeared) setYearsAppeared(true)
  if (years === null && yearsAppeared) setYearsAppeared(false)
  const words = checkInWords(analysis.checkIn, units)
  const shown = analysis.incompleteImport === null && !isSample
  const row =
    appeared && words !== null && shown ? (
      <CheckInRow words={words} onSeen={analysis.markCheckInSeen} />
    ) : yearsAppeared && years !== null && shown ? (
      <YearsRow words={years} onSeen={analysis.markLookBackSeen} />
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
