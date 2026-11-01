import { isHardShare } from '@rca/core/effort'
import type { ReferenceReading, ReferenceSource } from '@rca/core/effort'
import type { EffortCheck, Sport } from '@rca/core/types'
import { formatDuration } from '@rca/core/units'
import {
  REFERENCE_ACTION,
  THIN_ACTION,
  THIN_WHY,
  borrowedText,
  referenceWords,
} from './effortWords'
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

/** The share from which an effort is said to be close to the top of what the athlete has shown: 95%. */
const CLOSE_SHARE = 0.95

/**
 * What follows a best effort's share, shared by the card's text and the sport page's line. Under the line it says so. At it, it says no more than the share shows: heart rate near the
 * athlete's highest is not proof of an all-out effort, and within 10% of it cannot tell a hard 20 minutes from an all-out one.
 */
function verdictAfter(fraction: number, duration: string, top: string): string {
  if (!isHardShare(fraction)) return `. That is under the 90% that marks a hard effort.`
  if (fraction >= CLOSE_SHARE) return `: close to your ${top}.`
  return `: within 10% of your ${top}. Heart rate cannot tell a hard ${duration} from an all-out one.`
}

/**
 * What the reference is named after: the activities give a highest heart rate, the athlete's entry a max, and the age only a
 * predicted max that people differ from by about 10 bpm either way, so a share of it never says "close to your max".
 */
const TOP: Record<ReferenceSource, string> = {
  data: 'highest heart rate',
  entered: 'max heart rate',
  age: 'age-predicted max (±10 bpm)',
}

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

/** Where a check's reference came from; absent reads as the activities. */
function sourceOf(effort: EffortCheck, sport: Sport): ReferenceSource {
  const source = { run: effort.runReferenceSource, ride: effort.rideReferenceSource }[sport]
  return source ?? 'data'
}

/** Where the reference heart rate is named, its one gloss, in words that hold for both sports. */
const SOURCE_TEXT: Record<ReferenceSource, string> = {
  data: 'set from your highest heart rates on file',
  entered: 'the max heart rate you entered',
  age: 'estimated from your age',
}

/**
 * Where a sport's reference heart rate comes from, as the parenthesis names it: the other sport's max when that sport set
 * it ("your running max less 6 bpm"), else the source of the figure.
 */
function sourceNote(effort: EffortCheck, sport: Sport): string {
  const supplier = { run: effort.runReferenceFrom, ride: effort.rideReferenceFrom }[sport]
  const source = sourceOf(effort, sport)
  return supplier !== undefined && source === 'data'
    ? borrowedText(sport, supplier)
    : SOURCE_TEXT[source]
}

/** The parenthesis of the two-reference line: "both set from your highest heart rates on file", or each said when they differ. */
function bothSources(effort: EffortCheck): string {
  const run = sourceNote(effort, 'run')
  const ride = sourceNote(effort, 'ride')
  return run === ride ? `both ${run}` : `running's ${run}; cycling's ${ride}`
}

/** A best effort's heart rate as a share of its sport's reference, in words, without its ending. */
function reachedText(sport: Sport, duration: string, fraction: number, source: string): string {
  return REACHED[sport](duration, percentOf(fraction), source)
}

const REACHED: Record<Sport, (duration: string, share: number, source: string) => string> = {
  run: (duration, share, source) =>
    `Your best ${duration} running reached ${share}% of your running reference heart rate (${source})`,
  ride: (duration, share, source) =>
    `Your best ${duration} on the bike reached ${share}% of your cycling reference heart rate (${source})`,
}

/** Why the best efforts may not have been the hardest, or null when heart rate does not say so. */
export function effortCaveat(effort: EffortCheck | null | undefined): EffortCaveat | null {
  if (!effort) return null
  const { durationS, runHrFraction: run, rideHrFraction: ride } = effort
  const duration = formatDuration(durationS)
  const fractions = { run, ride }
  const reads = SPORT_ORDER.filter((sport) => fractions[sport] !== null).map((sport) =>
    referenceOf(effort, sport),
  )
  if (reads.includes('thin')) {
    return {
      title: 'Effort not checked',
      text: `${THIN_WHY} ${THIN_ACTION}`,
      short: THIN_WHY,
    }
  }
  if (reads.some((read) => read !== 'trusted' && read !== null)) {
    return {
      title: 'Heart rate cannot show how hard your best efforts were',
      text:
        `The highest heart rates on file sit too near a typical day's, or too low or too high, to mark a hard effort, ` +
        `so a share of them cannot show a best ${duration} was hard. ${REFERENCE_ACTION}`,
      short: `Heart rate does not show the best efforts over ${duration} were hard.`,
    }
  }
  if (run !== null && !isHard(run) && ride !== null && !isHard(ride)) {
    return {
      title: 'Neither best effort reached a hard heart rate',
      text:
        `Your best ${duration} reached ${percentOf(run)}% of your running reference heart rate ` +
        `and ${percentOf(ride)}% of your cycling one (${bothSources(effort)}). ` +
        `Both are under the 90% that marks a hard effort.`,
      short: `Best efforts over ${duration} did not reach a hard heart rate.`,
    }
  }
  if (ride !== null && !isHard(ride)) {
    return {
      title: 'Your best ride did not reach a hard heart rate',
      text: `${reachedText('ride', duration, ride, sourceNote(effort, 'ride'))}${verdictAfter(ride, duration, TOP[sourceOf(effort, 'ride')])}`,
      short: `Best cycling effort over ${duration} did not reach a hard heart rate.`,
    }
  }
  if (run !== null && !isHard(run)) {
    return {
      title: 'Your best run did not reach a hard heart rate',
      text: `${reachedText('run', duration, run, sourceNote(effort, 'run'))}${verdictAfter(run, duration, TOP[sourceOf(effort, 'run')])}`,
      short: `Best running effort over ${duration} did not reach a hard heart rate.`,
    }
  }
  return null
}

/**
 * One line on a sport's best effort at the headline duration, by heart rate, such as "Your best 20 min
 * running reached 70% of your running reference heart rate (set from your highest heart rates on file).
 * That is under the 90% that marks a hard effort", with whether the effort was hard and the share as the whole percent the line shows, which a sport
 * page's chip says beside its label.
 */
export function effortShare(
  sport: Sport,
  effort: EffortCheck | null | undefined,
): { line: string; hard: boolean; percent: number; confirmed: boolean; checked: boolean } | null {
  if (!effort) return null
  const fraction = { run: effort.runHrFraction, ride: effort.rideHrFraction }[sport]
  if (fraction === null) return null
  const reading = referenceOf(effort, sport)
  const duration = formatDuration(effort.durationS)
  if (reading === 'thin') {
    return {
      line: `${THIN_WHY} ${THIN_ACTION}`,
      hard: false,
      percent: percentOf(fraction),
      confirmed: false,
      checked: false,
    }
  }
  if (reading !== null && reading !== 'trusted') {
    const noun = SPORT_NOUN[sport]
    const { why, action } = referenceWords(reading, { noun, supplier: noun, bpm: null })
    return {
      line: `${why.charAt(0).toUpperCase()}${why.slice(1)}, so a share of it cannot show your best ${duration} was hard. ${action}`,
      hard: false,
      percent: percentOf(fraction),
      confirmed: false,
      checked: true,
    }
  }
  const source = sourceOf(effort, sport)
  const hard = isHard(fraction)
  return {
    line: `${reachedText(sport, duration, fraction, sourceNote(effort, sport))}${verdictAfter(fraction, duration, TOP[source])}`,
    hard,
    percent: percentOf(fraction),
    confirmed: true,
    checked: true,
  }
}

/** True when heart rate shows both best efforts were hard: 90% of each reference, as the percent shows. */
export function hardEffortsOnFile(effort: EffortCheck | null | undefined): boolean {
  return effortShare('run', effort)?.hard === true && effortShare('ride', effort)?.hard === true
}

/** What a sport's best effort says of its effort as a chip: how hard, by heart rate, with the share and the full reading. */
export interface EffortChipText {
  hard: boolean
  /** "Not all-out" or "Hard effort · 95%": the share of the sport's reference heart rate shows only on a hard effort. */
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
  if (!share.checked) return { hard: false, label: 'Effort not checked', detail: share.line }
  if (!share.confirmed) return { hard: false, label: 'Effort not confirmed', detail: share.line }
  return {
    hard: share.hard,
    label: share.hard ? `Hard effort · ${share.percent}%` : 'Not all-out',
    detail: share.line,
  }
}
