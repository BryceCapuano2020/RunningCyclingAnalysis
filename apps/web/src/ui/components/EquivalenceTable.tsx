import type { Equivalence } from '@rca/core/pipeline'
import type { UnitSystem } from '@rca/core/units'
import {
  PACE_UNIT,
  formatDuration,
  formatPace,
  formatPaceValue,
  formatPower,
} from '@rca/core/units'
import './EquivalenceTable.css'

export interface EquivalenceTableProps {
  equivalents: Equivalence[]
  units: UnitSystem
}

export function EquivalenceTable({ equivalents, units }: EquivalenceTableProps) {
  if (equivalents.length === 0) {
    return <p className="muted">Needs at least one ride of five minutes or more</p>
  }
  return (
    <div className="table-scroll">
      <table className="equivalence-table">
        <thead>
          <tr>
            <th scope="col">Cycling effort</th>
            <th scope="col" className="num">
              Equal flat running pace
            </th>
            <th scope="col" className="num">
              90% model range
            </th>
          </tr>
        </thead>
        <tbody>
          {equivalents.map((equivalent) => (
            <tr key={equivalent.durationS}>
              <td>
                {`${formatDuration(equivalent.durationS)} at ${formatPower(equivalent.ridePowerW)}`}
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
  )
}
