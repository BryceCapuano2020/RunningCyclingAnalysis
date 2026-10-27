import type { AnalysisResult } from '@rca/core/pipeline'
import type { RacePrediction, RunPredictions } from '@rca/core/predict'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatPace, formatRecordTime } from '@rca/core/units'
import { plural } from '../components/plural'
import { METHOD_NAME, RACE_PREDICTORS, raceName } from '../racePredictions'
import { EvidenceDisclosure } from './EvidenceDisclosure'
import './RacePredictions.css'

/** The likely range under a prediction, from its 10th to 90th percentile. */
function rangeText(prediction: RacePrediction): string {
  return `${formatRecordTime(prediction.low)} to ${formatRecordTime(prediction.high)}`
}

/** VO2max figures differ by more than this share before the note says the two estimates disagree. */
const DISAGREE_SHARE = 0.1

/** How the predictions were reached, from the methods the result could use. */
function methodNote({ races, runsVdot, vo2max }: RunPredictions): string {
  const fromRuns = races.some((race) => race.methods.some((m) => m.method === 'performances'))
  const flat = 'for a flat course on a good day'
  if (!fromRuns || vo2max === null) {
    return `From ${fromRuns ? 'your best times in this period' : 'your heart rate against pace'} alone, ${flat}.`
  }
  return `Each sits in the middle of two estimates: your best times in this period, carried to the distance, and the times a VO2max of ${Math.round(vo2max.vo2max)} would run, from your heart rate against pace on ${plural(vo2max.runs, 'hard run')}. Both allow for your weekly distance in the marathon, ${flat}.${disagreement(runsVdot, vo2max.vo2max)}`
}

/** A sentence when the runs and the heart rate point to different fitness, or nothing. */
function disagreement(runsVdot: number | null, vo2max: number): string {
  if (runsVdot === null || Math.abs(vo2max / runsVdot - 1) <= DISAGREE_SHARE) return ''
  const more = vo2max > runsVdot
  return more
    ? ` Your heart rate points to more than your best runs show (about ${Math.round(vo2max)} against ${Math.round(runsVdot)}), so the range is wide; an all-out 5 km would show which is nearer.`
    : ` Your best runs show more than your heart rate suggests (about ${Math.round(runsVdot)} against ${Math.round(vo2max)}), so the range is wide.`
}

/**
 * A sport's race predictions: the predicted time and pace for each race, its likely range, and how it
 * was reached. Nothing for a sport without a predictor or without the evidence for any race.
 */
export function RacePredictions({
  sport,
  result,
  units,
}: {
  sport: Sport
  result: AnalysisResult
  units: UnitSystem
}) {
  const predict = RACE_PREDICTORS[sport]
  const found = predict ? predict(result) : null
  if (found === null || found.races.length === 0) return null
  const predictions = found.races
  const headingId = `${sport}-races`
  return (
    <section className="section" aria-labelledby={headingId}>
      <h2 id={headingId}>Race predictions</h2>
      <table className="race-table">
        <thead>
          <tr>
            <th scope="col">Race</th>
            <th scope="col" className="num">
              Predicted
            </th>
            <th scope="col" className="num">
              Pace
            </th>
          </tr>
        </thead>
        <tbody>
          {predictions.map((prediction) => {
            return (
              <tr key={prediction.distanceM}>
                <th scope="row">{raceName(prediction.distanceM)}</th>
                <td className="num">
                  <span className="race-table__time">{formatRecordTime(prediction.seconds)}</span>
                  <span className="race-table__range muted">{`likely ${rangeText(prediction)}`}</span>
                </td>
                <td className="num">
                  {formatPace(prediction.distanceM / prediction.seconds, units)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="muted">{methodNote(found)}</p>
      <EvidenceDisclosure section="the race predictions">
        <table className="race-table">
          <caption>Each estimate on its own</caption>
          <thead>
            <tr>
              <th scope="col">Race</th>
              {Object.values(METHOD_NAME).map((name) => (
                <th key={name} scope="col" className="num">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {predictions.map((prediction) => (
              <tr key={prediction.distanceM}>
                <th scope="row">{raceName(prediction.distanceM)}</th>
                {Object.keys(METHOD_NAME).map((method) => {
                  const time = prediction.methods.find((m) => m.method === method)?.seconds
                  return (
                    <td key={method} className="num">
                      {time === undefined ? 'Not enough data' : formatRecordTime(time)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </EvidenceDisclosure>
    </section>
  )
}
