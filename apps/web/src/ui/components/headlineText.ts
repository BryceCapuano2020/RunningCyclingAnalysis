import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { ALL_OUT_FRACTION as ALL_OUT, RIDE_MAX_OFFSET_BPM } from '@rca/core/effort'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Comparison, ComparisonPoint, EffortCheck } from '@rca/core/types'
import { formatDuration, formatPercent } from '@rca/core/units'
import type { Lean } from '../balanceGap'
import { plural } from './plural'
import { SPORT_NOUN, SPORT_TITLE } from '../sports'
import type { BalanceReading } from './balanceScale'

/** What the comparison is and is not, on the results page and on the share card. */
export const COMPARISON_DISCLAIMER =
  'Both sports are put on one energy scale from your own files. It compares your two sports; it does not rank you.'

/** The title when both sports are on file but no efforts of the same length can be compared yet. */
export const HARDER_EFFORTS_TITLE = 'Your balance needs harder efforts'

const TITLE: Record<Lean, string> = {
  run: 'Your balance leans toward running',
  ride: 'Your balance leans toward cycling',
  even: 'Your running and cycling are in balance',
}

/** The headline on the Balance page and the share card: which way the balance leans, or that it is even. */
export function balanceTitle(reading: BalanceReading): string {
  return TITLE[reading.lean]
}

/** A count of points in words: "1 point", "6 points". */
function points(count: number): string {
  return plural(count, 'point')
}

/** A signed count with a true minus sign, so an even range reads both ways: "−2", "+10". */
function signedCount(count: number): string {
  const rounded = Math.round(count)
  if (rounded < 0) return `−${-rounded}`
  return rounded > 0 ? `+${rounded}` : '0'
}

/** The sport that leads and the one it leads, as the nouns a sentence uses. */
function leaderOf(lean: Exclude<Lean, 'even'>): { leader: string; other: string } {
  return lean === 'run'
    ? { leader: SPORT_NOUN.run, other: SPORT_NOUN.ride }
    : { leader: SPORT_NOUN.ride, other: SPORT_NOUN.run }
}

/**
 * The range of a balance, in words. A lean gives its size from the leading sport, so both ends are
 * positive; an even balance is signed, running against cycling.
 */
export function rangeText({ unit, lean, lead }: BalanceReading): string {
  if (unit === 'points') {
    if (lean === 'even') return `${signedCount(lead.low)} to ${signedCount(lead.high)} points`
    const [low, high] = lean === 'ride' ? [-lead.high, -lead.low] : [lead.low, lead.high]
    return `${Math.round(low)} to ${plural(Math.round(high), 'point')}`
  }
  if (lean === 'even') {
    return `${formatPercent(lead.low / 100, true)} to ${formatPercent(lead.high / 100, true)}`
  }
  const [low, high] = lean === 'ride' ? [-lead.high, -lead.low] : [lead.low, lead.high]
  return `${formatPercent(low / 100)} to ${formatPercent(high / 100)}`
}

/** A leaning grade gap on the headline duration: "Your running grades 6 points higher than your cycling, ...". */
function leaningGradeSummary(lean: Exclude<Lean, 'even'>, centre: number): string {
  const { leader, other } = leaderOf(lean)
  return (
    `Your ${leader} grades ${points(Math.abs(Math.round(centre)))} higher than your ${other}, ` +
    `on your best ${HEADLINE_DURATION_S / 60} minutes in each.`
  )
}

/**
 * A balance in range zero: the best estimate names the leading sport, and the range that includes
 * zero says why the two are in balance.
 */
function inBalanceSummary(reading: BalanceReading): string {
  const range = rangeText(reading)
  const centre = Math.round(reading.lead.centre)
  if (centre === 0) {
    return `On the age-grade best estimate, running and cycling grade the same, and the range (${range}) includes zero, so the two are in balance.`
  }
  const { leader } = leaderOf(centre > 0 ? 'run' : 'ride')
  return `On the age-grade best estimate, ${leader} grades ${points(Math.abs(centre))} higher, but the range (${range}) includes zero, so the two are in balance.`
}

/** The energy ratio, as the balance is before the grades: how far one sport is higher, in percent. */
function energySummary({ lean, lead }: BalanceReading, duration: string): string {
  if (lean === 'even') {
    return `Over ${duration}, your running and your cycling are within the model's range of each other, once both are put on the same energy scale.`
  }
  const { leader, other } = leaderOf(lean)
  const percent = formatPercent(Math.abs(lead.centre) / 100)
  return `Over ${duration}, your ${leader} is about ${percent} higher than your ${other} once both are put on the same energy scale.`
}

/** The summary under the headline. A grade gap is on the headline duration; the energy ratio on the duration given. */
export function balanceSummary(reading: BalanceReading, durationS: number): string {
  if (reading.unit === 'percent') return energySummary(reading, formatDuration(durationS))
  if (reading.lean === 'even') return inBalanceSummary(reading)
  return leaningGradeSummary(reading.lean, reading.lead.centre)
}

/** The 90% model range of the energy ratio, running against cycling, as the Method page quotes it. */
export function headlineText(point: ComparisonPoint): { range: string } {
  return {
    range:
      `Running against cycling, 90% model range: ${formatPercent(point.ratio.p05 - 1, true)} to ` +
      `${formatPercent(point.ratio.p95 - 1, true)}.`,
  }
}

/** How the range was set: a rejected heart-rate check, an adjusted range, or population assumptions. */
export function headlineBasis(comparison: Comparison, calibrated: boolean): string {
  if (comparison.calibration?.accepted === false) {
    return 'The heart-rate check could not support a reliable adjustment; showing the population-based model range.'
  }
  return calibrated
    ? 'Model range adjusted using your heart-rate data.'
    : 'Model range based on population assumptions.'
}

export interface EffortCaveat {
  /** The evidence-gap card's title. */
  title: string
  /** What the gap is and what would close it. */
  text: string
  /** One line for the share card. */
  short: string
}

/** Why the best efforts may not have been all-out, or null when heart rate does not say so. */
export function effortCaveat(effort: EffortCheck | null | undefined): EffortCaveat | null {
  if (!effort) return null
  const { durationS, runHrFraction: run, rideHrFraction: ride } = effort
  const duration = formatDuration(durationS)
  if (run !== null && run < ALL_OUT && ride !== null && ride < ALL_OUT) {
    return {
      title: 'Both numbers may be low',
      text:
        `Your best ${duration} reached ${Math.round(run * 100)}% of your running heart-rate reference ` +
        `and ${Math.round(ride * 100)}% of your cycling one, so neither was probably all-out. ` +
        'A recent race or a hard effort of this length in each sport would sharpen both.',
      short: `Best efforts over ${duration} may not have been all-out.`,
    }
  }
  if (ride !== null && ride < ALL_OUT) {
    return {
      title: 'Your ride number may be low',
      text:
        `Your best ${duration} on the bike reached ${Math.round(ride * 100)}% of your cycling ` +
        'heart-rate reference, so it was probably not all-out. A recent race or a test of this length would sharpen it.',
      short: `Best cycling effort over ${duration} may not have been all-out.`,
    }
  }
  if (run !== null && run < ALL_OUT) {
    return {
      title: 'Your run number may be low',
      text:
        `Your best ${duration} running reached ${Math.round(run * 100)}% of your running ` +
        'heart-rate reference, so it was probably not all-out. A recent race or a test of this length would sharpen it.',
      short: `Best running effort over ${duration} may not have been all-out.`,
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

/**
 * The heart rate each sport's best efforts were judged against; null when neither is known. A
 * sport's own highest sustained heart rate is named as such; a reference taken from the other
 * sport is labelled with that source.
 */
export function referenceText(result: AnalysisResult): string | null {
  const parts: string[] = []
  const { runMaxHeartRate: run, rideMaxHeartRate: ride } = result
  if (run !== null) {
    const own = run === result.runObservedMaxHeartRate
    parts.push(
      own
        ? `running ${Math.round(run)} bpm (your highest sustained heart rate)`
        : `running ${Math.round(run)} bpm (your cycling maximum)`,
    )
  }
  if (ride !== null) {
    const own = ride === result.rideObservedMaxHeartRate
    parts.push(
      own
        ? `cycling ${Math.round(ride)} bpm (your highest sustained heart rate)`
        : `cycling ${Math.round(ride)} bpm (${RIDE_MAX_OFFSET_BPM} bpm below your running maximum)`,
    )
  }
  return parts.length === 0 ? null : `Best efforts are judged against ${parts.join('; ')}.`
}

/**
 * How the balance reads, in words, for assistive technology and the meter's caption: the leading
 * sport, its lead and its range. An even grade gap names the best estimate and its range.
 */
export function balanceSentence(reading: BalanceReading): string {
  const { unit, lean, lead } = reading
  if (unit === 'points') {
    if (lean === 'even') {
      return `In balance: best estimate running ${signedCount(lead.centre)} points against cycling, range ${rangeText(reading)}`
    }
    const { other } = leaderOf(lean)
    return `${SPORT_TITLE[lean]} grades ${points(Math.abs(Math.round(lead.centre)))} higher than ${other} (range ${rangeText(reading)})`
  }
  if (lean === 'even') {
    return `Even within the model's range (running against cycling ${rangeText(reading)})`
  }
  const percent = formatPercent(Math.abs(lead.centre) / 100)
  return `${SPORT_TITLE[lean]} ${percent} higher on the energy scale (range ${rangeText(reading)})`
}
