import { formatGrade } from '../ui/gradeFormat'
import { gradeLevelText } from '../ui/grades'
import type { LandingFigures } from '../ui/landingFigures'
import { SPORT_TITLE } from '../ui/sports'

/**
 * The corners' words the landing example (and Balance, which shows the same sample) says, made from the figures so a test
 * never types a number the sample gives. The e2e tests take the figures from the build's own reader.
 */
export function landingText({ grades }: LandingFigures) {
  // A level is the centre's, whether or not a ride's range reaches a neighbouring band.
  const row = (sport: 'run' | 'ride') =>
    `${SPORT_TITLE[sport]} ${formatGrade(grades[sport].centre.grade)} ${gradeLevelText(grades[sport])}`
  return {
    /** Each corner as read, in the order Running, Cycling. */
    rows: [row('run'), row('ride')],
  }
}
