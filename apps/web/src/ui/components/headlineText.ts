import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { RIDE_MAX_OFFSET_BPM } from '@rca/core/effort'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Comparison, ComparisonPoint, Sport } from '@rca/core/types'
import { formatDuration, formatPercent } from '@rca/core/units'
import type { Lean } from '../../domain/lean'
import { plural } from './plural'
import { effortLabel } from '../records'
import { SPORT_LABEL, SPORT_NOUN, SPORT_TITLE } from '../sports'
import { energyReading, type BalanceReading } from './balanceScale'

/** The title when both sports are on file but no efforts of the same length can be compared yet. */
export const HARDER_EFFORTS_TITLE = 'Not enough to compare yet'

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

/** A no-break space, so a number and its unit never part across a line. */
const NO_BREAK = '\u00a0'

/** A count of points with its unit held to it: "6\u00a0points". */
function pointsUnit(count: number): string {
  return plural(count, 'point').replace(' ', NO_BREAK)
}

/**
 * A percent edge of a range, in words. An edge that rounds to 0 shows one decimal, so the range
 * reads as a value, not as a zero.
 */
export function percentEdge(percent: number, signed: boolean): string {
  if (percent === 0 || Math.round(percent) !== 0) return formatPercent(percent / 100, signed)
  // Below a twentieth of a percent, one decimal would print 0.0, so the edge says it is under a tenth.
  if (Math.abs(percent) < 0.05) return 'under 0.1%'
  const plus = signed && percent > 0 ? '+' : ''
  return `${plus}${percent.toFixed(1)}%`
}

/** A signed count with a true minus sign, so an even range reads both ways: "−2", "+10". */
export function signedCount(count: number): string {
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
    if (lean === 'even') {
      return `${signedCount(lead.low)} to ${signedCount(lead.high)}${NO_BREAK}points`
    }
    const [low, high] = lean === 'ride' ? [-lead.high, -lead.low] : [lead.low, lead.high]
    return `${Math.round(low)} to ${pointsUnit(Math.round(high))}`
  }
  if (lean === 'even') {
    return `${percentEdge(lead.low, true)} to ${percentEdge(lead.high, true)}`
  }
  const [low, high] = lean === 'ride' ? [-lead.high, -lead.low] : [lead.low, lead.high]
  return `${percentEdge(low, false)} to ${percentEdge(high, false)}`
}

/** Whether a lead's range rounds to a single value, so the lead is said as that one value. */
function isPoint(reading: BalanceReading): boolean {
  return Math.round(reading.lead.low) === Math.round(reading.lead.high)
}

/**
 * A leaning grade gap on the headline duration, said as its likely range so it is never read as one
 * exact number: "Your running grades 2 to 10 points higher than your cycling, on your best 20 min in
 * each.". The meter's flag gives the best estimate.
 */
function leaningGradeSummary(reading: BalanceReading & { lean: Exclude<Lean, 'even'> }): string {
  const { leader, other } = leaderOf(reading.lean)
  const amount = isPoint(reading)
    ? points(Math.abs(Math.round(reading.lead.centre)))
    : rangeText(reading)
  return (
    `Your ${leader} grades ${amount} higher than your ${other}, ` +
    `on your best ${formatDuration(HEADLINE_DURATION_S).replace(' ', NO_BREAK)} in each.`
  )
}

/**
 * A balance whose range spans zero. The title already says the two are in balance, so the line gives what
 * the age grades say: the best estimate and the range around it, on the headline duration, and why that
 * is level. The range is read from the leading sport's side, and says so ("for that lead"), so its signs
 * agree with the sentence: a cycling lead of 4 points has a range of −2 to +10 points for cycling, not −10 to
 * +2 for running. A level estimate with a lopsided range names its side.
 */
function inBalanceSummary(reading: BalanceReading): string {
  const centre = Math.round(reading.lead.centre)
  const duration = formatDuration(HEADLINE_DURATION_S).replace(' ', NO_BREAK)
  const on = `On your best ${duration} in each,`
  const level = 'so the two are level.'
  if (centre === 0) {
    // A range that is not symmetric about zero has a side, so it names the one it is read from.
    const lopsided = Math.round(reading.lead.low) !== -Math.round(reading.lead.high)
    const side = lopsided ? ' (running minus cycling)' : ''
    return `${on} running and cycling have the same age grade, within ${rangeText(reading)}${side}, ${level}`
  }
  const { leader, other } = leaderOf(centre > 0 ? 'run' : 'ride')
  const { low, high } = reading.lead
  const [from, to] = centre > 0 ? [low, high] : [-high, -low]
  const range = `${signedCount(from)} to ${signedCount(to)}${NO_BREAK}points`
  return `${on} ${leader}’s age grade is ${points(Math.abs(centre))} higher than ${other}’s, with a range of ${range} for that lead, ${level}`
}

/** The energy ratio, as the balance is before the grades: how far one sport is higher, in percent. */
function energySummary({ unit, lean, lead }: BalanceReading, duration: string): string {
  if (lean === 'even') {
    return `Over ${duration}, your running and your cycling are within the model's range of each other, as energy per kilogram.`
  }
  const { leader, other } = leaderOf(lean)
  // The edge's rule, so a lead under half a percent reads as its value, never as 0%.
  const amount = isPoint({ unit, lean, lead })
    ? `about ${percentEdge(Math.abs(lead.centre), false)}`
    : rangeText({ unit, lean, lead })
  return `Over ${duration}, your ${leader} is ${amount} higher than your ${other}, as energy per kilogram.`
}

/** The summary under the headline. A grade gap is on the headline duration; the energy ratio on the duration given. */
export function balanceSummary(reading: BalanceReading, durationS: number): string {
  if (reading.unit === 'percent') return energySummary(reading, effortLabel(durationS))
  if (reading.lean === 'even') return inBalanceSummary(reading)
  return leaningGradeSummary({ ...reading, lean: reading.lean })
}

/**
 * The 90% range of the energy ratio, as the Method page quotes it. It names the sport that leads and
 * gives the same figures as the Balance sentence and its meter: "Ride against Run, 90% range:
 * 11% to 33%." Even balances keep running first, with signed figures.
 */
export function headlineText(point: ComparisonPoint): { range: string } {
  const reading = energyReading(point.ratio)
  const leading: Sport = reading.lean === 'ride' ? 'ride' : 'run'
  const other: Sport = leading === 'run' ? 'ride' : 'run'
  return {
    range: `${SPORT_LABEL[leading]} against ${SPORT_LABEL[other]}, 90% range: ${rangeText(reading)}.`,
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

/**
 * The reference heart rate in one sentence, as the heart-rate check derives it: running's is the higher
 * of the two sports' maxima, and cycling's is the higher of its own and the running reference less
 * RIDE_MAX_OFFSET_BPM, so cycling is never judged against an artificially low maximum.
 */
export function referenceDefinition(): string {
  return `Your reference heart rate is set from your highest sustained heart rates: running’s is the higher of your running and cycling maxima, and cycling’s is the higher of its own and ${RIDE_MAX_OFFSET_BPM} bpm below running’s.`
}

/**
 * The heart rate each sport's best efforts were judged against; null when neither is known. A
 * sport's own highest sustained heart rate is stated bare; a reference taken from the other sport is
 * labelled with that source.
 */
export function referenceText(result: AnalysisResult): string | null {
  const parts: string[] = []
  const { runMaxHeartRate: run, rideMaxHeartRate: ride } = result
  if (run !== null) {
    const own = run === result.runObservedMaxHeartRate
    parts.push(
      own
        ? `running ${Math.round(run)} bpm`
        : `running ${Math.round(run)} bpm (your cycling maximum)`,
    )
  }
  if (ride !== null) {
    const own = ride === result.rideObservedMaxHeartRate
    parts.push(
      own
        ? `cycling ${Math.round(ride)} bpm`
        : `cycling ${Math.round(ride)} bpm (${RIDE_MAX_OFFSET_BPM} bpm below your running maximum)`,
    )
  }
  return parts.length === 0 ? null : `Best efforts are judged against ${parts.join('; ')}.`
}

/**
 * The lead of a balance that leans, in one line: the leading sport and by how much, in points of
 * grade or percent of energy. The page's sentence and the share card both state the lead with this.
 */
function leadingSentence({
  unit,
  lean,
  lead,
}: BalanceReading & { lean: Exclude<Lean, 'even'> }): string {
  if (unit === 'points') {
    const { other } = leaderOf(lean)
    return `${SPORT_TITLE[lean]} grades ${points(Math.abs(Math.round(lead.centre)))} higher than ${other}`
  }
  // The edge's rule, so a lead under half a percent reads as its value, never as 0%.
  const percent = percentEdge(Math.abs(lead.centre), false)
  return `${SPORT_TITLE[lean]} ${percent} higher, as energy per kilogram`
}

/** The lead in one line, or null for an even balance, which the headline already says. */
export function leadSentence(reading: BalanceReading): string | null {
  const { lean } = reading
  if (lean === 'even') return null
  return leadingSentence({ ...reading, lean })
}

/**
 * How the balance reads, in words, for assistive technology and the meter's caption: the leading
 * sport, its lead and its range. An even grade gap names the best estimate and its range.
 */
export function balanceSentence(reading: BalanceReading): string {
  const { unit, lean, lead } = reading
  if (lean === 'even') {
    if (unit === 'points') {
      return `In balance: best estimate running ${signedCount(lead.centre)} points against cycling, range ${rangeText(reading)}`
    }
    return `Even within the model's range (running against cycling ${rangeText(reading)})`
  }
  return `${leadingSentence({ ...reading, lean })} (range ${rangeText(reading)})`
}
