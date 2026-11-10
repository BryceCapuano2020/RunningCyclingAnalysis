import { workoutKey } from '../duplicates'
import type { Sport } from '../types'
import type { AthleteSettings } from './settings'

/** The sports whose activities can be at walking pace, so a choice to count one can be kept. */
const CAN_BE_AT_WALKING_PACE: Record<Sport, boolean> = { run: true, ride: false }

/** A workout key of such a sport, in the form `workoutKey` writes: the sport and the start second. */
const WORKOUT_KEY = new RegExp(
  `^(?:${(Object.keys(CAN_BE_AT_WALKING_PACE) as Sport[])
    .filter((sport) => CAN_BE_AT_WALKING_PACE[sport])
    .map((sport) => workoutKey(sport, 0).replace(/0$/, ''))
    .join('|')})\\d{1,12}$`,
)

/** The most choices kept: far above any library, so a limit is never reached by a real one, and said when it is. */
export const MAX_COUNTED_RUNS = 20_000

/** Whether the text is a workout key a choice can be kept under. */
export function isCountableKey(text: string): boolean {
  return WORKOUT_KEY.test(text)
}

/** Whether two settings count the same runs at walking pace. The order of the keys does not matter. */
export function sameCountedRuns(a: AthleteSettings, b: AthleteSettings): boolean {
  const [left, right] = [a.countedRuns ?? [], b.countedRuns ?? []]
  if (left.length !== right.length) return false
  const held = new Set(left)
  return right.every((key) => held.has(key))
}
