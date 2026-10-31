import { SPORT_NOUN } from '../domain/sportNoun'
import { formatGrade } from '../ui/gradeFormat'
import type { SportGrade } from '../ui/grades'
import type { LandingFigures } from '../ui/landingFigures'
import { SPORT_TITLE } from '../ui/sports'

/**
 * The words the landing example (and Balance, which shows the same sample) says, made from the figures so a test
 * never types a number the sample gives. The e2e tests take the figures from the build's own reader.
 */
export function landingText({ gap, grades }: LandingFigures) {
  const lead = Math.abs(gap.centre)
  const other = gap.lean === 'ride' ? 'run' : 'ride'
  // The gap is signed toward running; the meter states its range from the side the balance leans to.
  const edges = gap.lean === 'ride' ? [-gap.high, -gap.low] : [gap.low, gap.high]
  const level = ({ centre, range }: SportGrade) =>
    range === null ? centre.level : `${range.low.level} to ${range.high.level}`
  const row = (sport: 'run' | 'ride') =>
    `${SPORT_TITLE[sport]} ${formatGrade(grades[sport].centre.grade)} ${level(grades[sport])}`
  return {
    value: `+${lead}pts`,
    edges: `${edges[0]} to ${edges[1]}`,
    /** The start of the meter's accessible name, up to the range. */
    name: `${SPORT_TITLE[gap.lean]} grades ${lead} points higher than ${SPORT_NOUN[other]}`,
    /** Each level row as read, in the order Running, Cycling. */
    rows: [row('run'), row('ride')],
  }
}
