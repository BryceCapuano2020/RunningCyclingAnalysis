import type { MethodTime, RacePrediction } from '@rca/core/predict'
import { formatRecordTime } from '@rca/core/units'
import { formatDayMonth, formatMonth } from '../format/date'
import type { PastRun, RaceForecast, RaceWindow } from '../raceAnswer'
import { METHOD_NAME, raceName } from '../racePredictions'

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

/** What every prediction is for. */
const FLAT_COURSE = 'For a flat course on a good day.'

/** What All time's predictions are of: the best period in the files, which a shorter period would not be. */
const ALL_TIME_NOTE = 'All time uses your best period.'

/** What a row says when its time was held to a time already run at the distance. */
export const FLOORED_TEXT = 'Your best'

/** What a row says when its run was not shown hard: the time is a bound, and you can run it or faster. */
export const BOUND_TEXT = 'No slower than'

/** Where the runs of each window are, as the note says it. */
const RUNS_IN: Record<RaceWindow, string> = {
  period: 'this period',
  year: 'the last 12 months',
  all: 'your files',
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

/** What the predictions are for, and when no run was all-out or the window is all time, that. */
export function methodNote(window: RaceWindow, bound = false): string {
  const notAllOut = bound ? `No run in ${RUNS_IN[window]} was all-out. ` : ''
  return `${notAllOut}${FLAT_COURSE}${window === 'all' ? ` ${ALL_TIME_NOTE}` : ''}`
}
