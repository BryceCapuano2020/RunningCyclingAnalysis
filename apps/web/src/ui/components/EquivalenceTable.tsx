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
import { effortLabel } from '../records'
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

/** The three columns, named once for the table's heads, and again for the phone list's labels. */
const EFFORT_LABEL = 'Ride effort'
const PACE_LABEL = 'Flat pace'
const RANGE_LABEL = '90% range'

/** An effort in words: its duration and its watts. */
function effortOf(equivalent: Equivalence): string {
  return `${effortLabel(equivalent.durationS)} at ${formatPower(equivalent.ridePowerW)}`
}

/** The model range of the flat pace, from its slow end to its fast end, in the viewer's unit. */
function rangeOf(equivalent: Equivalence, units: UnitSystem): string {
  const { p95, p05 } = equivalent.runSpeed
  return `${formatPaceValue(p95, units)} to ${formatPaceValue(p05, units)} ${PACE_UNIT[units]}`
}

/** Below 480 px each effort reads as a list. The labels show once above the rows; each row keeps its own for a screen reader. */
function EffortList({
  equivalents,
  units,
  estimated,
}: Pick<EquivalenceTableProps, 'equivalents' | 'units' | 'estimated'>) {
  return (
    <>
      <p className="equivalence-list__labels" aria-hidden="true">
        <span>{EFFORT_LABEL}</span>
        <span>{PACE_LABEL}</span>
        <span>{RANGE_LABEL}</span>
      </p>
      <ol className="equivalence-list">
        {equivalents.map((equivalent) => (
          <li key={equivalent.durationS}>
            <dl>
              <dt className="sr-only">{EFFORT_LABEL}</dt>
              <dd>
                {effortOf(equivalent)}
                {estimated(equivalent.durationS) && <span className="chip">Estimated</span>}
              </dd>
              <dt className="sr-only">{PACE_LABEL}</dt>
              <dd>{formatPace(equivalent.runSpeed.p50, units)}</dd>
              <dt className="sr-only">{RANGE_LABEL}</dt>
              <dd>{rangeOf(equivalent, units)}</dd>
            </dl>
          </li>
        ))}
      </ol>
    </>
  )
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
              <th scope="col">{EFFORT_LABEL}</th>
              <th scope="col" className="num">
                {PACE_LABEL}
              </th>
              <th scope="col" className="num">
                {RANGE_LABEL}
              </th>
            </tr>
          </thead>
          <tbody>
            {equivalents.map((equivalent) => (
              <tr key={equivalent.durationS}>
                <td>
                  {effortOf(equivalent)}
                  {estimated(equivalent.durationS) && <span className="chip">Estimated</span>}
                </td>
                <td className="num">{formatPace(equivalent.runSpeed.p50, units)}</td>
                <td className="num">{rangeOf(equivalent, units)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Below 480 px the table is hidden and the list shows, with the same values. */}
      <EffortList equivalents={equivalents} units={units} estimated={estimated} />
    </>
  )
}
