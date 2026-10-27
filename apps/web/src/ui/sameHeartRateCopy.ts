import { SAME_HEART_RATE } from '@rca/core/constants'
import type { Lack, SameHeartRate } from '@rca/core/digest'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { quantile } from '@rca/core/math'
import { plural } from './components/plural'
import { formatNative } from './charts/sportAxis'
import { SPORT_FORMAT, SPORT_PLURAL } from './sports'

/** The verb that opens "you now run 5:52/km" and "you now ride 214 W". */
const VERB: Record<Sport, string> = { run: 'run', ride: 'ride' }
/** What the sport's own number is called in "your pace has held". */
const NOUN: Record<Sport, string> = { run: 'pace', ride: 'power' }

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
    `Needs steady stretches reaching ${WINDOW} into the period. A longer period gives more.`,
}

/** The chart's title: the heart rate it reads at, and the sport's own unit. */
export function sameHeartRateTitle(sport: Sport, referenceHr: number, units: UnitSystem): string {
  return `Your output at ${referenceHr} bpm, ${SPORT_FORMAT[sport].titleUnit(units)}`
}

/**
 * The sentence above the chart. A change is named only when the first and last weeks' intervals do
 * not overlap; otherwise the output "has held ... within the error". With no change to give, a muted
 * line says what is missing. A fall is told as plainly as a rise.
 */
export function sameHeartRateCopy(
  sport: Sport,
  data: SameHeartRate,
  units: UnitSystem,
): { kind: 'change' | 'held' | 'missing'; text: string } {
  const { referenceHeartRate: reference, change } = data
  if (reference === null || change === null) {
    return { kind: 'missing', text: LACK_TEXT[data.lacks ?? 'blocks'](sport, reference) }
  }
  const at = (output: number) => formatNative(sport, output, units)
  if (change.real) {
    return {
      kind: 'change',
      text: `At ${reference} bpm you now ${VERB[sport]} ${at(change.to)}, against ${at(change.from)} ${plural(change.weeksApart, 'week')} ago.`,
    }
  }
  const outputs = data.weeks.flatMap((week) => (week.fit === null ? [] : [week.fit.output]))
  return {
    kind: 'held',
    text: `At ${reference} bpm your ${NOUN[sport]} has held at about ${at(quantile(outputs, 0.5))}, within the error.`,
  }
}
