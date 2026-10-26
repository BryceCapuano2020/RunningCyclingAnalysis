import { ALL_OUT_FRACTION as ALL_OUT } from '@rca/core/effort'
import type { EffortCheck } from '@rca/core/types'
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
      text:
        `Your best ${duration} on the bike reached ${Math.round(ride * 100)}% of your cycling reference heart rate, ` +
        'so it was probably not your hardest.',
      short: `Best cycling effort over ${duration} may not have been your hardest.`,
    }
  }
  if (run !== null && run < ALL_OUT) {
    return {
      title: 'Your run number could be higher',
      text:
        `Your best ${duration} running reached ${Math.round(run * 100)}% of your running reference heart rate, ` +
        'so it was probably not your hardest.',
      short: `Best running effort over ${duration} may not have been your hardest.`,
    }
  }
  return null
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
