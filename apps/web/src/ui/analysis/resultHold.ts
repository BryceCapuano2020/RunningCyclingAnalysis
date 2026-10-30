import type { LibraryKnowledge } from './libraryKnowledge'

/**
 * Why the results are held back, and how much of them. One mechanism for every reason: the page asks
 * `holdOf` and shows the top reason's page or message, so no screen decides on its own.
 * - `results` scope: every result page is replaced by the library page.
 * - `headline` scope: only the Balance headline and the fitness cards wait (reasons added by the effort
 *   gate and the partial import; none yet).
 * Precedence, when more reasons exist: updating, then partial-import, then effort.
 */
export type HoldReason = 'updating'
export type HoldScope = 'results' | 'headline'

export interface Hold {
  reason: HoldReason
  scope: HoldScope
}

/**
 * Whether one stale digest holds every result back, as the design has it for an exclusive revision. Off, the
 * results of the digests that are read still show beside the notice, as they do today, and the hold applies
 * only when nothing is readable. One line to turn it on, when revision 7 makes a mixed library a real state.
 */
export const HOLD_ON_ANY_STALE = false

export interface HoldInputs {
  knowledge: LibraryKnowledge
  hasResult: boolean
  /** Digests held out for an older model. */
  stale: number
  /** Digests held out for a newer app. */
  newer: number
}

/** The hold in force, or null. */
export function holdOf({ knowledge, hasResult, stale, newer }: HoldInputs): Hold | null {
  if (knowledge !== 'present') return null
  const waiting = stale + newer > 0
  const held = !hasResult || (HOLD_ON_ANY_STALE && stale > 0)
  return waiting && held ? { reason: 'updating', scope: 'results' } : null
}
