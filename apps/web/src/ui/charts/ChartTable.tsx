import { keyByContent } from '../contentKeys'
import './ChartTable.css'

/** Above this many rows the table is a scroll region with a height cap, so a long one does not run the page on. */
const LONG_ROWS = 12

export interface ChartTableProps {
  columns: string[]
  rows: string[][]
  caption?: string
}

/** The text twin of a chart: every value a chart shows, in a real table. */
export function ChartTable({ columns, rows, caption }: ChartTableProps) {
  // A scroll region with a height cap is reached by keyboard, so a reader can scroll it.
  const long = rows.length > LONG_ROWS
  return (
    <div
      className={long ? 'table-scroll table-scroll--long' : 'table-scroll'}
      role={long ? 'region' : undefined}
      aria-label={long ? (caption ?? 'Table') : undefined}
      tabIndex={long ? 0 : undefined}
    >
      <table>
        {caption ? <caption>{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column, i) => (
              <th key={column} scope="col" className={i === 0 ? undefined : 'num'}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {keyByContent(rows, (row) => JSON.stringify(row)).map(({ key, item: row }) => (
            <tr key={key}>
              {keyByContent(row, (cell) => cell).map(({ key: cellKey, item: cell, index: c }) =>
                c === 0 ? (
                  <th key={cellKey} scope="row">
                    {cell}
                  </th>
                ) : (
                  <td key={cellKey} className="num">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
