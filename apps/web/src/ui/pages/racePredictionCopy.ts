import type { MethodTime, RacePrediction, RunPredictions } from '@rca/core/predict'
import { formatRecordTime } from '@rca/core/units'
import { plural } from '../components/plural'
import { METHOD_NAME, raceName } from '../racePredictions'

/** VO2max figures differ by more than this share before the note says the two estimates disagree. */
const DISAGREE_SHARE = 0.1

/**
 * The spread under a prediction, from its 10th to 90th percentile of an assumed error. The marathon's error is a
 * published validation figure and the shorter races' are a judgement, so it is called a spread, not a range the
 * time falls in.
 */
export function spreadText(prediction: RacePrediction): string {
  return `${formatRecordTime(prediction.low)} to ${formatRecordTime(prediction.high)}`
}

/** Where one estimate came from, such as "From your best runs: 20:25, led by your best 10 km". */
export function originText(method: MethodTime, vo2max: number | null): string {
  const time = formatRecordTime(method.seconds)
  if (method.method === 'heartRate') {
    return `${METHOD_NAME.heartRate}: ${time}, at a VO2max of ${Math.round(vo2max ?? 0)}`
  }
  return `${METHOD_NAME.performances}: ${time}, led by your best ${raceName(method.fromM).toLowerCase()}`
}

/** A sentence when the runs and the heart rate point to different fitness, or nothing. */
function disagreement(runsVdot: number | null, vo2max: number): string {
  if (runsVdot === null || Math.abs(vo2max / runsVdot - 1) <= DISAGREE_SHARE) return ''
  const [high, low] = vo2max > runsVdot ? [vo2max, runsVdot] : [runsVdot, vo2max]
  const which =
    vo2max > runsVdot
      ? 'Your heart rate points to more than your best runs show'
      : 'Your best runs show more than your heart rate suggests'
  return ` ${which} (about ${Math.round(high)} against ${Math.round(low)} in VO2max terms), so the spread is wide. Best runs that were not all-out, and hills, both widen it; an all-out 5 km on the flat would show which is nearer.`
}

/** What All time's predictions are of: the best period in the files, which a shorter period would not be. */
const ALL_TIME_NOTE =
  ' In All time they reflect your best period. A shorter period shows your recent form.'

const FLAT = 'for a flat course on a good day'

/** Whether some race has an estimate from the athlete's runs, as opposed to heart rate alone. */
function fromRuns({ races }: RunPredictions): boolean {
  return races.some((race) => race.methods.some((m) => m.method === 'performances'))
}

/** The line under the title: the middle of two estimates, or the one that there is. */
export function predictionsLede(found: RunPredictions, allTime: boolean): string {
  if (found.vo2max !== null && fromRuns(found)) {
    return `The middle of two estimates, ${FLAT}.`
  }
  const source = fromRuns(found)
    ? allTime
      ? 'your best times on file'
      : 'your best times in this period'
    : 'your heart rate against pace'
  return `From ${source}, ${FLAT}.`
}

/** How the predictions were reached, from the sources the result could use. */
export function methodNote(found: RunPredictions, allTime: boolean): string {
  const { runsVdot, vo2max } = found
  const when = allTime ? ALL_TIME_NOTE : ''
  const times = allTime ? 'your best times on file' : 'your best times in this period'
  if (!fromRuns(found) || vo2max === null) {
    return `From ${fromRuns(found) ? times : 'your heart rate against pace'} alone, ${FLAT}.${when}`
  }
  const capped =
    vo2max.hillCapped > 0
      ? ` ${plural(vo2max.hillCapped, 'hilly run')} left out of the heart-rate side, since ${vo2max.hillCapped === 1 ? 'its' : 'their'} flat-equivalent pace beat your fastest mile.`
      : ''
  return `Each sits in the middle of two estimates: ${times}, carried to the distance, and the times a VO2max of ${Math.round(vo2max.vo2max)} would run, from your heart rate against pace on ${plural(vo2max.runs, 'hard run')}. Both allow for your weekly distance in the marathon, ${FLAT}.${capped}${disagreement(runsVdot, vo2max.vo2max)}${when}`
}
