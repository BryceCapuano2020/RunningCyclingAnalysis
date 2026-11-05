import type { FitnessView } from './fitnessModel'

/** A range in brackets after a figure, " (5 to 13)", which the row's one line leaves to its Details. */
const RANGE = / \((?:[\d:.,]+) to (?:[\d:.,]+)\)/g

/** A line with its ranges taken out, so the one line under a row's title is a figure, not a figure and its range. */
export const withoutRange = (text: string): string => text.replace(RANGE, '')

/**
 * The one line under a row's title: the first change where the status calls one ("Up 9% from your 2023 low."), else the
 * level ("205 W at 140 bpm."), each without its range.
 */
export function fitnessLine(view: FitnessView): string {
  return withoutRange(view.changes[0] ?? view.headline)
}
