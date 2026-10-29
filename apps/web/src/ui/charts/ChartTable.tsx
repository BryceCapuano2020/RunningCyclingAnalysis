import { keyByContent } from '../contentKeys'
import { useScrollRegion } from '../useScrollRegion'
import './ChartTable.css'

/** Above this many rows the table is a scroll region with a height cap, so a long one does not run the page on. */
const LONG_ROWS = 12
const NO_COLUMNS: number[] = []

export interface ChartTableProps {
  columns: string[]
  rows: string[][]
  caption?: string
  /** Columns of words, which are set on the left rather than the right as numbers are. */
  textColumns?: number[]
  /** Columns a phone hides, so that its table fits the page. */
  phoneHidden?: number[]
}

/** The class of a value cell: numbers are set on the right, and a phone-hidden column is marked. */
function cellClass(
  column: number,
  textColumns: number[],
  phoneHidden: number[],
): string | undefined {
  const align = textColumns.includes(column) ? '' : 'num'
  const hide = phoneHidden.includes(column) ? 'chart-table__phone-hidden' : ''
  return [align, hide].filter((name) => name !== '').join(' ') || undefined
}

/** The text twin of a chart: every value a chart shows, in a real table. */
export function ChartTable({
  columns,
  rows,
  caption,
  textColumns = NO_COLUMNS,
  phoneHidden = NO_COLUMNS,
}: ChartTableProps) {
  // A long table, or one that overflows a narrow page, is a scroll region a keyboard reader can reach.
  const long = rows.length > LONG_ROWS
  const region = useScrollRegion(caption ?? 'Table', long)
  return (
    <div className={long ? 'table-scroll table-scroll--long' : 'table-scroll'} {...region}>
      <table>
        {caption ? <caption>{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column, i) => (
              <th
                key={column}
                scope="col"
                className={i === 0 ? undefined : cellClass(i, textColumns, phoneHidden)}
              >
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
                  <td key={cellKey} className={cellClass(c, textColumns, phoneHidden)}>
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
