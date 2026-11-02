import { useState } from 'react'
import { STEEP_DESCENT_NOTE } from '../grades'
import { GapTerm } from './GapTerm'
import type { Columns, SplitCells } from './splitRows'

/** More rows than this are folded behind a button, so a fifty-kilometre run does not push the page's bests out of sight. */
const COLLAPSED_ROWS = 20

/** A value the digest could not give: a dash for sight, and words for a screen reader. */
function Missing({ words }: { words: string }) {
  return (
    <>
      <span aria-hidden="true">–</span>
      <span className="sr-only">{words}</span>
    </>
  )
}

/** A GAP the split has none of: left out for a steep descent, or not known. */
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
                <GapTerm />
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

/**
 * One split as an item of the list, below 480 px. Its values are the row's. The first item's GAP carries the term's
 * meaning, so a long run is not a column of buttons.
 */
function SplitItem({
  cell,
  columns,
  first,
}: {
  cell: SplitCells
  columns: Columns
  first: boolean
}) {
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
            <dt>{first ? <GapTerm /> : 'GAP'}</dt>
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
      {cells.map((cell, index) => (
        <SplitItem key={cell.label} cell={cell} columns={columns} first={index === 0} />
      ))}
    </ol>
  )
}

/** The table and list of one set of rows, with the notes its columns call for. */
export function Rows({
  cells,
  caption,
  columns,
}: {
  cells: SplitCells[]
  caption: string
  columns: Columns
}) {
  const [all, setAll] = useState(false)
  // A long run is a long table: the first rows are shown, and the rest are one press away.
  const shown = all ? cells : cells.slice(0, COLLAPSED_ROWS)
  const noun = columns.lap ? 'laps' : 'splits'
  return (
    <>
      <SplitTable cells={shown} caption={caption} columns={columns} />
      <SplitList cells={shown} caption={caption} columns={columns} />
      {cells.length > COLLAPSED_ROWS && (
        <button
          type="button"
          className="btn splits-more"
          aria-expanded={all}
          onClick={() => setAll(!all)}
        >
          {all ? `Show the first ${COLLAPSED_ROWS} ${noun}` : `Show all ${cells.length} ${noun}`}
        </button>
      )}
      {columns.steepDescent && <p className="muted">{STEEP_DESCENT_NOTE}</p>}
    </>
  )
}
