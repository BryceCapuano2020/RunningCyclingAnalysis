import { ALL_OUT_FRACTION as ALL_OUT } from '@rca/core/effort'
import type { EffortCheck, Sport } from '@rca/core/types'
import { formatDuration } from '@rca/core/units'
import { HEADLINE_LABEL } from './grades'

/*
 * Why a best effort may not have been the hardest, from its heart rate. A domain rule rather than copy,
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

/** The two verdicts on a best effort's share, shared by the card's text and the sport page's line. */
const VERDICT = {
  notHardest: 'so it was probably not your hardest',
  hard: 'so it was hard',
} as const

/** A share as the percent the text shows. The verdict is judged on this same figure. */
function percentOf(fraction: number): number {
  return Math.round(fraction * 100)
}

/** Whether a best effort was hard: its share, as shown, reaches the 90% line, so "90%" is always hard. */
function isHard(fraction: number): boolean {
  return percentOf(fraction) >= Math.round(ALL_OUT * 100)
}

/** A best effort's heart rate as a share of its sport's reference, in words, without its ending. */
function reachedText(sport: Sport, duration: string, fraction: number): string {
  const share = percentOf(fraction)
  return sport === 'run'
    ? `Your best ${duration} running reached ${share}% of your running reference heart rate`
    : `Your best ${duration} on the bike reached ${share}% of your cycling reference heart rate`
}

/** Why the best efforts may not have been the hardest, or null when heart rate does not say so. */
export function effortCaveat(effort: EffortCheck | null | undefined): EffortCaveat | null {
  if (!effort) return null
  const { durationS, runHrFraction: run, rideHrFraction: ride } = effort
  const duration = formatDuration(durationS)
  if (run !== null && !isHard(run) && ride !== null && !isHard(ride)) {
    return {
      title: 'Both numbers could be higher',
      text:
        `Your best ${duration} reached ${percentOf(run)}% of your running reference heart rate ` +
        `and ${percentOf(ride)}% of your cycling one, so neither was probably your hardest.`,
      short: `Best efforts over ${duration} may not have been your hardest.`,
    }
  }
  if (ride !== null && !isHard(ride)) {
    return {
      title: 'Your ride number could be higher',
      text: `${reachedText('ride', duration, ride)}, ${VERDICT.notHardest}.`,
      short: `Best cycling effort over ${duration} may not have been your hardest.`,
    }
  }
  if (run !== null && !isHard(run)) {
    return {
      title: 'Your run number could be higher',
      text: `${reachedText('run', duration, run)}, ${VERDICT.notHardest}.`,
      short: `Best running effort over ${duration} may not have been your hardest.`,
    }
  }
  return null
}

/**
 * One line on a sport's best effort at the headline duration, by heart rate, such as "Your best 20 min
 * running reached 70% of your running reference heart rate, so it was probably not your hardest". Null
 * when heart rate does not say, or the check is missing.
 */
export function effortShareLine(
  sport: Sport,
  effort: EffortCheck | null | undefined,
): string | null {
  if (!effort) return null
  const fraction = sport === 'run' ? effort.runHrFraction : effort.rideHrFraction
  if (fraction === null) return null
  const verdict = isHard(fraction) ? VERDICT.hard : VERDICT.notHardest
  return `${reachedText(sport, HEADLINE_LABEL, fraction)}, ${verdict}.`
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
