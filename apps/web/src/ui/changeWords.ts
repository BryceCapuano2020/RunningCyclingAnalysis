import { detectableAt, directionOf, statedResolutionAt } from '@rca/core/change/types'
import type { ChangeCall, ChangeLevel } from '@rca/core/change/types'
import type { Sport } from '@rca/core/types'

/** What a no-clear-change line says when its band is too wide to name a size. */
export const TOO_SPREAD = 'the efforts vary too much to show a change'

/** Whether a sport's call is made in watts per kilogram while its figure is shown in watts. */
const COMPARED_PER_KILOGRAM: Record<Sport, boolean> = { run: false, ride: true }

/**
 * A move in the compared unit, in words, for a call whose displayed figures move the other way or not at all. A ride is
 * compared in watts per kilogram, so the same watts at a lower weight is a higher best (and the other way); the figure
 * shown in watts cannot say which way it moved, and the call's own ratio can: "5% more power per kilogram".
 */
export function perKilogramWords(
  sport: Sport,
  call: ChangeCall | undefined,
  level: ChangeLevel,
): string | null {
  // Only some sports are compared in a unit that differs from the one shown; a run's pace and its call are one quantity.
  if (!COMPARED_PER_KILOGRAM[sport] || call === undefined || call.observed === null) return null
  const direction = directionOf(call, level)
  if (direction === 0) return null
  const percent = Math.max(1, Math.round(Math.abs(Math.expm1(call.observed)) * 100))
  return `${percent}% ${direction > 0 ? 'more' : 'less'} power per kilogram`
}

/**
 * The smallest change the test could have called, as a clause, or '' where the length is untested: "changes under 9%
 * can't be told apart here". Where that change is too large to mean anything (efforts that vary by a quarter or more),
 * the clause names no size: "the efforts vary too much to show a change".
 */
export function resolutionClause(call: ChangeCall | undefined, level: ChangeLevel): string {
  if (detectableAt(call, level) === null) return ''
  const detectable = statedResolutionAt(call, level)
  if (detectable === null) return TOO_SPREAD
  return `changes under ${Math.max(1, Math.ceil(detectable * 100))}% can't be told apart here`
}

/** Which way a displayed figure moved, as the page shows it: 1 for better, -1 for worse, 0 for no move. */
export function shownDirection(gain: number): -1 | 0 | 1 {
  return gain === 0 ? 0 : gain > 0 ? 1 : -1
}
