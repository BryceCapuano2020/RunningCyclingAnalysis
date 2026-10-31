import type { AnalysisResult } from '@rca/core/pipeline'
import type { BalanceGap } from '../ui/balanceGap'
import { balanceOfPick } from '../ui/components/balanceScale'
import { heldPick } from '../ui/resultHold'

/**
 * Whether the balance on screen can be shared: a weight is entered, both sports have a threshold, and
 * the balance can be stated, by a grade gap or an energy comparison. A card for one sport, or one that
 * waits for the weight or a threshold, is never offered, so no shared image asks the reader for anything.
 * It lives apart from the card code, which loads on the first click, so the button can ask it while
 * it renders.
 */
export function hasShareableContent(
  result: AnalysisResult,
  gap: BalanceGap | null,
  weightKnown: boolean,
): boolean {
  return (
    weightKnown &&
    result.runCp !== null &&
    result.rideCp !== null &&
    balanceOfPick(gap, heldPick(result).pick) !== null
  )
}
