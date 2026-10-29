import type { MethodTime, RacePrediction, RunPredictions } from '@rca/core/predict'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatPace, formatRecordTime } from '@rca/core/units'
import { plural } from '../components/plural'
import { METHOD_NAME, METHOD_SHORT, RACE_PREDICTIONS_NAME, raceName } from '../racePredictions'
import { EvidenceDisclosure } from './EvidenceDisclosure'
import './RacePredictions.css'

/** VO2max figures differ by more than this share before the note says the two estimates disagree. */
const DISAGREE_SHARE = 0.1

/** The range under a prediction, from its 10th to 90th percentile. */
function rangeText(prediction: RacePrediction): string {
  return `range ${formatRecordTime(prediction.low)} to ${formatRecordTime(prediction.high)}`
}

/** Each estimate in a few words, such as "runs 20:25 · heart rate 16:54"; null for one estimate. */
function estimatesText(prediction: RacePrediction): string | null {
  if (prediction.methods.length < 2) return null
  return prediction.methods
    .map((m) => `${METHOD_SHORT[m.method]} ${formatRecordTime(m.seconds)}`)
    .join(' · ')
}

/** Where one estimate came from, such as "From your best runs: 20:25, carried from your best 10 km". */
function originText(method: MethodTime, vo2max: number | null): string {
  const time = formatRecordTime(method.seconds)
  if (method.method === 'heartRate') {
    return `${METHOD_NAME.heartRate}: ${time}, at a VO2max of ${Math.round(vo2max ?? 0)}`
  }
  return `${METHOD_NAME.performances}: ${time}, carried from your best ${raceName(method.fromM).toLowerCase()}`
}

/** A sentence when the runs and the heart rate point to different fitness, or nothing. */
function disagreement(runsVdot: number | null, vo2max: number): string {
  if (runsVdot === null || Math.abs(vo2max / runsVdot - 1) <= DISAGREE_SHARE) return ''
  const [high, low] = vo2max > runsVdot ? [vo2max, runsVdot] : [runsVdot, vo2max]
  const which =
    vo2max > runsVdot
      ? 'Your heart rate points to more than your best runs show'
      : 'Your best runs show more than your heart rate suggests'
  return ` ${which} (about ${Math.round(high)} against ${Math.round(low)} in VO2max terms), so the range is wide. Best runs that were not all-out, and hills, both widen it; an all-out 5 km on the flat would show which is nearer.`
}

/** What All time's predictions are of: the best period in the files, which a shorter period would not be. */
const ALL_TIME_NOTE =
  ' In All time they reflect your best period. A shorter period shows your recent form.'

/** How the predictions were reached, from the sources the result could use. */
function methodNote({ races, runsVdot, vo2max }: RunPredictions, allTime: boolean): string {
  const fromRuns = races.some((race) => race.methods.some((m) => m.method === 'performances'))
  const flat = 'for a flat course on a good day'
  const when = allTime ? ALL_TIME_NOTE : ''
  const times = allTime ? 'your best times on file' : 'your best times in this period'
  if (!fromRuns || vo2max === null) {
    return `From ${fromRuns ? times : 'your heart rate against pace'} alone, ${flat}.${when}`
  }
  const capped =
    vo2max.hillCapped > 0
      ? ` ${plural(vo2max.hillCapped, 'hilly run')} left out of the heart-rate side, since ${vo2max.hillCapped === 1 ? 'its' : 'their'} flat-equivalent pace beat your fastest mile.`
      : ''
  return `Each sits in the middle of two estimates: ${times}, carried to the distance, and the times a VO2max of ${Math.round(vo2max.vo2max)} would run, from your heart rate against pace on ${plural(vo2max.runs, 'hard run')}. Both allow for your weekly distance in the marathon, ${flat}.${capped}${disagreement(runsVdot, vo2max.vo2max)}${when}`
}

/** One race: its name and pace, then the predicted time, its range and the two estimates. */
function RaceRow({ prediction, units }: { prediction: RacePrediction; units: UnitSystem }) {
  const estimates = estimatesText(prediction)
  return (
    <tr>
      <th scope="row">
        <span className="race-table__name">{raceName(prediction.distanceM)}</span>
        <span className="race-table__sub muted">
          {formatPace(prediction.distanceM / prediction.seconds, units)}
        </span>
      </th>
      <td className="num">
        <span className="race-table__time">{formatRecordTime(prediction.seconds)}</span>
        <span className="race-table__sub muted">{rangeText(prediction)}</span>
        {estimates && <span className="race-table__sub muted">{estimates}</span>}
      </td>
    </tr>
  )
}

/**
 * A sport's race predictions, as racePredictionsOf found them: each race's predicted time and pace, its
 * range and the two estimates it sits between, and how they were reached.
 */
export function RacePredictions({
  sport,
  found,
  units,
  allTime,
}: {
  sport: Sport
  found: RunPredictions
  units: UnitSystem
  /** The period on screen is All time, so the note says the predictions are of the best period in it. */
  allTime: boolean
}) {
  const headingId = `${sport}-races`
  return (
    <section className="section" aria-labelledby={headingId}>
      <h2 id={headingId}>{RACE_PREDICTIONS_NAME}</h2>
      <table className="race-table">
        <thead>
          <tr>
            <th scope="col">Race and pace</th>
            <th scope="col" className="num">
              Predicted
            </th>
          </tr>
        </thead>
        <tbody>
          {found.races.map((prediction) => (
            <RaceRow key={prediction.distanceM} prediction={prediction} units={units} />
          ))}
        </tbody>
      </table>
      <p className="muted">{methodNote(found, allTime)}</p>
      <EvidenceDisclosure section="the race predictions">
        <ul className="race-origins">
          {found.races.map((prediction) => (
            <li key={prediction.distanceM}>
              <span className="race-origins__race">{raceName(prediction.distanceM)}</span>
              {prediction.methods.map((method) => (
                <span key={method.method} className="race-origins__method muted">
                  {originText(method, found.vo2max?.vo2max ?? null)}
                </span>
              ))}
            </li>
          ))}
        </ul>
      </EvidenceDisclosure>
    </section>
  )
}
