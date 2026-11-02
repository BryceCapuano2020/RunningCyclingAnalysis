import { LATE_IN_EFFORT } from '@rca/core/constants'
import type { Sport } from '@rca/core/types'
import { effortLabel } from './records'
import { SPORT_ACTIVITY } from './sports'

/*
 * Words of the section's two readings: durability, and the heart rate drift of steady efforts, which is the change in
 * efficiency from the first half of an effort to the second.
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
 * best at: "99% of your best 20 min after an hour". With no hard session behind it the share is a floor, "at least
 * 99%", and when the whole library is read the stat says "all time".
 */
export function durabilityStat(
  durationS: number,
  afterS: number,
  retention: number,
  { floor = false, allTime = false }: StatBasis = {},
): string {
  const share = `${floor ? 'at least ' : ''}${Math.round(retention * 100)}%`
  return `${share} of your best ${effortLabel(durationS)} after ${afterWords(afterS)}${allTime ? ', all time' : ''}`
}

/** What a steady effort's efficiency did, from its decoupling in percent: a change under 1% reads as level. */
export function driftChange(decouplingPct: number): string {
  const percent = Math.round(decouplingPct)
  if (percent >= 1) return `fell ${percent}%`
  if (percent <= -1) return `rose ${-percent}%`
  return 'held level'
}

/** The qualifier of a reading made of the whole library, as the period held too few steady efforts. */
const ALL_TIME = ', all time'

/** What the middle steady effort's efficiency did from its first half to its second, as the chart's headline. */
export function driftLede(medianPct: number, allTime = false): string {
  return `Efficiency ${driftChange(medianPct)} from the first half to the second${allTime ? ALL_TIME : ''}.`
}

/** What heart rate drift says on the section's row: "efficiency fell 3%", or "level" within 1% either way. */
export function driftFinding(medianPct: number, allTime = false): string {
  const percent = Math.round(medianPct)
  const said =
    percent >= 1
      ? `efficiency fell ${percent}%`
      : percent <= -1
        ? `efficiency rose ${-percent}%`
        : 'level'
  return `${said}${allTime ? ALL_TIME : ''}`
}

/** The line a drift chart draws at the common reference, in words. */
export const DECOUPLING_REFERENCE = `A fall of ${referenceDecouplingPct}%`

/** What a screen reader hears for the drawing. The reference is the key's sentence, set mid-sentence. */
export function driftDescription(sport: Sport): string {
  const reference = `${DECOUPLING_REFERENCE.charAt(0).toLowerCase()}${DECOUPLING_REFERENCE.slice(1)}`
  return `One dot for each steady ${SPORT_ACTIVITY[sport]} over an hour: the percent its efficiency changed from the first half to the second, by date, a fall being below zero. A dashed line marks ${reference}.`
}
