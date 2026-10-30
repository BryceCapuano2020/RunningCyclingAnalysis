import type { AnalysisResult } from '@rca/core/pipeline'
import type { BalanceGap } from '../ui/balanceGap'
import { unlessRideImplausible, type GradeOutcome } from '../ui/grades'
import { balanceOfPick } from '../ui/components/balanceScale'
import { headlinePick } from '../ui/components/pickHeadline'

/**
 * Whether the balance on screen can be shared: a weight is entered, both sports have a threshold, and
 * the balance can be stated, by a grade gap or an energy comparison. A card for one sport, or one that
 * waits for the weight or a threshold, is never offered, so no shared image asks the reader for anything.
 * A ride flagged as implausible input is out of the balance, so such a library has nothing to share.
 * It lives apart from the card code, which loads on the first click, so the button can ask it while
 * it renders.
 */
export function hasShareableContent(
  result: AnalysisResult,
  gap: BalanceGap | null,
  weightKnown: boolean,
  ride: GradeOutcome | null,
): boolean {
  return (
    weightKnown &&
    result.runCp !== null &&
    result.rideCp !== null &&
    balanceOfPick(gap, unlessRideImplausible(headlinePick(result), ride)) !== null
  )
}
