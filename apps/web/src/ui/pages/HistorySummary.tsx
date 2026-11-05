import type { YearRow } from '@rca/core/history'
import { RowIndex } from '../components/RowList'
import { Sparkline } from '../components/Sparkline'
import type { SparkPoint } from '../components/Sparkline'
import type { SummaryStat } from '../historySummary'
import { yearSeries } from './historySummarySeries'
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
 * figure at the right. Hours and each distance carry their year-by-year line, drawn from the same years the hours chart
 * below reads; the years on file are a count and have none.
 */
export function HistorySummary({
  stats,
  years,
}: {
  stats: SummaryStat[]
  years: readonly YearRow[]
}) {
  return (
    <ol className="rows history-summary">
      {stats.map((stat, index) => {
        const { number, unit } = figureParts(stat.value)
        const points: readonly SparkPoint[] = yearSeries(stat.id, years)
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
            <span className="row__spark">
              <Sparkline points={points} />
            </span>
          </li>
        )
      })}
    </ol>
  )
}
