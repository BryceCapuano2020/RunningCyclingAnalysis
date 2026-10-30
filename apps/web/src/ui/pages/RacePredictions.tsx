import type { PredictionMethod, RacePrediction, RunPredictions } from '@rca/core/predict'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatPace, formatRecordTime } from '@rca/core/units'
import { METHOD_NAME, METHOD_SHORT, RACE_PREDICTIONS_NAME, raceName } from '../racePredictions'
import { Definition } from '../components/Definition'
import { DEFINITIONS } from './balanceDefinitions'
import { useScrollRegion } from '../useScrollRegion'
import { EvidenceDisclosure } from './EvidenceDisclosure'
import { methodNote, originText, predictionsLede, spreadText } from './racePredictionCopy'
import { raceBar } from './raceBars'
import { ranText } from './raceRan'
import type { RanBest } from './raceRan'
import './RacePredictions.css'

/**
 * Which side of the bar each method's triangle sits on: the athlete's runs point down from above, the heart
 * rate points up from below, so two estimates that agree still show as two marks.
 */
const MARK_SIDE: Record<PredictionMethod, 'above' | 'below'> = {
  performances: 'above',
  heartRate: 'below',
}

/** Each method's entry in the key, in the words a reader of the bars uses. */
const KEY_NAME: Record<PredictionMethod, string> = {
  performances: 'From your runs',
  heartRate: METHOD_NAME.heartRate,
}

/** No recorded best faster than its prediction: a stable default for the prop. */
const NONE_RAN: readonly RanBest[] = []

/** What a bar says to a screen reader: the time, its spread and each estimate. */
function barLabel(prediction: RacePrediction, ran: RanBest | undefined): string {
  const estimates = prediction.methods
    .map((m) => `${METHOD_NAME[m.method].toLowerCase()} ${formatRecordTime(m.seconds)}`)
    .join(', ')
  return `${raceName(prediction.distanceM)} predicted ${formatRecordTime(prediction.seconds)}, assumed spread ${spreadText(prediction)}${estimates ? `. ${estimates}` : ''}.${ran ? ` ${ranText(ran)}.` : ''}`
}

/**
 * One race as a bar: the assumed spread as a rounded band between two caps with its ends printed, the
 * prediction as a ring on it, and each estimate as a triangle above or below. A dot and two triangles say
 * what a column of digits would, at a glance, so the time at the right is the answer and the bar is its
 * evidence. A recorded best that beat the prediction is a solid dot labelled "Run", since a run is a fact. The drawing is one image with the words above as its name; the table in the disclosure repeats it.
 */
function RaceBar({ prediction, ran }: { prediction: RacePrediction; ran: RanBest | undefined }) {
  const bar = raceBar(prediction, ran?.seconds ?? null)
  return (
    <div className="race-bar" role="img" aria-label={barLabel(prediction, ran)}>
      <span className="race-bar__end race-bar__end--low" style={{ left: `${bar.low * 100}%` }}>
        {formatRecordTime(prediction.low)}
      </span>
      <span
        className="race-bar__band"
        style={{ left: `${bar.low * 100}%`, right: `${(1 - bar.high) * 100}%` }}
      />
      <span className="race-bar__cap" style={{ left: `${bar.low * 100}%` }} />
      <span className="race-bar__cap" style={{ left: `${bar.high * 100}%` }} />
      {bar.methods.map((mark) => (
        <span
          key={mark.method}
          className={`race-bar__mark race-bar__mark--${MARK_SIDE[mark.method]}`}
          style={{ left: `${mark.at * 100}%` }}
        />
      ))}
      <span className="race-bar__dot" style={{ left: `${bar.prediction * 100}%` }} />
      {bar.ran !== null && (
        <span className="race-bar__ran" style={{ left: `${bar.ran * 100}%` }}>
          <span className="race-bar__ran-label">Run</span>
        </span>
      )}
      <span className="race-bar__end race-bar__end--high" style={{ left: `${bar.high * 100}%` }}>
        {formatRecordTime(prediction.high)}
      </span>
    </div>
  )
}

/** One race: its name and pace on the left, its bar between, its time at display size on the right. */
function RaceRow({
  prediction,
  units,
  ran,
}: {
  prediction: RacePrediction
  units: UnitSystem
  ran: RanBest | undefined
}) {
  return (
    <li className="race-row">
      <p className="race-row__name">
        <span className="race-row__race">{raceName(prediction.distanceM)}</span>
        <span className="race-row__pace">
          {formatPace(prediction.distanceM / prediction.seconds, units)}
        </span>
        {ran && <span className="race-row__ran">{ranText(ran)}</span>}
      </p>
      <RaceBar prediction={prediction} ran={ran} />
      <p className="race-row__time">{formatRecordTime(prediction.seconds)}</p>
    </li>
  )
}

/** The key above the bars, with each shape drawn as it is on a bar; the heart-rate entry names its VO2max. */
function RaceKey({ found, anyRan }: { found: RunPredictions; anyRan: boolean }) {
  const used = new Set(found.races.flatMap((race) => race.methods.map((m) => m.method)))
  const heartRate = `${KEY_NAME.heartRate}${found.vo2max ? ` (VO2max ${Math.round(found.vo2max.vo2max)})` : ''}`
  const entries: { shape: string; text: string }[] = [
    { shape: 'dot', text: 'Prediction' },
    ...(used.has('performances') ? [{ shape: 'above', text: KEY_NAME.performances }] : []),
    ...(used.has('heartRate') ? [{ shape: 'below', text: heartRate }] : []),
    ...(anyRan ? [{ shape: 'ran', text: 'Run: your recorded best' }] : []),
    { shape: 'band', text: 'Assumed spread' },
  ]
  return (
    <ul className="race-key" aria-label="Key">
      {entries.map(({ shape, text }) => (
        <li key={shape} className="race-key__entry">
          <span className={`race-key__shape race-key__shape--${shape}`} aria-hidden="true" />
          {shape === 'band' ? (
            <Definition meaning={DEFINITIONS.assumedSpread}>{text}</Definition>
          ) : (
            text
          )}
        </li>
      ))}
    </ul>
  )
}

/** The same figures as a table, for a screen reader and for reading exact times: behind the disclosure. */
function RaceTable({
  found,
  units,
  ran,
}: {
  found: RunPredictions
  units: UnitSystem
  ran: readonly RanBest[]
}) {
  const ranAt = (distanceM: number) => ran.find((r) => r.distanceM === distanceM)
  // At 320 px the table is wider than its box and scrolls there, so a keyboard reader can reach it.
  const region = useScrollRegion('Race predictions table')
  return (
    <div className="table-scroll" {...region}>
      <table className="race-table">
        <caption className="sr-only">
          Race predictions with their assumed spread and each estimate
        </caption>
        <thead>
          <tr>
            <th scope="col">Race</th>
            <th scope="col" className="num">
              Pace
            </th>
            <th scope="col" className="num">
              Predicted
            </th>
            <th scope="col" className="num">
              Assumed spread
            </th>
            {(['performances', 'heartRate'] as const).map((method) => (
              <th key={method} scope="col" className="num">
                {METHOD_NAME[method]}
              </th>
            ))}
            {ran.length > 0 && (
              <th scope="col" className="num">
                Recorded run, faster
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {found.races.map((prediction) => (
            <tr key={prediction.distanceM}>
              <th scope="row">{raceName(prediction.distanceM)}</th>
              <td className="num">
                {formatPace(prediction.distanceM / prediction.seconds, units)}
              </td>
              <td className="num">{formatRecordTime(prediction.seconds)}</td>
              <td className="num">{spreadText(prediction)}</td>
              {(['performances', 'heartRate'] as const).map((method) => {
                const own = prediction.methods.find((m) => m.method === method)
                return (
                  <td key={method} className="num">
                    {own ? formatRecordTime(own.seconds) : '—'}
                    <span className="sr-only">{` ${METHOD_SHORT[method]}`}</span>
                  </td>
                )
              })}
              {ran.length > 0 && (
                <td className="num">
                  {ranAt(prediction.distanceM)
                    ? `${formatRecordTime(ranAt(prediction.distanceM)!.seconds)} on ${ranAt(prediction.distanceM)!.when}`
                    : '—'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * A sport's race predictions, as racePredictionsOf found them: each race as a bar of its assumed spread with
 * the prediction on it and the two estimates it sits between. How they were reached, where each estimate
 * came from and the figures as a table are in "About these predictions". A race the period holds a faster
 * recorded best for says so on its row.
 */
export function RacePredictions({
  sport,
  found,
  units,
  allTime,
  ran = NONE_RAN,
}: {
  sport: Sport
  found: RunPredictions
  units: UnitSystem
  /** The period on screen is All time, so the note says the predictions are of the best period in it. */
  allTime: boolean
  /** Recorded bests that beat their predictions, from ranBests. */
  ran?: readonly RanBest[]
}) {
  const headingId = `${sport}-races`
  return (
    <section className="section race-predictions" aria-labelledby={headingId}>
      <div className="section-head">
        <h2 id={headingId}>{RACE_PREDICTIONS_NAME}</h2>
        <p className="secondary">{predictionsLede(found, allTime)}</p>
      </div>
      <RaceKey found={found} anyRan={ran.length > 0} />
      <ul className="race-rows">
        {found.races.map((prediction) => (
          <RaceRow
            key={prediction.distanceM}
            prediction={prediction}
            units={units}
            ran={ran.find((r) => r.distanceM === prediction.distanceM)}
          />
        ))}
      </ul>
      <EvidenceDisclosure section="the race predictions" label="About these predictions">
        <p className="muted">{methodNote(found, allTime)}</p>
        <RaceTable found={found} units={units} ran={ran} />
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
