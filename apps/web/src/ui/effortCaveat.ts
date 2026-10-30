import { isHardShare } from '@rca/core/effort'
import type { ReferenceReading } from '@rca/core/effort'
import type { EffortCheck, Sport } from '@rca/core/types'
import { formatDuration } from '@rca/core/units'
import { HEADLINE_LABEL } from './grades'
import { SPORT_NOUN, SPORT_ORDER } from './sports'

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

/**
 * Whether a best effort was hard: its share, as shown, reaches the 90% line, so "90%" is always hard. The line is
 * the core effort gate's (`isHardShare`), so the chip, the gate and the Method page judge alike.
 */
function isHard(fraction: number): boolean {
  return isHardShare(fraction)
}

/** What a sport's reference can certify in a check; absent reads as trusted, as for a check made without a reading. */
function referenceOf(effort: EffortCheck, sport: Sport): ReferenceReading | null {
  const reading = { run: effort.runReference, ride: effort.rideReference }[sport]
  return reading === undefined ? 'trusted' : reading
}

/**
 * Why a share of a reference that cannot be a maximum shows nothing, in words that follow "so a share of it cannot
 * show your best 20 min was hard": the reference is too low to be a maximum, or sits where a typical day does.
 */
const UNCONFIRMED_WHY: Record<Exclude<ReferenceReading, 'trusted'>, (noun: string) => string> = {
  low: (noun) => `The highest heart rate on file for your ${noun} is too low to be a maximum`,
  habitual: (noun) => `Your ${noun} heart rate on file never rises far above a typical day's`,
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
  const fractions = { run, ride }
  const unconfirmed = SPORT_ORDER.some(
    (sport) => fractions[sport] !== null && referenceOf(effort, sport) !== 'trusted',
  )
  if (unconfirmed) {
    return {
      title: 'Heart rate cannot show how hard your best efforts were',
      text:
        `The highest heart rates on file sit too near a typical day's, or too low, to mark a hard effort, ` +
        `so a share of them cannot show a best ${duration} was hard. A hard ${duration} effort would settle it.`,
      short: `Heart rate does not show the best efforts over ${duration} were hard.`,
    }
  }
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
 * A hard 20 min effort would raise this", with whether the effort was hard and the share as the whole percent the line shows, which a sport
 * page's chip says beside its label.
 */
export function effortShare(
  sport: Sport,
  effort: EffortCheck | null | undefined,
): { line: string; hard: boolean; percent: number; confirmed: boolean } | null {
  if (!effort) return null
  const fraction = { run: effort.runHrFraction, ride: effort.rideHrFraction }[sport]
  if (fraction === null) return null
  const reading = referenceOf(effort, sport)
  if (reading !== null && reading !== 'trusted') {
    const why = UNCONFIRMED_WHY[reading](SPORT_NOUN[sport])
    return {
      line: `${why}, so a share of it cannot show your best ${HEADLINE_LABEL} was hard. A hard ${HEADLINE_LABEL} effort would settle it.`,
      hard: false,
      percent: percentOf(fraction),
      confirmed: false,
    }
  }
  const hard = isHard(fraction)
  const verdict = hard ? VERDICT.hard : VERDICT.notHard(HEADLINE_LABEL)
  return {
    line: `${reachedText(sport, HEADLINE_LABEL, fraction)}${verdict}`,
    hard,
    percent: percentOf(fraction),
    confirmed: true,
  }
}

/** True when heart rate shows both best efforts were hard: 90% of each reference, as the percent shows. */
export function hardEffortsOnFile(effort: EffortCheck | null | undefined): boolean {
  return effortShare('run', effort)?.hard === true && effortShare('ride', effort)?.hard === true
}

/**
 * Whether a sport's best effort at the headline duration was hard by heart rate, by the same 90% line the
 * caveats use: true or false, or null where heart rate does not say, as without a heart-rate stream. A share of a
 * reference that cannot certify a maximum is false: the effort is not shown hard.
 */
export function hardEffort(sport: Sport, effort: EffortCheck | null | undefined): boolean | null {
  return effortShare(sport, effort)?.hard ?? null
}

/** What a sport's best effort says of its effort as a chip: how hard, by heart rate, with the share and the full reading. */
export interface EffortChipText {
  hard: boolean
  /** "Not a hard effort · 70%" or "Hard effort · 95%": the share of the sport's reference heart rate, as the line shows it. */
  label: string
  /** The whole reading, which a definition opens: the share, what it is a share of, and what would change it. */
  detail: string
}

/**
 * The chip for a sport's best effort at the headline duration, or null where heart rate does not say. Balance's
 * tiles and the sport pages' threshold panels both say the check with it, so the two read the same.
 */
export function effortChipText(
  sport: Sport,
  effort: EffortCheck | null | undefined,
): EffortChipText | null {
  const share = effortShare(sport, effort)
  if (share === null) return null
  if (!share.confirmed) {
    return { hard: false, label: 'Effort not confirmed', detail: share.line }
  }
  return {
    hard: share.hard,
    label: `${share.hard ? 'Hard effort' : 'Not a hard effort'} · ${share.percent}%`,
    detail: share.line,
  }
}
