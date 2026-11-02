import type { ActivitySummary } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { formatCount } from './format/count'
import { SPORT_PLURAL } from './sports'

/**
 * What a sport's fitness reads from an activity, keyed by sport: whether the activity has it, and the words for it
 * after "have". A run's fitness needs heart rate, and a ride's a power meter (virtual power does not count).
 */
const MEASURE: Record<Sport, { has: (activity: ActivitySummary) => boolean; phrase: string }> = {
  run: { has: (activity) => activity.hasHeartRate, phrase: 'heart rate' },
  ride: { has: (activity) => activity.powerSource === 'measured', phrase: 'a power meter' },
}

/**
 * Why a sport has too few steady activities for a fitness status, with the library's own counts: "6 of 59 rides have a
 * power meter. Fitness needs more." Null when none has the measure (the sport then asks for one that does) and when
 * every one has it (the count of steady ones says more), or the library holds none.
 */
export function fitnessCountLine(library: readonly ActivitySummary[], sport: Sport): string | null {
  const own = library.filter((activity) => activity.sport === sport)
  const measured = own.filter(MEASURE[sport].has).length
  if (measured === 0 || measured === own.length) return null
  // Some but not all have it, so there are two or more of the sport: always plural.
  return `${formatCount(measured)} of ${formatCount(own.length)} ${SPORT_PLURAL[sport]} have ${MEASURE[sport].phrase}. Fitness needs more.`
}
