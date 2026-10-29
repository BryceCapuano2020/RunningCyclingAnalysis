import type { Sport } from '@rca/core/types'
import { BalanceMeter } from '../components/BalanceMeter'
import { gapReading } from '../components/balanceScale'
import { balanceTitle } from '../components/headlineText'
import type { GradeOutcome } from '../grades'
import { LANDING_EXAMPLE } from '../landingExample'
import { SAMPLE_DESCRIPTION } from '../sampleAthlete'
import { SPORT_ORDER } from '../sports'
import { balanceLevels } from './levelsModel'
import { BalanceLevels } from './BalanceLevels'
import './LandingExample.css'

/** The sample athlete's age on the newest effort, which the example's grades are taken at. */
const SAMPLE_AGE = 37

/** The example's grades as the page holds them: both graded, so the levels name each. */
const GRADES: Record<Sport, GradeOutcome> = {
  run: { kind: 'graded', age: SAMPLE_AGE, grade: LANDING_EXAMPLE.grades.run },
  ride: { kind: 'graded', age: SAMPLE_AGE, grade: LANDING_EXAMPLE.grades.ride },
}

/**
 * An example of the Balance screen, drawn from the sample athlete: the answer's headline over the real meter
 * and the real levels line, made from the sample's own figures with the same components Balance uses, so the
 * example cannot drift from the screen it stands for. It is the landing page's hero visual, labelled
 * illustrative, and names the sample.
 */
export function LandingExample() {
  const reading = gapReading(LANDING_EXAMPLE.gap)
  const levels = balanceLevels({
    grades: GRADES,
    sports: SPORT_ORDER,
    inPeriod: { run: 1, ride: 1 },
    missingAge: null,
  })
  return (
    <figure className="landing-example">
      <figcaption className="eyebrow">{`Illustrative: the sample athlete, ${SAMPLE_DESCRIPTION}`}</figcaption>
      <p className="landing-example__title">{balanceTitle(reading)}</p>
      <BalanceMeter reading={reading} />
      <BalanceLevels model={levels} />
    </figure>
  )
}
