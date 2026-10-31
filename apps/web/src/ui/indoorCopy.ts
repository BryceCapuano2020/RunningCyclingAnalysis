import { CP_FIT_MIN_S } from '@rca/core/constants'
import { effortsCount } from '@rca/core/digest'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { plural } from './components/plural'
import { SPORT_ACTIVITY, SPORT_PLURAL } from './sports'

/*
 * What the pages say about activities held indoors. A treadmill run keeps its time, distance and heart rate but its pace
 * holds no best (a belt's speed is not a distance covered); a trainer ride's power comes from its meter, so it counts as
 * an outdoor ride's does and is only disclosed. Whether an indoor activity's efforts count is core's `effortsCount`, the
 * one rule; the tables here hold only the words.
 */

/** Where an indoor activity of the sport was. */
const INDOOR_PLACE: Record<Sport, string> = { run: 'on a treadmill', ride: 'indoors' }

/** What becomes of the efforts of an indoor activity of the sport, said after the count. */
const INDOOR_EFFORTS_TAIL: Record<Sport, string> = {
  run: 'their pace is not used for bests or thresholds',
  ride: 'their power counts like any other',
}

/** What an indoor activity still gives, and what the athlete adds to see the sport's efforts: only for a sport whose indoor efforts do not count. */
const INDOOR_LEFT: Partial<Record<Sport, string>> = {
  run: `Their time, distance and heart rate count; their pace is not used for bests or thresholds, because a belt’s speed is not a distance covered. Add outdoor runs of ${CP_FIT_MIN_S / 60} minutes or more to see them.`,
}

export interface IndoorCount {
  indoor: number
  total: number
}

/** How many of a sport's activities were indoors, of how many there are. */
export function indoorCount(activities: readonly ActivitySummary[], sport: Sport): IndoorCount {
  const own = activities.filter((activity) => activity.sport === sport)
  return { indoor: own.filter((activity) => activity.indoor).length, total: own.length }
}

/** Whether an indoor activity of the sport holds efforts, by the one rule. */
const indoorEffortsCount = (sport: Sport): boolean => effortsCount({ sport, indoor: true })

/** "14 of your 20 runs were on a treadmill", or "All 4 of your runs ..." when every one was. */
function countClause(sport: Sport, { indoor, total }: IndoorCount): string {
  const noun = SPORT_PLURAL[sport]
  const place = INDOOR_PLACE[sport]
  if (total === 1) return `Your ${SPORT_ACTIVITY[sport]} was ${place}`
  return indoor === total
    ? `All ${total} of your ${noun} were ${place}`
    : `${indoor} of your ${plural(total, SPORT_ACTIVITY[sport])} were ${place}`
}

/**
 * The line in place of "needs efforts" for a sport whose indoor activities cannot hold a best and that holds no other
 * effort: the count, what still counts, and what to add. Null for a sport whose indoor efforts count, when none was indoors,
 * or when the sport has an effort of its own to go on (`hasEffort`).
 */
export function indoorNeedLine(
  activities: readonly ActivitySummary[],
  sport: Sport,
  hasEffort: boolean,
): string | null {
  const count = indoorCount(activities, sport)
  const left = INDOOR_LEFT[sport]
  if (hasEffort || count.indoor === 0 || indoorEffortsCount(sport) || left === undefined)
    return null
  return `${countClause(sport, count)}. ${left}`
}

/**
 * The split once, for a sport with both kinds: "6 of your 40 rides were indoors; their power counts like any other."
 * Null where none or all were indoors (all is `indoorNeedLine`'s, or needs no saying when the efforts count).
 */
export function indoorSplitLine(
  activities: readonly ActivitySummary[],
  sport: Sport,
): string | null {
  const count = indoorCount(activities, sport)
  if (count.indoor === 0) return null
  if (count.indoor === count.total && !indoorEffortsCount(sport)) return null
  return `${countClause(sport, count)}; ${INDOOR_EFFORTS_TAIL[sport]}.`
}
