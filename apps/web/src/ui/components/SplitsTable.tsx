import type { DigestSplits } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { METRES_PER_KM, METRES_PER_MILE } from '@rca/core/units'
import { MAX_KM_SPLITS, MAX_MILE_SPLITS } from '@rca/core/constants'
import { SPLITS_NOT_LOADED } from '../analysis/copy'
import './SplitsTable.css'
import { FLAT_PACE_NOTE } from '../grades'
import {
  cellsOf,
  columnsOf,
  rowsOf,
  type Columns,
  type SplitCells,
  type SplitsLoad,
} from './splitRows'

export interface SplitsTableProps {
  load: SplitsLoad
  units: UnitSystem
  /** The run's distance, which tells a run past the limit from one too short to split. */
  distanceM: number
}

const UNIT_NAME: Record<UnitSystem, string> = { imperial: 'mile', metric: 'kilometre' }

/** A value the digest could not give: a dash for sight, and words for a screen reader. */
function Missing({ words }: { words: string }) {
  return (
    <>
      <span aria-hidden="true">–</span>
      <span className="sr-only">{words}</span>
    </>
  )
}

/** The pace value, with the Fastest chip beside it when this split is the fastest. */
function PaceValue({ cell }: { cell: SplitCells }) {
  if (cell.pace === null) return <Missing words="Not measured" />
  return (
    <>
      <span className={cell.fastest ? 'splits-table__fastest' : undefined}>{cell.pace}</span>
      {cell.fastest && <span className="chip">Fastest</span>}
    </>
  )
}

/** The pace bar. Decorative: the pace beside it carries the same information. */
function PaceBar({ percent }: { percent: number | null }) {
  if (percent === null) return null
  return (
    <span className="splits-table__track" aria-hidden="true">
      <span className="splits-table__bar" style={{ width: `${percent}%` }} />
    </span>
  )
}

/** One split as a row of the table. */
function SplitRow({ cell, columns }: { cell: SplitCells; columns: Columns }) {
  return (
    <tr>
      <th scope="row">{cell.label}</th>
      <td className="num splits-table__pace">
        <PaceValue cell={cell} />
        <PaceBar percent={cell.barPercent} />
      </td>
      {columns.flat && (
        <td className="num">{cell.gradeAdjustedPace ?? <Missing words="Not available" />}</td>
      )}
      {columns.elevation && (
        <td className="num">{cell.elevation ?? <Missing words="No altitude" />}</td>
      )}
      <td className="num">{cell.heartRate ?? <Missing words="No heart rate" />}</td>
    </tr>
  )
}

/** The splits as a table, shown from 480 px wide. */
function SplitTable({
  cells,
  caption,
  columns,
}: {
  cells: SplitCells[]
  caption: string
  columns: Columns
}) {
  return (
    <div className="splits-wide">
      <table className="splits-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Split</th>
            <th scope="col" className="num">
              Pace
            </th>
            {columns.flat && (
              <th scope="col" className="num">
                Flat pace
              </th>
            )}
            {columns.elevation && (
              <th scope="col" className="num">
                Elevation gain
              </th>
            )}
            <th scope="col" className="num">
              Heart rate
            </th>
          </tr>
        </thead>
        <tbody>
          {cells.map((cell) => (
            <SplitRow key={cell.label} cell={cell} columns={columns} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** One split as an item of the list, below 480 px. Its values are the row's. */
function SplitItem({ cell, columns }: { cell: SplitCells; columns: Columns }) {
  return (
    <li className="splits-list__item">
      <dl>
        <div>
          <dt>Split</dt>
          <dd>{cell.label}</dd>
        </div>
        <div>
          <dt>Pace</dt>
          <dd>
            <PaceValue cell={cell} />
            <PaceBar percent={cell.barPercent} />
          </dd>
        </div>
        {columns.flat && (
          <div>
            <dt>Flat pace</dt>
            <dd>{cell.gradeAdjustedPace ?? <Missing words="Not available" />}</dd>
          </div>
        )}
        {columns.elevation && (
          <div>
            <dt>Elevation gain</dt>
            <dd>{cell.elevation ?? <Missing words="No altitude" />}</dd>
          </div>
        )}
        <div>
          <dt>Heart rate</dt>
          <dd>{cell.heartRate ?? <Missing words="No heart rate" />}</dd>
        </div>
      </dl>
    </li>
  )
}

/** The same splits, one definition list per split, below 480 px. */
function SplitList({
  cells,
  caption,
  columns,
}: {
  cells: SplitCells[]
  caption: string
  columns: Columns
}) {
  return (
    <ol className="splits-list" aria-label={caption}>
      {cells.map((cell) => (
        <SplitItem key={cell.label} cell={cell} columns={columns} />
      ))}
    </ol>
  )
}

/** Why a unit has no splits: the run is past the limit for that unit, or too short to split. */
function noSplitsCopy(distanceM: number, units: UnitSystem): string {
  if (units === 'imperial') {
    return distanceM > MAX_MILE_SPLITS * METRES_PER_MILE
      ? `Splits are kept for runs up to ${MAX_MILE_SPLITS} mi.`
      : 'This run is too short to split.'
  }
  return distanceM > MAX_KM_SPLITS * METRES_PER_KM
    ? `Splits are kept for runs up to ${MAX_KM_SPLITS} km.`
    : 'This run is too short to split.'
}

function SplitsRows({
  splits,
  units,
  distanceM,
}: {
  splits: DigestSplits
  units: UnitSystem
  distanceM: number
}) {
  const rows = rowsOf(splits, units)
  if (rows.length === 0) return <p className="secondary">{noSplitsCopy(distanceM, units)}</p>
  const cells = cellsOf(rows, units)
  const columns = columnsOf(rows, cells)
  const caption = `Pace for each ${UNIT_NAME[units]}`
  return (
    <>
      <SplitTable cells={cells} caption={caption} columns={columns} />
      <SplitList cells={cells} caption={caption} columns={columns} />
      {columns.flat && <p className="muted">{FLAT_PACE_NOTE}</p>}
    </>
  )
}

/** The run's splits in the unit the athlete reads. Both representations are rendered; CSS shows one. */
export function SplitsTable({ load, units, distanceM }: SplitsTableProps) {
  return (
    <section className="section" aria-labelledby="activity-splits">
      <h2 id="activity-splits">Splits</h2>
      {load.status === 'loading' ? (
        <p className="secondary">Loading splits.</p>
      ) : load.status === 'failed' ? (
        <p className="secondary">{SPLITS_NOT_LOADED}</p>
      ) : load.splits === null ? (
        <p className="secondary">Splits were not kept when this run was added.</p>
      ) : (
        <>
          <SplitsRows splits={load.splits} units={units} distanceM={distanceM} />
        </>
      )}
    </section>
  )
}
