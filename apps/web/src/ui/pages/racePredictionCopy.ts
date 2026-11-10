import type { MethodTime, RacePrediction } from '@rca/core/predict'
import { formatRecordTime } from '@rca/core/units'
import type { Property } from '../components/property'
import { formatDayMonth, formatMonth } from '../format/date'
import type { PastRun, RaceForecast, RaceWindow } from '../raceAnswer'
import { raceName } from '../racePredictions'

/**
 * The range under a prediction, from its 10th to 90th percentile of a typical error. The marathon's error is a
 * published validation figure and the shorter races' are a judgement.
 */
export function spreadText(prediction: RacePrediction): string {
  return `${formatRecordTime(prediction.low)} to ${formatRecordTime(prediction.high)}`
}

/** What each method is called in the label of its origin row. */
const ORIGIN_LABEL: Record<MethodTime['method'], string> = {
  performances: 'best runs',
  heartRate: 'heart rate',
}

/** Where one estimate came from, as a row: "5 km, best runs" and "20:25, mostly from your best 10 km". */
export function originRow(race: string, method: MethodTime, vo2max: number | null): Property {
  const time = formatRecordTime(method.seconds)
  return {
    label: `${race}, ${ORIGIN_LABEL[method.method]}`,
    value:
      method.method === 'heartRate'
        ? `${time}, VO2max ${Math.round(vo2max ?? 0)}`
        : `${time}, mostly from your best ${raceName(method.fromM).toLowerCase()}`,
  }
}

/** Where the runs of each window are, as the note says it. */
const RUNS_IN: Record<RaceWindow, string> = {
  period: 'this period',
  year: 'the last 12 months',
  all: 'your files',
}

/** What a row says when its time was held to a time already run at the distance. */
export const FLOORED_TEXT = 'Your best'

/** The line under the title when every run is older than the year: there is nothing to forecast from. */
export const PAST_LINE = 'No run of a mile or more in 12 months.'

/** A run older than the year, as it was run, label over value: "Ran", "19:58, Oct 2024". */
export function pastRow({ seconds, startMs }: PastRun): Property {
  return { label: 'Ran', value: `${formatRecordTime(seconds)}, ${formatMonth(startMs, true)}` }
}

/** The rows that say what the forecast rests on: the run the times were carried from or the heart rate, and what it is for. */
export function forecastRows(
  answer: Pick<RaceForecast, 'basis'>,
  window: RaceWindow,
  bound: boolean,
  openedAt: number,
): Property[] {
  const { basis } = answer
  return [
    {
      label: 'Based on',
      value:
        basis === null
          ? 'Your heart rate'
          : `Your ${raceName(basis.distanceM).toLowerCase()}, ${formatDayMonth(basis.startMs, openedAt)}`,
    },
    { label: 'For', value: 'A flat course on a good day' },
    ...(bound ? [{ label: 'Runs shown hard', value: `None in ${RUNS_IN[window]}` }] : []),
    ...(window === 'all' ? [{ label: 'All time', value: 'Your best period' }] : []),
  ]
}
