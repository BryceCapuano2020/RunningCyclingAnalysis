import type { ActivityTrace } from '@rca/core/workbench'
import type { UnitSystem } from '@rca/core/units'
import { formatRecordTime } from '@rca/core/units'
import '../charts/ChartTable.css'
import { SPORT_FORMAT } from '../sports'
import { REP_FADE, repFadeOf } from './intervalFade'
import type { RepFade } from './intervalFade'
import { displayValue, metricLabel } from './workbenchFormat'
import type { Selection } from './workbenchTime'

const LENGTH_PERCENT = Math.round(REP_FADE.lengthTolerance * 100)

/** A run's flat pace is the sport's own number, named and written as the best efforts name and write it. */
function outputLabel(fade: RepFade, sport: ActivityTrace['sport']): string {
  return fade.metric === 'flatSpeed'
    ? SPORT_FORMAT[sport].nativeLabel
    : metricLabel(fade.metric, sport)
}

function outputText(
  fade: RepFade,
  output: number,
  sport: ActivityTrace['sport'],
  units: UnitSystem,
): string {
  return fade.metric === 'flatSpeed'
    ? SPORT_FORMAT[sport].formatted(output, units)
    : displayValue(fade.metric, output, sport, units)
}

/**
 * Laps or intervals of about one length, one row each, with how the first compares with the last: the
 * lede says the rep that differed most from the first. A rep selects its lap, as the lap buttons do.
 * The section is left out unless the activity has at least three reps.
 */
export function RepFadeTable({
  trace,
  units,
  indoor,
  selection,
  onSelect,
}: {
  trace: ActivityTrace
  units: UnitSystem
  indoor: boolean
  selection: Selection
  onSelect: (selection: Selection) => void
}) {
  const fade: RepFade | null = repFadeOf(trace, { indoor })
  if (fade === null) return null
  const { sport } = trace
  const lapName = fade.recorded ? 'Lap' : 'Interval'
  const withHeartRate = fade.reps.some((rep) => rep.heartRate !== null)
  return (
    <div className="activity-workbench__reps">
      <h3>How your reps held up</h3>
      <p className="secondary">{fade.lede}</p>
      <div className="table-scroll">
        <table>
          <caption>
            {`${lapName}s within ${LENGTH_PERCENT}% of one length, while moving. Choose a rep to see it in the readings.`}
          </caption>
          <thead>
            <tr>
              <th scope="col">Rep</th>
              <th scope="col" className="num">
                Time
              </th>
              <th scope="col" className="num">
                {outputLabel(fade, sport)}
              </th>
              {withHeartRate && (
                <th scope="col" className="num">
                  Heart rate
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {fade.reps.map((rep) => {
              const active =
                rep.bounds.startS === selection.startS && rep.bounds.endS === selection.endS
              return (
                <tr key={rep.number}>
                  <th scope="row">
                    <button
                      className={active ? 'btn activity-workbench__lap--active' : 'btn'}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onSelect(rep.bounds)}
                    >
                      Rep {rep.number}
                    </button>{' '}
                    <span className="muted">
                      {lapName} {rep.lapNumber}
                    </span>
                  </th>
                  <td className="num">{formatRecordTime(rep.durationS)}</td>
                  <td className="num">{outputText(fade, rep.output, sport, units)}</td>
                  {withHeartRate && (
                    <td className="num">
                      {rep.heartRate === null
                        ? '–'
                        : displayValue('heartRate', rep.heartRate, sport, units)}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
