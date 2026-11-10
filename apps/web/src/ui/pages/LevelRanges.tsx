import type { TriangleSport } from '@rca/core/standing'
import { levelFigureHead } from '../levelRanges'
import type { LevelRangeRow } from '../levelRanges'
import { useScrollRegion } from '../useScrollRegion'
import './LevelsSection.css'

/**
 * A sport's own Levels table: every level from World down, each with its meaning and the range of the sport's headline figure
 * that earns it for this athlete (a half marathon time, threshold watts, a big three total). The athlete's own level carries the
 * mark Balance's table uses, a dot in the sport's ink. The rows are `levelRangeRows`, from core's inverse of the sport's grade.
 * The same table serves the Run, Ride and Lift pages, so their levels cannot read differently.
 */
export function LevelRanges({
  sport,
  rows,
  headingId,
}: {
  sport: TriangleSport
  rows: readonly LevelRangeRow[]
  /** The id the heading takes, which names the section for a screen reader. */
  headingId: string
}) {
  const region = useScrollRegion('Levels table')
  return (
    <section className="section levels" data-sport={sport} aria-labelledby={headingId}>
      <h2 id={headingId}>Levels</h2>
      <div className="table-scroll" {...region}>
        <table className="levels__table">
          <caption className="sr-only">{`Each level and the ${levelFigureHead(sport).toLowerCase()} that earns it`}</caption>
          <thead>
            <tr>
              <th scope="col">Level</th>
              <th scope="col" data-sport={sport}>
                {levelFigureHead(sport)}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} data-mine={row.mine ? 'true' : undefined}>
                <th scope="row">
                  <span className="levels__name">{row.label}</span>
                  <span className="levels__band num">{row.band}</span>
                  {row.meaning === null ? null : (
                    <span className="levels__meaning">{row.meaning}</span>
                  )}
                </th>
                <td className="num" data-sport={sport}>
                  {row.mine ? <span className="sr-only">Your level: </span> : null}
                  <span className={row.mine ? 'levels__mark' : undefined}>{row.range}</span>
                  {row.pace === null ? null : (
                    <span className="levels__band num levels__pace">{row.pace}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
