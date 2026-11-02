import type { ActivitySummary } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { countSport } from './records'
import { BALANCE_PAIR } from './sports'

/**
 * The one sport a library holds, when it holds only one in All time; null with two sports or none. Balance reads such a
 * library as a single-sport home (a level and a threshold, an invitation to add the other sport) rather than as a
 * comparison that is missing half its evidence.
 */
export function soleSportOf(library: ActivitySummary[]): Sport | null {
  const held = BALANCE_PAIR.filter((sport) => countSport(library, sport) > 0)
  return held.length === 1 ? held[0]! : null
}

/** The sport a sole-sport library lacks, which the invitation asks for. */
export function otherSport(sport: Sport): Sport {
  return BALANCE_PAIR.find((candidate) => candidate !== sport)!
}
