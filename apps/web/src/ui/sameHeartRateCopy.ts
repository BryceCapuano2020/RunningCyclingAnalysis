import { SAME_HEART_RATE } from '@rca/core/constants'
import type { Lack, SameHeartRate } from '@rca/core/digest'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { plural } from './components/plural'
import { formatNative } from './charts/sportAxis'
import { weekDay } from './charts/trendText'
import { SPORT_FORMAT, SPORT_PLURAL } from './sports'

/** The verb of "you now run 5:52/km" and "you now ride 214 W", and in the past, "you ran 5:52/km in the week ending". */
const VERB: Record<Sport, { now: string; then: string }> = {
  run: { now: 'run', then: 'ran' },
  ride: { now: 'ride', then: 'rode' },
}
/** What the sport's own number is called in "your pace went from". */
const NOUN: Record<Sport, string> = { run: 'pace', ride: 'power' }

const { windowDays, minBlocks, minActivities, minWeeks, minSpreadBpm, minReportedWeeks } =
  SAME_HEART_RATE
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

/** What is said with fewer than minReportedWeeks weeks to compare, however far apart the two ends are. */
export const TOO_FEW_WEEKS = 'Too few weeks to show a change yet.'

/** The chart's title: the heart rate it reads at, and the sport's own unit. */
export function sameHeartRateTitle(sport: Sport, referenceHr: number, units: UnitSystem): string {
  return `Your output at ${referenceHr} bpm, ${SPORT_FORMAT[sport].titleUnit(units)}`
}

/** A value without its unit when the unit follows another value that has it, as "4:49" before "5:01 /km". */
function withoutUnit(value: string, other: string): string {
  const unit = other.slice(other.lastIndexOf(' '))
  return value.endsWith(unit) ? value.slice(0, -unit.length) : value
}

/**
 * The sentence above the chart. A change is named only when the first and last reporting weeks'
 * intervals do not overlap: "you now run" when the last is the period's last week, and by the week
 * otherwise, since "now" would be wrong. Without one, the first and last values are quoted as "no
 * clear change", or "too few weeks" with fewer than minReportedWeeks to compare. With no change to give,
 * a muted line says what is missing. A fall is told as plainly as a rise.
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
  const ago = plural(change.weeksApart, 'week')
  if (change.real) {
    const latest = change.toEndMs >= (data.latestWeekEndMs ?? Infinity)
    return {
      kind: 'change',
      text: latest
        ? `At ${reference} bpm you now ${VERB[sport].now} ${at(change.to)}, against ${at(change.from)} ${ago} ago.`
        : `At ${reference} bpm in the week ending ${weekDay(change.toEndMs)} you ${VERB[sport].then} ${at(change.to)}, against ${at(change.from)} ${ago} earlier.`,
    }
  }
  if (data.weeks.filter((week) => week.fit !== null).length < minReportedWeeks) {
    return { kind: 'missing', text: TOO_FEW_WEEKS }
  }
  return {
    kind: 'held',
    text: `At ${reference} bpm your ${NOUN[sport]} went from ${withoutUnit(at(change.from), at(change.to))} to ${at(change.to)}: no clear change, within the error.`,
  }
}
