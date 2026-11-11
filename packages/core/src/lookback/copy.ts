import { HALF_MARATHON_M, MARATHON_M } from '../constants'
import { MONTH_NAMES, civilOfDay, localDayOfInstant } from '../calendar'
import { formatDuration } from '../units/format'
import { formatPace, formatPower } from '../units'
import type { UnitSystem } from '../units'
import type { Sport } from '../types'
import type { EffortMilestones } from './types'

/**
 * The words of the look-back. Every date carries its year, and every claim about the level that the look-back cannot see
 * past the horizon is dated to it. Plain, in the reader's voice; no cause is ever given.
 */

/** "May 2021". */
export const monthYear = (ms: number): string => {
  const date = new Date(ms)
  return `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

/** "14 May 2021". */
export const dayMonthYear = (ms: number): string => {
  const date = new Date(ms)
  return `${date.getUTCDate()} ${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

/** "14 May 2021" in the viewer's own zone, for a moment of the wall clock (an import) rather than of a workout. */
export const localDayMonthYear = (ms: number): string => {
  const { year, month, date } = civilOfDay(localDayOfInstant(ms))
  return `${date} ${MONTH_NAMES[month]} ${year}`
}

/** A stretch of months: "January to April 2020", "November 2019 to February 2020". */
export function monthsBetween(fromMs: number, toMs: number): string {
  const [a, b] = [new Date(fromMs), new Date(toMs)]
  return a.getUTCFullYear() === b.getUTCFullYear()
    ? `${MONTH_NAMES[a.getUTCMonth()]} to ${monthYear(toMs)}`
    : `${monthYear(fromMs)} to ${monthYear(toMs)}`
}

/** What each sport's level is called, and its steady activities. */
export const SAY: Record<Sport, { subject: string; steady: string }> = {
  run: { subject: 'pace', steady: 'steady runs' },
  ride: { subject: 'power', steady: 'steady rides' },
}

/** What an effort is called: "5 min", "20 min", "60 min", "5 km", "10 km", "half marathon". */
export function effortName(effort: EffortMilestones['effort']): string {
  if (effort.kind === 'duration') return `${effort.durationS / 60} min`
  if (effort.distanceM === MARATHON_M) return 'marathon'
  if (effort.distanceM === HALF_MARATHON_M) return 'half marathon'
  return `${effort.distanceM / 1000} km`
}

/** A best as the page writes it: a pace or a power for a length of time, a time for a distance. */
export function bestValue(
  m: Pick<EffortMilestones, 'unit'>,
  value: number,
  system: UnitSystem,
): string {
  if (m.unit === 'm/s') return formatPace(value, system)
  if (m.unit === 'W') return formatPower(value)
  if (m.unit === 'W/kg') return `${value.toFixed(2)} W/kg`
  return formatDuration(value)
}

/** What a sport's years lack, as one line with no counts: a library with none would otherwise read "You have 0 over 0". */
export function tooShortText(sport: Sport = 'run'): string {
  return `Not enough ${SAY[sport].steady} for a fitness history.`
}
