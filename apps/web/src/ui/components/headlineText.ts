import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { RIDE_MAX_OFFSET_BPM } from '@rca/core/effort'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Comparison, ComparisonPoint, Sport } from '@rca/core/types'
import { formatDuration, formatPercent } from '@rca/core/units'
import { wholeCentre, type Lean } from '../../domain/lean'
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

/** The sport a balance reads from: the one its best estimate favours, running when the estimate rounds to zero. */
export function readFrom(reading: BalanceReading): Sport {
  return wholeCentre(reading.lead) < 0 ? 'ride' : 'run'
}

/** A lead's range from the side it is read from: both ends positive when the range stays on that sport's side. */
export function sideRange(reading: BalanceReading): [number, number] {
  const { low, high } = reading.lead
  return readFrom(reading) === 'ride' ? [-high, -low] : [low, high]
}

/**
 * Whether a range is written with signs: one that reaches zero or the other sport's side ("−4 to +18 points",
 * "0 to +8 points"), so it reads as a span across zero. One wholly on the side it is read from is plain
 * ("2 to 10 points").
 */
export function signedRange(reading: BalanceReading): boolean {
  const [low] = sideRange(reading)
  return reading.unit === 'points' ? Math.round(low) <= 0 : low <= 0
}

/**
 * The range of a balance, in words, from the side the balance is read from: the sport its estimate favours,
 * or running when it rounds to zero. The lede, the meter's key, the spoken sentence and the import summary all
 * write it this way, so their signs agree.
 */
export function rangeText(reading: BalanceReading): string {
  const edges = rangeEdges(reading)
  if (reading.unit !== 'points') return edges
  if (signedRange(reading)) return `${edges}${NO_BREAK}points`
  const [low, high] = sideRange(reading)
  return `${Math.round(low)} to ${pointsUnit(Math.round(high))}`
}

/** The range's two edges alone, "−4 to +18" or "5% to 20%", for a line with no room for the unit. */
function rangeEdges(reading: BalanceReading): string {
  const [low, high] = sideRange(reading)
  const signed = signedRange(reading)
  if (reading.unit === 'points') {
    return signed
      ? `${signedCount(low)} to ${signedCount(high)}`
      : `${Math.round(low)} to ${Math.round(high)}`
  }
  return `${percentEdge(low, signed)} to ${percentEdge(high, signed)}`
}

/** Whether a lead's range rounds to a single value, so the lead is said as that one value. */
function isPoint(reading: BalanceReading): boolean {
  return Math.round(reading.lead.low) === Math.round(reading.lead.high)
}

/**
 * A grade gap on the headline duration: the best estimate first, then the range it sits within, from
 * the leading sport's side so the signs agree with the sentence. "Running’s age grade is 9 points
 * higher than cycling’s at 20 min, within −4 to +18 points." A range that rounds to one value leaves
 * the range out, since the estimate already says it. Only an estimate within LEVEL_BAND of zero says
 * the two are level.
 */
function gradeSummary(reading: BalanceReading): string {
  const centre = wholeCentre(reading.lead)
  const at = `at ${formatDuration(HEADLINE_DURATION_S).replace(' ', NO_BREAK)}`
  const level = reading.lean === 'even' ? ', so the two are level' : ''
  const within = isPoint(reading) ? '' : `, within ${rangeText(reading)}`
  if (centre === 0) {
    // A range that is not symmetric about zero has a side, so it names the one it is read from.
    const lopsided = Math.round(reading.lead.low) !== -Math.round(reading.lead.high)
    const side = within !== '' && lopsided ? ' (running minus cycling)' : ''
    return `Running and cycling have the same age grade ${at}${within}${side}${level}.`
  }
  const leading = readFrom(reading)
  const { other } = leaderOf(leading)
  const lead = `${SPORT_TITLE[leading]}’s age grade is ${points(Math.abs(centre))} higher than ${other}’s ${at}`
  return `${lead}${within}${level}.`
}

/** The energy ratio, as the balance is before the grades: how far one sport is higher, in percent. */
function energySummary({ unit, lean, lead }: BalanceReading, duration: string): string {
  if (lean === 'even') {
    return `Over ${duration}, your running and your cycling are level as energy per kilogram, within ${rangeText({ unit, lean, lead })}.`
  }
  const { leader, other } = leaderOf(lean)
  // The edge's rule, so a lead under half a percent reads as its value, never as 0%.
  const amount = percentEdge(Math.abs(lead.centre), false)
  const within = isPoint({ unit, lean, lead }) ? '' : `, within ${rangeText({ unit, lean, lead })}`
  return `Over ${duration}, your ${leader} is ${amount} higher than your ${other}${within}, as energy per kilogram.`
}

/** The summary under the headline. A grade gap is on the headline duration; the energy ratio on the duration given. */
export function balanceSummary(reading: BalanceReading, durationS: number): string {
  if (reading.unit === 'percent') return energySummary(reading, effortLabel(durationS))
  return gradeSummary(reading)
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
    ? 'Model range adjusted using the heart-rate data across all your activities.'
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
    return `${SPORT_TITLE[lean]} grades ${points(Math.abs(wholeCentre(lead)))} higher than ${other}`
  }
  // The edge's rule, so a lead under half a percent reads as its value, never as 0%.
  const percent = percentEdge(Math.abs(lead.centre), false)
  return `${SPORT_TITLE[lean]} ${percent} higher, as energy per kilogram`
}

/**
 * The lead in one line with the range it sits within, short enough for one line of the share card, or null for
 * an even balance, which the headline already says: "Running grades 9 points higher, within −4 to +18". A range
 * that rounds to one value is left out.
 */
export function leadSentence(reading: BalanceReading): string | null {
  const { lean, lead, unit } = reading
  if (lean === 'even') return null
  const within = isPoint(reading) ? '' : `, within ${rangeEdges(reading)}`
  if (unit === 'points') {
    return `${SPORT_TITLE[lean]} grades ${points(Math.abs(wholeCentre(lead)))} higher${within}`
  }
  return `${SPORT_TITLE[lean]} ${percentEdge(Math.abs(lead.centre), false)} higher in energy${within}`
}

/**
 * How the balance reads, in words, for assistive technology and the meter's caption: the leading
 * sport, its lead and its range. An even grade gap names the best estimate and its range.
 */
export function balanceSentence(reading: BalanceReading): string {
  const { unit, lean, lead } = reading
  if (lean === 'even') {
    const centre = wholeCentre(lead)
    const { leader } = leaderOf(readFrom(reading))
    if (unit === 'points') {
      if (centre === 0) {
        return `In balance: running and cycling have the same age grade, range ${rangeText(reading)}`
      }
      return `In balance: ${leader} ${points(Math.abs(centre))} higher, range ${rangeText(reading)}`
    }
    const { other } = leaderOf(readFrom(reading))
    return `Level as energy per kilogram (${leader} against ${other} ${rangeText(reading)})`
  }
  return `${leadingSentence({ ...reading, lean })} (range ${rangeText(reading)})`
}
