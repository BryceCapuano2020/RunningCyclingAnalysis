import type { Equivalence } from '@rca/core/pipeline'
import { EQUIVALENCE_MIN_S } from '@rca/core/constants'
import type { UnitSystem } from '@rca/core/units'
import {
  PACE_UNIT,
  formatDuration,
  formatPace,
  formatPaceValue,
  formatPower,
} from '@rca/core/units'
import { WeightNote } from './WeightNote'
import './EquivalenceTable.css'

export interface EquivalenceTableProps {
  equivalents: Equivalence[]
  units: UnitSystem
  /** False while no body weight is entered: the ride figures here wait for it. */
  weighted: boolean
  /** Whether a ride's watts, by its duration, did not come from a power meter. */
  estimated: (durationS: number) => boolean
}

/** Each ride effort in its own watts, with the flat running pace it matches and its model range. */
export function EquivalenceTable({
  equivalents,
  units,
  weighted,
  estimated,
}: EquivalenceTableProps) {
  if (!weighted) return <WeightNote />
  if (equivalents.length === 0) {
    return (
      <p className="muted">{`Needs at least one ride of ${formatDuration(EQUIVALENCE_MIN_S)} or more`}</p>
    )
  }
  return (
    <>
      <div className="table-scroll equivalence-table__wide">
        <table className="equivalence-table">
          <thead>
            <tr>
              <th scope="col">Ride effort</th>
              <th scope="col" className="num">
                Flat pace
              </th>
              <th scope="col" className="num">
                90% range
              </th>
            </tr>
          </thead>
          <tbody>
            {equivalents.map((equivalent) => (
              <tr key={equivalent.durationS}>
                <td>
                  {`${formatDuration(equivalent.durationS)} at ${formatPower(equivalent.ridePowerW)}`}
                  {estimated(equivalent.durationS) && <span className="chip">Estimated</span>}
                </td>
                <td className="num">{formatPace(equivalent.runSpeed.p50, units)}</td>
                <td className="num">
                  {`${formatPaceValue(equivalent.runSpeed.p95, units)} to ${formatPaceValue(equivalent.runSpeed.p05, units)} ${PACE_UNIT[units]}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Below 480 px the table is hidden and each effort reads as a list, with the same values. */}
      <ol className="equivalence-list">
        {equivalents.map((equivalent) => (
          <li key={equivalent.durationS}>
            <dl>
              <dt>Ride effort</dt>
              <dd>
                {`${formatDuration(equivalent.durationS)} at ${formatPower(equivalent.ridePowerW)}`}
                {estimated(equivalent.durationS) && <span className="chip">Estimated</span>}
              </dd>
              <dt>Flat pace</dt>
              <dd>{formatPace(equivalent.runSpeed.p50, units)}</dd>
              <dt>90% range</dt>
              <dd>
                {`${formatPaceValue(equivalent.runSpeed.p95, units)} to ${formatPaceValue(equivalent.runSpeed.p05, units)} ${PACE_UNIT[units]}`}
              </dd>
            </dl>
          </li>
        ))}
      </ol>
    </>
  )
}
