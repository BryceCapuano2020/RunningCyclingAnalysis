import type { MethodTime, RacePrediction, RunPredictions } from '@rca/core/predict'
import { formatRecordTime } from '@rca/core/units'
import { plural } from '../components/plural'
import { formatDayMonth, formatMonth } from '../format/date'
import type { PastRun, RaceForecast, RaceWindow } from '../raceAnswer'
import { METHOD_NAME, raceName } from '../racePredictions'

/** VO2max figures differ by more than this share before the note says the two estimates disagree. */
const DISAGREE_SHARE = 0.1

/**
 * The range under a prediction, from its 10th to 90th percentile of a typical error. The marathon's error is a
 * published validation figure and the shorter races' are a judgement.
 */
export function spreadText(prediction: RacePrediction): string {
  return `${formatRecordTime(prediction.low)} to ${formatRecordTime(prediction.high)}`
}

/** Where one estimate came from, such as "From your best runs: 20:25, mostly from your best 10 km". */
export function originText(method: MethodTime, vo2max: number | null): string {
  const time = formatRecordTime(method.seconds)
  if (method.method === 'heartRate') {
    return `${METHOD_NAME.heartRate}: ${time}, at a VO2max of ${Math.round(vo2max ?? 0)}`
  }
  return `${METHOD_NAME.performances}: ${time}, mostly from your best ${raceName(method.fromM).toLowerCase()}`
}

/** A sentence when the runs and the heart rate point to different fitness, or nothing. */
function disagreement(runsVdot: number | null, vo2max: number): string {
  if (runsVdot === null || Math.abs(vo2max / runsVdot - 1) <= DISAGREE_SHARE) return ''
  const [high, low] = vo2max > runsVdot ? [vo2max, runsVdot] : [runsVdot, vo2max]
  const which =
    vo2max > runsVdot
      ? 'Your heart rate points to more than your best runs show'
      : 'Your best runs show more than your heart rate suggests'
  return ` ${which} (about ${Math.round(high)} against ${Math.round(low)} in VO2max terms), so the range is wide. Best runs that were not all-out and hills both widen it. An all-out 5 km on the flat would show which is nearer.`
}

/** What All time's predictions are of: the best period in the files, which a shorter period would not be. */
const ALL_TIME_NOTE =
  ' In All time they reflect your best period. A shorter period shows your recent form.'

const FLAT = 'for a flat course on a good day'

/** What a row says when its time was held to a time already run at the distance. */
export const FLOORED_TEXT = 'Your best'

/** What a row says when its run was not shown hard: the time is a bound, and you can run it or faster. */
export const BOUND_TEXT = 'No slower than'

/** The method note's clause for a list with such a row. */
const FLOOR_NOTE =
  ' Where you have already run a race distance, the prediction is held at that time.'

/** Where the runs of each window are, as the note says it. */
const RUNS_IN: Record<RaceWindow, string> = {
  period: 'this period',
  year: 'the last 12 months',
  all: 'your files',
}

/** What each window's times are called in the method note. */
const TIMES: Record<RaceWindow, string> = {
  period: 'your best times in this period',
  year: 'your best times in the last 12 months',
  all: 'your best times on file',
}

/** Whether some race was held to a time already run. */
function anyFloored({ races }: RunPredictions): boolean {
  return races.some((race) => race.floored)
}

/** Whether some race has an estimate from the athlete's runs, as opposed to heart rate alone. */
function fromRuns({ races }: RunPredictions): boolean {
  return races.some((race) => race.methods.some((m) => m.method === 'performances'))
}

/** The line under the title when every run is older than the year: there is nothing to forecast from. */
export const PAST_LINE = 'No run of a mile or more in 12 months.'

/** What a row says of a run older than the year, as it was run: "You ran 19:58 in Oct 2024". */
export function pastText({ seconds, startMs }: PastRun): string {
  return `You ran ${formatRecordTime(seconds)} in ${formatMonth(startMs, true)}`
}

/** The one line under the title: the run the times were carried from, or the heart rate they came from. */
export function basisLine(answer: Pick<RaceForecast, 'basis'>, openedAt: number): string {
  const { basis } = answer
  if (basis === null) return 'From your heart rate.'
  return `From your ${raceName(basis.distanceM).toLowerCase()} on ${formatDayMonth(basis.startMs, openedAt)}.`
}

/** How the predictions were reached, from the sources the result could use. */
export function methodNote(found: RunPredictions, window: RaceWindow, bound = false): string {
  const { runsVdot, vo2max } = found
  const when = window === 'all' ? ALL_TIME_NOTE : ''
  const times = TIMES[window]
  if (bound) {
    return `No run in ${RUNS_IN[window]} reached a hard heart rate. Each time is carried from your best run, ${FLAT}.${when}${anyFloored(found) ? FLOOR_NOTE : ''}`
  }
  if (!fromRuns(found) || vo2max === null) {
    return `From ${fromRuns(found) ? times : 'your heart rate against pace'} alone, ${FLAT}.${when}${anyFloored(found) ? FLOOR_NOTE : ''}`
  }
  const capped =
    vo2max.hillCapped > 0
      ? ` ${plural(vo2max.hillCapped, 'hilly run')} left out of the heart-rate side, since ${vo2max.hillCapped === 1 ? 'its' : 'their'} flat-equivalent pace beat your fastest mile.`
      : ''
  return `Each sits in the middle of two estimates: ${times}, carried to the distance, and the times a VO2max of ${Math.round(vo2max.vo2max)} would run, from your heart rate against pace on ${plural(vo2max.runs, 'hard run')}. Both allow for your weekly distance in the marathon, ${FLAT}.${capped}${disagreement(runsVdot, vo2max.vo2max)}${when}${anyFloored(found) ? FLOOR_NOTE : ''}`
}
