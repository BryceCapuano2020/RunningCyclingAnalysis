import { ALL_OUT_FRACTION as ALL_OUT } from '@rca/core/effort'
import type { EffortCheck, Sport } from '@rca/core/types'
import { formatDuration } from '@rca/core/units'
import { HEADLINE_LABEL } from './grades'

/*
 * What a best effort's heart rate says about how hard it was. A domain rule rather than copy,
 * so the share card and the Method page read the same check.
 */

export interface EffortCaveat {
  /** The evidence-gap card's title. */
  title: string
  /** What the gap is and what would close it. */
  text: string
  /** One line for the share card. */
  short: string
}

/** What follows a best effort's share, shared by the card's text and the sport page's line. */
const VERDICT = {
  /** The measured fact is the share before it, so this says what would change it. */
  notHard: (duration: string) => `. A hard ${duration} effort would raise this.`,
  hard: ', so it was hard.',
} as const

/** A share as the percent the text shows. The verdict is judged on this same figure. */
function percentOf(fraction: number): number {
  return Math.round(fraction * 100)
}

/** Whether a best effort was hard: its share, as shown, reaches the 90% line, so "90%" is always hard. */
function isHard(fraction: number): boolean {
  return percentOf(fraction) >= Math.round(ALL_OUT * 100)
}

/**
 * Where the reference heart rate is named, its one gloss, in words that hold for both sports: cycling's is
 * derived from running's, so "your highest heart rate" would be wrong for a ride.
 */
const REFERENCE_SOURCE = 'set from your highest heart rates on file'

/** A best effort's heart rate as a share of its sport's reference, in words, without its ending. */
function reachedText(sport: Sport, duration: string, fraction: number): string {
  return REACHED[sport](duration, percentOf(fraction))
}

const REACHED: Record<Sport, (duration: string, share: number) => string> = {
  run: (duration, share) =>
    `Your best ${duration} running reached ${share}% of your running reference heart rate (${REFERENCE_SOURCE})`,
  ride: (duration, share) =>
    `Your best ${duration} on the bike reached ${share}% of your cycling reference heart rate (${REFERENCE_SOURCE})`,
}

/** Why the best efforts may not have been the hardest, or null when heart rate does not say so. */
export function effortCaveat(effort: EffortCheck | null | undefined): EffortCaveat | null {
  if (!effort) return null
  const { durationS, runHrFraction: run, rideHrFraction: ride } = effort
  const duration = formatDuration(durationS)
  if (run !== null && !isHard(run) && ride !== null && !isHard(ride)) {
    return {
      title: 'Neither best effort reached a hard heart rate',
      text:
        `Your best ${duration} reached ${percentOf(run)}% of your running reference heart rate ` +
        `and ${percentOf(ride)}% of your cycling one (both ${REFERENCE_SOURCE}). ` +
        `A hard ${duration} effort in each sport would raise these.`,
      short: `Best efforts over ${duration} did not reach a hard heart rate.`,
    }
  }
  if (ride !== null && !isHard(ride)) {
    return {
      title: 'Your best ride did not reach a hard heart rate',
      text: `${reachedText('ride', duration, ride)}${VERDICT.notHard(duration)}`,
      short: `Best cycling effort over ${duration} did not reach a hard heart rate.`,
    }
  }
  if (run !== null && !isHard(run)) {
    return {
      title: 'Your best run did not reach a hard heart rate',
      text: `${reachedText('run', duration, run)}${VERDICT.notHard(duration)}`,
      short: `Best running effort over ${duration} did not reach a hard heart rate.`,
    }
  }
  return null
}

/**
 * One line on a sport's best effort at the headline duration, by heart rate, such as "Your best 20 min
 * running reached 70% of your running reference heart rate (set from your highest heart rates on file).
 * A hard 20 min effort would raise this". Null when heart rate does not say, or the check is missing.
 */
export function effortShareLine(
  sport: Sport,
  effort: EffortCheck | null | undefined,
): string | null {
  if (!effort) return null
  const fraction = { run: effort.runHrFraction, ride: effort.rideHrFraction }[sport]
  if (fraction === null) return null
  const verdict = isHard(fraction) ? VERDICT.hard : VERDICT.notHard(HEADLINE_LABEL)
  return `${reachedText(sport, HEADLINE_LABEL, fraction)}${verdict}`
}

/** True when heart rate shows both best efforts were hard: 90% of each reference, as the percent shows. */
export function hardEffortsOnFile(effort: EffortCheck | null | undefined): boolean {
  return (
    effort !== null &&
    effort !== undefined &&
    effort.runHrFraction !== null &&
    effort.rideHrFraction !== null &&
    isHard(effort.runHrFraction) &&
    isHard(effort.rideHrFraction)
  )
}
