import { libraryCurves } from './digest/libraryCurves'
import { PROFILE_FULL_LEVEL_ACTIVITIES } from './profile/constants'
import type { LibraryBests } from './sessionState'
import { SPORTS } from './types'
import type { ActivityDigest, AthleteSettings } from './types'

/**
 * The best curves of the whole library, or null when the period holds enough activities of every sport it has (or none
 * of a sport, whose page is empty), so nothing is worked out for a period that can judge its own bests.
 */
export function libraryBestsOf(
  selected: readonly ActivityDigest[],
  analysed: ActivityDigest[],
  settings: AthleteSettings,
): LibraryBests | null {
  const short = SPORTS.some((sport) => {
    const held = selected.filter((digest) => digest.sport === sport).length
    return held > 0 && held < PROFILE_FULL_LEVEL_ACTIVITIES
  })
  if (!short) return null
  const { runCurve, rideMeasuredCurve } = libraryCurves(analysed, settings)
  return { run: runCurve, ride: rideMeasuredCurve }
}
