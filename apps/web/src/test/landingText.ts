import { SPORT_NOUN } from '../domain/sportNoun'
import { formatGrade } from '../ui/gradeFormat'
import { gradeLevelText } from '../ui/grades'
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
  // A range that reaches zero or the other side is written with signs and a true minus ("−1 to +28"); one wholly on the leaning
  // side is plain ("2 to 25"). The sample's range may cross zero, as any athlete's may.
  const sign = (count: number) => (count < 0 ? `−${-count}` : count > 0 ? `+${count}` : '0')
  const range =
    edges[0]! <= 0 ? `${sign(edges[0]!)} to ${sign(edges[1]!)}` : `${edges[0]} to ${edges[1]}`
  // A level is the centre's, whether or not a ride's range reaches a neighbouring band.
  const row = (sport: 'run' | 'ride') =>
    `${SPORT_TITLE[sport]} ${formatGrade(grades[sport].centre.grade)} ${gradeLevelText(grades[sport])}`
  return {
    value: `+${lead}pts`,
    edges: range,
    /** The start of the meter's accessible name, up to the range. */
    name: `${SPORT_TITLE[gap.lean]} grades ${lead} points higher than ${SPORT_NOUN[other]}`,
    /** Each level row as read, in the order Running, Cycling. */
    rows: [row('run'), row('ride')],
  }
}
