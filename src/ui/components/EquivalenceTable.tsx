import type { Equivalence } from '../../core/pipeline'
import type { UnitSystem } from '../../core/units'
import { formatDuration, formatPace, formatPower } from '../../core/units'
import './EquivalenceTable.css'

export interface EquivalenceTableProps {
  equivalents: Equivalence[]
  units: UnitSystem
}

const PACE_UNIT: Record<UnitSystem, string> = { imperial: '/mi', metric: '/km' }

/** A pace without its unit, so that a range can show the unit once at the end. */
function paceNumber(speedMs: number, units: UnitSystem): string {
  return formatPace(speedMs, units).replace(/ \/(mi|km)$/, '')
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
                {`${paceNumber(equivalent.runSpeed.p95, units)} to ${paceNumber(equivalent.runSpeed.p05, units)} ${PACE_UNIT[units]}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
