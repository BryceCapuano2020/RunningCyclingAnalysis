import { RowIndex } from '../components/RowList'
import type { SummaryStat } from '../historySummary'
import './HistorySummary.css'

/** A figure as its number and its unit, so the unit can be set smaller: "1,850.0 km" is "1,850.0" and "km". */
function figureParts(value: string): { number: string; unit: string | null } {
  const at = value.indexOf(' ')
  return at < 0
    ? { number: value, unit: null }
    : { number: value.slice(0, at), unit: value.slice(at + 1) }
}

/**
 * The library's totals as numbered rows: the years on file, the hours in all of them and each sport's distance, the
 * figure at the right.
 */
export function HistorySummary({ stats }: { stats: SummaryStat[] }) {
  return (
    <ol className="rows history-summary" aria-label="Library totals">
      {stats.map((stat, index) => {
        const { number, unit } = figureParts(stat.value)
        return (
          <li key={stat.id} className="row row--figures" data-sport={stat.sport}>
            <RowIndex index={index} />
            <div className="row__body">
              <p className="row__title">{stat.label}</p>
            </div>
            <p className="row__figure">
              {number}
              {unit === null ? null : (
                <>
                  {' '}
                  <span className="row__unit">{unit}</span>
                </>
              )}
            </p>
            <span className="row__spark" />
          </li>
        )
      })}
    </ol>
  )
}
