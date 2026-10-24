import { ALL_OUT_FRACTION as ALL_OUT, RIDE_MAX_OFFSET_BPM } from '@rca/core/effort'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Comparison, ComparisonPoint, EffortCheck, Interval } from '@rca/core/types'
import { formatDuration, formatPercent } from '@rca/core/units'

export interface HeadlineText {
  /** The answer, in an athlete's words: which way your balance between the sports leans. */
  title: string
  /** How far apart the two sports are over the duration. */
  summary: string
  /** The 90% model range as signed percentages. */
  range: string
}

/** What the comparison is and is not, on the results page and on the share card. */
export const COMPARISON_DISCLAIMER =
  'Both sports are put on one energy scale from your own files. It compares your two sports; it does not rank you.'

/** The title when both sports are on file but no efforts of the same length can be compared yet. */
export const HARDER_EFFORTS_TITLE = 'Your balance needs harder efforts'

/** Which way the balance leans: a sport is ahead only when the whole 90% range says so. */
export type Lean = 'run' | 'ride' | 'even'

export function leanOf(ratio: Interval): Lean {
  if (ratio.p05 > 1) return 'run'
  if (ratio.p95 < 1) return 'ride'
  return 'even'
}

const TITLE: Record<Lean, string> = {
  run: 'Your balance leans toward running',
  ride: 'Your balance leans toward cycling',
  even: 'Your running and cycling are in balance',
}

/**
 * How far the leading sport is ahead of the other, as a fraction of it: the centre of the range.
 * Running over cycling is the ratio; cycling over running is its inverse.
 */
export function leadOf(ratio: Interval, lean: Exclude<Lean, 'even'>): number {
  return (lean === 'run' ? ratio.p50 : 1 / ratio.p50) - 1
}

/**
 * How far the leading sport is ahead, with its range, both as positive percentages of the other
 * sport. Cycling over running is the inverse, so its range runs from 1 / p95 to 1 / p05.
 */
function aheadBy(ratio: Interval, lean: Exclude<Lean, 'even'>): { centre: string; range: string } {
  const [low, high] = lean === 'run' ? [ratio.p05, ratio.p95] : [1 / ratio.p95, 1 / ratio.p05]
  return {
    centre: formatPercent(leadOf(ratio, lean)),
    range: `${formatPercent(low - 1)} to ${formatPercent(high - 1)}`,
  }
}

function summaryFor(ratio: Interval, duration: string): string {
  const lean = leanOf(ratio)
  if (lean === 'even') {
    return `Over ${duration}, the gap between your running and your cycling is smaller than the model can tell apart.`
  }
  const [ahead, behind] = lean === 'run' ? ['running', 'cycling'] : ['cycling', 'running']
  return `Over ${duration}, your ${ahead} is about ${aheadBy(ratio, lean).centre} ahead of your ${behind} once both are put on the same energy scale.`
}

/** The headline sentences for one comparison point. The results page and the share card both read them. */
export function headlineText(point: ComparisonPoint): HeadlineText {
  const duration = formatDuration(point.durationS)
  return {
    title: TITLE[leanOf(point.ratio)],
    summary: summaryFor(point.ratio, duration),
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

/** How far ahead one sport is, in words, for assistive technology and the caption. */
export function balanceSentence(ratio: Interval): string {
  const lean = leanOf(ratio)
  if (lean === 'even') {
    const range = `${formatPercent(ratio.p05 - 1, true)} to ${formatPercent(ratio.p95 - 1, true)}`
    return `Even within the model's range (running against cycling ${range})`
  }
  const { centre, range } = aheadBy(ratio, lean)
  return `${lean === 'run' ? 'Running' : 'Cycling'} ahead by ${centre} (range ${range})`
}
