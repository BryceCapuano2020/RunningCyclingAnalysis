import { GRADE_LEVELS } from '../grade'
import { wholePercent } from './lead'
import { TRIANGLE_SPORTS, triangleGeometry } from './triangle'
import type { TriangleGrades, TriangleSport } from './triangle'

/** One level of the ladder: its name, its band in whole percents, and the sports graded inside it. */
export interface LevelRung {
  label: string
  /** The lowest whole percent in the band. */
  low: number
  /** The highest whole percent in the band, or null for the top level, which has no ceiling. */
  high: number | null
  /** Each sport whose grade sits in this band, with its whole-percent grade, in the triangle's order. */
  sports: { sport: TriangleSport; percent: number }[]
}

/**
 * Every level, highest first, with its band and the sports graded in it. A sport's percent and level are the level triangle's
 * corner figures (`triangleGeometry`), so the ladder and the triangle cannot disagree. A band's top is one under the next band's
 * floor, since every surface floors a grade to the whole percent it shows.
 */
export function levelLadder(grades: TriangleGrades): LevelRung[] {
  const { corners } = triangleGeometry(grades, 1)
  return GRADE_LEVELS.map((band, index) => {
    const above = GRADE_LEVELS[index - 1]
    return {
      label: band.label,
      low: wholePercent(band.min),
      high: above === undefined ? null : wholePercent(above.min) - 1,
      sports: TRIANGLE_SPORTS.flatMap((sport) => {
        const { percent, level } = corners[sport]
        return percent === null || level !== band.label ? [] : [{ sport, percent }]
      }),
    }
  })
}
