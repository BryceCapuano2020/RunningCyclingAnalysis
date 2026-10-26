import { ALL_OUT_FRACTION as ALL_OUT } from '@rca/core/effort'
import type { EffortCheck, Sport } from '@rca/core/types'
import { formatDuration } from '@rca/core/units'

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

/** A best effort's heart rate as a share of its sport's reference, in words, without its ending. */
function reachedText(sport: Sport, duration: string, fraction: number): string {
  const share = Math.round(fraction * 100)
  return sport === 'run'
    ? `Your best ${duration} running reached ${share}% of your running reference heart rate`
    : `Your best ${duration} on the bike reached ${share}% of your cycling reference heart rate`
}

/** Why the best efforts may not have been the hardest, or null when heart rate does not say so. */
export function effortCaveat(effort: EffortCheck | null | undefined): EffortCaveat | null {
  if (!effort) return null
  const { durationS, runHrFraction: run, rideHrFraction: ride } = effort
  const duration = formatDuration(durationS)
  if (run !== null && run < ALL_OUT && ride !== null && ride < ALL_OUT) {
    return {
      title: 'Both numbers could be higher',
      text:
        `Your best ${duration} reached ${Math.round(run * 100)}% of your running reference heart rate ` +
        `and ${Math.round(ride * 100)}% of your cycling one, so neither was probably your hardest.`,
      short: `Best efforts over ${duration} may not have been your hardest.`,
    }
  }
  if (ride !== null && ride < ALL_OUT) {
    return {
      title: 'Your ride number could be higher',
      text: `${reachedText('ride', duration, ride)}, so it was probably not your hardest.`,
      short: `Best cycling effort over ${duration} may not have been your hardest.`,
    }
  }
  if (run !== null && run < ALL_OUT) {
    return {
      title: 'Your run number could be higher',
      text: `${reachedText('run', duration, run)}, so it was probably not your hardest.`,
      short: `Best running effort over ${duration} may not have been your hardest.`,
    }
  }
  return null
}

/**
 * One line on a sport's best effort by heart rate, such as "Your best 20 min running reached 70% of your
 * running reference heart rate, so it was probably not your hardest". Below 90% it is not the hardest;
 * at 90% or more it was hard. Null when heart rate does not say, or the check is missing.
 */
export function effortShareLine(
  sport: Sport,
  effort: EffortCheck | null | undefined,
): string | null {
  if (!effort) return null
  const fraction = sport === 'run' ? effort.runHrFraction : effort.rideHrFraction
  if (fraction === null) return null
  const verdict = fraction < ALL_OUT ? 'so it was probably not your hardest' : 'so it was hard'
  return `${reachedText(sport, formatDuration(effort.durationS), fraction)}, ${verdict}.`
}

/** True when heart rate shows both best efforts were hard: at least 90% of each reference. */
export function hardEffortsOnFile(effort: EffortCheck | null | undefined): boolean {
  return (
    effort !== null &&
    effort !== undefined &&
    effort.runHrFraction !== null &&
    effort.rideHrFraction !== null &&
    effort.runHrFraction >= ALL_OUT &&
    effort.rideHrFraction >= ALL_OUT
  )
}
