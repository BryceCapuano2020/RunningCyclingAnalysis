import type { FitnessState } from '../fitness/types'

/**
 * What the sport's live fitness status allows the look-back to say about the level now. The look-back sees only through
 * the horizon, so it says nothing that a card showing a plateau under the old level or a rise could contradict: a
 * quiet stretch, a level that "held". It may always say what happened and when.
 */
export type LiveState = FitnessState | null

// Named as text so the set also holds `improved` where the state exists.
const HOLDS: ReadonlySet<string | null> = new Set<string | null>([
  null,
  'holding',
  'back',
  'improved',
  'not-enough-evidence',
])

/** Whether the look-back may say a level held, or was steady, through the horizon. */
export const mayStateHeld = (live: LiveState): boolean => HOLDS.has(live)
