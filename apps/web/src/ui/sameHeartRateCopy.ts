import { SAME_HEART_RATE } from '@rca/core/constants'
import type { Lack, SameHeartRate } from '@rca/core/digest'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { plural } from './components/plural'
import { SPORT_FORMAT, SPORT_PLURAL } from './sports'

const { windowDays, minBlocks, minActivities, minWeeks, minSpreadBpm } = SAME_HEART_RATE
const WINDOW = plural(windowDays / 7, 'week')

/**
 * What a missing reading needs, for each thing that can stop it, by the sport. Each sentence says the
 * need as a number from the constants, so the copy and the rule cannot part.
 */
export const LACK_TEXT: Record<Lack, (sport: Sport, referenceHr?: number | null) => string> = {
  blocks: () =>
    `Needs at least ${minBlocks} steady 5-minute stretches with heart rate in ${WINDOW}, after the first 10 minutes of an activity.`,
  activities: (sport) =>
    `Needs steady stretches from at least ${minActivities} ${SPORT_PLURAL[sport]} in ${WINDOW}.`,
  weeks: () => `Needs steady stretches from at least ${minWeeks} different weeks.`,
  spread: () =>
    `Needs steady efforts at different heart rates, spread by about ${minSpreadBpm} bpm or more.`,
  range: (_, referenceHr) =>
    `Needs steady efforts around ${referenceHr ?? 'the same'} bpm in the latest weeks.`,
  period: () =>
    `Needs ${WINDOW} of steady efforts with heart rate. Pick a longer period to see it.`,
}

/** The chart's title: the heart rate it reads at, and the sport's own unit. It names no change: the fitness status is the sport's voice on that. */
export function sameHeartRateTitle(sport: Sport, referenceHr: number, units: UnitSystem): string {
  return `Your output at ${referenceHr} bpm, ${SPORT_FORMAT[sport].titleUnit(units)}`
}

/**
 * What the weekly view says when it has nothing to draw: the need that stops it, in words, or null when there is a chart.
 * Too few weeks to draw a trend is no lack here: the weeks that report are drawn as dots, and the chart claims no change.
 * It speaks of the weeks and never of a change: the fitness status above is the sport's voice on that.
 */
export function sameHeartRateLackText(sport: Sport, data: SameHeartRate): string | null {
  const { referenceHeartRate: reference, reportedWeeks } = data
  if (reference === null || reportedWeeks < 2)
    return LACK_TEXT[data.lacks ?? 'blocks'](sport, reference)
  return null
}
