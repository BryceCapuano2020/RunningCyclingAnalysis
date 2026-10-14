import type { Equivalence } from '../../core/pipeline'
import type { UnitSystem } from '../../core/units'
import { formatDuration, formatPace, formatPower } from '../../core/units'

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
      <table>
        <thead>
          <tr>
            <th scope="col">Cycling effort</th>
            <th scope="col" className="num">
              Equal running pace on flat ground
            </th>
            <th scope="col" className="num">
              Likely range
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
                {`${formatPace(equivalent.runSpeed.p95, units)} to ${formatPace(equivalent.runSpeed.p05, units)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
