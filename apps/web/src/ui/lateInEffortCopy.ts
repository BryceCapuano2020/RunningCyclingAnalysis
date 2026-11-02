import { LATE_IN_EFFORT } from '@rca/core/constants'
import type { Sport } from '@rca/core/types'
import { plural } from './components/plural'
import { effortLabel } from './records'
import { SPORT_ACTIVITY, SPORT_PLURAL } from './sports'

/*
 * Words of the section's two readings: durability, and the heart rate drift of steady efforts, which is the change in
 * efficiency (output per heartbeat) from the first half of an effort to the second.
 */

const { referenceDecouplingPct } = LATE_IN_EFFORT

/** A time into an effort as it follows "After": "60 min", "90 min". */
export function afterLabel(afterS: number): string {
  return effortLabel(afterS)
}

/** How far a late best is below the best overall, in whole percent; negative when it is above. */
export function fadePercent(retention: number): number {
  return Math.round((1 - retention) * 100)
}

/**
 * The lede: how far the best at a duration falls once an effort is that old, against the best at that
 * duration overall. A difference under 1% reads as within 1%, since a whole percent is the figure's precision.
 */
export function durabilityLede(afterS: number, durationS: number, retention: number): string {
  const percent = fadePercent(retention)
  const effort = effortLabel(durationS)
  const opening = `After ${afterLabel(afterS)} your best ${effort}`
  if (percent >= 1) return `${opening} is ${percent}% below your best ${effort} overall.`
  if (percent <= -1) return `${opening} is ${-percent}% above your best ${effort} overall.`
  return `${opening} is within 1% of your best ${effort} overall.`
}

/** A time into an effort in the words a sentence uses: "an hour" for 3,600 s, "2 hours", else "45 min". */
export function afterWords(afterS: number): string {
  const hours = afterS / 3600
  if (!Number.isInteger(hours) || hours < 1) return afterLabel(afterS)
  return hours === 1 ? 'an hour' : `${hours} hours`
}

/** How a stat is qualified: a floor where no session shown hard stands behind it, and the whole library as all time. */
export interface StatBasis {
  floor?: boolean
  allTime?: boolean
}

/**
 * The late best as a share of the best overall, in whole percent, as the stat says it, with the duration it is the
 * best at: "Best 20 min held 99% after an hour". With no hard session behind it the share is a floor, "held at least 99%",
 * and when the whole library is read the stat says "all time".
 */
export function durabilityStat(
  durationS: number,
  afterS: number,
  retention: number,
  { floor = false, allTime = false }: StatBasis = {},
): string {
  const share = `${floor ? 'at least ' : ''}${Math.round(retention * 100)}%`
  return `Best ${effortLabel(durationS)} held ${share} after ${afterWords(afterS)}${allTime ? ', all time' : ''}`
}

/** What a steady effort's efficiency did, from its decoupling in percent: a change under 1% reads as level. */
export function driftChange(decouplingPct: number): string {
  const percent = Math.round(decouplingPct)
  if (percent >= 1) return `fell ${percent}%`
  if (percent <= -1) return `rose ${-percent}%`
  return 'held level'
}

/**
 * The lede: what the middle steady effort's efficiency did from its first half to its second. When the whole library
 * is read, `window` dates the efforts, such as "May 2021 to October 2026".
 */
export function driftLede(
  sport: Sport,
  medianPct: number,
  count: number,
  window: string | null = null,
): string {
  const efforts = plural(count, SPORT_ACTIVITY[sport], SPORT_PLURAL[sport])
  return `On steady ${SPORT_PLURAL[sport]} over an hour${window === null ? '' : ` from ${window}`}, efficiency ${driftChange(medianPct)} from the first half to the second (median of ${efforts}).`
}

/** The line a drift chart draws at the common reference, in words. */
export const DECOUPLING_REFERENCE = `A fall of ${referenceDecouplingPct}%: a common coaching reference line`

/** What a screen reader hears for the drawing. The reference is the key's sentence, set mid-sentence. */
export function driftDescription(sport: Sport): string {
  const reference = `${DECOUPLING_REFERENCE.charAt(0).toLowerCase()}${DECOUPLING_REFERENCE.slice(1)}`
  return `One dot for each steady ${SPORT_ACTIVITY[sport]} over an hour: the percent its efficiency changed from the first half to the second, by date, a fall being below zero. A dashed line marks ${reference}.`
}
