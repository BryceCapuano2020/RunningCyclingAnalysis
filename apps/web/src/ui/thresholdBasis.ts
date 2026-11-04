import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import type { HeartRateRefusal, ThresholdEstimate } from '@rca/core/threshold'
import { plural } from './components/plural'
import { formatDayMonth } from './format/date'
import { effortLabel } from './records'
import { thresholdRange } from './thresholdRange'
import { thresholdEstimate } from './thresholdEstimate'

/** The word for one of the activities a threshold rests on, and what an estimated effort of that sport is on. */
const ACTIVITY: Record<Sport, { noun: string; estimated: string }> = {
  run: { noun: 'run', estimated: '' },
  ride: { noun: 'ride', estimated: ', on estimated watts' },
}

/**
 * The line under a threshold's figure that says what it rests on: how many rides or runs, and the strongest effort among them
 * with its length and day, such as "From 5 runs. Strongest: 12 min on 4 Mar.", and where a ride's watts are estimated, without a
 * power meter, "Strongest: 12 min on 4 Mar, on estimated watts." Where an hour the athlete did sets the figure, that hour is the
 * strongest effort. Null without an estimate.
 */
export function thresholdBasisLine(result: AnalysisResult, sport: Sport): string | null {
  const estimate = thresholdEstimate(result, sport)
  if (!estimate) return null
  const { rides, strongest } = estimate.efforts
  const activity = result.activities.find((candidate) => candidate.id === strongest.activityId)
  const day = activity === undefined ? '' : ` on ${formatDayMonth(activity.startMs)}`
  const guess = strongest.estimated ? ACTIVITY[sport].estimated : ''
  return `From ${plural(rides, ACTIVITY[sport].noun)}. Strongest: ${effortLabel(strongest.durationS)}${day}${guess}.`
}

/** Why a ride's heart rate was not used, as the clause after "Here it was not used:", for each reason the estimator gives. */
const RIDE_HEART_RATE_WHY: Record<HeartRateRefusal, string> = {
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

/** What heart rate did to a ride estimate: raised it, was read and did not raise it, or the one plain reason it was not used. */
function rideHeartRateSentence(estimate: ThresholdEstimate): string {
  const { heartRate } = estimate
  if ('refused' in heartRate)
    return `Here it was not used: ${RIDE_HEART_RATE_WHY[heartRate.refused]}.`
  const from = plural(heartRate.efforts, 'effort')
  return heartRateLifted(estimate)
    ? `Here it raised the answer, from ${from}.`
    : `Here it did not raise the answer, from ${from}.`
}

/**
 * What a sport's detail says of heart rate: for a ride what it can do and what it did here, for a run nothing, since a run's
 * threshold is worked out from pace alone and heart rate is not part of how it was reached.
 */
const HEART_RATE_SENTENCES: Record<Sport, (estimate: ThresholdEstimate) => string[]> = {
  run: () => [],
  ride: (estimate) => [
    'Heart rate can raise the answer and never lowers it.',
    rideHeartRateSentence(estimate),
  ],
}

/** The method in one sentence, in the sport's own words. */
const METHOD: Record<Sport, string> = {
  run: 'Worked out from the strongest effort of each run, scaled to an hour and averaged, with more weight on recent runs and on those near your top, and never under a backed hour you ran.',
  ride: 'Worked out from the strongest effort of each ride, scaled to an hour and averaged, with more weight on recent rides and on those near your top, and never under a backed hour you rode.',
}

/** A sentence per fact, left out where there is none, as one text. */
function sentences(parts: readonly (string | null)[]): string {
  return parts.filter((part) => part !== null).join(' ')
}

/**
 * What the threshold is and how it was worked out, for the line one tap down: the range, the method in a sentence and, for a
 * ride, what heart rate can do and what it did here (raised the answer, did not, or why it was not used). A run's says nothing
 * of heart rate. Null without an estimate.
 */
export function thresholdDetail(
  result: AnalysisResult,
  sport: Sport,
  massKg: number,
  units: UnitSystem,
): string | null {
  const estimate = thresholdEstimate(result, sport)
  if (!estimate) return null
  const range = thresholdRange(result, sport, massKg, units)
  return sentences([
    range === null ? null : `${range}.`,
    METHOD[sport],
    ...HEART_RATE_SENTENCES[sport](estimate),
  ])
}
