import { DURATIONS_S } from '@rca/core/constants'
import type { ChangeEvidence, ChangeVerdict } from '@rca/core/change/types'

/**
 * Change evidence in which every length, in both sports, has the verdict given, for a test of how a verdict is worded.
 * The counts and the band are plausible, and unused by the words.
 */
export function changeOf(
  verdict: ChangeVerdict,
  over: Partial<Record<number, ChangeVerdict>> = {},
): ChangeEvidence {
  const calls = DURATIONS_S.map((durationS) => {
    const here = over[durationS] ?? verdict
    const judged = here !== 'untested'
    return {
      durationS,
      now: judged ? 12 : 1,
      before: judged ? 12 : 1,
      observed: judged ? 0.05 : null,
      low: judged ? -0.04 : null,
      high: judged ? 0.04 : null,
      verdict: here,
    }
  })
  return { run: calls, ride: calls.map((call) => Object.assign({}, call)) }
}
