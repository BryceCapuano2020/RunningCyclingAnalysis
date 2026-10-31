import { effortShare } from '../effortCaveat'
import { SPORT_NOUN } from '../sports'
import type { Sport } from '@rca/core/types'

/**
 * The line that says a comparison read every effort, because heart rate could not pick the hard ones of both periods, with the
 * reason that is true: neither period has a heart rate on its best 20 minutes, the library has too few days with one to set a
 * reference, or both periods have a heart rate and too few efforts were shown hard. A reference that cannot show an effort hard
 * holds the comparison back instead (`notHardNote`), so it never reaches this line.
 */
export function uncheckedLine(
  sport: Sport,
  shares: readonly (ReturnType<typeof effortShare> | null)[],
): string {
  const noun = SPORT_NOUN[sport]
  const known = shares.filter((share) => share !== null)
  if (known.length === 0) {
    return `Effort not checked: no heart rate on the ${noun} efforts, so every effort counts.`
  }
  if (known.some((share) => !share.checked)) {
    return 'Effort not checked: too few days with heart rate to set a reference, so every effort counts.'
  }
  return `Effort not checked: too few ${noun} efforts shown hard by heart rate in both periods, so every effort counts.`
}
