export interface ChartTableProps {
  columns: string[]
  rows: string[][]
}

/** The text twin of a chart: every value a chart shows, in a real table. */
export function ChartTable({ columns, rows }: ChartTableProps) {
  return (
    <div className="table-scroll">
      <table>
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
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c} className={c === 0 ? undefined : 'num'}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
