import type { AnalysisResult } from '@rca/core/pipeline'
import type { EffortCheck, Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import type { HeartRateRefusal, ThresholdEstimate } from '@rca/core/threshold'
import { plural } from './components/plural'
import { effortChipText } from './effortCaveat'
import { formatDayMonth } from './format/date'
import { effortLabel } from './records'
import { THRESHOLD_EFFORT_TEXT } from './sports'
import { thresholdRange } from './thresholdRange'

/**
 * The line under a ride's threshold that says what it rests on: how many rides, and the strongest effort among them with its
 * length and day, such as "From 5 rides. Strongest: 12 min on 4 Mar.", and where its watts are estimated, without a power
 * meter, "Strongest: 12 min on 4 Mar, on estimated watts." A run's fit rests on its curve, not on a count of runs, so it has
 * no such line. Null without an estimate.
 */
function rideBasis(result: AnalysisResult): string | null {
  const estimate = result.rideThreshold
  if (!estimate) return null
  const { rides, strongest } = estimate.efforts
  const activity = result.activities.find((candidate) => candidate.id === strongest.activityId)
  const day = activity === undefined ? '' : ` on ${formatDayMonth(activity.startMs)}`
  const watts = strongest.estimated ? ', on estimated watts' : ''
  return `From ${plural(rides, 'ride')}. Strongest: ${effortLabel(strongest.durationS)}${day}${watts}.`
}

/** The line under a threshold's figure, or null where the sport's figure needs none. Keyed by Sport. */
const BASIS_OF: Record<Sport, (result: AnalysisResult) => string | null> = {
  run: () => null,
  ride: rideBasis,
}

export function thresholdBasisLine(result: AnalysisResult, sport: Sport): string | null {
  return BASIS_OF[sport](result)
}

/** Why heart rate was not used, as the clause after "Here it was not used:", for each reason the estimator gives. */
const HEART_RATE_WHY: Record<HeartRateRefusal, string> = {
  'no-heart-rate': 'no ride has both a power meter and heart rate',
  'few-blocks': 'too little steady riding has both heart rate and power',
  stuck: 'your heart rate does not move with power',
  flat: 'your heart rate rises too little with power to read',
  steep: 'your heart rate rises too steeply with power to read',
  'no-efforts': 'no steady effort sat close to your threshold heart rate',
}

/**
 * Whether heart rate raised the answer. The answer is the power estimate itself unless heart rate raised it, so it is above
 * the power estimate exactly when heart rate lifted it. False where heart rate was refused.
 */
export function heartRateLifted(estimate: ThresholdEstimate): boolean {
  return !('refused' in estimate.heartRate) && estimate.value > estimate.efforts.value
}

/** What heart rate did to this estimate: raised it, was read and did not raise it, or the one plain reason it was not used. */
function heartRateSentence(estimate: ThresholdEstimate): string {
  const { heartRate } = estimate
  if ('refused' in heartRate) return `Here it was not used: ${HEART_RATE_WHY[heartRate.refused]}.`
  const from = plural(heartRate.efforts, 'effort')
  return heartRateLifted(estimate)
    ? `Here it raised the answer, from ${from}.`
    : `Here it did not raise the answer, from ${from}.`
}

/** What a detail is made from: the result, and the sport page's body weight, units and the headline effort's heart-rate check. */
interface DetailInput {
  result: AnalysisResult
  massKg: number
  units: UnitSystem
  effort: EffortCheck | null | undefined
}

/** A sentence per fact, left out where there is none, as one text. */
function sentences(parts: readonly (string | null)[]): string {
  return parts.filter((part) => part !== null).join(' ')
}

/**
 * What the ride estimate is and how it was worked out, for the line one tap down: the range, the method in a sentence, what
 * heart rate can do and what it did here (raised the answer, did not, or why it was not used).
 */
function rideDetail({ result, massKg, units }: DetailInput): string | null {
  const estimate = result.rideThreshold
  if (!estimate) return null
  const range = thresholdRange(result, 'ride', massKg, units)
  return sentences([
    range === null ? null : `${range}.`,
    'Worked out from the strongest effort of each ride, scaled to an hour and averaged, with more weight on recent rides and on those near your top.',
    'Heart rate can raise the answer and never lowers it.',
    heartRateSentence(estimate),
  ])
}

/**
 * How hard a run's best 20 min was, by heart rate: the reading the headline chip used to carry, behind the fit it qualifies.
 * Null where heart rate says nothing of it, since the fit alone is said by the Method page and the term's definition.
 */
function runDetail({ result, effort }: DetailInput): string | null {
  const reading = effortChipText('run', effort)
  if (!result.runCp || reading === null) return null
  return sentences([`Fitted to your best ${THRESHOLD_EFFORT_TEXT} efforts.`, reading.detail])
}

const DETAIL_OF: Record<Sport, (input: DetailInput) => string | null> = {
  run: runDetail,
  ride: rideDetail,
}

/**
 * The text a threshold's detail opens: a ride's range, method and what heart rate did; a run's fit and how hard its best
 * 20 min was. Null where the sport has no threshold, or nothing to say beyond what the figure and the Method page say.
 */
export function thresholdDetail(
  result: AnalysisResult,
  sport: Sport,
  massKg: number,
  units: UnitSystem,
  effort: EffortCheck | null | undefined,
): string | null {
  return DETAIL_OF[sport]({ result, massKg, units, effort })
}
