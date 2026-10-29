import { SAME_HEART_RATE } from '@rca/core/constants'
import type { Lack, SameHeartRate } from '@rca/core/digest'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { plural } from './components/plural'
import { weeksTrend } from './charts/sameHeartRateTrend'
import { weekDay } from './charts/trendText'
import { utcDayLocal } from './charts/trendTicks'
import { formatMonthName } from './format/date'
import { PACE_UNIT } from '@rca/core/units'
import { SPORT_FORMAT, SPORT_PLURAL } from './sports'

const { windowDays, minBlocks, minActivities, minWeeks, minSpreadBpm, minReportedWeeks } =
  SAME_HEART_RATE
const DAY_MS = 86_400_000
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

/**
 * How a change is said, by sport. Each says "more" in its own words: a run's pace is quicker by so many seconds, a
 * ride's power higher by so many watts. The amount is the fitted line's change in the unit the chart's axis reads in
 * (seconds a unit of pace, watts), and never rounds to nothing, since a change is only named when it is clear.
 * `better` says whether a fall or a rise on that axis is the better output: a pace is better when it is lower.
 */
const CHANGE: Record<
  Sport,
  {
    better: (delta: number) => boolean
    faster: (n: string, units: UnitSystem) => string
    slower: (n: string, units: UnitSystem) => string
  }
> = {
  run: {
    better: (delta) => delta < 0,
    faster: (n, units) => `you run ${n} s${PACE_UNIT[units]} faster`,
    slower: (n, units) => `you run ${n} s${PACE_UNIT[units]} slower`,
  },
  ride: {
    better: (delta) => delta > 0,
    faster: (n) => `you put out ${n} W more`,
    slower: (n) => `you put out ${n} W less`,
  },
}

/** Months a window's middle is from another's, counting calendar months. */
function monthsBetween(fromMs: number, toMs: number): number {
  const [a, b] = [new Date(fromMs), new Date(toMs)]
  return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth()
}

/** Months back at which a bare month name stops being unambiguous, and the year is added. */
const YEAR_AFTER_MONTHS = 9

/**
 * The month a reporting week's output is dated to: its window is the weeks before its Sunday, so the middle of it.
 * The year is added when the week is in the same month as the one it is compared with, or 9 or more months before
 * it, since "than in March" would otherwise be read as the March just gone.
 */
function monthOf(endMs: number, againstEndMs: number): string {
  const middle = (ms: number) => utcDayLocal(ms - (windowDays / 2) * DAY_MS)
  const months = monthsBetween(middle(endMs), middle(againstEndMs))
  return formatMonthName(middle(endMs), months === 0 || months >= YEAR_AFTER_MONTHS)
}

/**
 * The finding the section is titled by, and the line its closed row says. A change is named only when two things
 * hold: the first and last reporting weeks' intervals do not overlap, and the fitted line through every reporting
 * week has a slope its own band excludes zero from. Then it is said by how much the line moved across the reporting
 * weeks and against which month: "At the same heart rate you run 6 s/km faster than in March". One that ends before
 * the period's last week says by which week, since "now" would be wrong. Without a change, "no clear change" with the
 * month it is held since, or "too few weeks" with fewer than minReportedWeeks to compare. With nothing to give, a
 * muted line says what is missing. A fall is told as plainly as a rise.
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
  const since = monthOf(change.fromEndMs, change.toEndMs)
  const trend = weeksTrend(data.weeks, sport, units)
  if (change.real && trend !== null && trend.clear) {
    const delta = trend.at(trend.to) - trend.at(trend.from)
    const { better, faster, slower } = CHANGE[sport]
    const n = String(Math.max(1, Math.round(Math.abs(delta))))
    const said = (better(delta) ? faster : slower)(n, units)
    const latest = change.toEndMs >= (data.latestWeekEndMs ?? Infinity)
    return {
      kind: 'change',
      text: `At the same heart rate${latest ? '' : `, by the week ending ${weekDay(change.toEndMs)},`} ${said} than in ${since}`,
    }
  }
  if (data.weeks.filter((week) => week.fit !== null).length < minReportedWeeks) {
    return { kind: 'missing', text: TOO_FEW_WEEKS }
  }
  return { kind: 'held', text: `At the same heart rate: no clear change since ${since}` }
}
