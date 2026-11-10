import { useMemo } from 'react'
import { TRIANGLE_SPORTS, levelLadder } from '@rca/core/standing'
import type { TriangleGrades, TriangleSport } from '@rca/core/standing'
import { levelBandText, levelMeaningLine } from '../levelMeaning'
import { SPORT_LABEL } from '../sports'
import { useScrollRegion } from '../useScrollRegion'
import './LevelsSection.css'

/** Each sport as its column is headed: the rail's names. */
const COLUMN: Record<TriangleSport, string> = { ...SPORT_LABEL, lift: 'Lift' }

/**
 * What each level means: every level from World down with its age-grade band, and each graded sport's grade on the row of its
 * level, from `levelLadder` (core), which reads the triangle's own corners. The app's own levels below Local carry their meaning.
 * The page shows it once a sport has a level on the triangle.
 */
export function LevelsSection({ grades }: { grades: TriangleGrades }) {
  const ladder = useMemo(() => levelLadder(grades), [grades])
  // At 320 px with large text the table can be wider than its box, so it scrolls there and a keyboard reader can reach it.
  const region = useScrollRegion('Levels table')
  return (
    <section className="band levels" aria-labelledby="balance-levels">
      <h2 id="balance-levels">Levels</h2>
      <div className="table-scroll" {...region}>
        <table className="levels__table">
          <caption className="sr-only">
            Each level’s age grade, and your grade in each sport
          </caption>
          <thead>
            <tr>
              <th scope="col">Level</th>
              {TRIANGLE_SPORTS.map((sport) => (
                <th key={sport} scope="col" data-sport={sport}>
                  {COLUMN[sport]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ladder.map((rung, index) => {
              const meaning = levelMeaningLine(rung.label)
              return (
                <tr key={rung.label}>
                  <th scope="row">
                    <span className="levels__name">{rung.label}</span>
                    <span className="levels__band num">{levelBandText(ladder, index)}</span>
                    {meaning === undefined ? null : (
                      <span className="levels__meaning">{meaning}</span>
                    )}
                  </th>
                  {TRIANGLE_SPORTS.map((sport) => {
                    const yours = rung.sports.find((entry) => entry.sport === sport)
                    return (
                      <td key={sport} className="num" data-sport={sport}>
                        {yours === undefined ? null : (
                          <span className="levels__mark">{`${yours.percent}%`}</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
