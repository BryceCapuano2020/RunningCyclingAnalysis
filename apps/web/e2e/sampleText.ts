import { sampleFigures } from '../scripts/landingFiguresPlugin.ts'
import { landingText } from '../src/test/landingText.ts'

/**
 * The words the sample's Balance page says, made from the sample's own figures (read once, as the build reads
 * them), so a spec never types a number the sample gives.
 */
export const SAMPLE_TEXT = landingText(sampleFigures())

/** A row's text as a pattern that allows the page's spacing between its parts. */
export function rowPattern(row: string): RegExp {
  return new RegExp(row.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s*'))
}
