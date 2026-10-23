import type { AnalysisResult } from '@rca/core/pipeline'
import { pickHeadline } from '../ui/components/pickHeadline'

/**
 * Whether the balance on screen has anything to draw: a comparison, or an estimate for either sport.
 * It lives apart from the card code, which loads on the first click, so the button can ask it while
 * it renders.
 */
export function hasShareableContent(result: AnalysisResult): boolean {
  return pickHeadline(result.comparison) !== null || result.runCp !== null || result.rideCp !== null
}
