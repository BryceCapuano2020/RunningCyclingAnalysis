import { SAME_HEART_RATE } from '@rca/core/constants'
import type { Lack, SameHeartRate, SameHeartRateWeek } from '@rca/core/digest'
import type { Sport } from '@rca/core/types'
import { plural } from './components/plural'
import { FITNESS_WORDS } from './fitnessWords'
import { SPORT_PLURAL } from './sports'

const { windowDays, wideWindowDays, minBlocks, minActivities, minWeeks, minSpreadBpm } =
  SAME_HEART_RATE
const WINDOW = plural(windowDays / 7, 'week')
/** A week with few activities reaches back this far, so it is the span the need is said over. */
const WIDE_WINDOW = plural(wideWindowDays / 7, 'week')

/**
 * What a missing reading needs, for each thing that can stop it, by the sport. Each sentence says the
 * need as a number from the constants, so the copy and the rule cannot part.
 */
export const LACK_TEXT: Record<Lack, (sport: Sport, referenceHr?: number | null) => string> = {
  blocks: () =>
    `Needs at least ${minBlocks} steady 5-minute stretches with heart rate in ${WIDE_WINDOW}.`,
  activities: (sport) =>
    `Needs steady stretches from at least ${minActivities} ${SPORT_PLURAL[sport]} in ${WIDE_WINDOW}.`,
  weeks: () => `Needs steady stretches from at least ${minWeeks} different weeks.`,
  spread: () =>
    `Needs steady efforts at different heart rates, spread by about ${minSpreadBpm} bpm or more.`,
  range: (_, referenceHr) =>
    `Needs steady efforts around ${referenceHr ?? 'the same'} bpm in the latest weeks.`,
  period: () => `Needs ${WINDOW} of steady efforts with heart rate.`,
}

/** What a window held of the two things that can be counted: the stretches, and the activities they came from. */
export type Held = Pick<SameHeartRateWeek, 'blocks' | 'activities' | 'wide'>

/** The weeks a window reaches back, as the count is said over: the wide window only where the week reached back that far. */
const windowOf = ({ wide }: Held) => (wide === true ? WIDE_WINDOW : WINDOW)

/** What each countable lack says the window held, against what a reading takes: "3 of 6 rides with steady stretches in 8 weeks." */
const HELD_TEXT: Partial<Record<Lack, (sport: Sport, held: Held) => string>> = {
  blocks: (_, held) =>
    `${held.blocks} of ${minBlocks} steady 5-minute stretches with heart rate in ${windowOf(held)}.`,
  activities: (sport, held) =>
    `${held.activities} of ${minActivities} ${SPORT_PLURAL[sport]} with steady stretches in ${windowOf(held)}.`,
}

/**
 * What a lack says: the count the window held against the count a reading takes, where the lack is a count, so it reads
 * as what the library has. The others, and a window with no count to give, say what they need.
 */
export function lackLine(
  lack: Lack,
  sport: Sport,
  referenceHr: number | null,
  held?: Held,
): string {
  const counted = held === undefined ? undefined : HELD_TEXT[lack]
  return counted === undefined || held === undefined
    ? LACK_TEXT[lack](sport, referenceHr)
    : counted(sport, held)
}

/** The section's name, in its heading: "Pace at heart rate", "Power at heart rate". */
export function sameHeartRateName(sport: Sport): string {
  return `${FITNESS_WORDS[sport].output} at heart rate`
}

/** The chart's title: "Pace at 150 bpm, by week". It names no change: the fitness status is the sport's voice on that. */
export function sameHeartRateTitle(sport: Sport, referenceHr: number | null): string {
  return `${FITNESS_WORDS[sport].output} at ${referenceHr === null ? 'one heart rate' : `${referenceHr} bpm`}, by week`
}

/** The week that came closest to reporting: the one with most stretches, the latest of equals. Null without a week. */
function nearestWeek(weeks: readonly SameHeartRateWeek[]): SameHeartRateWeek | null {
  let best: SameHeartRateWeek | null = null
  for (const week of weeks) {
    if (week.lacks !== null && (best === null || week.blocks >= best.blocks)) best = week
  }
  return best
}

/**
 * What the weekly view says when it has nothing to draw: what the library has, with its counts, or the need that stops
 * it, in words, or null when there is a chart. Too few weeks to draw a trend is no lack here: the weeks that report are
 * drawn as dots, and the chart claims no change. It speaks of the weeks and never of a change: the fitness status above
 * is the sport's voice on that.
 */
export function sameHeartRateLackText(sport: Sport, data: SameHeartRate): string | null {
  const { referenceHeartRate: reference, reportedWeeks, weeks } = data
  if (reference !== null && reportedWeeks >= 2) return null
  const lack = data.lacks ?? 'blocks'
  const nearest = nearestWeek(weeks)
  // With no week at all the library holds nothing countable, which is zero of each over the longest window.
  const held = nearest ?? { blocks: 0, activities: 0, wide: true as const }
  return lackLine(lack, sport, reference, held)
}
