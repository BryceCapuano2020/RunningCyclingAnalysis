import { useMemo } from 'react'
import type { DigestSplits } from '@rca/core/types'
import type { ActivityTrace } from '@rca/core/workbench'
import type { UnitSystem } from '@rca/core/units'
import { METRES_PER_KM, METRES_PER_MILE } from '@rca/core/units'
import { MAX_KM_SPLITS, MAX_MILE_SPLITS } from '@rca/core/constants'
import { SPLITS_NOT_LOADED } from '../analysis/copy'
import './SplitsTable.css'
import { FLAT_PACE_NOTE, STEEP_DESCENT_NOTE } from '../grades'
import { hasRecordedLaps, lapCellsOf } from './lapRows'
import {
  cellsOf,
  columnsOf,
  rowsOf,
  type Columns,
  type SplitCells,
  type SplitsLoad,
  type SplitsViewName,
} from './splitRows'

export interface SplitsTableProps {
  load: SplitsLoad
  units: UnitSystem
  /** The run's distance, which tells a run past the limit from one too short to split. */
  distanceM: number
  /** The activity's recorded detail, whose device laps are offered as a second view of the splits. */
  trace?: ActivityTrace | null
  /** The view that is open, which the page holds so the flat pace note can follow it. Defaults to the units. */
  view?: SplitsViewName
  onViewChange?: (view: SplitsViewName) => void
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

/** A flat pace the split has none of: left out for a steep descent, or not known. */
function FlatMissing({ cell }: { cell: SplitCells }) {
  return <Missing words={cell.flatWithheld ? 'Left out on a steep descent' : 'Not available'} />
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
      <span className="splits-table__bar" data-sport="run" style={{ width: `${percent}%` }} />
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
      {columns.lap && (
        <>
          <td className="num">{cell.lap?.time ?? <Missing words="Not timed" />}</td>
          <td className="num">{cell.lap?.distance ?? <Missing words="Not available" />}</td>
        </>
      )}
      {columns.flat && (
        <td className="num">{cell.gradeAdjustedPace ?? <FlatMissing cell={cell} />}</td>
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
            <th scope="col">{columns.lap ? 'Lap' : 'Split'}</th>
            <th scope="col" className="num">
              Pace
            </th>
            {columns.lap && (
              <>
                <th scope="col" className="num">
                  Time
                </th>
                <th scope="col" className="num">
                  Distance
                </th>
              </>
            )}
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
          <dt>{columns.lap ? 'Lap' : 'Split'}</dt>
          <dd>{cell.label}</dd>
        </div>
        <div>
          <dt>Pace</dt>
          <dd>
            <PaceValue cell={cell} />
            <PaceBar percent={cell.barPercent} />
          </dd>
        </div>
        {columns.lap && (
          <>
            <div>
              <dt>Time</dt>
              <dd>{cell.lap?.time ?? <Missing words="Not timed" />}</dd>
            </div>
            <div>
              <dt>Distance</dt>
              <dd>{cell.lap?.distance ?? <Missing words="Not available" />}</dd>
            </div>
          </>
        )}
        {columns.flat && (
          <div>
            <dt>Flat pace</dt>
            <dd>{cell.gradeAdjustedPace ?? <FlatMissing cell={cell} />}</dd>
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

/** The table and list of one set of rows, with the notes its columns call for. */
function Rows({
  cells,
  caption,
  columns,
}: {
  cells: SplitCells[]
  caption: string
  columns: Columns
}) {
  return (
    <>
      <SplitTable cells={cells} caption={caption} columns={columns} />
      <SplitList cells={cells} caption={caption} columns={columns} />
      {columns.flat && <p className="muted">{FLAT_PACE_NOTE}</p>}
      {columns.steepDescent && <p className="muted">{STEEP_DESCENT_NOTE}</p>}
    </>
  )
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
  return (
    <Rows
      cells={cells}
      caption={`Pace for each ${UNIT_NAME[units]}`}
      columns={columnsOf(rows, cells)}
    />
  )
}

/** The choice between the whole units and the laps the device recorded, as a pair of toggle buttons. */
function ViewChoice({
  view,
  units,
  onChange,
}: {
  view: SplitsViewName
  units: UnitSystem
  onChange: (view: SplitsViewName) => void
}) {
  const choices: [SplitsViewName, string][] = [
    ['units', units === 'imperial' ? 'Miles' : 'Kilometres'],
    ['laps', 'Laps'],
  ]
  return (
    <div className="splits-view" role="group" aria-label="Split view">
      {choices.map(([choice, name]) => (
        <button
          key={choice}
          type="button"
          className={view === choice ? 'btn splits-view__choice--active' : 'btn'}
          aria-pressed={view === choice}
          onClick={() => onChange(choice)}
        >
          {name}
        </button>
      ))}
    </div>
  )
}

/** The laps the device recorded, as splits: each lap's time, distance, pace and heart rate. */
function LapRows({ trace, units }: { trace: ActivityTrace; units: UnitSystem }) {
  const cells = useMemo(() => lapCellsOf(trace, units), [trace, units])
  return (
    <Rows
      cells={cells}
      caption="Pace for each lap the device recorded"
      columns={{ flat: false, elevation: false, steepDescent: false, lap: true }}
    />
  )
}

/** Whether the digest has any whole-unit split to show, in the unit the athlete reads. */
function hasUnitSplits(load: SplitsLoad, units: UnitSystem): boolean {
  return load.status === 'loaded' && load.splits !== null && rowsOf(load.splits, units).length > 0
}

/** The splits once they have loaded, with the device's laps as a second view where it recorded them. */
function LoadedSplits({
  load,
  units,
  distanceM,
  trace,
  view,
  onViewChange,
}: {
  load: Extract<SplitsLoad, { status: 'loaded' }>
  units: UnitSystem
  distanceM: number
  trace: ActivityTrace | null
  view: SplitsViewName
  onViewChange: (view: SplitsViewName) => void
}) {
  const laps = hasRecordedLaps(trace) ? trace : null
  if (laps !== null && !hasUnitSplits(load, units)) return <LapRows trace={laps} units={units} />
  const rows =
    load.splits === null ? (
      <p className="secondary">Splits were not kept when this run was added.</p>
    ) : (
      <SplitsRows splits={load.splits} units={units} distanceM={distanceM} />
    )
  if (laps === null) return rows
  return (
    <>
      <ViewChoice view={view} units={units} onChange={onViewChange} />
      {view === 'laps' ? <LapRows trace={laps} units={units} /> : rows}
    </>
  )
}

function ignoreView() {}

/** The run's splits in the unit the athlete reads. Both representations are rendered; CSS shows one. */
export function SplitsTable({
  load,
  units,
  distanceM,
  trace = null,
  view = 'units',
  onViewChange = ignoreView,
}: SplitsTableProps) {
  return (
    <section className="section" aria-labelledby="activity-splits">
      <h2 id="activity-splits">Splits</h2>
      {load.status === 'loading' ? (
        <p className="secondary">Loading splits.</p>
      ) : load.status === 'failed' ? (
        <p className="secondary">{SPLITS_NOT_LOADED}</p>
      ) : (
        <LoadedSplits
          load={load}
          units={units}
          distanceM={distanceM}
          trace={trace}
          view={view}
          onViewChange={onViewChange}
        />
      )}
    </section>
  )
}
