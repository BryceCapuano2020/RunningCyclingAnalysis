import { keyByContent } from '../contentKeys'

export interface ChartTableProps {
  columns: string[]
  rows: string[][]
  caption?: string
}

/** The text twin of a chart: every value a chart shows, in a real table. */
export function ChartTable({ columns, rows, caption }: ChartTableProps) {
  return (
    <div className="table-scroll">
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
